import { z } from "zod";

export const codePrompt = `Your job is to answer questions about Azure environment by writing Javascript code using Azure SDK. The code must adhere to a few rules:
- Use the provided client instances: 'resourceClient' for ResourceManagementClient, 'subscriptionClient' for SubscriptionClient, and 'authorizationClient' for AuthorizationManagementClient
- DO NOT create new client instances or import Azure SDK packages
- Use async/await and promises
- Think step-by-step before writing the code
- Avoid hardcoded values like Resource IDs
- Handle errors gracefully
- Handle pagination correctly using for-await-of loops
- Data returned must be JSON containing only the minimal amount of data needed
- Code MUST "return" a value: string, number, boolean or JSON object`;

export const RunAzureCodeSchema = z.object({
  reasoning: z
    .string()
    .min(1, "Reasoning cannot be empty")
    .describe("The reasoning behind the code"),
  code: z.string().min(1, "Code cannot be empty").describe(codePrompt),
  tenantId: z.string().optional().describe("Azure Tenant ID"),
  subscriptionId: z.string().optional().describe("Azure Subscription ID"),
});

export const SelectTenantSchema = z.object({
  tenantId: z.string().describe("Azure Tenant ID to select"),
  subscriptionId: z.string().describe("Azure Subscription ID to select"),
});

export const ResourceDetailsSchema = z.object({
  resourceId: z.string().min(1, "Resource ID cannot be empty"),
});

export const CreateResourceGroupSchema = z.object({
  name: z.string().min(1, "Resource group name cannot be empty"),
  location: z.string().min(1, "Location cannot be empty"),
  tags: z.record(z.string()).optional(),
});

export const RoleAssignmentScopeSchema = z.object({
  scope: z.string().optional(),
});

export type RunAzureCodeInput = z.infer<typeof RunAzureCodeSchema>;
export type SelectTenantInput = z.infer<typeof SelectTenantSchema>;
export type ResourceDetailsInput = z.infer<typeof ResourceDetailsSchema>;
export type CreateResourceGroupInput = z.infer<typeof CreateResourceGroupSchema>;
export type RoleAssignmentScopeInput = z.infer<typeof RoleAssignmentScopeSchema>;
