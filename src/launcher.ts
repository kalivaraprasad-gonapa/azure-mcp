import { AzureMCPServer } from './AzureServer';
import LoggerService from './LoggerService';

async function startServer() {
    try {
        LoggerService.info("Starting Azure MCP Server...");
        const server = new AzureMCPServer();
        await server.start();
        LoggerService.info("Server started successfully!");

        // Handle graceful shutdown
        process.on('SIGTERM', async () => {
            LoggerService.info("Received SIGTERM signal. Shutting down...");
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            LoggerService.info("Received SIGINT signal. Shutting down...");
            process.exit(0);
        });

    } catch (error) {
        LoggerService.error(`Failed to start server: ${error}`);
        process.exit(1);
    }
}

// Start the server
startServer();