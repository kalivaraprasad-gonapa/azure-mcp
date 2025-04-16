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
const CONFIG = {
    SERVER_VERSION: process.env.SERVER_VERSION || "1.0.0",
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "3", 10),
    RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || "1000", 10),
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
};

// Type definitions
interface ServerContext {
    resourceClient: ResourceManagementClient | null;
    subscriptionClient: SubscriptionClient | null;
    credentials: ChainedTokenCredential | null;
    selectedTenant: string | null;
    selectedSubscription: string | null;
    apiVersion?: string;
}

// Error classes
class AzureMCPError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'AzureMCPError';
    }
}

class AzureAuthenticationError extends AzureMCPError {
    constructor(message: string) {
        super(message, "AUTH_FAILED");
    }
}

class AzureResourceError extends AzureMCPError {
    constructor(message: string) {
        super(message, "RESOURCE_ERROR");
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
    private resourceCache: Map<string, any> = new Map();
    private azureOperations!: AzureOperations;

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
                version: CONFIG.SERVER_VERSION,
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

        // Initialize Azure operations after setting up request handlers
        this.azureOperations = new AzureOperations(this.context, this.logger);
    }

    private createCredential(tenantId?: string): ChainedTokenCredential {
        const credentials = [];

        // Add environment-based credential
        if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
            credentials.push(new ClientSecretCredential(
                process.env.AZURE_TENANT_ID,
                process.env.AZURE_CLIENT_ID,
                process.env.AZURE_CLIENT_SECRET
            ));
        }

        // Add managed identity with specific client ID if available
        if (process.env.AZURE_CLIENT_ID) {
            credentials.push(new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID));
        } else {
            credentials.push(new ManagedIdentityCredential());
        }

        // Add default Azure credential as fallback
        credentials.push(new DefaultAzureCredential({
            tenantId: tenantId || process.env.AZURE_TENANT_ID
        }));

        return new ChainedTokenCredential(...credentials);
    }

    private async initializeClients(tenantId: string, subscriptionId: string): Promise<void> {
        try {
            // Use enhanced credential creation
            this.context.credentials = this.createCredential(tenantId);

            this.context.selectedTenant = tenantId;
            this.context.selectedSubscription = subscriptionId;

            this.context.resourceClient = new ResourceManagementClient(
                this.context.credentials,
                subscriptionId
            );
            this.context.subscriptionClient = new SubscriptionClient(
                this.context.credentials
            );

            this.logWithContext("info", `Clients initialized for tenant: ${tenantId} and subscription: ${subscriptionId}`);
        } catch (error) {
            this.logWithContext("error", `Failed to initialize clients: ${error}`, { error });
            throw new AzureAuthenticationError(
                `Failed to initialize Azure clients: ${error}`
            );
        }
    }

    private async getCachedResource(key: string, fetchFn: () => Promise<any>, ttlMs = 60000): Promise<any> {
        const cachedItem = this.resourceCache.get(key);
        if (cachedItem && (Date.now() - cachedItem.timestamp) < ttlMs) {
            return cachedItem.data;
        }

        const data = await fetchFn();
        this.resourceCache.set(key, {
            data,
            timestamp: Date.now()
        });

        return data;
    }

    private logWithContext(level: string, message: string, context: Record<string, any> = {}): void {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            tenant: this.context.selectedTenant,
            subscription: this.context.selectedSubscription,
            ...context
        };

        // Fix logger access by using type-safe methods
        switch (level) {
            case 'info':
                this.logger.info(JSON.stringify(logEntry));
                break;
            case 'warning':
            case 'warn':
                this.logger.warning(JSON.stringify(logEntry));
                break;
            case 'error':
                this.logger.error(JSON.stringify(logEntry));
                break;
            default:
                this.logger.info(JSON.stringify(logEntry));
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
                // New tools
                {
                    name: "list-resource-groups",
                    description: "List all resource groups in the selected subscription",
                    inputSchema: {
                        type: "object",
                        properties: {},
                        required: [],
                    },
                },
                {
                    name: "get-resource-details",
                    description: "Get detailed information about a specific resource",
                    inputSchema: {
                        type: "object",
                        properties: {
                            resourceId: {
                                type: "string",
                                description: "Azure Resource ID",
                            },
                        },
                        required: ["resourceId"],
                    },
                },
                {
                    name: "create-resource-group",
                    description: "Create a new resource group",
                    inputSchema: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "Resource group name",
                            },
                            location: {
                                type: "string",
                                description: "Azure region",
                            },
                            tags: {
                                type: "object",
                                description: "Resource tags (optional)",
                            }
                        },
                        required: ["name", "location"],
                    },
                },
            ],
        };
    }

    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        retries = CONFIG.MAX_RETRIES
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let i = 0; i < retries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                this.logWithContext("warning", `Retry ${i + 1}/${retries} failed: ${error}`, { error });
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS * (i + 1)));
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
                // New tools
                case "list-resource-groups":
                    result = await this.handleListResourceGroups();
                    break;
                case "get-resource-details":
                    result = await this.handleGetResourceDetails(args);
                    break;
                case "create-resource-group":
                    result = await this.handleCreateResourceGroup(args);
                    break;
                default:
                    throw new AzureMCPError(`Unknown tool: ${name}`, "UNKNOWN_TOOL");
            }

            // Ensure the result is properly formatted before returning
            return this.createTextResponse(
                typeof result === 'string' ? result : JSON.stringify(result)
            );
        } catch (error) {
            this.logWithContext("error", `Error in handleCallTool: ${error}`, { error });
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
        const { code, tenantId, subscriptionId } = RunAzureCodeSchema.parse(args);

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
            this.logWithContext("error", `Error executing user code: ${error}`, { error });
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
            this.logWithContext("error", `Error listing tenants: ${error}`, { error });
            throw new AzureAuthenticationError(
                `Failed to list tenants and subscriptions: ${error}`
            );
        }
    }

    private async handleSelectTenant(args: any) {
        const { tenantId, subscriptionId } = SelectTenantSchema.parse(args);
        await this.initializeClients(tenantId, subscriptionId);
        return this.createTextResponse("Tenant and subscription selected! Clients initialized.");
    }

    private async handleListResourceGroups() {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        try {
            const cacheKey = `resource-groups-${this.context.selectedSubscription}`;
            const resourceGroups = await this.getCachedResource(cacheKey, async () => {
                // Use azureOperations to handle the business logic
                return await this.azureOperations.listResourceGroups();
            }, 30000); // Cache for 30 seconds

            return resourceGroups;
        } catch (error) {
            this.logWithContext("error", `Error listing resource groups: ${error}`, { error });
            throw new AzureResourceError(`Failed to list resource groups: ${error}`);
        }
    }

    private async handleGetResourceDetails(args: any) {
        const { resourceId } = z.object({
            resourceId: z.string().min(1, "Resource ID cannot be empty")
        }).parse(args);

        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        try {
            // The resource ID format is: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/{provider}/{resourceType}/{resourceName}
            const parts = resourceId.split('/');
            if (parts.length < 8) {
                throw new AzureResourceError("Invalid resource ID format");
            }

            const cacheKey = `resource-${resourceId}`;
            const resource = await this.getCachedResource(cacheKey, async () => {
                // Use azureOperations to get the resource
                return await this.azureOperations.getResource(resourceId);
            }, 60000); // Cache for 1 minute

            return {
                id: resource.id,
                name: resource.name,
                type: resource.type,
                location: resource.location,
                tags: resource.tags || {},
                properties: resource.properties || {}
            };
        } catch (error) {
            this.logWithContext("error", `Error getting resource details: ${error}`, { error });
            throw new AzureResourceError(`Failed to get resource details: ${error}`);
        }
    }

    private async handleCreateResourceGroup(args: any) {
        const { name, location, tags } = z.object({
            name: z.string().min(1, "Resource group name cannot be empty"),
            location: z.string().min(1, "Location cannot be empty"),
            tags: z.record(z.string()).optional()
        }).parse(args);

        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        try {
            // Use azureOperations to create the resource group
            const result = await this.azureOperations.createResourceGroup(name, location, tags);

            // Invalidate cache for resource groups list
            this.resourceCache.delete(`resource-groups-${this.context.selectedSubscription}`);

            return {
                id: result.id,
                name: result.name,
                location: result.location,
                tags: result.tags || {},
                provisioningState: result.properties?.provisioningState
            };
        } catch (error) {
            this.logWithContext("error", `Error creating resource group: ${error}`, { error });
            throw new AzureResourceError(`Failed to create resource group: ${error}`);
        }
    }

    private wrapUserCode(userCode: string): string {
        try {
            // Sanitize user code to prevent certain patterns
            const sanitizedCode = userCode
                .replace(/process\.env/g, '/* process.env access blocked */')
                .replace(/require\s*\(/g, '/* require blocked */')
                .replace(/import\s+.*\s+from/g, '/* import blocked */');

            const project = new Project({
                useInMemoryFileSystem: true,
            });
            const sourceFile = project.createSourceFile("userCode.ts", sanitizedCode);
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
            this.logWithContext("error", `Error wrapping user code: ${error}`, { error });
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
            this.logWithContext("info", "Azure MCP Server running on stdio");
        } catch (error) {
            this.logWithContext("error", `Failed to start server: ${error}`, { error });
            throw new AzureMCPError(
                "Failed to start server",
                "START_FAILED"
            );
        }
    }

    // For testing purposes only
    public async __testOnly_setContext(context: Partial<ServerContext>) {
        this.context = { ...this.context, ...context };
        return "Context updated for testing";
    }
}

// Azure Operations class for better separation of concerns
class AzureOperations {
    constructor(private context: ServerContext, private logger: any) { }

    async listResourceGroups() {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        const resourceGroups = [];
        for await (const group of this.context.resourceClient.resourceGroups.list()) {
            resourceGroups.push({
                id: group.id,
                name: group.name,
                location: group.location,
                tags: group.tags || {}
            });
        }

        return resourceGroups;
    }

    async getResource(resourceId: string) {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        return await this.context.resourceClient.resources.getById(
            resourceId,
            'latest'
        );
    }

    async createResourceGroup(name: string, location: string, tags?: Record<string, string>) {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        return await this.context.resourceClient.resourceGroups.createOrUpdate(
            name,
            { location, tags }
        );
    }

    async listResourcesByType(resourceType: string, provider: string) {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        const resources = [];
        // Using list() with a filter instead of listByResourceType which doesn't exist
        const filter = `resourceType eq '${provider}/${resourceType}'`;
        for await (const resource of this.context.resourceClient.resources.list({ filter })) {
            resources.push({
                id: resource.id,
                name: resource.name,
                type: resource.type,
                location: resource.location,
                tags: resource.tags || {}
            });
        }

        return resources;
    }

    async getResourceGroup(resourceGroupName: string) {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        return await this.context.resourceClient.resourceGroups.get(resourceGroupName);
    }
}

// Schema definitions
const RunAzureCodeSchema = z.object({
    reasoning: z.string()
        .min(1, "Reasoning cannot be empty")
        .describe("The reasoning behind the code"),
    code: z.string()
        .min(1, "Code cannot be empty")
        .describe(codePrompt),
    tenantId: z.string()
        .optional()
        .describe("Azure Tenant ID"),
    subscriptionId: z.string()
        .optional()
        .describe("Azure Subscription ID"),
});

const SelectTenantSchema = z.object({
    tenantId: z.string()
        .describe("Azure Tenant ID to select"),
    subscriptionId: z.string()
        .describe("Azure Subscription ID to select"),
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