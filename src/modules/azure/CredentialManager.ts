import {
  DefaultAzureCredential,
  ClientSecretCredential,
  ChainedTokenCredential,
  ManagedIdentityCredential,
} from "@azure/identity";

export class CredentialManager {
  static createCredential(tenantId?: string): ChainedTokenCredential {
    const credentials = [];

    // Add environment-based credential
    if (
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_TENANT_ID
    ) {
      credentials.push(
        new ClientSecretCredential(
          process.env.AZURE_TENANT_ID,
          process.env.AZURE_CLIENT_ID,
          process.env.AZURE_CLIENT_SECRET
        )
      );
    }

    // Add managed identity with specific client ID if available
    if (process.env.AZURE_CLIENT_ID) {
      credentials.push(
        new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID)
      );
    } else {
      credentials.push(new ManagedIdentityCredential());
    }

    // Add default Azure credential as fallback
    credentials.push(
      new DefaultAzureCredential({
        tenantId: tenantId || process.env.AZURE_TENANT_ID,
      })
    );

    return new ChainedTokenCredential(...credentials);
  }
}
