import { ResourceManagementClient } from "@azure/arm-resources";
import { SubscriptionClient } from "@azure/arm-subscriptions";
import { AuthorizationManagementClient } from "@azure/arm-authorization";
import { ChainedTokenCredential } from "@azure/identity";

export interface ServerContext {
  resourceClient: ResourceManagementClient | null;
  subscriptionClient: SubscriptionClient | null;
  authorizationClient: AuthorizationManagementClient | null;
  credentials: ChainedTokenCredential | null;
  selectedTenant: string | null;
  selectedSubscription: string | null;
  apiVersion?: string;
}

export interface CachedItem<T> {
  data: T;
  timestamp: number;
  ttl?: number;
  accessCount?: number;
  lastAccessed?: number;
}

export interface AzureResource {
  id: string;
  name: string;
  type: string;
  location: string;
  tags: Record<string, string>;
  properties?: any;
}

export interface RoleAssignment {
  id: string;
  principalId: string;
  principalType: string;
  roleDefinitionId: string;
  scope: string;
  createdOn?: Date;
  createdBy?: string;
}

export interface RoleDefinition {
  id: string;
  name: string;
  roleName: string;
  description: string;
  type?: string;
  permissions?: Array<{
    actions: string[];
    notActions: string[];
    dataActions: string[];
    notDataActions: string[];
  }>;
}

export interface UserPermission {
  principalId: string;
  principalType: string;
  scope: string;
  roleDefinition: {
    id?: string;
    name?: string;
    description?: string;
    permissions: any[];
  };
  createdOn?: Date;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}
