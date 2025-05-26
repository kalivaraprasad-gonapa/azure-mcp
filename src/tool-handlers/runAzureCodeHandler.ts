// src/tool-handlers/runAzureCodeHandler.ts
import { createContext, runInContext } from "node:vm";
import { RunAzureCodeSchema } from "../schemas.js";
import { AzureMCPError, ServerContext } from "../AzureServer.js";
import { AzureOperations } from "../AzureOperations.js";
import LoggerServiceInstance from "../LoggerService.js"; // Assuming LoggerService is a singleton instance

/**
 * @async
 * @function runAzureCodeHandler
 * @description Handles the "run-azure-code" tool request. It prepares the context,
 * initializes clients if necessary, wraps and executes user-provided Azure SDK code in a sandboxed VM.
 * @param {any} args - Arguments from the tool call, expected to match RunAzureCodeSchema.
 * @param {ServerContext} serverContext - The main server context, which can be mutated by client initialization.
 * @param {AzureOperations} azureOperations - An instance of AzureOperations for the sandboxed code to use.
 * @param {typeof LoggerServiceInstance} logger - Logger instance for logging messages.
 * @param {function(string, string): Promise<void>} initializeClients - Async function to initialize Azure clients.
 * @param {function(string): string} wrapUserCode - Function to wrap user code for safe execution.
 * @param {function<T>(function(): Promise<T>, number=): Promise<T>} executeWithRetry - Function to execute an operation with retries.
 * @returns {Promise<any>} A promise that resolves to the result of the executed code.
 * @throws {AzureMCPError} If tenant/subscription checks fail, clients are not initialized, or code execution fails.
 * @throws {z.ZodError} If the provided arguments do not match RunAzureCodeSchema.
 */
export async function runAzureCodeHandler(
    args: any,
    serverContext: ServerContext, // The main server context, mutable
    azureOperations: AzureOperations,
    logger: typeof LoggerServiceInstance,
    initializeClients: (tenantId: string, subscriptionId: string) => Promise<void>,
    wrapUserCode: (userCode: string) => string,
    executeWithRetry: <T>(operation: () => Promise<T>, retries?: number) => Promise<T>
) {
    const { code, tenantId, subscriptionId } = RunAzureCodeSchema.parse(args);

    if (!serverContext.selectedTenant && !tenantId) {
        throw new AzureMCPError(
            "Please select a tenant first using the 'select-tenant' tool!",
            "NO_TENANT"
        );
    }

    // This will modify the serverContext by reference
    if (tenantId && subscriptionId) {
        await initializeClients(tenantId, subscriptionId);
    }

    if (!serverContext.resourceClient || !serverContext.subscriptionClient) {
        throw new AzureMCPError(
            "Clients not initialized",
            "NO_CLIENTS"
        );
    }

    const wrappedCode = wrapUserCode(code);
    const wrappedIIFECode = `(async function() { return (async () => { ${wrappedCode} })(); })()`;

    // Create a new context for vm.runInContext, exposing only azureOperations
    const executionContext = createContext({
        azureOperations: azureOperations,
        // Note: serverContext.resourceClient and serverContext.subscriptionClient are not directly exposed here.
        // The executed code should use azureOperations.
    });

    try {
        const result = await executeWithRetry(() =>
            runInContext(wrappedIIFECode, executionContext)
        );
        return result; // Return raw result, createTextResponse will be called in AzureMCPServer
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error executing user code: ${errorMessage}`, { error });
        throw new AzureMCPError(
            `Failed to execute code: ${errorMessage}`,
            "CODE_EXECUTION_FAILED"
        );
    }
}
