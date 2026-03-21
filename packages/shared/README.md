# @cesteral/shared

Shared infrastructure utilities, authentication, and types for Cesteral MCP servers.

## Installation

All MCP server packages depend on this package via pnpm workspace protocol (`workspace:*`). No separate installation is needed.

## Modules

### Authentication (`/auth`)

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `auth-strategy.ts` | `AuthStrategy`, `AuthInfo`, `AuthResult`, `createAuthStrategy()` | Pluggable auth strategy factory (`google-headers`, `jwt`, `none`) |
| `bearer-auth-strategy-base.ts` | `BearerAuthStrategyBase` | Abstract base for platform-specific bearer auth (Meta, LinkedIn, TikTok, Pinterest, Snapchat, Amazon DSP, Microsoft Ads) |
| `google-auth.ts` | `GoogleAuthAdapter`, `ServiceAccountAuthAdapter`, `OAuth2RefreshTokenAuthAdapter`, `parseCredentialsFromHeaders()` | Google OAuth2/SA token management with caching |
| `jwt.ts` | `verifyJwt()`, `createJwt()`, `extractBearerToken()`, `decodeJwtPayload()` | JWT verification and creation via `jose` library |

#### Example: Creating an auth strategy

```typescript
import { createAuthStrategy } from "@cesteral/shared";

const strategy = createAuthStrategy("jwt", { secretKey: process.env.MCP_AUTH_SECRET_KEY });
const result = await strategy.verify(request.headers);
// result: { authInfo, googleAuthAdapter?, platformAuthAdapter?, credentialFingerprint? }
```

### Utilities (`/utils`)

#### Core Infrastructure

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `server-bootstrap.ts` | `bootstrapMcpServer()`, `detectTransportMode()` | Main orchestrator: OTEL init, stdio/HTTP branching, graceful shutdown |
| `mcp-http-transport-factory.ts` | `createMcpHttpTransport()`, `startMcpHttpServer()` | Hono-based MCP HTTP transport with CORS, session management, RFC 9728 |
| `mcp-transport-helpers.ts` | `SessionManager`, `validateSessionReuse()`, `buildAllowedOrigins()` | Session lifecycle, credential fingerprinting, protocol version validation |
| `config-base.ts` | `BaseConfigSchema`, `getBaseEnvConfig()`, `parseConfigWithSchema()` | Zod-based environment configuration with defaults |

#### Tool Registration

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `tool-handler-factory.ts` | `registerToolsFromDefinitions()`, `ToolDefinitionForFactory` | Core factory that eliminates ~90 lines of boilerplate per server. Handles Zod validation, OTEL spans, JWT scope enforcement, interaction logging, response formatting, error handling |
| `prompt-handler-factory.ts` | `registerPromptsFromDefinitions()` | Prompt registration with standardized handling |
| `resource-handler-factory.ts` | `registerStaticResourcesFromDefinitions()` | Static resource registration |
| `zod-helpers.ts` | `extractZodShape()` | Unwraps ZodEffects for MCP SDK registration |

#### Example: Registering tools

```typescript
import { registerToolsFromDefinitions } from "@cesteral/shared";

registerToolsFromDefinitions({
  server: mcpServer,
  tools: allTools,
  resolveServices: (ctx) => resolveSessionServices(ctx),
  logger,
  rateLimiter,
});
```

#### Session Management

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `session-store.ts` | `SessionServiceStore<T>` | Typed Map from sessionId to services with credential fingerprinting |
| `session-resolver.ts` | `resolveSessionServicesFromStore()` | Session lookup with descriptive error on missing sessions |

#### Example: Session store

```typescript
import { SessionServiceStore } from "@cesteral/shared";

const store = new SessionServiceStore<MyServices>();
store.set(sessionId, services);
const services = resolveSessionServicesFromStore(store, sdkContext);
```

#### Networking & HTTP

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `fetch-with-timeout.ts` | `fetchWithTimeout()` | Fetch with AbortController timeout and request ID tracing |
| `retryable-fetch.ts` | `executeWithRetry()` | Exponential backoff on 429/5xx with Retry-After support |
| `download-file.ts` | `downloadFileToBuffer()` | URL-to-buffer download for platform upload tools |
| `multipart-form.ts` | `buildMultipartFormData()` | Multipart/form-data construction for binary file uploads |

#### Rate Limiting

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `rate-limiter.ts` | `RateLimiter`, `createPlatformRateLimiter()` | In-memory sliding window rate limiter with wildcard pattern support |

#### Example: Rate limiter

```typescript
import { createPlatformRateLimiter } from "@cesteral/shared";

const limiter = createPlatformRateLimiter("dv360", 100); // 100 req/min
await limiter.consume(sessionId); // throws McpError if rate exceeded
```

#### Logging & Errors

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `logger.ts` | `createLogger()` | Pino logger factory with pino-pretty in development |
| `mcp-errors.ts` | `McpError`, `JsonRpcErrorCode`, `ErrorHandler` | Structured MCP error handling with JSON-RPC code mapping |
| `request-context.ts` | `runWithRequestContext()`, `getRequestContext()`, `createRequestContext()` | AsyncLocalStorage-based request correlation with UUIDs |
| `interaction-logger.ts` | `InteractionLogger` | Append-only JSONL logger with file rotation and optional GCS persistence |

#### Example: Error handling

```typescript
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

throw new McpError(JsonRpcErrorCode.NotFound, "Campaign not found", { campaignId });
// Automatically serialized to JSON-RPC error response by the tool factory
```

#### Telemetry

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `telemetry.ts` | `initializeOpenTelemetry()`, `withToolSpan()`, `otelLogMixin()`, `shutdownOpenTelemetry()` | OpenTelemetry SDK init with GCP Cloud Run detection, span helpers |
| `metrics.ts` | `recordToolExecution()`, `registerActiveSessionsGauge()`, `recordAuthValidation()`, `recordRateLimitHit()` | Business metrics: tool execution counters/histograms, session gauges, auth/rate-limit counters |

#### Validation & Helpers

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `client-validation-helpers.ts` | `validateRequiredFields()`, `checkReadOnlyFields()` | Client-side entity validation without API calls |
| `elicitation-helpers.ts` | `elicitArchiveConfirmation()` | User confirmation for irreversible operations |
| `bulk-operation-schemas.ts` | `BulkOperationResultSchema` | Zod schema for bulk operation results |

#### Conformance Testing

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `conformance-echo-tool.ts` | `conformanceTools` | 6 test tools (echo, text, logging, elicitation variants) for MCP protocol conformance |
| `conformance-fixtures.ts` | `conformanceResources`, `conformancePrompts` | Test resources and prompts |
| `tool-examples-resource.ts` | `createToolExamplesResource()`, `createServerCapabilitiesResource()` | Auto-generated MCP Resources from tool metadata |

### Types (`/types`)

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `tool-types.ts` | `ToolDefinition`, `SdkContext`, `ResourceDefinition`, `ElicitResultLike` | Core type definitions for tool/resource registration |

## Usage

```typescript
// Import utilities
import { createLogger, McpError, JsonRpcErrorCode } from "@cesteral/shared/utils";

// Import auth
import { createAuthStrategy, verifyJwt } from "@cesteral/shared/auth";

// Or import everything from barrel
import { createLogger, createAuthStrategy, registerToolsFromDefinitions } from "@cesteral/shared";
```

## Context Efficiency Standards

- If a tool defines `outputSchema`, keep text responses concise and return full payload via `structuredContent`.
- Avoid embedding large JSON blobs in human-readable text fields.
- Keep tool descriptions short; place detailed workflows in MCP prompts/resources.
- Prefer compact default text formatting in shared tool handlers unless pretty output is explicitly required.

## Development

```bash
pnpm run build       # Build
pnpm run typecheck   # Type check
pnpm run test        # Test
pnpm run lint        # Lint
```

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

## License

Apache License 2.0 -- see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; Cesteral Intelligence and higher-level governance features live outside this repository.
