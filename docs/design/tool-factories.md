# Tool Factories Design Doc

## Status: Proposed (not yet implemented)

## Problem

Across the 13 MCP servers, ~150 tool definitions follow near-identical patterns for CRUD, bulk operations, and reporting. Each server implements its own versions of `list-entities`, `create-entity`, `get-entity`, `update-entity`, `delete-entity`, `bulk-create-entities`, `bulk-update-entities`, `bulk-update-status`, `submit-report`, `check-report-status`, and `download-report`.

This results in ~1,500-2,000 lines of duplicated boilerplate that varies only in:
- Platform name prefix (e.g., `meta_`, `tiktok_`, `snapchat_`)
- Entity type enums
- Zod schema field names
- Service method names

## Current Duplication Examples

### List Entities (~13 copies)

Every server's `list-entities.tool.ts` follows this pattern:

```typescript
// 1. Zod schema with entityType enum, filters, pagination
const schema = z.object({
  entityType: z.enum([...platformEntityTypes]),
  filters: z.record(z.unknown()).optional(),
  pageSize: z.number().optional(),
  pageToken: z.string().optional(),
});

// 2. Handler that resolves session services, calls service.listEntities(), formats response
async function handler(params, sdkContext) {
  const services = resolveSessionServices(sdkContext);
  const result = await services.platformService.listEntities(
    params.entityType, params.filters, params.pageToken, params.pageSize, context
  );
  return {
    content: [{ type: "text", text: JSON.stringify({
      entities: result.entities,
      total: result.entities.length,
      has_more: !!result.nextPageToken,
      next_page_token: result.nextPageToken,
    }) }],
  };
}
```

### Submit/Check/Download Report (~9 copies each)

Async reporting servers (tiktok, snapchat, pinterest, amazon-dsp, msads, cm360, sa360, dbm, linkedin) duplicate the submit-poll-download pattern.

## Proposed Factory API

### CRUD Factory

```typescript
// In @cesteral/shared
function createCrudToolDefinitions(config: {
  platformPrefix: string;          // "meta", "tiktok", etc.
  entityTypes: readonly string[];  // ["campaign", "adSet", "ad", ...]
  resolveServices: (sdkContext: unknown) => { service: CrudServiceLike };
}): ToolDefinition[];
```

### Bulk Operations Factory

```typescript
function createBulkToolDefinitions(config: {
  platformPrefix: string;
  entityTypes: readonly string[];
  maxBatchSize?: number;           // default: 50
  resolveServices: (sdkContext: unknown) => { service: BulkServiceLike };
}): ToolDefinition[];
```

### Reporting Factory

```typescript
function createReportingToolDefinitions(config: {
  platformPrefix: string;
  resolveServices: (sdkContext: unknown) => { reportingService: ReportingServiceLike };
}): ToolDefinition[];
```

## Trade-offs

### Benefits
- Single source of truth for tool behavior
- Cross-cutting changes (e.g., pagination format, error handling) applied once
- New servers get full tool suite with ~20 lines of config instead of ~500 lines of boilerplate

### Risks
- Reduced readability: tool behavior is indirect (config → factory → tool)
- Platform-specific edge cases may require escape hatches that erode the abstraction
- Testing: need to verify factory output matches hand-written tools exactly
- Migration cost: updating 13 servers simultaneously is risky

## Recommendation

**Defer until one of these triggers:**
1. Adding server #14 — use the factory for the new server, validate it works, then migrate existing servers incrementally
2. A cross-cutting tool change is needed (e.g., changing pagination format across all servers) — the pain of updating 13 files makes the factory ROI clear

The current duplication is manageable at 13 servers. The `registerToolsFromDefinitions()` factory already eliminates transport-layer boilerplate. Tool-level factories are a natural next step but should be driven by concrete need, not speculative cleanup.
