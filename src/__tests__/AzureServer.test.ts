// src/__tests__/AzureServer.test.ts
import { AzureMCPServer, AzureMCPError, AzureAuthenticationError, ServerContext } from '../AzureServer';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import LoggerService from '../LoggerService';
import { AzureOperations } from '../AzureOperations';
import { CONFIG, AZURE_CREDENTIALS } from '../config.js';

// Mock external dependencies and tool handlers
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../LoggerService');
jest.mock('../AzureOperations');

// Mock individual tool handlers
jest.mock('../tool-handlers/runAzureCodeHandler.js');
jest.mock('../tool-handlers/listTenantsHandler.js');
jest.mock('../tool-handlers/selectTenantHandler.js');
jest.mock('../tool-handlers/listResourceGroupsHandler.js');
jest.mock('../tool-handlers/getResourceDetailsHandler.js');
jest.mock('../tool-handlers/createResourceGroupHandler.js');

// Import mocked handlers to use in tests
import { runAzureCodeHandler } from '../tool-handlers/runAzureCodeHandler.js';
import { listTenantsHandler } from '../tool-handlers/listTenantsHandler.js';
import { selectTenantHandler } from '../tool-handlers/selectTenantHandler.js';
import { listResourceGroupsHandler } from '../tool-handlers/listResourceGroupsHandler.js';
import { getResourceDetailsHandler } from '../tool-handlers/getResourceDetailsHandler.js';
import { createResourceGroupHandler } from '../tool-handlers/createResourceGroupHandler.js';

// Mock Azure SDK clients used in initializeClients
jest.mock('@azure/identity', () => ({
    DefaultAzureCredential: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue({ token: 'mock-token', expiresOnTimestamp: Date.now() + 3600000 }),
    })),
    ClientSecretCredential: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue({ token: 'mock-token', expiresOnTimestamp: Date.now() + 3600000 }),
    })),
    ManagedIdentityCredential: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue({ token: 'mock-token', expiresOnTimestamp: Date.now() + 3600000 }),
    })),
    ChainedTokenCredential: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue({ token: 'mock-token', expiresOnTimestamp: Date.now() + 3600000 }),
    })),
}));
jest.mock('@azure/arm-resources');
jest.mock('@azure/arm-subscriptions');


describe('AzureMCPServer', () => {
    let serverInstance: AzureMCPServer;
    let mockServerSdkInstance: jest.Mocked<Server>;

    beforeEach(() => {
        jest.clearAllMocks();
        // Create a new instance for each test
        serverInstance = new AzureMCPServer();
        // Access the mocked Server instance created within AzureMCPServer's constructor
        mockServerSdkInstance = (Server as jest.Mock<Server>).mock.instances[0] as jest.Mocked<Server>;
    });

    describe('constructor', () => {
        it('should initialize with correct default values and instantiate AzureOperations', () => {
            expect(serverInstance).toBeInstanceOf(AzureMCPServer);
            expect(Server).toHaveBeenCalledWith(
                {
                    name: 'azure-mcp',
                    version: CONFIG.SERVER_VERSION, // Use CONFIG from config.js
                },
                {
                    capabilities: {
                        tools: {},
                    },
                }
            );
            expect(StdioServerTransport).toHaveBeenCalled();
            expect(AzureOperations).toHaveBeenCalled();
            expect(mockServerSdkInstance.setRequestHandler).toHaveBeenCalledTimes(2);
        });
    });

    describe('handleListTools', () => {
        it('should return the correct list of tools with their descriptions', async () => {
            // Access private method for testing - this is generally discouraged but sometimes necessary
            // If this becomes problematic, consider making handleListTools public or testing its effects indirectly
            const listToolsResponse = await (serverInstance as any).handleListTools();
            expect(listToolsResponse.tools).toBeInstanceOf(Array);
            expect(listToolsResponse.tools.length).toBeGreaterThan(0); // Check for at least one tool
            
            const expectedToolNames = [
                'run-azure-code', 'list-tenants', 'select-tenant',
                'list-resource-groups', 'get-resource-details', 'create-resource-group'
            ];
            const actualToolNames = listToolsResponse.tools.map((tool: any) => tool.name);
            expect(actualToolNames).toEqual(expect.arrayContaining(expectedToolNames));

            listToolsResponse.tools.forEach((tool: any) => {
                expect(tool).toHaveProperty('name');
                expect(tool).toHaveProperty('description');
                expect(tool).toHaveProperty('inputSchema');
            });
        });
    });

    describe('handleCallTool', () => {
        const mockArgs = { testArg: 'testValue' };
        const mockRequest = (toolName: string) => ({
            params: { name: toolName, arguments: mockArgs },
            method: 'tools/call', // MCP method
        });
        const mockHandlerResult = { someData: 'from handler' };
        const mockTextResponse = { content: [{ type: 'text', text: JSON.stringify(mockHandlerResult) }] };

        beforeEach(() => {
            // Mock createTextResponse for these tests to focus on dispatch logic
            (serverInstance as any).createTextResponse = jest.fn().mockReturnValue(mockTextResponse);
        });
        
        it('should dispatch to runAzureCodeHandler', async () => {
            (runAzureCodeHandler as jest.Mock).mockResolvedValue(mockHandlerResult);
            const response = await (serverInstance as any).handleCallTool(mockRequest('run-azure-code'));
            expect(runAzureCodeHandler).toHaveBeenCalledWith(mockArgs, expect.anything(), expect.anything(), expect.anything(), expect.any(Function), expect.any(Function), expect.any(Function));
            expect(response).toEqual(mockTextResponse);
            expect((serverInstance as any).createTextResponse).toHaveBeenCalledWith(JSON.stringify(mockHandlerResult));
        });

        it('should dispatch to listTenantsHandler', async () => {
            (listTenantsHandler as jest.Mock).mockResolvedValue(mockHandlerResult);
            const response = await (serverInstance as any).handleCallTool(mockRequest('list-tenants'));
            expect(listTenantsHandler).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
            expect(response).toEqual(mockTextResponse);
        });

        it('should dispatch to selectTenantHandler', async () => {
            (selectTenantHandler as jest.Mock).mockResolvedValue(mockHandlerResult);
            const response = await (serverInstance as any).handleCallTool(mockRequest('select-tenant'));
            expect(selectTenantHandler).toHaveBeenCalledWith(mockArgs, expect.anything(), expect.any(Function));
            expect(response).toEqual(mockTextResponse);
        });
        
        it('should dispatch to listResourceGroupsHandler', async () => {
            (listResourceGroupsHandler as jest.Mock).mockResolvedValue(mockHandlerResult);
            const response = await (serverInstance as any).handleCallTool(mockRequest('list-resource-groups'));
            expect(listResourceGroupsHandler).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything());
            expect(response).toEqual(mockTextResponse);
        });

        it('should dispatch to getResourceDetailsHandler', async () => {
            (getResourceDetailsHandler as jest.Mock).mockResolvedValue(mockHandlerResult);
            const response = await (serverInstance as any).handleCallTool(mockRequest('get-resource-details'));
            expect(getResourceDetailsHandler).toHaveBeenCalledWith(mockArgs, expect.anything(), expect.anything(), expect.anything(), expect.anything());
            expect(response).toEqual(mockTextResponse);
        });

        it('should dispatch to createResourceGroupHandler', async () => {
            (createResourceGroupHandler as jest.Mock).mockResolvedValue(mockHandlerResult);
            const response = await (serverInstance as any).handleCallTool(mockRequest('create-resource-group'));
            expect(createResourceGroupHandler).toHaveBeenCalledWith(mockArgs, expect.anything(), expect.anything(), expect.anything(), expect.anything());
            expect(response).toEqual(mockTextResponse);
        });

        it('should handle unknown tool error', async () => {
            const response = await (serverInstance as any).handleCallTool(mockRequest('unknown-tool'));
            expect((serverInstance as any).createTextResponse).toHaveBeenCalledWith(expect.stringContaining("Unknown tool: unknown-tool"));
        });

        it('should handle ZodError for invalid arguments', async () => {
            (runAzureCodeHandler as jest.Mock).mockImplementation(() => {
                const { ZodError } = require('zod');
                const error = new ZodError([]);
                error.errors = [{ path: ['code'], message: 'Code is required' }];
                throw error;
            });
            const response = await (serverInstance as any).handleCallTool(mockRequest('run-azure-code'));
            expect((serverInstance as any).createTextResponse).toHaveBeenCalledWith(expect.stringContaining("Invalid arguments: code: Code is required"));
        });

        it('should handle generic error from handler', async () => {
            const genericError = new Error("Generic handler error");
            (listTenantsHandler as jest.Mock).mockRejectedValue(genericError);
            const response = await (serverInstance as any).handleCallTool(mockRequest('list-tenants'));
            expect((serverInstance as any).createTextResponse).toHaveBeenCalledWith(JSON.stringify({ error: genericError.message, code: "UNKNOWN_ERROR" }));
        });
    });

    describe('createTextResponse', () => {
        // Test createTextResponse directly as it's a utility function
        it('should correctly format JSON string', () => {
            const jsonObj = { key: 'value', nested: { num: 1 } };
            const jsonStr = JSON.stringify(jsonObj);
            const response = (serverInstance as any).createTextResponse(jsonStr);
            expect(response.content[0].type).toBe('text');
            expect(JSON.parse(response.content[0].text)).toEqual(jsonObj);
        });

        it('should clean and format plain text', () => {
            const plainText = "  [info] <tag>text with ANSI \u001b[31mred\u001b[0m </tag>  ";
            const expectedCleanText = "text with ANSI red";
            const response = (serverInstance as any).createTextResponse(plainText);
            expect(response.content[0].type).toBe('text');
            expect(response.content[0].text).toBe(expectedCleanText);
        });
    });
    
    describe('initializeClients', () => {
        it('should initialize resourceClient and subscriptionClient successfully', async () => {
            // Reset AZURE_CREDENTIALS for this test to ensure ClientSecretCredential path is taken
            const originalCreds = { ...AZURE_CREDENTIALS };
            (AZURE_CREDENTIALS as any).CLIENT_ID = 'test-client-id';
            (AZURE_CREDENTIALS as any).CLIENT_SECRET = 'test-client-secret';
            (AZURE_CREDENTIALS as any).TENANT_ID = 'test-tenant-id';
            
            await (serverInstance as any).initializeClients('test-tenant', 'test-sub');
            
            expect((serverInstance as any).context.resourceClient).toBeDefined();
            expect((serverInstance as any).context.subscriptionClient).toBeDefined();
            expect(LoggerService.info).toHaveBeenCalledWith(expect.stringContaining("Clients initialized for tenant: test-tenant and subscription: test-sub"));

            // Restore original creds if they were modified for other tests
             Object.assign(AZURE_CREDENTIALS, originalCreds);
        });

        it('should throw AzureAuthenticationError on failure', async () => {
            (DefaultAzureCredential as jest.Mock).mockImplementationOnce(() => ({
                 getToken: jest.fn().mockRejectedValue(new Error('Auth failed')),
            }));
            
            await expect((serverInstance as any).initializeClients('fail-tenant', 'fail-sub'))
                .rejects.toThrow(AzureAuthenticationError);
        });
    });

    describe('executeWithRetry', () => {
        it('should retry operation on failure and succeed on second attempt', async () => {
            const mockOperation = jest.fn()
                .mockRejectedValueOnce(new Error('Transient error'))
                .mockResolvedValueOnce('Success');
            
            const result = await (serverInstance as any).executeWithRetry(mockOperation, 3);
            expect(mockOperation).toHaveBeenCalledTimes(2);
            expect(result).toBe('Success');
            expect(LoggerService.warning).toHaveBeenCalledWith(expect.stringContaining("Retry 1/3 failed: Error: Transient error"), expect.any(Object));
        });

        it('should throw after max retries', async () => {
            const mockOperation = jest.fn().mockRejectedValue(new Error('Persistent error'));
            
            await expect((serverInstance as any).executeWithRetry(mockOperation, 2))
                .rejects.toThrow('Persistent error');
            expect(mockOperation).toHaveBeenCalledTimes(2);
        });
    });

    describe('wrapUserCode', () => {
        it('should wrap expression statement with return', () => {
            const userCode = "1 + 1";
            const wrapped = (serverInstance as any).wrapUserCode(userCode);
            expect(wrapped.trim()).toContain("return 1 + 1;");
        });

        it('should not modify code that already has return', () => {
            const userCode = "return 1 + 1;";
            const wrapped = (serverInstance as any).wrapUserCode(userCode);
            expect(wrapped.trim()).toBe(userCode);
        });
        
        it('should sanitize process.env, require, and import', () => {
            const userCode = "process.env.FOO; require('fs'); import x from 'y';";
            const wrapped = (serverInstance as any).wrapUserCode(userCode);
            expect(wrapped).toContain("/* process.env access blocked */");
            expect(wrapped).toContain("/* require blocked */");
            expect(wrapped).toContain("/* import blocked */");
        });

        it('should sanitize direct process.env access', () => {
            const userCode = 'const a = process.env.SOME_VAR;';
            const wrapped = (serverInstance as any).wrapUserCode(userCode);
            // The regex replaces `process.env` with the comment, so .SOME_VAR remains.
            expect(wrapped).toContain('const a = /* process.env access blocked */.SOME_VAR;');
        });

        it('should sanitize direct require calls', () => {
            const userCode = 'const fs = require("fs");';
            const wrapped = (serverInstance as any).wrapUserCode(userCode);
            expect(wrapped).toContain('const fs = /* require blocked */("fs");');
        });

        it('should sanitize direct import statements', () => {
            const userCode = 'import x from "module";';
            const wrapped = (serverInstance as any).wrapUserCode(userCode);
            // The regex for import is `import\s+.*\s+from` which replaces the whole line
            expect(wrapped).toContain('/* import blocked */ "module";');
        });

        describe('Sanitization Bypass Attempts (Limitations)', () => {
            it('should not block indirect process.env access', () => {
                const userCode = 'const p = process; const b = p.env.OTHER_VAR;';
                const wrapped = (serverInstance as any).wrapUserCode(userCode);
                expect(wrapped).toContain('const p = process; const b = p.env.OTHER_VAR;');
                expect(wrapped).not.toContain("/* process.env access blocked */");
            });

            it('should not block indirect require calls', () => {
                const userCode = 'const r = require; r("os");';
                const wrapped = (serverInstance as any).wrapUserCode(userCode);
                expect(wrapped).toContain('const r = require; r("os");');
                expect(wrapped).not.toContain("/* require blocked */");
            });

            it('should not block sophisticated constructor-based attacks', () => {
                const userCode = 'const c = constructor; const pr = c.constructor("return process")(); pr.env.TEST;';
                const wrapped = (serverInstance as any).wrapUserCode(userCode);
                expect(wrapped).toContain('const c = constructor; const pr = c.constructor("return process")(); pr.env.TEST;');
                expect(wrapped).not.toContain("/* process.env access blocked */");
            });
            
            it('should not block computed property access for process', () => {
                const userCode = 'const g = globalThis["pro" + "cess"]; g.env.SECRET';
                const wrapped = (serverInstance as any).wrapUserCode(userCode);
                // ts-morph might optimize the string concatenation, but the core test is about non-direct access
                expect(wrapped).toContain('const g = globalThis["process"]; g.env.SECRET');
                expect(wrapped).not.toContain("/* process.env access blocked */");
            });
        });
    });
});
