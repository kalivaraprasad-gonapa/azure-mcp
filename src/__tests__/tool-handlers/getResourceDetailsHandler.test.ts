// src/__tests__/tool-handlers/getResourceDetailsHandler.test.ts
import { getResourceDetailsHandler } from '../../tool-handlers/getResourceDetailsHandler';
import { AzureMCPError, AzureResourceError, ServerContext } from '../../AzureServer';
import { AzureOperations } from '../../AzureOperations';
import LoggerService from '../../LoggerService';
import { GetResourceDetailsSchema } from '../../schemas'; // For argument parsing

jest.mock('../../AzureOperations');
jest.mock('../../LoggerService');
jest.mock('../../schemas', () => ({
    GetResourceDetailsSchema: {
        parse: jest.fn(args => args) // Simple mock, assumes valid args
    }
}));

describe('getResourceDetailsHandler', () => {
    let mockContext: jest.Mocked<ServerContext>;
    let mockAzureOperations: jest.Mocked<AzureOperations>;
    let mockLogger: jest.Mocked<typeof LoggerService>;
    let mockResourceCache: Map<string, any>;
    let mockArgs: any;

    beforeEach(() => {
        mockContext = {
            resourceClient: {} as any, // Mocked, not null
            subscriptionClient: {} as any,
            credentials: {} as any,
            selectedTenant: 'test-tenant',
            selectedSubscription: 'test-subscription',
        } as jest.Mocked<ServerContext>;

        mockAzureOperations = new (AzureOperations as jest.Mock<typeof AzureOperations>)(mockContext, LoggerService) as jest.Mocked<AzureOperations>;
        mockLogger = LoggerService as jest.Mocked<typeof LoggerService>;
        mockResourceCache = new Map<string, any>();
        
        mockArgs = {
            resourceId: '/subscriptions/subid/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm1'
        };
        (GetResourceDetailsSchema.parse as jest.Mock).mockImplementation(args => args);
    });

    it('should return cached data if valid cache exists', async () => {
        const cachedData = { id: mockArgs.resourceId, name: 'CachedVM' };
        mockResourceCache.set(`resource-${mockArgs.resourceId}`, {
            data: cachedData,
            timestamp: Date.now()
        });

        const result = await getResourceDetailsHandler(mockArgs, mockContext, mockAzureOperations, mockLogger, mockResourceCache);
        expect(result).toEqual(cachedData);
        expect(mockAzureOperations.getResource).not.toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(`Returning cached details for resource: ${mockArgs.resourceId}`);
    });

    it('should fetch fresh data if cache is expired', async () => {
        const cachedData = { id: mockArgs.resourceId, name: 'ExpiredVM' };
        mockResourceCache.set(`resource-${mockArgs.resourceId}`, {
            data: cachedData,
            timestamp: Date.now() - 70000 // 70 seconds ago, TTL is 60s
        });
        const freshResource = { id: mockArgs.resourceId, name: 'FreshVM', type: 'Microsoft.Compute/virtualMachines', location: 'eastus', tags: {}, properties: {} };
        mockAzureOperations.getResource.mockResolvedValue(freshResource);

        const result = await getResourceDetailsHandler(mockArgs, mockContext, mockAzureOperations, mockLogger, mockResourceCache);
        expect(result.name).toBe('FreshVM');
        expect(mockAzureOperations.getResource).toHaveBeenCalledWith(mockArgs.resourceId);
        expect(mockLogger.info).toHaveBeenCalledWith(`Fetching fresh details for resource: ${mockArgs.resourceId}`);
        expect(mockResourceCache.get(`resource-${mockArgs.resourceId}`)?.data.name).toBe('FreshVM');
    });
    
    it('should throw AzureMCPError if resourceClient is not initialized', async () => {
        mockContext.resourceClient = null;
        await expect(getResourceDetailsHandler(mockArgs, mockContext, mockAzureOperations, mockLogger, mockResourceCache))
            .rejects.toThrow(new AzureMCPError("Client not initialized", "NO_CLIENT"));
    });

    it('should throw AzureResourceError for invalid resource ID format', async () => {
        mockArgs.resourceId = '/subscriptions/subid/resourceGroups/rg'; // Invalid format
        
        await expect(getResourceDetailsHandler(mockArgs, mockContext, mockAzureOperations, mockLogger, mockResourceCache))
            .rejects.toThrow(new AzureResourceError("Invalid resource ID format"));
    });

    it('should throw AzureResourceError if azureOperations.getResource fails', async () => {
        const error = new Error("Azure SDK Error");
        mockAzureOperations.getResource.mockRejectedValue(error);

        await expect(getResourceDetailsHandler(mockArgs, mockContext, mockAzureOperations, mockLogger, mockResourceCache))
            .rejects.toThrow(new AzureResourceError(`Failed to get resource details: ${error.message}`));
        expect(mockLogger.error).toHaveBeenCalledWith(`Error getting resource details: ${error.message}`, { error });
    });
    
    it('should correctly fetch and format resource details', async () => {
        const mockResource = { 
            id: mockArgs.resourceId, 
            name: 'vm1', 
            type: 'Microsoft.Compute/virtualMachines', 
            location: 'eastus',
            tags: { owner: 'test' },
            properties: { instanceView: {} }
        };
        mockAzureOperations.getResource.mockResolvedValue(mockResource);

        const result = await getResourceDetailsHandler(mockArgs, mockContext, mockAzureOperations, mockLogger, mockResourceCache);

        expect(mockAzureOperations.getResource).toHaveBeenCalledWith(mockArgs.resourceId);
        expect(result).toEqual({
            id: mockResource.id,
            name: mockResource.name,
            type: mockResource.type,
            location: mockResource.location,
            tags: mockResource.tags,
            properties: mockResource.properties
        });
        expect(mockResourceCache.get(`resource-${mockArgs.resourceId}`)?.data).toEqual(result);
    });
});
