# amazon-dsp-mcp 1.2.0 — Commitment Testkit Coverage

**Date:** 2026-05-28
**Package:** `@cesteral/amazon-dsp-mcp`
**Target version:** `1.2.0` (repo tag `v1.4.0`)

## Goal

Ship `amazon-dsp-mcp@1.2.0` with canonical state-transition fixtures for the v1 commitment surface so that downstream `cesteral-intelligence` `generate:fixture-coverage` promotes `amazon_dsp_update_commitment` from structural to attested trust on first publish.

## Current state

PR #42 added the seven commitment tools, including governed `amazon_dsp_update_commitment` with a native-first dry-run via `runCommitmentUpdateDryRun` (`src/mcp-server/tools/utils/commitment-dry-run.ts`). The package testkit (`src/testkit/`) covers Round 2 `update_entity` operations on `order` + `lineItem` only:

- `AmazonDspOperation = "update_budget" | "pause" | "resume"`
- `AmazonDspEntityKindKey = "order" | "lineItem"`
- 6 fixtures total — one per (operation, entityKind) pair
- `assertContract` dispatches all fixtures through `applyAmazonDspPatch` in `dry-run.ts`

Tagging `v1.4.0` today would publish the commitment tools but ship an empty commitment slot in the testkit. Downstream attestation requires coverage parity.

## Non-goals

- New commitment tools — Round 1 of the commitment surface is complete.
- Live-capture fixture generation script — deferred (consistent with Round 2; one fixture per axis is hand-authored).
- Backfilling other Amazon DSP write tools (e.g., line-item creative attach) into the testkit.
- Changes to `applyAmazonDspPatch` or its existing fixtures.

## Design

### 1. Type widening — `src/testkit/types.ts`

- `AmazonDspOperation`: add `"update"`. Matches the operation label returned by `resolveCommitmentDispatchedCapability()` in `commitment-dry-run.ts`.
- `AmazonDspEntityKindKey`: add `"commitment"`.
- `AmazonDspFixtureArgs` stays as-is. For commitment fixtures, `entityType: "commitment"` (widened union) and `entityId` holds the commitment ID. The type-name `entityType` slightly fibs about its scope, but `assertContract` already dispatches on `entityKind`, so no consumer reads `entityType` semantically — it is only forwarded to the symbolic-apply call. Avoids a discriminated-union refactor that would break the public `AmazonDspWriteFixture` shape downstream.

### 2. Symbolic-apply wrapper — `src/mcp-server/tools/utils/commitment-dry-run.ts`

Add a single thin exported function:

```ts
export function applyCommitmentPatch(
  commitmentId: string,
  profileId: string,
  preState: Partial<DSPCommitmentT>,
  data: Partial<DSPCommitmentUpdateT>
): NormalizedEntitySnapshot {
  return buildCommitmentSnapshot(commitmentId, profileId, preState, data);
}
```

Pure delegation. Exists for symmetry with `applyAmazonDspPatch` so downstream consumers can import a flat `apply*Patch` per platform. Re-exported from `src/testkit/index.ts`.

### 3. Dispatch in `assertContract` — `src/testkit/index.ts`

Branch on `fixture.entityKind`:

- `"commitment"` → `applyCommitmentPatch(args.entityId, args.profileId, preState, args.data)`
- otherwise → existing `applyAmazonDspPatch(args.entityType, args.entityId, preState, args.data)`

Deep-equal check via stable JSON unchanged. Mismatch-message format unchanged.

### 4. Fixtures — `src/testkit/fixtures/commitment.ts`

Four hand-authored fixtures, scrubbed IDs (`cmt-REDACTED-{1..4}`), advertiser currency USD. One per axis the dry-run validates or the canonical snapshot exposes:

| # | Description | Patch | Pins |
|---|---|---|---|
| 1 | committedSpend $1,000,000 → $1,500,000 | `{ committedSpend: 1500000 }` | `budget.lifetime.amountMinor` major→minor conversion (×100); `accountId` = `profileId` |
| 2 | fulfillmentLevel LEVEL_0 → LEVEL_5 | `{ fulfillmentLevel: "LEVEL_5" }` | Canonical snapshot invariance — non-snapshot fields round-trip without dirtying `budget` / `schedule` |
| 3 | spendCalculationMode ADVERTISER_ACCOUNT → CAMPAIGN | `{ spendCalculationMode: "CAMPAIGN" }` | Same invariance contract; second axis |
| 4 | schedule extend endDateTime 2026-06-30 → 2026-12-31 | `{ endDateTime: "2026-12-31T23:59:59Z" }` | `schedule.endAt` propagation; `displayName` from `commitmentName`; status defaulting to `{ canonical: "active", platformRaw: "ACTIVE" }` |

All pre-states are realistic `DSPCommitmentT` shapes (`commitmentId`, `commitmentName`, `committedSpend`, `currencyCode`, `startDateTime`, `endDateTime`, `fulfillmentLevel`, `spendCalculationMode`). All `expectedPostState`s are `NormalizedEntitySnapshot` with `entityKind: "commitment"`, `platform: "amazon_dsp"`, `accountId: profileId`, `status: { canonical: "active", platformRaw: "ACTIVE" }`.

Add the file to `allFixtures` via `src/testkit/fixtures/index.ts` (currently a single file; refactor to a barrel that re-exports `entity.ts` + `commitment.ts` and concatenates `allFixtures`).

### 5. Conformance — `tests/testkit/conformance.test.ts`

Single edit to the round-coverage assertion:

```ts
expect(pairs).toContain("update::commitment");
```

The `it.each(fixtures.map(...))` block already iterates `getFixtures()` and runs `assertContract` per fixture, so the four new fixtures get exercised automatically. `getFixtures(operation)` / `getFixtures(undefined, entityKind)` filter assertions cover the new dimensions for free.

### 6. Release

- Bump `packages/amazon-dsp-mcp/package.json` `version` → `1.2.0`. No other package version edits.
- Commit on `main`, tag `v1.4.0`, push tag.
- `release.yml` runs build / typecheck / test / `publish-all.sh --provenance` / `mcp-publisher`. `npm publish` is idempotent per (name, version), so only `@cesteral/amazon-dsp-mcp@1.2.0` is emitted. GitHub Release auto-noted from commits between `v1.3.x` and `v1.4.0`.

The repo tag string is a release marker, not a per-package version. The downstream governance system reads each package's published `definitionHash` from the manifest; the only thing that drives commitment-tool attestation is the testkit fixtures landing in the `@cesteral/amazon-dsp-mcp@1.2.0` tarball.

## Risks

| Risk | Mitigation |
|---|---|
| `applyCommitmentPatch` shape drift from `applyAmazonDspPatch` (different positional args — commitment lacks `entityType`) | Explicit JSDoc on both functions; `assertContract`'s `entityKind` branch is the only in-repo call site, so the drift is contained to one switch |
| Downstream `cesteral-intelligence` doesn't dispatch on `entityKind` and tries to call `applyAmazonDspPatch` for commitment fixtures | Re-export `applyCommitmentPatch` from `@cesteral/amazon-dsp-mcp/testkit` so consumers can mirror the dispatch. Coordinate downstream PR after publish |
| `cmt-REDACTED-*` fixture IDs conflict with real test data downstream | `REDACTED` infix is unmistakably synthetic; consistent with `ord-REDACTED-*` / `li-REDACTED-*` convention |
| `buildCommitmentSnapshot` currency-fallback to `"USD"` causes a fixture to drift if upstream API ever returns no `currencyCode` | All four fixtures set `currencyCode: "USD"` explicitly in `preState`, so the fallback is not exercised — the fixtures pin the present-`currencyCode` branch only. Currency-omitted case is unit-test territory, not fixture |
| Conformance test pair-set drifts from `AmazonDspOperation × AmazonDspEntityKindKey` Cartesian product | Pair set is hand-maintained; current state has 6 explicit entries + 1 new — small enough to keep accurate without a generator |

## Verification before tag push

1. `pnpm --filter @cesteral/amazon-dsp-mcp run test` — green; 10 fixtures via conformance loop + existing dry-run + tool unit tests
2. `pnpm run build` + `pnpm run typecheck` — green workspace-wide
3. `node -e "import('./packages/amazon-dsp-mcp/dist/testkit/index.js').then(m => console.log(m.getFixtures().length, m.getFixtures('update', 'commitment').length))"` — prints `10 4`
4. `pnpm pack --filter @cesteral/amazon-dsp-mcp` and inspect tarball — `dist/testkit/fixtures/commitment.js` + `.d.ts` present
5. `pnpm run generate:manifests` — `dist/cesteral-manifest.json` for amazon-dsp-mcp still includes `amazon_dsp_update_commitment` with stable `definitionHash` (no schema change in this release)

## Open questions

None. Decisions logged:
- Fixture count: 4, one per validated/snapshot axis.
- Args shape: widen union, don't refactor to discriminated union.
- Wrapper symmetry: add `applyCommitmentPatch` for parity with `applyAmazonDspPatch`.
- Conformance: extend existing test file, do not split.
- Release: bump package only; tag `v1.4.0`.
