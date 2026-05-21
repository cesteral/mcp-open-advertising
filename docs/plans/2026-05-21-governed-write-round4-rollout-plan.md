# Governed Write-Tool Rollout — Round 4 (CM360 + Snapchat + Pinterest + Microsoft Ads)

> **For Claude:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement this plan task-by-task.
>
> **Two-repo plan.** Tasks tagged **[UPSTREAM]** belong to `cesteral-mcp-servers` (`cesteral/mcp-open-advertising`); tasks tagged **[GOV]** belong to the governance repo (`cesteral/cesteral-governance-layer`, checked out locally as `cesteral-intelligence`). This is the continuation of `cesteral-intelligence/docs/plans/2026-05-20-governed-write-platform-rollout-plan.md`, which covered Rounds 2–3 — read its §Architecture and the companion design doc first. Round 4 adds **no new contract surface**; it applies the now-proven contract to the four remaining entity-mutation servers.

**Goal:** Extend admitted-write coverage to the last four ad-platform MCP servers that expose an entity-mutation surface — CM360, Snapchat, Pinterest, Microsoft Ads — bringing governed-write parity to **11 of 11** write-capable servers.

**Architecture:** Each server already ships bare `update-entity` / `get-entity` / bulk write tools. Round 4 adds the governed-write contract on top — the `cesteral` annotation, a real dry-run path, before/after snapshot capture, a `/testkit` fixture export — exactly as Rounds 1–3 did. One round-batched `[UPSTREAM]` PR, then one `[GOV]` PR.

**Tech Stack:** TypeScript MCP servers, `@cesteral/shared` (already exports every contract primitive — no changes needed), `/testkit` fixture exports, Vitest, the governance fixture-coverage generator, tag-triggered `release.yml`.

---

## Context — what Rounds 1–3 established (do not re-derive)

Seven servers are governed and published at `1.1.0`: `meta-mcp`, `dv360-mcp` (R1), `gads-mcp`, `amazon-dsp-mcp` (R2), `ttd-mcp`, `linkedin-mcp`, `tiktok-mcp` (R3). They are the reference implementation — **replicate them; do not invent.**

- **Closest template:** `packages/amazon-dsp-mcp/` — symbolic-apply dry-run, `getEntity` returns the entity directly, `updateEntity` returns the updated entity, shallow-merge patch. All four Round-4 platforms match this shape (see R4-U1). Replicate its files 1:1 with platform substitutions.
- **`@cesteral/shared` is complete** — it exports `DryRunResultSchema`, `NormalizedEntitySnapshotSchema`, `DispatchedCapabilitySchema`, `assertGovernedDryRunResult`, `CesteralWriteToolAnnotations`, `CesteralReadToolAnnotations`, `DispatchedCapability`, `DryRunResult`, `DryRunValidationError`, `NormalizedEntitySnapshot`, `CanonicalEntityKind`, `CanonicalStatus`. **Round 4 makes zero changes to `@cesteral/shared`.**

### The per-platform contract (acceptance criteria — all six, verified against the governance `contract-schema` / `admit.ts` / `structured-response.ts`)

1. **A Zod-valid `cesteral` write annotation** declaring: `kind: "write"`, `platform`, `contractPlatformSlug`, `contractToolSlug` (both matching the governance slug shape `/^[a-z0-9_]{1,40}$/` — lowercase, digits, **underscores; never hyphens**), `schemaVersion: 1`, `contractId` exactly equal to `` `${contractPlatformSlug}.${contractToolSlug}.v${schemaVersion}` ``, `entityKinds` (≥1 canonical kind), `entityIdArgs` (≥1), `operation` (≥1, **only** from `update_budget | pause | resume | update_status | create | update`), `readPartner: { toolName, argMap }`, `supportsDryRun: true`, `supportsBeforeAfterSnapshot: true`, `requiresValidation: true`, `requiresSimulation: true`. The read partner carries a `kind: "read"` annotation with the base fields only.
2. **An `outputSchema`** on the write tool declaring optional `dryRun` (`DryRunResultSchema`), optional `before` / `after` (`NormalizedEntitySnapshotSchema`), and a **required `dispatchedCapability`** (`DispatchedCapabilitySchema`). The handler returns `dispatchedCapability` on **every** path — dry-run and execute.
3. **A real read-partner tool** on the same server, `kind: "read"`, whose name matches `readPartner.toolName`.
4. **A real dry-run path.** All four Round-4 platforms are expected to use **symbolic apply** (no native validate API — confirm in R4-U1). `runXUpdateDryRun` validates symbolically (`validationSource: "symbolic"`), reads the current entity through the read partner and overlays the patch (`expectedStateSource: "server_symbolic_apply"`), and returns through `assertGovernedDryRunResult(result, "<tool>")`. The read **must not** be wrapped in a swallowing `try/catch` — a read failure propagates so the dry-run fails the call rather than emitting a `"none"` contract violation. Before/after snapshots are captured pre-write and from the update return value (re-read fallback).
5. **`/testkit` fixtures** via `getFixtures()` covering the declared `(operation, entityKind)` tuples — same shape as `@cesteral/amazon-dsp-mcp/testkit`.
6. **Entity kinds that map to the canonical taxonomy** — `campaign | ad_set | insertion_order | line_item | ad_group | ad | campaign_budget | order`.

**Binary acceptance per tool** — a tool clears all six items or it is not done. No bare annotations. A declared-but-unimplemented dry-run is a contract lie.

---

## Working Conventions

- **Round-batched PRs.** One `[UPSTREAM]` PR (R4-U1…U6), then one `[GOV]` PR (R4-G1…G6). The `[GOV]` PR cannot start until the `[UPSTREAM]` packages publish — the fixture-coverage generator imports `@cesteral/<platform>-mcp/testkit` and throws if absent.
- **Commit cadence:** one commit per platform (R4-U2…U5 each touch one package); the commit message tags the task id.
- **CI hygiene:** run `pnpm exec prettier --write` on new/changed files before pushing — `format:check` is a CI gate and has twice caught unformatted agent output.
- **No `@cesteral/shared` change**, no other-package change. Each upstream platform task is confined to one `packages/<platform>-mcp/` directory — the four are independent and may be implemented in parallel.

---

# ROUND 4 — CM360 + Snapchat + Pinterest + Microsoft Ads

## Task R4-U1 [UPSTREAM]: Entity-kind pre-check

**Why:** An entity kind with no canonical-taxonomy equivalent makes the governance generator throw. Resolve mappings before any annotation declares an entity kind.

**Steps:**

1. For each of `cm360-mcp`, `snapchat-mcp`, `pinterest-mcp`, `msads-mcp`, list every entity type its `update_entity` tool accepts, the status field + enum values, the budget field shape, and confirm there is **no native validate/preview API** in the service layer (expectation: symbolic apply for all four).
2. Map each entity type to a canonical kind. Expected (confirm against the live object model):

   | Server      | Upstream `entityType`                            | Canonical kind                 | Governed?         |
   | ----------- | ------------------------------------------------ | ------------------------------ | ----------------- |
   | `cm360`     | `campaign`                                       | `campaign`                     | ✅                |
   | `cm360`     | `ad`                                             | `ad`                           | ✅                |
   | `cm360`     | `placement`                                      | — **unresolved**               | ⚠️ flag for R4-G1 |
   | `cm360`     | `advertiser` / `creative`                        | — none                         | ❌ exclude        |
   | `snapchat`  | `campaign` / `adGroup` / `ad`                    | `campaign` / `ad_group` / `ad` | ✅                |
   | `snapchat`  | `creative`                                       | — none                         | ❌ exclude        |
   | `pinterest` | `campaign` / `adGroup` / `ad`                    | `campaign` / `ad_group` / `ad` | ✅                |
   | `pinterest` | `creative`                                       | — none                         | ❌ exclude        |
   | `msads`     | `campaign` / `adGroup` / `ad`                    | `campaign` / `ad_group` / `ad` | ✅                |
   | `msads`     | `budget`                                         | `campaign_budget`              | ✅                |
   | `msads`     | `keyword` / `adExtension` / `audience` / `label` | — none                         | ❌ exclude        |

3. **CM360 `placement` is the known unmappable kind.** A Campaign Manager 360 placement is an inventory/buy unit with no clean equivalent in the 8-value taxonomy. Record it as a blocker for **R4-G1** (governance decides: map-to-nearest — `line_item`? — or a reviewed taxonomy extension). **Do not annotate `placement`** until resolved; CM360's governed scope upstream is `campaign` + `ad` only.
4. **Deliverable:** the confirmed mapping table, handed to R4-G1. No code in this task; capture it in the R4 `[UPSTREAM]` PR body.

## Task R4-U2 [UPSTREAM]: CM360 governed write contract

**Why:** Contract items 1–6 for `cm360-mcp`.

**Acceptance criteria:**

- `cm360_update_entity` + `cm360_get_entity` carry the full write/read annotations per the §contract above. `platform: "cm360"`, `contractPlatformSlug: "cm360"`, `contractId: "cm360.update_entity.v1"` / `"cm360.get_entity.v1"`.
- `entityKinds: ["campaign", "ad"]` (per R4-U1 — `placement` excluded pending R4-G1).
- New `utils/capture-snapshot.ts` + `utils/dry-run.ts`; `dry_run` input flag; `outputSchema` gains `dryRun`/`before`/`after`/`dispatchedCapability`; handler returns `dispatchedCapability` on every path; dry-run is symbolic apply via `assertGovernedDryRunResult`.
- Tests: `tests/cesteral-annotations.test.ts`, `tests/tools/update-entity-dry-run.test.ts`.
- Replicate `packages/amazon-dsp-mcp/` structure 1:1. `pnpm --filter @cesteral/cm360-mcp run typecheck` clean; `pnpm --filter @cesteral/cm360-mcp run test` green.

## Task R4-U3 [UPSTREAM]: Snapchat governed write contract

Per R4-U2's criteria, for `snapchat-mcp`. `platform: "snapchat"`, `contractId: "snapchat.update_entity.v1"` / `"snapchat.get_entity.v1"`, `entityKinds: ["campaign", "ad_group", "ad"]`. Symbolic-apply dry-run.

## Task R4-U4 [UPSTREAM]: Pinterest governed write contract

Per R4-U2's criteria, for `pinterest-mcp`. `platform: "pinterest"`, `contractId: "pinterest.update_entity.v1"` / `"pinterest.get_entity.v1"`, `entityKinds: ["campaign", "ad_group", "ad"]`. Symbolic-apply dry-run.

## Task R4-U5 [UPSTREAM]: Microsoft Ads governed write contract

Per R4-U2's criteria, for `msads-mcp`. `platform: "msads"`, `contractId: "msads.update_entity.v1"` / `"msads.get_entity.v1"`, `entityKinds: ["campaign", "ad_group", "ad", "campaign_budget"]` — Microsoft Ads' shared `budget` entity maps to `campaign_budget` (mirror how `gads-mcp` governs `campaignBudget`). Symbolic-apply dry-run. `keyword` / `adExtension` / `audience` / `label` excluded — no canonical kind.

## Task R4-U6 [UPSTREAM]: `/testkit` fixtures + publish

**Why:** Contract item 5 — the governance fixture-coverage generator consumes `getFixtures()`.

**Steps:**

1. For each of the four packages, add `src/testkit/{types,index}.ts` + `fixtures/index.ts` and `tests/testkit/conformance.test.ts`, mirroring `@cesteral/amazon-dsp-mcp/testkit`. One canonical state-transition fixture per declared `(operation, entityKind)` pair the platform can honestly cover.
2. Add the `"./testkit"` subpath to each `package.json` `exports` map; bump each `version` `1.0.0` → `1.1.0`; run `pnpm run generate:registry` to refresh `server.json`; confirm `pnpm run check:registry` and `pnpm run generate:manifests`.
3. **Verify the whole branch:** `pnpm run build`, `pnpm run typecheck`, `pnpm run test`, `pnpm run test:scripts` all green.
4. **[UPSTREAM] PR for Round 4 merges here.** After merge, publish: push a fresh `vX.Y.Z` tag (`v1.1.0`/`v1.2.0` are taken — Round 4 uses **`v1.3.0`**) → `release.yml` publishes the four `1.1.0` packages with provenance to npm + MCP Registry. The MCP Registry duplicate-tolerance fix (PR #37) keeps the run green; the `NPM_TOKEN` repo secret must be valid at tag time.

---

## Task R4-G1 [GOV]: Canonical entity-kind mapping

> Starts only after R4-U6 publishes the packages.

**Files:** `lib/features/governance/write-preview/canonical-entity-kind.ts` + its test.

- Extend `CanonicalPlatform` with `"cm360" | "snapchat" | "pinterest" | "msads"`; add a `*_LOOKUP` per platform from the R4-U1 table. The `Record<CanonicalPlatform, …>` dispatch (added in R2-G1) makes each new platform a compile-time obligation.
- **Resolve CM360 `placement`** — flagged by R4-U1. Decide map-to-nearest (e.g. `line_item`) or a reviewed extension of the 8-value taxonomy in `types.ts` + `contract-schema`. If `placement` is admitted, R4-U2 gets a follow-up to annotate it; if it stays out, document the exclusion.

## Task R4-G2 [GOV]: Testkit devDependencies + generator imports

**Files:** `package.json`, `scripts/generate-fixture-coverage.ts`.

- `pnpm add -D @cesteral/cm360-mcp@1.1.0 @cesteral/snapchat-mcp@1.1.0 @cesteral/pinterest-mcp@1.1.0 @cesteral/msads-mcp@1.1.0` — pin the exact governance-bearing version (the pre-governance `1.0.0` has no `/testkit`).
- Add an `importTestkit("@cesteral/<platform>-mcp/testkit")` call per platform. The `Check MCP Package Pinning` CI guard was generalized in R2-G2 — no `ci.yml` change needed.

## Task R4-G3 [GOV]: Regenerate fixture coverage

`pnpm generate:fixture-coverage`; `pnpm check:fixture-coverage` green; confirm the four new platforms appear in `FIXTURE_COVERAGE_MAP`.

## Task R4-G4 [GOV]: Extend the parameterized-fixtures preview-pipeline test

Append the four platforms to the iterated platform list in `parameterized-fixtures.test.ts` (the R2-G4 restructure makes this an append). Confirm every Round-4 `(platform, operation, entityKind)` fixture tuple drives a successful `executeWritePreview` call.

## Task R4-G5 [GOV]: Admission tests for the four platforms

Per R2-G5 / R3-G6: one admission test asserting `{ admitted: true }` with non-empty capabilities, and one `missingSupportsDryRun` negative on a bare annotation, per platform.

## Task R4-G6 [GOV]: Round 4 branch sanity + PR

`pnpm type-check`, `pnpm test:dir lib/features/governance/write-preview`, `pnpm check:fixture-coverage`, `pnpm test:branch`. Open the `[GOV]` PR.

---

# Summary

| Round | Upstream PR                                                                                                    | Governance PR                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 4     | R4-U1…U6 — CM360 + Snapchat + Pinterest + Microsoft Ads: pre-check, four governed contracts, fixtures, publish | R4-G1…G6 — canonical mapping (incl. CM360 `placement` decision), devDeps, regen, fixtures-test, admission tests, PR |

After Round 4: **11 of 11** entity-mutation servers governed. `dbm-mcp` (DV360 Bid Manager — reporting only) and `sa360-mcp` (reporting + conversion upload) have no entity-mutation surface and are out of this contract's scope.

# Test plan

- [ ] `pnpm run build` / `typecheck` / `test` / `test:scripts` green on the `[UPSTREAM]` branch
- [ ] `pnpm run check:registry` green; `pnpm run generate:manifests` writes a 2-tool manifest for each of the four packages
- [ ] `[GOV]`: `pnpm check:fixture-coverage` green with the four new platforms present; one admitted + one `missingSupportsDryRun` admission test per platform; `parameterized-fixtures.test.ts` runs the four platforms' upstream fixtures through `executeWritePreview`

# Done-Definition

1. A representative governed write tool on each of CM360, Snapchat, Pinterest, Microsoft Ads passes `admitWriteTool` with non-empty `capabilities`.
2. Every governed Round-4 write tool clears all six contract items — no bare annotations.
3. CM360 `placement` is explicitly resolved (mapped or excluded with documented reasoning), not silently dropped.
4. `toCanonicalEntityKind` dispatches via the `Record<CanonicalPlatform, …>` — a missing lookup is a compile error.
5. No `admit.ts` admission-logic change — Round 4 is platform data + fixtures.

# Out of scope

- `dbm-mcp`, `sa360-mcp` — no entity-mutation surface; covering them would require a contract redefinition (governing non-entity writes — conversion uploads, report-schedule CRUD), which is a separate design, not a rollout round.
- Decoupling the governance↔upstream `/testkit` npm dependency (the per-round republish friction) — a separate governance-side design.
- New canonical taxonomy kinds beyond what CM360 `placement` forces in R4-G1.
