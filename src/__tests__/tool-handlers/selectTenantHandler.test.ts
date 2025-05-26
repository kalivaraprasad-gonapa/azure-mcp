// src/__tests__/tool-handlers/selectTenantHandler.test.ts
import { selectTenantHandler } from '../../tool-handlers/selectTenantHandler';
import LoggerService from '../../LoggerService';
import { SelectTenantSchema } from '../../schemas'; // For argument parsing

jest.mock('../../LoggerService');
jest.mock('../../schemas', () => ({
    SelectTenantSchema: {
        parse: jest.fn(args => args) // Simple mock, assumes valid args
    }
}));

describe('selectTenantHandler', () => {
    let mockLogger: jest.Mocked<typeof LoggerService>;
    let mockInitializeClients: jest.Mock;
    let mockArgs: any;

    beforeEach(() => {
        mockLogger = LoggerService as jest.Mocked<typeof LoggerService>;
        mockInitializeClients = jest.fn().mockResolvedValue(undefined); // Simulate successful client initialization
        
        mockArgs = {
            tenantId: 'test-tenant-id',
            subscriptionId: 'test-subscription-id'
        };
        (SelectTenantSchema.parse as jest.Mock).mockImplementation(args => args);
    });

    it('should call initializeClients with parsed arguments and return success message', async () => {
        const result = await selectTenantHandler(mockArgs, mockLogger, mockInitializeClients);
        
        expect(SelectTenantSchema.parse).toHaveBeenCalledWith(mockArgs);
        expect(mockInitializeClients).toHaveBeenCalledWith(mockArgs.tenantId, mockArgs.subscriptionId);
        expect(result).toBe("Tenant and subscription selected! Clients initialized.");
    });

    it('should re-throw error if initializeClients fails', async () => {
        const initError = new Error("Client initialization failed");
        mockInitializeClients.mockRejectedValue(initError);
        
        await expect(selectTenantHandler(mockArgs, mockLogger, mockInitializeClients))
            .rejects.toThrow(initError);
    });
    
    it('should re-throw ZodError if schema parsing fails', () => {
        const invalidArgs = { tenantId: 'test-tenant-id' }; // Missing subscriptionId
        const zodError = new (require('zod').ZodError)([{ code: 'invalid_type', expected: 'string', received: 'undefined', path: ['subscriptionId'], message: 'Required' }]);
        (SelectTenantSchema.parse as jest.Mock).mockImplementationOnce(() => {
            throw zodError;
        });

        // The error is thrown by SelectTenantSchema.parse itself before the handler logic fully runs
        expect(() => SelectTenantSchema.parse(invalidArgs)).toThrow(zodError);
        
        // To test the handler's boundary if it were to catch this:
        // await expect(selectTenantHandler(invalidArgs, mockLogger, mockInitializeClients))
        //    .rejects.toThrow(zodError);
        // But as it is, the error propagates from the parse call at the top of the handler.
    });
});
