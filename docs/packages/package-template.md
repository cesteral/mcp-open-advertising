# MCP Package Template Checklist

Use this checklist when adding a new MCP package (for example `meta-mcp`, `google-ads-mcp`, `amazon-dsp-mcp`).

## Package Setup

- Create package under `packages/{platform}-mcp`.
- Add README with tools, prompts/resources, and usage examples.
- Register package in workspace config and build scripts.

## MCP Surface

- Implement tool definitions and register through shared factory.
- Add prompts/resources only when they provide reusable workflow value.
- Keep schemas safe for stdio limits; prefer resources for large schemas.

## Contract and Mapping

- Add/extend workflow IDs in `docs/mcp-skill-contract.json`.
- Update human contract in `docs/mcp-skill-contract.md`.
- Add client mapping entries in `docs/client-workflow-mappings.md`.
- Ensure adapter skills keep required output sections unchanged.

## Validation

- Extend `scripts/validate-skill-adapters.mjs` package registry.
- Validate prompt/resource references for the new package.
- Run `pnpm run validate:skills`.

## Telemetry and Refinement

- Emit required tool/evaluator attributes from telemetry governance.
- Start evaluator in observe-only mode.
- Define package rollout gates and rollback trigger.

## Rollout

- Stage 1: observe-only
- Stage 2: controlled enablement on selected workflows
- Stage 3: default enablement with per-workflow kill switch
