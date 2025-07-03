import {
  ServerContext,
  AzureResource,
  RoleAssignment,
  RoleDefinition,
} from "../../types";
import { AzureMCPError } from "../../types/errors";

export class AzureOperations {
  constructor(private context: ServerContext, private logger: any) {}

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
        tags: group.tags || {},
      });
    }

    return resourceGroups;
  }

  async getResource(resourceId: string) {
    if (!this.context.resourceClient) {
      throw new AzureMCPError("Client not initialized", "NO_CLIENT");
    }

    return await this.context.resourceClient.resources.getById(
      resourceId,
      "latest"
    );
  }

  async createResourceGroup(
    name: string,
    location: string,
    tags?: Record<string, string>
  ) {
    if (!this.context.resourceClient) {
      throw new AzureMCPError("Client not initialized", "NO_CLIENT");
    }

    return await this.context.resourceClient.resourceGroups.createOrUpdate(
      name,
      { location, tags }
    );
  }

  async listResourcesByType(resourceType: string, provider: string) {
    if (!this.context.resourceClient) {
      throw new AzureMCPError("Client not initialized", "NO_CLIENT");
    }

    const resources = [];
    const filter = `resourceType eq '${provider}/${resourceType}'`;
    for await (const resource of this.context.resourceClient.resources.list({
      filter,
    })) {
      resources.push({
        id: resource.id,
        name: resource.name,
        type: resource.type,
        location: resource.location,
        tags: resource.tags || {},
      });
    }

    return resources;
  }

  async getResourceGroup(resourceGroupName: string) {
    if (!this.context.resourceClient) {
      throw new AzureMCPError("Client not initialized", "NO_CLIENT");
    }

    return await this.context.resourceClient.resourceGroups.get(
      resourceGroupName
    );
  }

  async listRoleAssignments(scope?: string): Promise<RoleAssignment[]> {
    if (!this.context.authorizationClient) {
      throw new AzureMCPError(
        "Authorization client not initialized",
        "NO_CLIENT"
      );
    }

    const assignments: RoleAssignment[] = [];
    const assignmentScope =
      scope || `/subscriptions/${this.context.selectedSubscription}`;

    for await (const assignment of this.context.authorizationClient.roleAssignments.listForScope(
      assignmentScope
    )) {
      assignments.push({
        id: assignment.id || "",
        principalId: assignment.principalId || "",
        principalType: assignment.principalType || "",
        roleDefinitionId: assignment.roleDefinitionId || "",
        scope: assignment.scope || "",
        createdOn: assignment.createdOn,
        createdBy: assignment.createdBy,
      });
    }

    return assignments;
  }

  async getRoleDefinitions(scope?: string): Promise<RoleDefinition[]> {
    if (!this.context.authorizationClient) {
      throw new AzureMCPError(
        "Authorization client not initialized",
        "NO_CLIENT"
      );
    }

    const definitions: RoleDefinition[] = [];
    const definitionScope =
      scope || `/subscriptions/${this.context.selectedSubscription}`;

    for await (const definition of this.context.authorizationClient.roleDefinitions.list(
      definitionScope
    )) {
      definitions.push({
        id: definition.id || "",
        name: definition.name || "",
        roleName: definition.roleName || "",
        description: definition.description || "",
        type: definition.type,
        permissions: definition.permissions?.map((p) => ({
          actions: p.actions || [],
          notActions: p.notActions || [],
          dataActions: p.dataActions || [],
          notDataActions: p.notDataActions || [],
        })),
      });
    }

    return definitions;
  }
}
