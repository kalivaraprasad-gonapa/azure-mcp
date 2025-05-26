// src/tool-handlers/listResourceGroupsHandler.ts
import { AzureMCPError, AzureResourceError, ServerContext } from "../AzureServer.js";
import { AzureOperations } from "../AzureOperations.js";
import LoggerServiceInstance from "../LoggerService.js"; // Renamed to avoid conflict with type

/**
 * @async
 * @function listResourceGroupsHandler
 * @description Handles the "list-resource-groups" tool request. It retrieves resource groups,
 * utilizing a cache to optimize performance.
 * @param {ServerContext} context - The server context, containing Azure client information and selected subscription.
 * @param {AzureOperations} azureOperations - An instance of AzureOperations for interacting with Azure.
 * @param {typeof LoggerServiceInstance} logger - Logger instance for logging messages.
 * @param {Map<string, any>} resourceCache - A Map instance used for caching results.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of resource group objects.
 * @throws {AzureMCPError} If the Azure client is not initialized.
 * @throws {AzureResourceError} If listing resource groups fails.
 */
export async function listResourceGroupsHandler(
    context: ServerContext,
    azureOperations: AzureOperations,
    logger: typeof LoggerServiceInstance, // Use the type of the imported instance
    resourceCache: Map<string, any>
) {
    if (!context.resourceClient) { // Direct check on context as per original logic
        throw new AzureMCPError("Client not initialized", "NO_CLIENT");
    }

    try {
        const cacheKey = `resource-groups-${context.selectedSubscription}`;
        const cachedItem = resourceCache.get(cacheKey);
        // Cache TTL: 30000 ms (30 seconds)
        if (cachedItem && (Date.now() - cachedItem.timestamp) < 30000) {
            logger.info(`Returning cached resource groups for subscription: ${context.selectedSubscription}`);
            return cachedItem.data;
        }

        logger.info(`Fetching fresh resource groups for subscription: ${context.selectedSubscription}`);
        const data = await azureOperations.listResourceGroups();
        resourceCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });

        return data;
    } catch (error) {
        // Check if error is an instance of Error to safely access message property
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error listing resource groups: ${errorMessage}`, { error }); 
        // Ensure AzureResourceError is used as per original logic for this specific error type
        throw new AzureResourceError(`Failed to list resource groups: ${errorMessage}`);
    }
}
