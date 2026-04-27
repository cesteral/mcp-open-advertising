# Design Pattern Review: dv360-mcp Improvements

## Executive Summary

**Decision**: Maintain hybrid two-tier architecture (generic CRUD + workflow tools), but consolidate workflow tools where possible.

**Current**: 16 tools → **Target**: 12 tools through consolidation

**Key Findings**:

- The codebase has a **solid top-level architecture** (clear tool tiers, entity mapping system)
- A "generic tools only" approach is **not viable** - would drop core non-CRUD workflows (multi-step uploads, targeting validation, batch logic)
- Suffers from **tactical duplication** and **inconsistent patterns** that should be addressed during consolidation
- The entity mapping system works well for generic CRUD but doesn't extend to child resources or file uploads

---

## Strategic Decision: Why Generic-Only Fails

### Tier 1: Generic CRUD Tools (5 tools) - Working Well

- `list-entities`, `get-entity`, `create-entity`, `update-entity`, `delete-entity`
- Handle 14+ entity types via `entity-mapping-dynamic.ts`
- Simplified schema pattern (~10KB) for stdio transport compatibility

### Tier 2: Workflow-Specific Tools - Cannot Be Generalized

**Custom Bidding (4 tools)** - Can't generalize because:

- Scripts require two-phase workflow: binary upload → resource creation
- Different HTTP mechanisms (octet-stream vs JSON)
- Async state machine (PENDING → ACCEPTED/REJECTED) with line/column error details
- 30-second timeout vs standard 10-second

**Targeting (5 tools)** - Can't generalize because:

- 49 distinct targeting types with unique validation rules
- Different required parent IDs (IO vs LI vs AdGroup)
- Schema name inconsistencies (e.g., `DIGITAL_CONTENT_LABEL_EXCLUSION` → `DigitalContentLabelAssignedTargetingOptionDetails`)
- Context-specific business logic warnings

**Batch Operations (2 tools)** - Can't generalize because:

- Item-level error recovery (partial success)
- Per-item elicitation patterns
- Skip logic for no-op updates

---

## Tool Consolidation Strategy

### Current State: 16 tools

| Category            | Tools                                                                                                                            | Count |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Generic Entity CRUD | list-entities, get-entity, create-entity, update-entity, delete-entity                                                           | 5     |
| Custom Bidding      | create-custom-bidding-algorithm, list-custom-bidding-algorithms, manage-custom-bidding-script, manage-custom-bidding-rules       | 4     |
| Targeting           | create-assigned-targeting, list-assigned-targeting, get-assigned-targeting, delete-assigned-targeting, validate-targeting-config | 5     |
| Batch Operations    | adjust-line-item-bids, bulk-update-status                                                                                        | 2     |

### Consolidation: 16 → 12 tools

| Change                           | Before                                                    | After                                                                          | Savings |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- |
| Merge script + rules management  | manage-custom-bidding-script, manage-custom-bidding-rules | **manage-custom-bidding-resources** (with `resourceType: script \| rules`)     | -1      |
| Merge targeting CRUD             | create/list/get/delete-assigned-targeting                 | **manage-assigned-targeting** (with `action: create \| list \| get \| delete`) | -3      |
| Keep validate-targeting separate | validate-targeting-config                                 | _(keep - different purpose: audit vs CRUD)_                                    | 0       |
| Keep batch tools separate        | adjust-line-item-bids, bulk-update-status                 | _(keep - different domains, different parameters)_                             | 0       |

### Target State: 12 tools

| Category            | Tools                                                                                                | Count |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ----- |
| Generic Entity CRUD | list-entities, get-entity, create-entity, update-entity, delete-entity                               | 5     |
| Custom Bidding      | create-custom-bidding-algorithm, list-custom-bidding-algorithms, **manage-custom-bidding-resources** | 3     |
| Targeting           | **manage-assigned-targeting**, validate-targeting-config                                             | 2     |
| Batch Operations    | adjust-line-item-bids, bulk-update-status                                                            | 2     |

### Consolidation Trade-offs

**Merge: manage-custom-bidding-script + manage-custom-bidding-rules**

- ✅ Both follow same pattern (upload → create, list, get states)
- ⚠️ Slightly larger schema, need `resourceType` discriminator
- **Verdict**: Good consolidation - patterns are nearly identical

**Merge: Targeting CRUD tools**

- ✅ Reduces 4 tools to 1 with `action` parameter
- ⚠️ Larger tool schema, AI must specify action
- **Verdict**: Good consolidation - standard CRUD pattern

**Keep Separate: validate-targeting-config**

- Fundamentally different operation (audit multiple entities vs CRUD single entity)

**Keep Separate: Batch tools**

- adjust-line-item-bids and bulk-update-status have completely different parameters, entity types, and update logic

---

## Alternative Considered: Generic Child Resource Abstraction

Creating a generic `childResource` abstraction that handles uploads, parent type validation, and schema discovery.

**Rejected because:**

- High implementation complexity
- Would still need special cases for targeting (49 types)
- Upload workflow (binary + state machine) is fundamentally different from CRUD
- Abstraction leakage likely when edge cases emerge

---

## Issues Identified

### 1. Duplicated Upload Logic in DV360Service

**Problem:** `uploadCustomBiddingScript()` and `uploadCustomBiddingRules()` are nearly identical (~100 lines duplicated).

```typescript
// Current: Two nearly identical methods
async uploadCustomBiddingScript(algorithmId, scriptContent, context) { ... }
async uploadCustomBiddingRules(algorithmId, rulesContent, context) { ... }
```

**Impact:** Adding future file-based resources (e.g., creative assets) means more duplication.

### 2. Entity Mapping Doesn't Support Child Resources

**Problem:** `STATIC_ENTITY_API_METADATA` only handles top-level entities. Child resources like `customBiddingScript` are hardcoded in the service layer.

```typescript
// Current: Only top-level entities
customBiddingAlgorithm: { apiPathTemplate: "/customBiddingAlgorithms", ... }
// Missing: customBiddingScript, customBiddingRules, assignedTargetingOption
```

**Impact:** No consistent pattern for nested resources. Each requires custom service methods.

### 3. Three Different API Path Building Patterns

| Location               | Pattern                                  |
| ---------------------- | ---------------------------------------- |
| Generic entity methods | `config.apiPath(ids)` via entity mapping |
| Custom bidding methods | Hardcoded template strings               |
| Targeting service      | `buildTargetingApiPath()` helper         |

**Impact:** Inconsistent, hard to maintain, confusion about where to add new endpoints.

### 4. Inconsistent Elicitation Patterns

| Tool                              | What's Elicited                         |
| --------------------------------- | --------------------------------------- |
| `adjust-line-item-bids`           | `advertiserId` + `lineItemId`           |
| `bulk-update-status`              | `advertiserId` only                     |
| `create-custom-bidding-algorithm` | `displayName` + `ownerType` + `ownerId` |
| `manage-custom-bidding-script`    | `customBiddingAlgorithmId` only         |

**Impact:** Unpredictable UX - users don't know which fields will prompt vs. require upfront.

### 5. Separated Service Architecture

**Problem:** `DV360Service` and `TargetingService` are separate, with:

- Duplicated auth patterns
- Different API path handling
- No shared interfaces

**Impact:** Unclear where new functionality should go.

---

## Recommended Improvements (Priority Order)

### HIGH PRIORITY

#### 1. Abstract File Upload Pattern

**Change:** Create a generic file upload method in DV360Service.

```typescript
// New private method
private async uploadFileAndCreateResource<T>(
  parentPath: string,
  uploadSuffix: string,    // ':uploadScript' or ':uploadRules'
  content: string,
  createPath: string,
  resourceField: string,   // 'script' or 'rules'
  context?: RequestContext
): Promise<T>
```

**Files:** `src/services/dv360/DV360-service.ts`

**Benefit:** Reduces ~100 lines duplication, enables future file uploads (creatives).

#### 2. Add Child Resource Support to Entity Mapping

**Change:** Extend `EntityConfig` interface with child resource metadata.

```typescript
export interface ChildResourceConfig {
  resourceType: string;
  apiPathTemplate: string;
  supportsCreate: boolean;
  supportsDelete: boolean;
  uploadHandler?: "file" | "json";
  uploadEndpointSuffix?: string;
}

export interface EntityConfig {
  // ... existing fields
  childResources?: Record<string, ChildResourceConfig>;
}
```

**Files:** `src/mcp-server/tools/utils/entity-mapping-dynamic.ts`

**Benefit:** All entity relationships in one place, config-driven child resource handling.

### MEDIUM PRIORITY

#### 3. Standardize Elicitation Patterns

**Change:** Document and enforce consistent elicitation rules.

**Proposed Rule:**

- Tier 2 tools elicit: Parent ID (e.g., `advertiserId`) + Entity ID if operating on existing entity
- Create operations: Elicit owner/parent, NOT the entity being created

**Files:** Document in CLAUDE.md, update tools for consistency

#### 4. Unify API Path Building

**Change:** Single path builder function used by all service methods.

```typescript
export function buildApiPath(
  entityType: string,
  ids: Record<string, string>,
  childResource?: string,
  action?: string // ':uploadScript', ':uploadRules'
): string;
```

**Files:** New utility, update DV360Service and TargetingService

### LOW PRIORITY

#### 5. Consider Service Consolidation

**Options:**

- **Option A:** Merge TargetingService into DV360Service (simpler, single service)
- **Option B:** Extract shared interface (keep separation, share auth/rate limiting)

**Recommendation:** Defer until next major feature requires decision.

---

## Implementation Approach

### If Proceeding with Improvements

**Phase 1:** Abstract file upload (Item 1)

- Refactor DV360Service to use generic upload method
- No external API changes
- Estimated effort: Small

**Phase 2:** Child resource metadata (Item 2)

- Update EntityConfig interface
- Add metadata for customBiddingScript, customBiddingRules
- Update existing tools to use metadata
- Estimated effort: Medium

**Phase 3:** Standardize patterns (Items 3-4)

- Document elicitation rules
- Create shared path builder
- Refactor for consistency
- Estimated effort: Medium

### If Maintaining Status Quo

The current implementation is **functional and complete**. The identified issues are:

- Code quality improvements, not bugs
- Would benefit future development, not current users
- Could be addressed incrementally as new features are added

---

## Decision Summary

| Aspect              | Decision                                                    |
| ------------------- | ----------------------------------------------------------- |
| Architecture        | Hybrid two-tier (generic CRUD + workflow tools)             |
| Generic tools only? | ❌ Not viable - drops upload/targeting/batch workflows      |
| Tool reduction      | ✅ Consolidate 16 → 12 tools via action parameters          |
| New abstraction?    | ❌ Not recommended - complexity exceeds benefit             |
| Code quality        | ✅ Address duplication and consistency during consolidation |

---

## Key Files for Implementation

| File                                                                       | Change                                               |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| `src/mcp-server/tools/definitions/index.ts`                                | Update exports                                       |
| `src/mcp-server/tools/definitions/manage-custom-bidding-resources.tool.ts` | New consolidated tool                                |
| `src/mcp-server/tools/definitions/manage-assigned-targeting.tool.ts`       | New consolidated tool                                |
| `src/services/dv360/DV360-service.ts`                                      | Add `uploadFileAndCreateResource<T>()`               |
| `CLAUDE.md`                                                                | Document two-tier architecture and elicitation rules |

---

_Document created: 2025-12-19_
_Updated: 2025-12-19 - Added strategic decision, consolidation strategy_
_Related: custom-bidding-implementation-plan.md_
