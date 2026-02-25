# Design: Canonicalize FILTER_MEDIA_PLAN Across dbm-mcp

**Date:** 2026-02-25
**Status:** Approved
**Scope:** `packages/dbm-mcp`

## Problem

`FILTER_CAMPAIGN` is used throughout the codebase (API calls, type definitions, examples, prompts, resources, tests), but it does not appear in the generated Bid Manager API reference data (`bid-manager-reference.json` and `generated/filters.ts`). The canonical name in the generated reference is `FILTER_MEDIA_PLAN`, with `displayName: "Campaign ID"`. Since `BidManagerService` has never been tested against the live API with `FILTER_CAMPAIGN`, its correctness is uncertain.

## Decision

**Approach A — Full canonical replacement**: Replace every `FILTER_CAMPAIGN` with `FILTER_MEDIA_PLAN` across all layers. The generated reference is the authoritative source of truth.

`FilterTypeSchema` in `types.ts` already includes both; remove `FILTER_CAMPAIGN` from it. The `types-global/bid-manager.ts` union type also needs updating.

## Files to Change

| File | Change |
|------|--------|
| `src/services/bid-manager/BidManagerService.ts` | 4 usages in groupBys/filters → `FILTER_MEDIA_PLAN` |
| `src/services/bid-manager/types.ts` | Remove `FILTER_CAMPAIGN` from `FilterTypeSchema` enum |
| `src/types-global/bid-manager.ts` | Replace in `FilterType` union |
| `src/generated/compatibility-rules.ts` | Update comment string |
| `src/mcp-server/tools/definitions/run-custom-query.tool.ts` | 2 description strings |
| `src/mcp-server/prompts/definitions/custom-query-workflow.prompt.ts` | 3 occurrences |
| `src/mcp-server/prompts/definitions/troubleshoot-report.prompt.ts` | 2 occurrences |
| `src/mcp-server/resources/definitions/filter-types.resource.ts` | 3 example occurrences |
| `src/mcp-server/resources/definitions/query-examples.resource.ts` | ~8 example occurrences |
| `src/mcp-server/resources/definitions/report-types.resource.ts` | 1 example |
| `tests/services/bid-manager-service.test.ts` | 3 test fixtures |

## Validation

- `pnpm run typecheck` must pass in `packages/dbm-mcp`
- `pnpm run test` must pass in `packages/dbm-mcp`
- No remaining `FILTER_CAMPAIGN` references (except `FILTER_CAMPAIGN_DAILY_FREQUENCY` which is a different, valid filter)
