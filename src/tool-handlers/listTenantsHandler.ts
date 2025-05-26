// src/tool-handlers/listTenantsHandler.ts
import { DefaultAzureCredential } from "@azure/identity";
import { SubscriptionClient } from "@azure/arm-subscriptions";
import { AzureAuthenticationError } from "../AzureServer.js";
import LoggerServiceInstance from "../LoggerService.js"; // Renamed to avoid conflict with type

/**
 * @async
 * @function listTenantsHandler
 * @description Handles the "list-tenants" tool request. It fetches available Azure tenants and subscriptions.
 * @param {typeof LoggerServiceInstance} logger - Logger instance for logging messages.
 * @param {function<T>(function(): Promise<T>, number=): Promise<T>} executeWithRetry - Function to execute an operation with retries.
 * @returns {Promise<{tenants: Array<object>, subscriptions: Array<object>}>} A promise that resolves to an object containing arrays of tenants and subscriptions.
 * @throws {AzureAuthenticationError} If fetching tenants or subscriptions fails.
 */
export async function listTenantsHandler(
    logger: typeof LoggerServiceInstance,
    executeWithRetry: <T>(operation: () => Promise<T>, retries?: number) => Promise<T>
) {
    try {
        const creds = new DefaultAzureCredential();
        const client = new SubscriptionClient(creds);

        const [tenants, subscriptions] = await Promise.all([
            executeWithRetry(async () => {
                const items = [];
                for await (const tenant of client.tenants.list()) {
                    items.push({
                        id: tenant.tenantId,
                        name: tenant.displayName
                    });
                }
                return items;
            }),
            executeWithRetry(async () => {
                const items = [];
                for await (const sub of client.subscriptions.list()) {
                    items.push({
                        id: sub.subscriptionId,
                        name: sub.displayName,
                        state: sub.state
                    });
                }
                return items;
            })
        ]);

        return { tenants, subscriptions }; // Return raw result
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error listing tenants: ${errorMessage}`, { error });
        throw new AzureAuthenticationError(
            `Failed to list tenants and subscriptions: ${errorMessage}`
        );
    }
}
