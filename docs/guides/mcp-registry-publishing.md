# MCP Registry Publishing

Guide for validating and publishing Cesteral MCP servers to the MCP Registry.

## server.json Manifests

Each server has a `server.json` file in its package directory (`packages/{server-name}/server.json`) containing metadata for the MCP Registry.

### Fields

| Field | Description |
|-------|-------------|
| `name` | npm-style scoped package name (e.g., `@cesteral/dv360-mcp`) |
| `display_name` | Human-readable server name |
| `description` | Brief description of capabilities |
| `version` | Semantic version |
| `protocol_version` | MCP protocol version supported |
| `transports` | Array of supported transports (`streamable-http`, `stdio`) |
| `tools` | Array of tool names (must match `allTools` in code) |
| `resources` | Array of resource URIs |
| `prompts` | Array of prompt names |
| `auth` | Object with `modes` array listing supported auth modes |
| `repository` | GitHub repository URL |
| `license` | SPDX license identifier |
| `tags` | Array of discovery tags |

## Validation

### Verify tool names match code

Cross-reference `server.json` tool names with the actual `allTools` array in each server's `src/mcp-server/tools/index.ts`:

```bash
# For a specific server, compare tool names
cd packages/dv360-mcp
grep -o '"dv360_[a-z_]*"' server.json | sort > /tmp/json-tools.txt
grep 'name:' src/mcp-server/tools/definitions/*.tool.ts | grep -o '"dv360_[a-z_]*"' | sort > /tmp/code-tools.txt
diff /tmp/json-tools.txt /tmp/code-tools.txt
```

### Validate JSON syntax

```bash
for f in packages/*/server.json; do
  echo "Validating $f..."
  python3 -m json.tool "$f" > /dev/null && echo "  OK" || echo "  INVALID"
done
```

### Check required fields

Every `server.json` must have: `name`, `display_name`, `description`, `version`, `protocol_version`, `transports`, `tools`, `auth`, `repository`, `license`.

## Submitting to the Registry

1. Validate all `server.json` files (see above)
2. Ensure the repository is public and accessible
3. Follow the MCP Registry submission process at [modelcontextprotocol.io](https://modelcontextprotocol.io)
4. Submit each server individually with its `server.json` metadata

## Updating After Adding Tools

When adding a new tool to a server:

1. Create the tool file in `src/mcp-server/tools/definitions/`
2. Register it in `src/mcp-server/tools/index.ts`
3. Add the tool name to `server.json` in the `tools` array
4. Bump the `version` field if publishing an update
5. Re-validate the manifest

## Current Server Manifests

| Server | Tools | Status |
|--------|-------|--------|
| `dbm-mcp` | 5 | Validated |
| `dv360-mcp` | 23 | Validated |
| `ttd-mcp` | 21 | Validated |
| `gads-mcp` | 14 | Validated |
| `meta-mcp` | 20 | Validated |
| `linkedin-mcp` | 20 | Validated |
| `tiktok-mcp` | 23 | Validated |
| `cm360-mcp` | 16 | Validated |
| `sa360-mcp` | 11 | Validated |
| `pinterest-mcp` | 20 | Validated |
| `snapchat-mcp` | 21 | Validated |
| `amazon-dsp-mcp` | 20 | Validated |
| `msads-mcp` | 19 | Validated |
