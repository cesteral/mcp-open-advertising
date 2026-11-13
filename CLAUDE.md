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

Every server also includes an auto-generated `*_search_tools` discovery tool registered via `createToolSearchTool({ platform, getTools })` in the same array (a SHOULD for every server type; `scripts/lib/contract-tiers.mjs`).

### Session Service Pattern

Per-session service instances hold authenticated API clients. Key components in `src/services/session-services.ts`:

- `SessionServiceStore<SessionServices>` — typed map from sessionId → services
- `createSessionServices()` — called on new session connect
- `resolveSessionServices(sdkContext)` — called inside tool handlers

Lifecycle: created on connect → available via `resolveSessionServices()` → cleaned up on close/timeout.

### MCP Prompts

On-demand workflow guidance for complex multi-step operations. Located in `src/mcp-server/prompts/`. Register in `prompts/index.ts` via the `promptRegistry` Map — each entry pairs a `Prompt` metadata object with a `generateMessage(args)` function that returns the prompt body.

**The fleet-wide prompts (`cross_platform_campaign_setup`, `cross_platform_performance_comparison`) have one source: `@cesteral/shared`'s `utils/mcp/cross-platform-prompts.ts`.** Every server imports them into its `promptRegistry`; never keep a local copy. They used to be copy-pasted into 12 servers and drifted into 6 variants of each, disagreeing about money units (#235). `scripts/lib/cross-platform-prompts.test.mjs` boots every server and fails if any renders text that differs from the shared module, if a package source defines either prompt name itself, or if a server stops registering them. Prompt and resource text may only name registered tools or prompts (`scripts/lib/prompt-tool-references.test.mjs`).

## Auth Mode Configuration

Each server has its own `MCP_AUTH_MODE` enum; the canonical list is in each package's `src/config/index.ts`. Common rules:

- `jwt` mode requires `MCP_AUTH_SECRET_KEY` and exposes the RFC 9728 endpoint at `/.well-known/oauth-protected-resource`. The document lists `authorization_servers` only when `MCP_AUTHORIZATION_SERVERS` is set; without it the server logs `oauth_prm_incomplete` at startup, because an MCP OAuth client then has no way to find a token issuer (#246)
- Every 401 from `/mcp` goes through the factory's `unauthorized()` helper, which adds `WWW-Authenticate` where the mode has a Bearer credential: `jwt` (with `resource_metadata`) and the `*-bearer` platform modes. The `*-headers` and `ttd-token` modes get no challenge, because their credentials travel in custom headers
- SEP-2127 endpoint at `/.well-known/mcp/server-card.json` returns server discovery metadata (name, version, transports, auth modes, capabilities, the `untrusted_content` boundary, and the `operational` envelope — see [docs/architecture/server-card-operational-envelope.md](docs/architecture/server-card-operational-envelope.md)) on every server in every auth mode
- **DNS-rebinding protection on `/mcp`** (#241): the Host header (and Origin) are checked, keyed on the bind address; `MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS` configure it. A loopback bind is guarded by default; a hosted non-loopback bind is not checked on Host unless `MCP_ALLOWED_HOSTS` is set. `/health` and the `.well-known` documents are never guarded. The full rules are in [docs/architecture/http-transport-security.md](docs/architecture/http-transport-security.md).
- Server→client messages sent while handling a request (elicitation, `notifications/message`) must carry that request's id (`relatedRequestId` / `extra.sendNotification`); otherwise they go to the standalone GET stream, which this fleet answers with 405, and a destructive-op confirmation never reaches the client. See [docs/architecture/http-transport-security.md](docs/architecture/http-transport-security.md).
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

## Entity Snapshots and `parents`

The governance layer parses a governed write's read partner (`*_get_entity`) `structuredContent` as a `NormalizedEntitySnapshot`, so on the four hierarchical platforms (TTD, Google Ads, Meta, DV360) `*_get_entity` returns the snapshot at the top level beside `entity` / `timestamp` (`readPartnerSnapshotShape` in `@cesteral/shared`; an ungoverned entity kind returns neither). The same `build*Snapshot` builder feeds dry-run `expectedPostState` and the before/after of a real write.

`parents` (`campaign` / `insertion_order`, at most 4) lets a campaign-scoped control decide an ad-set / ad-group / line-item write. Rules: only levels above the entity (an advertiser is `accountId`); **absent means unknown, never "none"** (omit the key, never send `[]`, never invent a name); the parent `id` is in the form the connector uses as that ancestor's `platformEntityId` (Google Ads: the numeric campaign id, not the resource name); build it with `buildSnapshotParents` from `@cesteral/shared`. It is an optional, additive field of the contract snapshot (contract 2.3.0).

## Server-Specific Notes

Platform quirks that are easy to forget live next to the code, in `packages/<server>/CLAUDE.md`. Claude Code loads that file when you work in the package; read it before changing the package's tools or clients.

| Package          | Notes cover                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `dv360-mcp`      | Hard delete, archive-before-delete, duplicate landing non-running; the dynamic schema pattern     |
| `ttd-mcp`        | REST + GraphQL only; bulk operations; sandbox-only `ttd_graphql_mutation_bulk`; sandbox mode      |
| `linkedin-mcp`   | Staged `/v2/` → `/rest/` migration (#210), Rest.li 2.0 queries, targeting names, what is verified |
| `tiktok-mcp`     | Advertiser-ID header in HTTP mode, uploads                                                        |
| `meta-mcp`       | Graph API v26 field lists, the unconfirmed v26 targeting changes (#229)                           |
| `gads-mcp`       | `gads_duplicate_entity` (campaigns only, always `PAUSED`)                                         |
| `cm360-mcp`      | `profileId` on every call, profile discovery, report schedules                                    |
| `pinterest-mcp`  | `bookmark` pagination, video-only media upload, duplicate                                         |
| `snapchat-mcp`   | Ad Squads, cursor pagination, duplicate                                                           |
| `amazon-dsp-mcp` | Unified API entity surface (#234), reporting scope, LwA refresh-token auth                        |
| `sa360-mcp`      | Read-only entity API; offline conversions are the only governed writes                            |

`dbm-mcp` and `msads-mcp` have no notes of this kind.

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

### Release Attestation and Verification

`pnpm run generate:manifests` boots each server and writes `dist/cesteral-manifest.json` for every package with governed tools (those carrying an `annotations.cesteral` block); the tag-triggered `release.yml` publishes to npm with build provenance. Each tool's `definitionHash` is a canonical SHA-256 from `@cesteral/contract-hash`, kept bit-identical with the downstream governance repo, so changing a governed tool's name, description or schema moves its hash. Each manifest entry also carries a `verification` status (`declared` by default) held in `packages/<pkg>/verification.json`, never in the tool annotation, and automatically demoted when the hash changes. Details: [docs/architecture/release-attestation.md](docs/architecture/release-attestation.md).

## Key Design Principles

1. **Separation of Concerns**: One server per ad platform
2. **Stateless**: No persistent state between requests
3. **Type Safety**: Zod for runtime, TypeScript for compile-time
4. **Observability**: OTEL traces + metrics, Pino structured logs, InteractionLogger for tool-call + tool-failure persistence. A W3C `traceparent` (with `tracestate`) in a `tools/call` request's `_meta` parents the tool span (SEP-414, #247); the transport's active span is kept as a link. `baggage` is deliberately not read, because it is caller-controlled
5. **Scale-out-safe sessions**: the streamable-HTTP transport factory rebuilds session services on cache miss — a request with an `Mcp-Session-Id` unknown to the receiving Cloud Run instance triggers re-auth + `createSessionForAuth` using the client-supplied ID. The per-call credential fingerprint check still runs, so rebuild does not weaken session binding. Per-instance state not reconstructible from credentials (rate-limiter counters, in-memory `report-csv://` resources) may behave slightly differently after a scale-out event — documented inline in each subsystem.
6. **Enforce requires a distributed jti store on hosted deploys**: decision-token replay protection (`consumeOnce`) is only cross-instance-safe with `FirestoreJtiStore`. When any governed write resolves to token mode `enforce` and the jti store in use gives no cross-process guarantee, `registerToolsFromDefinitions` **fails closed** on a hosted deployment (`K_SERVICE` set) or when `GOVERNANCE_JTI_STORE=firestore` is declared but never satisfied — an enforce posture that could double-execute a money-moving write must not start. Stdio / self-host (no `K_SERVICE`) keeps the in-memory store with a one-time warn; a deliberately single-instance Cloud Run can opt out with `GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE=true` (downgrades the error to a warn). Decision logic is the pure, tested `evaluateJtiStoreEnforcementSafety`.

The full rules — where the check runs, store resolution order, the Firestore provisioning, and why both halves of the configuration are required — are in [docs/architecture/governance-runtime.md](docs/architecture/governance-runtime.md).

## Subsystem Reference

Each of these has a CI ratchet or a runtime guarantee that a change can trip. Read the doc before changing the subsystem.

| Subsystem                                                 | Read it when                                                                                                                                                                                                  | Doc                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Server card operational envelope                          | Changing the card's `operational` block, retry or rate-limit behaviour, or `rollback.terminalOperations`. Rate limit and retry policy are derived from live code; only terminal operations are hand-declared. | [server-card-operational-envelope.md](docs/architecture/server-card-operational-envelope.md) |
| Untrusted-content marking (#204)                          | Adding or changing a tool. On a `per-response` server every tool must declare `untrustedContent` (or `NO_UNTRUSTED_CONTENT`), or CI fails.                                                                    | [untrusted-content-marking.md](docs/architecture/untrusted-content-marking.md)               |
| Platform-facts ledger (#202)                              | Bumping an API version, changing a rate-limit default, or relying on a new platform constraint. `platform-facts.json` must agree with the code, or `pnpm check:platform-facts` fails.                         | [platform-facts-ledger.md](docs/architecture/platform-facts-ledger.md)                       |
| Release attestation and verification (#203)               | Changing a governed tool's definition, or recording a live test.                                                                                                                                              | [release-attestation.md](docs/architecture/release-attestation.md)                           |
| Governance runtime                                        | Touching decision-token enforcement, the jti store, or hosted `enforce` configuration.                                                                                                                        | [governance-runtime.md](docs/architecture/governance-runtime.md)                             |
| HTTP transport security                                   | Touching Host/Origin checks, or sending server→client messages from a handler.                                                                                                                                | [http-transport-security.md](docs/architecture/http-transport-security.md)                   |
| Tool failure logging                                      | Changing what is logged on a tool failure, or redaction. Add redaction patterns to `secret-redaction.ts` only.                                                                                                | [tool-failure-logging.md](docs/architecture/tool-failure-logging.md)                         |
| Report CSV spill                                          | Changing `download_report` tools or the `REPORT_SPILL_*` settings.                                                                                                                                            | [report-csv-spill.md](docs/architecture/report-csv-spill.md)                                 |
| Tool-search ranking and cross-server routing evals (#205) | Editing any tool's name, title or description, or reordering `allTools`.                                                                                                                                      | [evals.md](docs/architecture/evals.md)                                                       |

## Wire-Request Coverage (#236)

A write tool (`readOnlyHint: false`) needs a wire-request test, not just a mocked unit test. Each package's `tests/**/*wire*.test.ts` calls the tool's `*Logic` with only `fetch` stubbed and asserts the exact upstream method, URL and body against a vendor source cited in a `// basis:` comment. `scripts/lib/wire-request-coverage.test.mjs` boots every server and fails if a write tool's `*Logic` is never called (or its name never appears as a string literal; comments do not count) in a basis-citing wire test of its own package. Every write tool on all 13 servers is covered, so `wire-request-coverage-allowlist.json` lists no gaps; an entry added there needs a reason, and the list may only shrink: an entry that is now covered, no longer a write, or gone fails too.

## TypeScript Build Issues

If you encounter "The inferred type cannot be named" errors, add explicit return type annotations:

```typescript
export function createMcpHttpServer(): express.Application { ... }
```
