# Dub.co MCP Server Installation Guide for AI Agents

This guide provides step-by-step instructions for AI agents like Cline to install and configure the Dub.co MCP server.

## Installation Methods

### Method 1: Install via NPM (Recommended)

You can install the Dub.co MCP server globally using npm:

```bash
npm install -g dubco-mcp-server
```

### Method 2: Clone and Build

Alternatively, you can clone the repository and build it locally:

```bash
# Clone the repository
git clone https://github.com/Gitmaxd/dubco-mcp-server.git

# Navigate to the project directory
cd dubco-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

### Getting a Dub.co API Key

To use this MCP server, you'll need a Dub.co API key. Here's how to get one:

1. Ask the user to log in to their [Dub.co](https://dub.co) account
2. Direct them to go to their workspace settings
3. Have them navigate to the "API" section
4. Instruct them to generate a new API key
5. Ask them to provide you with the generated API key

### Adding to MCP Configuration

Depending on the installation method, you'll need to add the appropriate configuration to the MCP settings file.

#### For NPM Installation

Add the following to the MCP configuration file (typically located at `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` for VSCode on macOS or `~/Library/Application Support/Claude/claude_desktop_config.json` for the Claude desktop app):

```json
{
  "mcpServers": {
    "dubco-server": {
      "command": "dubco-mcp-server",
      "env": {
        "DUBCO_API_KEY": "dub_xxxxxxxxxxxxxxxxxxxxxxxx"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

#### For Local Build

Add the following to the MCP configuration file, replacing `/path/to` with the actual path to the cloned repository:

```json
{
  "mcpServers": {
    "dubco-server": {
      "command": "node",
      "args": ["/path/to/dubco-mcp-server/build/index.js"],
      "env": {
        "DUBCO_API_KEY": "dub_xxxxxxxxxxxxxxxxxxxxxxxx"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Verification

After installation and configuration, you can verify that the MCP server is working correctly by asking the user to restart their Cline application and then trying to use one of the Dub.co tools, such as creating a short link.

## Troubleshooting

### Common Issues

1. **API Key Invalid**: If you receive an error about an invalid API key, verify that the user has provided the correct API key and that it has been properly added to the MCP configuration.

2. **Server Not Found**: If the server cannot be found, check that the installation path is correct in the MCP configuration.

3. **Permission Issues**: If there are permission issues when running the server, ensure that the build/index.js file has executable permissions:

   ```bash
   chmod +x /path/to/dubco-mcp-server/build/index.js
   ```

4. **Dependency Issues**: If there are issues with dependencies, try reinstalling them:

   ```bash
   cd /path/to/dubco-mcp-server
   npm install
   ```

## Additional Configuration

### Auto-Approve Tools

If the user wants to auto-approve certain tools to avoid confirmation prompts, they can add the tool names to the `autoApprove` array in the MCP configuration:

```json
{
  "mcpServers": {
    "dubco-server": {
      "command": "node",
      "args": ["/path/to/dubco-mcp-server/build/index.js"],
      "env": {
        "DUBCO_API_KEY": "dub_xxxxxxxxxxxxxxxxxxxxxxxx"
      },
      "disabled": false,
      "autoApprove": ["create_link", "upsert_link"]
    }
  }
}
```

This configuration would auto-approve the `create_link` and `upsert_link` tools without requiring user confirmation each time.
