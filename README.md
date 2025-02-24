# Azure MCP (Model Context Protocol) for Claude Desktop

[![smithery badge](https://smithery.ai/badge/@Streen9/azure-mcp)](https://smithery.ai/server/@Streen9/azure-mcp)

A Model Context Protocol (MCP) implementation that enables Claude Desktop to interact with Azure services. This integration allows Claude to query and manage Azure resources directly through natural language conversations.

## Features

- **Azure Resource Management**: Interface with Azure Resource Management client
- **Subscription Management**: List and manage Azure subscriptions
- **Tenant Management**: List and select Azure tenants
- **Automatic Authentication**: Leverages DefaultAzureCredential for flexible authentication methods
- **Error Handling**: Robust error handling with retries for transient failures
- **Clean Response Formatting**: Properly formatted responses compatible with Claude Desktop

## Prerequisites

- Node.js (v18 or higher)
- Claude Desktop Application
- Azure Account with appropriate permissions
- Azure CLI (optional, for CLI-based authentication)

## Installation


### Manual Installation

1. Clone the repository:
```bash
git clone https://github.com/Streen9/azure-mcp.git
cd azure-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Configure Claude Desktop:
   - Open `claude_desktop_config.json`
   - Add the following MCP configuration:
```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sequential-thinking"
      ]
    },
    "azure": {
      "command": "tsx",
      "args": [
        "C:/Users/[YourUsername]/path/to/azure-mcp/src/launcher.ts"
      ]
    }
  }
}
```

## Authentication

The server supports multiple authentication methods through DefaultAzureCredential:
- Environment Variables
- Managed Identity
- Azure CLI
- Visual Studio Code
- Interactive Browser

The server will automatically try these methods in sequence until one succeeds.

## Usage

1. Close Claude Desktop if it's running (check Task Manager)
2. Start Claude Desktop
3. In the chat, you can now ask Azure-related questions like:
   - "Can you get all the available Azure accounts and subscriptions?"
   - "List all resource groups in my subscription"
   - "Show me all virtual machines in a specific resource group"

### Example Conversation

```
You: Can you get all the available Azure accounts and subscriptions?
Claude: I'll help you list all available Azure tenants and subscriptions.
[Claude will then use the Azure MCP to fetch and display the information]
```

## Development

### Project Structure

```
azure-mcp/
├── src/
│   ├── launcher.ts       # Server entry point
│   ├── AzureServer.ts    # Main MCP server implementation
│   └── LoggerService.ts  # Logging utility
├── package.json
└── README.md
```

### Key Components

- **AzureMCPServer**: Main server class implementing the MCP protocol
- **HandleCallTool**: Processes incoming tool requests
- **ExecuteWithRetry**: Implements retry logic for resilient operations

## Troubleshooting

1. **Authentication Issues**:
   - Ensure you're logged in via Azure CLI (`az login`)
   - Check environment variables if using service principal
   - Verify your Azure account has necessary permissions

2. **Connection Issues**:
   - Verify Claude Desktop configuration
   - Check paths in config file match your installation
   - Ensure no other instances are running

3. **Common Errors**:
   - `NO_TENANT`: Select a tenant using the 'select-tenant' tool
   - `NO_CLIENTS`: Ensure proper initialization and authentication
   - `CODE_EXECUTION_FAILED`: Check Azure permissions and connection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Contributors

- [@calclavia](https://github.com/calclavia) - Integration with smithery.ai

## Acknowledgments

- Claude Desktop team for the MCP implementation
- Azure SDK team for the comprehensive SDK
- Model Context Protocol for enabling AI-service integration

## Security Note

This implementation follows Azure security best practices:
- No hardcoded credentials
- Secure credential chain implementation
- Proper error handling and sanitization

For security concerns or vulnerabilities, please create an issue.
