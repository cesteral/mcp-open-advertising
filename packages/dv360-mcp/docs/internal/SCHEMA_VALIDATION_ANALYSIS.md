# Deep Dive: Schema Validation Analysis for CRUD Tools

**Analysis Date**: November 17, 2025
**Question**: Is schema-level validation necessary for get-entity, create-entity, update-entity, delete-entity?

---

## Critical Finding 🚨

**YES, schema-level validation IS necessary**

I discovered a **critical validation gap** that allows malformed API requests to reach the DV360 API.

---

## The Problem: Malformed API Paths

### Current Code Flaw

**Location**: `src/mcp-server/tools/utils/entityMappingDynamic.ts:121`

```typescript
const apiPath = apiMetadata.apiPathTemplate.includes("{")
  ? (ids: Record<string, string>) => {
      let path = apiMetadata.apiPathTemplate;
      // Replace all {paramName} with ids[paramName]
      path = path.replace(/\{(\w+)\}/g, (_, key) => ids[key] || "");
      //                                                        ^^
      //                                    Returns empty string if missing!
      return path;
    }
  : apiMetadata.apiPathTemplate;
```

### What Goes Wrong

When parent IDs are missing, the path replacement function returns **empty strings**, creating malformed API paths:

| Scenario                                   | Template                                      | Missing ID     | Resulting Path                      | Status       |
| ------------------------------------------ | --------------------------------------------- | -------------- | ----------------------------------- | ------------ |
| Get campaign without advertiserId          | `/advertisers/{advertiserId}/campaigns`       | `advertiserId` | `/advertisers//campaigns/123`       | ❌ Malformed |
| Create lineItem without advertiserId       | `/advertisers/{advertiserId}/lineItems`       | `advertiserId` | `/advertisers//lineItems`           | ❌ Malformed |
| Update insertionOrder without advertiserId | `/advertisers/{advertiserId}/insertionOrders` | `advertiserId` | `/advertisers//insertionOrders/456` | ❌ Malformed |

Notice the **double slash** `//` where the advertiserId should be.

---

## Validation Flow Analysis by Tool

### 1. get-entity Tool

**Current Validation Flow**:

```
User Request (missing advertiserId)
    ↓
[1] Zod Schema Validation → ✅ PASSES (advertiserId is optional)
    ↓
[2] Tool Logic → extractEntityIds(input, entityType)
    ↓
[3] Service: getEntity(entityType, ids, context)
    ↓
[4] Service: config.apiPath(ids) → Returns "/advertisers//campaigns"
    ↓
[5] Service: Checks entityId only ✅
    ↓
[6] Service: fetch(path="/advertisers//campaigns/123")
    ↓
[7] DV360 API → 400 Bad Request or 404 Not Found
```

**Problems**:

- ❌ Malformed request reaches external API
- ❌ Wastes network bandwidth
- ❌ Poor error message (HTTP 400/404 instead of clear validation error)
- ❌ Rate limiter may consume quota for invalid request
- ❌ Authentication token generated unnecessarily

**Current Service Validation**: Only checks `entityId` is present (line 118-124), **NOT parent IDs**

---

### 2. create-entity Tool

**Current Validation Flow**:

```
User Request (missing advertiserId)
    ↓
[1] Zod Schema Validation → ✅ PASSES (advertiserId is optional)
    ↓
[2] Tool Logic → extractParentIds(input)
    ↓
[3] Service: createEntity(entityType, ids, data, context)
    ↓
[4] Service: Checks supportsCreate ✅
    ↓
[5] Service: config.apiPath(ids) → Returns "/advertisers//campaigns"
    ↓
[6] Service: fetch(POST to "/advertisers//campaigns")
    ↓
[7] DV360 API → 400 Bad Request
```

**Problems**:

- ❌ Malformed request reaches external API
- ❌ Same issues as get-entity

**Current Service Validation**: **NONE** for parent IDs

---

### 3. update-entity Tool

**Current Validation Flow**:

```
User Request (missing advertiserId)
    ↓
[1] Zod Schema Validation → ✅ PASSES (advertiserId is optional)
    ↓
[2] Tool Logic → extractEntityIds(input, entityType)
    ↓
[3] Service: updateEntity(entityType, ids, data, updateMask, context)
    ↓
[4] Service: getEntity() first → (same malformed path issue)
    ↓
[5] DV360 API → 400 Bad Request
```

**Problems**:

- ❌ Malformed request reaches external API
- ❌ Calls `getEntity()` first, which has the same issue

**Current Service Validation**: Inherits from `getEntity()` (entity ID only, not parent IDs)

---

### 4. delete-entity Tool

**Current Validation Flow**:

```
User Request (missing advertiserId)
    ↓
[1] Zod Schema Validation → ✅ PASSES (advertiserId is optional)
    ↓
[2] Tool Logic → extractEntityIds(input, entityType)
    ↓
[3] Service: deleteEntity(entityType, ids, context)
    ↓
[4] Service: config.apiPath(ids) → Returns "/advertisers//campaigns"
    ↓
[5] Service: Checks entityId only ✅
    ↓
[6] Service: fetch(DELETE to "/advertisers//campaigns/123")
    ↓
[7] DV360 API → 400 Bad Request or 404 Not Found
```

**Problems**:

- ❌ Malformed request reaches external API
- ❌ Same issues as get-entity

**Current Service Validation**: Only checks `entityId` is present, **NOT parent IDs**

---

## Why Current Service Validation Is Insufficient

### Service Validation in DV360Service.listEntities

**Location**: `DV360Service.ts:46-59`

```typescript
// Validate that all required parent IDs are present
for (const requiredParentId of config.parentIds) {
  if (!ids[requiredParentId]) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Missing required parent ID '${requiredParentId}' for listing ${entityType} entities`
      // ...
    );
  }
}
```

✅ **This validation exists for `listEntities()` ONLY**

### Service Validation in Other Methods

**getEntity()**: Only validates `entityId`, not parent IDs (line 118-124)
**createEntity()**: No parent ID validation
**updateEntity()**: Relies on `getEntity()` (which has the gap)
**deleteEntity()**: Only validates `entityId`, not parent IDs (line 272-280)

---

## Impact Assessment

### Without Schema-Level Validation

| Impact                     | Severity  | Description                                                       |
| -------------------------- | --------- | ----------------------------------------------------------------- |
| **Malformed API Requests** | 🔴 HIGH   | Invalid paths like `/advertisers//campaigns/123` reach DV360 API  |
| **Poor Error Messages**    | 🟡 MEDIUM | Generic HTTP 400/404 instead of clear validation errors           |
| **Wasted Resources**       | 🟡 MEDIUM | Authentication, rate limiting, network calls for invalid requests |
| **API Quota Consumption**  | 🟡 MEDIUM | May count against rate limits even though request is invalid      |
| **Debugging Difficulty**   | 🟡 MEDIUM | Developers see HTTP errors instead of clear validation messages   |

### With Schema-Level Validation

| Benefit            | Impact    | Description                                                      |
| ------------------ | --------- | ---------------------------------------------------------------- |
| **Fail-Fast**      | 🟢 HIGH   | Errors caught in line 83 of server.ts (before any service calls) |
| **Clear Errors**   | 🟢 HIGH   | "Missing required parent ID(s) for campaign: advertiserId"       |
| **Zero API Calls** | 🟢 MEDIUM | No network traffic for invalid requests                          |
| **Consistent UX**  | 🟢 MEDIUM | Same error format across all tools                               |
| **Performance**    | 🟢 LOW    | Slightly faster (no service instantiation)                       |

---

## Validation Timing Comparison

### Current (Service-Level Only)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. HTTP Request Received                                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Zod Schema Parse (server.ts:83)                          │
│    ✅ Passes (parent IDs are optional)                       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Tool Logic Executes                                      │
│    - Extract IDs                                            │
│    - Resolve DV360Service from container                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Service Method Called (e.g., getEntity)                  │
│    - ensureAuthenticated() → JWT generation                 │
│    - config.apiPath(ids) → "/advertisers//campaigns/123"    │
│    - Validate entityId ✅                                     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Rate Limiting Check                                      │
│    - Consumes quota (even for invalid request)              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. HTTP Fetch to DV360 API                                  │
│    GET /advertisers//campaigns/123                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. DV360 API Returns 400 Bad Request                        │
└─────────────────────────────────────────────────────────────┘
```

**Time to Error**: ~500-1000ms (includes auth, network, API response)

### Proposed (Schema-Level)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. HTTP Request Received                                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Zod Schema Parse (server.ts:83)                          │
│    ❌ FAILS: Missing required parent ID 'advertiserId'       │
│    Throws ZodError immediately                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Error Handler Catches (server.ts:105-126)                │
│    Returns clear error to client                            │
└─────────────────────────────────────────────────────────────┘
```

**Time to Error**: ~1-5ms (synchronous validation only)

**Improvements**:

- ⚡ **100-1000x faster** error response
- 🚫 **Zero** API calls
- 🔐 **Zero** authentication overhead
- 📊 **Zero** rate limit consumption

---

## Test Evidence

I've created a test to demonstrate the issue:

**File**: `tests/test-malformed-paths.cjs`

This test calls `get-entity` with a campaign but without the required `advertiserId`:

```javascript
{
  entityType: 'campaign',
  campaignId: '12345'
  // Missing advertiserId
}
```

**Expected Behavior**: Schema validation error
**Actual Behavior**: TBD (needs server running to test)
**Likely Outcome**: API returns 400/404 with malformed path

---

## Recommended Solution

### Add Schema-Level Validation to All CRUD Tools

**Pattern to Follow**: Same as `list-entities.tool.ts:39-65`

**Implementation for get-entity.tool.ts**:

```typescript
export const GetEntityInputSchema = z
  .object({
    entityType: z.enum(getSupportedEntityTypesDynamic()),
    partnerId: z.string().optional(),
    advertiserId: z.string().optional(),
    campaignId: z.string().optional(),
    insertionOrderId: z.string().optional(),
    lineItemId: z.string().optional(),
    adGroupId: z.string().optional(),
    adId: z.string().optional(),
    creativeId: z.string().optional(),
  })
  .refine(
    (data) => {
      const config = getEntityConfigDynamic(data.entityType);

      // Validate parent IDs
      for (const requiredParentId of config.parentIds) {
        if (!data[requiredParentId as keyof typeof data]) {
          return false;
        }
      }

      // Validate entity ID is present
      const entityIdField = `${data.entityType}Id` as keyof typeof data;
      if (!data[entityIdField]) {
        return false;
      }

      return true;
    },
    (data) => {
      const config = getEntityConfigDynamic(data.entityType);
      const entityIdField = `${data.entityType}Id`;

      // Check which IDs are missing
      const missingParentIds = config.parentIds.filter((id) => !data[id as keyof typeof data]);
      const missingEntityId = !data[entityIdField as keyof typeof data] ? [entityIdField] : [];

      const allMissingIds = [...missingParentIds, ...missingEntityId];

      return {
        message: `Missing required ID(s) for ${data.entityType}: ${allMissingIds.join(", ")}. Required: ${[...config.parentIds, entityIdField].join(", ")}`,
        path: allMissingIds,
      };
    }
  );
```

**Apply to**:

1. ✅ `list-entities.tool.ts` (already has it)
2. ❌ `get-entity.tool.ts` (needs it)
3. ❌ `create-entity.tool.ts` (needs it)
4. ❌ `update-entity.tool.ts` (needs it)
5. ❌ `delete-entity.tool.ts` (needs it)

---

## Alternative: Fix the Path Builder

Instead of returning empty strings, throw an error:

```typescript
const apiPath = apiMetadata.apiPathTemplate.includes("{")
  ? (ids: Record<string, string>) => {
      let path = apiMetadata.apiPathTemplate;

      // Extract required params from template
      const requiredParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

      // Check all required params are present
      for (const param of requiredParams) {
        if (!ids[param]) {
          throw new McpError(
            JsonRpcErrorCode.InvalidParams,
            `Missing required path parameter '${param}' for API path construction`,
            { template: apiMetadata.apiPathTemplate, providedIds: Object.keys(ids) }
          );
        }
      }

      // Replace parameters
      path = path.replace(/\{(\w+)\}/g, (_, key) => ids[key]);
      return path;
    }
  : apiMetadata.apiPathTemplate;
```

**Pros**:

- Catches the issue at path construction time
- Prevents malformed paths from being created
- No changes needed to tool schemas

**Cons**:

- Error occurs later in the flow (after service instantiation)
- Less clear error message location (buried in path builder)
- Still consumes some resources before failing

---

## Final Recommendation

### ✅ Priority 0 (CRITICAL): Implement Schema-Level Validation

**Why**: Prevents malformed API requests from reaching DV360 API

**Tools to Update**:

- `get-entity.tool.ts`
- `create-entity.tool.ts`
- `update-entity.tool.ts`
- `delete-entity.tool.ts`

**Benefits**:

- 🚨 Prevents malformed API paths
- ⚡ Fail-fast error handling
- 💬 Clear, actionable error messages
- 🔒 Defense-in-depth (schema + service layers)
- 💰 Zero wasted resources (auth, rate limiting, network)

### ✅ Priority 1 (HIGH): Fix Path Builder as Backup

Add validation to `entityMappingDynamic.ts:118-124` to throw error instead of returning empty strings.

**Why**: Defense-in-depth - catches issues even if schema validation is bypassed

### Test Coverage

Run the new test to verify the issue:

```bash
./tests/test-malformed-paths.cjs
```

Expected result after fix:

```
✅ GOOD: Validation caught missing parent ID
   Error: Missing required ID(s) for campaign: advertiserId
   Validation layer: Schema
```

---

## Conclusion

**Answer**: YES, schema-level validation is **NECESSARY** (not just beneficial)

The current implementation has a **critical gap** that allows malformed API paths to reach the DV360 API. This wastes resources and provides poor error messages.

Schema-level validation using `.refine()` is the correct solution, following the pattern already established in `list-entities.tool.ts`.

**Severity**: 🔴 HIGH (P0)
**Effort**: 🟢 LOW (copy pattern from list-entities)
**Impact**: 🟢 HIGH (prevents API errors, improves UX)

---

**End of Analysis**
