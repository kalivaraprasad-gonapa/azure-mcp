import { AzureMCPServer } from "./modules/server/AzureMCPServer";
import LoggerService from "./LoggerService";

// Re-export main classes for external use
export { AzureMCPServer } from "./modules/server/AzureMCPServer";
export {
  AzureMCPError,
  AzureAuthenticationError,
  AzureResourceError,
} from "./types/errors";
export type {
  ServerContext,
  AzureResource,
  RoleAssignment,
  RoleDefinition,
} from "./types";

// Start the stdio server
if (require.main === module) {
  const server = new AzureMCPServer();
  server.start().catch((error) => {
    LoggerService.error(`Server failed to start: ${error}`);
    process.exit(1);
  });
}
