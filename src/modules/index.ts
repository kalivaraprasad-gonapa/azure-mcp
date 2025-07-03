// Main exports
export { AzureMCPServer } from "./server/AzureMCPServer";
export { AzureOperations } from "./azure/AzureOperations";
export { CredentialManager } from "./azure/CredentialManager";
export { ClientManager } from "./azure/ClientManager";
export { ToolHandlers } from "./tools/ToolHandlers";
export { toolDefinitions } from "./tools/ToolDefinitions";

// Type exports
export type { 
  ServerContext, 
  AzureResource, 
  RoleAssignment, 
  RoleDefinition,
  UserPermission,
  ToolDefinition,
  CachedItem
} from "../types";

// Error exports
export { 
  AzureMCPError, 
  AzureAuthenticationError, 
  AzureResourceError, 
  AzureValidationError 
} from "../types/errors";

// Schema exports
export {
  RunAzureCodeSchema,
  SelectTenantSchema,
  ResourceDetailsSchema,
  CreateResourceGroupSchema,
  RoleAssignmentScopeSchema,
  codePrompt
} from "../types/schemas";

// Utility exports
export { 
  wrapUserCode, 
  createTextResponse, 
  executeWithRetry 
} from "../utils/helpers";
export { CacheManager } from "../utils/CacheManager";
