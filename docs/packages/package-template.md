# MCP Package Template Checklist

Use this checklist when adding a new MCP package (for example `amazon-dsp-mcp`).

## Package Setup

- Create package under `packages/{platform}-mcp`.
- Add README with tools, prompts/resources, and usage examples.
- Register package in workspace config and build scripts.

## MCP Surface

- Implement tool definitions and register through shared factory.
- Add prompts for core workflows (campaign setup, entity updates, troubleshooting, reporting).
- Add resources for entity schemas, examples, and reference data.
- Keep schemas safe for stdio limits; prefer resources for large schemas.

## Validation

- Validate prompt/resource references for the new package.
- Ensure cross-server contract tests pass.
- Run `pnpm run test`.
