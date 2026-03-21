# MCP Elicitation Analysis for dv360-mcp

**Analysis Date**: November 17, 2025
**Question**: Should we implement MCP elicitation patterns in dv360-mcp?

---

## What is MCP Elicitation?

**Elicitation** is an MCP feature that allows a server to pause tool execution and request additional information from the user in a structured way. Instead of failing with an error, the tool can ask for missing data and continue once provided.

### The Elicitation Flow

```
1. Client calls tool with incomplete data
2. Tool detects missing information
3. Tool calls context.elicitInput({ message, schema })
4. Client shows prompt to user
5. User provides requested data
6. Tool receives data and continues execution
```

### Example from MCP SDK

```typescript
// Tool that uses elicitation
server.tool('collect-user-info', 'Collect user information', {
  infoType: z.enum(['contact', 'preferences', 'feedback']).optional()
}, async (params, context) => {
  let { infoType } = params;

  // If missing, ask the user
  if (!infoType) {
    infoType = await context.elicitInput({
      message: 'What type of information do you want to provide?',
      schema: {
        type: 'string',
        enum: ['contact', 'preferences', 'feedback']
      }
    });
  }

  // Continue with the data
  return { status: 'success', infoType };
});
```

---

## Current State of dv360-mcp

### Our Validation Approach

We use **fail-fast schema validation** with `.refine()` to enforce required parameters:

```typescript
// Current approach: Fail immediately with clear error
export const GetEntityInputSchema = z
  .object({
    entityType: z.enum(['campaign', 'lineItem', ...]),
    advertiserId: z.string().optional(),
    campaignId: z.string().optional(),
  })
  .refine(
    (data) => {
      // Validate required IDs based on entity type
      const config = getEntityConfigDynamic(data.entityType);
      for (const requiredId of config.parentIds) {
        if (!data[requiredId]) return false;
      }
      return true;
    },
    (data) => ({
      message: `Missing required ID(s): ${missingIds.join(", ")}`
    })
  );
```

**Result**: Tool fails immediately with actionable error message

### Our Error Messages

```
Error: Missing required ID(s) for campaign: advertiserId. Required: advertiserId, campaignId
```

---

## Potential Use Cases for Elicitation in dv360-mcp

### ❌ Use Case 1: Missing Required Parent IDs

**Scenario**: User calls get-entity without advertiserId

**Current Behavior** (Schema Validation):
```
Error: Missing required ID(s) for campaign: advertiserId, campaignId
```

**Potential Elicitation Behavior**:
```
Server: "What is the advertiserId for this campaign?"
User: "123456"
Server: "What is the campaignId?"
User: "789012"
Server: Fetches entity and returns result
```

**Analysis**:
- ❌ **Not suitable**: AI agents should provide all required parameters upfront
- ❌ **Complexity**: Would require multiple back-and-forth exchanges
- ❌ **UX**: Slower than just returning error and letting AI retry
- ✅ **Better approach**: Clear error message guides AI to correct the request

**Recommendation**: **DO NOT USE** - Schema validation is superior

---

### ❌ Use Case 2: Optional Filtering Criteria

**Scenario**: List entities with optional filters

**Current Behavior**:
```typescript
// User can optionally provide filter
{
  entityType: "campaign",
  advertiserId: "123",
  filter: "entityStatus=ENTITY_STATUS_ACTIVE"  // Optional
}
```

**Potential Elicitation Behavior**:
```
Server: "Do you want to filter the results?"
User: "Yes, only active campaigns"
Server: Lists active campaigns
```

**Analysis**:
- ❌ **Not needed**: AI agents can decide whether to filter
- ❌ **Overhead**: Adds latency for optional features
- ✅ **Current approach**: Optional parameters work well

**Recommendation**: **DO NOT USE** - Optional parameters handle this

---

### ⚠️ Use Case 3: Confirmation for Destructive Operations

**Scenario**: Delete entity requires confirmation

**Current Behavior**:
```typescript
// Deletion happens immediately
deleteEntity({
  entityType: "campaign",
  advertiserId: "123",
  campaignId: "456"
})
```

**Potential Elicitation Behavior**:
```
Server: "Are you sure you want to delete campaign 'Holiday Sale 2025'? This cannot be undone."
User: "Yes, delete it"
Server: Deletes campaign
```

**Analysis**:
- ⚠️ **Could be useful**: Prevents accidental deletions
- ❌ **AI agent context**: Claude Desktop AI already confirms with user
- ❌ **Complexity**: Adds friction to batch operations
- ⚠️ **Alternative**: Use optional `confirm: true` parameter

**Current Architecture**: AI agent (Claude) already handles user confirmation at the client level

**Recommendation**: **NOT NEEDED** - Client-side confirmation is more appropriate

---

### ❌ Use Case 4: Ambiguous Entity Selection

**Scenario**: Multiple entities match a description

**Current Behavior**:
```typescript
// User must specify exact ID
{
  entityType: "campaign",
  advertiserId: "123",
  campaignId: "456"  // Exact ID required
}
```

**Potential Elicitation Behavior**:
```
Server: "Found 3 campaigns matching 'Holiday':
1. Holiday Sale 2025 (ID: 123)
2. Holiday Promo Q4 (ID: 456)
3. Holiday Campaign (ID: 789)
Which one do you want?"
User: "2"
Server: Returns campaign 456
```

**Analysis**:
- ❌ **Not DV360 pattern**: DV360 API requires exact IDs, no fuzzy search
- ❌ **Wrong layer**: Entity discovery should happen in separate list/search tool
- ✅ **Better approach**: Use list-entities to find, then use ID

**Recommendation**: **DO NOT USE** - Not applicable to DV360 API pattern

---

### ❌ Use Case 5: Missing updateMask Guidance

**Scenario**: User forgets to specify updateMask for updates

**Current Behavior**:
```
Error: updateMask is required
```

**Potential Elicitation Behavior**:
```
Server: "You're updating these fields: displayName, budget, entityStatus
Should I generate the updateMask for you?"
User: "Yes"
Server: Generates updateMask="displayName,budget,entityStatus"
```

**Analysis**:
- ❌ **Not needed**: updateMask is a required field in our schema
- ❌ **AI agents**: Smart enough to construct updateMask
- ✅ **Better approach**: Schema validation + clear error

**Recommendation**: **DO NOT USE** - Required field validation handles this

---

### ⚠️ Use Case 6: Complex Data Entry

**Scenario**: Creating entities with complex nested structures

**Current Behavior**:
```typescript
// User must provide full entity structure
{
  entityType: "lineItem",
  advertiserId: "123",
  data: {
    displayName: "My Line Item",
    entityStatus: "ENTITY_STATUS_DRAFT",
    lineItemType: "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
    flight: {
      flightDateType: "LINE_ITEM_FLIGHT_DATE_TYPE_CUSTOM",
      dateRange: {
        startDate: { year: 2025, month: 1, day: 1 },
        endDate: { year: 2025, month: 12, day: 31 }
      }
    },
    budget: {
      budgetUnit: "BUDGET_UNIT_CURRENCY",
      budgetAmountMicros: "1000000000"
    },
    // ... many more fields
  }
}
```

**Potential Elicitation Behavior**:
```
Server: "Let's create a line item. What's the display name?"
User: "My Line Item"
Server: "What's the line item type?"
User: "Display"
Server: "What's the start date?"
User: "January 1, 2025"
... (many more questions)
```

**Analysis**:
- ❌ **Too many questions**: Would require 10+ elicitation rounds
- ❌ **AI agent capability**: Claude can construct complex structures
- ❌ **Performance**: Each round trip adds latency
- ⚠️ **Possible use**: Interactive wizard for human users
- ❌ **Our use case**: AI agents, not direct human interaction

**Recommendation**: **NOT SUITABLE** - AI agents don't need this

---

## Key Architectural Considerations

### 1. Our Users are AI Agents, Not Humans

**dv360-mcp architecture**:
```
Human User → Claude Desktop (AI Agent) → dv360-mcp → DV360 API
```

**Elicitation flow**:
```
dv360-mcp → Claude Desktop → Human User (via UI prompt)
```

**Problem**: Adds unnecessary human interaction when AI agent should handle it

**Example**:
- **Without elicitation**: AI agent constructs complete request, gets result
- **With elicitation**: AI agent → partial request → human prompt → human types → AI continues

**Conclusion**: Elicitation is designed for **human-driven** tools, not **AI-agent-driven** APIs

---

### 2. Schema Validation vs Elicitation

| Aspect | Schema Validation | Elicitation |
|--------|------------------|-------------|
| **Speed** | 1-5ms | 1000-10000ms (human response time) |
| **UX** | AI sees error, retries immediately | AI must wait for human input |
| **Complexity** | Simple Zod schemas | Server + client implementation |
| **Error Clarity** | Specific: "Missing advertiserId" | Generic: "Server needs input" |
| **Best For** | API parameters, required fields | Interactive wizards, ambiguous choices |

**For dv360-mcp**: Schema validation is the right choice

---

### 3. SDK Support & Implementation Cost

**Unknowns**:
- ⚠️ Need to verify if `@modelcontextprotocol/sdk` v1.0.2 supports elicitation
- ⚠️ The quickstart template may reference newer/unreleased features
- ⚠️ No evidence of `elicitInput` in our current SDK version

**Implementation Requirements**:
1. Server must declare `elicitation` capability
2. Server must have access to `context.elicitInput()` method
3. Client (Claude Desktop) must support elicitation
4. Each tool must implement elicitation logic

**Complexity**: **HIGH** for questionable benefit

---

## Use Cases Where Elicitation WOULD Be Valuable

### ✅ Interactive Web UI for Direct Human Users

If we built a web interface where **humans directly interact** with dv360-mcp:

```
User: "Create a campaign"
System: "What's the campaign name?"
User: "Holiday Sale 2025"
System: "What's the budget?"
User: "$10,000"
System: "Campaign created!"
```

**But this is NOT our architecture** - we have AI agents as intermediaries

---

### ✅ Ambiguous User Intent

If the AI agent genuinely can't determine user intent:

```
User: "Delete the campaign"
AI: (Which campaign? User has 50 active campaigns)
AI → Server: delete_campaign()
Server → AI: "Which campaign? Found 50 active campaigns"
AI → Server: elicitInput()
Server → User: "Which campaign do you want to delete?"
User: "The holiday one from last year"
```

**But**:
- DV360 API requires exact IDs
- AI should ask user directly, not via elicitation
- Better UX: AI maintains conversation context

---

## Comparison: Schema Validation vs Elicitation

### Scenario: Missing advertiserId

#### Approach 1: Schema Validation (Current)

```
User: "Get campaign 123"
AI: get_entity({ entityType: "campaign", campaignId: "123" })
Server: ❌ Error: Missing advertiserId
AI: (understands error, looks at context)
AI: get_entity({ entityType: "campaign", campaignId: "123", advertiserId: "456" })
Server: ✅ Returns campaign

Total time: ~500ms
Interactions: 2 (AI → Server, Server → AI)
```

#### Approach 2: Elicitation

```
User: "Get campaign 123"
AI: get_entity({ entityType: "campaign", campaignId: "123" })
Server: 🔔 Elicitation: "What is the advertiserId?"
Client: (shows UI prompt to human user)
User: (types "456")
Client: Returns "456" to server
Server: ✅ Returns campaign

Total time: ~5000ms (human response time)
Interactions: 4 (AI → Server, Server → User, User → Server, Server → AI)
```

**Winner**: Schema validation is faster and more appropriate for AI agents

---

## Final Recommendation

### ❌ **DO NOT IMPLEMENT** Elicitation in dv360-mcp

**Reasons**:

1. **Wrong Architecture Pattern**
   - dv360-mcp is designed for AI agent consumption
   - Elicitation is designed for human-driven tools
   - Adding human prompts defeats the purpose of AI agents

2. **Schema Validation is Superior for Our Use Case**
   - Faster (1-5ms vs seconds)
   - Clearer error messages
   - AI agents can self-correct
   - No human interruption needed

3. **Implementation Cost vs Benefit**
   - HIGH complexity to implement
   - ZERO benefit for AI agent use case
   - May not be supported in current SDK version

4. **No Valid Use Cases Identified**
   - Required parameters → Schema validation
   - Optional parameters → Already handled
   - Confirmations → Client (Claude) handles
   - Complex structures → AI agents can build
   - Ambiguous selection → Not DV360 pattern

5. **Worse User Experience**
   - Interrupts AI agent workflow
   - Adds latency (human response time)
   - Breaks AI agent autonomy

---

## When to Reconsider

Elicitation WOULD make sense if:

1. ✅ We build a **direct human UI** (web app) for dv360-mcp
2. ✅ We add **interactive wizards** for complex entity creation
3. ✅ We implement **fuzzy search** that returns multiple matches
4. ✅ We have **genuinely ambiguous operations** that AI can't resolve

**Current state**: None of these apply

---

## Alternative: Improve Tool Descriptions

Instead of elicitation, **improve tool descriptions** to guide AI agents:

### Before
```typescript
description: "Get a DV360 entity by ID"
```

### After (Already Implemented)
```typescript
description: `Get a DV360 entity by ID

Required IDs vary by entity type:
- partner: partnerId
- advertiser: partnerId, advertiserId
- campaign: advertiserId, campaignId
- lineItem: advertiserId, lineItemId

Example:
{
  entityType: "campaign",
  advertiserId: "123456",
  campaignId: "789012"
}`
```

**Benefit**: AI agents learn requirements without runtime errors or elicitation

---

## Conclusion

**Elicitation is NOT suitable for dv360-mcp** because:

- ❌ Our users are AI agents, not humans
- ❌ Schema validation is faster and clearer
- ❌ No valid use cases identified
- ❌ High implementation cost for zero benefit
- ❌ Would worsen UX by adding human interruptions

**Keep current approach**:
- ✅ Fail-fast schema validation with `.refine()`
- ✅ Clear, actionable error messages
- ✅ Let AI agents self-correct
- ✅ Maintain AI agent autonomy

**Elicitation Rating**: ⭐☆☆☆☆ (Not recommended)

---

**End of Analysis**
