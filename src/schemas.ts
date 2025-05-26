import { z } from "zod";
import { codePrompt } from "./config.js"; // Import codePrompt from its new location

/**
 * @const RunAzureCodeSchema
 * @description Zod schema for validating arguments for the "run-azure-code" tool.
 */
export const RunAzureCodeSchema = z.object({
    reasoning: z.string()
        .min(1, "Reasoning cannot be empty")
        .describe("The reasoning behind the code"),
    code: z.string()
        .min(1, "Code cannot be empty")
        .describe(codePrompt), // Use imported codePrompt
    tenantId: z.string()
        .optional()
        .describe("Azure Tenant ID"),
    subscriptionId: z.string()
        .optional()
        .describe("Azure Subscription ID"),
});

/**
 * @const SelectTenantSchema
 * @description Zod schema for validating arguments for the "select-tenant" tool.
 */
export const SelectTenantSchema = z.object({
    tenantId: z.string()
        .describe("Azure Tenant ID to select"),
    subscriptionId: z.string()
        .describe("Azure Subscription ID to select"),
});

/**
 * @const GetResourceDetailsSchema
 * @description Zod schema for validating arguments for the "get-resource-details" tool.
 */
export const GetResourceDetailsSchema = z.object({
    resourceId: z.string().min(1, "Resource ID cannot be empty")
});

/**
 * @const CreateResourceGroupSchema
 * @description Zod schema for validating arguments for the "create-resource-group" tool.
 */
export const CreateResourceGroupSchema = z.object({
    name: z.string().min(1, "Resource group name cannot be empty"),
    location: z.string().min(1, "Location cannot be empty"),
    tags: z.record(z.string()).optional()
});
