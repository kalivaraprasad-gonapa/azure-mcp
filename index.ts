import { Project, SyntaxKind } from "ts-morph";
import { createContext, runInContext } from "node:vm";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DefaultAzureCredential, ClientSecretCredential } from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import { SubscriptionClient } from "@azure/arm-subscriptions";

const codePrompt = `Your job is to answer questions about Azure environment by writing Javascript code using Azure SDK. The code must adhere to a few rules:
- Use the provided client instances: 'resourceClient' for ResourceManagementClient and 'subscriptionClient' for SubscriptionClient
- DO NOT create new client instances or import Azure SDK packages
- Use async/await and promises
- Think step-by-step before writing the code
- Avoid hardcoded values like Resource IDs
- Handle errors gracefully
- Handle pagination correctly using for-await-of loops
- Data returned must be JSON containing only the minimal amount of data needed
- Code MUST "return" a value: string, number, boolean or JSON object
Example usage:
async function listResources() {
    const resources = [];
    for await (const resource of resourceClient.resources.list()) {
        resources.push({
            name: resource.name,
            type: resource.type
        });
    }
    return resources;
}
Be concise, professional and to the point.`;

const server = new Server(
    {
        name: "azure-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

let selectedTenant: string | null = null;
let selectedSubscription: string | null = null;
let credentials: DefaultAzureCredential | ClientSecretCredential | null = null;
let resourceClient: ResourceManagementClient | null = null;
let subscriptionClient: SubscriptionClient | null = null;

server.setRequestHandler(ListToolsRequestSchema, async () => {
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
                description: "Select Azure tenant and subscription for subsequent operations",
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
});

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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "run-azure-code") {
            const { reasoning, code, tenantId, subscriptionId } = RunAzureCodeSchema.parse(args);

            if (!selectedTenant && !tenantId) {
                return createTextResponse(
                    "Please select a tenant first using the 'select-tenant' tool!"
                );
            }

            if (tenantId && subscriptionId) {
                credentials = new DefaultAzureCredential();
                selectedTenant = tenantId;
                selectedSubscription = subscriptionId;

                // Initialize the clients with new credentials
                resourceClient = new ResourceManagementClient(credentials, subscriptionId);
                subscriptionClient = new SubscriptionClient(credentials);
            }

            if (!resourceClient || !subscriptionClient) {
                return createTextResponse(
                    "Clients not initialized. Please make sure to select a tenant and subscription first."
                );
            }

            // Provide initialized clients in the context
            const context = {
                resourceClient,
                subscriptionClient,
                credentials,
                selectedTenant,
                selectedSubscription
            };

            const wrappedCode = wrapUserCode(code);
            const wrappedIIFECode = `(async function() { return (async () => { ${wrappedCode} })(); })()`;
            const result = await runInContext(wrappedIIFECode, createContext(context));

            return createTextResponse(JSON.stringify(result));
        }
        else if (name === "list-tenants") {
            const creds = new DefaultAzureCredential();
            const client = new SubscriptionClient(creds);

            // Handle pagination for tenants
            const tenants: any[] = [];
            for await (const tenant of client.tenants.list()) {
                tenants.push({
                    id: tenant.tenantId,
                    name: tenant.displayName
                });
            }

            // Handle pagination for subscriptions
            const subscriptions: any[] = [];
            for await (const sub of client.subscriptions.list()) {
                subscriptions.push({
                    id: sub.subscriptionId,
                    name: sub.displayName,
                    state: sub.state
                });
            }

            return createTextResponse(JSON.stringify({
                tenants,
                subscriptions
            }));
        }
        else if (name === "select-tenant") {
            const { tenantId, subscriptionId } = SelectTenantSchema.parse(args);

            // Initialize everything with the new tenant/subscription
            credentials = new DefaultAzureCredential();
            selectedTenant = tenantId;
            selectedSubscription = subscriptionId;

            // Initialize the clients
            resourceClient = new ResourceManagementClient(credentials, subscriptionId);
            subscriptionClient = new SubscriptionClient(credentials);

            return createTextResponse("Tenant and subscription selected! Clients initialized.");
        }
        else {
            throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(
                `Invalid arguments: ${error.errors
                    .map((e) => `${e.path.join(".")}: ${e.message}`)
                    .join(", ")}`
            );
        }
        throw error;
    }
});

function wrapUserCode(userCode: string) {
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
}

const createTextResponse = (text: string) => ({
    content: [{ type: "text", text }],
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
    console.error("Azure MCP Server running on stdio");
});