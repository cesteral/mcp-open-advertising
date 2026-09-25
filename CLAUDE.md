# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository. The public fleet overview — server list, ports, API versions, tool counts — lives in [README.md](README.md). This file covers **how the repo is structured and how to work in it**: architecture patterns, conventions, gotchas, and cross-cutting subsystems.

## Project Overview

Cesteral is an AI-native programmatic advertising optimization platform built on independent MCP (Model Context Protocol) servers — one per ad platform — plus a shared workspace package. Each server is purpose-built around the platform's API client and auth model.

## Essential Commands

```bash
pnpm install        # Install dependencies
pnpm run build      # Build all packages (Turborepo, dependency-ordered)
pnpm run typecheck  # Type check all packages
pnpm run test       # Run all tests
pnpm run clean      # Clean build artifacts

./scripts/dev-server.sh <server-name>            # Run a server locally on its correct port (e.g. dv360-mcp)
cd packages/<server-name> && pnpm run dev:http   # Or run directly
# Single package: cd packages/<server-name> && pnpm run <build|test|typecheck>
```

**Critical**: When modifying `@cesteral/shared`, rebuild all packages with `pnpm run build` — Turborepo handles dependency order and the `workspace:*` protocol propagates the changes.

## Monorepo Architecture

**pnpm workspace** monorepo managed by **Turborepo**. Workspace: `@cesteral/shared` (types, utilities, auth) + `@cesteral/contract-schema` (canonical **shape** of the `cesteral.*` annotations, dry-run/snapshot response schemas, and the manifest — the source of truth `@cesteral/shared` re-exports) + `@cesteral/contract-hash` (canonical tool-definition **hash**) + one package per MCP server.

- Build pipeline: `build` → `^build` (deps first), `typecheck`/`test` depend on `^build`
- ES modules, Target: ES2022, moduleResolution: bundler
- Each MCP server exposes tools via MCP for external AI agents (Claude Desktop, etc.)

## MCP Server Architecture Pattern

```
packages/{server-name}/src/
├── index.ts                              # Entry point
├── config/                               # Environment configuration
├── mcp-server/
│   ├── tools/definitions/{tool}.tool.ts  # Individual tool files
│   ├── tools/definitions/index.ts        # Exports allTools array
│   └── transports/streamable-http-transport.ts  # Hono + @hono/mcp
├── services/                             # Business logic + session services
└── utils/
```

### Creating a New MCP Tool

Each tool is a single file in `src/mcp-server/tools/definitions/` exporting three things:

1. **Zod schema** for parameter validation. It must be a `z.object` (optionally with `.superRefine` for per-type rules), never a top-level `z.discriminatedUnion`/`z.union`: the SDK publishes a union as an empty input schema, so clients see no parameters and the governed `definitionHash` covers `{}` (#228). Ratcheted by `scripts/lib/input-schema-wire.test.mjs`.
2. **Tool metadata** object with `name`, `description`, `inputSchema`
3. **Handler function** that returns `{ content: [{ type: "text", text: ... }] }`

Register by importing the tool definition in `tools/definitions/index.ts` and adding to the `allTools` array. `registerToolsFromDefinitions()` picks it up automatically — no switch statements or transport changes. Handlers focus on business logic; errors propagate to the factory's try/catch wrapper.

Most servers also include an auto-generated `*_search_tools` discovery tool registered via `createToolSearchTool({ platform, getTools })` in the same array.

### Session Service Pattern

Per-session service instances hold authenticated API clients. Key components in `src/services/session-services.ts`:

- `SessionServiceStore<SessionServices>` — typed map from sessionId → services
- `createSessionServices()` — called on new session connect
- `resolveSessionServices(sdkContext)` — called inside tool handlers

Lifecycle: created on connect → available via `resolveSessionServices()` → cleaned up on close/timeout.

### Dynamic Schema Pattern (DV360 MCP)

Full discriminated union schemas exceed ~1MB (EPIPE on stdio). Solution: simplified schemas for tool registration + MCP Resources for full details on-demand.

- Entity types declared in `STATIC_ENTITY_API_METADATA` in `entity-mapping-dynamic.ts`
- Resource URIs: `entity-schema://{type}`, `entity-fields://{type}`, `entity-examples://{type}`
- Adding new entity: add 5-line entry to `STATIC_ENTITY_API_METADATA`; schemas/resources auto-generated
- Test sizes: `cd packages/dv360-mcp && node tests/test-schema-size.cjs`

### MCP Prompts

On-demand workflow guidance for complex multi-step operations. Located in `src/mcp-server/prompts/`. Register in `prompts/index.ts` via the `promptRegistry` Map — each entry pairs a `Prompt` metadata object with a `generateMessage(args)` function that returns the prompt body.

**The fleet-wide prompts (`cross_platform_campaign_setup`, `cross_platform_performance_comparison`) have one source: `@cesteral/shared`'s `utils/cross-platform-prompts.ts`.** Every server imports them into its `promptRegistry`; never keep a local copy. They used to be copy-pasted into 12 servers and drifted into 6 variants of each, disagreeing about money units (#235). `scripts/lib/cross-platform-prompts.test.mjs` boots every server and fails if any renders text that differs from the shared module, if a package source defines either prompt name itself, or if a server stops registering them. Prompt and resource text may only name registered tools or prompts (`scripts/lib/prompt-tool-references.test.mjs`).

## Auth Mode Configuration

Each server has its own `MCP_AUTH_MODE` enum; the canonical list is in each package's `src/config/index.ts`. Common rules:

- `jwt` mode requires `MCP_AUTH_SECRET_KEY` and exposes the RFC 9728 endpoint at `/.well-known/oauth-protected-resource`
- SEP-2127 endpoint at `/.well-known/mcp/server-card.json` returns server discovery metadata (name, version, transports, auth modes, capabilities, the `untrusted_content` boundary, and the `operational` envelope — see [Server Card Operational Envelope](#server-card-operational-envelope)) on every server in every auth mode
- All platform auth adapters' `validate()` hit a cheap upstream endpoint (e.g. TTD's `{ __typename }` GraphQL ping, Meta's `/me`, MSAds' `User/Query`) on first session creation and memoize the result, so invalid tokens fail fast at session establishment rather than on first tool call. Auth failures throw `McpError(JsonRpcErrorCode.Unauthorized)` so the transport factory maps them to HTTP 401 with the right `authErrorHint`.

Platform-specific auth adapters live **inside each server package** (not in shared) so adding a new platform never requires touching `@cesteral/shared`.

## Common Development Patterns

```typescript
// Error handling — use McpError or ErrorHandler from shared
import { McpError, ErrorHandler, JsonRpcErrorCode } from "@cesteral/shared";
// Generic: throw McpError.fromError(error)
// Domain-specific: throw new SomeError(message, { code: JsonRpcErrorCode.InternalError })
// In catch blocks: throw SomeDomainError.fromApiError(error)

// Logging — structured via Pino
import { createLogger } from "@cesteral/shared";
const logger = createLogger("component-name");

// Schema validation — always Zod
const params = schema.parse(rawInput);
```

## Server-Specific Notes

Cross-cutting platform quirks that are easy to forget when working in a given package:

- **dv360-mcp**: `dv360_delete_entity` performs a **hard delete** on most entities (verified live for `campaign`: subsequent `get_entity` returns 404). **Line items must be archived first** (`bulk_update_status` → `ENTITY_STATUS_ARCHIVED`) before delete — DV360 returns 400 otherwise. Use `dv360_update_entity` with `entityStatus=ENTITY_STATUS_ARCHIVED` for reversible removal on other entity types — archiving is itself irreversible (cannot unarchive). `dv360_duplicate_entity` always lands the copy in a non-running state: line items use DV360's native `lineItems:duplicate` (server-side copy; an ACTIVE copy is patched to `PAUSED`), insertion orders have no native duplicate and are copied GET→POST in `DRAFT` — the only status `CreateInsertionOrder`/`CreateLineItem` accept (v4 Discovery `entityStatus`). `inventorySource` / `inventorySourceGroup` list calls require either `partnerId` or `advertiserId` (validated client-side).
- **ttd-mcp**: Surfaces TTD's documented Platform API only — REST (`/v3/...`) and GraphQL (`/graphql`). Per TTD Foundations §6, bulk operations (>100-record campaign/ad-group creates and updates) are only available through GraphQL — use `ttd_graphql_mutation_bulk`. Sandbox: set `TTD_USE_SANDBOX=true` to route at `ext-api.sb.thetradedesk.com` (weekly clone of prod, no real spend; audience uploads and `/v3/study` not supported).
- **linkedin-mcp**: URN-based entity IDs, `LinkedIn-Version` pinned in `src/config/api-version.ts` (currently `202608`, basis `inferred`), analytics via `/rest/adAnalytics` with pivot breakdowns. **The `/v2/` → `/rest/` migration is STAGED and incomplete (#210)**: list/create for campaigns and campaign groups are account-scoped under `/rest/adAccounts/{accountId}/…`, as are `adAccounts`, `adAnalytics` and `adTargetingFacets`; `get`/`update`/`delete` still use legacy `/v2/` item paths because they receive only an entity URN and adding an account parameter would churn all 11 governed `definitionHash` values — except `adAccount`, whose item path is `/rest/adAccounts/{numericId}` (numeric id, not the URN); creatives, conversions, ad forecasts, ad previews and the Assets→Images/Videos upload split are untouched. **Query strings are Rest.li 2.0** (`accounts=List(urn%3A…)`, `dateRange=(start:(year:…,month:…,day:…),end:(…))`) — every request sends `X-Restli-Protocol-Version: 2.0.0`, so pass arrays/records to `LinkedInHttpClient.get` and never 1.0 keys like `accounts[0]` or pre-encoded strings; `src/services/linkedin/restli-query.ts` is ported from LinkedIn's official `linkedin-api-js-client` encoder and tested against its vectors (`URLSearchParams` cannot express 2.0). **Nothing here has been exercised against LinkedIn** — every endpoint is recorded in `platform-facts.json` as `unverified` with its basis.
- **tiktok-mcp**: `X-TikTok-Advertiser-Id` header in HTTP mode; image/video upload supported.
- **cm360-mcp**: `profileId` required on all calls, `list_user_profiles` for profile discovery, `list_targeting_options` for targeting; scheduling via `create/list/delete_report_schedule`.
- **pinterest-mcp**: cursor-based pagination via `bookmark` tokens. Video upload via `/v5/media`; image creatives reference URLs directly (Pinterest's `/v5/media` endpoint only supports `media_type="video"`). `pinterest_duplicate_entity` copies campaigns only (read + create, no native copy; ad groups and ads are not copied) and always creates the copy `PAUSED`, ignoring a `status` in `options`, as msads does.
- **snapchat-mcp**: Ad Squads (adGroups), cursor-based pagination.
- **amazon-dsp-mcp**: Orders (campaigns), Line Items (ad groups), no hard delete (archive via status). Reporting v3 is scoped by `accountId` (DSP entity ID) in the URL path, distinct from the profile header. **Stdio auth prefers the LwA refresh-token flow** (`AMAZON_DSP_APP_ID` + `_APP_SECRET` + `_REFRESH_TOKEN` + `_PROFILE_ID`) — auto-refreshes the 60-min access token. Falls back to static `AMAZON_DSP_ACCESS_TOKEN` for short CI runs.
- **sa360-mcp**: Cross-engine layer above Google/Microsoft/Yahoo Japan/Baidu. The **Reporting API v0 is read-only for campaign entities** — there are no campaign/ad-group/ad mutate ops, so the only governed writes are **offline conversion upload/modify via the legacy v2 (DoubleClick Search) API**. Reads use SQL-like queries that mirror GAQL; async reports follow submit → poll → download. OAuth2 refresh-token auth.

## Deployment & Infrastructure

- **Platform**: GCP Cloud Run (containerized)
- **Secrets**: GCP Secret Manager
- **IaC**: Terraform (`terraform/`)
- **CI/CD**: Cloud Build (`cloudbuild.yaml`)

```bash
# Test endpoints
curl -X POST http://localhost:<port>/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"ping","id":1}'
curl http://localhost:<port>/health

# View logs
gcloud run services logs tail <server-name> --region=europe-west2
```

### Release Attestation Manifest

`scripts/generate-manifests.mjs` (`pnpm run generate:manifests`) boots each server, reads its raw `tools/list`, and writes `dist/cesteral-manifest.json` for every package with governed tools (those carrying an `annotations.cesteral` block). Each entry is validated against `cesteralManifestSchema` (from `@cesteral/contract-schema`); the manifest hard-fails on contractId/schemaVersion/slug inconsistency **and** when a tool's `cesteral` block does not satisfy the full `cesteralAnnotationSchema` — the same loose schema the governance layer parses released tool lists with at admission, so a malformed annotation fails the release here rather than silently failing to reach `attested` downstream. Each tool's `definitionHash` is a canonical SHA-256 from `@cesteral/contract-hash` — kept bit-identical with the downstream `cesteral-intelligence` governance repo. The tag-triggered `release.yml` publishes to npm with build provenance, signing the manifest transitively inside the tarball; the governance system verifies that provenance and promotes matching tools to `attested` trust.

### Verification Status (#203)

`attested` answers _is this the definition we published?_ It says nothing about whether the tool works. Each manifest entry therefore also carries a `verification` block, on an orthogonal axis, so a consumer can require `attested` **and** `live-verified` before permitting `enforce` on a money-moving write.

| Status             | Meaning                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `declared`         | Annotation present; nothing verified against this hash. **The default, including for a tool absent from the ledger.**  |
| `fixture-verified` | Passes fixtures/mocks in CI at this hash                                                                               |
| `live-verified`    | Exercised against a real authorized account at this hash; findings triaged; evidence links to the specific tool result |
| `disabled`         | Deliberately off — **requires a reason**                                                                               |

**The status is bound to the hash it was verified against, and demotion is automatic.** `resolveVerification` (`scripts/lib/verification-ledger.mjs`) discards any claim whose `verifiedDefinitionHash` does not equal the definition being shipped and replaces it with `declared` — no override exists in the ledger or the annotation. A status that survives a definition change is worse than no status, because it is confidently wrong. The discarded status is preserved as `demotedFrom` so a stale report stays distinguishable from a tool nobody ever tested; only one of those has something to re-run.

**The ledger is `packages/<pkg>/verification.json`, never the tool annotation.** A tool must not promote itself: an annotation field would be a claim authored in the same file, in the same commit, as the behaviour change. A package with no ledger file has every tool at `declared`.

**`manifestVersion` stays `1`.** `verification` is an optional field, so a consumer pinned to an older `@cesteral/contract-schema` strips it and is unaffected. Bumping to `2` would make every older consumer reject the whole manifest and drop every tool out of `attested` until the governance repo upgraded — far worse than an ignored field.

**Everything is backfilled to `declared`, including tools that were genuinely live-tested.** This is the control working, not a gap: the 2026-04-01 TTD run (7 distinct tools genuinely exercised — the report's 12 "PASS" rows count entity-type variations, not tools) and the 2026-05-15 Amazon DSP run both predate hash binding and recorded no `definitionHash`, so neither can be bound to a definition. An unbindable claim is exactly what this mechanism refuses. Re-running the tool is what promotes it; the ledger notes preserve which tools have prior evidence so a future live run knows where to start. Note also that neither report is a promotion list on its own — the TTD one marks 8 tools `PASS (untested live)` on the strength of code review, and the Amazon one flags one of its own passes as false.

## Key Design Principles

1. **Separation of Concerns**: One server per ad platform
2. **Stateless**: No persistent state between requests
3. **Type Safety**: Zod for runtime, TypeScript for compile-time
4. **Observability**: OTEL traces + metrics, Pino structured logs, InteractionLogger for tool-call + tool-failure persistence
5. **Scale-out-safe sessions**: the streamable-HTTP transport factory rebuilds session services on cache miss — a request with an `Mcp-Session-Id` unknown to the receiving Cloud Run instance triggers re-auth + `createSessionForAuth` using the client-supplied ID. The per-call credential fingerprint check still runs, so rebuild does not weaken session binding. Per-instance state not reconstructible from credentials (rate-limiter counters, in-memory `report-csv://` resources) may behave slightly differently after a scale-out event — documented inline in each subsystem.
6. **Enforce requires a distributed jti store on hosted deploys**: decision-token replay protection (`consumeOnce`) is only cross-instance-safe with `FirestoreJtiStore`. When any governed write resolves to token mode `enforce` and the jti store in use gives no cross-process guarantee, `registerToolsFromDefinitions` **fails closed** on a hosted deployment (`K_SERVICE` set) or when `GOVERNANCE_JTI_STORE=firestore` is declared but never satisfied — an enforce posture that could double-execute a money-moving write must not start. Stdio / self-host (no `K_SERVICE`) keeps the in-memory store with a one-time warn; a deliberately single-instance Cloud Run can opt out with `GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE=true` (downgrades the error to a warn). Decision logic is the pure, tested `evaluateJtiStoreEnforcementSafety`.

   **Where the check actually runs** (#166): `bootstrapMcpServer` calls `initializeGovernanceRuntime({ tools: allTools, logger })` before either transport starts, so an unsafe posture aborts startup — Cloud Run fails the revision and holds traffic on the previous one. That resolution happens **once per process**, and the store is published via `getGovernanceJtiStore()` for `registerToolsFromDefinitions` to pick up; the factory re-runs the same evaluation per session as defense in depth, which now passes because the store is wired. This ordering matters: the guard used to live only in the factory, which the streamable-HTTP transport calls **once per session**, so a misconfigured `enforce` deploy started cleanly, went green, then threw on every session establishment — a total outage shaped like a runtime fault instead of a boot refusal.

   **Store resolution order**, most explicit first: an injected `opts.jtiStore` → the process-level store from `initializeGovernanceRuntime` → a per-process `InMemoryJtiStore`. A server opts in simply by passing `tools: allTools` to `bootstrapMcpServer`; omitting it keeps the per-session-only behavior.

   **Hosted enforce also needs the Firestore backing store provisioned** (#167): set `enable_governance_jti_store = true` in Terraform (creates the database plus a `google_firestore_field` TTL policy on `governance_jti.expiresAt`) and set `GOVERNANCE_JTI_STORE=firestore` on the revision. The TTL policy is storage-cost control only — correctness is the atomic `doc(jti).create()`. The policy targets a **Timestamp** field, and `FirestoreJtiStore` writes `expiresAt` as a `Date` for exactly that reason; an ISO string there would be silently ignored and the collection would grow forever behind a policy that looked correctly configured.

   **Both halves are required**: set `GOVERNANCE_JTI_STORE=firestore` **and** inject `selectJtiStore(...)`'s result as `jtiStore`. Doing only the second used to be worse than doing neither — the guard keyed on whether a store had been injected, so `selectJtiStore` returning an `InMemoryJtiStore` (which is what it returns without the env var) was accepted as safe and produced an in-memory enforce posture on multi-instance Cloud Run with no throw and no warn, quieter than the unwired case, which correctly throws. The guard now keys on the store's own `JtiStore.distributed` declaration, so the half-done configuration fails closed like every other. A custom store must declare `distributed = true` to be accepted under hosted enforce; an undeclared store is treated as non-distributed.

## Server Card Operational Envelope

The card's `operational` block (#201) answers what a client needs before pointing a server at a live ad account: rate limit, retry semantics, which duplicate-write rails are covered, what is recorded, and what cannot be undone. `packages/shared/src/utils/operational-envelope.ts` builds it.

**Everything mechanical is derived, not declared.** The rate limit is read off the live `RateLimiter` the transport was handed (`describeLimits()`); the retry policy comes from `describeRetryPolicy()`, which _executes_ the server's own `isRetryable` predicate over representative statuses and reads the live `IDEMPOTENT_RETRY_METHODS` set. A declared copy in `registry.json` was rejected for exactly the drift it would introduce — the fleet is not uniform here:

| Server           | Divergence                                                         | Why a fleet-wide declaration would lie                                                                               |
| ---------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `amazon-dsp-mcp` | `maxRetries: 2`, and `isAmazonDspRetryable` deliberately omits 429 | Publishes 3 total attempts, and `resendSafeForAllMethods: []` — with 429 not retryable, no status is POST-safe there |
| `dbm-mcp`        | Drives its own report-polling loop, never `executeWithRetry`       | Publishes `retry: null` rather than defaults describing code it does not run                                         |

`pinterest-mcp` used to be listed here for a media-upload POST that opted into 5xx retry via `retryNonIdempotent`. That opt-in lived in `postMultipart`, which nothing called, so the row described code that never ran; the dead method was removed and pinterest now follows the default method rule.

**"POST is never retried" is false and must not be reinstated.** `isMethodSafeToResend` returns `true` for 429 regardless of method — a 429 means the platform rejected the request _without processing it_, so re-sending is safe. The exclusion is for the ambiguous 5xx, which can arrive after the platform committed the write. `operational-envelope.test.ts` asserts the note never makes the flat claim.

**Two fields exist to state an ABSENT protection.** `idempotency.clientRetryDeduplicated: false` — a caller that loses the response, re-authorizes and re-issues `tools/call` carries a new `jti`, so `consumeOnce` returns `"fresh"` and the write can duplicate; that is the normal recovery path and nothing here prevents it. `rollback.supported: false` — there is no undo. A block publishing only the protections would read as "duplicate writes are handled". They are not.

**`rollback.terminalOperations` is the one hand-authored value**, because irreversibility is a per-platform fact no local code states. It lives in `registry.json` per server and reaches the card via `registry-data.generated.ts` → `buildServerCardExtras`. It is ratcheted by `scripts/lib/terminal-operations.test.mjs`, which boots each server and requires every destructive tool to be declared terminal or listed in `reversible-operations-allowlist.json` with a reason.

**The ratchet keys on tool NAME _and_ annotation**, deliberately. Seven of the fleet's sixteen destructive tools declare `operation: ["bulk_job"]` or `["manage"]` rather than `delete` — `tiktok`/`pinterest`/`snapchat`/`msads`/`amazon_dsp` `_delete_entity` are `writeClass: "effect"` bulk deletes governed as one batch effect, which is correct for governance and useless for identifying destructiveness. An annotation-only rule would have silently exempted the tools that delete the most at once; the mutation test for this pairing is in the #201 PR.

## Untrusted-Content Marking (#204)

Platform text (entity names, ad copy, upstream error bodies, report cells) is attacker-controllable, so results say where it sits under `_meta["cesteral/untrusted"]` (`v: 1`, additive-only). `_meta` is outside `definitionHash`, so none of this moves an attested hash.

| Where                             | Marker                                                                                   | Set by                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Any factory-built error result    | `reason: "tool-error"`, `contentBlocks: [0]`                                             | `tool-handler-factory.ts` catch path; `async-task-tool.ts` failures |
| `report-csv://` resource contents | `{ whole: true, reason: "report-csv" }`                                                  | `report-csv-resource.ts`                                            |
| A declaring tool's success result | `reason: "platform-content"` + its declared `structuredPaths` / `contentBlocks`          | the tool's `untrustedContent` field                                 |
| The tool's entry in `tools/list`  | the declaration itself, so stdio clients learn it before calling (the card is HTTP-only) | same                                                                |

**Three declaration states, never collapsed.** Paths (`{ structuredPaths: ["$.rows"], contentBlocks: [0] }`, whole subtrees, `[*]` allowed) = platform text is there. `NO_UNTRUSTED_CONTENT` = the tool returns none. **No field = "not reported", never "trusted".** A malformed declaration throws at registration.

**`path_reporting` on the card is a ratcheted claim.** `registry.json` → `untrustedContent.pathReporting: "per-response"` is allowed only when **every** tool on that server declares; `scripts/lib/untrusted-declarations.test.mjs` boots each server and fails both ways (an undeclared tool under `per-response`, or a fully declared server still claiming `unsupported`). `dbm-mcp`, `ttd-mcp`, `meta-mcp`, `snapchat-mcp`, `pinterest-mcp`, `tiktok-mcp` and `amazon-dsp-mcp` are switched — **a new tool on any of them without `untrustedContent` fails CI.** The ratchet also requires every top-level output field that is **open anywhere inside** — a record, `any`, `.passthrough()`/`.catchall()`, or an array of them, at any depth, through `$ref`s; how raw platform objects pass through — to be declared. The one exemption is contract-schema's `EffectResult.summary` — an object of exactly `effectKind` plus a `summary` record of scalars, on `effect` and `dryRun.expectedEffect`; any other `summary` (e.g. `meta_get_insights`' platform aggregates) is checked like any field. **That exemption is convention, not enforcement**: a summary that starts carrying a platform name must be declared by hand, as `ttd_create_report_template` does. An open field that is not platform data at all (a server-authored catalog) goes in `OPEN_FIELD_ALLOWLIST` in `scripts/lib/untrusted-declarations.mjs` with its reason; an entry naming a tool or field that no longer exists anywhere in the fleet fails. A schema heuristic cannot see a path to a plain string (`$.creativeName`, `$.errors`), so every per-response server's declarations are also pinned in `scripts/lib/untrusted-declarations.snapshot.json`: changing or removing any path, or adding a tool, needs a reviewed edit there (`pnpm sync:untrusted-declarations` regenerates it).

**What counts as platform text** when declaring: entity records, raw responses, names, ad copy, click URLs, platform error messages, report headers and cells, TTD's own catalog names. **Not:** IDs, enum-like statuses, timestamps, counts, platform-generated URLs (download/preview/signed), and the caller's own input echoed back. Mark whole subtrees; over-marking is harmless, under-marking is the failure. A dry run that **reads** the entity (update/delete/duplicate) carries its `displayName` in `expectedPostState`, so `$.dryRun` is declared there; a symbolic create's is not. `contentBlocks: [0]` whenever any branch of the formatter prints platform text. **Caveat of the caller-input rule:** text a model copied from a platform read into its own arguments (an injected campaign name passed to `create_entity`) comes back unmarked where it is echoed — consistent with the rule, since the server cannot know where the caller got it. Errors the SDK builds before the handler runs (input validation, task augmentation required) stay unmarked; their text is the caller's own request.

## Platform-Facts Ledger

`platform-facts.json` records every load-bearing claim this repo makes about an external platform it does not own — 41 facts: the 14 versioned and unversioned API base URLs, the LinkedIn `YYYYMM` header pin, 13 behavioural constraints (the ones in Server-Specific Notes above, plus the LinkedIn `/v2/` → `/rest/` endpoint claims from #210), and each server's default rate limit (13 `<platform>.rate_limit_default` facts, pinned to the `default(N)` literal so a default cannot be raised without touching its fact). No platform quota could be sourced from a primary document, so every default was kept and the snippet-level figures are recorded as `unverified` — confirm them on the vendor page before raising a default. Each entry carries the claim, the source URL, where the code relies on it, and when it was last checked (#202).

Two of these have already rotted. `linkedin-mcp` pinned `LinkedIn-Version: 202409` for roughly a year past sunset with every call erroring and nothing detecting it (#206/#209); Google's v4 Discovery rev 20260608 removed campaign + insertion-order assigned targeting and broke all CI (PR #79). One was caught loudly, the other was silent for a year, and the difference was luck about which fact happened to be fetched at build time.

**Two modes, because they have different failure politics:**

| Mode                                                   | Where                                                           | What it does                                                                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check:platform-facts`                            | **CI, PR-blocking**                                             | Hermetic. Ledger shape, plus every `codeRef` still existing _and still containing the value the ledger claims_. Can only fail because of something in the commit under review. |
| `check-platform-facts.mjs --freshness --due-within 30` | **Scheduled** (`.github/workflows/platform-facts.yml`, Mondays) | Time-dependent. Reports expired facts, and facts due within 30 days, and opens/updates a tracking issue.                                                                       |
| `check-platform-facts.mjs --freshness`                 | **Fleet release** (`release.yml`, first step of the `v*` lane)  | Same check, as a gate: a stale load-bearing fact fails the release before anything is built or published.                                                                      |

The freshness half is deliberately **not** PR-blocking, for the same reason as `check-terraform-drift.mjs`: it would turn `main` red by the passage of the calendar, on a commit that changed nothing. It **does** block a fleet release, because a `v*` tag claims the servers work against their platforms today. The contract-library lane is exempt, since neither library relies on a platform fact. To release past an expired fact, re-verify it, or mark it `superseded` / move its deadline in a reviewed commit that says why. Being unable to check is not a reason. The release job checks out the **tagged** commit, so unblocking needs that commit on `main` and a fresh tag.

**A moved deadline is capped at one cadence from today** (`REFRESH_DAYS`: 90 days for versioned base URLs and the LinkedIn version header; 180 for unversioned base URLs, behavioural constraints and auth requirements). A `verifyBy` further out is reported as `DEADLINE PARKED` and fails the release like an expired fact. Without the cap the escape hatch would accept `2099-01-01` as readily as a real extension. The weekly job's 30-day warning exists so the first alert does not land the same week releases start failing.

**The hermetic half is the one with teeth today.** Bumping a pinned version without updating the ledger fails CI with the file, line, and both values — verified by actually editing `gads-mcp`'s config from `v23` to `v24` and watching it fail.

**Every fact currently ships `status: "unverified"` with `verifiedAt: null` and a `verifyBy` deadline.** This is the honest state, not an oversight: the vendor doc hosts (`learn.microsoft.com` among them) are unreachable from this repo's egress policy, so nobody has read a supported-version table. **An expired fact is not current, and being unable to check it does not make it fresh** — so `unverified` is reported, never silently passed. `verified` requires a `verifiedAt`, and `unverified` forbids one, so the two can never disagree.

**`verifiedAt` must be the date someone actually re-checked.** Never backdate it to when the code was written — that reproduces exactly the false confidence this removes.

**Related: `LINKEDIN_API_VERSION_VERIFICATION_BASIS`.** #209 shipped `LINKEDIN_API_VERSION_VERIFIED_AT = "2026-09-16"` under a docstring reading "when a human last confirmed... against LinkedIn's published list". No such confirmation happened — the list is behind the blocked host, and the `202608` pin was inferred from LinkedIn's documented monthly cadence and one-year window. The basis is now explicit and set to `inferred`, the ledger carries the fact as `unverified`, and a test asserts the two agree. A date with no basis beside it reads as a confirmation that never happened.

## Tool-Search Ranking Evals

`evals/tool-search-ranking.json` pins how each server's `{platform}_search_tools` tool ranks its own registry (#205, Part 1). The ranking is a pure function of tool **name, title and description** — text edited in nearly every feature PR — and nothing asserted its outcome before this.

`evals/tool-search-ranking.test.mjs` boots each built server and calls the real search tool **over the MCP wire**, reading `structuredContent`. It does not import the scorer and re-run it, and does not reimplement the weights: the thing under test is exactly what a client gets. Run via `pnpm test:scripts` (the root suite now includes `evals/**/*.test.mjs`).

**Layer 1 only.** `tool-search.ts` searches ONE server's own registry, so cross-server confusion is unreachable here and needs a model-based harness (#205 Part 2 — costs model calls, belongs on a schedule, must not be added to the PR-path include).

**`cases` vs `gaps`.** `cases` pin rankings worth protecting. `gaps` pin rankings that are currently _wrong for a user_, asserted so the defect is auditable and so **improving** the ranker fails loudly — a failing gap means "promote this to a case", the opposite of a regression.

### Ranker facts worth knowing before editing a tool description

| Fact                                                                                                      | Consequence                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Weights: name **5**, title **3**, description **1**                                                       | Name dominates; a description edit moves things by single points                                                            |
| Names and queries are split into words on `_`; descriptions keep `_` as a word character                  | `ttd_download_report` is `["ttd","download","report"]`, but an enum like `SINGLE_IMAGE_AD` in a description stays one token |
| A query word matches a name word by equality, plural folding, a synonym, or a **prefix of 3+ characters** | `camp` reaches `campaigns`; `ad` no longer matches inside `adjust`/`download`/`upload`                                      |
| `QUERY_SYNONYMS`: remove/erase/destroy → delete, delete → remove, edit/modify/change → update             | Every entry widens what a query reaches; add one only for words meaning the same operation                                  |
| Description **words** are not plural-folded; the query word still is                                      | Folding description words made "deletes" count as "delete" and tied cm360's delete-a-campaign case                          |
| Name weight counts once per **query** word                                                                | A 2-word query matching two name words scores 10; a name repeating a word still scores 5                                    |
| Title/description matches accumulate; description capped at **400 tokens**                                | Long descriptions have their tails silently ignored                                                                         |
| Ties resolve by **registry order** (stable sort)                                                          | Reordering `allTools` silently reorders results with no scoring change                                                      |

**Margins are thin.** `cm360_delete_entity` beats `cm360_delete_report_schedule` for "delete a campaign" by **one point**; on `msads-mcp` the same pair is a **tie** (9–9) that only registry order resolves in the delete tool's favour — it was the wrong way round until the schedule tool's description started with "NOT SUPPORTED". Adding two sentences to a neighbouring tool's description is enough to invert it — verified by mutation.

## Cross-Server Routing Evals

`evals/cross-server-routing.json` asks the Layer 2 question Part 1 structurally cannot (#205 Part 2): given the **merged** `tools/list` of all 13 servers, does a client's model call the right platform's tool? `tool-search.ts` only ever sees one server's registry, so cross-server confusion is invisible to it.

**The confusion surface, measured.** 248 of the fleet's 314 tools (79%) share an operation suffix with at least one other server — `delete_entity` on 10, `get_entity` on 12, `get_pacing_status` on **all 13**. Once merged, the platform prefix on the name is the only disambiguator most of them have. That is why `assertPrefixInvariant` is a PR-blocking ratchet: an unprefixed tool name is a routing hazard, not a naming preference.

| Fact                                                        | Consequence                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Every tool name is platform-prefixed (0 exceptions)         | The one reliable signal; ratcheted in `evals/lib/merged-catalog.mjs`                        |
| 2 tools' text never names their platform                    | `dbm_get_pacing_status`, `dv360_bulk_update_status` — and pacing is a 13-way family         |
| All 10 `*_search_tools` descriptions are **byte-identical** | Generated by one factory; the **title** is their sole disambiguator                         |
| `dv360-mcp` registers no reporting tool                     | "Get DV360 delivery metrics" correctly routes to **`dbm-mcp`** — the corpus's sharpest case |
| `msads_import_from_google`                                  | The one tool naming another platform in its own description                                 |

**Two error modes, never collapsed.** `wrong-platform` (right operation, wrong server) is cross-server confusion and is what this layer exists to find; `wrong-operation` (right server, wrong tool) is a Layer 1 problem and belongs in `tool-search-ranking.json`. "62% correct" is not actionable; the split is.

**Safety is scored on its own axis.** Requests naming no platform (`"Delete the campaign."`) have no correct tool, so they are scored only on whether the router invented a platform and called a destructive tool anyway. `unsafePicks` is **never folded into accuracy** — a router that is 90% accurate and deletes on a guessed platform is worse than one that is 80% accurate and asks.

**`isDestructive` is imported, not restated.** `scripts/lib/destructive-tools.mjs` now holds the single definition (name pattern OR terminal `cesteral.operation`), shared with the #201 terminal-operations ratchet. It deliberately excludes `annotations.destructiveHint`, which the fleet sets on **90 of 314 tools** including `create_entity` and `upload_video` — folding it in classifies every write as destructive and makes the safety number meaningless. The first draft did exactly that and scored 3/3 unsafe picks for a router that had picked a bid adjustment.

**What runs where.** The PR path (`evals/cross-server-routing.test.mjs`) runs everything provable for free: catalog invariants, corpus validation against the live tool surface, the scoring rules, the model router's request/response handling through an **injected `fetch`**, and the deterministic control end-to-end. The model half is **run by hand when tool text changes** (`pnpm eval:routing:model`), because it costs real calls against a ~125k-token catalog and is not a property of the commit under review. It accepts either `ANTHROPIC_API_KEY` or the `ANTHROPIC_AUTH_TOKEN` that `ant auth print-credentials --env` exports, so a local run needs no stored secret. There is deliberately **no schedule** — the input only changes when tool names, titles or descriptions change, so a weekly job would mostly bill for re-measuring an unchanged catalog. `.github/workflows/routing-evals.yml` keeps a `workflow_dispatch` path for the day a repo secret exists. `anthropicRouter` throws without an **explicit** `apiKey` — never read from the environment — so a PR-path run cannot start billing by accident.

**The control is the floor, and it is low.** Routing the merged catalog with the fleet's own shipped lexical scorer scores **7/20 (0.35)** and calls a destructive tool on **2 of 3** unnamed-platform requests. Recorded in `evals/cross-server-routing.baseline.json` from an actual run. **No model baseline exists yet** — the harness was authored with no `ANTHROPIC_API_KEY` available (`api.anthropic.com` is reachable; an unauthenticated probe returns 401, not a proxy 403), so the model router is recorded as `unmeasured` rather than given an invented number, on the same discipline as `platform-facts`' `unverified` and #203's `declared`.

## Tool Failure Logging

Every tool invocation is captured by `InteractionLogger` (`packages/shared/src/utils/interaction-logger.ts`). On failure, the entry adds the upstream HTTP trail (method, URL, status, redacted request/response bodies, per-attempt durations) recorded by `executeWithRetry` via `http-request-recorder.ts`.

Record shape (JSONL): `{ type: "tool_failure", ts, sessionId, requestId, tool, platform, params (redacted), errorCode, errorMessage, errorData, upstream: [{ method, url, status, attempt, durationMs, requestBodyRedacted, responseBodyRedacted, requestHeadersRedacted, responseHeadersRedacted }] }`

Destination is chosen by `INTERACTION_LOG_MODE`:

| Mode     | When                                                     | Storage                                                            |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `gcs`    | Hosted Cloud Run (default when `GCS_BUCKET_NAME` is set) | Instance-unique JSONL in GCS, flushed every 5s                     |
| `file`   | Self-host default                                        | Rotating JSONL at `~/.cesteral/interactions/`                      |
| `stdout` | Self-host with external log pipeline                     | Pino `info`/`error` line per entry — ship via any stdout log agent |

Hosted data is queryable in BigQuery via a JSON external table over `gs://<bucket>/<server-name>/interactions/*.jsonl`.

Redaction lives in **`secret-redaction.ts`**, shared by `http-request-recorder.ts` (which adds header redaction: Authorization, TTD-Auth, DeveloperToken, etc.) and `mcp-errors.ts`. The body/URL patterns cover bearer tokens plus `access_token`/`refresh_token`/`client_secret`/`api_secret`/`developer[_-]?token`/`password`/`assertion`/`id_token` in **both** JSON (`"k":"v"`) and form-urlencoded / query (`k=v`) shapes — the OAuth2 token-exchange and refresh bodies are `x-www-form-urlencoded`, which a `":"`-anchored pattern misses entirely. Response bodies are truncated at 8 KB.

The two used to be separate copies that drifted, and `mcp-errors.ts` held the weaker one: JSON-quoted keys only, no `=` form, no hyphen spelling, no URL handling — one of the four shapes the fleet's clients actually produce (sweep 2026-07-25, 02-F6/F7). `InteractionLogger.logFailure` also redacts `errorMessage` itself rather than trusting callers: `errorData` arrived sanitized while the message beside it, built by interpolating the failing URL or response body, did not (02-F5). **Add new patterns to `secret-redaction.ts` only** — a second copy is how this drifted the first time.

## Report CSV Spill

Large report CSVs (TTD, TikTok, Snapchat, Amazon DSP, Pinterest, MSADS) can be spilled to GCS so the MCP response stays bounded while the full body is still fetchable via a signed URL. Controlled by `@cesteral/shared`'s `spillCsvToGcs` helper, wired into each server's `download_report` tool; the helper reads these envs at call time:

| Env                                   | Default            | Behavior                                                                                                                                                            |
| ------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REPORT_SPILL_BUCKET`                 | _(unset)_          | When unset, spill is disabled entirely — the download tool returns only the bounded view. When set, the bucket receives CSV/JSON bodies that exceed the thresholds. |
| `REPORT_SPILL_THRESHOLD_BYTES`        | `16777216` (16 MB) | Minimum UTF-8 byte size that triggers a spill.                                                                                                                      |
| `REPORT_SPILL_THRESHOLD_ROWS`         | `100000`           | Minimum parsed row count that triggers a spill (OR'd with the byte threshold — either can fire).                                                                    |
| `REPORT_SPILL_SIGNED_URL_TTL_SECONDS` | `3600` (1h)        | Expiry on the V4 signed URL returned in `spill.signedUrl`.                                                                                                          |

**Object path:** `{server}/{sessionId?}/{reportId}-{timestamp}.{csv\|json}`. Sessioned prefixes enable per-session cleanup sweeps via `SessionServiceStore.onDelete` hooks (wired in each server's `session-services.ts`). A 24-hour GCS lifecycle rule on the `report_spill` bucket (provisioned in `terraform/main.tf`) is the primary cost control; the session hook is a belt-and-braces deletion that runs earlier when possible. Terraform variables `enable_report_spill` + `report_spill_bucket_name` gate the bucket provisioning.

**The delete hooks fire only for a session the receiving instance actually held.** They used to fire on every `delete()`, including for an id the instance had never seen — which is the normal case once scaled out, and made `DELETE /mcp` a way to sweep another tenant's spilled CSVs by id alone (sweep 2026-07-25, 02-F1). The trade is that a DELETE landing on an instance that does not hold the session no longer sweeps early; the 24-hour lifecycle rule covers it, which is why that rule and not the hook is the primary control.

**Failure modes never break the response.** If spill is enabled but the GCS write fails (permissions, quota, network), the download tool returns `{ spill: { error } }` plus a bounded-view warning, not an error — callers always get their summary/rows.

## TypeScript Build Issues

If you encounter "The inferred type cannot be named" errors, add explicit return type annotations:

```typescript
export function createMcpHttpServer(): express.Application { ... }
```
