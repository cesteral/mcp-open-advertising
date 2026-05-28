# amazon-dsp-mcp 1.2.0 Commitment Testkit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `@cesteral/amazon-dsp-mcp@1.2.0` with canonical state-transition fixtures for the v1 commitment surface so downstream `cesteral-intelligence` promotes `amazon_dsp_update_commitment` to attested trust on first publish.

**Architecture:** Extend `AmazonDspOperation` with `"update"` and `AmazonDspEntityKindKey` with `"commitment"`. Add a thin `applyCommitmentPatch` wrapper around `buildCommitmentSnapshot`. Teach `assertContract` to dispatch by `entityKind`. Ship 4 hand-authored fixtures (one per validated/snapshot axis). Bump the package, tag `v1.4.0`, let `release.yml` handle publish.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, Turborepo. Source of truth design doc: `docs/plans/2026-05-28-amazon-dsp-commitment-testkit-design.md`.

---

## Pre-flight

You are on `main` at commit `0847b601`. The design doc is already committed. All work happens in `packages/amazon-dsp-mcp/`. Use a worktree if you want isolation (`@superpowers:using-git-worktrees`) — otherwise work directly on `main` and push the tag at the end.

Read these files end-to-end before starting:
- `packages/amazon-dsp-mcp/src/testkit/types.ts`
- `packages/amazon-dsp-mcp/src/testkit/index.ts`
- `packages/amazon-dsp-mcp/src/testkit/fixtures/index.ts`
- `packages/amazon-dsp-mcp/src/mcp-server/tools/utils/commitment-dry-run.ts`
- `packages/amazon-dsp-mcp/tests/testkit/conformance.test.ts`

---

### Task 1: Extend conformance test to require `update::commitment` pair (RED)

Write the failing assertion first — this is the contract every subsequent task is making green.

**Files:**
- Modify: `packages/amazon-dsp-mcp/tests/testkit/conformance.test.ts:24-32`

**Step 1: Add the new pair assertion**

In the `it("ships at least one fixture per round-2 (operation, entityKind) pair", ...)` block, add one line:

```ts
expect(pairs).toContain("update::commitment");
```

Insert it after the existing six `expect(pairs).toContain(...)` lines, before the closing `});`. Update the test name from `"round-2"` to `"governed surfaces"` to reflect that commitment is Round 3-ish for this package, not Round 2:

```ts
it("ships at least one fixture per governed (operation, entityKind) pair", () => {
```

**Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cesteral/amazon-dsp-mcp test -- conformance`
Expected: FAIL — `expected Set { ... } to contain "update::commitment"`.

**Step 3: Commit the red test**

```bash
git add packages/amazon-dsp-mcp/tests/testkit/conformance.test.ts
git commit -m "test(amazon-dsp): require update::commitment in testkit conformance (RED)"
```

---

### Task 2: Widen testkit union types

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/testkit/types.ts:21,27`

**Step 1: Widen `AmazonDspOperation`**

Change line 21 from:

```ts
export type AmazonDspOperation = "update_budget" | "pause" | "resume";
```

to:

```ts
export type AmazonDspOperation = "update_budget" | "pause" | "resume" | "update";
```

Update the JSDoc above (lines 16–20) — current text says "round-2 governance". Replace with:

```ts
/**
 * Canonical operation labels across governed Amazon DSP write surfaces.
 * `update_budget` / `pause` / `resume` belong to `amazon_dsp_update_entity`
 * (order + lineItem). `update` is the commitment surface's single operation
 * and matches `resolveCommitmentDispatchedCapability()` in commitment-dry-run.ts.
 * Fixtures pin one operation each so consumers can filter.
 */
```

**Step 2: Widen `AmazonDspEntityKindKey`**

Change line 27 from:

```ts
export type AmazonDspEntityKindKey = "order" | "lineItem";
```

to:

```ts
export type AmazonDspEntityKindKey = "order" | "lineItem" | "commitment";
```

Update the JSDoc above (lines 23–26):

```ts
/**
 * Governed entity kinds, labelled with the upstream input key. `order` is the
 * campaign-level object and `lineItem` the ad-group-level object (both via
 * `amazon_dsp_update_entity`'s `entityType` input). `commitment` is the v1
 * commitment surface (via `amazon_dsp_update_commitment`'s `commitmentId` input);
 * commitment fixtures stash the commitment ID in `AmazonDspFixtureArgs.entityId`
 * so the fixture-args shape stays uniform.
 */
```

**Step 3: Typecheck**

Run: `pnpm --filter @cesteral/amazon-dsp-mcp typecheck`
Expected: PASS.

Run: `pnpm --filter @cesteral/amazon-dsp-mcp test -- conformance`
Expected: still FAIL on the `update::commitment` pair check — type widening alone doesn't add a fixture.

**Step 4: Commit**

```bash
git add packages/amazon-dsp-mcp/src/testkit/types.ts
git commit -m "feat(amazon-dsp): widen testkit unions for commitment surface"
```

---

### Task 3: Add `applyCommitmentPatch` wrapper

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/mcp-server/tools/utils/commitment-dry-run.ts` (append after `buildCommitmentSnapshot`, around line 154)

**Step 1: Add the wrapper**

Insert this block immediately after `buildCommitmentSnapshot` closes (after line 154):

```ts
/**
 * Symbolic-apply entry point for testkit fixtures. Thin wrapper over
 * `buildCommitmentSnapshot`, parallel in shape to `applyAmazonDspPatch` in
 * `dry-run.ts`. Re-exported from `@cesteral/amazon-dsp-mcp/testkit`.
 *
 * Pure: no I/O, no upstream calls. Used by `assertContract` when
 * `fixture.entityKind === "commitment"`.
 */
export function applyCommitmentPatch(
  commitmentId: string,
  profileId: string,
  preState: Partial<DSPCommitmentT>,
  data: Partial<DSPCommitmentUpdateT>
): NormalizedEntitySnapshot {
  return buildCommitmentSnapshot(commitmentId, profileId, preState, data);
}
```

**Step 2: Typecheck**

Run: `pnpm --filter @cesteral/amazon-dsp-mcp typecheck`
Expected: PASS.

**Step 3: Commit**

```bash
git add packages/amazon-dsp-mcp/src/mcp-server/tools/utils/commitment-dry-run.ts
git commit -m "feat(amazon-dsp): add applyCommitmentPatch symbolic-apply entry"
```

---

### Task 4: Dispatch on `entityKind` in `assertContract` and re-export the wrapper

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/testkit/index.ts`

**Step 1: Add the import + re-export**

Above the existing `import { applyAmazonDspPatch } from "../mcp-server/tools/utils/dry-run.js";` line, add:

```ts
import { applyCommitmentPatch } from "../mcp-server/tools/utils/commitment-dry-run.js";
```

In the `export { applyAmazonDspPatch } from "../mcp-server/tools/utils/dry-run.js";` block (line 29), add a sibling re-export immediately below:

```ts
export { applyCommitmentPatch } from "../mcp-server/tools/utils/commitment-dry-run.js";
```

**Step 2: Branch the dispatch in `assertContract`**

Replace the symbolic-apply call inside `assertContract` (currently lines 65–70):

```ts
  const got = applyAmazonDspPatch(
    fixture.args.entityType,
    fixture.args.entityId,
    fixture.preState,
    fixture.args.data
  );
```

with:

```ts
  const got =
    fixture.entityKind === "commitment"
      ? applyCommitmentPatch(
          fixture.args.entityId,
          fixture.args.profileId,
          fixture.preState,
          fixture.args.data
        )
      : applyAmazonDspPatch(
          fixture.args.entityType,
          fixture.args.entityId,
          fixture.preState,
          fixture.args.data
        );
```

**Step 3: Typecheck + run conformance**

Run: `pnpm --filter @cesteral/amazon-dsp-mcp typecheck`
Expected: PASS.

Run: `pnpm --filter @cesteral/amazon-dsp-mcp test -- conformance`
Expected: still FAIL on `update::commitment` pair check (no fixture yet — but the dispatch is now ready to receive one).

**Step 4: Commit**

```bash
git add packages/amazon-dsp-mcp/src/testkit/index.ts
git commit -m "feat(amazon-dsp): dispatch testkit assertContract by entityKind"
```

---

### Task 5: Refactor `fixtures/index.ts` into a barrel

The existing `src/testkit/fixtures/index.ts` mixes the six entity fixtures and the `allFixtures` export. Split so commitment fixtures live in their own file.

**Files:**
- Rename: `packages/amazon-dsp-mcp/src/testkit/fixtures/index.ts` → `packages/amazon-dsp-mcp/src/testkit/fixtures/entity.ts`
- Create: `packages/amazon-dsp-mcp/src/testkit/fixtures/index.ts` (new barrel)

**Step 1: Rename the existing file**

```bash
git mv packages/amazon-dsp-mcp/src/testkit/fixtures/index.ts packages/amazon-dsp-mcp/src/testkit/fixtures/entity.ts
```

**Step 2: Remove `allFixtures` from `entity.ts`**

In the freshly renamed `entity.ts`, delete the final block:

```ts
export const allFixtures: readonly AmazonDspWriteFixture[] = [
  updateBudgetOrder,
  updateBudgetLineItem,
  pauseOrder,
  pauseLineItem,
  resumeOrder,
  resumeLineItem,
];
```

Update the file-header JSDoc opening line to:

```
 * Canonical state-transition fixtures for the `amazon_dsp_update_entity`
 * write surface (order + lineItem).
```

**Step 3: Create the new barrel**

Create `packages/amazon-dsp-mcp/src/testkit/fixtures/index.ts`:

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Fixture barrel. Concatenates per-surface fixture modules into the public
 * `allFixtures` registry consumed by `getFixtures()` and `assertContract`.
 */

import type { AmazonDspWriteFixture } from "../types.js";
import {
  updateBudgetOrder,
  updateBudgetLineItem,
  pauseOrder,
  pauseLineItem,
  resumeOrder,
  resumeLineItem,
} from "./entity.js";

export * from "./entity.js";

export const allFixtures: readonly AmazonDspWriteFixture[] = [
  updateBudgetOrder,
  updateBudgetLineItem,
  pauseOrder,
  pauseLineItem,
  resumeOrder,
  resumeLineItem,
];
```

**Step 4: Verify nothing regressed**

Run: `pnpm --filter @cesteral/amazon-dsp-mcp test -- conformance`
Expected: still 6 fixtures pass, `update::commitment` pair check still FAILS.

**Step 5: Commit**

```bash
git add packages/amazon-dsp-mcp/src/testkit/fixtures/
git commit -m "refactor(amazon-dsp): split testkit fixtures into per-surface modules"
```

---

### Task 6: Add commitment fixture 1 — `committedSpend` change (first GREEN)

**Files:**
- Create: `packages/amazon-dsp-mcp/src/testkit/fixtures/commitment.ts`
- Modify: `packages/amazon-dsp-mcp/src/testkit/fixtures/index.ts`

**Step 1: Create the commitment fixture file with fixture 1**

Create `packages/amazon-dsp-mcp/src/testkit/fixtures/commitment.ts`:

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for the `amazon_dsp_update_commitment`
 * write surface. Mirrors `entity.ts` in shape; the symbolic apply runs through
 * `applyCommitmentPatch` (re-exported from the testkit index).
 *
 * Amazon's v1 commitment endpoint replaces provided fields, so each fixture's
 * `expectedPostState` is the shallow merge of `preState` + `args.data`, then
 * normalised by `buildCommitmentSnapshot`. `committedSpend` is in advertiser
 * currency major units; the canonical snapshot's `budget.lifetime.amountMinor`
 * is ×100.
 *
 * One fixture per axis the dry-run validates or the canonical snapshot exposes:
 * (1) committedSpend, (2) fulfillmentLevel, (3) spendCalculationMode,
 * (4) endDateTime extend.
 */

import type { AmazonDspWriteFixture } from "../types.js";

const profileId = "advertiser-REDACTED-001";

/** update: commitment committedSpend increase ($1,000,000 → $1,500,000). */
export const updateCommittedSpend: AmazonDspWriteFixture = {
  operation: "update",
  entityKind: "commitment",
  args: {
    entityType: "commitment",
    profileId,
    entityId: "cmt-REDACTED-1",
    data: { committedSpend: 1_500_000 },
  },
  preState: {
    commitmentId: "cmt-REDACTED-1",
    commitmentName: "Sample Commitment 1",
    committedSpend: 1_000_000,
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-12-31T23:59:59Z",
    fulfillmentLevel: "LEVEL_0",
    spendCalculationMode: "ADVERTISER_ACCOUNT",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: "cmt-REDACTED-1",
    displayName: "Sample Commitment 1",
    accountId: profileId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 150_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T23:59:59Z" },
  },
  description: "update: commitment committedSpend increase $1,000,000 → $1,500,000",
};

export const allCommitmentFixtures: readonly AmazonDspWriteFixture[] = [updateCommittedSpend];
```

**Step 2: Wire it into the barrel**

Modify `packages/amazon-dsp-mcp/src/testkit/fixtures/index.ts`. Add the import:

```ts
import { allCommitmentFixtures } from "./commitment.js";
```

Add the re-export line below the existing `export * from "./entity.js";`:

```ts
export * from "./commitment.js";
```

Replace the `allFixtures` definition with:

```ts
export const allFixtures: readonly AmazonDspWriteFixture[] = [
  updateBudgetOrder,
  updateBudgetLineItem,
  pauseOrder,
  pauseLineItem,
  resumeOrder,
  resumeLineItem,
  ...allCommitmentFixtures,
];
```

**Step 3: Run conformance**

Run: `pnpm --filter @cesteral/amazon-dsp-mcp test -- conformance`
Expected: PASS, including `assertContract green: update: commitment committedSpend increase $1,000,000 → $1,500,000`.

Run: `pnpm --filter @cesteral/amazon-dsp-mcp typecheck`
Expected: PASS.

**Step 4: Commit**

```bash
git add packages/amazon-dsp-mcp/src/testkit/fixtures/
git commit -m "test(amazon-dsp): add commitment committedSpend fixture (GREEN)"
```

---

### Task 7: Add commitment fixtures 2 and 3 — `fulfillmentLevel` + `spendCalculationMode`

These two pin the snapshot-invariance contract: non-snapshot fields round-trip without dirtying `budget` or `schedule`.

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/testkit/fixtures/commitment.ts`

**Step 1: Append fixtures 2 + 3**

Add after `updateCommittedSpend`, before `allCommitmentFixtures`:

```ts
/** update: commitment fulfillmentLevel LEVEL_0 → LEVEL_5 (snapshot-invariant). */
export const updateFulfillmentLevel: AmazonDspWriteFixture = {
  operation: "update",
  entityKind: "commitment",
  args: {
    entityType: "commitment",
    profileId,
    entityId: "cmt-REDACTED-2",
    data: { fulfillmentLevel: "LEVEL_5" },
  },
  preState: {
    commitmentId: "cmt-REDACTED-2",
    commitmentName: "Sample Commitment 2",
    committedSpend: 500_000,
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-06-30T23:59:59Z",
    fulfillmentLevel: "LEVEL_0",
    spendCalculationMode: "ADVERTISER_ACCOUNT",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: "cmt-REDACTED-2",
    displayName: "Sample Commitment 2",
    accountId: profileId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 50_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-06-30T23:59:59Z" },
  },
  description: "update: commitment fulfillmentLevel LEVEL_0 → LEVEL_5 (snapshot-invariant)",
};

/** update: commitment spendCalculationMode ADVERTISER_ACCOUNT → CAMPAIGN (snapshot-invariant). */
export const updateSpendCalculationMode: AmazonDspWriteFixture = {
  operation: "update",
  entityKind: "commitment",
  args: {
    entityType: "commitment",
    profileId,
    entityId: "cmt-REDACTED-3",
    data: { spendCalculationMode: "CAMPAIGN" },
  },
  preState: {
    commitmentId: "cmt-REDACTED-3",
    commitmentName: "Sample Commitment 3",
    committedSpend: 250_000,
    currencyCode: "USD",
    startDateTime: "2026-02-01T00:00:00Z",
    endDateTime: "2026-08-31T23:59:59Z",
    fulfillmentLevel: "LEVEL_5",
    spendCalculationMode: "ADVERTISER_ACCOUNT",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: "cmt-REDACTED-3",
    displayName: "Sample Commitment 3",
    accountId: profileId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 25_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-02-01T00:00:00Z", endAt: "2026-08-31T23:59:59Z" },
  },
  description: "update: commitment spendCalculationMode ADVERTISER_ACCOUNT → CAMPAIGN (snapshot-invariant)",
};
```

Update the `allCommitmentFixtures` array:

```ts
export const allCommitmentFixtures: readonly AmazonDspWriteFixture[] = [
  updateCommittedSpend,
  updateFulfillmentLevel,
  updateSpendCalculationMode,
];
```

**Step 2: Run conformance**

Run: `pnpm --filter @cesteral/amazon-dsp-mcp test -- conformance`
Expected: PASS, 9 fixtures total green.

**Step 3: Commit**

```bash
git add packages/amazon-dsp-mcp/src/testkit/fixtures/commitment.ts
git commit -m "test(amazon-dsp): add commitment fulfillmentLevel + spendCalculationMode fixtures"
```

---

### Task 8: Add commitment fixture 4 — `endDateTime` schedule extend

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/testkit/fixtures/commitment.ts`

**Step 1: Append fixture 4**

Add after `updateSpendCalculationMode`, before `allCommitmentFixtures`:

```ts
/** update: commitment endDateTime extend 2026-06-30 → 2026-12-31. */
export const updateEndDateTime: AmazonDspWriteFixture = {
  operation: "update",
  entityKind: "commitment",
  args: {
    entityType: "commitment",
    profileId,
    entityId: "cmt-REDACTED-4",
    data: { endDateTime: "2026-12-31T23:59:59Z" },
  },
  preState: {
    commitmentId: "cmt-REDACTED-4",
    commitmentName: "Sample Commitment 4",
    committedSpend: 750_000,
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-06-30T23:59:59Z",
    fulfillmentLevel: "LEVEL_0",
    spendCalculationMode: "ADVERTISER_ACCOUNT",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: "cmt-REDACTED-4",
    displayName: "Sample Commitment 4",
    accountId: profileId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 75_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T23:59:59Z" },
  },
  description: "update: commitment endDateTime extend 2026-06-30 → 2026-12-31",
};
```

Update `allCommitmentFixtures`:

```ts
export const allCommitmentFixtures: readonly AmazonDspWriteFixture[] = [
  updateCommittedSpend,
  updateFulfillmentLevel,
  updateSpendCalculationMode,
  updateEndDateTime,
];
```

**Step 2: Run full package test suite**

Run: `pnpm --filter @cesteral/amazon-dsp-mcp test`
Expected: all tests PASS — conformance covers 10 fixtures (6 entity + 4 commitment), existing commitment-dry-run / tool tests untouched and still green.

**Step 3: Run filter assertions**

Smoke-check the new dimensions are queryable:

```bash
node --input-type=module -e "
  import('./packages/amazon-dsp-mcp/dist/testkit/index.js').then(m => {
    const all = m.getFixtures();
    const commitments = m.getFixtures(undefined, 'commitment');
    const updates = m.getFixtures('update');
    console.log({ total: all.length, commitments: commitments.length, updates: updates.length });
  });
"
```

Expected output: `{ total: 10, commitments: 4, updates: 4 }`. (You may need `pnpm --filter @cesteral/amazon-dsp-mcp build` first to populate `dist/`.)

**Step 4: Commit**

```bash
git add packages/amazon-dsp-mcp/src/testkit/fixtures/commitment.ts
git commit -m "test(amazon-dsp): add commitment endDateTime extend fixture"
```

---

### Task 9: Workspace-wide verification

@superpowers:verification-before-completion

**Step 1: Build everything**

Run: `pnpm run build`
Expected: PASS, no errors. Turborepo will rebuild `@cesteral/amazon-dsp-mcp` and any dependents.

**Step 2: Typecheck workspace-wide**

Run: `pnpm run typecheck`
Expected: PASS.

**Step 3: Run workspace tests**

Run: `pnpm run test`
Expected: PASS across all packages. Other packages should be untouched.

**Step 4: Inspect tarball**

Run: `cd packages/amazon-dsp-mcp && pnpm pack && tar -tzf cesteral-amazon-dsp-mcp-*.tgz | grep testkit && rm cesteral-amazon-dsp-mcp-*.tgz && cd ../..`

Expected output includes:
```
package/dist/testkit/fixtures/commitment.js
package/dist/testkit/fixtures/commitment.d.ts
package/dist/testkit/fixtures/entity.js
package/dist/testkit/fixtures/entity.d.ts
package/dist/testkit/fixtures/index.js
package/dist/testkit/fixtures/index.d.ts
package/dist/testkit/index.js
package/dist/testkit/index.d.ts
package/dist/testkit/types.js
package/dist/testkit/types.d.ts
```

**Step 5: Regenerate manifest, check definitionHash stability**

Run: `pnpm run generate:manifests`

Then: `git diff packages/amazon-dsp-mcp/dist/cesteral-manifest.json` (the manifest is gitignored in some setups — if `git diff` shows nothing, inspect the file directly).

Expected: `amazon_dsp_update_commitment.definitionHash` is unchanged vs. `main` (this release adds no tool-schema changes; fixtures don't affect the manifest hash).

If the hash changed, STOP — investigate before tagging. The contract-hash is what the downstream governance verifier matches against.

---

### Task 10: Bump version and tag

**Files:**
- Modify: `packages/amazon-dsp-mcp/package.json:4`

**Step 1: Bump the version**

Edit `packages/amazon-dsp-mcp/package.json` line 4:

```diff
-  "version": "1.1.0",
+  "version": "1.2.0",
```

No other package versions change.

**Step 2: Commit the bump**

```bash
git add packages/amazon-dsp-mcp/package.json
git commit -m "chore(amazon-dsp): bump to 1.2.0 — commitment testkit coverage"
```

**Step 3: Confirm the worktree is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`. If you've been on a worktree, merge / fast-forward to `main` first.

**Step 4: Tag and push**

```bash
git tag v1.4.0
git push origin main
git push origin v1.4.0
```

Tag must be pushed AFTER `main` so `release.yml` checks out the commit that already exists upstream.

**Step 5: Watch the release**

Open `https://github.com/cesteral/mcp-open-advertising/actions` and watch the `Release` workflow:

- `Install` / `Build` / `Typecheck` / `Test` / `Test repo scripts` all green
- `Publish (npm with provenance + MCP Registry)` step — `@cesteral/amazon-dsp-mcp@1.2.0` published, every other package skipped as idempotent
- `Create GitHub Release` for `v1.4.0`

If the workflow fails on test or typecheck, the publish never fires — fix on `main` and re-tag (`git tag -d v1.4.0 && git push origin :v1.4.0 && git tag v1.4.0 && git push origin v1.4.0`).

**Step 6: Verify npm publish**

Run: `npm view @cesteral/amazon-dsp-mcp@1.2.0 dist.tarball`
Expected: a tarball URL. If `404`, the publish hasn't completed yet or the workflow failed.

Optionally download and re-inspect the tarball:
```bash
npm pack @cesteral/amazon-dsp-mcp@1.2.0
tar -tzf cesteral-amazon-dsp-mcp-1.2.0.tgz | grep "testkit/fixtures/commitment"
rm cesteral-amazon-dsp-mcp-1.2.0.tgz
```
Expected: `package/dist/testkit/fixtures/commitment.{js,d.ts}` present.

---

## Done definition

- `@cesteral/amazon-dsp-mcp@1.2.0` is on npm with provenance.
- The tarball contains `dist/testkit/fixtures/commitment.js` exporting 4 fixtures.
- `getFixtures(undefined, "commitment")` returns 4 fixtures; `getFixtures("update")` returns 4 fixtures.
- Workflow `Release` succeeded; GitHub release `v1.4.0` exists.
- Downstream `cesteral-intelligence` `generate:fixture-coverage` (run separately, not in this plan) reports `update::commitment` covered → promotes `amazon_dsp_update_commitment` to attested.
