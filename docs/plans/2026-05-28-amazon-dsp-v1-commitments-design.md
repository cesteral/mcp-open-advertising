# Amazon DSP v1 Commitments — Design

**Date:** 2026-05-28 (revised after code review the same day — see [§Revision history](#revision-history))
**Status:** Approved (design); implementation plan in `2026-05-28-amazon-dsp-v1-commitments.md`.
**Scope:** `amazon-dsp-mcp` + one small additive change in `@cesteral/shared` (commitment canonical kind).
**Source spec:** `packages/amazon-dsp-mcp/docs/openapi.json` (Amazon Ads API v1, OAS 3.0.1, "Amazon Ads API ALL Merged" v3.0).

## Motivation

The `amazon-dsp-mcp` package currently wraps Amazon's DSP-specific endpoints (`/dsp/orders`, `/dsp/lineItems`, `/dsp/creatives`, `/dsp/reports`). Amazon's new unified Ads API v1 (`/adsApi/v1/*`) adds a new DSP surface — **commitments**, **campaign forecasts**, and **commitment spends** — that the existing surface does not cover. These are independent capabilities (commitments are upfront media commitments / deals; forecasts predict delivery and spend; commitment-spend reports actuals against the commitment).

The merged OAS spec covers 50 paths and 1101 schemas across all Amazon advertising products. This design adds exactly the **6 DSP-flavored v1 endpoints** to the package. Non-DSP coverage (Sponsored Products / Brands / Display / TV) is out of scope and would belong in a future sibling package (`amazon-ads-mcp`).

The 6 endpoints:

| Endpoint | Method | Tool |
|---|---|---|
| `/adsApi/v1/commitments/dsp` | GET | `amazon_dsp_list_commitments` |
| `/adsApi/v1/retrieve/commitments/dsp` | POST | `amazon_dsp_get_commitments` (batch read) |
| `/adsApi/v1/retrieve/commitments/dsp` | POST | `amazon_dsp_get_commitment` (single read — read partner for the governed update) |
| `/adsApi/v1/create/commitments/dsp` | POST | `amazon_dsp_create_commitment` (single, ungoverned) |
| `/adsApi/v1/update/commitments/dsp` | POST | `amazon_dsp_update_commitment` (single, governed write) |
| `/adsApi/v1/retrieve/campaignForecasts/dsp` | POST | `amazon_dsp_get_campaign_forecast` |
| `/adsApi/v1/retrieve/commitmentSpends/dsp` | POST | `amazon_dsp_get_commitment_spend` |

**Naming convention.** Tools take singular nouns when the input is a single entity (`get_commitment`, `create_commitment`, `update_commitment`), plural when the input is genuinely batch (`get_commitments` takes `commitmentIds: string[]`, `list_commitments`). The singular `get_commitment` exists specifically so the governed `update_commitment` has a clean 1:1 `readPartner.argMap` — the contract's `argMap` maps top-level argument names, not nested paths, so the read partner must accept the same `commitmentId` top-level arg the write tool emits. Amazon's underlying endpoints are batch-only; the singular tools wrap a 1-element array internally.

## §1 Architecture

A new **v1 sub-surface** inside `amazon-dsp-mcp` sitting alongside the existing `/dsp/*` surface. Both share the same `AmazonDspHttpClient`, auth, profile-id header, retry policy, and OTEL spans. Only the URL prefix and request/response shapes differ.

```
src/
├── generated/v1/                         # NEW — schema generator output (committed)
│   ├── types.ts                          # openapi-typescript output, filtered to DSP* root set
│   └── zod.ts                            # openapi-zod-client output, filtered to DSP* root set
├── services/amazon-dsp/
│   ├── amazon-dsp-http-client.ts         # UNCHANGED — reused
│   ├── amazon-dsp-v1-service.ts          # NEW — thin service wrapping the 6 v1 endpoints
│   ├── amazon-dsp-v1-api-contract.ts     # NEW — paths constants
│   └── v1-schemas.ts                     # NEW — re-exports generated Zod with LLM-friendly .describe() overlays
├── mcp-server/tools/definitions/
│   ├── list-commitments.tool.ts          # NEW (read)
│   ├── get-commitments.tool.ts           # NEW (batch read)
│   ├── create-commitment.tool.ts         # NEW (ungoverned write — matches existing create-entity pattern)
│   ├── update-commitment.tool.ts         # NEW (governed write — matches existing update-entity pattern)
│   ├── get-campaign-forecast.tool.ts     # NEW (read)
│   └── get-commitment-spend.tool.ts      # NEW (read)
└── ...

scripts/
└── generate-schemas.ts                   # NEW — filtered codegen pipeline (parallel to dv360's)

config/
└── v1-schema-extraction.config.ts        # NEW — root operations + output paths
```

**Why a separate service class.** Mixing v1 and v2 paths in a single `AmazonDspService` would muddy the existing `/dsp/*` entity contract. v1 has its own root set, its own multi-status response shape, and its own request envelopes. Two services, one client.

**Why no transport changes.** v1 endpoints are HTTP requests on the same host (`advertising-api.amazon.com`) with `Authorization: Bearer <token>` + `Amazon-Advertising-API-Scope: <profileId>` + `Amazon-Ads-ClientId: <clientId>` — all already injected by the existing client. Unlike `/dsp/*` writes, v1 writes use plain `application/json`, so no vendor-media-type negotiation is needed.

## §2 Tools

Six tool files, each following the existing `*.tool.ts` shape (`name / title / description / inputSchema / outputSchema / annotations / inputExamples / logic / responseFormatter`).

| Tool | Endpoint | Posture | Notable inputs | Output |
|---|---|---|---|---|
| `amazon_dsp_list_commitments` | `GET /adsApi/v1/commitments/dsp` | read (ungoverned) | `nextToken?`, `maxResults?` (11–50, default 50) | `{ commitments: DSPCommitment[], nextToken?: string }` |
| `amazon_dsp_get_commitments` | `POST /adsApi/v1/retrieve/commitments/dsp` | read (ungoverned, batch) | `commitmentIds: string[1..N]` | Verbatim `DSPCommitmentMultiStatusResponse` |
| `amazon_dsp_get_commitment` | `POST /adsApi/v1/retrieve/commitments/dsp` | read (ungoverned, single — read partner for `update_commitment`) | `commitmentId: string` | Unwrapped `DSPCommitment` (or throws `McpError` not-found) |
| `amazon_dsp_create_commitment` | `POST /adsApi/v1/create/commitments/dsp` | write (ungoverned, single) | `data: DSPCommitmentCreate` | Unwrapped `DSPCommitment` (1-element batch internally) |
| `amazon_dsp_update_commitment` | `POST /adsApi/v1/update/commitments/dsp` | write (governed, single) | `commitmentId: string`, `data: Partial<DSPCommitmentUpdate>`, `dry_run?: boolean` | Unwrapped `DSPCommitment` + `dispatchedCapability` |
| `amazon_dsp_get_campaign_forecast` | `POST /adsApi/v1/retrieve/campaignForecasts/dsp` | read (ungoverned, batch) | `DSPRetrieveCampaignForecastRequest` | Verbatim `DSPCampaignForecastMultiStatusResponse` |
| `amazon_dsp_get_commitment_spend` | `POST /adsApi/v1/retrieve/commitmentSpends/dsp` | read (ungoverned, batch) | `DSPRetrieveCommitmentSpendRequest` | Verbatim `DSPCommitmentSpendMultiStatusResponse` |

**Multi-status handling — split by tool category:**

- **Batch reads** (`get_commitments`, `get_campaign_forecast`, `get_commitment_spend`) return Amazon's multi-status shape `{ success: [...], error: [...] }` verbatim in `outputSchema`. The `responseFormatter` prepends a summary — `"3 succeeded, 1 failed"` (and `"(N with warnings)"` when `DSPWarning` entries appear) — so the LLM doesn't have to count.
- **Single-item writes** (`create_commitment`, `update_commitment`) always send a 1-element array to Amazon's batch endpoint. On the response:
  - `success.length === 1` → return the single unwrapped `DSPCommitment` record. Tool succeeds.
  - `error.length === 1` → throw `McpError` mapping the per-item error code/message; the multi-status `error[0]` object is attached to `data` for the LLM.
  - Any other shape (0/2+ items) is an upstream contract violation → throw `McpError(InternalError)`.

**`profileId` argument convention.** The existing tools accept `profileId` as a tool input even though the HTTP client uses the session-scoped `this.profileId`. The new tools match — purely for LLM legibility and parity with sibling tools. The argument is not used to override the session header.

**Governed-write annotation (only `update_commitment`)** — conforms verbatim to `CesteralWriteToolAnnotations` in `packages/shared/src/types/cesteral-annotations.ts:74` and the matching `DispatchedCapabilitySchema` in `packages/shared/src/schemas/dry-run-result.ts:87`:

```ts
annotations: {
  destructiveHint: false,
  idempotentHint: true,
  readOnlyHint: false,
  openWorldHint: false,
  cesteral: {
    kind: "write",
    operation: ["update"],
    contractPlatformSlug: "amazon_dsp",
    contractToolSlug: "update_commitment",
    contractId: "amazon_dsp.update_commitment.v1",
    schemaVersion: 1,
    readPartner: {
      toolName: "amazon_dsp_get_commitment",
      argMap: { commitmentId: "commitmentId" },
    },
    requiresValidation: true,
    requiresSimulation: true,
    supportsDryRun: true,
    supportsBeforeAfterSnapshot: true,
  } satisfies CesteralWriteToolAnnotations,
},
outputSchema: z.object({
  commitment: /* generated DSPCommitmentSchema */.optional(),
  dryRun: DryRunResultSchema.optional(),
  before: NormalizedEntitySnapshotSchema.optional(),
  after: NormalizedEntitySnapshotSchema.optional(),
  dispatchedCapability: DispatchedCapabilitySchema,  // { operation, canonicalEntityKind }
  timestamp: z.string().datetime(),
})
```

Per call, `dispatchedCapability` resolves to `{ operation: "update", canonicalEntityKind: "commitment" }`.

**`create_commitment` is ungoverned.** Matches every existing `create-entity.tool.ts` across the repo (none carries a `cesteral` annotation block). Tool ships with standard MCP annotations only — `destructiveHint: true`, `openWorldHint: false`. No `dry_run`, no `dispatchedCapability`, no before/after snapshots. Rationale: there is no governed-create precedent anywhere in the codebase and adding one would force broader changes to the shared contract (no pre-state for the symbolic-apply path); the production-grade move is to match the established repo posture.

**Required shared-package addition.** `"commitment"` is added in TWO places so the type-level and runtime enums stay in lockstep (the parity test at `packages/shared/tests/types/governance-contract.test.ts:80` enforces this):

1. `packages/shared/src/types/normalized-entity-snapshot.ts:53` — the TypeScript `CanonicalEntityKind` union (used as `entityKind: CanonicalEntityKind` on `NormalizedEntitySnapshot`).
2. `packages/shared/src/schemas/dry-run-result.ts:50` — the Zod `CanonicalEntityKindSchema` (used inside `NormalizedEntitySnapshotSchema`).

Both additions are purely additive (no existing kind is renamed or removed). The existing parity test gets one extra case: a snapshot with `entityKind: "commitment"` round-trips through `NormalizedEntitySnapshotSchema.parse`. This is the only change outside `amazon-dsp-mcp`.

## §3 Native dry-run / simulation

The governed-write contract requires a native-first dry-run that never emits `expectedStateSource: "none"`. Inspection of the spec confirms Amazon's v1 commitment write endpoints expose **no native dry-run** (no `dryRun` query param, no `validate-only` header, no preview mode in the body — only the `ClientIdHeader` parameter).

Only `update_commitment` is governed and therefore requires dry-run. We follow the established single-entity pattern in `packages/amazon-dsp-mcp/src/mcp-server/tools/utils/dry-run.ts` (`runAmazonDspUpdateDryRun`) — no per-item logic, no batch shape:

1. **Validation (`symbolic`):** run `data` through the generated `DSPCommitmentUpdateSchema` plus an explicit check that `commitmentId` resolves to a real record. Collect `validationErrors`.
2. **Expected state (`server_symbolic_apply`):** `POST /retrieve/commitments/dsp` with `commitmentIds: [input.commitmentId]` to fetch the current `DSPCommitment`. Merge `data` over current. Project a `NormalizedEntitySnapshot` with `entityKind: "commitment"`.
3. `assertGovernedDryRunResult()` from `@cesteral/shared` validates the outcome — guaranteed never `"none"` because the read endpoint is reachable for the same kind.

**No `create_commitment` dry-run.** The tool is ungoverned (matches existing repo posture). The shared schema only admits `expectedStateSource ∈ { "native_simulator", "server_symbolic_apply", "none" }` — there's no value that fits "project from input without a pre-state read," and changing the shared enum is out of scope. Adding governed creates as a fleet-wide pattern is its own design conversation.

**Reality check.** Amazon can still reject the update at request time for reasons we can't symbolically detect (overlapping date ranges with another commitment, currency mismatch with the advertiser, deal-level fulfillment constraints). The dry-run promise is "best-effort symbolic with read-backed projection," not "Amazon will agree." Consistent with the existing `/dsp/*` governed-write tools.

**Input flag.** `dry_run: z.boolean().default(false).optional()` on `update_commitment` only.

## §4 Service + client

**`amazon-dsp-v1-service.ts`** — thin class, one method per endpoint, reuses the existing `AmazonDspHttpClient` (same instance the existing `AmazonDspService` uses). **Responses are Zod-parsed inside the service** so upstream-contract validation is localized; tool layers receive already-typed objects:

```ts
export class AmazonDspV1Service {
  constructor(
    private readonly client: AmazonDspHttpClient,
    private readonly logger: Logger,
  ) {}

  async listCommitments(params: ListCommitmentsParams, ctx?: RequestContext)
    : Promise<DSPCommitmentSuccessResponse> { ... }

  async retrieveCommitments(req: DSPRetrieveCommitmentRequest, ctx?: RequestContext)
    : Promise<DSPCommitmentMultiStatusResponse> { ... }

  // Single-commitment reads (used as the read partner for governed updates).
  // Wraps the batch endpoint with a 1-element array; throws McpError(NotFound)
  // when Amazon's response has the id in error[].
  async getCommitment(commitmentId: string, ctx?: RequestContext)
    : Promise<DSPCommitment> { ... }

  // Single-commitment-per-call writes: tool inputs are unwrapped; service
  // wraps in Amazon's batch envelope internally. Returns the unwrapped
  // success record on success, or throws McpError on per-item failure.
  async createCommitment(commitment: DSPCommitmentCreate, ctx?: RequestContext)
    : Promise<DSPCommitment> { ... }

  async updateCommitment(commitment: DSPCommitmentUpdate, ctx?: RequestContext)
    : Promise<DSPCommitment> { ... }

  async retrieveCampaignForecast(req: DSPRetrieveCampaignForecastRequest, ctx?: RequestContext)
    : Promise<DSPCampaignForecastMultiStatusResponse> { ... }

  async retrieveCommitmentSpend(req: DSPRetrieveCommitmentSpendRequest, ctx?: RequestContext)
    : Promise<DSPCommitmentSpendMultiStatusResponse> { ... }
}
```

Each batch-read method is ~5 lines: build URL, call `client.get/post(...)`, parse with the generated Zod schema, return. The single-item methods (`getCommitment`, `createCommitment`, `updateCommitment`) wrap input into a 1-element `commitments: [...]` (or `commitmentIds: [...]`) array on the way out and unwrap the multi-status response on the way back; per-item Amazon errors throw `McpError`, multi-success/multi-error responses throw `McpError(InternalError)` as a contract violation.

**Content-Type.** Plain `application/json`. The vendor-media-type quirk only applies to `/dsp/*` writes, not `/adsApi/v1/*`. No `contentType` override; default path through `client.post()`.

**`amazon-dsp-v1-api-contract.ts`** — small constants module, parallel to the existing `amazon-dsp-api-contract.ts`:

```ts
export const AMAZON_DSP_V1_PATHS = {
  listCommitments:           "/adsApi/v1/commitments/dsp",
  retrieveCommitments:       "/adsApi/v1/retrieve/commitments/dsp",
  createCommitments:         "/adsApi/v1/create/commitments/dsp",
  updateCommitments:         "/adsApi/v1/update/commitments/dsp",
  retrieveCampaignForecast:  "/adsApi/v1/retrieve/campaignForecasts/dsp",
  retrieveCommitmentSpend:   "/adsApi/v1/retrieve/commitmentSpends/dsp",
} as const;
```

No entity-contract record (unlike the v2 file) — v1 isn't entity-centric; it's per-endpoint.

**Session wiring.** Extend `SessionServices` (actual current shape per `packages/amazon-dsp-mcp/src/services/session-services.ts:17`):

```ts
export interface SessionServices {
  amazonDspService: AmazonDspService;
  amazonDspReportingService: AmazonDspReportingService;
  amazonDspV1Service: AmazonDspV1Service;   // NEW — only addition
}
```

`createSessionServices` constructs `amazonDspV1Service` with the same `AmazonDspHttpClient` instance already built for `amazonDspService`. Single client, three services, shared retry / auth / OTEL. The existing `ReportCsvStore` + `sessionServiceStore.onDelete` GCS-cleanup wiring is untouched.

## §5 Schema generator

A new `scripts/generate-schemas.ts` in `packages/amazon-dsp-mcp/`, exposed as a **contributor refresh command** (`pnpm run generate:schemas`). **Not** wired into `prebuild` — dv360-mcp can fetch its discovery doc live every build, but Amazon publishes no stable OpenAPI URL, so requiring the gitignored spec on every CI build would break normal `pnpm run build`. The generator output (`src/generated/v1/{types,zod}.ts`) is committed; CI builds against the committed files. Re-run `generate:schemas` locally to refresh when Amazon publishes a new spec. Structurally parallel to dv360-mcp's pipeline but **simpler** because the input is already OAS 3.0.1 — no Discovery → OpenAPI conversion step needed.

**Input.** `packages/amazon-dsp-mcp/docs/openapi.json` — renamed from `openapi.md` in flight (content is JSON, the `.md` extension would trip GitHub preview and IDE tooling). **Gitignored** (716 KB, no stable Amazon URL to fetch from); each contributor / CI step must place a copy at the expected path before `pnpm run generate:schemas`. The script must fail with an actionable error when the file is missing.

**Pipeline.**

1. **Load + parse** `docs/openapi.json`.
2. **Filter to v1 DSP root set.** Walk `paths` to keep only the 6 endpoints; collect their `$ref` targets; recursively walk schema deps to gather the full closure. Drop everything else from `components.schemas`. Expected output: <100 schemas remaining of the original 1101.
3. **Write filtered intermediate** to `.tmp-specs/amazon-ads-api-v1.filtered.json` (gitignored).
4. **Generate TS types** via `openapi-typescript` → `src/generated/v1/types.ts`.
5. **Generate Zod schemas** via `openapi-zod-client` → `src/generated/v1/zod.ts`.

**Config file** — `config/v1-schema-extraction.config.ts`:

```ts
export const VALIDATED_CONFIG = {
  inputSpecPath: "docs/openapi.json",
  apiVersion: "v1",
  rootOperations: [
    "DSPListCommitment",
    "DSPCreateCommitment",
    "DSPRetrieveCommitment",
    "DSPUpdateCommitment",
    "DSPRetrieveCampaignForecast",
    "DSPRetrieveCommitmentSpend",
  ],
  output: {
    filteredSpecPath: ".tmp-specs/amazon-ads-api-v1.filtered.json",
    typesPath: "src/generated/v1/types.ts",
    zodPath: "src/generated/v1/zod.ts",
  },
};
```

**Why filter operations not schemas.** dv360's config lists root schemas because Google Discovery is schema-centric. The Amazon spec is endpoint-centric — easier and more correct to start from the 6 operations and let dependency-resolution pull in only the schemas they actually reference. Eliminates dead schemas like `DSPDoubleVerifyAuthenticAttention` that the cross-product campaign endpoints reference but the DSP commitment endpoints do not.

**New devDependencies** (mirroring dv360):

```
"openapi-typescript": "^7.10.1",
"openapi-zod-client": "^1.18.3",
"tsx": "^4.20.6"
```

**New scripts** (note: `prebuild` is intentionally NOT wired — see top of §5):

```
"generate:schemas": "tsx scripts/generate-schemas.ts"
```

**Gitignore.** `.tmp-specs/` ignored; `src/generated/v1/` committed (same as dv360 commits `src/generated/schemas/`) for IDE / CI parity.

**Wrapper module** — `src/services/amazon-dsp/v1-schemas.ts` re-exports the generated Zod schemas with LLM-friendly `.describe()` annotations layered on top. Pure additive — generated file stays untouched between regenerations.

## §6 Error handling

V1 endpoints share Amazon's standard error response shapes (BadRequest, Unauthorized, Forbidden, NotFound, ContentTooLarge, TooManyRequests, InternalServerError, BadGateway, ServiceUnavailable, GatewayTimeout) — same set the existing `/dsp/*` endpoints return. The existing `AmazonDspHttpClient` already maps these to `McpError` with the right `JsonRpcErrorCode` and `nextAction` hints.

**What changes for v1:**

1. **403 hint already covers `Amazon-Ads-ClientId`.** V1 requires it per spec common headers (not optional like on `/dsp/*`), but the existing client hint already mentions it. No code change needed.
2. **Multi-status is not an error.** A `200 OK` with a `DSPCommitmentMultiStatusResponse` containing items in `error[]` is not an HTTP error. The client passes it through; the tool's `responseFormatter` surfaces per-item errors in the summary line and verbatim output — but does not throw.
3. **`DSPWarning` in `success[]`.** Forecast and spend responses can include per-item warnings. Summary line shows `"5 succeeded (2 with warnings), 0 failed"`.
4. **400 with payload-level validation errors.** Throws `McpError(InvalidParams, ...)` with body as `data`. Existing client behavior; no change.
5. **Symbolic validation in dry-run** reuses `assertGovernedDryRunResult()` from `@cesteral/shared` — throws if `expectedStateSource` would be `"none"` and `requiresSimulation: true`. Already enforced.
6. **No reporting integration.** Commitments don't surface through `/dsp/reports`. No CSV spill, no `report-csv://` resources for this scope.

## §7 Tests

Mirror the existing `tests/` layout. Vitest, mock at the `fetch` boundary, no real network.

**`tests/tools/`** — per-tool functional tests (8 new files):

- `amazon-dsp-list-commitments.test.ts` — happy path with paginated response; verifies the request hits `GET /adsApi/v1/commitments/dsp`; mock returns a `DSPCommitmentSuccessResponse`; asserts output shape and `nextToken` propagation.
- `amazon-dsp-get-commitments.test.ts` — batch read, multi-status pass-through: mock returns `{ success: [2], error: [1] }`; asserts verbatim shape in `outputSchema` and the count line in formatter.
- `amazon-dsp-get-commitment.test.ts` — single read: assert input is wrapped to `{ commitmentIds: [id] }`, success returns the unwrapped record, error[] response throws `McpError(NotFound)` with the upstream code/message.
- `amazon-dsp-create-commitment.test.ts` — ungoverned single write: assert input is wrapped into a 1-element `commitments` array, success case returns the unwrapped `DSPCommitment`, per-item Amazon error throws `McpError` with the error attached to `data`. No dry-run path.
- `amazon-dsp-update-commitment.test.ts` — wet run + governance: assert `dispatchedCapability === { operation: "update", canonicalEntityKind: "commitment" }`, `before`/`after` snapshots populated; per-item Amazon error throws.
- `amazon-dsp-update-commitment-dry-run.test.ts` — `dry_run: true`: assert no write HTTP call; service.`getCommitment` IS called for current state; `validationSource: "symbolic"`, `expectedStateSource: "server_symbolic_apply"`; projected post-state merges patch over current; validation catches missing `commitmentId`.
- `amazon-dsp-get-campaign-forecast.test.ts` — basic round-trip + warning surfacing in summary.
- `amazon-dsp-get-commitment-spend.test.ts` — basic round-trip + warning surfacing.

**`tests/services/`** — 1 new file:

- `amazon-dsp-v1-service.test.ts` — each method calls the right HTTP path/verb with `application/json` (not vendor media type); responses are Zod-parsed inside the service; single-item writes wrap/unwrap the batch envelope; propagates errors.

**Existing tests extended:**

- `tests/cesteral-annotations.test.ts` — assert the 4 read tools have `cesteral.kind: "read"` (or no `cesteral` block for `create_commitment`, matching existing create-entity), and that `update_commitment` carries the full governed-write annotation including `readPartner`, `operation: ["update"]`, `requiresValidation: true`, `requiresSimulation: true`, `supportsDryRun: true`. Verify `outputSchema.dispatchedCapability` parses via `DispatchedCapabilitySchema` from `@cesteral/shared`.
- `tests/mcp-server/amazon-dsp-definitions-coverage.test.ts` — already iterates `allTools`; add assertion that the 6 v1 tool slugs are present and `update_commitment` carries `contractId: "amazon_dsp.update_commitment.v1"`.
- `tests/schema-size.test.ts` — assert generated `src/generated/v1/{types,zod}.ts` are below ~200 KB each to catch root-set bloat regressions.

**`packages/shared/tests/` — extend the parity test** at `packages/shared/tests/types/governance-contract.test.ts`:

- Add `"commitment"` to whatever test data exercises the `CanonicalEntityKind` union so the type-vs-runtime parity assertion at line 80 covers the new value.
- Add a runtime case: `NormalizedEntitySnapshotSchema.parse({ ..., entityKind: "commitment", ... })` round-trips without throwing.

**Out of scope (deferred):**

- Live testing under `tests/live/` — needs a real DSP advertiser with committed inventory; not all dev accounts have that.
- Tests for the generator script — it's a build-time tool; output is the contract, verified via service-test round trips.

## Open questions / follow-ups

- **`commitment` canonical kind in `cesteral-intelligence`.** This design adds `commitment` to `@cesteral/shared`'s `CanonicalEntityKindSchema`. The downstream `cesteral-intelligence` slug schema needs the same addition before governance can promote `update_commitment` to `attested` trust. Tracking item, not a blocker for landing this design.
- **Governed-create as a fleet pattern.** This design intentionally leaves `create_commitment` ungoverned because no governed-create exists anywhere in the repo today. If governance on creates is later judged worthwhile, that's its own design conversation — it would need a new `expectedStateSource` enum value (or relaxed `requiresSimulation` semantics for creates) and would touch every other ad platform's `create-entity.tool.ts`.
- **`amazon-ads-mcp` sibling.** Non-DSP v1 coverage (Sponsored Products / Brands / Display / TV) deliberately deferred. If demand emerges, the cleanest path is a new package — not a rename of this one.
- **Bulk write follow-ups.** Amazon's batch endpoints can take up to 1000 commitments per call. The current design uses 1-element batches per tool call (matches existing update-entity precedent across the repo, satisfies the single-row `DryRunResult`). If batching becomes a real performance need, the established follow-up pattern is an ungoverned `amazon_dsp_bulk_update_commitments` tool (parallel to existing `bulk-update-status.tool.ts`) — not a refactor of the per-entity tool.
- **Live commitment-spend probe.** Once a real DSP account with commitments is available, capture a multi-status sample to extend `amazon-dsp-live-test-findings.md`.
- **OpenAPI spec acquisition.** With the spec gitignored, CI builds run against the **committed** `src/generated/v1/*` output (the schema generator is contributor-only). If governance ever wants the raw spec at build time, the deterministic acquisition path (GCS object download, secret-protected URL, or vendored release artifact) is still to be designed.

## Source of truth

- Implementation plan: `docs/plans/2026-05-28-amazon-dsp-v1-commitments.md`.
- OpenAPI spec: `packages/amazon-dsp-mcp/docs/openapi.json` (gitignored — see Prerequisites in the plan).
- Governance contract (types): `packages/shared/src/types/cesteral-annotations.ts:74` (`CesteralWriteToolAnnotations`).
- Governance contract (schemas): `packages/shared/src/schemas/dry-run-result.ts:50` (`CanonicalEntityKindSchema`) and `:73` (`DryRunResultSchema`) and `:87` (`DispatchedCapabilitySchema`).
- Existing single-entity dry-run pattern: `packages/amazon-dsp-mcp/src/mcp-server/tools/utils/dry-run.ts:122` (`runAmazonDspUpdateDryRun`).
- Existing governed-update tool template: `packages/amazon-dsp-mcp/src/mcp-server/tools/definitions/update-entity.tool.ts`.
- Existing ungoverned-create tool template: `packages/amazon-dsp-mcp/src/mcp-server/tools/definitions/create-entity.tool.ts`.
- dv360 schema generator (reference): `packages/dv360-mcp/scripts/generate-schemas.ts`.

## Revision history

- **2026-05-28 (initial):** original design — proposed two batch governed-write tools (`create_commitments` / `update_commitments`) with a custom `dispatchedCapability` shape and a "synthetic" expected-state-source for the create dry-run; prebuild wired to `generate:schemas`; assumed `commitment` could be a local-only canonical kind.
- **2026-05-28 (revised, this version):** code review identified that the proposed annotation block and dry-run result shape did not conform to the actual shared contract (`CesteralWriteToolAnnotations`, `DryRunResult`, `CanonicalEntityKindSchema`, `DispatchedCapabilitySchema`), and that `prebuild` gating on the gitignored spec would break normal builds. Resolution:
  1. Write tools are reshaped to **single-commitment-per-call** matching every other package's `update-entity.tool.ts` pattern (resolves multi-item `DryRunResult` mismatch).
  2. **`update_commitment` is governed**, conforming verbatim to `CesteralWriteToolAnnotations` (`operation: ["update"]`, `readPartner`, correct `DispatchedCapability` shape, `expectedStateSource: "server_symbolic_apply"`).
  3. **`create_commitment` is ungoverned**, matching every existing `create-entity.tool.ts` across the repo. Governed-create has no precedent and would force broader shared-contract changes.
  4. **One small `@cesteral/shared` change**: add `"commitment"` to `CanonicalEntityKindSchema`. Purely additive.
  5. **Generator is contributor-only**, not wired to `prebuild`. CI builds against the committed `src/generated/v1/*` output.
  6. Responses are Zod-parsed inside `AmazonDspV1Service` (not deferred to tools), aligning service implementation with this design's "thin service wrapping endpoints" intent.
  7. `SessionServices` snippet corrected to match the actual current shape (no `authAdapter`/`profileId` fields).
- **2026-05-28 (second revision, this version):** follow-up review caught two more issues:
  1. The proposed `readPartner.argMap: { commitmentId: "commitmentIds" }` could not work — the contract's `argMap` is a flat name-to-name map and the existing `amazon_dsp_get_commitments` accepts `commitmentIds: string[]`, not a scalar `commitmentId`. **Resolution:** add a singular `amazon_dsp_get_commitment` tool (input `{ profileId, commitmentId }`) that internally wraps the batch endpoint with a 1-element array. `update_commitment.readPartner` now uses the clean `argMap: { commitmentId: "commitmentId" }`. Tool count is 7.
  2. The shared change needed both files, not just one — the TypeScript `CanonicalEntityKind` union in `packages/shared/src/types/normalized-entity-snapshot.ts:53` is separate from the Zod `CanonicalEntityKindSchema` in `packages/shared/src/schemas/dry-run-result.ts:50`, and the parity test at `packages/shared/tests/types/governance-contract.test.ts:80` enforces they match. **Resolution:** add `"commitment"` to both, extend the parity test with one new case.
