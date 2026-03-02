# Storage Module

**Version:** 2.4.6 (Stateless)
**Module:** `src/storage`

Storage abstraction layer providing a unified interface for multiple backend implementations. **This server uses a stateless architecture with no persistent storage.** The storage interface is preserved for future extensibility (e.g., caching results, storing historical metrics).

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Supported Providers](#supported-providers)
4. [Features](#features)
5. [Usage Examples](#usage-examples)
6. [Adding a New Provider](#adding-a-new-provider)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The storage module provides a **provider-agnostic persistence layer** for the MCP server. All storage operations flow through a single `StorageService` facade, which delegates to a configured backend provider via dependency injection.

**Current Status:**
- **Current Implementation**: No-op provider (stateless architecture)
- **Data Source**: Reads directly from platform APIs
- **Future Extensibility**: Storage interface preserved for future features:
  - Caching API responses for improved performance
  - Storing historical campaign metrics
  - Maintaining user preferences and saved queries

### Key Principles

- **Abstraction**: Business logic never depends on concrete storage implementations
- **Multi-Tenancy**: All operations require a `tenantId` for data isolation
- **Security**: Centralized validation prevents path traversal, injection attacks, and cross-tenant data access
- **Stateless v1**: This server uses a no-op provider (no persistence)
- **GCP Cloud Run**: Designed for stateless Cloud Run deployment

### Design Philosophy (v1)

```
Application Code
      ↓
StorageService (DI-injected facade)
      ↓
IStorageProvider interface
      ↓
NoOpStorageProvider (all operations are no-ops)
```

See the [root README](../../README.md#-configuration) for general configuration.

---

## Architecture

### Core Components

| Component               | Path                                                   | Purpose                                                                                                                                           |
| :---------------------- | :----------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`IStorageProvider`**  | [core/IStorageProvider.ts](core/IStorageProvider.ts)   | Interface contract all providers must implement. Defines `get`, `set`, `delete`, `list`, `getMany`, `setMany`, `deleteMany`, `clear`.             |
| **`StorageService`**    | [core/StorageService.ts](core/StorageService.ts)       | DI-managed facade. Validates inputs, extracts tenant ID from context, delegates to provider. Registered in `src/container/registrations/core.ts`. |
| **`storageFactory`**    | [core/storageFactory.ts](core/storageFactory.ts)       | Creates provider instances based on `STORAGE_PROVIDER_TYPE`. Handles runtime compatibility (serverless vs Node).                                  |
| **`storageValidation`** | [core/storageValidation.ts](core/storageValidation.ts) | Centralized input validation (tenant IDs, keys, prefixes, options). Provides cursor encoding/decoding with tenant binding.                        |

### Directory Structure

```
src/storage/
├── core/                   # Core abstractions and utilities
│   ├── IStorageProvider.ts       # Interface contract
│   ├── NoOpStorageProvider.ts    # No-op implementation (v1)
│   ├── StorageService.ts         # DI-managed facade
│   ├── storageFactory.ts         # Provider instantiation (returns no-op)
│   └── storageValidation.ts      # Input validation and security
└── index.ts                # Barrel exports
```

**Note**: This server uses only `NoOpStorageProvider`. All other providers have been removed for the stateless architecture.

---

## Supported Providers (v1)

### Current Provider: No-Op (Stateless)

**This server uses a stateless architecture** and does not persist any data. All storage operations are no-ops.

| Provider    | Runtime | Setup | Persistence | Best For                        |
| :---------- | :------ | :---- | :---------- | :------------------------------ |
| **No-Op**   | Node.js | None  | ❌ None     | Stateless services, Cloud Run   |

### Configuration

No configuration required. The storage factory automatically returns a `NoOpStorageProvider`:

```typescript
// src/storage/core/storageFactory.ts
export function createStorageProvider(
  config: AppConfig,
  deps: StorageFactoryDeps = {},
): IStorageProvider {
  logger.info('Creating no-op storage provider (stateless — no persistent storage)', context);
  return new NoOpStorageProvider();
}
```

### Future Providers (v2+)

When persistent storage is needed in future versions, the template originally supported:

- **In-Memory**: Development/testing (Map-based)
- **FileSystem**: Local development (Node only)
- **Supabase**: PostgreSQL-backed persistence
- **SurrealDB**: Graph database with advanced features
- **Cloudflare KV/R2**: Edge storage (Workers only)

See git history for provider implementations that were removed for v1 stateless architecture.

---

## Features (Interface Design)

**Note**: This server is stateless. These features describe the storage interface design, preserved for future extensibility.

### Multi-Tenancy

**All storage operations are scoped to a tenant.** The `StorageService` extracts `tenantId` from `RequestContext` and validates it (even though operations are no-ops in v1).

**Tenant ID Sources:**

- **With Auth**: Auto-extracted from JWT claim `'tid'` → propagated via `requestContextService.withAuthInfo()`
- **HTTP**: Explicitly set via `requestContextService.createRequestContext({ tenantId: '...' })`

**Validation Rules:**

- Maximum length: 128 characters
- Allowed characters: `[a-zA-Z0-9._-]`
- Must start and end with alphanumeric
- No consecutive dots (`..`) or path traversal sequences (`../`, `..\\`)

### Time-To-Live (TTL)

The storage interface supports TTL via `StorageOptions.ttl` (in seconds). In v1, TTL operations are no-ops since no data is persisted.

### Batch Operations

The storage interface includes batch operation methods. In v1, all operations are no-ops:

| Method                   | Purpose                        | v1 Behavior |
| :----------------------- | :----------------------------- | :---------- |
| **`getMany<T>(keys[])`** | Fetch multiple values          | Returns empty Map |
| **`setMany(entries)`**   | Store multiple key-value pairs | No-op (returns void) |
| **`deleteMany(keys[])`** | Delete multiple keys           | Returns 0 (no keys deleted) |

### Pagination

The storage interface includes pagination support via opaque cursors. In v1, `list()` operations return empty results:

- `list()` returns `ListResult` with empty `keys[]` array and no `nextCursor`
- Cursor validation is preserved for future use

For MCP resource pagination (outside storage), use utilities from `@/utils/index.js`:

- `extractCursor(meta)`: Extract cursor from request metadata
- `paginateArray(items, cursor, defaultPageSize, maxPageSize, context)`: Paginate in-memory arrays

### Validation & Security

**Defense in Depth:**

1. **Service Layer**: `StorageService` validates all inputs before reaching providers
2. **Provider Layer**: Providers perform additional sanitization (e.g., path traversal checks)
3. **Cursor Binding**: Pagination cursors are tenant-bound to prevent cross-tenant attacks
4. **Fail Closed**: Invalid input throws `McpError` (never coerced or silently ignored)

**Input Validation Rules:**

| Input          | Max Length | Allowed Characters    | Additional Rules                                             |
| :------------- | :--------- | :-------------------- | :----------------------------------------------------------- |
| **Tenant ID**  | 128        | `[a-zA-Z0-9._-]`      | Must start/end with alphanumeric, no `..`, no path traversal |
| **Key**        | 512        | Any except null bytes | No leading/trailing whitespace, not empty                    |
| **Prefix**     | 512        | Any except null bytes | Can be empty string                                          |
| **TTL**        | N/A        | Non-negative integer  | `0` = immediate expiration                                   |
| **List Limit** | N/A        | Positive integer      | Default: 1000                                                |

**Common Attack Vectors (Mitigated):**

| Attack                       | Mitigation                                                          |
| :--------------------------- | :------------------------------------------------------------------ |
| **Cross-tenant data access** | Cursor validation, tenant ID validation, namespace isolation        |
| **Path traversal**           | Input sanitization, path resolution checks, allowlist characters    |
| **Resource exhaustion**      | Pagination limits, key/prefix length limits, batch operation limits |
| **Injection attacks**        | Parameterized queries (Supabase/SurrealDB), input sanitization      |
| **Null byte injection**      | Validation rejects keys containing `\0`                             |

---

## Usage Examples (v1: No-Op)

**This server is stateless.** All storage operations are no-ops but the interface is preserved for future use.

### Basic Operations (No-Op in v1)

```typescript
import { container } from 'tsyringe';
import { StorageService } from '@/storage/index.js';
import { requestContextService } from '@/utils/index.js';

const storage = container.resolve(StorageService);
const context = requestContextService.createRequestContext({
  operation: 'storageExample',
  tenantId: 'tenant-123',
});

// Set with TTL (no-op in v1)
await storage.set('session:abc', { userId: 'user-456' }, context, {
  ttl: 3600,
});
// ✅ Succeeds but does nothing

// Get (returns null in v1)
const session = await storage.get<{ userId: string }>('session:abc', context);
// session === null

// Delete (returns false in v1)
const deleted = await storage.delete('session:abc', context);
// deleted === false
```

### Data Source

Instead of using storage, this server reads directly from platform APIs:

```typescript
import type { ToolDefinition } from '@/mcp-server/tools/utils/index.js';
import { z } from 'zod';

const campaignValidationTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'validate_campaign',
  description: 'Validates DV360 campaign configuration',
  inputSchema: z.object({ campaignId: z.string() }),
  outputSchema: z.object({ isValid: z.boolean(), issues: z.array(z.string()) }),

  logic: async (input, appContext, sdkContext) => {
    // Read directly from DV360 API (no storage)
    const campaignData = await fetchFromDv360Api(input.campaignId);

    // Perform validation
    const issues = validateCampaignRules(campaignData);

    return {
      isValid: issues.length === 0,
      issues,
    };
  },
};
```

### Future: Adding Storage (v2+)

When persistence is needed, replace `NoOpStorageProvider` with a real provider:

```typescript
// Example: Cache API responses for 1 hour
await storage.set(
  `campaign:${campaignId}`,
  campaignData,
  context,
  { ttl: 3600 }
);

// Retrieve from cache
const cached = await storage.get(`campaign:${campaignId}`, context);
if (cached) {
  return cached; // Skip API call
}
```

---

## Adding a New Provider (Future v2+)

**This server does not use persistent storage.** This section is preserved for future reference when storage is needed.

When adding a provider in future versions, refer to the git history for examples of provider implementations that were removed for v1.

### Prerequisites

- Familiarity with [IStorageProvider](core/IStorageProvider.ts) interface
- Provider-specific SDK installed (e.g., `bun add redis`)
- Environment variables planned

### Step 1: Create Provider File

**Location:** `src/storage/providers/{provider-name}/{provider-name}Provider.ts`

**Template Structure:**

```typescript
/**
 * @fileoverview {Provider} storage provider implementation.
 * @module src/storage/providers/{provider-name}/{provider-name}Provider
 */
import type {
  IStorageProvider,
  StorageOptions,
  ListOptions,
  ListResult,
} from '@/storage/core/IStorageProvider.js';
import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';
import { ErrorHandler, logger, type RequestContext } from '@/utils/index.js';

const DEFAULT_LIST_LIMIT = 1000;

/**
 * {Provider} storage provider implementation.
 *
 * Features:
 * - Native TTL support
 * - Batch operations
 * - Cursor-based pagination
 */
export class {Provider}Provider implements IStorageProvider {
  constructor(private readonly client: {ClientType}) {
    if (!client) {
      throw new McpError(
        JsonRpcErrorCode.ConfigurationError,
        '{Provider}Provider requires a valid client instance.',
      );
    }
  }

  /**
   * Namespace keys by tenant: {tenantId}:{key}
   */
  private getStorageKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  // Implement all IStorageProvider methods...
}
```

### Step 2: Implement IStorageProvider Methods

All 8 methods are required:

1. **`get<T>(tenantId, key, context): Promise<T | null>`**
   - Return `null` if key doesn't exist or is expired
   - Parse stored JSON and return typed value
   - Use `ErrorHandler.tryCatch` wrapper

2. **`set(tenantId, key, value, context, options?): Promise<void>`**
   - Serialize value to JSON
   - Apply TTL if `options?.ttl` provided
   - Namespace key by tenant

3. **`delete(tenantId, key, context): Promise<boolean>`**
   - Return `true` if key existed, `false` otherwise
   - Log deletion with `logger.debug`

4. **`list(tenantId, prefix, context, options?): Promise<ListResult>`**
   - Filter keys by `{tenantId}:{prefix}*` pattern
   - Return paginated results with `nextCursor`
   - Strip tenant prefix from returned keys

5. **`getMany<T>(tenantId, keys[], context): Promise<Map<string, T>>`**
   - Batch fetch multiple keys (use provider-specific batch operations)
   - Return `Map<string, T>` with only found keys
   - Skip unparseable values

6. **`setMany(tenantId, entries, context, options?): Promise<void>`**
   - Batch write multiple key-value pairs
   - Apply TTL to all entries if specified
   - Use transactions if provider supports them

7. **`deleteMany(tenantId, keys[], context): Promise<number>`**
   - Batch delete multiple keys
   - Return count of deleted keys

8. **`clear(tenantId, context): Promise<number>`**
   - Delete all keys for tenant
   - Return count of deleted keys
   - **DESTRUCTIVE**: Log with `logger.info`

**Key Implementation Patterns:**

```typescript
// Wrap all methods with ErrorHandler.tryCatch
async get<T>(tenantId: string, key: string, context: RequestContext): Promise<T | null> {
  return ErrorHandler.tryCatch(
    async () => {
      logger.debug(`[{Provider}] Getting key: ${key}`, context);
      // Implementation...
    },
    {
      operation: '{Provider}Provider.get',
      context,
      input: { tenantId, key },
    },
  );
}

// Handle TTL appropriately for provider
async set(tenantId: string, key: string, value: unknown, context: RequestContext, options?: StorageOptions): Promise<void> {
  const serialized = JSON.stringify(value);

  if (options?.ttl !== undefined) {
    // Provider-specific TTL implementation
    // Option A: Native TTL (Cloudflare KV, Redis)
    await this.client.setWithExpiry(key, serialized, options.ttl);

    // Option B: Envelope metadata (FileSystem, R2)
    const envelope = {
      __mcp: { v: 1, expiresAt: Date.now() + options.ttl * 1000 },
      value,
    };
    await this.client.set(key, JSON.stringify(envelope));

    // Option C: Database timestamp (Supabase, SurrealDB)
    const expiresAt = new Date(Date.now() + options.ttl * 1000);
    await this.db.upsert({ tenant_id: tenantId, key, value: serialized, expires_at: expiresAt });
  }
}
```

### Step 3: Add to Factory

**File:** `src/storage/core/storageFactory.ts`

1. Import the provider:

```typescript
import { {Provider}Provider } from '@/storage/providers/{provider-name}/{provider-name}Provider.js';
```

2. Add to `StorageFactoryDeps` interface:

```typescript
export interface StorageFactoryDeps {
  // ... existing deps ...
  readonly {provider}Client?: {ClientType};
}
```

3. Add case to switch statement:

```typescript
case '{provider-name}':
  if (!config.{provider}?.url) {
    throw new McpError(
      JsonRpcErrorCode.ConfigurationError,
      '{PROVIDER}_URL must be set for the {provider-name} storage provider.',
      context,
    );
  }
  if (deps.{provider}Client) {
    return new {Provider}Provider(deps.{provider}Client);
  }
  return container.resolve({Provider}Provider);
```

### Step 4: Register with DI (if needed)

If your provider requires a pre-configured client, register it in the DI container.

**File:** `src/container/tokens.ts`

```typescript
export const {Provider}Client = Symbol.for('{Provider}Client');
```

**File:** `src/container/registrations/core.ts`

```typescript
import { {Provider}Client } from '@/container/tokens.js';
import { {Provider}Provider } from '@/storage/providers/{provider-name}/{provider-name}Provider.js';

// In registerCoreServices():
if (config.storage.providerType === '{provider-name}' && config.{provider}?.url) {
  const client = await create{Provider}Client(config.{provider}.url);
  container.registerInstance({Provider}Client, client);

  container.register({Provider}Provider, {
    useFactory: (c) => {
      const client = c.resolve<{ClientType}>({Provider}Client);
      return new {Provider}Provider(client);
    },
  });
}
```

### Step 5: Configuration

**File:** `src/config/index.ts`

1. Add environment variables to schema:

```typescript
const configSchema = z.object({
  // ... existing fields ...

  {provider}: z.object({
    url: z.string().url().optional(),
    // ... other config fields ...
  }).optional(),

  storage: z.object({
    providerType: z.enum([
      'in-memory',
      'filesystem',
      'supabase',
      'surrealdb',
      'cloudflare-kv',
      'cloudflare-r2',
      '{provider-name}', // Add this
    ]).default('in-memory'),
    // ...
  }),
});
```

2. Map environment variables:

```typescript
const config: z.infer<typeof configSchema> = {
  // ... existing mappings ...

  {provider}: {
    url: process.env.{PROVIDER}_URL,
    // ... other fields ...
  },
};
```

### Step 6: Testing

**File:** `tests/storage/providers/{provider-name}/{provider-name}Provider.test.ts`

Use the compliance test suite to ensure your provider meets all interface requirements:

```typescript
import { describe, beforeAll, afterAll } from 'vitest';
import { {Provider}Provider } from '@/storage/providers/{provider-name}/{provider-name}Provider.js';
import { runComplianceTests } from '../storageProviderCompliance.test.js';

describe('{Provider}Provider Compliance', () => {
  let provider: {Provider}Provider;

  beforeAll(async () => {
    // Setup provider instance
    provider = new {Provider}Provider(client);
  });

  afterAll(async () => {
    // Cleanup
  });

  // Run standard compliance tests
  runComplianceTests(() => provider);
});

describe('{Provider}Provider Specific Tests', () => {
  // Test provider-specific features, edge cases, etc.
});
```

Run tests: `bun run test tests/storage/providers/{provider-name}/`

### Step 7: Documentation

1. **Update this README:**
   - Add provider to [Provider Comparison](#provider-comparison) table
   - Add configuration example to [Configuration Quick Reference](#configuration-quick-reference)
   - Add provider-specific notes if applicable

2. **Update root README:**
   - Add environment variables to configuration table

3. **Update AGENTS.md:**
   - Add provider to storage provider list

### Reference Implementation

See complete examples:

- Simple: [InMemoryProvider](providers/inMemory/inMemoryProvider.ts)
- Intermediate: [FileSystemProvider](providers/fileSystem/fileSystemProvider.ts)
- Advanced: [SurrealKvProvider](providers/surrealdb/kv/surrealKvProvider.ts)

---

## Troubleshooting

### Common Errors

| Error                                                                     | Cause                               | Solution                                                                                                         |
| :------------------------------------------------------------------------ | :---------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `Tenant ID is required for storage operations`                            | `context.tenantId` is missing       | Set explicitly in `createRequestContext({ tenantId: '...' })` or ensure JWT has `tid` claim |
| `Invalid tenant ID: exceeds maximum length of 128 characters`             | Tenant ID too long                  | Use shorter identifiers (UUIDs or short hashes)                                                                  |

**Note**: This server uses no-op storage, so most storage errors won't occur. Tenant ID validation still applies for logging and context tracking.

### No Persistent Data

This server reads directly from platform APIs and does not cache or persist data:

```typescript
// ❌ Don't rely on storage in v1
await storage.set('campaign:123', data, context);
const cached = await storage.get('campaign:123', context); // Always returns null

// ✅ Read directly from APIs
const campaignData = await fetchFromDv360Api(campaignId);
```

### Future: Adding Persistence (v2+)

When persistent storage is needed:

1. Replace `NoOpStorageProvider` with a real provider (see git history for examples)
2. Update `storageFactory.ts` to instantiate the new provider
3. Add required environment variables to `config/index.ts`
4. Configure backend (database, cache, etc.)

Common provider choices for future versions:
- **Supabase**: PostgreSQL-backed persistence
- **Redis**: Fast caching layer
- **Firestore**: GCP-native document store
- **Cloud Storage**: GCP object storage

---

**End of Storage Module Documentation**

For general MCP server documentation, see the [root README](../../README.md).
For strict development rules and agent guidance, see [AGENTS.md](../../AGENTS.md).
