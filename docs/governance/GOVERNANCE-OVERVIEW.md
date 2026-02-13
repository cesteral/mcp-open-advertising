# Governance Overview

This directory defines governance standards for MCP workflows, telemetry, and skill/playbook refinement across all platform packages in this monorepo.

## Scope

- Applies to `dbm-mcp`, `dv360-mcp`, `ttd-mcp`, and any future platform package.
- Covers how workflow contracts are updated and validated.
- Covers how interaction findings become approved playbook updates.
- Covers telemetry requirements for evaluator feedback loops.

## Governance Documents

- `docs/governance/refinement-governance.md`
- `docs/governance/telemetry-governance.md`
- `docs/governance/contract-versioning.md`
- `docs/governance/phased-rollout.md`
- `docs/packages/package-template.md`
- `docs/packages/platform-mapping.md`

## Operating Model

1. Capture LLM -> MCP interaction findings (errors, retries, inefficiencies).
2. Classify findings with shared taxonomy and confidence level.
3. Propose playbook/workflow updates as versioned deltas.
4. Route changes through risk-based approval.
5. Deploy changes with monitoring and rollback criteria.

## Ownership

- Shared platform maintainers own shared interfaces and validation gates.
- Package owners own package-level prompt/resource/tool fidelity.
- Contract owners approve breaking workflow contract changes.

## Change Classes

- Low risk: wording/order refinements in adapters and docs.
- Medium risk: workflow section updates or new non-breaking workflow IDs.
- High risk: breaking contract changes, required section renames, removals.

## Required CI Gates

- `pnpm run validate:skills`
- Package typecheck/build checks
- Contract/mapping consistency checks

## New Platform Rule

Every new platform package must add:

- Platform entry in `docs/packages/platform-mapping.md`
- Canonical workflow IDs in `docs/mcp-skill-contract.json`
- Client mapping entries in `docs/client-workflow-mappings.md`
- Validator coverage in `scripts/validate-skill-adapters.mjs`
