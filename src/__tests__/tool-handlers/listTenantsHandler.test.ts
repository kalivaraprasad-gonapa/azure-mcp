// src/__tests__/tool-handlers/listTenantsHandler.test.ts
import { listTenantsHandler } from '../../tool-handlers/listTenantsHandler';
import { AzureAuthenticationError } from '../../AzureServer';
import LoggerService from '../../LoggerService';
import { DefaultAzureCredential } from '@azure/identity';
import { SubscriptionClient } from '@azure/arm-subscriptions';

jest.mock('../../LoggerService');
jest.mock('@azure/identity');
jest.mock('@azure/arm-subscriptions');

describe('listTenantsHandler', () => {
    let mockLogger: jest.Mocked<typeof LoggerService>;
    let mockExecuteWithRetry: jest.Mock;
    let mockSubscriptionClientInstance: jest.Mocked<SubscriptionClient>;

    // Helper to create mock PagedAsyncIterableIterator
    const createMockIterator = (items: any[]) => ({
        [Symbol.asyncIterator]: async function* () {
            for (const item of items) {
                yield item;
            }
        }
    });

    beforeEach(() => {
        mockLogger = LoggerService as jest.Mocked<typeof LoggerService>;
        mockExecuteWithRetry = jest.fn(operation => operation()); // Simple pass-through

        // Mock SubscriptionClient and its methods
        mockSubscriptionClientInstance = {
            tenants: { list: jest.fn() },
            subscriptions: { list: jest.fn() }
        } as unknown as jest.Mocked<SubscriptionClient>;

        (SubscriptionClient as jest.Mock).mockReturnValue(mockSubscriptionClientInstance);
        (DefaultAzureCredential as jest.Mock).mockClear();
        (SubscriptionClient as jest.Mock).mockClear();
    });

    it('should return tenants and subscriptions successfully', async () => {
        const mockTenantsList = [{ tenantId: 'tenant1', displayName: 'Tenant 1' }];
        const mockSubscriptionsList = [{ subscriptionId: 'sub1', displayName: 'Subscription 1', state: 'Enabled' }];

        (mockSubscriptionClientInstance.tenants.list as jest.Mock).mockReturnValue(createMockIterator(mockTenantsList));
        (mockSubscriptionClientInstance.subscriptions.list as jest.Mock).mockReturnValue(createMockIterator(mockSubscriptionsList));
        
        const result = await listTenantsHandler(mockLogger, mockExecuteWithRetry);

        expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
        expect(SubscriptionClient).toHaveBeenCalledWith(expect.any(DefaultAzureCredential));
        expect(mockExecuteWithRetry).toHaveBeenCalledTimes(2);
        expect(result.tenants).toEqual(mockTenantsList);
        expect(result.subscriptions).toEqual(mockSubscriptionsList);
    });

    it('should throw AzureAuthenticationError if listing tenants fails', async () => {
        const error = new Error("Failed to list tenants");
        // Make the first executeWithRetry call (for tenants) fail
        mockExecuteWithRetry.mockImplementationOnce(async (op) => { throw error; });
        
        await expect(listTenantsHandler(mockLogger, mockExecuteWithRetry))
            .rejects.toThrow(new AzureAuthenticationError(`Failed to list tenants and subscriptions: ${error.message}`));
        expect(mockLogger.error).toHaveBeenCalledWith(`Error listing tenants: ${error.message}`, { error });
    });

    it('should throw AzureAuthenticationError if listing subscriptions fails', async () => {
        const mockTenantsList = [{ tenantId: 'tenant1', displayName: 'Tenant 1' }];
        (mockSubscriptionClientInstance.tenants.list as jest.Mock).mockReturnValue(createMockIterator(mockTenantsList));
        
        const error = new Error("Failed to list subscriptions");
        // Make the second executeWithRetry call (for subscriptions) fail
        mockExecuteWithRetry.mockImplementationOnce(op => op()) // tenants succeed
                           .mockImplementationOnce(async (op) => { throw error; }); // subscriptions fail

        await expect(listTenantsHandler(mockLogger, mockExecuteWithRetry))
            .rejects.toThrow(new AzureAuthenticationError(`Failed to list tenants and subscriptions: ${error.message}`));
        expect(mockLogger.error).toHaveBeenCalledWith(`Error listing tenants: ${error.message}`, { error });
    });
});
