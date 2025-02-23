
// import LoggerService from '../LoggerService';

// describe('LoggerService', () => {
//     const originalConsole = { ...console };
//     beforeEach(() => {
//         // Mock console methods
//         console.log = jest.fn();
//         console.error = jest.fn();
//         console.warn = jest.fn();
//     });

//     afterEach(() => {
//         // Restore console methods
//         console = { ...originalConsole };
//     });

//     it('should log info messages correctly', () => {
//         LoggerService.info('Test info message');
//         expect(console.log).toHaveBeenCalledWith(
//             expect.stringContaining('[info] Test info message')
//         );
//     });

//     it('should log error messages correctly', () => {
//         LoggerService.error('Test error message');
//         expect(console.error).toHaveBeenCalledWith(
//             expect.stringContaining('[error] Test error message')
//         );
//     });

//     it('should log warning messages correctly', () => {
//         LoggerService.warning('Test warning message');
//         expect(console.warn).toHaveBeenCalledWith(
//             expect.stringContaining('[warn] Test warning message')
//         );
//     });

//     it('should handle objects in log messages', () => {
//         const testObject = { key: 'value' };
//         LoggerService.info('Test message with object', testObject);
//         expect(console.log).toHaveBeenCalledWith(
//             expect.stringContaining('[info] Test message with object'),
//             testObject
//         );
//     });
// });