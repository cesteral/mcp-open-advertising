# Production Readiness Audit — Cesteral MCP Servers

**Date:** 2026-03-15
**Scope:** All 13 MCP servers + `@cesteral/shared` package
**Type:** Report only — no code changes

---

## 1. Executive Summary

The Cesteral MCP platform has a **strong production foundation**. All 13 servers share unified patterns from `@cesteral/shared` — bootstrap, transport, tool factory, auth, config validation, error handling, retry, and observability. Infrastructure is fully Terraform-managed with per-service IAM, health probes, automated rollback, and a monitoring dashboard covering all services.

**Key strengths:** Credential fingerprint binding prevents session hijacking; JWT advertiser scoping with audit trail; centralized error sanitization; exponential backoff with Retry-After; OTEL traces and metrics auto-exported to GCP.

**Targeted gaps:**
- P0: Cloud Build production approval gates are documented but commented out
- P1: In-memory rate limiting doesn't account for multi-instance scaling
- P1: CM360 and SA360 test coverage is critically low (3 and 7 test files respectively)
- P1: Bearer-token platforms would benefit from clearer 401 expiry messaging

---

## 2. Category Assessments

### 2.1 Auth & Authorization — Pass with Caveats

**Status:** Pass with caveats

**Evidence:**

- **Strategy pattern:** `AuthStrategy` interface (`shared/src/auth/auth-strategy.ts:66-80`) with `createAuthStrategy()` factory (`:212-236`) supporting modes: `google-headers`, `jwt`, `none`, and platform-specific bearer strategies.
- **JWT scope enforcement:** `shared/src/utils/tool-handler-factory.ts:420-471` blocks tool calls when scoped IDs (advertiser, account, customer) are not in `allowedAdvertisers`. Audit log emitted on denial (`:442-455`) with `event: "tool_access_denied"`, session ID, client ID, tool name, scoped field/value.
- **Bearer auth base class:** `shared/src/auth/bearer-auth-strategy-base.ts:37-125` implements two-branch pattern: tries refresh flow first, falls back to static access token. All 7 bearer-token servers extend this.
- **Token refresh implemented for some platforms:**
  - Meta: `meta-mcp/src/auth/meta-auth-adapter.ts:110-199` — `MetaRefreshTokenAdapter` with 24h expiry buffer, mutex for concurrent requests, long-lived token exchange via `/oauth/access_token`
  - TikTok: `tiktok-mcp/src/auth/tiktok-auth-adapter.ts:137-212` — `TikTokRefreshTokenAdapter` with 60s expiry buffer, rotating refresh token support
  - LinkedIn: `linkedin-mcp/src/auth/linkedin-auth-adapter.ts:95-100` — token response parsing with `expires_in`
- **Credential fingerprint binding:** `shared/src/utils/mcp-transport-helpers.ts:137-184` validates fingerprint on session reuse; `shared/src/utils/mcp-http-transport-factory.ts:303-326` enforces on every request. Mismatch logged as `session_fingerprint_mismatch` with both fingerprints.
- **Test coverage:** `shared/tests/utils/tool-handler-factory-authz.test.ts` covers unauthorized IDs, array-based scoped IDs, platform-specific ID formats (Meta `act_` prefix, LinkedIn URNs).

**Gaps:**

- **Token expiry UX for static bearer tokens:** Pinterest, Snapchat, Amazon DSP, and Microsoft Ads use static bearer tokens in HTTP mode without refresh adapters. When tokens expire, API calls fail with opaque platform errors rather than a clear "token expired, reconnect" message. The refresh branch in `BearerAuthStrategyBase` is available but requires client credentials that may not always be provided.

---

### 2.2 Transport & Sessions — Pass

**Status:** Pass

**Evidence:**

- **Unified transport factory:** `shared/src/utils/mcp-http-transport-factory.ts:143-433` — single factory function creates Hono app with session management, CORS, health endpoint, and MCP request handling. Used by all 13 servers.
- **Session cap:** `shared/src/utils/session-store.ts:13` — `DEFAULT_MAX_SESSIONS = 1000`. Factory returns 503 when full (`:329`).
- **Idle sweep:** `shared/src/utils/mcp-transport-helpers.ts:259-277` — `SessionManager.startSweep()` runs every 60 seconds, evicts sessions idle beyond `mcpStatefulSessionTimeoutMs` (default 1 hour, configurable via `MCP_STATEFUL_SESSION_TIMEOUT_MS`).
- **Graceful shutdown:** `shared/src/utils/server-bootstrap.ts:161-192` — handles SIGTERM/SIGINT, stops accepting connections, calls `SessionManager.shutdown()` to clean up all sessions (`:279-301`), flushes OTEL, allows 5-second grace period.
- **Fingerprint binding:** Covered in Auth section. Validated on every session reuse request.
- **Session lifecycle tracking:** `SessionManager` tracks `sessionCreatedAt`, `sessionLastActivity`, and `sessionServers` Maps. `touchSession()` called on every inbound request (`:230-234`).

**Notes:**

- Sessions are in-memory, which is expected and appropriate for Cloud Run's stateless container model. Each instance manages its own sessions independently.

---

### 2.3 Rate Limiting — Pass with Caveats

**Status:** Pass with caveats

**Evidence:**

- **Implementation:** `shared/src/utils/rate-limiter.ts:14-206` — sliding window algorithm using `Map<string, number[]>` for timestamp tracking. Supports wildcard patterns via precompiled RegExp (`:34-40`).
- **Auto-cleanup:** 5-minute interval removes entries older than 1 hour (`:158-171`). `destroy()` clears interval on shutdown.
- **Error format:** Throws `McpError` with `JsonRpcErrorCode.RateLimited`, includes `retryAfterSeconds` in data (`:69-79`).
- **Metrics:** `recordRateLimitHit()` increments OTEL counter `mcp.rate_limit.hit.count` with `key_pattern` attribute (`:67`, `shared/src/utils/metrics.ts:98-108`).
- **Per-server configurations:**

| Server | Default Limit | Key Pattern | Config File |
|--------|--------------|-------------|-------------|
| dbm-mcp | 100/min | `bidmanager:*` | `dbm-mcp/src/config/index.ts:34` |
| dv360-mcp | 60/min | `dv360:*` | `dv360-mcp/src/config/index.ts:34` |
| ttd-mcp | 100/min | `ttd:*` | `ttd-mcp/src/config/index.ts:35` |
| gads-mcp | 100/min | `gads:*` | `gads-mcp/src/config/index.ts:27` |
| meta-mcp | 200/min | `meta:*` | `meta-mcp/src/config/index.ts:28` |
| linkedin-mcp | 100/min | `linkedin:*` | `linkedin-mcp/src/config/index.ts:28` |
| tiktok-mcp | 100/min | `tiktok:*` | `tiktok-mcp/src/config/index.ts:28` |
| **cm360-mcp** | **50/min** | `cm360:*` | `cm360-mcp/src/config/index.ts:21` |
| sa360-mcp | 100/min | `sa360:*` | `sa360-mcp/src/config/index.ts:31` |
| pinterest-mcp | 100/min | `pinterest:*` | `pinterest-mcp/src/config/index.ts:28` |
| snapchat-mcp | 100/min | `snapchat:*` | `snapchat-mcp/src/config/index.ts:28` |
| amazon-dsp-mcp | 100/min | `amazon_dsp:*` | `amazon-dsp-mcp/src/config/index.ts:28` |
| msads-mcp | 100/min | `msads:*` | `msads-mcp/src/config/index.ts:37` |

- **Per-advertiser granularity:** DV360 uses `dv360:${advertiserId}` keys (`dv360-mcp/src/services/dv360/DV360-service.ts:191`). Snapchat uses per-operation keys like `snapchat:reporting`.
- **Test coverage:** `shared/tests/utils/rate-limiter.test.ts:1-225` covers sliding window, wildcard matching, multi-token consumption, reset, destroy lifecycle, and retryAfter calculation.

**Gaps:**

- **P1: In-memory rate limiting × multi-instance scaling.** Rate limit state is per-process. With Cloud Run auto-scaling, the effective limit becomes `configured_limit × instance_count`. For CM360 (50 req/min API quota), 10 instances would allow 500 requests/min to the upstream API, causing quota exhaustion. This is the most operationally significant gap in the current architecture.

---

### 2.4 Error Handling — Pass

**Status:** Pass

**Evidence:**

- **McpError class:** `shared/src/utils/mcp-errors.ts:78-130` — wraps errors in JSON-RPC 2.0 format with `toJsonRpc()` method. `fromError()` factory (`:114-129`) converts unknown errors.
- **ErrorHandler:** `shared/src/utils/mcp-errors.ts:143-267` — `convertToMcpError()` maps HTTP status codes to JSON-RPC error codes. Keyword-based classification for "not found", "unauthorized", "forbidden", "timeout", "rate limit", "validation".
- **Custom error codes:** `JsonRpcErrorCode` enum (`:14-31`) extends standard JSON-RPC with implementation-defined codes: `ServiceUnavailable`, `NotFound`, `Conflict`, `RateLimited`, `Timeout`, `Forbidden`, `Unauthorized`, `ValidationError`.
- **Error sanitization:** `ErrorHandler.sanitizeErrorData()` (`:237-266`) recursively redacts sensitive keys: `password`, `secret`, `token`, `apiKey`, `api_key`, `accessToken`, `access_token`, `refreshToken`, `refresh_token`, `credentials`. Replaced with `[REDACTED]`.
- **InteractionLogger sanitization:** `shared/src/utils/interaction-logger.ts:77-114` — additional patterns: `secret`, `token`, `authorization`, `password`, `key`, `credential`, `partner-id`. Deep clones with depth limit of 10.
- **Stack traces:** Captured via `Error.captureStackTrace()` (`:93-94`). Production uses JSON structured logging; development uses pino-pretty (`shared/src/utils/logger.ts:18-27`).
- **Test coverage:** `shared/tests/mcp-errors.test.ts:175-217` verifies redaction of nested objects with sensitive keys.

---

### 2.5 Retry Logic — Pass

**Status:** Pass

**Evidence:**

- **Implementation:** `shared/src/utils/retryable-fetch.ts:139-258` — `executeWithRetry()` with configurable `RetryConfig` (`:19-30`).
- **Defaults:** maxRetries=3, initialBackoffMs=1000, maxBackoffMs=10000, timeoutMs=10000 (`:79-82`).
- **Exponential backoff:** `initialBackoffMs * Math.pow(2, attempt)` capped at `maxBackoffMs` (`:101-123`).
- **Retry-After header:** Parsed from 429 responses, converted to milliseconds, respects maxBackoffMs cap (`:112-119`).
- **Retryable conditions:** HTTP 429 and 5xx status codes (`:85`). Also supports envelope-level `data.retryable = true` for platform-specific retryable errors (`:181`).
- **Adoption:** All 13 servers import and use `executeWithRetry` from shared.

---

### 2.6 Observability — Pass

**Status:** Pass

**Evidence:**

- **OTEL initialization:** `shared/src/utils/telemetry.ts:90-183` — singleton SDK with GCP Cloud Run auto-detection (`K_SERVICE`, `K_REVISION`, `K_CONFIGURATION` env vars). Sets resource attributes: `cloud.provider`, `cloud.platform`, `faas.name`, `faas.version`, `faas.instance`, `cloud.account.id`, `cloud.region`.
- **Exporters:** `buildExporters()` (`:54-85`) auto-selects GCP native (Cloud Trace/Monitoring) vs OTLP HTTP based on environment.
- **Log correlation:** `otelLogMixin()` (`:233-243`) injects `trace_id` and `span_id` into every Pino log line.
- **Pino structured logging:** `shared/src/utils/logger.ts:6-29` — JSON format in production, pino-pretty in development. Stdio mode outputs to stderr (fd 2) to avoid corrupting MCP protocol.
- **Terraform alerts (5 types × 13 services):** `terraform/modules/monitoring/main.tf`
  - Error rate (5xx percentage, `:65-117`)
  - P99 latency (`:123-162`)
  - Instance count (< 1 for 10 min, `:168-207`)
  - Uptime check failure (`:213-252`)
  - Audit access denied (> 10 events in 5 min, `:473-509`)
- **Dashboard:** `terraform/modules/monitoring/main.tf:258-428` — 8 widgets: service uptime, request count, P99 latency, tool execution count/duration, active sessions, auth validation success/failure.
- **Custom metrics:** `shared/src/utils/metrics.ts` — `recordToolExecution()`, `registerActiveSessionsGauge()`, `recordRateLimitHit()`, `recordAuthValidation()`.
- **InteractionLogger:** `shared/src/utils/interaction-logger.ts:120-339` — JSONL append-only with file rotation by date and size (10MB default), optional GCS persistence, secret sanitization. `close()` method (`:193-214`) drains buffer and closes stream gracefully.

---

### 2.7 Config Validation — Pass

**Status:** Pass

**Evidence:**

- **Base config schema:** `shared/src/utils/config-base.ts` — Zod schema with `mcpStatefulSessionTimeoutMs` (default 3600000), `mcpSessionMode` (stateless/stateful/auto), port, auth mode, log level.
- **Per-server extension:** Each server extends `BaseConfigSchema` with platform-specific fields (e.g., `cm360-mcp/src/config/index.ts:21` adds `CM360_RATE_LIMIT_PER_MINUTE`).
- **Fail-fast at startup:** Config is parsed via Zod at server bootstrap. Invalid config prevents server start.
- **Environment-based secrets:** All credentials loaded from environment variables, populated by GCP Secret Manager in production (`terraform/variables.tf:249-617`).

---

### 2.8 CI/CD — Pass with Caveats

**Status:** Pass with caveats

**Evidence:**

- **Cloud Build pipeline:** `cloudbuild.yaml` — 8 stages: test → docker build (parallel) → Trivy scan → docker push → terraform init/validate → tflint → terraform plan → terraform apply → health check + rollback.
- **Vulnerability scanning:** Trivy v0.55.2 with `HIGH,CRITICAL` severity filter (`cloudbuild.yaml:45-62`).
- **Secret scanning:** gitleaks in GitHub CI (`.github/workflows/ci.yml:65-74`) with allowlist for `.env.example`, test fixtures, terraform variables (`.gitleaks.toml`).
- **GitHub CI:** 3 jobs on PR/push to main/dev (`.github/workflows/ci.yml`):
  1. `build-and-test`: install, build, typecheck, test
  2. `terraform-validate`: init, validate, fmt check
  3. `secret-scan`: gitleaks full-history scan
- **Health check + rollback:** `cloudbuild.yaml:147-191` — polls `/health` up to 24 times (5s intervals), auto-rolls back to previous revision on failure.
- **All 13 services:** Built in parallel (`cloudbuild.yaml:33`), each with per-service Terraform image variables.

**Gaps:**

- **P0: Production approval gates commented out.** `cloudbuild.yaml:134-136`:
  ```
  # IMPORTANT: For production triggers, enable Cloud Build approval gates
  # to require manual review before terraform-apply runs.
  # See: https://cloud.google.com/build/docs/securing-builds/gate-builds-on-approval
  ```
  Without this, `terraform apply` with `--auto-approve` runs automatically on every build, meaning infrastructure changes (including potential destructive ones) deploy without human review.

---

### 2.9 Infrastructure — Pass

**Status:** Pass

**Evidence:**

- **Per-service IAM:** `terraform/modules/mcp-service/main.tf:19-69` — each service gets a dedicated runtime service account (`{service-name}-runtime`) with least-privilege roles:
  - `roles/secretmanager.secretAccessor` (`:31-37`)
  - `roles/logging.logWriter` (`:40-44`)
  - `roles/monitoring.metricWriter` (`:47-51`)
  - `roles/cloudtrace.agent` (`:54-58`)
  - `roles/storage.objectUser` if persistence enabled (`:64-69`)
  - `prevent_destroy = true` lifecycle rule (`:26`)
- **Health probes:** `terraform/modules/mcp-service/main.tf`
  - Startup probe: `/health`, 10s initial delay, 3s timeout, 10s period, 3 failure threshold (`:142-151`)
  - Liveness probe: `/health`, 30s initial delay, 3s timeout, 30s period, 3 failure threshold (`:154-163`)
- **Post-deploy rollback:** Covered in CI/CD section.
- **Networking:** `terraform/modules/networking/main.tf` — VPC with serverless subnet, VPC Access Connector (e2-micro), Cloud Router + Cloud NAT, firewall rules for Google APIs and external HTTPS.
- **Artifact Registry:** `terraform/main.tf:25-56` — cleanup policies: keep last 10 tagged images, delete untagged after 7 days.
- **Container security:** `Dockerfile` — `node:20-alpine` base (`:4`), multi-stage build, `USER node` non-root execution (`:57`), `NODE_ENV=production` (`:40`), production-only deps via `pnpm deploy`.

**Notes:**

- **Single region (europe-west2):** Referenced in `cloudbuild.yaml:6`, `terraform/variables.tf:11`, and all module configurations. This is a deliberate choice, not an oversight, but should be documented as an ADR with criteria for when multi-region becomes necessary.

---

### 2.10 Cross-Server Consistency — Pass with Caveats

**Status:** Pass with caveats

**Evidence:**

All 13 servers use the unified patterns from `@cesteral/shared`:

| Pattern | Shared Component | Adoption |
|---------|-----------------|----------|
| Bootstrap | `bootstrapMcpServer()` in `server-bootstrap.ts` | 13/13 |
| Transport | `createMcpHttpTransport()` in `mcp-http-transport-factory.ts` | 13/13 |
| Tool factory | `registerToolsFromDefinitions()` in `tool-handler-factory.ts` | 13/13 |
| Auth strategy | `createAuthStrategy()` / `BearerAuthStrategyBase` | 13/13 |
| Config validation | `BaseConfigSchema` with Zod | 13/13 |
| Error handling | `McpError` / `formatErrorForMcp()` | 13/13 |
| Retry | `executeWithRetry()` in `retryable-fetch.ts` | 13/13 |
| Rate limiting | `createPlatformRateLimiter()` | 13/13 |
| Observability | `initializeOpenTelemetry()` / `otelLogMixin()` | 13/13 |
| Session management | `SessionServiceStore` / `SessionManager` | 13/13 |

**Gaps:**

- **Test coverage variance:** Test-to-source ratios range from 5.8% (cm360) to 54.3% (shared). See section 3 for details.

---

## 3. Test Coverage Table

| Package | Source Files | Test Files | Ratio | Notes |
|---------|-------------|------------|-------|-------|
| shared | 35 | 19 | 54.3% | Best coverage; underpins all servers |
| gads-mcp | 53 | 23 | 43.4% | |
| ttd-mcp | 61 | 26 | 42.6% | |
| meta-mcp | 61 | 24 | 39.3% | |
| dv360-mcp | 84 | 29 | 34.5% | Most source files; complex dynamic schema |
| dbm-mcp | 54 | 15 | 27.8% | |
| pinterest-mcp | 62 | 15 | 24.2% | |
| snapchat-mcp | 62 | 14 | 22.6% | |
| amazon-dsp-mcp | 60 | 13 | 21.7% | |
| msads-mcp | 52 | 11 | 21.2% | |
| tiktok-mcp | 62 | 13 | 21.0% | |
| linkedin-mcp | 60 | 10 | 16.7% | |
| **sa360-mcp** | **47** | **7** | **14.9%** | **Low coverage** |
| **cm360-mcp** | **52** | **3** | **5.8%** | **Critically low** |

**Total:** 817 source files, 222 test files (27.2% overall)

---

## 4. Prioritized Recommendations

### P0 — Critical (before production traffic)

#### 1. Enable Cloud Build production approval gates

**File:** `cloudbuild.yaml:134-136`

The intent is already documented in comments. Without approval gates, `terraform apply --auto-approve` executes on every successful build, including infrastructure-level changes that could be destructive (e.g., service account modifications, networking changes, secret rotations).

**Action:** Configure Cloud Build approval requirements for the production trigger per the linked documentation. This is a GCP console/API configuration change, not a code change.

---

### P1 — Important (first month)

#### 2. Document rate limiter multi-instance behavior

**File:** `shared/src/utils/rate-limiter.ts` (in-memory `Map<string, number[]>`)

In-memory rate limiting means `effective_limit = configured_limit × instance_count`. Risk matrix:

| Server | Configured Limit | At 10 Instances | Platform Quota | Risk |
|--------|-----------------|-----------------|---------------|------|
| cm360-mcp | 50/min | 500/min | ~50/min | **High** |
| dv360-mcp | 60/min | 600/min | Varies | Medium |
| All others | 100-200/min | 1000-2000/min | Varies | Low-Medium |

**Options (not mutually exclusive):**
- (a) Set `configured_limit = platform_quota / max_instances` as a conservative default
- (b) Add Redis-backed rate limiter option for quota-sensitive platforms
- (c) Pin quota-sensitive servers (CM360) to `max_instances=1` in Terraform

#### 3. Increase CM360 and SA360 test coverage

CM360 has 3 test files for 52 source files; SA360 has 7 for 47. Both handle sensitive operations (campaign management, conversion tracking).

**Minimum recommended coverage:**
- Auth adapter and strategy tests
- HTTP client tests (retry behavior, error mapping)
- Critical service method tests (CRUD operations, reporting)
- Session lifecycle integration tests

#### 4. Add clear token-expiry messaging for bearer-token platforms

When a static bearer token expires, 7 servers (Meta, LinkedIn, TikTok, Pinterest, Snapchat, Amazon DSP, Microsoft Ads) propagate the platform's raw 401 error. The `BearerAuthStrategyBase` refresh branch (`shared/src/auth/bearer-auth-strategy-base.ts:47-49`) handles this when client credentials are provided, but in static-token mode the error is opaque.

**Action:** Intercept 401 responses in HTTP clients and return a structured error: "Access token expired or invalid. Please reconnect with fresh credentials." This improves the AI agent's ability to surface actionable guidance to users.

---

### P2 — Nice to have (first quarter)

#### 5. Container image signing

Add Binary Authorization to enforce verified-only deployments. Currently, images are pushed to Artifact Registry without attestation policies. This prevents unauthorized images from being deployed to Cloud Run.

#### 6. Verify InteractionLogger flush on shutdown

`InteractionLogger.close()` exists (`shared/src/utils/interaction-logger.ts:193-214`) and handles both FS stream closure and GCS buffer drain. Verify that all 13 servers call it in their `onShutdown` callbacks. The `server-bootstrap.ts` graceful shutdown calls `onShutdown` (`:143`, `:179`), but each server must explicitly include `interactionLogger.close()` in that callback.

#### 7. OTEL exporter health monitoring

`shutdownOpenTelemetry()` (`shared/src/utils/telemetry.ts:188-215`) handles graceful shutdown with timeout protection. Add a warning log on consecutive export failures to surface telemetry pipeline issues before they cause data loss.

#### 8. Staging environment gate

Add a separate Cloud Build trigger for staging that runs the full pipeline (including Terraform) against a staging GCP project. Production trigger should only fire after staging passes. This provides an additional safety layer beyond the P0 approval gate.

#### 9. Document single-region decision

All infrastructure targets `europe-west2` (`terraform/variables.tf:11`, `cloudbuild.yaml:6`). Write an Architecture Decision Record (ADR) capturing:
- Why europe-west2 was chosen (data residency, latency to ad platform APIs, cost)
- Criteria for when multi-region deployment becomes necessary (SLA requirements, traffic volume, regulatory changes)
- Estimated effort and architecture changes for multi-region

---

## 5. Security Posture Summary

| Control | Implementation | Evidence |
|---------|---------------|----------|
| **Session hijacking prevention** | Credential fingerprint binding on every request | `shared/src/utils/mcp-transport-helpers.ts:137-184` |
| **JWT advertiser scoping** | `allowedAdvertisers` claim enforced in tool handler factory | `shared/src/utils/tool-handler-factory.ts:420-471` |
| **Audit trail on denials** | Structured log with `event: "tool_access_denied"` + all context | `shared/src/utils/tool-handler-factory.ts:442-455` |
| **Error sanitization** | Recursive redaction of 10+ sensitive key patterns | `shared/src/utils/mcp-errors.ts:237-266` |
| **Interaction log sanitization** | Additional patterns including `partner-id`, `authorization` | `shared/src/utils/interaction-logger.ts:77-114` |
| **DNS rebinding protection** | Origin validation in transport factory | `shared/src/utils/mcp-http-transport-factory.ts` CORS config |
| **Non-root containers** | `USER node` in Dockerfile | `Dockerfile:57` |
| **Alpine base image** | `node:20-alpine` minimal attack surface | `Dockerfile:4` |
| **Production-only deps** | Multi-stage build with `pnpm deploy --prod` | `Dockerfile:29-35` |
| **Secret scanning** | gitleaks in CI with allowlist | `.github/workflows/ci.yml:65-74`, `.gitleaks.toml` |
| **Vulnerability scanning** | Trivy HIGH/CRITICAL in Cloud Build | `cloudbuild.yaml:45-62` |
| **Per-service IAM** | Dedicated service accounts with least-privilege roles | `terraform/modules/mcp-service/main.tf:19-69` |
| **No hardcoded secrets** | All via GCP Secret Manager environment injection | `terraform/variables.tf:249-617` |
| **Service account protection** | `prevent_destroy = true` lifecycle rule | `terraform/modules/mcp-service/main.tf:26` |

---

## Appendix: Server Inventory

| # | Server | Port | Auth Modes | Rate Limit | Test Files |
|---|--------|------|-----------|------------|------------|
| 1 | dbm-mcp | 3001 | google-headers, jwt, none | 100/min | 15 |
| 2 | dv360-mcp | 3002 | google-headers, jwt, none | 60/min | 29 |
| 3 | ttd-mcp | 3003 | ttd-headers, jwt, none | 100/min | 26 |
| 4 | gads-mcp | 3004 | google-headers, jwt, none | 100/min | 23 |
| 5 | meta-mcp | 3005 | meta-bearer, jwt, none | 200/min | 24 |
| 6 | linkedin-mcp | 3006 | linkedin-bearer, jwt, none | 100/min | 10 |
| 7 | tiktok-mcp | 3007 | tiktok-bearer, jwt, none | 100/min | 13 |
| 8 | cm360-mcp | 3008 | google-headers, jwt, none | 50/min | 3 |
| 9 | snapchat-mcp | 3009 | snapchat-bearer, jwt, none | 100/min | 14 |
| 10 | sa360-mcp | 3010 | sa360-headers, jwt, none | 100/min | 7 |
| 11 | pinterest-mcp | 3011 | pinterest-bearer, jwt, none | 100/min | 15 |
| 12 | amazon-dsp-mcp | 3012 | amazon-dsp-bearer, jwt, none | 100/min | 13 |
| 13 | msads-mcp | 3013 | msads-bearer, jwt, none | 100/min | 11 |
