
// src/__tests__/LoggerService.test.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';

// Mock config before importing LoggerService
const mockLogDir = path.join(__dirname, 'test-logs'); // Use a test-specific log directory
jest.mock('../config.js', () => ({
    __esModule: true, // This is important for ES modules
    LOG_DIR: mockLogDir,
    MCP_MODE: false, // Default to non-MCP mode for console tests
    CONFIG: {
        LOG_LEVEL: 'debug', // Use a specific level for testing
    },
    // Mock other exports from config.js as needed by LoggerService or its imports
    codePrompt: '', 
    AZURE_CREDENTIALS: {},
    parseEnvInt: jest.fn(),
}));

// Now import LoggerService - it will use the mocked config
import LoggerService from '../LoggerService';

// Mock winston and DailyRotateFile to inspect calls without actual file I/O or console output
jest.mock('winston', () => {
    const mFormat = {
        combine: jest.fn(() => 'combined-format'), // Return a dummy value
        timestamp: jest.fn(() => 'timestamp-format'),
        json: jest.fn(() => 'json-format'),
        uncolorize: jest.fn(() => 'uncolorize-format'),
    };
    const mTransports = {
        Console: jest.fn(),
        File: jest.fn(), 
    };
    const mLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    };
    return {
        format: mFormat,
        transports: mTransports,
        createLogger: jest.fn(() => mLogger),
    };
});
jest.mock('winston-daily-rotate-file');
jest.mock('fs', () => ({
    ...jest.requireActual('fs'), 
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
}));

describe('LoggerService', () => {
    let loggerInstance: winston.Logger; 

    beforeEach(() => {
        jest.clearAllMocks();
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        // LoggerService is a singleton, its constructor runs on first import.
        // We get the mock logger instance that was created.
        loggerInstance = (winston.createLogger as jest.Mock).mock.results[0]?.value || (winston.createLogger as jest.Mock)();
    });

    it('should create log directory if it does not exist on initialization', () => {
        // This test relies on the mock setup during the initial import of LoggerService.
        // If LoggerService was not a singleton, we would instantiate it here.
        expect(fs.existsSync).toHaveBeenCalledWith(mockLogDir);
        expect(fs.mkdirSync).toHaveBeenCalledWith(mockLogDir, { recursive: true });
    });

    it('should initialize winston.createLogger with correct parameters', () => {
        expect(winston.createLogger).toHaveBeenCalledWith(expect.objectContaining({
            level: 'debug', // From mocked CONFIG.LOG_LEVEL
            format: 'combined-format', // From mocked winston.format.combine
            exitOnError: false,
            handleExceptions: true,
            handleRejections: true,
            transports: expect.any(Array),
        }));
    });
    
    it('should configure file and console transports correctly in non-MCP_MODE', () => {
        const createLoggerArgs = (winston.createLogger as jest.Mock).mock.calls[0][0];
        expect(createLoggerArgs.transports.length).toBe(3); // 2 file, 1 console
        expect(DailyRotateFile).toHaveBeenCalledTimes(2);
        expect(winston.transports.Console).toHaveBeenCalledTimes(1);
        expect(DailyRotateFile).toHaveBeenCalledWith(expect.objectContaining({
            dirname: mockLogDir,
            filename: 'azure-mcp-%DATE%.log',
        }));
        expect(DailyRotateFile).toHaveBeenCalledWith(expect.objectContaining({
            dirname: mockLogDir,
            filename: 'azure-mcp-error-%DATE%.log',
            level: 'error',
        }));
        expect(winston.transports.Console).toHaveBeenCalledWith(expect.objectContaining({
            format: 'uncolorize-format', // from mocked winston.format.combine(winston.format.uncolorize())
            stderrLevels: ['error', 'warn', 'info'],
        }));
    });
    
    describe('logToStderr', () => {
        let stderrSpy: jest.SpyInstance;
        const originalIsMCPMode = LoggerService['isMCPMode']; // Backup original value

        beforeEach(() => {
            stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
        });
        afterEach(() => {
            stderrSpy.mockRestore();
            LoggerService['isMCPMode'] = originalIsMCPMode; // Restore
        });

        it('should write to stderr if isMCPMode is true', () => {
            LoggerService['isMCPMode'] = true;
            (LoggerService as any)['logToStderr']('INFO', 'Test stderr direct');
            expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]: Test stderr direct\n'));
        });

        it('should not write to stderr if isMCPMode is false', () => {
            LoggerService['isMCPMode'] = false;
            (LoggerService as any)['logToStderr']('INFO', 'Test stderr direct non-mcp');
            expect(stderrSpy).not.toHaveBeenCalled();
        });
    });

    it('info method logs message via winston logger and calls logToStderr', () => {
        const stderrLogSpy = jest.spyOn(LoggerService as any, 'logToStderr');
        LoggerService.info('Test info', { data: 'payload' });
        expect(stderrLogSpy).toHaveBeenCalledWith('info', 'Test info {"data":"payload"}');
        expect(loggerInstance.info).toHaveBeenCalledWith('Test info {"data":"payload"}');
        stderrLogSpy.mockRestore();
    });

    it('error method logs message via winston logger and calls logToStderr', () => {
        const stderrLogSpy = jest.spyOn(LoggerService as any, 'logToStderr');
        LoggerService.error('Test error', { error: 'detail' });
        expect(stderrLogSpy).toHaveBeenCalledWith('error', 'Test error {"error":"detail"}');
        expect(loggerInstance.error).toHaveBeenCalledWith('Test error {"error":"detail"}');
        stderrLogSpy.mockRestore();
    });

    it('warning method logs message via winston logger and calls logToStderr', () => {
        const stderrLogSpy = jest.spyOn(LoggerService as any, 'logToStderr');
        LoggerService.warning('Test warning');
        expect(stderrLogSpy).toHaveBeenCalledWith('warn', 'Test warning');
        expect(loggerInstance.warn).toHaveBeenCalledWith('Test warning');
        stderrLogSpy.mockRestore();
    });
    
    it('formatMessage should handle string and object meta correctly', () => {
        expect((LoggerService as any)['formatMessage']('Base message', { key: 'val' })).toBe('Base message {"key":"val"}');
        expect((LoggerService as any)['formatMessage']('Base message', 'string meta')).toBe('Base message string meta');
        expect((LoggerService as any)['formatMessage']('Base message')).toBe('Base message');
    });
});