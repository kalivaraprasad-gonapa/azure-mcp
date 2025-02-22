import { Project, SyntaxKind } from "ts-morph";
import { createContext, runInContext } from "node:vm";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
    DefaultAzureCredential,
    ClientSecretCredential,
    ChainedTokenCredential,
    ManagedIdentityCredential
} from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import { SubscriptionClient } from "@azure/arm-subscriptions";
import LoggerService from "./LoggerService";

// Constants
const SERVER_VERSION = "1.0.0";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Type definitions
interface ServerContext {
    resourceClient: ResourceManagementClient | null;
    subscriptionClient: SubscriptionClient | null;
    credentials: ChainedTokenCredential | null;
    selectedTenant: string | null;
    selectedSubscription: string | null;
}

// Error classes
class AzureMCPError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'AzureMCPError';
    }
}

// Code prompt template
const codePrompt = `Your job is to answer questions about Azure environment by writing Javascript code using Azure SDK. The code must adhere to a few rules:
- Use the provided client instances: 'resourceClient' for ResourceManagementClient and 'subscriptionClient' for SubscriptionClient
- DO NOT create new client instances or import Azure SDK packages
- Use async/await and promises
- Think step-by-step before writing the code
- Avoid hardcoded values like Resource IDs
- Handle errors gracefully
- Handle pagination correctly using for-await-of loops
- Data returned must be JSON containing only the minimal amount of data needed
- Code MUST "return" a value: string, number, boolean or JSON object`;

class AzureMCPServer {
    private server: Server;
    private context: ServerContext;
    private transport: StdioServerTransport;
    private logger = LoggerService;

    constructor() {
        this.context = {
            selectedTenant: null,
            selectedSubscription: null,
            credentials: null,
            resourceClient: null,
            subscriptionClient: null
        };

        this.server = new Server(
            {
                name: "azure-mcp",
                version: SERVER_VERSION,
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.transport = new StdioServerTransport();
        this.initializeRequestHandlers();
    }

    private initializeRequestHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, this.handleListTools.bind(this));
        this.server.setRequestHandler(CallToolRequestSchema, this.handleCallTool.bind(this));
    }

    private async initializeClients(tenantId: string, subscriptionId: string): Promise<void> {
        try {
            // Use DefaultAzureCredential which will automatically try different authentication methods
            // This includes environment variables, managed identity, Azure CLI, etc.
            this.context.credentials = new DefaultAzureCredential();

            this.context.selectedTenant = tenantId;
            this.context.selectedSubscription = subscriptionId;

            this.context.resourceClient = new ResourceManagementClient(
                this.context.credentials,
                subscriptionId
            );
            this.context.subscriptionClient = new SubscriptionClient(
                this.context.credentials
            );

            this.logger.info(`Clients initialized for tenant: ${tenantId} and subscription: ${subscriptionId}`);
        } catch (error) {
            this.logger.error(`Failed to initialize clients: ${error}`);
            throw new AzureMCPError(
                "Failed to initialize Azure clients",
                "INIT_FAILED"
            );
        }
    }

    private async handleListTools() {
        return {
            tools: [
                {
                    name: "run-azure-code",
                    description: "Run Azure code",
                    inputSchema: {
                        type: "object",
                        properties: {
                            reasoning: {
                                type: "string",
                                description: "The reasoning behind the code",
                            },
                            code: {
                                type: "string",
                                description: codePrompt,
                            },
                            tenantId: {
                                type: "string",
                                description: "Azure Tenant ID",
                            },
                            subscriptionId: {
                                type: "string",
                                description: "Azure Subscription ID",
                            }
                        },
                        required: ["reasoning", "code"],
                    },
                },
                {
                    name: "list-tenants",
                    description: "List all available Azure tenants",
                    inputSchema: {
                        type: "object",
                        properties: {},
                        required: [],
                    },
                },
                {
                    name: "select-tenant",
                    description: "Select Azure tenant and subscription",
                    inputSchema: {
                        type: "object",
                        properties: {
                            tenantId: {
                                type: "string",
                                description: "Azure Tenant ID to select",
                            },
                            subscriptionId: {
                                type: "string",
                                description: "Azure Subscription ID to select",
                            },
                        },
                        required: ["tenantId", "subscriptionId"],
                    },
                },
            ],
        };
    }

    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        retries = MAX_RETRIES
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let i = 0; i < retries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                this.logger.warning(`Retry ${i + 1}/${retries} failed: ${error}`);
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (i + 1)));
                }
            }
        }

        throw lastError || new Error('Operation failed after retries');
    }

    private async handleCallTool(request: z.infer<typeof CallToolRequestSchema>) {
        const { name, arguments: args } = request.params;

        try {
            let result;
            switch (name) {
                case "run-azure-code":
                    result = await this.handleRunAzureCode(args);
                    break;
                case "list-tenants":
                    result = await this.handleListTenants();
                    break;
                case "select-tenant":
                    result = await this.handleSelectTenant(args);
                    break;
                default:
                    throw new AzureMCPError(`Unknown tool: ${name}`, "UNKNOWN_TOOL");
            }

            // Ensure the result is properly formatted before returning
            return this.createTextResponse(
                typeof result === 'string' ? result : JSON.stringify(result)
            );
        } catch (error) {
            this.logger.error(`Error in handleCallTool: ${error}`);
            if (error instanceof z.ZodError) {
                throw new AzureMCPError(
                    `Invalid arguments: ${error.errors
                        .map((e) => `${e.path.join(".")}: ${e.message}`)
                        .join(", ")}`,
                    "INVALID_ARGS"
                );
            }
            // Ensure errors are properly formatted as well
            return this.createTextResponse(
                JSON.stringify({
                    error: error instanceof Error ? error.message : String(error),
                    code: error instanceof AzureMCPError ? error.code : "UNKNOWN_ERROR"
                })
            );
        }
    }

    private async handleRunAzureCode(args: any) {
        const { reasoning, code, tenantId, subscriptionId } = RunAzureCodeSchema.parse(args);

        if (!this.context.selectedTenant && !tenantId) {
            throw new AzureMCPError(
                "Please select a tenant first using the 'select-tenant' tool!",
                "NO_TENANT"
            );
        }

        if (tenantId && subscriptionId) {
            await this.initializeClients(tenantId, subscriptionId);
        }

        if (!this.context.resourceClient || !this.context.subscriptionClient) {
            throw new AzureMCPError(
                "Clients not initialized",
                "NO_CLIENTS"
            );
        }

        const wrappedCode = this.wrapUserCode(code);
        const wrappedIIFECode = `(async function() { return (async () => { ${wrappedCode} })(); })()`;

        try {
            const result = await this.executeWithRetry(() =>
                runInContext(wrappedIIFECode, createContext(this.context))
            );
            return this.createTextResponse(JSON.stringify(result));
        } catch (error) {
            this.logger.error(`Error executing user code: ${error}`);
            throw new AzureMCPError(
                `Failed to execute code: ${error}`,
                "CODE_EXECUTION_FAILED"
            );
        }
    }

    private async handleListTenants() {
        try {
            const creds = new DefaultAzureCredential();
            const client = new SubscriptionClient(creds);

            const [tenants, subscriptions] = await Promise.all([
                this.executeWithRetry(async () => {
                    const items = [];
                    for await (const tenant of client.tenants.list()) {
                        items.push({
                            id: tenant.tenantId,
                            name: tenant.displayName
                        });
                    }
                    return items;
                }),
                this.executeWithRetry(async () => {
                    const items = [];
                    for await (const sub of client.subscriptions.list()) {
                        items.push({
                            id: sub.subscriptionId,
                            name: sub.displayName,
                            state: sub.state
                        });
                    }
                    return items;
                })
            ]);

            return this.createTextResponse(JSON.stringify({ tenants, subscriptions }));
        } catch (error) {
            this.logger.error(`Error listing tenants: ${error}`);
            throw new AzureMCPError(
                "Failed to list tenants and subscriptions",
                "LIST_FAILED"
            );
        }
    }

    private async handleSelectTenant(args: any) {
        const { tenantId, subscriptionId } = SelectTenantSchema.parse(args);
        await this.initializeClients(tenantId, subscriptionId);
        return this.createTextResponse("Tenant and subscription selected! Clients initialized.");
    }

    private wrapUserCode(userCode: string): string {
        try {
            const project = new Project({
                useInMemoryFileSystem: true,
            });
            const sourceFile = project.createSourceFile("userCode.ts", userCode);
            const lastStatement = sourceFile.getStatements().pop();

            if (lastStatement && lastStatement.getKind() === SyntaxKind.ExpressionStatement) {
                const returnStatement = lastStatement.asKind(SyntaxKind.ExpressionStatement);
                if (returnStatement) {
                    const expression = returnStatement.getExpression();
                    sourceFile.addStatements(`return ${expression.getText()};`);
                    returnStatement.remove();
                }
            }
            return sourceFile.getFullText();
        } catch (error) {
            this.logger.error(`Error wrapping user code: ${error}`);
            throw new AzureMCPError(
                "Failed to process user code",
                "CODE_WRAP_FAILED"
            );
        }
    }

    private createTextResponse(text: string) {
        try {
            // If the input is already a JSON string, parse and reconstruct it properly
            const parsed = JSON.parse(text);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(parsed)
                }]
            };
        } catch {
            // If it's not valid JSON, clean up the string and format it properly
            const cleanText = text
                // Remove ANSI escape codes
                .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
                // Remove log level indicators
                .replace(/\[info\]|\[error\]|\[warn\]/g, '')
                // Remove any potential HTML/XML-like tags
                .replace(/<[^>]*>/g, '')
                // Clean up extra whitespace
                .replace(/\s+/g, ' ')
                .trim();

            // Ensure we're returning a valid MCP response format
            return {
                content: [{
                    type: "text",
                    text: cleanText
                }]
            };
        }
    }


    public async start(): Promise<void> {
        try {
            await this.server.connect(this.transport);
            this.logger.info("Azure MCP Server running on stdio");
        } catch (error) {
            this.logger.error(`Failed to start server: ${error}`);
            throw new AzureMCPError(
                "Failed to start server",
                "START_FAILED"
            );
        }
    }
}

// Schema definitions
const RunAzureCodeSchema = z.object({
    reasoning: z.string(),
    code: z.string(),
    tenantId: z.string().optional(),
    subscriptionId: z.string().optional(),
});

const SelectTenantSchema = z.object({
    tenantId: z.string(),
    subscriptionId: z.string(),
});

// Start the server
if (require.main === module) {
    const server = new AzureMCPServer();
    server.start().catch((error) => {
        LoggerService.error(`Server failed to start: ${error}`);
        process.exit(1);
    });
}

export { AzureMCPServer, AzureMCPError };