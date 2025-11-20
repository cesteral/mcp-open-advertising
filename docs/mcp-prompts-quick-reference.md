# MCP Prompts Quick Reference

## What Are MCP Prompts?

MCP Prompts are **on-demand workflow guides** that AI agents can invoke when they need step-by-step instructions for complex operations.

## Context Cost Comparison

```
┌─────────────────┬──────────────┬─────────────────────────┐
│ Feature         │ Context Cost │ When Loaded             │
├─────────────────┼──────────────┼─────────────────────────┤
│ Tools           │ ~20KB        │ Always in context       │
│ Resources       │ 0KB          │ Only when fetched       │
│ Prompts         │ 0KB          │ Only when invoked       │
└─────────────────┴──────────────┴─────────────────────────┘
```

## Available Prompts (dv360-mcp)

### `full_campaign_setup_workflow`

**Purpose:** Guide through creating complete DV360 campaign structure

**Arguments:**
- `advertiserId` (required) - DV360 Advertiser ID
- `includeTargeting` (optional) - Set to "true" for targeting guidance

**What It Covers:**
- Step 1: Fetch required schemas
- Step 2: Create Campaign
- Step 3: Create Insertion Order
- Step 4: Create Line Item(s)
- Step 5: Assign Targeting (if requested)
- Step 6: Activation workflow

**Key Features:**
- ⚠️ Platform-specific gotchas highlighted
- Example tool calls with exact JSON
- Common errors table with solutions
- Success criteria checklists
- Troubleshooting guide

**Example Invocation (AI Agent):**
```typescript
// AI agent invokes prompt via MCP
const response = await mcpClient.getPrompt({
  name: "full_campaign_setup_workflow",
  arguments: {
    advertiserId: "12345",
    includeTargeting: "true"
  }
});

// Response contains markdown workflow guide
console.log(response.messages[0].content.text);
```

## When to Use Prompts

### ✅ Use Prompts For:

- **Multi-step workflows** requiring specific ordering
  - Example: Campaign → IO → Line Items (must be sequential)

- **Platform-specific quirks** that AI agents might not know
  - Example: DV360 campaigns can't be DRAFT, but IOs must be DRAFT

- **Validation gates** between workflow steps
  - Example: "Save campaignId from Step 2 for use in Step 3"

- **Complex troubleshooting** sequences
  - Example: "If error X, check Y, then try Z"

### ❌ Don't Use Prompts For:

- **Simple operations** - Tool description is sufficient
  - Example: "Get a single entity" - just use `get_entity` tool

- **Reference documentation** - Use MCP Resources instead
  - Example: "What fields does Campaign have?" → `entity-schema://campaign`

- **Operations AI can figure out** from tool descriptions alone
  - Example: "List all campaigns" - obvious from `list_entities` tool

## Creating New Prompts

### Step 1: Define Prompt Metadata

```typescript
// In packages/dv360-mcp/src/mcp-server/prompts/my-workflow.prompt.ts
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const myWorkflowPrompt: Prompt = {
  name: "my_workflow",
  description: "Step-by-step guide for...",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID",
      required: true,
    },
  ],
};
```

### Step 2: Define Message Generator

```typescript
export function getMyWorkflowPromptMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";

  return `# My Workflow Guide

## Step 1: Fetch Schemas

Use MCP Resources to fetch required schemas:
- entity-schema://campaign
- entity-schema://lineItem

## Step 2: Create Entity

Tool: create_entity
Parameters:
\`\`\`json
{
  "advertiserId": "${advertiserId}",
  "entityType": "campaign",
  "data": {
    "displayName": "Your Campaign"
  }
}
\`\`\`

### Success Criteria
- ✅ Response includes campaignId
- ✅ Entity is in correct status

### Common Errors
| Error | Solution |
|-------|----------|
| "Invalid status" | Use PAUSED not DRAFT |

## Next Steps
...
`;
}
```

### Step 3: Register Prompt

```typescript
// In packages/dv360-mcp/src/mcp-server/prompts/index.ts
import { myWorkflowPrompt, getMyWorkflowPromptMessage } from "./my-workflow.prompt.js";

export const promptRegistry: Map<string, PromptDefinition> = new Map([
  // ... existing prompts
  [myWorkflowPrompt.name, {
    prompt: myWorkflowPrompt,
    generateMessage: getMyWorkflowPromptMessage,
  }],
]);
```

## Prompt Message Guidelines

### Structure

```markdown
# Workflow Title

## Overview
Brief description of what this workflow accomplishes

## Context
- Parameter 1: {value}
- Parameter 2: {value}

## Step 1: Action Name

### Required Fields
- field1 (type): Description
- field2 (type): Description
  - ⚠️ **GOTCHA**: Platform-specific quirk

### Tool Call
\`\`\`
Tool: tool_name
Parameters:
{
  "param": "value"
}
\`\`\`

### Success Criteria
- ✅ Checkpoint 1
- ✅ Checkpoint 2

### Common Errors
| Error | Cause | Solution |
|-------|-------|----------|
| "Error message" | Why it happens | How to fix |

## Step 2: ...

## Troubleshooting
...

## Next Steps
...
```

### Best Practices

1. **Use ⚠️ GOTCHA callouts** for non-obvious platform rules
   ```markdown
   ⚠️ **GOTCHA**: Campaigns CANNOT use ENTITY_STATUS_DRAFT
   ```

2. **Provide exact tool call examples** with JSON syntax
   ```markdown
   \`\`\`
   Tool: create_entity
   Parameters:
   {
     "advertiserId": "12345",
     "entityType": "campaign"
   }
   \`\`\`
   ```

3. **Add success criteria checklists** after each step
   ```markdown
   - ✅ Response includes campaignId
   - ✅ Campaign is in PAUSED status
   ```

4. **Include common errors table** with solutions
   ```markdown
   | Error | Cause | Solution |
   |-------|-------|----------|
   | "DRAFT not allowed" | Used wrong status | Use PAUSED instead |
   ```

5. **Reference MCP Resources** for detailed schema info
   ```markdown
   Fetch entity-schema://campaign for full field documentation
   ```

6. **Keep tone instructional but friendly**
   - Use "You are guiding..." not "The user should..."
   - Use active voice: "Create the campaign" not "The campaign should be created"

## Testing Prompts

```bash
# Create test script
cat > tests/test-my-prompt.ts << 'EOF'
import { getMyWorkflowPromptMessage } from "../src/mcp-server/prompts/my-workflow.prompt.js";

const message = getMyWorkflowPromptMessage({ advertiserId: "12345" });
console.log(`Length: ${message.length} chars`);
console.log(message);
EOF

# Run test
npx tsx tests/test-my-prompt.ts
```

## Integration with Tools + Resources

```
User asks: "Create a DV360 campaign"
          ↓
AI invokes: full_campaign_setup_workflow (advertiserId=12345)
          ↓
Receives: 8KB markdown workflow guide
          ↓
AI fetches: entity-schema://campaign (via Resources)
          ↓
AI calls: create_entity (via Tools)
          ↓
Success: Campaign created with proper validation
```

## Recommended Prompts to Add

Based on common DV360 workflows:

1. **`bulk_update_workflow`**
   - Preview changes before execution
   - Safe bulk operations with rollback

2. **`troubleshoot_api_errors`**
   - DV360 error code → solution mapping
   - Common permission issues

3. **`entity_activation_workflow`**
   - Safe activation sequence (IO → Line Items → Campaign)
   - Budget validation gates

4. **`targeting_discovery_workflow`**
   - Finding valid targetingOptionIds
   - Building complex targeting logic

## Key Metrics

**Current Prompts:** 1
**Average Size:** ~9KB when invoked
**Context Cost:** 0KB when not invoked
**Build Status:** ✅ Clean

---

**Quick Links:**
- Implementation: `/docs/mcp-prompts-implementation.md`
- Example: `/packages/dv360-mcp/src/mcp-server/prompts/full-campaign-setup.prompt.ts`
- Test: `/packages/dv360-mcp/tests/test-prompt.ts`
