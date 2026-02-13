# Platform to MCP Package Mapping

This table tracks current and planned ad-platform packages and their canonical workflow ownership.

## Current Platforms

| Platform | Package | Primary Purpose | Status |
|---|---|---|---|
| DV360 Reporting | `packages/dbm-mcp` | Bid Manager reporting and diagnostics | Active |
| DV360 Management | `packages/dv360-mcp` | DV360 entity creation/updates | Active |
| The Trade Desk | `packages/ttd-mcp` | TTD entity management and reporting | Active (expanding workflow contract coverage) |

## Planned/Target Platforms

| Platform | Proposed Package | Notes |
|---|---|---|
| Meta Ads | `packages/meta-mcp` | Use package template checklist before scaffolding |
| Google Ads | `packages/google-ads-mcp` | Prefer shared evaluator and telemetry contracts |
| Amazon DSP | `packages/amazon-dsp-mcp` | Include workflow IDs and mappings at package introduction |

## Rules

- New platform packages must be listed here before release.
- Each platform must map to at least one canonical `workflowId` in `docs/mcp-skill-contract.json`.
- Each platform must be represented in `docs/client-workflow-mappings.md` and validator coverage.
