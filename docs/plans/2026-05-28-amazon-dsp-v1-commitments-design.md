# Amazon DSP v1 Commitments — Design

**Date:** 2026-05-28
**Status:** Approved (design); implementation plan to follow.
**Scope:** `amazon-dsp-mcp` only.
**Source spec:** `packages/amazon-dsp-mcp/docs/openapi.json` (Amazon Ads API v1, OAS 3.0.1, "Amazon Ads API ALL Merged" v3.0).

## Motivation

The `amazon-dsp-mcp` package currently wraps Amazon's DSP-specific endpoints (`/dsp/orders`, `/dsp/lineItems`, `/dsp/creatives`, `/dsp/reports`). Amazon's new unified Ads API v1 (`/adsApi/v1/*`) adds a new DSP surface — **commitments**, **campaign forecasts**, and **commitment spends** — that the existing surface does not cover. These are independent capabilities (commitments are upfront media commitments / deals; forecasts predict delivery and spend; commitment-spend reports actuals against the commitment).

The merged OAS spec covers 50 paths and 1101 schemas across all Amazon advertising products. This design adds exactly the **6 DSP-flavored v1 endpoints** to the package. Non-DSP coverage (Sponsored Products / Brands / Display / TV) is out of scope and would belong in a future sibling package (`amazon-ads-mcp`).

The 6 endpoints:

| Endpoint | Method | Tool |
|---|---|---|
| `/adsApi/v1/commitments/dsp` | GET | `amazon_dsp_list_commitments` |
| `/adsApi/v1/retrieve/commitments/dsp` | POST | `amazon_dsp_get_commitments` |
| `/adsApi/v1/create/commitments/dsp` | POST | `amazon_dsp_create_commitments` (governed write) |
| `/adsApi/v1/update/commitments/dsp` | POST | `amazon_dsp_update_commitments` (governed write) |
| `/adsApi/v1/retrieve/campaignForecasts/dsp` | POST | `amazon_dsp_get_campaign_forecast` |
| `/adsApi/v1/retrieve/commitmentSpends/dsp` | POST | `amazon_dsp_get_commitment_spend` |

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
│   ├── list-commitments.tool.ts          # NEW
│   ├── get-commitments.tool.ts           # NEW
│   ├── create-commitments.tool.ts        # NEW (governed write)
│   ├── update-commitments.tool.ts        # NEW (governed write)
│   ├── get-campaign-forecast.tool.ts     # NEW
│   └── get-commitment-spend.tool.ts      # NEW
└── ...

scripts/
└── generate-schemas.ts                   # NEW — filtered codegen pipeline (parallel to dv360's)

config/
└── v1-schema-extraction.config.ts        # NEW — root operations + output paths
```

**Why a separate service class.** Mixing v1 and v2 paths in a single `AmazonDspService` would muddy the existing `/dsp/*` entity contract. v1 has its own root set, its own multi-status response shape, and its own request envelopes. Two services, one client.

**Why no transport changes.** v1 endpoints are HTTP requests on the same host (`advertising-api.amazon.com`) with `Authorization: Bearer <token>` + `Amazon-Advertising-API-Scope: <profileId>` + `Amazon-Ads-ClientId: <clientId>` — all already injected by the existing client. Unlike `/dsp/*` writes, v1 writes use plain `application/json`, so no vendor-media-type negotiation is needed.

## §2 Tools

Six tool files, each following the existing `*.tool.ts` shape (`name / title / description / inputSchema / outputSchema / annotations.cesteral / inputExamples / logic / responseFormatter`).

| Tool | Endpoint | `cesteral.kind` | Notable inputs | Output |
|---|---|---|---|---|
| `amazon_dsp_list_commitments` | `GET /adsApi/v1/commitments/dsp` | `read` | `nextToken?`, `maxResults?` (11–50, default 50) | `{ commitments: DSPCommitment[], nextToken?: string }` |
| `amazon_dsp_get_commitments` | `POST /adsApi/v1/retrieve/commitments/dsp` | `read` | `commitmentIds: string[1..N]` | Verbatim `DSPCommitmentMultiStatusResponse` |
| `amazon_dsp_create_commitments` | `POST /adsApi/v1/create/commitments/dsp` | `write` (governed) | `commitments: DSPCommitmentCreate[]` | Verbatim `DSPCommitmentMultiStatusResponse` |
| `amazon_dsp_update_commitments` | `POST /adsApi/v1/update/commitments/dsp` | `write` (governed) | `commitments: DSPCommitmentUpdate[]` | Verbatim `DSPCommitmentMultiStatusResponse` |
| `amazon_dsp_get_campaign_forecast` | `POST /adsApi/v1/retrieve/campaignForecasts/dsp` | `read` | `DSPRetrieveCampaignForecastRequest` | Verbatim `DSPCampaignForecastMultiStatusResponse` |
| `amazon_dsp_get_commitment_spend` | `POST /adsApi/v1/retrieve/commitmentSpends/dsp` | `read` | `DSPRetrieveCommitmentSpendRequest` | Verbatim `DSPCommitmentSpendMultiStatusResponse` |

**Multi-status pass-through.** Five of six endpoints return Amazon's multi-status shape: `{ success: [...], error: [...] }` where each item independently succeeds or fails. Tools return this verbatim in `outputSchema`. The `responseFormatter` prepends a summary line — `"3 succeeded, 1 failed"` (and `"(N with warnings)"` when `DSPWarning` entries are present on successes) — so the LLM doesn't have to count.

**`profileId` argument convention.** The existing tools accept `profileId` as a tool input even though the HTTP client uses the session-scoped `this.profileId`. The new tools match — purely for LLM legibility and parity with sibling tools. The argument is not used to override the session header.

**Governance on the two write tools.** Both `create_commitments` and `update_commitments` declare the full governed-write contract from `project_governed_write_contract.md`:

```ts
annotations: {
  destructiveHint: false,
  cesteral: {
    kind: "write",
    platform: "amazon_dsp",
    contractPlatformSlug: "amazon_dsp",
    contractToolSlug: "create_commitments",        // or "update_commitments"
    contractId: "amazon_dsp.create_commitments.v1",
    schemaVersion: 1,
    entityKinds: ["commitment"],                   // new canonical kind
    requiresValidation: true,
    requiresSimulation: true,
  } satisfies CesteralWriteToolAnnotations,
},
outputSchema: z.object({
  result: DSPCommitmentMultiStatusResponseSchema,
  dispatchedCapability: z.object({
    platform: z.literal("amazon_dsp"),
    capability: z.enum(["create_commitments", "update_commitments"]),
    targetIds: z.array(z.string()),                // commitmentIds from success[]
  }),
})
```

A new canonical entity kind — `commitment` — joins the existing `order` / `lineItem` set. The kind is registered in amazon-dsp-mcp's local entity-kind enum; downstream governance (cesteral-intelligence repo) accepts new kinds additively, so no upstream change blocks rollout.

## §3 Native dry-run / simulation

The governed-write contract requires a native-first dry-run that never emits `expectedStateSource: "none"`. Inspection of the spec confirms Amazon's v1 commitment write endpoints expose **no native dry-run** (no `dryRun` query param, no `validate-only` header, no preview mode in the body — only the `ClientIdHeader` parameter). Following the established pattern in `tools/utils/dry-run.ts` (`runAmazonDspUpdateDryRun`):

**`update_commitments`** — per-item dry-run:

1. **Validation (`symbolic`):** run each `DSPCommitmentUpdate` through the generated Zod schema. Collect per-item `validationErrors`.
2. **Expected state (`server_symbolic_apply`):** for each item, `POST /retrieve/commitments/dsp` to fetch the current `DSPCommitment`, merge in the patch fields, return projected post-state.
3. Aggregate into a single `DryRunResult` with per-item rows. `assertGovernedDryRunResult()` from `@cesteral/shared` validates the outcome — guaranteed never `"none"` because the read endpoint exists for the same kind.

**`create_commitments`** — per-item dry-run:

1. **Validation (`symbolic`):** run each `DSPCommitmentCreate` through the generated Zod schema.
2. **Expected state (`synthetic`):** project the post-state directly from the input (no `commitmentId` yet — synthetic placeholder), since no entity exists to read.
3. Same per-item aggregation.

**Multi-status reality check.** Amazon can still reject items at request time for reasons we can't symbolically detect (overlapping date ranges with another commitment, currency mismatch with the advertiser, etc.). The dry-run promise is "best-effort symbolic with read-backed projection," not "Amazon will agree." This is consistent with the existing `/dsp/*` governed-write tools.

**Input flag.** `dry_run: z.boolean().default(false).optional()` on both write tools — matching the existing `update-entity` tool's shape.

## §4 Service + client

**`amazon-dsp-v1-service.ts`** — thin class, one method per endpoint, reuses the existing `AmazonDspHttpClient` (same instance the existing `AmazonDspService` uses):

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

  async createCommitments(req: DSPCreateCommitmentRequest, ctx?: RequestContext)
    : Promise<DSPCommitmentMultiStatusResponse> { ... }

  async updateCommitments(req: DSPUpdateCommitmentRequest, ctx?: RequestContext)
    : Promise<DSPCommitmentMultiStatusResponse> { ... }

  async retrieveCampaignForecast(req: DSPRetrieveCampaignForecastRequest, ctx?: RequestContext)
    : Promise<DSPCampaignForecastMultiStatusResponse> { ... }

  async retrieveCommitmentSpend(req: DSPRetrieveCommitmentSpendRequest, ctx?: RequestContext)
    : Promise<DSPCommitmentSpendMultiStatusResponse> { ... }
}
```

Each method is ~5 lines: build URL, call `client.get(...)` or `client.post(...)`, parse with the generated Zod response schema, return.

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

**Session wiring.** Extend `SessionServices`:

```ts
export interface SessionServices {
  amazonDspService: AmazonDspService;
  amazonDspV1Service: AmazonDspV1Service;   // NEW
  authAdapter: AmazonDspAuthAdapter;
  profileId: string;
}
```

`createSessionServices` constructs `amazonDspV1Service` with the same `AmazonDspHttpClient` instance already built for `amazonDspService`. Single client, two services, shared retry / auth / OTEL.

## §5 Schema generator

A new `scripts/generate-schemas.ts` in `packages/amazon-dsp-mcp/`, wired into `prebuild`. Structurally parallel to dv360-mcp's pipeline but **simpler** because the input is already OAS 3.0.1 — no Discovery → OpenAPI conversion step needed.

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

**New scripts:**

```
"prebuild": "pnpm run generate:schemas",
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
- `amazon-dsp-get-commitments.test.ts` — multi-status pass-through: mock returns `{ success: [2], error: [1] }`; asserts verbatim shape in `outputSchema` and the count line in formatter.
- `amazon-dsp-create-commitments.test.ts` — wet run + governance: asserts `dispatchedCapability.capability === "create_commitments"`, `targetIds` populated from `success[].commitmentId`.
- `amazon-dsp-create-commitments-dry-run.test.ts` — `dry_run: true`: asserts no HTTP call made, `validationSource: "symbolic"`, `expectedStateSource: "synthetic"`, validation catches missing `committedSpend`.
- `amazon-dsp-update-commitments.test.ts` — wet run + governance, plus a multi-status with one item failed.
- `amazon-dsp-update-commitments-dry-run.test.ts` — read-then-project: mocks `retrieveCommitments` for current state; asserts `expectedStateSource: "server_symbolic_apply"` and the projected post-state merges patch over current.
- `amazon-dsp-get-campaign-forecast.test.ts` — basic round-trip + warning surfacing in summary.
- `amazon-dsp-get-commitment-spend.test.ts` — basic round-trip + warning surfacing.

**`tests/services/`** — 1 new file:

- `amazon-dsp-v1-service.test.ts` — each method calls the right HTTP path/verb with `application/json` (not vendor media type), Zod-parses the response, propagates errors.

**Existing tests extended:**

- `tests/cesteral-annotations.test.ts` — assert the 4 read tools have `cesteral.kind: "read"` and the 2 write tools have the full governed-write annotation block + `outputSchema.dispatchedCapability`.
- `tests/mcp-server/amazon-dsp-definitions-coverage.test.ts` — already iterates `allTools`; add assertion that v1 tool slugs all start with `amazon_dsp_` and the 2 governed writes carry `contractId: "amazon_dsp.<slug>.v1"`.
- `tests/schema-size.test.ts` — assert generated `src/generated/v1/{types,zod}.ts` are below ~200 KB each to catch root-set bloat regressions.

**Out of scope (deferred):**

- Live testing under `tests/live/` — needs a real DSP advertiser with committed inventory; not all dev accounts have that.
- Tests for the generator script — it's a build-time tool; output is the contract, verified via service-test round trips.

## Open questions / follow-ups

- **`commitment` canonical kind in governance.** This design adds `commitment` to amazon-dsp-mcp's local entity-kind enum. The downstream `cesteral-intelligence` slug schema needs the same addition before governance can promote tools to `attested` trust. Tracking item, not a blocker for landing this design.
- **`amazon-ads-mcp` sibling.** Non-DSP v1 coverage (Sponsored Products / Brands / Display / TV) deliberately deferred. If demand emerges, the cleanest path is a new package — not a rename of this one.
- **Live commitment-spend probe.** Once a real DSP account with commitments is available, capture a multi-status sample to extend `amazon-dsp-live-test-findings.md`.
- **OpenAPI spec acquisition.** With the spec gitignored, CI needs a deterministic way to obtain it (GCS object download, secret-protected URL, or vendored release artifact). Until that's wired, `generate:schemas` is a contributor-local workflow and CI must not depend on it.

## Source of truth

- Implementation handoff: `docs/plans/2026-05-28-amazon-dsp-v1-commitments.md` (to be written by writing-plans skill next).
- OpenAPI spec: `packages/amazon-dsp-mcp/docs/openapi.json`.
- Governance contract: `packages/.../memory/project_governed_write_contract.md`.
- Existing dry-run pattern: `packages/amazon-dsp-mcp/src/mcp-server/tools/utils/dry-run.ts`.
- dv360 schema generator (reference): `packages/dv360-mcp/scripts/generate-schemas.ts`.
