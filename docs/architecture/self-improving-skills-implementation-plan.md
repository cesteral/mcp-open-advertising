# Plan: Finding Aggregation — Close the Agent Behavior Feedback Loop

## Context

Evaluator hooks fire after every tool execution across all 5 MCP servers, detecting issues like broad payloads (>25 fields), slow latency (>20s), and excessive updateMask breadth. But these findings only emit OTEL metrics and then vanish — no persistence, no pattern detection, no way for agents to learn from past mistakes. This plan implements **Phase 2 of self-improving-skills.md**: persist evaluator findings to disk, detect recurring patterns across sessions, and expose them to AI agents via MCP resources.

**Outcome**: After this work, an AI agent can read `findings://patterns/all` and see "agents consistently send broad TTD payloads (15 occurrences, 82% confidence)" — then adjust its behavior or propose a skill improvement.

---

## Architecture

```
Tool Execution → Evaluator fires → FindingBuffer (per-session, in-memory)
                                        │
                              session close / timeout / shutdown
                                        │
                                        ▼
                                FindingStore (JSONL on disk, 30-day retention)
                                        │
                              MCP resource read by agent
                                        │
                                        ▼
                        findings://session/current  (live buffer)
                        findings://patterns/all     (cross-session patterns)
                        findings://summary          (aggregate stats)
```

---

## Implementation Steps (dependency order)

### Step 1: Shared types — `packages/shared/src/utils/finding-types.ts` (NEW)

Pure interfaces, no runtime deps. Defines:

- `PersistedFinding` — single evaluator observation (id, sessionId, timestamp, toolName, workflowId, platform, serverPackage, issues[], scores, durationMs)
- `PersistedIssue` — issue detail (class, message, isRecoverable, metadata)
- `DetectedPattern` — recurring finding cluster (patternId, workflowId, issueClass, description, occurrenceCount, confidence, firstSeen, lastSeen, sampleFindingIds)
- `FindingQueryFilter` — filter params (workflowId, platform, serverPackage, issueClass, minOccurrences, timeWindowDays)
- `FindingSummary` — aggregate stats (totalFindings, findingsByClass, findingsByWorkflow, topPatterns)
- `FindingBuffer` interface — push, getAll, getByWorkflow, size, clear
- `FindingStore` interface — append, query, getPatterns, getSummary, prune

### Step 2: Finding buffer — `packages/shared/src/utils/finding-buffer.ts` (NEW)

`createFindingBuffer(maxSize = 500): FindingBuffer` — closure-based factory (matches `createAuthStrategy` pattern). Ring buffer: sync push (O(1), <1ms), evicts oldest when full. Returns chronologically ordered array from getAll().

### Step 3: Finding store — `packages/shared/src/utils/finding-store.ts` (NEW)

`createFindingStore({ filePath, retentionDays = 30, logger }): FindingStore`

- JSONL append-only file, lazy directory creation
- `query(filter)` — read file, apply filters, return matching findings
- `getPatterns(filter)` — group by (workflowId, issueClass, normalizedMessage), return groups with count >= minOccurrences (default 3), sorted by occurrence desc
- `getSummary()` — aggregate counts + top 10 patterns
- `prune()` — remove findings older than retentionDays, rewrite file
- Pattern detection: normalize messages (strip UUIDs/numbers), compute deterministic patternId via SHA-256 hash of grouping key

### Step 4: Barrel exports — `packages/shared/src/utils/index.ts` (MODIFY)

Add 3 lines:

```typescript
export * from "./finding-types.js";
export * from "./finding-buffer.js";
export * from "./finding-store.js";
```

### Step 5: Async resource support — `packages/shared/src/utils/resource-handler-factory.ts` (MODIFY)

The `StaticResourceDefinition.getContent` is currently sync (`() => string`). FindingStore methods are async. Two changes needed:

- Line 19: `getContent: () => string` → `getContent: () => string | Promise<string>`
- Line 62: `const content = resource.getContent()` → `const content = await resource.getContent()`

The handler at line 58 already uses `async () => { ... }`, so this is backwards-compatible.

### Step 6: Session cleanup hook — `packages/shared/src/utils/mcp-transport-helpers.ts` (MODIFY)

Add optional `onBeforeCleanup` hook to `SessionManager`:

- Constructor: add optional 2nd param `opts?: { onBeforeCleanup?: (sessionId: string) => Promise<void> }`
- `cleanupSession()`: call `onBeforeCleanup(sessionId)` before closing server and deleting session (swallow errors so flush failure doesn't block cleanup)
- `shutdown()`: call `onBeforeCleanup` for each tracked session before closing servers

Backwards-compatible — opts parameter is optional.

### Step 7: Tool handler integration — `packages/shared/src/utils/tool-handler-factory.ts` (MODIFY)

- Line 186 area: Add `findingBuffer?: FindingBuffer` to `RegisterToolsOptions`
- After line 409 (after the evaluator if-block closes, before the `if (issues.length > 0)` block): push finding to buffer if provided

```typescript
// After line 409, before line 411
if (opts.findingBuffer && hasEvaluator) {
  opts.findingBuffer.push({
    id: crypto.randomUUID(),
    sessionId: sdkContext?.sessionId ?? "unknown",
    timestamp: new Date().toISOString(),
    toolName: tool.name,
    workflowId: interactionContext.workflowId,
    platform: interactionContext.platform ?? "unknown",
    serverPackage: interactionContext.packageName ?? "unknown",
    issues: issues.map((i) => ({
      class: i.class,
      message: i.message,
      isRecoverable: i.isRecoverable,
      metadata: i.metadata,
    })),
    inputQualityScore,
    efficiencyScore,
    recommendationAction: (recommendationAction ??
      "none") as PersistedFinding["recommendationAction"],
    durationMs,
  });
}
```

Push happens for ALL evaluations (not just when issues > 0) — findings with 0 issues but with quality scores are valuable baseline data.

### Step 8: Session services — 5 files (MODIFY)

Add `findingBuffer: FindingBuffer` to each server's `SessionServices` interface and create it in `createSessionServices()`:

- `packages/ttd-mcp/src/services/session-services.ts`
- `packages/dv360-mcp/src/services/session-services.ts`
- `packages/dbm-mcp/src/services/session-services.ts`
- `packages/gads-mcp/src/services/session-services.ts`
- `packages/meta-mcp/src/services/session-services.ts`

Pattern (TTD example):

```typescript
import { createFindingBuffer, type FindingBuffer } from "@cesteral/shared";

export interface SessionServices {
  // ... existing fields ...
  findingBuffer: FindingBuffer;
}

export function createSessionServices(...): SessionServices {
  // ... existing service creation ...
  return { ...existingServices, findingBuffer: createFindingBuffer() };
}
```

### Step 9: Server.ts — pass buffer to tool registration — 5 files (MODIFY)

Each `createMcpServer()` resolves the session's finding buffer and passes it to `registerToolsFromDefinitions`. Also accept optional `findingDeps` for resource registration.

- `packages/ttd-mcp/src/mcp-server/server.ts`
- `packages/dv360-mcp/src/mcp-server/server.ts`
- `packages/dbm-mcp/src/mcp-server/server.ts`
- `packages/gads-mcp/src/mcp-server/server.ts`
- `packages/meta-mcp/src/mcp-server/server.ts`

Pattern (TTD example):

```typescript
import type { FindingStore, FindingBuffer } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";

export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  findingDeps?: { findingStore: FindingStore; getFindingBuffer: () => FindingBuffer | undefined }
): Promise<McpServer> {
  // Resolve buffer for this session
  const sessionServices = sessionId ? sessionServiceStore.get(sessionId) : undefined;

  registerToolsFromDefinitions({
    // ... existing options ...
    findingBuffer: sessionServices?.findingBuffer, // NEW
  });

  // Register resources (including finding resources if deps provided)
  const resources = findingDeps
    ? [...allResources, ...createFindingResources(findingDeps)]
    : allResources;
  registerStaticResourcesFromDefinitions({ server, resources, logger });

  // ... rest unchanged ...
}
```

### Step 10: Finding resources — 5 files (NEW)

Each server gets a `findings.resource.ts` file with a factory function:

- `packages/dbm-mcp/src/mcp-server/resources/definitions/findings.resource.ts`
- `packages/dv360-mcp/src/mcp-server/resources/definitions/findings.resource.ts`
- `packages/ttd-mcp/src/mcp-server/resources/definitions/findings.resource.ts`
- `packages/gads-mcp/src/mcp-server/resources/definitions/findings.resource.ts`
- `packages/meta-mcp/src/mcp-server/resources/definitions/findings.resource.ts`

```typescript
export function createFindingResources(deps: {
  findingStore: FindingStore;
  getFindingBuffer: () => FindingBuffer | undefined;
}): StaticResourceDefinition[] {
  return [
    {
      uri: "findings://session/current",
      name: "Current Session Findings",
      description: "Evaluator findings from the current session",
      mimeType: "application/json",
      getContent: () => {
        const buffer = deps.getFindingBuffer();
        return JSON.stringify({ findings: buffer?.getAll() ?? [], count: buffer?.size() ?? 0 });
      },
    },
    {
      uri: "findings://patterns/all",
      name: "Detected Patterns",
      description: "Recurring issue patterns across sessions",
      mimeType: "application/json",
      getContent: async () => JSON.stringify(await deps.findingStore.getPatterns({}), null, 2),
    },
    {
      uri: "findings://summary",
      name: "Finding Summary",
      description: "Aggregate stats: counts by class/workflow, top patterns",
      mimeType: "application/json",
      getContent: async () => JSON.stringify(await deps.findingStore.getSummary(), null, 2),
    },
  ];
}
```

**Note**: `findings://patterns/{workflowId}` is deferred — using `findings://patterns/all` instead to avoid `ResourceTemplate` complexity. Agents can filter from the returned JSON.

### Step 11: Transport wiring — 5 files (MODIFY)

Each server's `streamable-http-transport.ts` creates the `FindingStore` singleton, wires the cleanup hook, and passes finding deps to `createMcpServer`.

- `packages/dbm-mcp/src/mcp-server/transports/streamable-http-transport.ts`
- `packages/dv360-mcp/src/mcp-server/transports/streamable-http-transport.ts`
- `packages/ttd-mcp/src/mcp-server/transports/streamable-http-transport.ts`
- `packages/gads-mcp/src/mcp-server/transports/streamable-http-transport.ts`
- `packages/meta-mcp/src/mcp-server/transports/streamable-http-transport.ts`

Pattern:

```typescript
import { createFindingStore } from "@cesteral/shared";

// Create finding store (one per server instance)
const findingStore = createFindingStore({
  filePath: resolve(process.cwd(), "data", "ttd-findings.jsonl"),
  retentionDays: 30,
  logger,
});
findingStore.prune().catch((err) => logger.warn({ err }, "Failed to prune findings on startup"));

// Wire cleanup hook
const sessions = new SessionManager<...>(sessionServiceStore, {
  onBeforeCleanup: async (sessionId: string) => {
    const services = sessionServiceStore.get(sessionId);
    if (services?.findingBuffer) {
      const findings = services.findingBuffer.clear();
      if (findings.length > 0) await findingStore.append(findings);
    }
  },
});

// When creating MCP server for a session:
const mcpServer = await createMcpServer(logger, sessionId, {
  findingStore,
  getFindingBuffer: () => sessionServiceStore.get(sessionId)?.findingBuffer,
});
```

### Step 12: Resource barrel exports — 4 files (MODIFY)

Add finding resources to each server's resource index if not handled via findingDeps pattern in Step 9.

---

## Testing

### New test files (3)

**`packages/shared/tests/utils/finding-buffer.test.ts`**

- push + getAll returns findings in order
- Ring buffer eviction when > maxSize (oldest dropped)
- getByWorkflow filters correctly
- clear() returns all and empties buffer
- size() tracks correctly
- Empty buffer returns []

**`packages/shared/tests/utils/finding-store.test.ts`**

- append() creates JSONL file lazily
- query() with no filter returns all
- query() with each filter type (workflowId, platform, issueClass, timeWindowDays)
- getPatterns() groups correctly, respects minOccurrences
- getPatterns() confidence calculation = occurrences / totalForWorkflow
- getSummary() returns correct aggregates
- prune() removes old findings, keeps recent
- Handles missing/corrupt file gracefully

**`packages/shared/tests/utils/finding-integration.test.ts`**

- End-to-end: create buffer → push findings → clear → append to store → query patterns

### Existing tests to extend

**`packages/shared/tests/utils/tool-handler-factory.test.ts`** — add test: with findingBuffer option, finding pushed after evaluator
**`packages/shared/tests/utils/mcp-transport-helpers.test.ts`** — add test: onBeforeCleanup hook called during cleanupSession and shutdown

---

## File Summary

| File                                                                                          | Action                                      | Step |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- | ---- |
| `packages/shared/src/utils/finding-types.ts`                                                  | NEW                                         | 1    |
| `packages/shared/src/utils/finding-buffer.ts`                                                 | NEW                                         | 2    |
| `packages/shared/src/utils/finding-store.ts`                                                  | NEW                                         | 3    |
| `packages/shared/src/utils/index.ts`                                                          | MODIFY (add 3 exports)                      | 4    |
| `packages/shared/src/utils/resource-handler-factory.ts`                                       | MODIFY (async getContent)                   | 5    |
| `packages/shared/src/utils/mcp-transport-helpers.ts`                                          | MODIFY (onBeforeCleanup hook)               | 6    |
| `packages/shared/src/utils/tool-handler-factory.ts`                                           | MODIFY (findingBuffer option + push)        | 7    |
| `packages/{dbm,dv360,ttd,gads,meta}-mcp/src/services/session-services.ts`                          | MODIFY x5 (add findingBuffer)               | 8    |
| `packages/{dbm,dv360,ttd,gads,meta}-mcp/src/mcp-server/server.ts`                                  | MODIFY x5 (pass buffer, accept findingDeps) | 9    |
| `packages/{dbm,dv360,ttd,gads,meta}-mcp/src/mcp-server/resources/definitions/findings.resource.ts` | NEW x5                                      | 10   |
| `packages/{dbm,dv360,ttd,gads,meta}-mcp/src/mcp-server/transports/streamable-http-transport.ts`    | MODIFY x5 (FindingStore + cleanup hook)     | 11   |
| `packages/shared/tests/utils/finding-buffer.test.ts`                                          | NEW                                         | test |
| `packages/shared/tests/utils/finding-store.test.ts`                                           | NEW                                         | test |
| `packages/shared/tests/utils/finding-integration.test.ts`                                     | NEW                                         | test |

**Totals**: 7 new files + 3 new test files + 21 modified files = 31 files

---

## Design Decisions & Deviations from Design Doc

| Topic                              | Decision                                                         | Rationale                                                                               |
| ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `findings://patterns/{workflowId}` | Use `findings://patterns/all` instead                            | Avoids ResourceTemplate complexity in 3 of 4 servers. Agent filters from returned JSON. |
| Buffer push scope                  | Push for ALL evaluations (even 0 issues)                         | Findings with only quality/efficiency scores are baseline data for pattern detection.   |
| Async getContent                   | Extend `StaticResourceDefinition` to `string \| Promise<string>` | Required for JSONL I/O; backwards-compatible since handler is already async.            |
| SessionManager hook                | `onBeforeCleanup` callback in constructor opts                   | Keeps SessionManager generic — no knowledge of findings. Cleanest integration.          |
| Stdio mode                         | Initially without findings (graceful degradation)                | No clear session lifecycle boundary for flush. Can add later with process exit hooks.   |
| JSONL file naming                  | `data/{server}-findings.jsonl`                                   | Per-server naming avoids conflicts if servers share working directory.                  |

---

## Verification

1. `pnpm run build` — all packages compile
2. `pnpm run typecheck` — no type errors
3. `pnpm run test` — all existing + new tests pass
4. Start a server: `./scripts/dev-server.sh ttd-mcp` → verify `data/ttd-findings.jsonl` created after session activity
5. Read resources via MCP client: `resources/read findings://session/current`, `findings://patterns/all`, `findings://summary`
6. Verify pattern detection: create multiple findings with same issue → check `findings://patterns/all` shows a DetectedPattern with correct occurrence count
7. Verify cleanup: close session → check JSONL file has the flushed findings
8. Verify prune: manually add old findings → restart server → verify they're removed
