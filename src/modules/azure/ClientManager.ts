import { ResourceManagementClient } from "@azure/arm-resources";
import { SubscriptionClient } from "@azure/arm-subscriptions";
import { AuthorizationManagementClient } from "@azure/arm-authorization";
import { ServerContext } from "../../types";
import { CredentialManager } from "./CredentialManager";
import { AzureAuthenticationError } from "../../types/errors";
import LoggerService from "../../LoggerService";

export class ClientManager {
  static async initializeClients(
    context: ServerContext,
    tenantId: string,
    subscriptionId: string
  ): Promise<void> {
    try {
      // Use enhanced credential creation
      context.credentials = CredentialManager.createCredential(tenantId);

      context.selectedTenant = tenantId;
      context.selectedSubscription = subscriptionId;

      context.resourceClient = new ResourceManagementClient(
        context.credentials,
        subscriptionId
      );
      context.subscriptionClient = new SubscriptionClient(
        context.credentials
      );

      context.authorizationClient = new AuthorizationManagementClient(
        context.credentials,
        subscriptionId
      );

      LoggerService.info(
        `Clients initialized for tenant: ${tenantId} and subscription: ${subscriptionId}`
      );
    } catch (error) {
      LoggerService.error(`Failed to initialize clients: ${error}`);
      throw new AzureAuthenticationError(
        `Failed to initialize Azure clients: ${error}`
      );
    }
  }

  static validateClients(context: ServerContext): void {
    if (!context.resourceClient || !context.subscriptionClient) {
      throw new AzureAuthenticationError("Clients not initialized");
    }
  }

  static validateAuthClient(context: ServerContext): void {
    if (!context.authorizationClient) {
      throw new AzureAuthenticationError("Authorization client not initialized");
    }
  }
}
