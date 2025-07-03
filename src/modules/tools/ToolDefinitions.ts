import { ToolDefinition } from "../../types";
import { codePrompt } from "../../types/schemas";

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "list-role-assignments",
    description:
      "List role assignments for the subscription or resource group",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description:
            "Scope for role assignments (subscription, resource group, or resource ID). Leave empty for subscription level.",
        },
      },
      required: [],
    },
  },
  {
    name: "get-role-definitions",
    description: "List available role definitions",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description:
            "Scope for role definitions. Leave empty for subscription level.",
        },
      },
      required: [],
    },
  },
  {
    name: "get-user-permissions",
    description:
      "Get detailed user permissions by combining role assignments and role definitions",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description:
            "Scope to check permissions for. Leave empty for subscription level.",
        },
      },
      required: [],
    },
  },
  {
    name: "run-azure-code",
    description: "Run Azure code",
    inputSchema: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "The reasoning behind the code",
        },
        code: {
          type: "string",
          description: codePrompt,
        },
        tenantId: {
          type: "string",
          description: "Azure Tenant ID",
        },
        subscriptionId: {
          type: "string",
          description: "Azure Subscription ID",
        },
      },
      required: ["reasoning", "code"],
    },
  },
  {
    name: "list-tenants",
    description: "List all available Azure tenants",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "select-tenant",
    description: "Select Azure tenant and subscription",
    inputSchema: {
      type: "object",
      properties: {
        tenantId: {
          type: "string",
          description: "Azure Tenant ID to select",
        },
        subscriptionId: {
          type: "string",
          description: "Azure Subscription ID to select",
        },
      },
      required: ["tenantId", "subscriptionId"],
    },
  },
  {
    name: "list-resource-groups",
    description: "List all resource groups in the selected subscription",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get-resource-details",
    description: "Get detailed information about a specific resource",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description: "Azure Resource ID",
        },
      },
      required: ["resourceId"],
    },
  },
  {
    name: "create-resource-group",
    description: "Create a new resource group",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Resource group name",
        },
        location: {
          type: "string",
          description: "Azure region",
        },
        tags: {
          type: "object",
          description: "Resource tags (optional)",
        },
      },
      required: ["name", "location"],
    },
  },
];
