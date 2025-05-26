# Azure MCP (Model Context Protocol) for Claude Desktop

[![smithery badge](https://smithery.ai/badge/@Streen9/azure-mcp)](https://smithery.ai/server/@Streen9/azure-mcp)

<a href="https://glama.ai/mcp/servers/8lqipo67ap">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/8lqipo67ap/badge" />
</a>

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

## Architecture Overview

This project consists of two main components: the Azure MCP Server and a Python-based web application.

### Azure MCP Server (Node.js/TypeScript)

*   **Role**: This is the core engine of the project. It implements the Model Context Protocol, allowing clients like Claude Desktop to interact with Azure. It handles incoming tool requests from the MCP client, orchestrates Azure operations, executes Azure SDK code in a sandboxed environment, and returns results.
*   **Key Modules**:
    *   `src/AzureServer.ts`: Contains the main server logic, including request handling, context management, and dispatching to tool handlers.
    *   `src/AzureOperations.ts`: Encapsulates direct interactions with the Azure SDK, providing a simplified interface for performing Azure resource operations.
    *   `src/tool-handlers/`: This directory contains individual TypeScript files, each responsible for the logic of a specific tool (e.g., listing resource groups, creating a resource).
    *   `src/config.ts`: Centralizes all environment variable access and application configuration for the Node.js server.
    *   `src/schemas.ts`: Defines Zod schemas for validating the inputs to the various tools.

### Python Web App (Flask)

*   **Role**: A secondary component, primarily for local development and health checking. It currently provides a health check endpoint (`/health`) that verifies database connectivity and a basic index page.
*   **Technology**: Built using the Flask framework. It is containerized for easy local development setup via Docker.

### Dockerization

*   **`mcp.Dockerfile`**: Used to build the Docker image for the Node.js Azure MCP Server. This packages the server and its dependencies for deployment.
*   **`web.Dockerfile`**: Used to build the Docker image for the Python Flask web application.
*   **`docker-compose.yml`**: Facilitates local development by orchestrating the Python web app (`app` service) and a MySQL database (`db` service). It is not typically used for deploying the MCP server itself.

## Deployment

The primary application intended for deployment is the **Azure MCP Server** (the Node.js/TypeScript application).

The project is configured for Continuous Integration/Continuous Deployment (CI/CD) using GitHub Actions:

*   **GitHub Actions Workflow**: The workflow defined in `.github/workflows/deploy.yml` automates the deployment process when changes are pushed to the `main` branch.
*   **Deployment Script**: This workflow utilizes the `.container-hosting/deploy.sh` script. This script is responsible for building the MCP server's Docker image and deploying it to the target hosting environment (which appears to be a Dokku-based PaaS from the script's contents).

The general deployment process involves:
1.  Building the Docker container for the MCP server using `mcp.Dockerfile`.
2.  Pushing this container image to a container registry or directly deploying it to a Platform-as-a-Service (PaaS) that supports Docker.

**Environment Configuration**: All necessary environment variables, as detailed in the "Configuration" section of this README, must be properly configured in the deployment environment for the MCP server to function correctly.

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

## Configuration

For local development, create a `.env` file in the root of the project. This file is gitignored and should not be committed.
The `docker-compose.yml` file is also configured to use these variables for the Python web application and other services if a `.env` file is present.

**Node.js (Azure MCP Server):**
*   `LOG_LEVEL`: (Optional) Logging level for the Node.js server, e.g., `info`, `debug`. Defaults to `info`.
*   `LOG_DIR`: (Optional) Directory to store log files for the Node.js server. Defaults to `./logs`.
*   `MCP_MODE`: (Optional) Set to `true` if running the Node.js server strictly in MCP mode (affects console logging, directing all to stderr). Defaults to `false`.
*   `AZURE_CLIENT_ID`: (Optional) Azure Client ID for service principal authentication.
*   `AZURE_CLIENT_SECRET`: (Optional) Azure Client Secret for service principal authentication.
*   `AZURE_TENANT_ID`: (Optional) Azure Tenant ID, can be used as a default for authentication.
*   `SERVER_VERSION`: (Optional) Version of the server. Defaults to `1.0.0`.
*   `MAX_RETRIES`: (Optional) Max retries for Azure operations. Defaults to `3`.
*   `RETRY_DELAY_MS`: (Optional) Delay in ms for retries. Defaults to `1000`.

**Python (Web App - primarily used via `docker-compose.yml`):**
*   `FLASK_SECRET_KEY`: Secret key for Flask session management (important for security). Used by the `app` service in `docker-compose.yml`.
*   `PYTHON_LOG_LEVEL`: (Optional) Logging level for the Python app, e.g., `DEBUG`, `INFO`. Defaults to `DEBUG`.
*   `DB_USER`: MySQL database user.
*   `DB_PASSWORD`: MySQL database password.
*   `DB_HOST`: Database host (e.g., `db` if using docker-compose, or `localhost`).
*   `DB_PORT`: Database port (e.g., `3306`).
*   `DB_NAME`: Database name.

## Security Note

This implementation follows Azure security best practices:
- No hardcoded credentials (credentials and sensitive configurations are managed via environment variables or `DefaultAzureCredential`).
- Secure credential chain implementation.
- Proper error handling and sanitization.

For security concerns or vulnerabilities, please create an issue.
