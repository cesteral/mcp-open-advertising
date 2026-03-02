# Agent Protocol & Architectural Mandate

**Version:** 1.0.0
**Target Project:** Cesteral MCP Server
**Last Updated:** 2025-11-03

---

## I. Core Principles (Non-Negotiable)

1. **The Logic Throws, The Handler Catches**  
   Keep tool/resource logic pure and stateless. Do not add `try...catch` blocks inside `logic`. Throw `new McpError(...)` with the right `JsonRpcErrorCode` and let the handler (`createMcpToolHandler`, `registerResource`) catch, log, and format the response.

2. **Full-Stack Observability**  
   OpenTelemetry and structured logging are wired in. `measureToolExecution` tracks latency, payload size, and success/error outcomes. Never bypass the logger with `console.*`; always pass the provided `RequestContext`.

3. **Structured, Traceable Operations**  
   The handler provides both `appContext` (logging/tracing) and the raw `sdkContext` (elicitation, sampling, roots). Keep the same `appContext` flowing through nested calls for correlated telemetry.

4. **Stateless Architecture (v1)**
   This server is stateless and does not use persistent storage. The `StorageService` uses a no-op provider.

5. **GCP Cloud Run Deployment**
   Everything must run in HTTP mode for Cloud Run deployment. The server listens on port 8080 (Cloud Run default) and uses Hono for HTTP transport. STDIO transport has been removed.

6. **Use Elicitation for Missing Input**  
   When required arguments are absent, call `sdkContext.elicitInput()`. See `template-madlibs-elicitation.tool.ts` for the reference pattern.

---

## II. Architecture Overview & Layout

Respect the existing structure—new components belong with their peers.

| Directory | Purpose & Guidance |
| :-- | :-- |
| `src/config/` | Zod-backed configuration loader (`parseConfig`, `config`). Keep environment parsing here. |
| `src/container/` | Dependency injection tokens, registrations, and `composeContainer`. New services need tokens and registration functions. |
| `src/mcp-server/tools/definitions/` | Declarative tool definitions (`[tool-name].tool.ts`). Reference `template-cat-fact.tool.ts` and `template-madlibs-elicitation.tool.ts` for structure. |
| `src/mcp-server/resources/definitions/` | Declarative resource definitions (`[resource-name].resource.ts`). See `echo.resource.ts`. |
| `src/mcp-server/tools/utils/` | Tool infrastructure: `ToolDefinition`, `createMcpToolHandler`, typing helpers. |
| `src/mcp-server/resources/utils/` | Resource infrastructure: `ResourceDefinition`, `registerResource`, shared formatter helpers. |
| `src/mcp-server/transports/` | Transport manager, HTTP adapter, auth middleware, session handling. |
| `src/storage/` | Storage service with no-op provider (stateless architecture for v1). |
| `src/utils/` | Shared utilities: logger, request context, error handling, metrics, security, telemetry, network helpers. |
| `src/types-global/` | Cross-cutting types (errors, JSON-RPC codes, shared interfaces). |

---

## III. Tool & Resource Fundamentals

1. **Define Metadata & Schemas**  
   - Tools: name (snake_case), title, description, annotations, `inputSchema`, `outputSchema`.  
   - Resources: name, title, description, `uriTemplate`, `paramsSchema`, optional `outputSchema`, `examples`, `annotations`.
   - Every Zod schema field must include `.describe()` so documentation surfaces correctly.

2. **Implement Pure Logic**  
   ```ts
   async function logic(input, appContext, sdkContext) {
     logger.debug('Processing', appContext);
     // ... throw McpError on failure
     return result;
   }
   ```
   - Tools receive `(input, appContext, sdkContext)`.
   - Resources receive `(uri: URL, params, appContext)`.

3. **Apply Authorization**  
   Wrap logic with `withToolAuth([...])` or `withResourceAuth([...])`. Scopes mirror the `tool:` / `resource:` naming convention.

4. **Register via Barrel Export**  
   Add your definition to `allToolDefinitions` or `allResourceDefinitions` inside their respective `index.ts` files.

5. **Resource Notes**  
   - If you paginate, follow the MCP spec (`nextCursor` semantics). Encode cursors as opaque strings (`encodeCursor` / `decodeCursor` in `storageValidation.ts` are available for storage-backed cursors).  
   - Return `ReadResourceResult['contents']`; use the default formatter when JSON output is sufficient.

---

## IV. Quick Start: Creating Your First Tool

- [ ] **1. Review the template:** `template-cat-fact.tool.ts` shows the canonical layout.
- [ ] **2. Create file:** `src/mcp-server/tools/definitions/<your-tool>.tool.ts` (kebab-case filename, snake_case `TOOL_NAME`).
- [ ] **3. Metadata:** Define name/title/description/annotations.
- [ ] **4. Schemas:** Build `InputSchema` and `OutputSchema` with complete `.describe()` metadata.
- [ ] **5. Logic:** Pure async function, no `try...catch`, throw `McpError` on failure.
- [ ] **6. (Optional) Response formatter:** Convert structured result into `ContentBlock[]`.
- [ ] **7. Auth:** Wrap logic with `withToolAuth([...])`.
- [ ] **8. Export:** Assemble the `ToolDefinition` (`metadata`, `schemas`, `logic`, `responseFormatter`).
- [ ] **9. Register:** Add to `allToolDefinitions` in `src/mcp-server/tools/definitions/index.ts`.
- [ ] **10. Static checks:** `npm run lint && npm run typecheck`.
- [ ] **11. Tests:** `npm run test`.
- [ ] **12. Smoke test:** `npm run dev` (HTTP mode) and exercise via your MCP client.

For resources, mirror the process using `echo.resource.ts` as your reference implementation.

---

## V. Dependency Injection & Tokens

DI is powered by `tsyringe`. Compose once via `composeContainer()` before resolving anything.

| Service / Value | Token | Usage | Notes |
| :-- | :-- | :-- | :-- |
| App config | `AppConfig` | `@inject(AppConfig) private config: AppConfig` | Parsed, validated config object. |
| Logger | `Logger` | `@inject(Logger) private logger: typeof logger` | Pino-backed structured logger. |
| Storage provider | `StorageProvider` | Inject into services needing provider-level access | No-op provider for v1 (stateless architecture). |
| Storage service | `StorageService` | `@inject(StorageService) private storage: StorageService` | No-op implementation for v1. Interface preserved for future extensibility. |
| Tool definitions (multi) | `ToolDefinitions` | `@injectAll(ToolDefinitions)` | Provides all registered `ToolDefinition`s. |
| Resource definitions (multi) | `ResourceDefinitions` | `@injectAll(ResourceDefinitions)` | Provides all registered `ResourceDefinition`s. |
| MCP server factory | `CreateMcpServerInstance` | `@inject(CreateMcpServerInstance) private createServer: () => Promise<McpServer>` | Used by transports to create configured servers. |
| Rate limiter | `RateLimiterService` | `@inject(RateLimiterService) private limiter: RateLimiter` | Token bucket limiter for shared services. |
| Transport manager | `TransportManagerToken` | `@inject(TransportManagerToken) private manager: TransportManager` | Starts/stops the configured transport. |

When adding new services, define a token in `src/container/tokens.ts`, register it inside `registrations/core.ts` or `registrations/mcp.ts`, and export through `src/container/index.ts`.

---

## VI. Shared Utilities

Key exports via `@/utils/index.js`:

- `logger`, `requestContextService` — structured logging, traceable request scaffolding.
- `ErrorHandler`, `ErrorHandler.tryCatch` — standardized error classification and wrapping.
- `measureToolExecution` — timing wrapper for tool logic (auto logs success/failure metrics).
- `fetchWithTimeout` — AbortController-based fetch helper with logging.
- `sanitization` helpers and `sanitizeInputForLogging` — defensive input cleaning.
- `rateLimiter` (`RateLimiter` class) — DI-friendly rate limiting.
- `tokenCounter` — metrics helper for counting request/response tokens.
- `telemetry` module — OpenTelemetry initialization, metrics/trace helpers.

Explore the subdirectories (`internal/`, `metrics/`, `network/`, `security/`, `telemetry/`, `types/`) for additional domain-specific helpers. Prefer using the barrel exports over deep relative paths.

---

## VII. Authentication & Authorization

- **HTTP transport:** Controlled via `MCP_AUTH_MODE` (`none` | `jwt` | `oauth`).
  - `jwt`: use `MCP_AUTH_SECRET_KEY`. Recommended for MCP client → server communication.
  - `oauth`: JWKS verification with `OAUTH_ISSUER_URL`, optional `OAUTH_JWKS_URI`, and `OAUTH_AUDIENCE`. Cooldown/timeouts are configurable.
- **Scopes:** Enforced by the `withToolAuth` / `withResourceAuth` wrappers. When auth is disabled, wrappers allow everything so you can reuse the same definitions.
- **Endpoints:** `/healthz` and `GET /mcp` stay open. `POST`/`DELETE /mcp` are protected when auth is enabled. CORS defaults to `*` unless `MCP_ALLOWED_ORIGINS` provides a CSV list.
- **Service Accounts:** For MCP server → DV360/Bid Manager APIs, use Google Cloud service accounts with appropriate IAM roles.

---

## VIII. Transports & Lifecycle

- `createMcpServerInstance` (`src/mcp-server/server.ts`) builds the MCP server, registers tools/resources/prompts/roots, and configures capabilities.
- `TransportManager` (`src/mcp-server/transports/manager.ts`) starts and stops the HTTP transport.
- HTTP transport (`src/mcp-server/transports/http/`) uses Hono + `@hono/mcp`, adds auth middleware, CORS, session handling, and RFC-compliant metadata endpoints.
- `src/index.ts` is the Node entry point (composes DI, sets up telemetry and logging, starts HTTP transport on port 8080 for Cloud Run).

---

## IX. Code Style, Validation, and Security

- File headers should include `@fileoverview` and `@module`.
- Stick to Zod validation for all inputs. Every schema field needs `.describe()` for documentation parity.
- Always log via the shared `logger` and include the active `RequestContext`.
- Throw `McpError` with the appropriate `JsonRpcErrorCode`. Handlers will wrap non-MCP errors automatically.
- Configuration secrets live in `src/config/index.ts`. Never read environment variables elsewhere.
- Rate limiting is centralized: inject `RateLimiterService` where needed instead of instantiating new limiters.
- Telemetry is auto-configured; avoid manual span creation unless absolutely necessary.

---

## IX.A. Git Commit Messages

- No heredocs or command substitution in commit messages. Use plain strings with `git commit -m "..."`.
- Follow Conventional Commits (`feat(scope): ...`, `fix(scope): ...`, `docs(scope): ...`, etc.).
- Keep commits atomic. Stage only the files that belong together.

---

## X. Commands & Checks

| Command | Purpose |
| :-- | :-- |
| `npm run dev` | Start the HTTP development server with watch mode. |
| `npm run dev:http` | Alias for `npm run dev` (HTTP transport only). |
| `npm run lint` | Run ESLint across the project. |
| `npm run typecheck` | Run TypeScript in no-emit mode. |
| `npm run test` | Execute the Vitest suite. |
| `npm run build` | Bundle the Node entry (`dist/index.js`). |
| `npm run start:http` | Run the built server in production mode (HTTP on port 8080). |

Run `lint`, `typecheck`, and `test` before sending PRs or publishing.

---

## XI. Configuration & Environment

Configuration is validated in `src/config/index.ts`. Key categories:

| Category | Variables |
| :-- | :-- |
| **Server identity** | `MCP_SERVER_NAME`, `MCP_SERVER_VERSION`, `MCP_SERVER_DESCRIPTION` (defaults to `package.json` metadata). |
| **Logging** | `MCP_LOG_LEVEL` (default: `debug`), optional `LOGS_PATH` (file output for Node environments). |
| **Transport & sessions** | `MCP_TRANSPORT_TYPE` (always `http`), `MCP_SESSION_MODE`, `MCP_RESPONSE_VERBOSITY`, `MCP_HTTP_HOST` (default: `0.0.0.0`), `MCP_HTTP_PORT` (default: `8080`), `MCP_HTTP_ENDPOINT_PATH`, `MCP_HTTP_MAX_PORT_RETRIES`, `MCP_HTTP_PORT_RETRY_DELAY_MS`, `MCP_STATEFUL_SESSION_STALE_TIMEOUT_MS`, `MCP_ALLOWED_ORIGINS`. |
| **Auth** | `MCP_AUTH_MODE` (default: `none`), `MCP_AUTH_SECRET_KEY`, `OAUTH_ISSUER_URL`, `OAUTH_JWKS_URI`, `OAUTH_AUDIENCE`, `OAUTH_JWKS_COOLDOWN_MS`, `OAUTH_JWKS_TIMEOUT_MS`, `DEV_MCP_CLIENT_ID`, `DEV_MCP_SCOPES`, `MCP_SERVER_RESOURCE_IDENTIFIER`. |
| **Storage** | No persistent storage in v1 (stateless architecture). Storage interface preserved for future extensibility. |
| **Telemetry** | `OTEL_ENABLED` (default: `true`), `OTEL_SERVICE_NAME`, `OTEL_SERVICE_VERSION`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `OTEL_TRACES_SAMPLER_ARG`, `OTEL_LOG_LEVEL`. |

Leave unset variables at their defaults unless the deployment requires overrides.

---

## XII. GCP Cloud Run Deployment

- This server is designed for **GCP Cloud Run** deployment.
- **HTTP transport only** - listens on port 8080 (Cloud Run default) on all interfaces (0.0.0.0).
- **Stateless architecture** - no persistent storage required for v1.
- **Authentication:**
  - JWT for MCP client → server communication (`MCP_AUTH_MODE=jwt`)
  - Service accounts for MCP server → platform APIs
- **OpenTelemetry enabled by default** for production monitoring.
- Infrastructure managed via Terraform for reproducible deployments.
- Use `npm run dev` for local development to match production runtime.

---

## XIII. Multi-Tenancy Context

- This server is stateless by default, but `context.tenantId` is still used for logging and future extensibility.
- Validation rules: max 128 characters, alphanumeric plus `- _ .`, must start/end with alphanumeric, no `../` or consecutive dots.
- **HTTP + Auth:** When auth is enabled, tenant IDs flow from the JWT `tid` claim via `requestContextService.withAuthInfo()`.
- Storage operations are no-ops in v1, but the interface is preserved for future caching or persistence features.

---

## XIV. Quick Checklist

- [ ] Pure logic (no internal try/catch); throw `McpError` on failure.
- [ ] Wrap logic with `withToolAuth` / `withResourceAuth` as appropriate.
- [ ] Use `logger` + `RequestContext` for all logs.
- [ ] Interact with persistence via the DI `StorageService`.
- [ ] Use elicitation helpers (`sdkContext.elicitInput`, `sdkContext.createMessage`) when you need additional user input.
- [ ] Register new definitions in their barrel indexes.
- [ ] Write or update tests (`npm run test`).
- [ ] Run `npm run lint` and `npm run typecheck`.
- [ ] Smoke-test with HTTP transport (`npm run dev:http`).


