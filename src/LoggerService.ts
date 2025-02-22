import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

class LoggerService {
    private logger!: winston.Logger;
    private readonly logDir: string;
    private isMCPMode: boolean;

    constructor() {
        this.logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
        this.isMCPMode = process.env.MCP_MODE === 'true';

        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        this.initializeLogger();
    }

    private initializeLogger(): void {
        const logFormat = winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        );

        // File transports are always active
        const fileTransports = [
            new DailyRotateFile({
                dirname: this.logDir,
                filename: 'azure-mcp-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: logFormat
            }) as winston.transport,
            new DailyRotateFile({
                dirname: this.logDir,
                filename: 'azure-mcp-error-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '30d',
                level: 'error',
                format: logFormat
            }) as winston.transport
        ];

        // In MCP mode, we only log to files and stderr
        // In non-MCP mode, we can use console transport
        const transports = this.isMCPMode ? fileTransports : [
            ...fileTransports,
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.uncolorize(),
                    // winston.format.printf(({ level, message }) => {
                    //     return `[${level.toUpperCase()}]: ${message}`;
                    // })
                ),
                stderrLevels: ['error', 'warn', 'info'] // Send ALL console output to stderr
            })
        ];

        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: logFormat,
            exitOnError: false,
            handleExceptions: true,
            handleRejections: true,
            transports: transports.map(transport => {
                if (this.isMCPMode && transport instanceof winston.transports.Console) {
                    // Configure console transport to use stderr
                    transport.stderrLevels = ['error', 'warn', 'info', 'debug'];
                }
                return transport;
            })
        });
    }

    private formatMessage(message: string, meta?: any): string {
        try {
            const metaStr = meta ? (typeof meta === 'object' ? JSON.stringify(meta) : String(meta)) : '';
            return `${message}${metaStr ? ' ' + metaStr : ''}`.trim();
        } catch (error) {
            return message;
        }
    }

    private logToStderr(level: string, message: string): void {
        // In MCP mode, all console output MUST go to stderr
        if (this.isMCPMode) {
            const timestamp = new Date().toISOString();
            process.stderr.write(`[${timestamp}] [${level.toUpperCase()}]: ${message}\n`);
        }
    }

    public info(message: string, meta?: any): void {
        const formattedMessage = this.formatMessage(message, meta);
        this.logToStderr('info', formattedMessage);
        this.logger.info(formattedMessage);
    }

    public error(message: string, meta?: any): void {
        const formattedMessage = this.formatMessage(message, meta);
        this.logToStderr('error', formattedMessage);
        this.logger.error(formattedMessage);
    }

    public warning(message: string, meta?: any): void {
        const formattedMessage = this.formatMessage(message, meta);
        this.logToStderr('warn', formattedMessage);
        this.logger.warn(formattedMessage);
    }
}

// Export a singleton instance
export default new LoggerService();