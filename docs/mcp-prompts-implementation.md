# MCP Prompts Implementation Summary

## Overview

Added MCP Prompts support to `dv360-mcp` server to provide workflow guidance for complex multi-step operations. This complements the existing Tools + Resources architecture with on-demand workflow instructions.

## Architecture Decision: Prompts vs Context Clutter

### Context Cost Analysis

| Feature | Context Cost | When Loaded |
|---------|-------------|-------------|
| **Tools** | ~2KB per tool (~20KB for 10 tools) | Always in context |
| **Resources** | 0KB baseline | Only when fetched |
| **Prompts** | 0KB baseline | Only when invoked |

### When to Use Prompts

✅ **Use Prompts For:**
- Multi-step workflows with specific ordering (Campaign → IO → Line Items → Targeting)
- Operations with platform-specific gotchas (e.g., DV360 campaigns can't be DRAFT)
- Workflows requiring validation gates between steps
- Troubleshooting sequences

❌ **Don't Use Prompts For:**
- Simple single-tool operations (tool description is sufficient)
- Reference documentation (use MCP Resources instead)
- Operations AI agents can figure out from tool descriptions alone

## Implementation Details

### Files Created

```
packages/dv360-mcp/src/mcp-server/prompts/
├── full-campaign-setup.prompt.ts   # Prompt definition + message generator
└── index.ts                         # Prompt registry
```

### Server Changes

**Updated:** `packages/dv360-mcp/src/mcp-server/server.ts`
- Enabled `prompts: {}` capability (Phase 2.2)
- Added `prompts/list` handler
- Added `prompts/get` handler with argument substitution

### First Prompt: `full_campaign_setup_workflow`

**Purpose:** Guide AI agents through creating a complete DV360 campaign structure

**Workflow Steps:**
1. Fetch required schemas (via MCP Resources)
2. Create Campaign (PAUSED/ACTIVE status only)
3. Create Insertion Order (DRAFT status required)
4. Create Line Item(s) (DRAFT status recommended)
5. Assign Targeting Options (optional)
6. Activation workflow (IO → Line Items → Campaign)

**Key Features:**
- ⚠️ **GOTCHA** callouts for DV360-specific rules
- Example tool calls with exact JSON syntax
- Success criteria checklists
- Common errors table with solutions
- Troubleshooting guide
- Integration with MCP Resources for schema discovery

**Arguments:**
- `advertiserId` (required): DV360 Advertiser ID
- `includeTargeting` (optional): "true" to include targeting guidance

**Message Size:**
- Without targeting: ~8,859 characters
- With targeting: ~10,645 characters

## Integration with Existing Architecture

### Three-Layer Information Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 1. TOOLS (Always in Context)                                │
│    - Simplified schemas (~2KB each)                          │
│    - Tool descriptions                                        │
│    - Parameter specs                                          │
│    Cost: ~20KB for 10 tools                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. RESOURCES (On-Demand Schema Details)                     │
│    - entity-schema://{type}     → Full JSON Schema          │
│    - entity-fields://{type}     → Field paths               │
│    - entity-examples://{type}   → Example payloads          │
│    Cost: 0KB unless fetched                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. PROMPTS (On-Demand Workflow Guidance)                    │
│    - full_campaign_setup_workflow → Step-by-step guide      │
│    Cost: 0KB unless invoked                                  │
└─────────────────────────────────────────────────────────────┘
```

### Workflow Example

**User Request:** "Create a new DV360 campaign for advertiser 12345"

**AI Agent Actions:**
1. Invoke prompt: `full_campaign_setup_workflow` with `advertiserId=12345`
2. Receive workflow guide with 6 steps
3. Fetch Resources: `entity-schema://campaign`, `entity-schema://insertionOrder`, etc.
4. Follow workflow steps:
   - Call `create_entity` (Campaign) → Get campaignId
   - Call `create_entity` (Insertion Order) with campaignId → Get insertionOrderId
   - Call `create_entity` (Line Item) with insertionOrderId → Get lineItemId
   - (Optional) Call `create_entity` (Targeting) with lineItemId
5. Verify with `get_entity` calls

## Benefits vs Legacy Approach

### Legacy: Monolithic Tool with Validation

Your legacy code had a single `full_campaign_setup` tool with:
- ✅ Comprehensive validation (great!)
- ✅ Detailed error messages (great!)
- ❌ Validation happens **after** AI constructs payload (inefficient)
- ❌ Complex schema in tool definition (hard to understand)
- ❌ AI must guess field requirements (trial-and-error)

### New: Prompts + Tools + Resources

New approach separates concerns:
- ✅ **Prompts** provide workflow guidance **before** AI acts
- ✅ **Resources** provide schema details on-demand
- ✅ **Tools** stay simple with focused responsibilities
- ✅ AI learns requirements upfront (fewer errors)
- ✅ Better DX: Clear validation rules, examples, gotchas

## Testing

**Test Script:** `packages/dv360-mcp/tests/test-prompt.ts`

```bash
npx tsx tests/test-prompt.ts
```

**Validates:**
- Prompt message generation
- Argument substitution
- Conditional sections (targeting)
- Message length

## Future Prompts (Recommended)

Based on your legacy code patterns, consider adding:

1. **`bulk_update_workflow`**
   - Safe bulk operations with validation gates
   - Preview changes before execution
   - Rollback guidance

2. **`troubleshoot_api_errors`**
   - DV360 API error code → solution mapping
   - Common permission issues
   - Debugging checklist

3. **`entity_activation_workflow`**
   - Safe activation sequence (IO → Line Items → Campaign)
   - Budget validation before activation
   - Rollback if activation fails

## Key Learnings from Legacy Code

Your legacy `fullCampaignSetupHandler` had excellent patterns we preserved:

### 1. Comprehensive Validation
**Legacy:** Validated in tool handler
**New:** Validation rules documented in prompt **before** AI acts

### 2. Helpful Error Messages
**Legacy:** Contextual errors with solutions
**New:** Pre-emptive guidance with common errors table

### 3. DV360 Gotchas
**Legacy:** Code comments and validation checks
**New:** ⚠️ **GOTCHA** callouts in prompt text

### 4. Field Requirements
**Legacy:** Runtime validation errors
**New:** Upfront documentation with examples

## Recommendation: Context Efficiency

**Verdict:** Prompts add **zero baseline context cost** while providing high value for complex workflows.

**Best Practice:**
- Keep 2-4 high-value workflow prompts per server
- Don't create prompts for simple operations
- Use prompts to encode business rules and best practices
- Reference MCP Resources for detailed schema info

## Next Steps

1. ✅ **Implemented:** `full_campaign_setup_workflow` prompt (dv360-mcp)
2. ✅ **Expanded:** Prompts implemented across all five servers (dbm-mcp, dv360-mcp, ttd-mcp, gads-mcp, meta-mcp)
3. **Monitor Usage:** Track which prompts AI agents invoke most
4. **Iterate:** Add prompts based on common user workflows

---

**Files Modified:**
- `packages/dv360-mcp/src/mcp-server/server.ts` (enabled prompts capability)
- `packages/dv360-mcp/src/mcp-server/prompts/full-campaign-setup.prompt.ts` (new)
- `packages/dv360-mcp/src/mcp-server/prompts/index.ts` (new)
- `packages/dv360-mcp/tests/test-prompt.ts` (new)
- `CLAUDE.md` (documentation added)

**Build Status:** ✅ Clean build, no TypeScript errors
