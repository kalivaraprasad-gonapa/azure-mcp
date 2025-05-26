// src/tool-handlers/createResourceGroupHandler.ts
import { AzureMCPError, AzureResourceError, ServerContext } from "../AzureServer.js";
import { AzureOperations } from "../AzureOperations.js";
import LoggerServiceInstance from "../LoggerService.js"; // Renamed to avoid conflict with type
import { CreateResourceGroupSchema } from "../schemas.js";

/**
 * @async
 * @function createResourceGroupHandler
 * @description Handles the "create-resource-group" tool request. It creates a new resource group
 * and invalidates the resource group list cache.
 * @param {any} args - Arguments from the tool call, expected to match CreateResourceGroupSchema.
 * @param {ServerContext} context - The server context, containing Azure client information.
 * @param {AzureOperations} azureOperations - An instance of AzureOperations for interacting with Azure.
 * @param {typeof LoggerServiceInstance} logger - Logger instance for logging messages.
 * @param {Map<string, any>} resourceCache - A Map instance used for caching, to invalidate entries.
 * @returns {Promise<object>} A promise that resolves to an object containing details of the created resource group.
 * @throws {AzureMCPError} If the Azure client is not initialized.
 * @throws {AzureResourceError} If creating the resource group fails.
 * @throws {z.ZodError} If the provided arguments do not match CreateResourceGroupSchema.
 */
export async function createResourceGroupHandler(
    args: any, // Arguments from the tool call
    context: ServerContext,
    azureOperations: AzureOperations,
    logger: typeof LoggerServiceInstance, // Use the type of the imported instance
    resourceCache: Map<string, any> // The actual cache instance
) {
    const { name, location, tags } = CreateResourceGroupSchema.parse(args);

    if (!context.resourceClient) { // Direct check on context
        throw new AzureMCPError("Client not initialized", "NO_CLIENT");
    }
    try {
        const result = await azureOperations.createResourceGroup(name, location, tags);
        
        // Invalidate cache for resource groups list
        if (context.selectedSubscription) { // Ensure selectedSubscription is available
            resourceCache.delete(`resource-groups-${context.selectedSubscription}`);
            logger.info(`Invalidated cache for resource groups in subscription: ${context.selectedSubscription}`);
        } else {
            logger.warning("No selected subscription found in context; cannot invalidate resource group cache by subscription.");
        }

        return {
            id: result.id,
            name: result.name,
            location: result.location,
            tags: result.tags || {},
            provisioningState: result.properties?.provisioningState
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error creating resource group: ${errorMessage}`, { error });
        // Ensure AzureResourceError is used as per original logic for this specific error type
        throw new AzureResourceError(`Failed to create resource group: ${errorMessage}`);
    }
}
