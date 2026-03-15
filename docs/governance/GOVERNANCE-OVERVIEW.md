# Governance Overview

This directory defines governance standards for MCP workflows and telemetry across all platform packages in this monorepo.

## Scope

- Applies to `dbm-mcp`, `dv360-mcp`, `ttd-mcp`, `gads-mcp`, `meta-mcp`, `linkedin-mcp`, `tiktok-mcp`, and any future platform package.
- Covers how workflow contracts are updated and validated.
- Covers telemetry requirements for observability.

## Governance Documents

- `docs/governance/telemetry-governance.md` — telemetry contract (partially implemented)
- `docs/guides/package-template.md`
- `docs/guides/platform-mapping.md`

## Operating Model

1. Route changes through risk-based approval (see Change Classes below).
2. Deploy changes with monitoring and rollback criteria.
3. Measure impact and keep or roll back.

## Ownership

- Shared platform maintainers own shared interfaces and validation gates.
- Package owners own package-level prompt/resource/tool fidelity.

## Change Classes

- Low risk: wording/order refinements in prompts and docs.
- Medium risk: new prompts/resources or non-breaking tool changes.
- High risk: breaking tool changes, resource URI renames, removals.

## Required CI Gates

- Package typecheck/build checks
- `pnpm run test`

## New Platform Rule

Every new platform package must add:

- Platform entry in `docs/guides/platform-mapping.md`
- MCP prompts for core workflows
- MCP resources for entity schemas and examples
