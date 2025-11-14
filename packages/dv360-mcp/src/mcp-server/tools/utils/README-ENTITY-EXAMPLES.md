# Entity Examples Utility

A curated collection of common DV360 entity update patterns with full example payloads, correct `updateMask` values, and usage notes.

## Overview

The `entityExamples.ts` utility provides:

- **Curated examples** for common operations (bid updates, status changes, budget adjustments, etc.)
- **Full example payloads** showing correct data structure for updates
- **Correct updateMask values** for each operation
- **Usage notes** explaining field formats, constraints, and common pitfalls
- **Category grouping** (bid, budget, status, flight, targeting, general)

## Why This Utility?

While our dynamic schema system (`schemaIntrospection.ts`, `entityMappingDynamic.ts`) provides:
- ✅ Auto-discovered schemas
- ✅ Field lists with types and descriptions
- ✅ Required fields extraction
- ✅ Common updateMask paths

It **doesn't provide**:
- ❌ Full example payloads showing correct data structure
- ❌ Usage notes (e.g., "bid in micros", "cannot unarchive")
- ❌ Examples of complex nested updates

**Entity examples fill this gap** by providing curated, tested patterns that guide users toward correct usage.

## Supported Entities

Currently provides examples for:
- **lineItem** (8 examples: bids, status, flight, budget, pacing, margin)
- **campaign** (4 examples: budget, status, flight, performance goals)
- **insertionOrder** (4 examples: budget, status, pacing, KPI)
- **advertiser** (2 examples: display name, status)
- **creative** (2 examples: display name, archive)
- **adGroup** (2 examples: display name, status)

## Usage

### Basic Usage

```typescript
import {
  getEntityExamples,
  getEntityExamplesByCategory,
  formatEntityExamplesAsText,
} from './utils/entityExamples.js';

// Get all examples for an entity type
const lineItemExamples = getEntityExamples('lineItem');
console.log(`Found ${lineItemExamples.length} examples`);

// Get examples by category
const bidExamples = getEntityExamplesByCategory('lineItem', 'bid');
bidExamples.forEach(ex => {
  console.log(`${ex.operation}: ${ex.updateMask}`);
});

// Format examples as text (for tool descriptions)
const helpText = formatEntityExamplesAsText('campaign');
console.log(helpText);
```

### Use Case 1: Enhanced Error Messages

```typescript
import { getEntityExamplesByCategory } from './utils/entityExamples.js';

// When user provides invalid updateMask, suggest valid patterns
const invalidUpdateMask = 'invalidField';
const validExamples = getEntityExamplesByCategory('lineItem', 'bid');

console.log(`Error: Invalid updateMask '${invalidUpdateMask}'`);
console.log('Did you mean one of these?');
validExamples.forEach(ex => {
  console.log(`  - ${ex.updateMask} (${ex.operation})`);
});
```

### Use Case 2: Tool Description Help Text

```typescript
import { getExamplesByCategory } from './utils/entityExamples.js';

// Generate rich tool descriptions with examples
function generateToolDescription(entityType: string): string {
  const grouped = getExamplesByCategory(entityType);
  let description = `Update ${entityType} entities. Common operations:\n\n`;

  Object.entries(grouped).forEach(([category, examples]) => {
    description += `**${category.toUpperCase()}:**\n`;
    examples.forEach(ex => {
      description += `- ${ex.operation} (updateMask: ${ex.updateMask})\n`;
    });
    description += '\n';
  });

  return description;
}
```

### Use Case 3: Validate Updates Against Known Patterns

```typescript
import { findMatchingExample } from './utils/entityExamples.js';

// Check if an update matches a known pattern
const updateData = { entityStatus: 'ENTITY_STATUS_PAUSED' };
const updateMask = 'entityStatus';

const matchingExample = findMatchingExample('lineItem', updateData, updateMask);
if (matchingExample) {
  console.log(`✓ Valid pattern: ${matchingExample.operation}`);
  console.log(`  Notes: ${matchingExample.notes}`);
}
```

### Use Case 4: Guide Users Step-by-Step

```typescript
import { getEntityExampleByOperation } from './utils/entityExamples.js';

// Show users how to perform a specific operation
const example = getEntityExampleByOperation('lineItem', 'Update CPM bid');
if (example) {
  console.log(`To update CPM bid:`);
  console.log(`1. Set data:`, JSON.stringify(example.data, null, 2));
  console.log(`2. Set updateMask: "${example.updateMask}"`);
  console.log(`3. Note: ${example.notes}`);
}
```

## Example Structure

Each example contains:

```typescript
interface EntityExample {
  operation: string;        // "Update CPM bid"
  description: string;      // "Change the fixed bid amount for a line item"
  category?: string;        // "bid" | "budget" | "status" | "flight" | "targeting" | "general"
  data: Record<string, any>; // { bidStrategy: { fixedBid: { bidAmountMicros: 5000000 } } }
  updateMask: string;       // "bidStrategy.fixedBid.bidAmountMicros"
  notes: string;            // "Bid amount is in micros (1 USD = 1,000,000 micros)..."
}
```

## Available Functions

### Core Functions

- **`getEntityExamples(entityType)`** - Get all examples for entity type
- **`getEntityExamplesByCategory(entityType, category)`** - Get examples by category
- **`getEntityExampleByOperation(entityType, operation)`** - Get specific example by operation name
- **`getEntityTypesWithExamples()`** - List all entity types with curated examples

### Formatting Functions

- **`formatExampleAsText(example)`** - Format single example as human-readable text
- **`formatEntityExamplesAsText(entityType)`** - Format all examples for entity type
- **`getExamplesSummary(entityType)`** - Get brief summary of available examples

### Utility Functions

- **`getExamplesByCategory(entityType)`** - Get examples grouped by category
- **`findMatchingExample(entityType, data, updateMask)`** - Find example matching update pattern

## Adding New Examples

To add examples for a new entity or operation:

1. **Define examples array** in `entityExamples.ts`:

```typescript
const MY_ENTITY_EXAMPLES: EntityExample[] = [
  {
    operation: "Update field name",
    description: "What this operation does",
    category: "bid", // or "budget", "status", "flight", "targeting", "general"
    data: {
      // Full example payload
      fieldName: "newValue"
    },
    updateMask: "fieldName",
    notes: "Important notes about this operation (formats, constraints, warnings)"
  },
  // ... more examples
];
```

2. **Register in registry**:

```typescript
const ENTITY_EXAMPLES_REGISTRY: Record<string, EntityExample[]> = {
  // ... existing entities
  myEntity: MY_ENTITY_EXAMPLES,
};
```

3. **Test with example script**:

```bash
npx tsx src/examples/entity-examples-usage.ts
```

## Categories

Examples are organized by category:

| Category | Description | Example Operations |
|----------|-------------|-------------------|
| `bid` | Bid adjustments (CPM, CPC, auto-bidding) | Update CPM bid, Update max average CPM |
| `budget` | Budget changes, daily caps, margins | Update budget, Update daily max, Update margin |
| `status` | Pause, activate, archive | Pause line item, Activate campaign |
| `flight` | Flight dates, scheduling | Update flight dates, Update campaign dates |
| `targeting` | Targeting options (future) | Update geo targeting, Update audience |
| `general` | Other operations | Update display name, Update pacing |

## Integration with Tools

Entity examples can be integrated into MCP tools in several ways:

### 1. Tool Description Enhancement

```typescript
export const updateEntityTool = {
  name: "dv360_update_entity",
  description: `Update a DV360 entity with flexible field updates.

${getExamplesSummary('lineItem')}

For detailed examples, see the entity examples utility.`,
  // ... rest of tool definition
};
```

### 2. Input Validation

```typescript
export async function updateEntityLogic(input: UpdateEntityInput) {
  // Validate against known patterns
  const matchingExample = findMatchingExample(
    input.entityType,
    input.data,
    input.updateMask
  );

  if (!matchingExample) {
    // Suggest valid patterns
    const examples = getEntityExamplesByCategory(input.entityType, 'bid');
    throw new Error(`Unknown update pattern. Try: ${examples.map(e => e.updateMask).join(', ')}`);
  }

  // Proceed with update...
}
```

### 3. Error Messages

```typescript
catch (error) {
  // Show relevant example on error
  const bidExamples = getEntityExamplesByCategory('lineItem', 'bid');
  logger.error(`Update failed. Valid bid patterns: ${bidExamples.map(e => e.updateMask).join(', ')}`);
}
```

## Comparison with Schema Introspection

| Feature | Schema Introspection | Entity Examples |
|---------|---------------------|-----------------|
| Auto-discovered | ✅ Yes | ❌ Manual curation |
| Field types | ✅ Yes | ✅ In data payload |
| Required fields | ✅ Yes | ❌ Not included |
| Example payloads | ❌ No | ✅ Full examples |
| UpdateMask values | ⚠️ Common paths only | ✅ For each operation |
| Usage notes | ❌ No | ✅ Detailed notes |
| Format guidance | ❌ No | ✅ Yes (e.g., "micros") |
| Constraint warnings | ❌ No | ✅ Yes (e.g., "cannot unarchive") |

**Both utilities complement each other:**
- Use **schema introspection** for discovery, validation, and generic field lists
- Use **entity examples** for guidance, error messages, and learning common patterns

## Testing

Run the example script to see all functions in action:

```bash
npx tsx src/examples/entity-examples-usage.ts
```

This demonstrates:
- Getting examples by entity type
- Filtering by category
- Finding specific operations
- Formatting as text
- Enhanced error messages
- Generating help text
- Validating updates against patterns

## Future Enhancements

Potential improvements:

1. **Add more entities**: Partner, inventory sources, targeting options
2. **Add more categories**: Add "targeting" category examples
3. **Validation helpers**: Auto-validate data structure against example
4. **API integration**: Record actual API responses as examples
5. **MCP Resource (optional)**: Expose as `entity-examples://{entityType}` resource

## Related Utilities

- **`schemaIntrospection.ts`** - Auto-discover schemas and extract field information
- **`entityMappingDynamic.ts`** - Dynamic entity configuration from API metadata
- **`entityIdExtraction.ts`** - Extract entity IDs from tool inputs
- **`getCommonUpdateMasks()`** in `schemaIntrospection.ts` - Common updateMask paths

## Questions?

For questions or suggestions:
1. Check the example script: `src/examples/entity-examples-usage.ts`
2. Review existing examples in `entityExamples.ts`
3. See how schema introspection complements this: `schemaIntrospection.ts`
