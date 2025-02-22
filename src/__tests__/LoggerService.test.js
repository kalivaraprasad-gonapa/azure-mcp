"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const LoggerService_1 = __importDefault(require("../LoggerService"));
describe('LoggerService', () => {
    const originalConsole = { ...console };
    beforeEach(() => {
        console.log = jest.fn();
        console.error = jest.fn();
        console.warn = jest.fn();
    });
    afterEach(() => {
        console = { ...originalConsole };
    });
    it('should log info messages correctly', () => {
        LoggerService_1.default.info('Test info message');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[info] Test info message'));
    });
    it('should log error messages correctly', () => {
        LoggerService_1.default.error('Test error message');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[error] Test error message'));
    });
    it('should log warning messages correctly', () => {
        LoggerService_1.default.warning('Test warning message');
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[warn] Test warning message'));
    });
    it('should handle objects in log messages', () => {
        const testObject = { key: 'value' };
        LoggerService_1.default.info('Test message with object', testObject);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[info] Test message with object'), testObject);
    });
});
