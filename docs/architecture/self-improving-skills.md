# Self-Improving MCP Skill System

> **Status**: Design document
> **Version**: 1.0.0
> **Last updated**: 2026-02-13
> **Depends on**: [Skill Contract v1.1.0](../mcp-skill-contract.json), [Governance Overview](../governance/GOVERNANCE-OVERVIEW.md), [Refinement Governance](../governance/refinement-governance.md)

---

## 1. Problem Statement

BidShifter has strong foundations for a self-improving system:

- **Evaluator hooks** in `packages/shared/src/utils/tool-handler-factory.ts` fire after every tool execution, producing `ToolInteractionEvaluation` results with issue classifications, quality scores, and recommended actions.
- **Governance docs** in `docs/governance/` define a full refinement lifecycle — findings → classification → playbook deltas → approval → deployment.
- **Skill adapters** in `.cursor/skills/` and `.codex/skills/` project workflows to IDE clients.
- **A canonical skill contract** (`docs/mcp-skill-contract.json` v1.1.0) defines five workflow IDs with required prompts, resources, and output sections.

But the loop isn't closed:

| What exists | What's missing |
|-------------|----------------|
| Evaluator findings emitted to OTEL spans | Findings vanish after the span — no aggregation, no pattern detection |
| Governance defines playbook delta schema | Nothing generates playbook deltas from findings |
| Prompts are hardcoded TypeScript | Changing a prompt requires code change → build → deploy |
| Skill contract defines workflows | No versioning of individual skill content |

This document designs the system that connects those dots: **versionable skills, persisted findings, pattern detection, and an AI-driven refinement loop** — while preserving the modularity guarantee that each server works independently.

---

## 2. Taxonomy

```
Tools + Resources    (execution layer — what the agent does)
      │
   Prompts           (instruction layer — how the agent sequences actions)
      │
   Workflows         (contract layer — canonical orchestration patterns)
      │
   Skills            (evolution layer — versionable, improvable bundles)
      │
   Adapters          (projection layer — Cursor/Codex thin wrappers)
```

### Definitions

| Term | Definition |
|------|-----------|
| **Workflow** | A canonical orchestration pattern identified by a workflow ID (e.g., `mcp.execute.dv360_entity_update`). Defined in `docs/mcp-skill-contract.json`. |
| **Skill** | The unit of evolution. Bundles: a workflow definition, prompt content (template), version metadata, effectiveness baseline, and refinement history. When we "improve a skill," we improve the prompt content, the contract requirements, or both. |
| **Prompt** | The template an AI agent follows during a workflow. Currently hardcoded TypeScript (e.g., `entity-update-execution.prompt.ts`). Skills externalize these to YAML. |
| **Finding** | A single evaluator observation from one tool execution. Typed as `PersistedFinding`. Example: "updateMask was too broad." |
| **Pattern** | A recurring finding across N sessions, detected by the finding store. Example: "agents consistently skip schema lookup before update" (12 occurrences, 85% confidence). |
| **Refinement** | A proposed change to a skill, generated from a pattern, subject to governance review per `docs/governance/refinement-governance.md`. |
| **Adapter** | A thin client-specific projection of a skill (`.cursor/skills/`, `.codex/skills/`). References a workflow ID, stays under 200 lines per `adapterRules.maxSkillLines`. |

---

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                   AI Agent (Claude, etc.)                   │
│                                                            │
│  1. Invoke prompt (skill v1.2.0)                           │
│  2. Execute tools → evaluator fires → findings buffer      │
│  3. Read findings://patterns/{workflowId}                  │
│  4. Call propose_skill_refinement tool                      │
│  5. Next session: improved prompt served                    │
└────────────────┬───────────────────────────────────────────┘
                 │ MCP Protocol
                 ▼
┌────────────────────────────────────────────────────────────┐
│          MCP Server (e.g., dv360-mcp)                      │
│                                                            │
│  Skills:     Loaded from skills/ YAML (TS fallback)        │
│  Tools:      [domain CRUD] + [propose_skill_refinement]    │
│  Resources:  [schemas] + [findings://session, patterns]    │
│                                                            │
│  ┌─────────────────────────────────────────────────────────┐
│  │ Evaluator (per-tool, in tool-handler-factory.ts)        │
│  │  → PersistedFinding → FindingBuffer (Tier 1)           │
│  └──────────────────────┬──────────────────────────────────┘
│                         │ session cleanup                   │
│  ┌──────────────────────▼──────────────────────────────────┐
│  │ FindingStore (JSONL, Tier 2)                             │
│  │  → Pattern detection across sessions                    │
│  └──────────────────────┬──────────────────────────────────┘
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────────┐
│  │ RefinementEngine (shared)                                │
│  │  → Validate proposal → write YAML → stage               │
│  └─────────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────────┘
```

Each server is self-contained. No cross-server runtime dependency. The AI agent is the "brain" that connects insights across servers when multiple are installed.

---

## 4. Layer 1: Skill Store (Versionable Prompts)

### 4.1 Why

Prompts are currently hardcoded TypeScript generators — e.g., `packages/dv360-mcp/src/mcp-server/prompts/entity-update-execution.prompt.ts` exports `getEntityUpdateExecutionPromptMessage()` which returns a string. Changing a prompt requires: code change → TypeScript build → deploy.

Skills need to evolve faster than the deploy cycle. Externalizing to YAML decouples prompt content from the build pipeline, enables governance review of text-only diffs, and supports future hot-reload from a remote store.

### 4.2 Directory Structure

At repo root (cross-server, since workflows like `mcp.troubleshoot.delivery` span both `dbm-mcp` and `dv360-mcp`):

```
skills/
  registry.yaml
  definitions/
    mcp.explore.tools_and_schemas/
      v1.0.0.yaml
    mcp.execute.dv360_entity_update/
      v1.0.0.yaml
    mcp.execute.ttd_entity_update/
      v1.0.0.yaml
    mcp.execute.dbm_custom_query/
      v1.0.0.yaml
    mcp.troubleshoot.delivery/
      v1.0.0.yaml
  proposals/
    # Refinement proposals land here before promotion
```

### 4.3 Skill YAML Schema

Each version file defines a complete, self-contained skill:

```yaml
skillId: "mcp.execute.dv360_entity_update"
version: "1.0.0"
parentVersion: null                          # null for initial version
metadata:
  platform: "dv360-management"
  serverPackage: "dv360-mcp"                 # Filters which server loads this skill
  riskClass: "medium"
prompts:
  - name: "entity_update_execution_workflow"
    server: "dv360-mcp"
    arguments:
      - name: "advertiserId"
        description: "DV360 Advertiser ID"
        required: true
      - name: "entityType"
        description: "Type of entity to update"
        required: true
      - name: "changeGoal"
        description: "What you want to change"
        required: false
    template: |
      # Entity Update Execution Workflow
      ## Step 1: Fetch Schema
      Read `entity-schema://{{entityType}}` to understand required fields...
      ## Step 2: Resolve IDs
      ...
resources:
  - "entity-schema://{entityType}"
  - "entity-fields://{entityType}"
  - "entity-examples://{entityType}"
requiredOutputSections:
  - "ChangePlan"
  - "UpdateMask"
  - "VerificationResult"
refinementHistory:
  - version: "1.0.0"
    reason: "Initial version — migrated from entity-update-execution.prompt.ts"
    findingIds: []
    timestamp: "2026-02-13T00:00:00Z"
effectivenessBaseline:
  avoidableFailureRate: null                 # Populated after sufficient data
  medianToolCallDepth: null
  sampleSize: 0
```

### 4.4 Registry

`skills/registry.yaml` tracks which version is active and which (if any) is staged for observation:

```yaml
# skills/registry.yaml
schemaVersion: "1.0.0"
skills:
  mcp.explore.tools_and_schemas:
    activeVersion: "1.0.0"
    stagedVersion: null
  mcp.execute.dv360_entity_update:
    activeVersion: "1.0.0"
    stagedVersion: null
  mcp.execute.ttd_entity_update:
    activeVersion: "1.0.0"
    stagedVersion: null
  mcp.execute.dbm_custom_query:
    activeVersion: "1.0.0"
    stagedVersion: null
  mcp.troubleshoot.delivery:
    activeVersion: "1.0.0"
    stagedVersion: null
```

**Staged version semantics**: When `stagedVersion` is set, the server loads the staged skill in observe-only mode — the agent receives the new prompt content, but evaluator findings are tagged `isStaged: true` to compare effectiveness against the active version before promotion.

### 4.5 Shared Package Additions

| New file | Purpose |
|----------|---------|
| `packages/shared/src/utils/skill-types.ts` | `SkillVersion`, `SkillRegistry`, `SkillPromptEntry`, `LoadedSkill` interfaces |
| `packages/shared/src/utils/skill-loader.ts` | `loadSkillsForServer(opts)` — reads YAML from `skills/` directory, filters by `metadata.serverPackage`, returns `LoadedSkill[]` with `generateMessage()` closures |
| `packages/shared/src/utils/template-resolver.ts` | `resolveTemplate(template, args)` — `{{variable}}` interpolation with mustache-style syntax |

#### `LoadedSkill` interface

```typescript
interface LoadedSkill {
  skillId: string;
  version: string;
  promptName: string;
  description: string;
  arguments: PromptArgument[];
  resources: string[];
  requiredOutputSections: string[];
  generateMessage: (args?: Record<string, string>) => string;
  isStaged: boolean;
}
```

#### `loadSkillsForServer()` contract

```typescript
function loadSkillsForServer(opts: {
  skillsDir: string;          // Path to skills/ directory
  serverPackage: string;      // e.g., "dv360-mcp"
  registryPath?: string;      // Default: {skillsDir}/registry.yaml
}): LoadedSkill[]
```

Behavior:
1. Parse `registry.yaml` → get active + staged versions per skill
2. For each skill, load the YAML from `definitions/{skillId}/{version}.yaml`
3. Filter to only skills where `metadata.serverPackage` matches
4. Build `generateMessage()` closure that calls `resolveTemplate(template, args)`
5. Return `LoadedSkill[]`
6. If `skills/` directory is missing or unreadable, return `[]` (graceful degradation)

### 4.6 Per-Server Wiring

In each server's `server.ts`, before prompt registration:

```typescript
import { loadSkillsForServer } from "@bidshifter/shared";

// Load skills from YAML (empty array if skills/ absent)
const skills = loadSkillsForServer({
  skillsDir: path.resolve(__dirname, "../../../../skills"),
  serverPackage: "dv360-mcp",
});

// Register skill-backed prompts (overrides TS prompts with same name)
for (const skill of skills) {
  promptRegistry.set(skill.promptName, {
    prompt: {
      name: skill.promptName,
      description: `[v${skill.version}] ${skill.description}`,
      arguments: skill.arguments,
    },
    generateMessage: skill.generateMessage,
  });
}

// Existing TS prompts remain in the registry for any prompt names
// not overridden by skills — zero regression if skills/ is absent
```

### 4.7 Deployment Model

**Phase 1 (PR-based)**: YAML committed to repo, deployed with build. The validator script (`scripts/validate-skill-adapters.mjs`) is extended to check skill consistency (see [Section 8](#8-contract--adapter-evolution)).

**Future (remote store)**: `MCP_SKILLS_SOURCE=gcs://bucket/skills` env var. Server fetches YAML at startup. Hot-reload via file-system watcher or `SIGHUP`. `loadSkillsForServer()` abstracted behind a `SkillSource` interface to support both local and remote backends.

---

## 5. Layer 2: Finding Aggregation

### 5.1 Why

The evaluator in `tool-handler-factory.ts` (lines 332–393) already produces rich findings — `ToolInteractionEvaluation` with issues classified by `EvaluatorIssueClass`, quality scores, and `recommendationAction`. These are emitted to telemetry (span attributes + `recordEvaluatorFinding()` metric counter) and then lost. No aggregation means no pattern detection, which means no data-driven skill improvement.

### 5.2 Finding Data Model

```typescript
// packages/shared/src/utils/finding-types.ts

interface PersistedFinding {
  id: string;                              // UUID
  sessionId: string;
  timestamp: string;                       // ISO 8601
  toolName: string;
  workflowId?: string;
  platform: string;
  serverPackage: string;
  skillVersion?: string;                   // Links finding to skill version
  isStaged?: boolean;                      // True if from a staged skill

  // From ToolInteractionEvaluation
  issues: PersistedIssue[];
  inputQualityScore?: number;              // 0–1
  efficiencyScore?: number;                // 0–1
  recommendationAction: "none" | "log_only" | "propose_playbook_delta" | "block";

  // From ToolExecutionSnapshot
  durationMs: number;
  toolCallDepth?: number;                  // Position in workflow sequence
}

interface PersistedIssue {
  class: string;                           // Maps to EvaluatorIssueClass
  message: string;
  isRecoverable?: boolean;
  metadata?: Record<string, unknown>;
}

interface DetectedPattern {
  patternId: string;                       // Deterministic hash of grouping key
  workflowId: string;
  issueClass: string;
  description: string;                     // Summarized from issue messages
  occurrenceCount: number;
  confidence: number;                      // 0–1
  firstSeen: string;
  lastSeen: string;
  sampleFindingIds: string[];              // Up to 5 representative findings
  affectedSkillVersion?: string;
}

interface FindingQueryFilter {
  workflowId?: string;
  platform?: string;
  serverPackage?: string;
  issueClass?: string;
  minOccurrences?: number;
  timeWindowDays?: number;
  skillVersion?: string;
}
```

### 5.3 Three-Tier Design

#### Tier 1 — Per-Session Buffer (in-memory)

`FindingBuffer` is a ring buffer attached to each session via `SessionServiceStore`:

```typescript
// packages/shared/src/utils/finding-buffer.ts

function createFindingBuffer(maxSize?: number): FindingBuffer;

interface FindingBuffer {
  push(finding: PersistedFinding): void;
  getAll(): PersistedFinding[];
  getByWorkflow(workflowId: string): PersistedFinding[];
  size(): number;
  clear(): PersistedFinding[];             // Returns drained findings for flush
}
```

- Default max size: 500 findings per session
- When full, oldest findings are evicted (ring buffer semantics)
- Exposed as MCP resource `findings://session/current`

#### Tier 2 — Cross-Session Store (JSONL)

`FindingStore` persists findings to a local JSONL file and provides pattern detection:

```typescript
// packages/shared/src/utils/finding-store.ts

function createFindingStore(opts: {
  filePath: string;                        // e.g., data/findings.jsonl
  retentionDays?: number;                  // Default: 30
  logger?: Logger;
}): FindingStore;

interface FindingStore {
  append(findings: PersistedFinding[]): Promise<void>;
  query(filter: FindingQueryFilter): Promise<PersistedFinding[]>;
  getPatterns(filter: FindingQueryFilter): Promise<DetectedPattern[]>;
  getSummary(): Promise<FindingSummary>;
  prune(): Promise<number>;                // Returns count of pruned findings
}

interface FindingSummary {
  totalFindings: number;
  findingsByClass: Record<string, number>;
  findingsByWorkflow: Record<string, number>;
  topPatterns: DetectedPattern[];           // Top 10 by occurrence
  periodStart: string;
  periodEnd: string;
}
```

**Pattern detection algorithm** (`getPatterns()`):
1. Load findings matching the filter
2. Group by `(workflowId, issueClass, normalizedMessage)`
3. For each group with `count >= minOccurrences` (default 3):
   - Calculate confidence: `occurrences / totalFindingsForWorkflow`
   - Generate deterministic `patternId` from grouping key
   - Select up to 5 sample finding IDs
4. Sort by occurrence count descending

**Lifecycle**:
- Created on first flush (lazy file creation)
- Pruned on startup (findings older than `retentionDays` removed)
- Flushed from buffer on: transport close, session timeout sweep, server shutdown

#### Tier 3 — Production (future)

Drop-in replacement for `FindingStore` backed by BigQuery. Same interface, same `FindingQueryFilter`. Activated via `MCP_FINDING_STORE=bigquery` env var. Out of scope for initial implementation.

### 5.4 Integration with Tool Handler Factory

The existing `tool-handler-factory.ts` is modified to accept an optional `FindingBuffer`:

```typescript
// Modified RegisterToolsOptions (packages/shared/src/utils/tool-handler-factory.ts)
interface RegisterToolsOptions {
  // ... existing fields ...
  evaluator?: {
    enabled: boolean;
    observeOnly: boolean;
    evaluate?: (snapshot, context) => Promise<ToolInteractionEvaluation>;
  };
  findingBuffer?: FindingBuffer;           // NEW: optional buffer for persistence
}
```

After the evaluator runs (around line 376), if `findingBuffer` is provided:

```typescript
if (opts.findingBuffer && evaluation) {
  opts.findingBuffer.push({
    id: crypto.randomUUID(),
    sessionId: sdkContext?.sessionId ?? "unknown",
    timestamp: new Date().toISOString(),
    toolName: def.name,
    workflowId: interactionContext.workflowId,
    platform: interactionContext.platform ?? "unknown",
    serverPackage: interactionContext.packageName ?? "unknown",
    skillVersion: /* resolved from loaded skills */,
    issues: evaluation.issues,
    inputQualityScore: evaluation.inputQualityScore,
    efficiencyScore: evaluation.efficiencyScore,
    recommendationAction: evaluation.recommendationAction ?? "none",
    durationMs: snapshot.durationMs,
  });
}
```

### 5.5 MCP Resources for Findings

Each server registers finding resources in `src/mcp-server/resources/definitions/findings.resource.ts`:

| Resource URI | Description | Data source |
|-------------|-------------|-------------|
| `findings://session/current` | Current session's finding buffer | `FindingBuffer.getAll()` |
| `findings://patterns/{workflowId}` | Detected patterns for a specific workflow | `FindingStore.getPatterns({ workflowId })` |
| `findings://patterns/all` | All detected patterns across workflows | `FindingStore.getPatterns({})` |
| `findings://summary` | Aggregate counts, top patterns, period stats | `FindingStore.getSummary()` |

These resources are read-only reference material — matching MCP semantics for resources (data you read) vs. tools (actions with side effects).

### 5.6 Session Cleanup Integration

Each server's session cleanup logic (transport close, timeout sweep, shutdown) is extended to flush the buffer:

```typescript
async function cleanupSession(sessionId: string) {
  const services = sessionServiceStore.get(sessionId);
  if (services?.findingBuffer) {
    const findings = services.findingBuffer.clear();
    if (findings.length > 0) {
      await findingStore.append(findings);
    }
  }
  sessionServiceStore.delete(sessionId);
}
```

---

## 6. Layer 3: Refinement Loop

### 6.1 The Loop

This is the "self-improving" part. The AI agent observes patterns and proposes better skills:

```
 1. AI agent executes workflow
    → evaluator fires → findings accumulate in buffer

 2. AI agent reads findings://patterns/{workflowId}
    → sees recurring patterns with high occurrence counts

 3. AI agent identifies actionable patterns
    → e.g., "agents skip schema lookup" (15 occurrences, 0.82 confidence)

 4. AI agent calls propose_skill_refinement tool
    → provides new prompt template, rationale, linked pattern IDs

 5. Proposal validated against playbook-delta schema
    → governance gates applied based on riskClass

 6. New skill version YAML written to skills/proposals/
    → human reviews PR

 7. After approval: staged version written to skills/definitions/
    → registry.yaml updated with stagedVersion

 8. Staged version observed for N sessions
    → effectiveness compared against active version

 9. If metrics improve: staged → active promotion
    → registry.yaml activeVersion updated

10. If metrics regress: rollback
    → stagedVersion cleared, active version unchanged
```

### 6.2 MCP Tool: `propose_skill_refinement`

Each server registers this tool to allow AI agents to propose skill improvements:

```typescript
// Input schema
z.object({
  workflowId: z.string(),                           // Must match a canonical workflow ID
  patternIds: z.array(z.string()),                   // From findings://patterns
  proposedPromptDelta: z.string(),                   // Full new template content
  rationale: z.string(),                             // Why this change helps
  riskClass: z.enum(["low", "medium", "high"]),
  rollbackTrigger: z.string(),                       // When to rollback
  successMetric: z.string(),                         // How to measure success
})

// Output
z.object({
  proposalId: z.string(),
  status: z.enum(["accepted", "needs_review"]),
  newVersion: z.string().optional(),                 // Semver of proposed version
  validationErrors: z.array(z.string()).optional(),
  nextSteps: z.string(),                             // Human-readable guidance
})
```

**Governance gates** (applied by `RefinementEngine`):

| Risk class | Behavior | Approval required |
|-----------|----------|-------------------|
| `low` | Proposal file written, `stagedVersion` set in registry | 1 maintainer |
| `medium` | Proposal file written as draft, requires explicit promotion | Maintainer + package owner |
| `high` | Proposal file written as draft, flagged for contract review | Contract owner + package owner |

These gates align with the approval matrix in `docs/governance/refinement-governance.md`.

**Tool annotations**:
```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}
```

### 6.3 MCP Tool: `get_refinement_status`

Read-only companion tool for querying past proposals:

```typescript
// Input
z.object({
  workflowId: z.string().optional(),                 // Filter by workflow
  status: z.enum(["draft", "staged", "active", "rejected", "all"]).optional(),
})

// Output
z.object({
  proposals: z.array(z.object({
    proposalId: z.string(),
    workflowId: z.string(),
    currentVersion: z.string(),
    proposedVersion: z.string(),
    status: z.string(),
    riskClass: z.string(),
    rationale: z.string(),
    createdAt: z.string(),
    patternIds: z.array(z.string()),
  })),
})
```

**Tool annotations**:
```typescript
annotations: { readOnlyHint: true }
```

### 6.4 Shared Package: RefinementEngine

The refinement engine lives in shared (no MCP SDK dependency) and handles proposal validation and persistence:

```typescript
// packages/shared/src/utils/refinement-engine.ts

interface RefinementEngine {
  validateProposal(proposal: RefinementProposal): ValidationResult;
  writeProposal(proposal: RefinementProposal): Promise<ProposalResult>;
  stageVersion(skillId: string, version: string): Promise<void>;
  promoteVersion(skillId: string, version: string): Promise<void>;
  rollbackVersion(skillId: string): Promise<void>;
  listProposals(filter?: ProposalFilter): Promise<ProposalEntry[]>;
}

function createRefinementEngine(opts: {
  skillsDir: string;
  logger?: Logger;
}): RefinementEngine;
```

**`validateProposal()`** checks:
1. `workflowId` exists in the skill contract's canonical workflow IDs
2. All `patternIds` reference real patterns in the finding store
3. `proposedPromptDelta` is non-empty and contains all `requiredOutputSections` from the skill
4. `riskClass` is consistent with the skill's `metadata.riskClass`
5. New version follows semver from parent version

**`writeProposal()`** behavior:
1. Generate next semver version (patch for `low`, minor for `medium`/`high`)
2. Write proposal YAML to `skills/proposals/{proposalId}.yaml`
3. If `low` risk: also write version YAML to `skills/definitions/{skillId}/` and update `stagedVersion` in registry
4. Return `ProposalResult` with status and next steps

### 6.5 Proposal YAML Format

Proposals include all required `playbook-delta.schema.json` fields and add skill-specific metadata. Because the current schema has `additionalProperties: false`, we must either:
1. Extend the schema to allow these additive fields, or
2. Store the playbook delta in a nested object and validate only that object against the current schema.

The example below uses the first approach (schema extension in Phase 3):

```yaml
# skills/proposals/{proposalId}.yaml
proposalId: "ref-2026-02-13-a1b2c3d4"
findingId: "ref-2026-02-13-a1b2c3d4"        # Same as proposalId (playbook-delta compat)
createdAt: "2026-02-13T14:30:00Z"
owner: "ai-agent"
riskClass: "low"
platform: "dv360-management"
serverPackage: "dv360-mcp"
workflowId: "mcp.execute.dv360_entity_update"
evidence:
  occurrenceCount: 15
  timeWindow: "7d"
  confidence: 0.82
  sampleEventIds: ["find-001", "find-002", "find-003"]
proposedChanges:
  - path: "skills/definitions/mcp.execute.dv360_entity_update/v1.1.0.yaml"
    summary: "Add explicit schema-fetch step before payload construction"
rollout:
  observeOnlyFirst: true
  featureFlagName: null
  rollbackTrigger: "avoidableFailureRate increases >10% over 7 days"
  successMetric: "avoidableFailureRate decreases >15% over 14 days"

# Skill-specific extension
skillDelta:
  skillId: "mcp.execute.dv360_entity_update"
  parentVersion: "1.0.0"
  newVersion: "1.1.0"
  rationale: "Agents consistently skip schema lookup before update, leading to invalid payloads"
  patternIds: ["pat-a1b2c3"]
  status: "draft"                            # draft | staged | active | rejected
```

---

## 7. Telemetry Integration

### 7.1 Span Naming

Per `docs/governance/telemetry-governance.md`, the following spans are added:

| Span name | When | Attributes |
|-----------|------|------------|
| `tool.{toolName}.finding` | After evaluator produces a finding | `mcp.finding.id`, `mcp.finding.class`, `mcp.finding.recommendation` |
| `workflow.{workflowId}.pattern` | When pattern is detected | `mcp.pattern.id`, `mcp.pattern.occurrences`, `mcp.pattern.confidence` |
| `workflow.{workflowId}.refinement_decision` | When proposal is created | `mcp.refinement.proposalId`, `mcp.refinement.riskClass`, `mcp.refinement.status` |

### 7.2 Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `mcp.evaluator.finding.count` | Counter | Findings by `issueClass`, `workflowId`, `serverPackage` |
| `mcp.pattern.count` | Counter | Detected patterns by `workflowId` |
| `mcp.refinement.proposal.count` | Counter | Proposals by `riskClass`, `status` |
| `mcp.skill.version.active` | Gauge | Current active version per `skillId` (as label) |

---

## 8. Contract & Adapter Evolution

### 8.1 Skill Contract v1.2.0 (Minor Bump)

The canonical contract (`docs/mcp-skill-contract.json`) evolves to v1.2.0 with additive fields:

```json
{
  "version": "1.2.0",
  "workflowIds": ["...existing..."],
  "workflows": {
    "mcp.execute.dv360_entity_update": {
      "description": "...",
      "prompts": ["..."],
      "resources": ["..."],
      "requiredOutputSections": ["..."],
      "activeSkillVersion": "1.0.0",
      "stagedSkillVersion": null,
      "refinementPolicy": {
        "autoApproveRiskLevel": "low",
        "minPatternOccurrences": 5,
        "minPatternConfidence": 0.7
      }
    }
  },
  "refinementResources": [
    "findings://session/current",
    "findings://patterns/{workflowId}",
    "findings://patterns/all",
    "findings://summary"
  ],
  "refinementTools": [
    "propose_skill_refinement",
    "get_refinement_status"
  ]
}
```

Per `docs/governance/contract-versioning.md`, this is a **minor** version bump (additive fields only — `activeSkillVersion`, `stagedSkillVersion`, `refinementPolicy`, `refinementResources`, `refinementTools`). No breaking changes.

### 8.2 Adapter Updates

Each `.cursor/skills/` and `.codex/skills/` adapter SKILL.md file gets a `Skill Version` annotation:

```markdown
<!-- Skill Version: v1.0.0 | Workflow: mcp.execute.dv360_entity_update -->
# MCP Workflow Executor
...
```

This enables the validator to check that adapter annotations match `registry.yaml` active versions.

### 8.3 Validator Extensions

`scripts/validate-skill-adapters.mjs` gains new validation checks:

| Check | Description |
|-------|-------------|
| Registry parse | `skills/registry.yaml` parses as valid YAML with expected structure |
| Skill definition existence | Each skill in registry has a definition directory with the active version YAML |
| Skill-contract consistency | Skill YAML `resources`, `requiredOutputSections`, and `prompts[].name` match the contract entry for the workflow |
| Adapter version match | Each adapter's `Skill Version` annotation matches `registry.yaml` active version |
| Proposal format | Any files in `skills/proposals/` validate against `playbook-delta.schema.json` |

---

## 9. Modularity Guarantees

| Scenario | Behavior |
|----------|----------|
| Install only `dv360-mcp` | Loads only skills where `metadata.serverPackage === "dv360-mcp"`. Findings stay local. Refinement proposes only dv360 skills. |
| Install only `dbm-mcp` | Same isolation for DBM workflows. Finding store is per-server instance. |
| Install only `ttd-mcp` | Same isolation. TTD-specific evaluators, findings, patterns. |
| Install multiple servers | AI agent cross-references findings across servers by reading resources from each. No server-to-server communication required. |
| No `skills/` directory | `loadSkillsForServer()` returns `[]`. Hardcoded TypeScript prompts serve as fallback. Zero regression. |
| No finding store file | Created lazily on first flush. `findings://patterns/*` resources return empty arrays. |
| `MCP_EVALUATOR_ENABLED=false` | No findings produced, no patterns detected, refinement loop dormant. Skills still load and serve prompts. |
| Skills YAML malformed | Loader logs warning, skips malformed skill, continues with remaining skills + TS fallback. |

---

## 10. Implementation Roadmap

### Phase 1: Skill Store Foundation

**Goal**: Externalize prompts to YAML, serve them via existing prompt infrastructure.

**Deliverables**:
- `packages/shared/src/utils/skill-types.ts` — type definitions
- `packages/shared/src/utils/skill-loader.ts` — YAML loader with `serverPackage` filter
- `packages/shared/src/utils/template-resolver.ts` — `{{var}}` interpolation
- `skills/registry.yaml` — initial registry
- `skills/definitions/` — one YAML per workflow, migrated from existing TypeScript prompts
- Server wiring in `server.ts` for each server
- Validator extensions for skill consistency

**Acceptance criteria**:
- `pnpm run build` passes
- `pnpm run validate:skills` passes with new checks
- Each server loads YAML skills and serves them as MCP prompts
- Removing `skills/` directory causes graceful fallback to TypeScript prompts
- Existing tests pass without modification

### Phase 2: Finding Aggregation

**Goal**: Persist evaluator findings and detect patterns across sessions.

**Deliverables**:
- `packages/shared/src/utils/finding-types.ts` — data model
- `packages/shared/src/utils/finding-buffer.ts` — in-memory ring buffer
- `packages/shared/src/utils/finding-store.ts` — JSONL-backed persistent store
- `tool-handler-factory.ts` modification — push findings to buffer
- `findings.resource.ts` in each server — MCP resources
- Session cleanup integration — flush buffer on cleanup

**Acceptance criteria**:
- Findings persist across sessions in JSONL file
- `findings://patterns/{workflowId}` returns detected patterns
- `findings://summary` returns aggregate stats
- Buffer flush on session close is reliable
- Pruning removes findings older than retention period
- No performance regression in tool execution (buffer push is sync, < 1ms)

### Phase 3: Refinement Loop

**Goal**: Enable AI agents to propose skill improvements based on patterns.

**Deliverables**:
- `packages/shared/src/utils/refinement-engine.ts` — validation + persistence
- `propose_skill_refinement` tool in each server
- `get_refinement_status` tool in each server
- Proposal YAML format validates via extended playbook-delta schema (or validates nested playbook delta object against current schema)

**Acceptance criteria**:
- AI agent can read patterns → propose refinement → proposal persisted as YAML
- Low-risk proposals auto-stage; medium/high require review
- Proposals validate against playbook-delta schema
- `get_refinement_status` returns accurate proposal state
- No auto-merge — all proposals require human PR review

### Phase 4: Contract & Adapter Sync

**Goal**: Evolve the contract to v1.2.0 and keep adapters in sync with skill versions.

**Deliverables**:
- `docs/mcp-skill-contract.json` v1.2.0 with new fields
- Adapter SKILL.md files with `Skill Version` annotations
- Validator checks for version consistency
- Updated `docs/client-workflow-mappings.md`
- Telemetry spans and metrics for the refinement loop

**Acceptance criteria**:
- Contract v1.2.0 passes validator
- Adapter versions match registry active versions
- Telemetry spans emitted for findings, patterns, and proposals
- `docs/client-workflow-mappings.md` reflects new resources and tools

---

## 11. Key Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| **YAML over TypeScript for skills** | Decouples prompt evolution from build pipeline. Text-only diffs for governance review. Enables future hot-reload from remote store (GCS). | JSON (less readable for multi-line templates), Markdown with frontmatter (harder to validate programmatically) |
| **`skills/` at repo root** | Workflows like `mcp.troubleshoot.delivery` span servers (`dbm-mcp` + `dv360-mcp`). Central location is natural. Each server filters by `serverPackage` at load time. | Per-server `skills/` directories (would duplicate cross-server workflows), separate repo (too much ceremony) |
| **JSONL for finding store** | Zero infrastructure dependency for development. Append-only writes are fast. Human-readable for debugging. `FindingStore` interface abstracts backend for future BigQuery swap. | SQLite (heavier dependency, embedded DB issues in containers), in-memory only (no persistence) |
| **Refinement tools per server, engine in shared** | Preserves the "no MCP SDK in shared" constraint. Tool registration requires the SDK; proposal validation and YAML writing doesn't. | Engine in each server (code duplication), engine as separate package (too many packages) |
| **Findings as resources, refinement as tools** | Findings are read-only reference material (resource semantics). Proposals have side effects (tool semantics). Aligns with MCP protocol design. | All as tools (loses resource semantics), all as resources (can't have side effects) |
| **TypeScript prompts as fallback** | Independent deployability. Server works without `skills/` directory — critical for development, testing, and containerized deployment where `skills/` may not be mounted. | No fallback (breaks if YAML missing), environment variable toggle (unnecessary complexity) |
| **Human-in-the-loop always** | AI proposes, human reviews PR. No auto-merge even for low-risk changes. Trust is earned incrementally. `autoApproveRiskLevel` in the contract is a policy declaration, not runtime behavior. | Full autonomy for low-risk (premature trust), require approval for all (already the case, but policy field reserves the option) |
| **Ring buffer for session findings** | Bounded memory (500 findings max). Oldest findings evicted — recent findings are more relevant. No unbounded growth risk. | Unbounded list (memory leak risk), fixed-size array (same concept, less idiomatic) |
| **Semver for skill versions** | Familiar convention. Patch for prompt tweaks, minor for structural changes, major for breaking contract changes. Aligns with `docs/governance/contract-versioning.md`. | Sequential integers (no semantic meaning), date-based (harder to compare) |
| **Staged version observation** | New skill versions run in observe-only mode before promotion. Findings tagged `isStaged: true` enable A/B comparison. Prevents regressions from going live. | Immediate promotion (risky), canary percentage (too complex for YAML-based prompts) |

---

## 12. Open Questions

These are deferred decisions that don't block implementation:

1. **Remote skill store**: What GCS bucket structure? How to handle cache invalidation? (Deferred to post-Phase 1)
2. **Cross-server pattern correlation**: Should the AI agent be able to query `findings://patterns/all` from _another_ server's resources? (Currently: no server-to-server communication — the agent reads both independently)
3. **Automated A/B testing**: Should the server randomly assign sessions to active vs. staged skill versions? (Currently: all sessions get staged if set, no random assignment)
4. **Finding store scale**: At what volume does JSONL become a bottleneck? Benchmark needed before Phase 3 to determine if BigQuery (Tier 3) is needed earlier.
5. **Proposal conflict resolution**: What happens if two concurrent proposals target the same skill? (Currently: last-write-wins on `stagedVersion` in registry)
