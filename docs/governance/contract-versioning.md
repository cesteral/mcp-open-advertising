# Contract Versioning

This document defines versioning rules for `docs/mcp-skill-contract.json`.

## Version Format

Use semantic versioning: `MAJOR.MINOR.PATCH`.

## Versioning Rules

- PATCH: typo fixes, clarifications, non-functional metadata updates.
- MINOR: additive non-breaking changes (new workflow IDs, new optional fields).
- MAJOR: breaking changes (workflow removal, required section rename/removal).

## Breaking Change Policy

A release is breaking if it changes any of the following:

- Existing `workflowIds`
- Existing `requiredOutputSections`
- Existing prompt/resource requirements relied on by adapters

Breaking changes require:

1. Migration notes in `docs/mcp-skill-contract.md`.
2. Updates in `docs/client-workflow-mappings.md`.
3. Validator updates in `scripts/validate-skill-adapters.mjs`.
4. Explicit approval from contract owners.

## Deprecation Process

1. Mark workflow as deprecated in docs.
2. Keep validator compatibility for one release cycle.
3. Remove only after adapters and package references are migrated.

## Future Platform Addition Policy

Adding a new platform package requires at least a MINOR version bump if new canonical workflows are introduced.
