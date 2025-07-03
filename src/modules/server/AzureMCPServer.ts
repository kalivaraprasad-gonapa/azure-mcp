import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ServerContext } from "../../types";
import { AzureMCPError } from "../../types/errors";
import { createTextResponse } from "../../utils/helpers";
import { CacheManager, CacheConfig } from "../../utils/CacheManager";
import { AzureOperations } from "../azure/AzureOperations";
import { ToolHandlers } from "../tools/ToolHandlers";
import { toolDefinitions } from "../tools/ToolDefinitions";
import LoggerService from "../../LoggerService";
import { parseEnvInt } from "../../config";

const CONFIG = {
  SERVER_VERSION: process.env.SERVER_VERSION || "1.0.0",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  // Cache configuration from environment variables
  CACHE_DEFAULT_TTL_MS: parseEnvInt("CACHE_DEFAULT_TTL_MS", 300000), // 5 minutes
  CACHE_MAX_SIZE: parseEnvInt("CACHE_MAX_SIZE", 1000),
  CACHE_CLEANUP_INTERVAL_MS: parseEnvInt("CACHE_CLEANUP_INTERVAL_MS", 600000), // 10 minutes
  CACHE_ENABLE_METRICS: process.env.CACHE_ENABLE_METRICS !== "false", // Default true
};

export class AzureMCPServer {
  private server: Server;
  private context: ServerContext;
  private transport: StdioServerTransport;
  private logger = LoggerService;
  private cacheManager: CacheManager;
  private azureOperations: AzureOperations;
  private toolHandlers: ToolHandlers;

  constructor(cacheConfig?: CacheConfig) {
    this.context = {
      selectedTenant: null,
      selectedSubscription: null,
      credentials: null,
      resourceClient: null,
      subscriptionClient: null,
      authorizationClient: null,
    };

    this.server = new Server(
      {
        name: "azure-mcp",
        version: CONFIG.SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.transport = new StdioServerTransport();

    // Initialize cache manager with configuration
    const defaultCacheConfig: CacheConfig = {
      defaultTtlMs: CONFIG.CACHE_DEFAULT_TTL_MS,
      maxSize: CONFIG.CACHE_MAX_SIZE,
      cleanupIntervalMs: CONFIG.CACHE_CLEANUP_INTERVAL_MS,
      enableMetrics: CONFIG.CACHE_ENABLE_METRICS,
    };

    this.cacheManager = new CacheManager(cacheConfig || defaultCacheConfig);
    this.azureOperations = new AzureOperations(this.context, this.logger);
    this.toolHandlers = new ToolHandlers(
      this.context,
      this.cacheManager,
      this.azureOperations
    );

    this.initializeRequestHandlers();

    // Log cache configuration
    this.logWithContext("info", "Cache manager initialized", {
      config: defaultCacheConfig,
    });
  }

  private initializeRequestHandlers(): void {
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      this.handleListTools.bind(this)
    );
    this.server.setRequestHandler(
      CallToolRequestSchema,
      this.handleCallTool.bind(this)
    );
  }

  private logWithContext(
    level: string,
    message: string,
    context: Record<string, any> = {}
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      tenant: this.context.selectedTenant,
      subscription: this.context.selectedSubscription,
      ...context,
    };

    // Fix logger access by using type-safe methods
    switch (level) {
      case "info":
        this.logger.info(JSON.stringify(logEntry));
        break;
      case "warning":
      case "warn":
        this.logger.warning(JSON.stringify(logEntry));
        break;
      case "error":
        this.logger.error(JSON.stringify(logEntry));
        break;
      default:
        this.logger.info(JSON.stringify(logEntry));
    }
  }

  private async handleListTools() {
    return {
      tools: toolDefinitions,
    };
  }

  private async handleCallTool(request: z.infer<typeof CallToolRequestSchema>) {
    const { name, arguments: args } = request.params;

    try {
      let result;
      switch (name) {
        case "run-azure-code":
          result = await this.toolHandlers.handleRunAzureCode(args);
          return result;
        case "list-tenants":
          result = await this.toolHandlers.handleListTenants();
          return result;
        case "select-tenant":
          result = await this.toolHandlers.handleSelectTenant(args);
          // Clear cache when tenant/subscription changes
          this.invalidateTenantRelatedCache();
          return result;
        case "list-resource-groups":
          result = await this.toolHandlers.handleListResourceGroups();
          return createTextResponse(JSON.stringify(result));
        case "get-resource-details":
          result = await this.toolHandlers.handleGetResourceDetails(args);
          return createTextResponse(JSON.stringify(result));
        case "create-resource-group":
          result = await this.toolHandlers.handleCreateResourceGroup(args);
          return createTextResponse(JSON.stringify(result));
        case "list-role-assignments":
          result = await this.toolHandlers.handleListRoleAssignments(args);
          return createTextResponse(JSON.stringify(result));
        case "get-role-definitions":
          result = await this.toolHandlers.handleGetRoleDefinitions(args);
          return createTextResponse(JSON.stringify(result));
        case "get-user-permissions":
          result = await this.toolHandlers.handleGetUserPermissions(args);
          return createTextResponse(JSON.stringify(result));
        case "get-cache-info":
          // New tool for cache inspection
          result = this.handleGetCacheInfo();
          return createTextResponse(JSON.stringify(result));
        case "clear-cache":
          // New tool for cache management
          result = this.handleClearCache(args);
          return createTextResponse(JSON.stringify(result));
        default:
          throw new AzureMCPError(`Unknown tool: ${name}`, "UNKNOWN_TOOL");
      }
    } catch (error) {
      this.logWithContext("error", `Error in handleCallTool: ${error}`, {
        error,
        tool: name,
        cacheMetrics: this.cacheManager.getMetrics(),
      });

      if (error instanceof z.ZodError) {
        throw new AzureMCPError(
          `Invalid arguments: ${error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`,
          "INVALID_ARGS"
        );
      }

      // Ensure errors are properly formatted as well
      return createTextResponse(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          code: error instanceof AzureMCPError ? error.code : "UNKNOWN_ERROR",
        })
      );
    }
  }

  private invalidateTenantRelatedCache(): void {
    // Clear all cache entries when tenant/subscription changes
    const removedCount = this.cacheManager.invalidatePattern(
      "^(resource-groups|role-|permissions-|resources-)"
    );

    this.logWithContext("info", "Invalidated tenant-related cache entries", {
      removedCount,
      reason: "tenant/subscription change",
    });
  }

  private handleGetCacheInfo(): any {
    const cacheInfo = this.cacheManager.getCacheInfo();
    const metrics = this.cacheManager.getMetrics();

    this.logWithContext("info", "Cache info requested", {
      metrics,
      size: cacheInfo.totalSize,
    });

    return {
      success: true,
      data: cacheInfo,
      timestamp: new Date().toISOString(),
    };
  }

  private handleClearCache(args: any): any {
    const { pattern, type } = args || {};

    let removedCount = 0;
    let action = "";

    if (pattern) {
      removedCount = this.cacheManager.invalidatePattern(pattern);
      action = `pattern '${pattern}'`;
    } else if (type === "expired") {
      removedCount = this.cacheManager.cleanup();
      action = "expired entries";
    } else {
      this.cacheManager.clearCache();
      removedCount = -1; // Indicates full clear
      action = "all entries";
    }

    this.logWithContext("info", "Cache cleared", {
      action,
      removedCount,
    });

    return {
      success: true,
      message: `Cleared ${action}`,
      removedCount,
      timestamp: new Date().toISOString(),
    };
  }

  public async start(): Promise<void> {
    try {
      await this.server.connect(this.transport);
      this.logWithContext("info", "Azure MCP Server running on stdio", {
        cacheConfig: this.cacheManager.getCacheInfo().config,
      });
    } catch (error) {
      this.logWithContext("error", `Failed to start server: ${error}`, {
        error,
      });
      throw new AzureMCPError("Failed to start server", "START_FAILED");
    }
  }

  public async stop(): Promise<void> {
    try {
      // Clean up cache manager
      this.cacheManager.destroy();

      this.logWithContext("info", "Azure MCP Server stopped", {
        finalCacheMetrics: this.cacheManager.getMetrics(),
      });
    } catch (error) {
      this.logWithContext("error", `Error during server shutdown: ${error}`, {
        error,
      });
    }
  }

  // Enhanced testing method
  public async __testOnly_setContext(context: Partial<ServerContext>) {
    this.context = { ...this.context, ...context };

    // Clear cache when context changes in tests
    this.cacheManager.clearCache();

    return "Context updated for testing";
  }

  // Testing method for cache inspection
  public __testOnly_getCacheManager(): CacheManager {
    return this.cacheManager;
  }
}
