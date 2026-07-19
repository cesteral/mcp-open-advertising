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

1. **Zod schema** for parameter validation
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

## Auth Mode Configuration

Each server has its own `MCP_AUTH_MODE` enum; the canonical list is in each package's `src/config/index.ts`. Common rules:

- `jwt` mode requires `MCP_AUTH_SECRET_KEY` and exposes the RFC 9728 endpoint at `/.well-known/oauth-protected-resource`
- SEP-2127 endpoint at `/.well-known/mcp/server-card.json` returns server discovery metadata (name, version, transports, auth modes, capabilities) on every server in every auth mode
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

- **dv360-mcp**: `dv360_delete_entity` performs a **hard delete** on most entities (verified live for `campaign`: subsequent `get_entity` returns 404). **Line items must be archived first** (`bulk_update_status` → `ENTITY_STATUS_ARCHIVED`) before delete — DV360 returns 400 otherwise. Use `dv360_update_entity` with `entityStatus=ENTITY_STATUS_ARCHIVED` for reversible removal on other entity types — archiving is itself irreversible (cannot unarchive). `dv360_duplicate_entity` always lands the copy in a non-running state (lineItem → `DRAFT`, others → `PAUSED`) — DV360's create endpoints don't accept the same statuses across entity types. `inventorySource` / `inventorySourceGroup` list calls require either `partnerId` or `advertiserId` (validated client-side).
- **ttd-mcp**: Surfaces TTD's documented Platform API only — REST (`/v3/...`) and GraphQL (`/graphql`). Per TTD Foundations §6, bulk operations (>100-record campaign/ad-group creates and updates) are only available through GraphQL — use `ttd_graphql_mutation_bulk`. Sandbox: set `TTD_USE_SANDBOX=true` to route at `ext-api.sb.thetradedesk.com` (weekly clone of prod, no real spend; audience uploads and `/v3/study` not supported).
- **linkedin-mcp**: URN-based entity IDs, `LinkedIn-Version: 202409` header, analytics via `/v2/adAnalytics` with pivot breakdowns.
- **tiktok-mcp**: `X-TikTok-Advertiser-Id` header in HTTP mode; image/video upload supported.
- **cm360-mcp**: `profileId` required on all calls, `list_user_profiles` for profile discovery, `list_targeting_options` for targeting; scheduling via `create/list/delete_report_schedule`.
- **pinterest-mcp**: cursor-based pagination via `bookmark` tokens. Video upload via `/v5/media`; image creatives reference URLs directly (Pinterest's `/v5/media` endpoint only supports `media_type="video"`).
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

## Key Design Principles

1. **Separation of Concerns**: One server per ad platform
2. **Stateless**: No persistent state between requests
3. **Type Safety**: Zod for runtime, TypeScript for compile-time
4. **Observability**: OTEL traces + metrics, Pino structured logs, InteractionLogger for tool-call + tool-failure persistence
5. **Scale-out-safe sessions**: the streamable-HTTP transport factory rebuilds session services on cache miss — a request with an `Mcp-Session-Id` unknown to the receiving Cloud Run instance triggers re-auth + `createSessionForAuth` using the client-supplied ID. The per-call credential fingerprint check still runs, so rebuild does not weaken session binding. Per-instance state not reconstructible from credentials (rate-limiter counters, in-memory `report-csv://` resources) may behave slightly differently after a scale-out event — documented inline in each subsystem.
6. **Enforce requires a distributed jti store on hosted deploys**: decision-token replay protection (`consumeOnce`) is only cross-instance-safe with `FirestoreJtiStore`. When any governed write resolves to token mode `enforce` and the factory falls back to the in-memory jti store, `registerToolsFromDefinitions` **fails closed at boot** on a hosted deployment (`K_SERVICE` set) or when `GOVERNANCE_JTI_STORE=firestore` is declared but never wired in — an in-memory enforce posture that could double-execute a money-moving write must not start. Set `GOVERNANCE_JTI_STORE=firestore` and inject `selectJtiStore(...)`'s result as `jtiStore`. Stdio / self-host (no `K_SERVICE`) keeps the in-memory store with a one-time warn; a deliberately single-instance Cloud Run can opt out with `GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE=true` (downgrades the boot error to a warn). Decision logic is the pure, tested `evaluateJtiStoreEnforcementSafety`.

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

Redaction lives in `http-request-recorder.ts` (headers: Authorization, TTD-Auth, DeveloperToken, etc.; body: bearer tokens, `access_token`/`refresh_token`/`client_secret`/`password` JSON fields). Response bodies are truncated at 8 KB.

## Report CSV Spill

Large report CSVs (TTD, TikTok, Snapchat, Amazon DSP, Pinterest, MSADS) can be spilled to GCS so the MCP response stays bounded while the full body is still fetchable via a signed URL. Controlled by `@cesteral/shared`'s `spillCsvToGcs` helper, wired into each server's `download_report` tool; the helper reads these envs at call time:

| Env                                   | Default            | Behavior                                                                                                                                                            |
| ------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REPORT_SPILL_BUCKET`                 | _(unset)_          | When unset, spill is disabled entirely — the download tool returns only the bounded view. When set, the bucket receives CSV/JSON bodies that exceed the thresholds. |
| `REPORT_SPILL_THRESHOLD_BYTES`        | `16777216` (16 MB) | Minimum UTF-8 byte size that triggers a spill.                                                                                                                      |
| `REPORT_SPILL_THRESHOLD_ROWS`         | `100000`           | Minimum parsed row count that triggers a spill (OR'd with the byte threshold — either can fire).                                                                    |
| `REPORT_SPILL_SIGNED_URL_TTL_SECONDS` | `3600` (1h)        | Expiry on the V4 signed URL returned in `spill.signedUrl`.                                                                                                          |

**Object path:** `{server}/{sessionId?}/{reportId}-{timestamp}.{csv\|json}`. Sessioned prefixes enable per-session cleanup sweeps via `SessionServiceStore.onDelete` hooks (wired in each server's `session-services.ts`). A 24-hour GCS lifecycle rule on the `report_spill` bucket (provisioned in `terraform/main.tf`) is the primary cost control; the session hook is a belt-and-braces deletion that runs earlier when possible. Terraform variables `enable_report_spill` + `report_spill_bucket_name` gate the bucket provisioning.

**Failure modes never break the response.** If spill is enabled but the GCS write fails (permissions, quota, network), the download tool returns `{ spill: { error } }` plus a bounded-view warning, not an error — callers always get their summary/rows.

## TypeScript Build Issues

If you encounter "The inferred type cannot be named" errors, add explicit return type annotations:

```typescript
export function createMcpHttpServer(): express.Application { ... }
```
