// src/__tests__/tool-handlers/listResourceGroupsHandler.test.ts
import { listResourceGroupsHandler } from '../../tool-handlers/listResourceGroupsHandler';
import { AzureMCPError, AzureResourceError, ServerContext } from '../../AzureServer';
import { AzureOperations } from '../../AzureOperations';
import LoggerService from '../../LoggerService';

jest.mock('../../AzureOperations');
jest.mock('../../LoggerService');

describe('listResourceGroupsHandler', () => {
    let mockContext: jest.Mocked<ServerContext>;
    let mockAzureOperations: jest.Mocked<AzureOperations>;
    let mockLogger: jest.Mocked<typeof LoggerService>;
    let mockResourceCache: Map<string, any>;

    beforeEach(() => {
        mockContext = {
            resourceClient: {} as any, // Mocked, not null
            subscriptionClient: {} as any,
            credentials: {} as any,
            selectedTenant: 'test-tenant',
            selectedSubscription: 'test-subscription',
            apiVersion: '2023-01-01'
        } as jest.Mocked<ServerContext>;

        // Ensure AzureOperations is correctly typed for jest.Mocked
        mockAzureOperations = new (AzureOperations as jest.Mock<typeof AzureOperations>)(mockContext, LoggerService) as jest.Mocked<AzureOperations>;
        mockLogger = LoggerService as jest.Mocked<typeof LoggerService>;
        mockResourceCache = new Map<string, any>();
    });

    it('should return cached data if valid cache exists', async () => {
        const cachedData = [{ id: 'rg1', name: 'CachedRG' }];
        mockResourceCache.set('resource-groups-test-subscription', {
            data: cachedData,
            timestamp: Date.now()
        });

        const result = await listResourceGroupsHandler(mockContext, mockAzureOperations, mockLogger, mockResourceCache);
        expect(result).toEqual(cachedData);
        expect(mockAzureOperations.listResourceGroups).not.toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith('Returning cached resource groups for subscription: test-subscription');
    });

    it('should fetch fresh data if cache is expired', async () => {
        const cachedData = [{ id: 'rg1', name: 'ExpiredRG' }];
        mockResourceCache.set('resource-groups-test-subscription', {
            data: cachedData,
            timestamp: Date.now() - 60000 // 60 seconds ago, default TTL is 30s
        });
        const freshData = [{ id: 'rg2', name: 'FreshRG' }];
        mockAzureOperations.listResourceGroups.mockResolvedValue(freshData);

        const result = await listResourceGroupsHandler(mockContext, mockAzureOperations, mockLogger, mockResourceCache);
        expect(result).toEqual(freshData);
        expect(mockAzureOperations.listResourceGroups).toHaveBeenCalledTimes(1);
        expect(mockLogger.info).toHaveBeenCalledWith('Fetching fresh resource groups for subscription: test-subscription');
        expect(mockResourceCache.get('resource-groups-test-subscription')?.data).toEqual(freshData);
    });
    
    it('should fetch fresh data if cache does not exist', async () => {
        const freshData = [{ id: 'rg3', name: 'NoCacheRG' }];
        mockAzureOperations.listResourceGroups.mockResolvedValue(freshData);

        const result = await listResourceGroupsHandler(mockContext, mockAzureOperations, mockLogger, mockResourceCache);
        expect(result).toEqual(freshData);
        expect(mockAzureOperations.listResourceGroups).toHaveBeenCalledTimes(1);
        expect(mockLogger.info).toHaveBeenCalledWith('Fetching fresh resource groups for subscription: test-subscription');
        expect(mockResourceCache.get('resource-groups-test-subscription')?.data).toEqual(freshData);
    });

    it('should throw AzureMCPError if resourceClient is not initialized', async () => {
        mockContext.resourceClient = null;
        await expect(listResourceGroupsHandler(mockContext, mockAzureOperations, mockLogger, mockResourceCache))
            .rejects.toThrow(new AzureMCPError("Client not initialized", "NO_CLIENT"));
    });

    it('should throw AzureResourceError if azureOperations.listResourceGroups fails', async () => {
        const error = new Error("Azure SDK Error");
        mockAzureOperations.listResourceGroups.mockRejectedValue(error);

        await expect(listResourceGroupsHandler(mockContext, mockAzureOperations, mockLogger, mockResourceCache))
            .rejects.toThrow(new AzureResourceError(`Failed to list resource groups: ${error.message}`));
        expect(mockLogger.error).toHaveBeenCalledWith(`Error listing resource groups: ${error.message}`, { error });
    });
});
