// src/tool-handlers/getResourceDetailsHandler.ts
import { GetResourceDetailsSchema } from "../schemas.js";
import { AzureMCPError, AzureResourceError, ServerContext } from "../AzureServer.js";
import { AzureOperations } from "../AzureOperations.js";
import LoggerServiceInstance from "../LoggerService.js"; // Renamed to avoid conflict with type

/**
 * @async
 * @function getResourceDetailsHandler
 * @description Handles the "get-resource-details" tool request. It fetches detailed information
 * for a specific Azure resource, utilizing a cache.
 * @param {any} args - Arguments from the tool call, expected to match GetResourceDetailsSchema.
 * @param {ServerContext} context - The server context, containing Azure client information.
 * @param {AzureOperations} azureOperations - An instance of AzureOperations for interacting with Azure.
 * @param {typeof LoggerServiceInstance} logger - Logger instance for logging messages.
 * @param {Map<string, any>} resourceCache - A Map instance used for caching results.
 * @returns {Promise<object>} A promise that resolves to an object containing the resource details.
 * @throws {AzureMCPError} If the Azure client is not initialized.
 * @throws {AzureResourceError} If the resource ID format is invalid or fetching details fails.
 * @throws {z.ZodError} If the provided arguments do not match GetResourceDetailsSchema.
 */
export async function getResourceDetailsHandler(
    args: any,
    context: ServerContext,
    azureOperations: AzureOperations,
    logger: typeof LoggerServiceInstance, // Use the type of the imported instance
    resourceCache: Map<string, any>
) {
    const { resourceId } = GetResourceDetailsSchema.parse(args);

    if (!context.resourceClient) {
        throw new AzureMCPError("Client not initialized", "NO_CLIENT");
    }

    try {
        // The resource ID format is: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/{provider}/{resourceType}/{resourceName}
        const parts = resourceId.split('/');
        if (parts.length < 8) {
            throw new AzureResourceError("Invalid resource ID format");
        }

        const cacheKey = `resource-${resourceId}`;
        const cachedItem = resourceCache.get(cacheKey);
        // Cache TTL: 60000 ms (60 seconds)
        if (cachedItem && (Date.now() - cachedItem.timestamp) < 60000) {
            logger.info(`Returning cached details for resource: ${resourceId}`);
            return cachedItem.data;
        }

        logger.info(`Fetching fresh details for resource: ${resourceId}`);
        const resource = await azureOperations.getResource(resourceId);
        
        const dataToCache = { // Store the processed/returned data structure
            id: resource.id,
            name: resource.name,
            type: resource.type,
            location: resource.location,
            tags: resource.tags || {},
            properties: resource.properties || {}
        };

        resourceCache.set(cacheKey, {
            data: dataToCache,
            timestamp: Date.now()
        });

        return dataToCache;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error getting resource details: ${errorMessage}`, { error });
        throw new AzureResourceError(`Failed to get resource details: ${errorMessage}`);
    }
}
