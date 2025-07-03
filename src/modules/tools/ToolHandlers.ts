import { createContext, runInContext } from "node:vm";
import { z } from "zod";
import { DefaultAzureCredential } from "@azure/identity";
import { SubscriptionClient } from "@azure/arm-subscriptions";

import { ServerContext, UserPermission } from "../../types";
import {
  RunAzureCodeSchema,
  SelectTenantSchema,
  ResourceDetailsSchema,
  CreateResourceGroupSchema,
  RoleAssignmentScopeSchema,
} from "../../types/schemas";
import { AzureMCPError, AzureResourceError } from "../../types/errors";
import { wrapUserCode, createTextResponse, executeWithRetry } from "../../utils/helpers";
import { CacheManager } from "../../utils/CacheManager";
import { ClientManager } from "../azure/ClientManager";
import { AzureOperations } from "../azure/AzureOperations";
import LoggerService from "../../LoggerService";

export class ToolHandlers {
  constructor(
    private context: ServerContext,
    private cacheManager: CacheManager,
    private azureOperations: AzureOperations
  ) {}

  async handleRunAzureCode(args: any) {
    const { code, tenantId, subscriptionId } = RunAzureCodeSchema.parse(args);

    if (!this.context.selectedTenant && !tenantId) {
      throw new AzureMCPError(
        "Please select a tenant first using the 'select-tenant' tool!",
        "NO_TENANT"
      );
    }

    if (tenantId && subscriptionId) {
      await ClientManager.initializeClients(this.context, tenantId, subscriptionId);
    }

    ClientManager.validateClients(this.context);

    const wrappedCode = wrapUserCode(code);
    const wrappedIIFECode = `(async function() { return (async () => { ${wrappedCode} })(); })()`;

    try {
      const result = await executeWithRetry(() =>
        runInContext(wrappedIIFECode, createContext(this.context))
      );
      return createTextResponse(JSON.stringify(result));
    } catch (error) {
      LoggerService.error(`Error executing user code: ${error}`);
      throw new AzureMCPError(
        `Failed to execute code: ${error}`,
        "CODE_EXECUTION_FAILED"
      );
    }
  }

  async handleListTenants() {
    try {
      const creds = new DefaultAzureCredential();
      const client = new SubscriptionClient(creds);

      const [tenants, subscriptions] = await Promise.all([
        executeWithRetry(async () => {
          const items = [];
          for await (const tenant of client.tenants.list()) {
            items.push({
              id: tenant.tenantId,
              name: tenant.displayName,
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
              state: sub.state,
            });
          }
          return items;
        }),
      ]);

      return createTextResponse(
        JSON.stringify({ tenants, subscriptions })
      );
    } catch (error) {
      LoggerService.error(`Error listing tenants: ${error}`);
      throw new AzureMCPError(
        `Failed to list tenants and subscriptions: ${error}`,
        "AUTH_FAILED"
      );
    }
  }

  async handleSelectTenant(args: any) {
    const { tenantId, subscriptionId } = SelectTenantSchema.parse(args);
    await ClientManager.initializeClients(this.context, tenantId, subscriptionId);
    return createTextResponse(
      "Tenant and subscription selected! Clients initialized."
    );
  }

  async handleListResourceGroups() {
    ClientManager.validateClients(this.context);

    try {
      const cacheKey = `resource-groups-${this.context.selectedSubscription}`;
      const result = await this.cacheManager.getCachedResource(
        cacheKey,
        async () => {
          return await this.azureOperations.listResourceGroups();
        },
        30000
      );
      return result;
    } catch (error) {
      LoggerService.error(`Error listing resource groups: ${error}`);
      throw new AzureResourceError(`Failed to list resource groups: ${error}`);
    }
  }

  async handleGetResourceDetails(args: any) {
    const { resourceId } = ResourceDetailsSchema.parse(args);
    ClientManager.validateClients(this.context);

    try {
      // Validate resource ID format
      const parts = resourceId.split("/");
      if (parts.length < 8) {
        throw new AzureResourceError("Invalid resource ID format");
      }

      const cacheKey = `resource-${resourceId}`;
      const resource = await this.cacheManager.getCachedResource(
        cacheKey,
        async () => {
          return await this.azureOperations.getResource(resourceId);
        },
        60000
      );

      return {
        id: resource.id,
        name: resource.name,
        type: resource.type,
        location: resource.location,
        tags: resource.tags || {},
        properties: resource.properties || {},
      };
    } catch (error) {
      LoggerService.error(`Error getting resource details: ${error}`);
      throw new AzureResourceError(`Failed to get resource details: ${error}`);
    }
  }

  async handleCreateResourceGroup(args: any) {
    const { name, location, tags } = CreateResourceGroupSchema.parse(args);
    ClientManager.validateClients(this.context);

    try {
      const result = await this.azureOperations.createResourceGroup(
        name,
        location,
        tags
      );

      // Invalidate cache for resource groups list
      this.cacheManager.invalidateCache(
        `resource-groups-${this.context.selectedSubscription}`
      );

      return {
        id: result.id,
        name: result.name,
        location: result.location,
        tags: result.tags || {},
        provisioningState: result.properties?.provisioningState,
      };
    } catch (error) {
      LoggerService.error(`Error creating resource group: ${error}`);
      throw new AzureResourceError(`Failed to create resource group: ${error}`);
    }
  }

  async handleListRoleAssignments(args: any) {
    const { scope } = RoleAssignmentScopeSchema.parse(args);
    ClientManager.validateAuthClient(this.context);

    try {
      const assignmentScope =
        scope || `/subscriptions/${this.context.selectedSubscription}`;

      const roleAssignments = await this.azureOperations.listRoleAssignments(assignmentScope);

      return { roleAssignments, total: roleAssignments.length };
    } catch (error) {
      LoggerService.error(`Error listing role assignments: ${error}`);
      throw new AzureResourceError(`Failed to list role assignments: ${error}`);
    }
  }

  async handleGetRoleDefinitions(args: any) {
    const { scope } = RoleAssignmentScopeSchema.parse(args);
    ClientManager.validateAuthClient(this.context);

    try {
      const definitionScope =
        scope || `/subscriptions/${this.context.selectedSubscription}`;

      const roleDefinitions = await this.azureOperations.getRoleDefinitions(definitionScope);

      return { roleDefinitions, total: roleDefinitions.length };
    } catch (error) {
      LoggerService.error(`Error getting role definitions: ${error}`);
      throw new AzureResourceError(`Failed to get role definitions: ${error}`);
    }
  }

  async handleGetUserPermissions(args: any) {
    const { scope } = RoleAssignmentScopeSchema.parse(args);
    ClientManager.validateAuthClient(this.context);

    try {
      const permissionScope =
        scope || `/subscriptions/${this.context.selectedSubscription}`;

      // Get both role assignments and role definitions
      const [roleAssignments, roleDefinitions] = await Promise.all([
        this.azureOperations.listRoleAssignments(permissionScope),
        this.azureOperations.getRoleDefinitions(permissionScope),
      ]);

      // Match assignments with definitions
      const userPermissions: UserPermission[] = roleAssignments.map((assignment) => {
        const roleDefinition = roleDefinitions.find((def) =>
          assignment.roleDefinitionId?.endsWith(def.name || "")
        );

        return {
          principalId: assignment.principalId,
          principalType: assignment.principalType,
          scope: assignment.scope,
          roleDefinition: {
            id: roleDefinition?.id,
            name: roleDefinition?.roleName,
            description: roleDefinition?.description,
            permissions: roleDefinition?.permissions || [],
          },
          createdOn: assignment.createdOn,
        };
      });

      // Group by role for summary
      const roleSummary = userPermissions.reduce((acc, perm) => {
        const roleName = perm.roleDefinition.name || "Unknown";
        acc[roleName] = (acc[roleName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        userPermissions,
        roleSummary,
        totalAssignments: roleAssignments.length,
        scope: permissionScope,
      };
    } catch (error) {
      LoggerService.error(`Error getting user permissions: ${error}`);
      throw new AzureResourceError(`Failed to get user permissions: ${error}`);
    }
  }
}
