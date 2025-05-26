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
import { codePrompt, CONFIG, AZURE_CREDENTIALS } from "./config.js"; // Import AZURE_CREDENTIALS
import { AzureOperations } from './AzureOperations.js';
// Schemas are imported directly by handlers, no need to import them here
import { listResourceGroupsHandler } from './tool-handlers/listResourceGroupsHandler.js';
import { createResourceGroupHandler } from './tool-handlers/createResourceGroupHandler.js';
import { runAzureCodeHandler } from './tool-handlers/runAzureCodeHandler.js';
import { listTenantsHandler } from './tool-handlers/listTenantsHandler.js';
import { selectTenantHandler } from './tool-handlers/selectTenantHandler.js';
import { getResourceDetailsHandler } from './tool-handlers/getResourceDetailsHandler.js';

// CONFIG object is now imported from config.js

/**
 * @interface ServerContext
 * @description Defines the structure for the server's context object, holding Azure clients,
 * credentials, and selected tenant/subscription information.
 */
interface ServerContext {
    resourceClient: ResourceManagementClient | null;
    subscriptionClient: SubscriptionClient | null;
    credentials: ChainedTokenCredential | null;
    selectedTenant: string | null;
    selectedSubscription: string | null;
    apiVersion?: string;
}

/**
 * @class AzureMCPError
 * @extends Error
 * @description Custom error class for general Azure MCP server errors.
 * @param {string} message - The error message.
 * @param {string} code - A unique error code.
 */
class AzureMCPError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'AzureMCPError';
    }
}

/**
 * @class AzureAuthenticationError
 * @extends AzureMCPError
 * @description Custom error class for Azure authentication failures.
 * @param {string} message - The error message.
 */
class AzureAuthenticationError extends AzureMCPError {
    constructor(message: string) {
        super(message, "AUTH_FAILED");
    }
}

/**
 * @class AzureResourceError
 * @extends AzureMCPError
 * @description Custom error class for errors related to Azure resource operations.
 * @param {string} message - The error message.
 */
class AzureResourceError extends AzureMCPError {
    constructor(message: string) {
        super(message, "RESOURCE_ERROR");
    }
}

/**
 * @class AzureMCPServer
 * @description Main class for the Azure Model Context Protocol (MCP) server.
 * Handles tool requests, manages Azure client context, and interacts with Azure services.
 */
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

    /**
     * @private
     * @method initializeRequestHandlers
     * @description Sets up request handlers for the MCP server (e.g., ListTools, CallTool).
     * Also initializes the AzureOperations instance.
     */
    private initializeRequestHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, this.handleListTools.bind(this));
        this.server.setRequestHandler(CallToolRequestSchema, this.handleCallTool.bind(this));

        // Initialize Azure operations after setting up request handlers
        this.azureOperations = new AzureOperations(this.context, this.logger);
    }

    /**
     * @private
     * @method createCredential
     * @description Creates a chained token credential for Azure authentication, attempting various
     * methods like client secret, managed identity, and default Azure credential.
     * @param {string} [tenantId] - Optional tenant ID to use for specific credential types.
     * @returns {ChainedTokenCredential} The configured ChainedTokenCredential instance.
     */
    private createCredential(tenantId?: string): ChainedTokenCredential {
        const credentials = [];

        // Add environment-based credential
        if (AZURE_CREDENTIALS.CLIENT_ID && AZURE_CREDENTIALS.CLIENT_SECRET && AZURE_CREDENTIALS.TENANT_ID) {
            credentials.push(new ClientSecretCredential(
                AZURE_CREDENTIALS.TENANT_ID,
                AZURE_CREDENTIALS.CLIENT_ID,
                AZURE_CREDENTIALS.CLIENT_SECRET
            ));
        }

        // Add managed identity with specific client ID if available
        if (AZURE_CREDENTIALS.CLIENT_ID) {
            credentials.push(new ManagedIdentityCredential(AZURE_CREDENTIALS.CLIENT_ID));
        } else {
            credentials.push(new ManagedIdentityCredential());
        }

        // Add default Azure credential as fallback
        credentials.push(new DefaultAzureCredential({
            tenantId: tenantId || AZURE_CREDENTIALS.TENANT_ID // Use AZURE_CREDENTIALS.TENANT_ID for fallback
        }));

        return new ChainedTokenCredential(...credentials);
    }

    /**
     * @private
     * @async
     * @method initializeClients
     * @description Initializes Azure SDK clients (ResourceManagementClient, SubscriptionClient)
     * for the specified tenant and subscription ID. Updates the server context.
     * @param {string} tenantId - The Azure Tenant ID.
     * @param {string} subscriptionId - The Azure Subscription ID.
     * @throws {AzureAuthenticationError} If client initialization fails.
     */
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

    // getCachedResource removed as its logic is now directly in handlers

    /**
     * @private
     * @method logWithContext
     * @description Logs a message with additional context (tenant, subscription).
     * @param {string} level - The log level (e.g., 'info', 'error').
     * @param {string} message - The message to log.
     * @param {Record<string, any>} [context={}] - Additional context to include in the log entry.
     */
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

    /**
     * @private
     * @async
     * @method handleListTools
     * @description Handles the "ListTools" request from the MCP client.
     * @returns {Promise<object>} A promise that resolves to an object containing the list of available tools.
     */
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

    /**
     * @private
     * @async
     * @method executeWithRetry
     * @description Executes an asynchronous operation with a retry mechanism for transient failures.
     * @template T
     * @param {() => Promise<T>} operation - The asynchronous operation to execute.
     * @param {number} [retries=CONFIG.MAX_RETRIES] - The maximum number of retries.
     * @returns {Promise<T>} A promise that resolves with the result of the operation if successful.
     * @throws {Error} Throws the last encountered error if all retries fail.
     */
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

    /**
     * @private
     * @async
     * @method handleCallTool
     * @description Handles the "CallTool" request from the MCP client. It dispatches the request
     * to the appropriate tool handler based on the tool name.
     * @param {z.infer<typeof CallToolRequestSchema>} request - The CallTool request object.
     * @returns {Promise<object>} A promise that resolves to the formatted tool response.
     * @throws {AzureMCPError} If the tool name is unknown or if arguments are invalid.
     */
    private async handleCallTool(request: z.infer<typeof CallToolRequestSchema>) {
        const { name, arguments: args } = request.params;

        try {
            let result;
            switch (name) {
                case "run-azure-code":
                    result = await runAzureCodeHandler(args, this.context, this.azureOperations, this.logger, this.initializeClients.bind(this), this.wrapUserCode.bind(this), this.executeWithRetry.bind(this));
                    break;
                case "list-tenants":
                    result = await listTenantsHandler(this.logger, this.executeWithRetry.bind(this));
                    break;
                case "select-tenant":
                    result = await selectTenantHandler(args, this.logger, this.initializeClients.bind(this));
                    break;
                case "list-resource-groups": // "New tools" comment removed as it's now integrated
                    result = await listResourceGroupsHandler(this.context, this.azureOperations, this.logger, this.resourceCache);
                    break;
                case "get-resource-details":
                    result = await getResourceDetailsHandler(args, this.context, this.azureOperations, this.logger, this.resourceCache);
                    break;
                case "create-resource-group":
                    result = await createResourceGroupHandler(args, this.context, this.azureOperations, this.logger, this.resourceCache);
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

    /**
     * @private
     * @method wrapUserCode
     * @description Wraps user-provided JavaScript code for safer execution.
     * It attempts to ensure the code returns a value and performs basic sanitization
     * by replacing direct `process.env`, `require`, and `import` usages.
     * @param {string} userCode - The raw JavaScript code provided by the user/LLM.
     * @returns {string} The processed/wrapped code ready for execution.
     * @throws {AzureMCPError} If code processing fails.
     */
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

    /**
     * @private
     * @method createTextResponse
     * @description Formats a string (either plain text or a JSON string) into the standard
     * MCP text response structure. Cleans plain text by removing ANSI codes, log indicators, and HTML tags.
     * @param {string} text - The input text or JSON string.
     * @returns {object} An MCP-compliant response object with a text content part.
     */
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

    /**
     * @public
     * @async
     * @method start
     * @description Starts the Azure MCP server by connecting it to the specified transport (Stdio).
     * @throws {AzureMCPError} If the server fails to start.
     */
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
    /**
     * @public
     * @async
     * @method __testOnly_setContext
     * @description **FOR TESTING PURPOSES ONLY.** Allows setting a partial server context.
     * @param {Partial<ServerContext>} context - The partial context to apply.
     * @returns {Promise<string>} A confirmation message.
     */
    public async __testOnly_setContext(context: Partial<ServerContext>) {
        this.context = { ...this.context, ...context };
        return "Context updated for testing";
    }

if (require.main === module) {
    const server = new AzureMCPServer();
    server.start().catch((error) => {
        LoggerService.error(`Server failed to start: ${error}`);
        process.exit(1);
    });
}

export { AzureMCPServer, AzureMCPError, ServerContext, AzureAuthenticationError, AzureResourceError };