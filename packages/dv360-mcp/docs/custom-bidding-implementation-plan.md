# Custom Bidding Algorithms Implementation Plan

## Overview

Add full custom bidding algorithm support to dv360-mcp, including:
- Algorithm CRUD (already partially working via generic tools)
- Script management (create, list, get) with file upload
- Rules management (create, list, get) with file upload
- Specialized workflow tools for common operations
- MCP Resources for schema documentation

## Current State

**Already Working:**
- `customBiddingAlgorithm` is configured in `STATIC_ENTITY_API_METADATA` (entity-mapping-dynamic.ts:104-108)
- Generic CRUD tools (`list_entities`, `get_entity`, `create_entity`, `update_entity`) can manage algorithms
- Authentication and rate limiting infrastructure in place

**Missing:**
1. Child resource support (scripts, rules)
2. Media upload for script/rules files
3. Specialized workflow tools
4. MCP Resources for custom bidding

---

## Implementation Steps

### Phase 1: DV360Service Extensions

**File:** `packages/dv360-mcp/src/services/dv360/DV360-service.ts`

Add methods for custom bidding operations:

```typescript
// 1. Upload script file and get reference
async uploadCustomBiddingScript(
  customBiddingAlgorithmId: string,
  scriptContent: string,
  context?: RequestContext
): Promise<{ resourceName: string }>

// 2. Create script resource (after upload)
async createCustomBiddingScript(
  customBiddingAlgorithmId: string,
  scriptRef: string,
  context?: RequestContext
): Promise<CustomBiddingScript>

// 3. List scripts for an algorithm
async listCustomBiddingScripts(
  customBiddingAlgorithmId: string,
  context?: RequestContext
): Promise<CustomBiddingScript[]>

// 4. Get specific script
async getCustomBiddingScript(
  customBiddingAlgorithmId: string,
  customBiddingScriptId: string,
  context?: RequestContext
): Promise<CustomBiddingScript>

// Similar methods for Rules:
async uploadCustomBiddingRules(...)
async createCustomBiddingRules(...)
async listCustomBiddingRules(...)
async getCustomBiddingRules(...)
```

**Media Upload Pattern:**
```typescript
// Step 1: Upload to get scriptRef
POST /upload/displayvideo/v4/customBiddingAlgorithms/{id}:uploadScript
Content-Type: application/octet-stream
Body: <script content>

// Step 2: Create script resource with ref
POST /v4/customBiddingAlgorithms/{id}/scripts
Body: { "script": { "resourceName": "<from step 1>" } }
```

---

### Phase 2: Entity Mapping Updates

**File:** `packages/dv360-mcp/src/mcp-server/tools/utils/entity-mapping-dynamic.ts`

Add relationship metadata for CustomBiddingAlgorithm:

```typescript
// Add to RELATIONSHIP_OVERRIDES
customBiddingAlgorithm: [
  {
    parentEntityType: "advertiser",  // OR partner
    parentFieldName: "advertiserId", // OR partnerId
    required: false,  // Can be owned by either advertiser OR partner
    description: "Algorithm owned by advertiser (mutually exclusive with partnerId)",
  },
],
```

---

### Phase 3: Workflow Tools (Tier 2)

**New Files in:** `packages/dv360-mcp/src/mcp-server/tools/definitions/`

#### Tool 1: `create-custom-bidding-algorithm.tool.ts`

Creates a new custom bidding algorithm with guided workflow (uses elicitation):

```typescript
// Input schema (with elicitation for missing fields)
{
  displayName?: string,          // Elicited if missing
  algorithmType: "SCRIPT_BASED" | "RULE_BASED",  // Required, immutable
  ownerType?: "advertiser" | "partner",          // Elicited if missing
  ownerId?: string,              // Elicited: advertiserId or partnerId
  sharedAdvertiserIds?: string[],// Optional: share with other advertisers
  initialScript?: string,        // Optional: upload script immediately (SCRIPT_BASED)
  initialRules?: string,         // Optional: upload rules immediately (RULE_BASED)
}

// Output: Created algorithm + script upload result if provided
```

#### Tool 2: `manage-custom-bidding-script.tool.ts`

Upload and manage scripts for SCRIPT_BASED algorithms:

```typescript
// Input schema (with elicitation for missing fields)
{
  customBiddingAlgorithmId?: string, // Elicited if missing
  action: "upload" | "list" | "get" | "getActive",
  scriptContent?: string,        // Required for upload
  customBiddingScriptId?: string // Required for get
}

// Output: Script details including state (PENDING/ACCEPTED/REJECTED) and errors
```

#### Tool 3: `manage-custom-bidding-rules.tool.ts`

Upload and manage rules for RULE_BASED algorithms:

```typescript
// Input schema (with elicitation for missing fields)
{
  customBiddingAlgorithmId?: string, // Elicited if missing
  action: "upload" | "list" | "get" | "getActive",
  rulesContent?: string,         // Required for upload (AlgorithmRules format)
  customBiddingAlgorithmRulesId?: string // Required for get
}

// Output: Rules details including state (ACCEPTED/REJECTED) and errors
```

**Note:** RULE_BASED algorithms are restricted to allowlisted customers. The tool will surface API errors appropriately if access is denied.

#### Tool 4: `list-custom-bidding-algorithms.tool.ts`

List algorithms with filtering:

```typescript
// Input schema
{
  partnerId?: string,
  advertiserId?: string,
  filter?: string,  // e.g., "entityStatus=ENTITY_STATUS_ACTIVE"
}

// Output: Algorithms with their model readiness states
```

---

### Phase 4: MCP Resources

**New Files in:** `packages/dv360-mcp/src/mcp-server/resources/definitions/`

#### Resource 1: `custom-bidding-schema.resource.ts`

```
URI: entity-schema://customBiddingAlgorithm
Returns: Full JSON schema for CustomBiddingAlgorithm
```

#### Resource 2: `custom-bidding-examples.resource.ts`

```
URI: entity-examples://customBiddingAlgorithm
Returns: Example payloads for common operations:
- Create SCRIPT_BASED algorithm (advertiser-owned)
- Create SCRIPT_BASED algorithm (partner-owned, shared)
- Script format examples
```

#### Resource 3: `custom-bidding-script-format.resource.ts`

```
URI: custom-bidding://script-format
Returns: Documentation on script format, available variables, functions
```

---

### Phase 5: Tool Registration

**File:** `packages/dv360-mcp/src/mcp-server/tools/definitions/index.ts`

Add new tools to exports and `allTools` array.

**File:** `packages/dv360-mcp/src/mcp-server/resources/definitions/index.ts`

Add new resources to exports and registry.

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/services/dv360/DV360-service.ts` | Modify | Add script/rules upload methods |
| `src/mcp-server/tools/utils/entity-mapping-dynamic.ts` | Modify | Add relationship metadata |
| `src/mcp-server/tools/definitions/create-custom-bidding-algorithm.tool.ts` | Create | Algorithm creation with elicitation |
| `src/mcp-server/tools/definitions/manage-custom-bidding-script.tool.ts` | Create | Script upload/management with elicitation |
| `src/mcp-server/tools/definitions/manage-custom-bidding-rules.tool.ts` | Create | Rules upload/management with elicitation |
| `src/mcp-server/tools/definitions/list-custom-bidding-algorithms.tool.ts` | Create | Algorithm listing with filtering |
| `src/mcp-server/tools/definitions/index.ts` | Modify | Export new tools |
| `src/mcp-server/resources/definitions/custom-bidding-examples.resource.ts` | Create | Example payloads |
| `src/mcp-server/resources/definitions/index.ts` | Modify | Export new resources |
| `tests/custom-bidding.test.ts` | Create | Unit tests |

---

## API Endpoints Reference

| Operation | Method | Path |
|-----------|--------|------|
| List algorithms | GET | `/v4/customBiddingAlgorithms` |
| Get algorithm | GET | `/v4/customBiddingAlgorithms/{id}` |
| Create algorithm | POST | `/v4/customBiddingAlgorithms` |
| Patch algorithm | PATCH | `/v4/customBiddingAlgorithms/{id}` |
| Upload script | POST | `/upload/displayvideo/v4/customBiddingAlgorithms/{id}:uploadScript` |
| Create script | POST | `/v4/customBiddingAlgorithms/{id}/scripts` |
| List scripts | GET | `/v4/customBiddingAlgorithms/{id}/scripts` |
| Get script | GET | `/v4/customBiddingAlgorithms/{id}/scripts/{scriptId}` |
| Upload rules | POST | `/upload/displayvideo/v4/customBiddingAlgorithms/{id}:uploadRules` |
| Create rules | POST | `/v4/customBiddingAlgorithms/{id}/rules` |
| List rules | GET | `/v4/customBiddingAlgorithms/{id}/rules` |
| Get rules | GET | `/v4/customBiddingAlgorithms/{id}/rules/{rulesId}` |

---

## Key Considerations

### Script States
- `PENDING` - Processing by backend
- `ACCEPTED` - Ready for scoring impressions
- `REJECTED` - Has errors (check `errors[]` field)

### Algorithm Types
- `SCRIPT_BASED` - Custom JavaScript-like bidding logic
- `RULE_BASED` - Declarative rules (allowlisted customers only)

### Ownership
- Either `advertiserId` OR `partnerId` (mutually exclusive)
- `sharedAdvertiserIds[]` allows sharing across advertisers

### Immutable Fields
- `customBiddingAlgorithmType` - Cannot change after creation
- `partnerId`/`advertiserId` - Cannot transfer ownership

---

## Testing Strategy

1. **Unit tests** for new DV360Service methods
2. **Integration tests** with mock DV360 API responses
3. **Manual testing** with real DV360 account (requires custom bidding access)

---

## Estimated Complexity

- **DV360Service extensions**: Medium (new methods, media upload pattern)
- **Workflow tools**: Medium (follow existing patterns)
- **MCP Resources**: Low (template exists)
- **Tests**: Low-Medium

Total: ~10 files to create/modify
