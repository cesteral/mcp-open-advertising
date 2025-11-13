# DV360 MCP Examples - Generated Schema Integration

This directory contains example code demonstrating how to use **generated TypeScript types and Zod schemas** from the OpenAPI schema extraction system.

## 🎯 Purpose

These examples show integration patterns for:
- **TypeScript types** generated from DV360 API schemas
- **Zod validation schemas** for runtime type checking
- API response validation
- Type-safe entity updates

## ⚠️ Current Status

**These are demonstration examples** - they show schema integration patterns but are not fully executable due to missing infrastructure:

### Missing Dependencies
The following modules need to be implemented:
- `@/constants` - API constants and configuration
- `@/utils/date` - Date formatting utilities
- `@/utils/throttle-requests` - Request throttling and retry logic
- `@/types` - Shared type definitions
- `./auth` - Authentication helpers (partially implemented in `google-auth.ts`)
- `./SDF` - SDF bulk upload functionality

## 📁 Files

### `get-entities.ts`
Demonstrates fetching DV360 entities with schema validation:
- Partner retrieval with Zod validation
- Advertiser fetching with pagination
- Type annotations using generated schemas
- Error handling for validation failures

**Key Pattern:**
```typescript
import type { components } from '@/generated/schemas/types';
import { Partner as PartnerSchema } from '@/generated/schemas/zod';

type Partner = components['schemas']['Partner'];

// Fetch and validate
const response = await service.partners.list({...});
const validated = PartnerSchema.parse(partner);
```

### `update-entities.ts`
Shows entity updates using generated types:
- Line item updates with type safety
- Response validation after updates
- Partial type usage for PATCH operations

**Key Pattern:**
```typescript
import type { components } from '@/generated/schemas/types';
import { LineItem as LineItemSchema } from '@/generated/schemas/zod';

type LineItem = components['schemas']['LineItem'];

interface LineItemConfig {
  resource: Partial<LineItem>; // Type-safe partial updates
}

// Update and validate response
const response = await client.lineItems.patch(config);
const validated = LineItemSchema.parse(response.data);
```

### `google-auth.ts`
**Fully working** authentication module:
- Service account authentication
- OAuth2 token validation
- No schema integration needed (auth is infrastructure)

### `auth-middleware.ts`
**Fully working** Express middleware:
- Token validation for API endpoints
- No schema integration needed

## 🚀 Using Generated Schemas

### 1. Import TypeScript Types

```typescript
// Import the components namespace
import type { components } from '@/generated/schemas/types';

// Create type aliases for convenience
type Partner = components['schemas']['Partner'];
type Advertiser = components['schemas']['Advertiser'];
type InsertionOrder = components['schemas']['InsertionOrder'];
type LineItem = components['schemas']['LineItem'];
type AdGroup = components['schemas']['AdGroup'];
```

### 2. Import Zod Schemas for Validation

```typescript
// Import individual schemas
import {
  Partner as PartnerSchema,
  Advertiser as AdvertiserSchema,
  LineItem as LineItemSchema,
} from '@/generated/schemas/zod';

// Or import all schemas
import { schemas } from '@/generated/schemas/zod';
```

### 3. Validate API Responses

```typescript
// Basic validation
try {
  const validated = PartnerSchema.parse(apiResponse);
  console.log('Validation passed:', validated);
} catch (error) {
  console.error('Validation failed:', error);
}

// Validate arrays
const partners = apiResponse.partners || [];
const validated = partners.map(p => {
  try {
    return PartnerSchema.parse(p);
  } catch (error) {
    console.warn(`Invalid partner: ${error}`);
    return p; // or skip invalid items
  }
});
```

### 4. Type-Safe Partial Updates

```typescript
// Create partial schema for updates
import { LineItem } from '@/generated/schemas/zod';

const PartialLineItemUpdate = LineItem.partial().pick({
  displayName: true,
  bidStrategy: true,
  partnerRevenueModel: true,
});

// Validate update payload
const updatePayload = {
  displayName: 'Updated Line Item',
  bidStrategy: { ... },
};

const validated = PartialLineItemUpdate.parse(updatePayload);
```

## 📊 Available Schemas

The schema extraction system generates **62 schemas** covering all major DV360 entities:

### Core Entities
- `Partner`, `Advertiser`, `InsertionOrder`, `LineItem`, `AdGroup`

### Configuration Objects
- `BiddingStrategy`, `MaximizeSpendBidStrategy`, `PerformanceGoalBidStrategy`
- `PartnerRevenueModel`
- `InsertionOrderBudget`, `LineItemBudget`
- `Pacing`, `FrequencyCap`, `TargetFrequency`

### Response Wrappers
- `ListPartnersResponse`, `ListAdvertisersResponse`
- `ListInsertionOrdersResponse`, `ListLineItemsResponse`
- `ListAdGroupsResponse`

### Common Types
- `Date`, `DateRange`, `Money`, `Status`, `Dimensions`

[See full list in `src/generated/schemas/zod.ts`]

## 🔍 Schema Benefits

### Type Safety
```typescript
// Before: Using googleapis types (verbose)
const lineItem: displayvideo_v3.Schema$LineItem = {...};

// After: Using generated types (clean)
const lineItem: LineItem = {...};
```

### Runtime Validation
```typescript
// Catch API contract changes early
try {
  const validated = LineItemSchema.parse(apiResponse);
} catch (error) {
  // API returned unexpected data - log for investigation
  logger.error('API schema mismatch', { error, data: apiResponse });
}
```

### Autocomplete & IntelliSense
TypeScript provides full autocomplete for all schema fields, nested objects, and enums.

### Self-Documenting Code
Generated types include JSDoc comments from the API specification.

## 🛠️ Integration Checklist

To make these examples fully functional:

- [ ] **Configure path aliases** - ✅ Done in `tsconfig.json`
- [ ] **Create missing utils**
  - [ ] `src/constants.ts` - API constants
  - [ ] `src/types.ts` - Shared types (LogParams, EntityError)
  - [ ] `src/utils/date.ts` - Date formatting functions
  - [ ] `src/utils/throttle-requests.ts` - Request throttling
- [ ] **Fix auth imports**
  - [ ] Align `google-auth.ts` exports with example imports
  - [ ] Or update examples to use `getDv360AuthClient()`
- [ ] **Implement SDF** (if needed)
  - [ ] `src/examples/SDF.ts` - Bulk upload via Structured Data Files

## 📝 Best Practices

### 1. Always Validate External Data
```typescript
// ✅ Good: Validate API responses
const validated = PartnerSchema.parse(apiResponse);

// ❌ Bad: Trust external data
const partner = apiResponse as Partner;
```

### 2. Handle Validation Errors Gracefully
```typescript
// ✅ Good: Log and recover
try {
  return PartnerSchema.parse(data);
} catch (error) {
  logger.warn('Validation failed', { error, data });
  return data as Partner; // Fallback with type assertion
}

// ❌ Bad: Let validation errors crash
return PartnerSchema.parse(data); // Unhandled error
```

### 3. Use Partial Schemas for Updates
```typescript
// ✅ Good: Validate only the fields being updated
const UpdateSchema = LineItemSchema.partial().pick({
  displayName: true,
  bidStrategy: true,
});

// ❌ Bad: Require all fields for partial update
const validated = LineItemSchema.parse(updatePayload); // Will fail
```

### 4. Keep Generated Code Separate
- Never edit `src/generated/schemas/` files manually
- Regenerate schemas when API changes: `pnpm run generate:schemas`
- Commit generated schemas to version control

## 🔄 Regenerating Schemas

When the DV360 API changes or you need to add more schemas:

```bash
# Regenerate schemas from latest API
pnpm run generate:schemas

# Or manually
tsx scripts/generate-schemas.ts
```

Configuration is in `config/schema-extraction.config.ts`:
- Add schemas to `rootSchemas` array
- Adjust `excludePatterns` if needed
- Review extraction report: `.tmp-specs/extraction-report.json`

## 📚 Further Reading

- [OpenAPI Schema Extraction Spec](../../docs/openapi-schema-extraction-spec.md)
- [Phase 1 Implementation Checklist](../../docs/phase-1-implementation-checklist.md)
- [Generated Types](../generated/schemas/types.ts)
- [Generated Zod Schemas](../generated/schemas/zod.ts)

## 💡 Questions?

The generated schemas are **automatically extracted from the DV360 API Discovery document** and kept in sync with Google's official API specification. They provide:

- ✅ 100% type coverage of extracted entities
- ✅ Runtime validation with helpful error messages
- ✅ Zero manual maintenance (just regenerate)
- ✅ Smaller bundle size vs full googleapis package

For issues or enhancements, see the schema extraction pipeline in `scripts/generate-schemas.ts`.
