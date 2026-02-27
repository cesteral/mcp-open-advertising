# @cesteral/shared

Shared infrastructure utilities and authentication for Cesteral MCP servers.

## Contents

### Utilities (`/utils`)

- **Logger**: Pino-based structured logging with development/production modes
- **Errors**: MCP-focused error handling and JSON-RPC code mapping
- **Request Context**: Request tracking with correlation IDs
- **Telemetry/Metrics**: OpenTelemetry setup, spans, and business metrics
- **Tool Registration**: Shared MCP tool handler factory

### Authentication (`/auth`)

- **JWT**: Token verification and creation using `jose` library
- **Google Auth**: Service account and OAuth2 refresh token adapters
- **Strategies**: Configurable auth strategy factory (`google-headers`, `jwt`, `none`)

## Usage

```typescript
// Import utilities
import { createLogger, McpError, JsonRpcErrorCode } from "@cesteral/shared/utils";

// Import auth
import { createAuthStrategy, verifyJwt } from "@cesteral/shared/auth";

// Or import everything
import { createLogger, createAuthStrategy, registerToolsFromDefinitions } from "@cesteral/shared";
```

## Context Efficiency Standards

- If a tool defines `outputSchema`, keep text responses concise and return full payload via `structuredContent`.
- Avoid embedding large JSON blobs in human-readable text fields.
- Keep tool descriptions short; place detailed workflows in MCP prompts/resources.
- Prefer compact default text formatting in shared tool handlers unless pretty output is explicitly required.

## Development

```bash
# Build
pnpm run build

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Test
pnpm run test
```

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

## License

Business Source License 1.1 — see [LICENSE](../../LICENSE) for details.
