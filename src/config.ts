import path from 'path'; // Import path module

/**
 * @function parseEnvInt
 * @description Parses an environment variable string value to an integer.
 * If the value is undefined, empty, or not a valid number, it returns a default value.
 * @param {string | undefined} value - The environment variable string value.
 * @param {number} defaultValue - The default value to return if parsing fails.
 * @returns {number} The parsed integer or the default value.
 */
export function parseEnvInt(value: string | undefined, defaultValue: number): number {
    const parsed = parseInt(value || '', 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * @const codePrompt
 * @description Template string defining rules and expectations for generating Azure SDK JavaScript code.
 * This prompt is used to guide the AI in producing valid and safe code for execution.
 */
// Code prompt template for Azure SDK code generation
export const codePrompt = `Your job is to answer questions about Azure environment by writing Javascript code using Azure SDK. The code must adhere to a few rules:
- Use the provided client instances: 'resourceClient' for ResourceManagementClient and 'subscriptionClient' for SubscriptionClient
- DO NOT create new client instances or import Azure SDK packages
- Use async/await and promises
- Think step-by-step before writing the code
- Avoid hardcoded values like Resource IDs
- Handle errors gracefully
- Handle pagination correctly using for-await-of loops
- Data returned must be JSON containing only the minimal amount of data needed
- Code MUST "return" a value: string, number, boolean or JSON object`;

/**
 * @const CONFIG
 * @description Centralized configuration object for the Azure MCP Server.
 * It sources values from environment variables with sensible defaults.
 */
export const CONFIG = {
    SERVER_VERSION: process.env.SERVER_VERSION || "1.0.0",
    MAX_RETRIES: parseEnvInt(process.env.MAX_RETRIES || "3", 10),
    RETRY_DELAY_MS: parseEnvInt(process.env.RETRY_DELAY_MS || "1000", 10),
    LOG_LEVEL: process.env.LOG_LEVEL || "info", // This will be used by LoggerService
};

/**
 * @const LOG_DIR
 * @description Directory to store log files. Defaults to './logs' in the current working directory.
 */
export const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

/**
 * @const MCP_MODE
 * @description Flag to indicate if the server is running in strict MCP_MODE (affects logging).
 * Defaults to false.
 */
export const MCP_MODE = process.env.MCP_MODE === 'true';

/**
 * @const AZURE_CREDENTIALS
 * @description Object containing Azure service principal credentials.
 * Values are sourced from environment variables.
 */
export const AZURE_CREDENTIALS = {
    CLIENT_ID: process.env.AZURE_CLIENT_ID,
    CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
    TENANT_ID: process.env.AZURE_TENANT_ID
};