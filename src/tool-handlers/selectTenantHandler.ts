// src/tool-handlers/selectTenantHandler.ts
import { SelectTenantSchema } from "../schemas.js";
import LoggerServiceInstance from "../LoggerService.js"; // Renamed to avoid conflict with type

/**
 * @async
 * @function selectTenantHandler
 * @description Handles the "select-tenant" tool request. It parses arguments,
 * initializes Azure clients for the selected tenant and subscription, and returns a success message.
 * @param {any} args - Arguments from the tool call, expected to match SelectTenantSchema.
 * @param {typeof LoggerServiceInstance} logger - Logger instance for logging messages.
 * @param {function(string, string): Promise<void>} initializeClients - Async function to initialize Azure clients.
 * @returns {Promise<string>} A promise that resolves to a success message string.
 * @throws {z.ZodError} If the provided arguments do not match SelectTenantSchema.
 */
export async function selectTenantHandler(
    args: any,
    logger: typeof LoggerServiceInstance, // Use the type of the imported instance
    initializeClients: (tenantId: string, subscriptionId: string) => Promise<void>
) {
    const { tenantId, subscriptionId } = SelectTenantSchema.parse(args);
    await initializeClients(tenantId, subscriptionId);
    // The original handler returned a string "Tenant and subscription selected! Clients initialized."
    // This will be wrapped by createTextResponse in AzureMCPServer.ts
    return "Tenant and subscription selected! Clients initialized.";
}
