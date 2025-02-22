// // src/__tests__/AzureServer.test.ts

// import { AzureMCPServer, AzureMCPError } from '../AzureServer';
// import { DefaultAzureCredential } from '@azure/identity';
// import { ResourceManagementClient } from '@azure/arm-resources';
// import { SubscriptionClient } from '@azure/arm-subscriptions';
// import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// import LoggerService from '../LoggerService';

// // Mock the Azure SDK classes
// jest.mock('@azure/identity');
// jest.mock('@azure/arm-resources');
// jest.mock('@azure/arm-subscriptions');
// jest.mock('@modelcontextprotocol/sdk/server/index.js');
// jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
// jest.mock('../LoggerService');

// describe('AzureMCPServer', () => {
//     let server: AzureMCPServer;

//     beforeEach(() => {
//         // Clear all mocks
//         jest.clearAllMocks();

//         // Initialize server
//         server = new AzureMCPServer();
//     });

//     describe('constructor', () => {
//         it('should initialize with correct default values', () => {
//             expect(server).toBeInstanceOf(AzureMCPServer);
//             expect(Server).toHaveBeenCalledWith(
//                 {
//                     name: 'azure-mcp',
//                     version: '1.0.0',
//                 },
//                 {
//                     capabilities: {
//                         tools: {},
//                     },
//                 }
//             );
//         });
//     });

//     describe('handleListTools', () => {
//         it('should return the correct list of tools', async () => {
//             const tools = await server['handleListTools']();
//             expect(tools).toHaveProperty('tools');
//             expect(tools.tools).toHaveLength(3);
//             expect(tools.tools.map(t => t.name)).toEqual([
//                 'run-azure-code',
//                 'list-tenants',
//                 'select-tenant'
//             ]);
//         });
//     });

//     describe('handleCallTool', () => {
//         it('should handle unknown tool errors', async () => {
//             const request = {
//                 params: {
//                     name: 'unknown-tool',
//                     arguments: {}
//                 },
//                 method: 'tools/call'  // Added missing method property
//             };

//             await expect(server['handleCallTool'](request))
//                 .resolves
//                 .toMatchObject({
//                     content: [{
//                         type: 'text',
//                         text: expect.stringContaining('Unknown tool')
//                     }]
//                 });
//         });
//     });

//     describe('handleRunAzureCode', () => {
//         it('should throw error when no tenant is selected', async () => {
//             const args = {
//                 reasoning: 'test',
//                 code: 'return true;'
//             };

//             await expect(server['handleRunAzureCode'](args))
//                 .resolves
//                 .toMatchObject({
//                     content: [{
//                         type: 'text',
//                         text: expect.stringContaining('Please select a tenant first')
//                     }]
//                 });
//         });

//         it('should execute valid code successfully', async () => {
//             // Mock tenant selection
//             await server['initializeClients']('test-tenant', 'test-subscription');

//             const args = {
//                 reasoning: 'test',
//                 code: 'return { success: true };',
//                 tenantId: 'test-tenant',
//                 subscriptionId: 'test-subscription'
//             };

//             const result = await server['handleRunAzureCode'](args);
//             expect(result.content[0].text).toContain('success');
//         });
//     });

//     describe('handleListTenants', () => {
//         it('should return formatted tenant and subscription list', async () => {
//             const mockTenants = [
//                 { tenantId: 'tenant1', displayName: 'Tenant 1' }
//             ];
//             const mockSubscriptions = [
//                 { subscriptionId: 'sub1', displayName: 'Sub 1', state: 'Enabled' }
//             ];

//             // Create mock PagedAsyncIterableIterator
//             const createMockIterator = (items: any) => ({
//                 next: async () => ({ value: items[0], done: false }),
//                 [Symbol.asyncIterator]: async function* () {
//                     yield* items;
//                 },
//                 byPage: () => ({
//                     next: async () => ({ value: items, done: false }),
//                     [Symbol.asyncIterator]: async function* () {
//                         yield items;
//                     }
//                 })
//             });

//             // Updated mock implementations
//             jest.spyOn(SubscriptionClient.prototype, 'tenants', 'get')
//                 .mockReturnValue({ list: () => createMockIterator(mockTenants) });
//             jest.spyOn(SubscriptionClient.prototype, 'subscriptions', 'get')
//                 .mockReturnValue({ list: () => createMockIterator(mockSubscriptions) });

//             const result = await server['handleListTenants']();
//             const parsed = JSON.parse(result.content[0].text);

//             expect(parsed).toHaveProperty('tenants');
//             expect(parsed).toHaveProperty('subscriptions');
//             expect(parsed.tenants).toHaveLength(1);
//             expect(parsed.subscriptions).toHaveLength(1);
//         });
//     });

//     describe('error handling', () => {
//         it('should handle Azure SDK errors gracefully', async () => {
//             jest.spyOn(DefaultAzureCredential.prototype, 'getToken')
//                 .mockRejectedValue(new Error('Azure SDK Error'));

//             await expect(server['initializeClients']('test-tenant', 'test-subscription'))
//                 .rejects
//                 .toThrow(AzureMCPError);
//         });

//         it('should implement retry logic for transient failures', async () => {
//             const mockOperation = jest.fn()
//                 .mockRejectedValueOnce(new Error('Transient error'))
//                 .mockResolvedValueOnce({ success: true });

//             const result = await server['executeWithRetry'](mockOperation);
//             expect(mockOperation).toHaveBeenCalledTimes(2);
//             expect(result).toEqual({ success: true });
//         });
//     });
// });

// // src/__tests__/LoggerService.test.ts
// // import LoggerService from '../LoggerService';

// // describe('LoggerService', () => {
// //     let logSpy: jest.SpyInstance;
// //     let errorSpy: jest.SpyInstance;
// //     let warnSpy: jest.SpyInstance;

// //     beforeEach(() => {
// //         // Use spyOn instead of mocking console methods
// //         logSpy = jest.spyOn(LoggerService['logger'], 'info');
// //         errorSpy = jest.spyOn(LoggerService['logger'], 'error');
// //         warnSpy = jest.spyOn(LoggerService['logger'], 'warn');
// //     });

// //     afterEach(() => {
// //         logSpy.mockRestore();
// //         errorSpy.mockRestore();
// //         warnSpy.mockRestore();
// //     });

// //     it('should log info messages correctly', () => {
// //         LoggerService.info('Test info message');
// //         expect(logSpy).toHaveBeenCalledWith('[INFO]: Test info message');
// //     });

// //     it('should log error messages correctly', () => {
// //         LoggerService.error('Test error message');
// //         expect(errorSpy).toHaveBeenCalledWith('[ERROR]: Test error message');
// //     });

// //     it('should log warning messages correctly', () => {
// //         LoggerService.warning('Test warning message');
// //         expect(warnSpy).toHaveBeenCalledWith('[WARN]: Test warning message');
// //     });

// //     it('should handle objects in log messages', () => {
// //         const testObject = { key: 'value' };
// //         LoggerService.info('Test message with object', testObject);
// //         expect(logSpy).toHaveBeenCalledWith('[INFO]: Test message with object', testObject);
// //     });
// // });
