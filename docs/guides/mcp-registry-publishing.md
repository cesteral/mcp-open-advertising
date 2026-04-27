# MCP Registry Publishing

Guide for validating and publishing Cesteral MCP servers to the [MCP Registry](https://modelcontextprotocol.io/registry/quickstart).

## Architecture

Server metadata lives in two places with a clear ownership boundary:

| File                      | Role                                                                                         | Committed |
| ------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| `registry.json`           | Canonical source of rich metadata (tools, resources, prompts, auth, tags) for all 13 servers | Yes       |
| `packages/*/server.json`  | Official MCP Registry manifest (generated from `registry.json` + `package.json`)             | Yes       |
| `packages/*/package.json` | Contains `mcpName` for registry ownership verification                                       | Yes       |

`server.json` files are **generated artifacts** — never edit them by hand.

### Generated server.json Fields

| Field         | Source                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `$schema`     | Hard-coded MCP Registry schema URL                                                                         |
| `name`        | `mcpName` from `package.json`                                                                              |
| `title`       | `title` from `registry.json` server entry                                                                  |
| `description` | `description` from `registry.json` server entry                                                            |
| `repository`  | `repository` from `registry.json` (top-level)                                                              |
| `version`     | `version` from `package.json`                                                                              |
| `remotes`     | Streamable HTTP transport with `{host}` template variable, URL from `remoteUrlTemplate` in `registry.json` |
| `packages`    | npm package with stdio transport, identifier from `package.json` `name`                                    |

## Workflow

### Adding or renaming tools

1. Create/modify tool files in `src/mcp-server/tools/definitions/`
2. Register in `src/mcp-server/tools/index.ts`
3. Run `pnpm run sync:registry-tools` to update the `tools` array for the server in `registry.json`
4. No changes needed to `server.json` — tool lists are in `registry.json`, not in the generated manifests

### Bumping a version

1. Update `version` in the server's `package.json`
2. Regenerate: `pnpm run generate:registry`
3. Commit both `package.json` and `server.json`

### Regenerating manifests

```bash
pnpm run generate:registry    # Regenerate all server.json files
pnpm run check:registry       # Verify committed files match generator output (CI)
pnpm run sync:registry-tools  # Sync registry.json tool lists from tool definitions
pnpm run check:registry-tools # Verify registry.json tool lists match source definitions (CI)
```

## Validation

### Check manifests are up to date

```bash
pnpm run check:registry
pnpm run check:registry-tools
```

These checks compare each committed `server.json` against what the manifest generator would produce and each `registry.json` tool list against the source tool definitions. Non-zero exit if any file is stale or missing — safe for CI gates.

### Check capability resources

For servers with large tool surfaces, keep `server-capabilities://{server}/overview` grouped by user workflow rather than by implementation file. The overview should list every registered tool exactly once where practical. Any tool left in `ungroupedTools` is a signal that the progressive-discovery surface needs maintenance.

### Validate JSON syntax

```bash
for f in packages/*/server.json; do
  echo "Validating $f..."
  python3 -m json.tool "$f" > /dev/null && echo "  OK" || echo "  INVALID"
done
```

## Publishing

Install the `mcp-publisher` CLI:

```bash
brew install mcp-publisher
# or: curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
```

Authenticate and publish each server:

```bash
mcp-publisher login github

# Publish a single server
cd packages/dv360-mcp && mcp-publisher publish

# Or publish all
for dir in packages/*-mcp; do
  echo "Publishing $(basename $dir)..."
  (cd "$dir" && mcp-publisher publish)
done
```

### Prerequisites

- npm packages must be published first (`npm publish --access public`)
- Each `package.json` must have `mcpName` matching `name` in `server.json`
- GitHub auth requires `mcpName` starting with `io.github.cesteral/`

## Current Servers

| Server           | mcpName                             | Tools |
| ---------------- | ----------------------------------- | ----- |
| `dbm-mcp`        | `io.github.cesteral/dbm-mcp`        | 6     |
| `dv360-mcp`      | `io.github.cesteral/dv360-mcp`      | 25    |
| `ttd-mcp`        | `io.github.cesteral/ttd-mcp`        | 55    |
| `gads-mcp`       | `io.github.cesteral/gads-mcp`       | 15    |
| `meta-mcp`       | `io.github.cesteral/meta-mcp`       | 26    |
| `linkedin-mcp`   | `io.github.cesteral/linkedin-mcp`   | 20    |
| `tiktok-mcp`     | `io.github.cesteral/tiktok-mcp`     | 23    |
| `cm360-mcp`      | `io.github.cesteral/cm360-mcp`      | 20    |
| `sa360-mcp`      | `io.github.cesteral/sa360-mcp`      | 16    |
| `pinterest-mcp`  | `io.github.cesteral/pinterest-mcp`  | 22    |
| `snapchat-mcp`   | `io.github.cesteral/snapchat-mcp`   | 22    |
| `amazon-dsp-mcp` | `io.github.cesteral/amazon-dsp-mcp` | 18    |
| `msads-mcp`      | `io.github.cesteral/msads-mcp`      | 24    |
