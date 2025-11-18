# Claude Desktop Configuration for dv360-mcp

This guide explains how to connect Claude Desktop to your local dv360-mcp server for testing.

## Prerequisites

Before configuring Claude Desktop, ensure you have:

1. **Built the server:**

   ```bash
   cd packages/dv360-mcp
   pnpm run build
   ```

2. **DV360 Service Account credentials** - See [SERVICE_ACCOUNT_SETUP.md](./SERVICE_ACCOUNT_SETUP.md)

## Configuration File Location

The Claude Desktop configuration file is located at:

**macOS:**

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**

```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**

```
~/.config/Claude/claude_desktop_config.json
```

## Recommended Configuration (File-Based Credentials)

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dv360-mcp-local": {
      "command": "node",
      "args": ["/absolute/path/to/cesteral-mcp-servers/packages/dv360-mcp/dist/index.js"],
      "cwd": "/absolute/path/to/cesteral-mcp-servers/packages/dv360-mcp",
      "env": {
        "NODE_ENV": "development",
        "DV360_SERVICE_ACCOUNT_FILE": "/absolute/path/to/your/service-account.json",
        "LOG_LEVEL": "info",
        "MCP_LOG_LEVEL": "debug"
      }
    }
  }
}
```

**Replace:**

- `/absolute/path/to/cesteral-mcp-servers/...` with your actual project path
- `/absolute/path/to/your/service-account.json` with the path to your DV360 service account JSON file

**Why this approach?**

- ✅ Secure - credentials stored in a separate file
- ✅ Easy to rotate credentials
- ✅ Standard practice for Google Cloud tools
- ✅ Same credentials can be used by multiple projects

## Alternative: Base64-Encoded Credentials

If you prefer to embed credentials directly (e.g., for CI/CD):

```json
{
  "mcpServers": {
    "dv360-mcp-local": {
      "command": "node",
      "args": ["/absolute/path/to/cesteral-mcp-servers/packages/dv360-mcp/dist/index.js"],
      "cwd": "/absolute/path/to/cesteral-mcp-servers/packages/dv360-mcp",
      "env": {
        "NODE_ENV": "development",
        "DV360_SERVICE_ACCOUNT_JSON": "BASE64_ENCODED_SERVICE_ACCOUNT_JSON",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

To encode your service account:

```bash
cat service-account.json | base64
```

⚠️ **Note**: This approach is less secure and harder to maintain.

## Setup Steps

1. **Build the server:**

   ```bash
   cd packages/dv360-mcp
   pnpm run build
   ```

2. **Create/edit Claude Desktop config:**

   ```bash
   # macOS
   open ~/Library/Application\ Support/Claude/claude_desktop_config.json

   # Create if it doesn't exist
   mkdir -p ~/Library/Application\ Support/Claude
   touch ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

3. **Add the configuration** using one of the options above

4. **Restart Claude Desktop** completely (quit and reopen)

5. **Verify the connection:**
   - Open Claude Desktop
   - Look for the tools icon (🔨) in the text input area
   - Click it to see available MCP tools
   - You should see 8 dv360-mcp tools listed

## Available Tools in Claude Desktop

Once connected, you'll have access to these tools:

1. `dv360_list_entities` - List entities (campaigns, line items, etc.)
2. `dv360_get_entity` - Get a specific entity
3. `dv360_create_entity` - Create new entities
4. `dv360_update_entity` - Update existing entities
5. `dv360_delete_entity` - Delete entities
6. `dv360_adjust_line_item_bids` - Batch update bids
7. `dv360_bulk_update_status` - Batch update status

## Testing in Claude Desktop

Try these prompts to test the integration:

```
"List all my DV360 partners"
```

```
"Show me the campaigns for advertiser 12345"
```

```
"Get details for line item 67890"
```

## Troubleshooting

### Tools not showing in Claude Desktop

1. **Check Claude Desktop logs:**

   ```bash
   # macOS
   tail -100 ~/Library/Logs/Claude/mcp-server-dv360-mcp-local.log

   # Look for startup messages
   grep -E "(config|Loaded|Starting)" ~/Library/Logs/Claude/mcp-server-dv360-mcp-local.log
   ```

2. **Verify the build exists:**

   ```bash
   ls -la packages/dv360-mcp/dist/index.js
   ```

3. **Test the server locally:**
   ```bash
   cd packages/dv360-mcp
   node dist/index.js
   # Should show: "[config] Loaded .env..." or service account file loading
   # Then: "Starting in stdio mode..."
   # Press Ctrl+C to exit
   ```

### Authentication Errors

**Error: "DV360 service account credentials not configured"**

Check the logs to verify credentials are being loaded:

```bash
grep "SERVICE_ACCOUNT" ~/Library/Logs/Claude/mcp-server-dv360-mcp-local.log
```

Should show:

```
[config] DV360_SERVICE_ACCOUNT_JSON present: true, length: 3164
```

Or for file-based credentials:

```
Loading service account from file
```

**If credentials are not loaded:**

- Verify the path to your service account JSON file is correct and absolute
- Ensure the file exists and is readable: `cat /path/to/service-account.json`
- Check the service account has DV360 API access (see `SERVICE_ACCOUNT_SETUP.md`)

### Connection Errors

**"Server transport closed" or "EPIPE" errors:**

These typically indicate the server started but encountered an error. Common causes:

1. Missing dependencies: `pnpm install`
2. Outdated build: `pnpm run build`
3. TypeScript errors: `pnpm run typecheck`

## Understanding Server Modes

The dv360-mcp server supports two transport modes:

| Mode      | Use Case                         | How to Run           |
| --------- | -------------------------------- | -------------------- |
| **Stdio** | Claude Desktop local development | `node dist/index.js` |
| **HTTP**  | Production (Cloud Run), testing  | `pnpm run dev:http`  |

**Claude Desktop uses stdio mode** automatically when you specify a `command` in the config. All logs go to stderr, keeping the MCP protocol on stdout clean.

## Security Best Practices

✅ **Recommended:**

- Store service account credentials in a separate file outside the project
- Use absolute paths in configuration
- Set file permissions: `chmod 600 /path/to/service-account.json`
- Never commit `claude_desktop_config.json` to version control

⚠️ **Avoid:**

- Embedding credentials directly in config files
- Storing credentials in the project directory
- Committing any files with credentials to git

## Additional Resources

- [Claude Desktop MCP Documentation](https://docs.claude.com/docs/model-context-protocol)
- [dv360-mcp README](../README.md)
- [Service Account Setup Guide](./SERVICE_ACCOUNT_SETUP.md)
