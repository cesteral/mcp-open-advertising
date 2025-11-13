# Repository Structure Overview

This structure outlines the planned layout for the `dv360-mcp` package during the Phase 2 implementation.

```
packages/dv360-mcp/
├── src/
│   ├── index.ts                          # Server bootstrap & entry point
│   │
│   ├── config/
│   │   └── index.ts                      # Zod-validated environment config
│   │
│   ├── container/
│   │   ├── index.ts                      # Composition root (composeContainer)
│   │   ├── tokens.ts                     # DI tokens (Symbol-based)
│   │   └── registrations/
│   │       ├── core.ts                   # Core services (Logger, Config, etc.)
│   │       └── mcp.ts                    # MCP-specific (ToolRegistry, etc.)
│   │
│   ├── mcp-server/
│   │   ├── tools/
│   │   │   ├── definitions/
│   │   │   │   ├── index.ts              # Barrel export (all tools)
│   │   │   │   # Tier 1: Entity CRUD (Generic)
│   │   │   │   ├── list-entities.tool.ts
│   │   │   │   ├── get-entity.tool.ts
│   │   │   │   ├── create-entity.tool.ts
│   │   │   │   ├── update-entity.tool.ts
│   │   │   │   ├── delete-entity.tool.ts
│   │   │   │   # Tier 2: Workflow Tools (Domain-Specific)
│   │   │   │   ├── adjust-line-item-bids.tool.ts
│   │   │   │   ├── bulk-update-status.tool.ts
│   │   │   │   └── campaign-setup-wizard.tool.ts
│   │   │   └── utils/
│   │   │       ├── toolHandlerFactory.ts # createMcpToolHandler()
│   │   │       ├── toolRegistry.ts       # ToolRegistry class
│   │   │       ├── entityMapping.ts      # Entity type to API endpoint mapping
│   │   │       ├── requiredFields.ts     # Required fields per entity/method
│   │   │       └── types.ts              # ToolDefinition interface
│   │   │
│   │   ├── transports/
│   │   │   └── http/
│   │   │       ├── httpTransport.ts      # createHttpApp (Hono)
│   │   │       ├── httpErrorHandler.ts   # Global error handler
│   │   │       ├── sessionStore.ts       # SessionStore class
│   │   │       └── auth/
│   │   │           ├── authMiddleware.ts # JWT verification
│   │   │           ├── authContext.ts    # AsyncLocalStorage
│   │   │           └── authUtils.ts      # withRequiredScopes, etc.
│   │   │
│   │   └── prompts/
│   │       └── definitions/              # Future: workflow prompts
│   │           └── index.ts
│   │
│   ├── services/
│   │   └── dv360/
│   │       ├── DV360Service.ts           # Main API client (injectable)
│   │       ├── auth.ts                   # Service account auth
│   │       └── types.ts                  # Service-specific types
│   │
│   ├── utils/
│   │   ├── errors/
│   │   │   ├── McpError.ts               # Custom error class
│   │   │   ├── ErrorHandler.ts           # ErrorHandler utility
│   │   │   └── errorCodes.ts             # JsonRpcErrorCode enum
│   │   ├── internal/
│   │   │   ├── requestContext.ts         # RequestContextService
│   │   │   ├── logger.ts                 # Logger class (Pino)
│   │   │   └── performance.ts            # measureToolExecution()
│   │   ├── security/
│   │   │   ├── sanitization.ts           # Sanitization utility
│   │   │   ├── rateLimiter.ts            # RateLimiter class
│   │   │   └── withToolAuth.ts           # withToolAuth() wrapper
│   │   ├── network/
│   │   │   └── fetchWithTimeout.ts       # Timeout-aware fetch
│   │   └── telemetry/
│   │       └── index.ts                  # OpenTelemetry helpers
│   │
│   ├── generated/
│   │   └── schemas/
│   │       ├── types.ts                  # Generated TypeScript types (Phase 1 ✅)
│   │       └── zod.ts                    # Generated Zod schemas (Phase 1 ✅)
│   │
│   └── types-global/
│       ├── index.ts                      # Global type exports
│       ├── mcp.ts                        # MCP-specific types
│       └── common.ts                     # Common shared types
│
├── docs/
│   ├── ARCHITECTURE.md                   # Architecture overview
│   ├── REPO-STRUCTURE.md                 # Repository layout (this file)
│   ├── phase-2/
│   │   └── IMPLEMENTATION_REFERENCE.md   # Pseudo-code reference
│   └── schemas/                          # Phase 1 documentation (✅)
│       ├── generated-schema-example.md
│       ├── phase-1-summary.md
│       └── phase-1-implementation-checklist.md
│
├── scripts/
│   ├── generate-schemas.ts               # Schema extraction pipeline (Phase 1 ✅)
│   └── lib/                              # Schema generation utilities
│
├── config/
│   └── schema-extraction.config.ts       # OpenAPI extraction config
│
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

> **Note:** Many directories are forward-looking for Phase 2. They should be created alongside the implementation to keep documentation and code aligned.
