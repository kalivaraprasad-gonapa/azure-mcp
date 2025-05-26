// Import ServerContext and error classes from AzureServer.js due to module resolution
import { ServerContext, AzureMCPError, AzureAuthenticationError, AzureResourceError } from "./AzureServer.js"; // Removed unused Azure SDK client imports

/**
 * @class AzureOperations
 * @description Provides a set of operations to interact with Azure resources,
 * abstracting the direct use of Azure SDK clients.
 */
class AzureOperations {
    /**
     * @constructor
     * @param {ServerContext} context - The server context containing Azure clients and configuration.
     * @param {any} logger - Logger instance for logging messages.
     */
    constructor(private context: ServerContext, private logger: any) { }

    /**
     * @async
     * @function listResourceGroups
     * @description Lists all resource groups in the selected subscription.
     * @returns {Promise<Array<object>>} A promise that resolves to an array of resource group objects.
     * @throws {AzureMCPError} If the resource client is not initialized.
     */
    async listResourceGroups() {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        const resourceGroups = [];
        for await (const group of this.context.resourceClient.resourceGroups.list()) {
            resourceGroups.push({
                id: group.id,
                name: group.name,
                location: group.location,
                tags: group.tags || {}
            });
        }

        return resourceGroups;
    }

    /**
     * @async
     * @function getResource
     * @description Gets a specific Azure resource by its ID.
     * @param {string} resourceId - The ID of the resource to retrieve.
     * @returns {Promise<object>} A promise that resolves to the resource object.
     * @throws {AzureMCPError} If the resource client is not initialized.
     */
    async getResource(resourceId: string) {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        return await this.context.resourceClient.resources.getById(
            resourceId,
            'latest'
        );
    }

    /**
     * @async
     * @function createResourceGroup
     * @description Creates or updates a resource group.
     * @param {string} name - The name of the resource group.
     * @param {string} location - The location for the resource group.
     * @param {Record<string, string>} [tags] - Optional tags for the resource group.
     * @returns {Promise<object>} A promise that resolves to the created or updated resource group object.
     * @throws {AzureMCPError} If the resource client is not initialized.
     */
    async createResourceGroup(name: string, location: string, tags?: Record<string, string>) {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        return await this.context.resourceClient.resourceGroups.createOrUpdate(
            name,
            { location, tags }
        );
    }

    /**
     * @async
     * @function listResourcesByType
     * @description Lists resources of a specific type within a provider.
     * @param {string} resourceType - The type of the resource (e.g., 'virtualMachines').
     * @param {string} provider - The resource provider (e.g., 'Microsoft.Compute').
     * @returns {Promise<Array<object>>} A promise that resolves to an array of resource objects.
     * @throws {AzureMCPError} If the resource client is not initialized.
     */
    async listResourcesByType(resourceType: string, provider: string) {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        const resources = [];
        // Using list() with a filter instead of listByResourceType which doesn't exist
        const filter = `resourceType eq '${provider}/${resourceType}'`;
        for await (const resource of this.context.resourceClient.resources.list({ filter })) {
            resources.push({
                id: resource.id,
                name: resource.name,
                type: resource.type,
                location: resource.location,
                tags: resource.tags || {}
            });
        }

        return resources;
    }

    /**
     * @async
     * @function getResourceGroup
     * @description Gets a specific resource group by its name.
     * @param {string} resourceGroupName - The name of the resource group to retrieve.
     * @returns {Promise<object>} A promise that resolves to the resource group object.
     * @throws {AzureMCPError} If the resource client is not initialized.
     */
    async getResourceGroup(resourceGroupName: string) {
        if (!this.context.resourceClient) {
            throw new AzureMCPError("Client not initialized", "NO_CLIENT");
        }

        return await this.context.resourceClient.resourceGroups.get(resourceGroupName);
    }
}

export { AzureOperations };
