# Azure MCP Server - Modular Architecture

This document describes the modular architecture of the Azure MCP Server, which has been refactored from a monolithic structure to improve maintainability, testability, and code organization.

## Directory Structure

```
src/
├── modules/
│   ├── server/
│   │   └── AzureMCPServer.ts     # Main server class
│   ├── azure/
│   │   ├── AzureOperations.ts    # Azure SDK operations
│   │   ├── ClientManager.ts      # Azure client initialization
│   │   └── CredentialManager.ts  # Azure credential management
│   ├── tools/
│   │   ├── ToolDefinitions.ts    # Tool schema definitions
│   │   └── ToolHandlers.ts       # Tool execution handlers
│   └── index.ts                  # Module exports
├── types/
│   ├── index.ts                  # Type definitions
│   ├── errors.ts                 # Error classes
│   └── schemas.ts                # Validation schemas
├── utils/
│   ├── helpers.ts                # Utility functions
│   └── CacheManager.ts           # Cache management
├── AzureServerModular.ts         # Main entry point (modular)
├── AzureServer.ts                # Original monolithic file (preserved)
├── config.ts                     # Configuration
├── LoggerService.ts              # Logging service
└── launcher.ts                   # Application launcher
```

## Module Descriptions

### 1. Server Module (`modules/server/`)

**AzureMCPServer.ts**: The main server class that orchestrates all components. It handles:
- MCP server initialization
- Request routing
- Tool handler coordination
- Error handling and logging

### 2. Azure Module (`modules/azure/`)

**AzureOperations.ts**: Contains all Azure SDK operations including:
- Resource group management
- Resource operations
- Role assignment operations
- Role definition operations

**ClientManager.ts**: Manages Azure client initialization and validation:
- Client setup for different Azure services
- Connection validation
- Context management

**CredentialManager.ts**: Handles Azure authentication:
- Multiple credential chain setup
- Environment-based authentication
- Managed identity support

### 3. Tools Module (`modules/tools/`)

**ToolDefinitions.ts**: Contains all tool schema definitions:
- Tool input/output schemas
- Tool descriptions
- Validation rules

**ToolHandlers.ts**: Implements all tool execution logic:
- Individual tool handlers
- Input validation
- Response formatting

### 4. Types (`types/`)

**index.ts**: Core type definitions:
- ServerContext interface
- Azure resource types
- Role and permission types

**errors.ts**: Custom error classes:
- AzureMCPError (base)
- AzureAuthenticationError
- AzureResourceError
- AzureValidationError

**schemas.ts**: Zod validation schemas:
- Input validation schemas
- Type inference helpers
- Prompt definitions

### 5. Utils (`utils/`)

**helpers.ts**: Common utility functions:
- Code wrapping utilities
- Response formatting
- Retry logic

**CacheManager.ts**: Cache management functionality:
- Resource caching
- TTL management
- Cache invalidation

## Benefits of Modular Architecture

### 1. **Separation of Concerns**
- Each module has a single responsibility
- Clear boundaries between different functionalities
- Easier to understand and maintain

### 2. **Testability**
- Individual modules can be unit tested in isolation
- Mock dependencies easily
- Better test coverage

### 3. **Maintainability**
- Changes are localized to specific modules
- Easier to add new features
- Reduced coupling between components

### 4. **Reusability**
- Modules can be reused in different contexts
- Clear interfaces for module integration
- Easy to extract modules for other projects

### 5. **Development Experience**
- Smaller files are easier to navigate
- Clear structure helps new developers
- Better IDE support and navigation

## Usage

### Using the Modular Version

```typescript
import { AzureMCPServer } from './src/AzureServerModular';

const server = new AzureMCPServer();
server.start().catch(console.error);
```

### Using Individual Modules

```typescript
import { 
  AzureOperations, 
  CredentialManager, 
  CacheManager 
} from './src/modules';

// Use individual components
const credentials = CredentialManager.createCredential(tenantId);
const cache = new CacheManager();
const operations = new AzureOperations(context, logger);
```

## Migration from Monolithic Version

The original `AzureServer.ts` file has been preserved for reference. The modular version (`AzureServerModular.ts`) provides the same functionality but with better organization.

### Key Changes:
1. **Split large class** into focused modules
2. **Extracted utilities** into separate files
3. **Organized types** in dedicated directory
4. **Separated concerns** by functional area
5. **Added proper error handling** with specific error types

### Compatibility:
- Same external API
- Same functionality
- Same configuration options
- Drop-in replacement for the monolithic version

## Adding New Features

### Adding a New Tool:
1. Add tool definition in `ToolDefinitions.ts`
2. Add handler in `ToolHandlers.ts`
3. Add route in `AzureMCPServer.ts`
4. Add validation schema in `schemas.ts` (if needed)

### Adding Azure Operations:
1. Add method to `AzureOperations.ts`
2. Add types in `types/index.ts` (if needed)
3. Add error handling in appropriate handler

### Adding Utilities:
1. Add function to `utils/helpers.ts`
2. Export from module index files
3. Import where needed

This modular architecture provides a solid foundation for future development and maintenance of the Azure MCP Server.
