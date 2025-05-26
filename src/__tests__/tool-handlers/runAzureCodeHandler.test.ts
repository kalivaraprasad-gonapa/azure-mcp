// src/__tests__/tool-handlers/runAzureCodeHandler.test.ts
import { runAzureCodeHandler } from '../../tool-handlers/runAzureCodeHandler';
import { AzureMCPError, ServerContext } from '../../AzureServer';
import { AzureOperations } from '../../AzureOperations';
import LoggerService from '../../LoggerService';
import { RunAzureCodeSchema } from '../../schemas'; // For argument parsing
import { createContext, runInContext } from 'node:vm'; // For mocking runInContext

jest.mock('../../AzureOperations');
jest.mock('../../LoggerService');
jest.mock('node:vm', () => ({
    createContext: jest.fn(),
    runInContext: jest.fn(),
}));
jest.mock('../../schemas', () => ({
    RunAzureCodeSchema: {
        parse: jest.fn(args => args) // Simple mock, assumes valid args
    }
}));


describe('runAzureCodeHandler', () => {
    let mockServerContext: jest.Mocked<ServerContext>;
    let mockAzureOperations: jest.Mocked<AzureOperations>;
    let mockLogger: jest.Mocked<typeof LoggerService>;
    let mockInitializeClients: jest.Mock;
    let mockWrapUserCode: jest.Mock;
    let mockExecuteWithRetry: jest.Mock;
    let mockArgs: any;

    beforeEach(() => {
        mockServerContext = {
            resourceClient: {} as any, // Will be set by initializeClients
            subscriptionClient: {} as any, // Will be set by initializeClients
            credentials: {} as any,
            selectedTenant: 'initial-tenant', // Can be overridden by args
            selectedSubscription: 'initial-sub', // Can be overridden by args
        } as jest.Mocked<ServerContext>;

        mockAzureOperations = new (AzureOperations as jest.Mock<typeof AzureOperations>)(mockServerContext, LoggerService) as jest.Mocked<AzureOperations>;
        mockLogger = LoggerService as jest.Mocked<typeof LoggerService>;
        
        mockInitializeClients = jest.fn().mockImplementation(async (tenantId, subscriptionId) => {
            // Simulate client initialization by populating context
            mockServerContext.selectedTenant = tenantId;
            mockServerContext.selectedSubscription = subscriptionId;
            mockServerContext.resourceClient = { mock: 'resourceClient' } as any;
            mockServerContext.subscriptionClient = { mock: 'subscriptionClient' } as any;
        });
        mockWrapUserCode = jest.fn(code => `wrapped(${code})`);
        mockExecuteWithRetry = jest.fn(operation => operation()); // Simple pass-through for most tests
        
        mockArgs = {
            code: 'return 1+1;',
            reasoning: 'test reasoning',
            // tenantId and subscriptionId can be added per test case
        };
        (RunAzureCodeSchema.parse as jest.Mock).mockImplementation(args => args);
        (createContext as jest.Mock).mockImplementation(ctx => ctx); // Return the context object itself for inspection
        (runInContext as jest.Mock).mockResolvedValue('execution result');
    });

    it('should throw AzureMCPError if no tenant selected and no tenantId in args', async () => {
        mockServerContext.selectedTenant = null; // No tenant selected initially
        mockArgs.tenantId = undefined; // No tenantId provided in args
        
        await expect(runAzureCodeHandler(mockArgs, mockServerContext, mockAzureOperations, mockLogger, mockInitializeClients, mockWrapUserCode, mockExecuteWithRetry))
            .rejects.toThrow(new AzureMCPError("Please select a tenant first using the 'select-tenant' tool!", "NO_TENANT"));
    });

    it('should call initializeClients if tenantId and subscriptionId are provided', async () => {
        mockArgs.tenantId = 'new-tenant';
        mockArgs.subscriptionId = 'new-sub';
        
        await runAzureCodeHandler(mockArgs, mockServerContext, mockAzureOperations, mockLogger, mockInitializeClients, mockWrapUserCode, mockExecuteWithRetry);
        
        expect(mockInitializeClients).toHaveBeenCalledWith('new-tenant', 'new-sub');
        expect(mockServerContext.resourceClient).toBeDefined(); // Check that initializeClients did its job
        expect(mockServerContext.subscriptionClient).toBeDefined();
    });

    it('should throw AzureMCPError if clients are not initialized after attempt', async () => {
        mockArgs.tenantId = 'new-tenant';
        mockArgs.subscriptionId = 'new-sub';
        // Override mockInitializeClients to simulate failure
        mockInitializeClients.mockImplementationOnce(async () => {
            mockServerContext.resourceClient = null;
            mockServerContext.subscriptionClient = null;
        });
        
        await expect(runAzureCodeHandler(mockArgs, mockServerContext, mockAzureOperations, mockLogger, mockInitializeClients, mockWrapUserCode, mockExecuteWithRetry))
            .rejects.toThrow(new AzureMCPError("Clients not initialized", "NO_CLIENTS"));
    });

    it('should call wrapUserCode and execute code in VM context', async () => {
        mockServerContext.resourceClient = { mock: 'resourceClient' } as any; // Ensure clients are "initialized"
        mockServerContext.subscriptionClient = { mock: 'subscriptionClient' } as any;

        const result = await runAzureCodeHandler(mockArgs, mockServerContext, mockAzureOperations, mockLogger, mockInitializeClients, mockWrapUserCode, mockExecuteWithRetry);
        
        expect(mockWrapUserCode).toHaveBeenCalledWith(mockArgs.code);
        expect(createContext).toHaveBeenCalledWith({ azureOperations: mockAzureOperations });
        expect(runInContext).toHaveBeenCalledWith(`wrapped(async function() { return (async () => { wrapped(${mockArgs.code}) })(); })()`, { azureOperations: mockAzureOperations });
        expect(result).toBe('execution result');
    });

    it('should handle error during code execution', async () => {
        mockServerContext.resourceClient = { mock: 'resourceClient' } as any;
        mockServerContext.subscriptionClient = { mock: 'subscriptionClient' } as any;
        const executionError = new Error("VM execution failed");
        (runInContext as jest.Mock).mockRejectedValue(executionError);
        
        await expect(runAzureCodeHandler(mockArgs, mockServerContext, mockAzureOperations, mockLogger, mockInitializeClients, mockWrapUserCode, mockExecuteWithRetry))
            .rejects.toThrow(new AzureMCPError(`Failed to execute code: ${executionError.message}`, "CODE_EXECUTION_FAILED"));
        expect(mockLogger.error).toHaveBeenCalledWith(`Error executing user code: ${executionError.message}`, { error: executionError });
    });

    it('should use executeWithRetry for runInContext', async () => {
        mockServerContext.resourceClient = { mock: 'resourceClient' } as any;
        mockServerContext.subscriptionClient = { mock: 'subscriptionClient' } as any;
        
        await runAzureCodeHandler(mockArgs, mockServerContext, mockAzureOperations, mockLogger, mockInitializeClients, mockWrapUserCode, mockExecuteWithRetry);
        
        expect(mockExecuteWithRetry).toHaveBeenCalledWith(expect.any(Function)); // Check that runInContext call is wrapped
    });
});
