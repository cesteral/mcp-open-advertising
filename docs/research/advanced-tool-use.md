# Advanced Tool Use — Anthropic API Research

> [!NOTE]
> **Reference Document.** This doc covers Anthropic beta API features (Tool Search, Programmatic Tool Calling, Tool Use Examples, Tool Runner). Beta APIs evolve — verify against current [Anthropic API documentation](https://docs.anthropic.com) before implementing. Last reviewed: February 2026.
> `inputExamples` is implemented across all tools. `defer_loading`, `allowed_callers`, and
> `betaZodTool` are researched but not used in this codebase.

> **Purpose**: Reference document for Cesteral Intelligence engineers building MCP tools and AI-driven workflows. Covers three advanced tool use features, the SDK tool runner, and design best practices.
>
> **Sources**: [Implement Tool Use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use) · [Tool Search](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/tool-search) · [Programmatic Tool Calling](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/programmatic-tool-calling) · [Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
>
> **Last updated**: 2026-02-24

---

## Table of Contents

1. [Tool Search Tool](#1-tool-search-tool)
2. [Programmatic Tool Calling (PTC)](#2-programmatic-tool-calling-ptc)
3. [Tool Use Examples (`input_examples`)](#3-tool-use-examples-input_examples)
4. [Tool Runner (SDK)](#4-tool-runner-sdk)
5. [Best Practices](#5-best-practices)

---

## 1. Tool Search Tool

Solves two problems at scale: **context bloat** (a typical multi-server MCP setup consumes ~55K tokens in tool definitions) and **tool selection accuracy** (degrades beyond 30-50 tools). Tool search typically reduces token usage by **over 85%**, loading only 3-5 tools per search.

### Two Variants

| Variant | Type Identifier                   | Query Format                                         |
| ------- | --------------------------------- | ---------------------------------------------------- |
| Regex   | `tool_search_tool_regex_20251119` | Python `re.search()` patterns (NOT natural language) |
| BM25    | `tool_search_tool_bm25_20251119`  | Natural language queries                             |

**Regex query examples**:

- `"weather"` — matches names/descriptions containing "weather"
- `"get_.*_data"` — matches `get_user_data`, `get_weather_data`
- `"database.*query|query.*database"` — OR patterns
- `"(?i)slack"` — case-insensitive search
- Maximum query length: **200 characters**

Both variants search tool names, descriptions, argument names, and argument descriptions.

### Deferred Tool Loading (`defer_loading`)

The key mechanism. Tools marked with `defer_loading: true` are excluded from the prompt and only loaded when Claude discovers them via search:

```json
{
  "name": "get_weather",
  "description": "Get current weather for a location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": { "type": "string" },
      "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
    },
    "required": ["location"]
  },
  "defer_loading": true
}
```

**Rules**:

- Tools without `defer_loading` are loaded into context immediately
- The tool search tool itself must **never** have `defer_loading: true`
- At least one tool must be non-deferred (HTTP 400 otherwise)
- Keep 3-5 most frequently used tools as non-deferred

### Quick Start (Python)

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=2048,
    messages=[{"role": "user", "content": "What is the weather in San Francisco?"}],
    tools=[
        # The search tool itself — always non-deferred
        {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
        # Deferred tools — only loaded when discovered
        {
            "name": "get_weather",
            "description": "Get the weather at a specific location",
            "input_schema": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["location"],
            },
            "defer_loading": True,
        },
        {
            "name": "search_files",
            "description": "Search through files in the workspace",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "file_types": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["query"],
            },
            "defer_loading": True,
        },
    ],
)
```

### Response Format

When Claude uses tool search, the response contains:

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I'll search for tools to help with the weather information."
    },
    {
      "type": "server_tool_use",
      "id": "srvtoolu_01ABC123",
      "name": "tool_search_tool_regex",
      "input": { "query": "weather" }
    },
    {
      "type": "tool_search_tool_result",
      "tool_use_id": "srvtoolu_01ABC123",
      "content": {
        "type": "tool_search_tool_search_result",
        "tool_references": [{ "type": "tool_reference", "tool_name": "get_weather" }]
      }
    },
    {
      "type": "text",
      "text": "I found a weather tool. Let me get the weather for San Francisco."
    },
    {
      "type": "tool_use",
      "id": "toolu_01XYZ789",
      "name": "get_weather",
      "input": { "location": "San Francisco", "unit": "fahrenheit" }
    }
  ],
  "stop_reason": "tool_use"
}
```

`tool_reference` blocks are automatically expanded into full tool definitions by the API. Discovered tools persist across subsequent turns without re-searching.

### MCP Integration

Requires `"mcp-client-2025-11-20"` beta header. Use `mcp_toolset` with `default_config`:

```python
response = client.beta.messages.create(
    model="claude-opus-4-6",
    betas=["mcp-client-2025-11-20"],
    max_tokens=2048,
    mcp_servers=[
        {"type": "url", "name": "database-server", "url": "https://mcp-db.example.com"}
    ],
    tools=[
        {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
        {
            "type": "mcp_toolset",
            "mcp_server_name": "database-server",
            "default_config": {"defer_loading": True},
            "configs": {
                "search_events": {"defer_loading": False}  # Override per-tool
            },
        },
    ],
    messages=[{"role": "user", "content": "What events are in my database?"}],
)
```

### Custom Tool Search Implementation

Return `tool_reference` blocks from any custom tool to dynamically inject deferred tools:

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_your_tool_id",
  "content": [{ "type": "tool_reference", "tool_name": "discovered_tool_name" }]
}
```

Every referenced tool must exist in the top-level `tools` array with `defer_loading: true`.

### Limits and Constraints

| Constraint                     | Value                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| Maximum tools in catalog       | 10,000                                                             |
| Search results per query       | 3-5 most relevant                                                  |
| Regex pattern max length       | 200 characters                                                     |
| Model support                  | Sonnet 4.0+, Opus 4.0+ only (no Haiku)                             |
| `input_examples` compatibility | NOT compatible                                                     |
| ZDR (Zero Data Retention)      | Server-side search is NOT ZDR-eligible; custom implementations are |

### Prompt Caching

Add `cache_control` breakpoints to tool definitions. Tool reference blocks are automatically expanded throughout entire conversation history, so Claude can reuse discovered tools in subsequent turns without re-searching.

### Usage Tracking

```json
{
  "usage": {
    "input_tokens": 1024,
    "output_tokens": 256,
    "server_tool_use": {
      "tool_search_requests": 2
    }
  }
}
```

### Error Codes

| Error Code          | Description                     |
| ------------------- | ------------------------------- |
| `too_many_requests` | Rate limit exceeded             |
| `invalid_pattern`   | Malformed regex                 |
| `pattern_too_long`  | Exceeds 200 char limit          |
| `unavailable`       | Service temporarily unavailable |

---

## 2. Programmatic Tool Calling (PTC)

Allows Claude to write Python code that calls tools programmatically within a code execution container. Reduces latency for multi-tool workflows and decreases token consumption by filtering/processing data before it reaches the context window.

### Model Compatibility

| Model                                            | Tool Version              |
| ------------------------------------------------ | ------------------------- |
| Claude Opus 4.6 (`claude-opus-4-6`)              | `code_execution_20260120` |
| Claude Sonnet 4.6 (`claude-sonnet-4-6`)          | `code_execution_20260120` |
| Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) | `code_execution_20260120` |
| Claude Opus 4.5 (`claude-opus-4-5-20251101`)     | `code_execution_20260120` |

### How It Works

1. Claude writes Python code that invokes tools as functions, potentially including loops, conditionals, and data processing
2. Claude runs this code in a sandboxed container via code execution
3. When a tool function is called, code execution pauses and the API returns a `tool_use` block
4. You provide the tool result, and code execution continues (intermediate results are **not** loaded into Claude's context window)
5. Once all code execution completes, Claude receives the final output and continues

### The `allowed_callers` Field

```json
{
  "name": "query_database",
  "description": "Execute a SQL query against the database. Returns JSON array of row objects.",
  "input_schema": {
    "type": "object",
    "properties": {
      "sql": { "type": "string", "description": "SQL query to execute" }
    },
    "required": ["sql"]
  },
  "allowed_callers": ["code_execution_20260120"]
}
```

**Possible values**:

- `["direct"]` — Only Claude can call directly (default if omitted)
- `["code_execution_20260120"]` — Only callable from within code execution
- `["direct", "code_execution_20260120"]` — Both contexts

> **Best practice**: Choose either `["direct"]` or `["code_execution_20260120"]` for each tool, not both, to give Claude clearer guidance.

### The `caller` Field in Responses

Direct invocation:

```json
{
  "type": "tool_use",
  "id": "toolu_abc123",
  "name": "query_database",
  "input": { "sql": "SELECT ..." },
  "caller": { "type": "direct" }
}
```

Programmatic invocation:

```json
{
  "type": "tool_use",
  "id": "toolu_xyz789",
  "name": "query_database",
  "input": { "sql": "SELECT ..." },
  "caller": {
    "type": "code_execution_20260120",
    "tool_id": "srvtoolu_abc123"
  }
}
```

The `tool_id` references the code execution tool that made the programmatic call.

### Quick Start (Python)

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    messages=[
        {
            "role": "user",
            "content": "Query sales data for the West, East, and Central regions, "
                       "then tell me which region had the highest revenue",
        }
    ],
    tools=[
        {"type": "code_execution_20260120", "name": "code_execution"},
        {
            "name": "query_database",
            "description": "Execute a SQL query against the sales database. "
                           "Returns a list of rows as JSON objects.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "sql": {"type": "string", "description": "SQL query to execute"}
                },
                "required": ["sql"],
            },
            "allowed_callers": ["code_execution_20260120"],
        },
    ],
)
```

### Quick Start (TypeScript)

```typescript
import { Anthropic } from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const response = await anthropic.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 4096,
  messages: [
    {
      role: "user",
      content:
        "Query sales data for the West, East, and Central regions, " +
        "then tell me which region had the highest revenue",
    },
  ],
  tools: [
    { type: "code_execution_20260120", name: "code_execution" },
    {
      name: "query_database",
      description:
        "Execute a SQL query against the sales database. " +
        "Returns a list of rows as JSON objects.",
      input_schema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query to execute" },
        },
        required: ["sql"],
      },
      allowed_callers: ["code_execution_20260120"],
    },
  ],
});
```

### Container Lifecycle

- New container per session unless you reuse an existing one
- Expires after approximately **4.5 minutes** of inactivity (subject to change)
- Container ID returned in responses via the `container` field
- Pass the container ID to maintain state across requests

> **Warning**: When a tool is called programmatically and the container is waiting for your tool result, you must respond before the container expires. Monitor the `expires_at` field.

### Workflow: Providing Tool Results

When Claude invokes a tool from code execution, you receive a response with `stop_reason: "tool_use"`. Provide the result and **reuse the container**:

```python
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    container="container_xyz789",  # Reuse the container
    messages=[
        {"role": "user", "content": "...original prompt..."},
        {"role": "assistant", "content": [
            # ...server_tool_use block, tool_use block from previous response...
        ]},
        {"role": "user", "content": [
            {
                "type": "tool_result",
                "tool_use_id": "toolu_def456",
                "content": '[{"customer_id": "C1", "revenue": 45000}]',
            }
        ]},
    ],
    tools=[...],
)
```

**Message formatting restriction**: When responding to programmatic tool calls, the user message must contain **only** `tool_result` blocks. No text content allowed. This restriction does not apply to regular (direct) tool calls.

### Advanced Patterns

**Batch processing with loops** — N tool calls in 1 model round-trip:

```python
# Claude writes this code in the sandbox
regions = ["West", "East", "Central", "North", "South"]
results = {}
for region in regions:
    data = await query_database(f"SELECT SUM(revenue) FROM sales WHERE region='{region}'")
    results[region] = sum(row["revenue"] for row in data)

top_region = max(results.items(), key=lambda x: x[1])
print(f"Top region: {top_region[0]} with ${top_region[1]:,} in revenue")
```

**Early termination**:

```python
endpoints = ["us-east", "eu-west", "apac"]
for endpoint in endpoints:
    status = await check_health(endpoint)
    if status == "healthy":
        print(f"Found healthy endpoint: {endpoint}")
        break  # Stop early, don't check remaining
```

**Conditional tool selection**:

```python
file_info = await get_file_info(path)
if file_info["size"] < 10000:
    content = await read_full_file(path)
else:
    content = await read_file_summary(path)
print(content)
```

**Data filtering**:

```python
logs = await fetch_logs(server_id)
errors = [log for log in logs if "ERROR" in log]
print(f"Found {len(errors)} errors")
for error in errors[-10:]:  # Only return last 10 errors
    print(error)
```

### Token Efficiency

- Tool results from programmatic calls are **not added to Claude's context** — only the final code output
- Intermediate processing happens in code — filtering, aggregation, etc. don't consume model tokens
- Multiple tool calls in one code execution reduces overhead vs separate model turns
- Calling 10 tools programmatically uses **~10x fewer tokens** than calling them directly
- Token counting: tool results from programmatic invocations do not count toward input/output token usage

### Feature Incompatibilities

- **Structured outputs**: Tools with `strict: true` are NOT supported with programmatic calling
- **Tool choice**: Cannot force programmatic calling via `tool_choice`
- **Parallel tool use**: `disable_parallel_tool_use: true` is NOT supported
- **MCP connector tools**: Cannot currently be called programmatically
- **ZDR**: NOT covered by Zero Data Retention

### Error Handling

| Error                 | Description                              | Solution                |
| --------------------- | ---------------------------------------- | ----------------------- |
| `invalid_tool_input`  | Input doesn't match schema               | Validate `input_schema` |
| `tool_not_allowed`    | Tool doesn't allow requested caller type | Check `allowed_callers` |
| `missing_beta_header` | Required beta header not provided        | Add required headers    |

Container timeout produces a `TimeoutError` in stderr. Claude will typically retry.

### Alternative Implementations

| Approach                 | Pros                             | Cons                                    | Use When                                          |
| ------------------------ | -------------------------------- | --------------------------------------- | ------------------------------------------------- |
| **Anthropic-managed**    | Safe, easy, optimized for Claude | Uses Anthropic's infra                  | Default choice for API users                      |
| **Client-side direct**   | Simple, full control             | Executes untrusted code outside sandbox | Can safely execute arbitrary code                 |
| **Self-managed sandbox** | Safe, full control               | Complex to build and maintain           | Security-critical, Anthropic solution doesn't fit |

---

## 3. Tool Use Examples (`input_examples`)

An optional field on tool definitions that provides concrete examples of valid inputs to help Claude understand complex tools.

### Basic Usage

```python
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    tools=[{
        "name": "get_weather",
        "description": "Get the current weather in a given location",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city and state, e.g. San Francisco, CA",
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"],
                    "description": "The unit of temperature",
                },
            },
            "required": ["location"],
        },
        "input_examples": [
            {"location": "San Francisco, CA", "unit": "fahrenheit"},
            {"location": "Tokyo, Japan", "unit": "celsius"},
            {"location": "New York, NY"},  # Demonstrates 'unit' is optional
        ],
    }],
    messages=[{"role": "user", "content": "What's the weather like in San Francisco?"}],
)
```

```typescript
const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  tools: [
    {
      name: "get_weather",
      description: "Get the current weather in a given location",
      input_schema: {
        type: "object",
        properties: {
          location: { type: "string", description: "The city and state" },
          unit: { type: "string", enum: ["celsius", "fahrenheit"] },
        },
        required: ["location"],
      },
      input_examples: [
        { location: "San Francisco, CA", unit: "fahrenheit" },
        { location: "Tokyo, Japan", unit: "celsius" },
        { location: "New York, NY" },
      ],
    },
  ],
  messages: [{ role: "user", content: "What's the weather like in San Francisco?" }],
});
```

### Requirements and Limitations

- **Schema validation**: Each example must be valid according to the tool's `input_schema`. Invalid examples return a 400 error.
- **Not supported for server-side tools**: Only user-defined tools can have `input_examples`.
- **Token cost**: ~20-50 tokens for simple examples, ~100-200 tokens for complex nested objects.
- **Not compatible with tool search**: Cannot use `input_examples` and tool search together.

### When to Use

- Complex tools with nested objects or optional parameters
- Format-sensitive parameters where descriptions alone are ambiguous
- Tools where showing 2-3 examples is clearer than a longer description

> Prioritize clear descriptions first. Only add `input_examples` when descriptions alone aren't sufficient for complex tools.

---

## 4. Tool Runner (SDK)

The tool runner provides an out-of-the-box solution for executing tools with Claude. Instead of manually handling the tool call loop, it automatically executes tools, handles the request/response cycle, manages conversation state, and provides type safety.

> **Status**: Beta. Available in [Python](https://github.com/anthropics/anthropic-sdk-python/blob/main/tools.md), [TypeScript](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md#tool-helpers), and [Ruby](https://github.com/anthropics/anthropic-sdk-ruby/blob/main/helpers.md#3-auto-looping-tool-runner-beta) SDKs.

### Python — `@beta_tool` Decorator

```python
import anthropic
import json
from anthropic import beta_tool

client = anthropic.Anthropic()

@beta_tool
def get_weather(location: str, unit: str = "fahrenheit") -> str:
    """Get the current weather in a given location.

    Args:
        location: The city and state, e.g. San Francisco, CA
        unit: Temperature unit, either 'celsius' or 'fahrenheit'
    """
    # In production, call a weather API here
    return json.dumps({"temperature": "20C", "condition": "Sunny"})

@beta_tool
def calculate_sum(a: int, b: int) -> str:
    """Add two numbers together.

    Args:
        a: First number
        b: Second number
    """
    return str(a + b)

# Run the tool loop
runner = client.beta.messages.tool_runner(
    model="claude-opus-4-6",
    max_tokens=1024,
    tools=[get_weather, calculate_sum],
    messages=[
        {"role": "user", "content": "What's the weather in Paris? Also, what's 15 + 27?"}
    ],
)
for message in runner:
    print(message.content[0].text)
```

The decorator inspects function arguments and docstring to extract a JSON schema. For async: use `@beta_async_tool` with `async def`.

### TypeScript — `betaZodTool()` (Recommended)

Requires Zod 3.25.0+:

```typescript
import { Anthropic } from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const anthropic = new Anthropic();

const getWeatherTool = betaZodTool({
  name: "get_weather",
  description: "Get the current weather in a given location",
  inputSchema: z.object({
    location: z.string().describe("The city and state, e.g. San Francisco, CA"),
    unit: z.enum(["celsius", "fahrenheit"]).default("fahrenheit").describe("Temperature unit"),
  }),
  run: async (input) => {
    return JSON.stringify({ temperature: "20C", condition: "Sunny" });
  },
});

const runner = anthropic.beta.messages.toolRunner({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  tools: [getWeatherTool],
  messages: [{ role: "user", content: "What's the weather like in Paris?" }],
});

for await (const message of runner) {
  console.log(message.content[0].text);
}
```

### TypeScript — `betaTool()` (JSON Schema, No Zod)

```typescript
import { Anthropic } from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";

const calculateSumTool = betaTool({
  name: "calculate_sum",
  description: "Add two numbers together",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number", description: "First number" },
      b: { type: "number", description: "Second number" },
    },
    required: ["a", "b"],
  },
  run: async (input) => String(input.a + input.b),
});
```

> With `betaTool()`, input is NOT validated at runtime. Perform validation inside `run` if needed.

### Getting the Final Message Directly

```python
# Python
final_message = runner.until_done()
```

```typescript
// TypeScript
const finalMessage = await runner;
```

```ruby
# Ruby
all_messages = runner.run_until_finished
```

### Streaming

```python
# Python
runner = client.beta.messages.tool_runner(
    model="claude-opus-4-6",
    max_tokens=1024,
    tools=[calculate_sum],
    messages=[{"role": "user", "content": "What is 15 + 27?"}],
    stream=True,
)
for message_stream in runner:
    for event in message_stream:
        print("event:", event)
    print("message:", message_stream.get_final_message())
```

```typescript
// TypeScript
const runner = anthropic.beta.messages.toolRunner({
  model: "claude-opus-4-6",
  max_tokens: 1000,
  tools: [getWeatherTool],
  messages: [{ role: "user", content: "What is the weather in San Francisco?" }],
  stream: true,
});

for await (const messageStream of runner) {
  for await (const event of messageStream) {
    console.log("event:", event);
  }
  console.log("message:", await messageStream.finalMessage());
}
```

### Error Interception

Tool errors are passed back to Claude by default. To intercept:

```python
for message in runner:
    tool_response = runner.generate_tool_call_response()
    if tool_response:
        for block in tool_response.content:
            if block.is_error:
                raise RuntimeError(f"Tool failed: {json.dumps(block.content)}")
```

```typescript
for await (const message of runner) {
  const toolResultMessage = await runner.generateToolResponse();
  if (toolResultMessage) {
    for (const block of toolResultMessage.content) {
      if (block.type === "tool_result" && block.is_error) {
        throw new Error(`Tool failed: ${JSON.stringify(block.content)}`);
      }
    }
  }
}
```

### Modifying Tool Results

Add metadata like `cache_control` before results are sent back to Claude:

```python
for message in runner:
    tool_response = runner.generate_tool_call_response()
    if tool_response:
        for block in tool_response.content:
            if block.type == "tool_result":
                block.cache_control = {"type": "ephemeral"}
        runner.append_messages(message, tool_response)
```

### Advanced Request Customization

```python
# Python
runner.set_messages_params(
    lambda params: {**params, "max_tokens": 2048}
)
runner.append_messages(
    {"role": "user", "content": "Please be concise."}
)
```

```typescript
// TypeScript
runner.setMessagesParams((params) => ({
  ...params,
  max_tokens: 2048,
}));
runner.pushMessages({ role: "user", content: "Please be concise." });
```

### Debugging

Set `ANTHROPIC_LOG=info` or `ANTHROPIC_LOG=debug` for full stack traces when tools fail.

### Automatic Compaction

The tool runner supports automatic [compaction](https://docs.anthropic.com/en/docs/build-with-claude/context-editing#client-side-compaction-sdk), which generates summaries when token usage exceeds a threshold. This allows long-running agentic tasks to continue beyond context window limits.

---

## 5. Best Practices

### Tool Design

- **Provide extremely detailed descriptions** — Aim for 3-4+ sentences. Explain what the tool does, when to use it, what each parameter means, caveats/limitations.
- **Consolidate related operations** — Rather than `create_pr`, `review_pr`, `merge_pr`, group into one tool with an `action` parameter.
- **Use meaningful namespacing** — Prefix with service: `github_list_prs`, `slack_send_message`. Critical when using tool search.
- **Return high-signal data** — Return semantic, stable identifiers (slugs, UUIDs), not opaque internal references. Only include fields Claude needs.
- **Return structured data** — JSON or easily parseable formats, especially for PTC where Claude deserializes in code.

### Token Cost Reference

Tool use system prompt adds **346 tokens** (auto/none) or **313 tokens** (any/tool) for Claude 4.x models.

Each tool definition adds additional tokens. `input_examples` add ~20-50 tokens (simple) to ~100-200 tokens (complex nested objects).

### `tool_choice` Parameter

| Value  | Behavior                                                            |
| ------ | ------------------------------------------------------------------- |
| `auto` | Claude decides (default when `tools` provided)                      |
| `any`  | Must use one of the provided tools                                  |
| `tool` | Must use a specific tool: `{"type": "tool", "name": "get_weather"}` |
| `none` | Prevents tool use (default when no `tools` provided)                |

> `any` and `tool` are NOT compatible with extended thinking. Only `auto` and `none` work.

Combine `tool_choice: {"type": "any"}` with `strict: true` for guaranteed schema-conforming tool calls.

### Parallel Tool Use

By default, Claude may use multiple tools per turn. All `tool_use` blocks come in a single assistant message; all `tool_result` blocks must go in a single subsequent user message.

**System prompt to maximize parallel tool use** (Claude 4 models):

```text
<use_parallel_tool_calls>
For maximum efficiency, whenever you perform multiple independent operations, invoke all relevant tools simultaneously rather than sequentially. Prioritize calling tools in parallel whenever possible.
</use_parallel_tool_calls>
```

Control with `disable_parallel_tool_use: true`:

- With `auto` = at most one tool
- With `any`/`tool` = exactly one tool

### When to Use Each Feature

| Feature                       | Use When                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool Search**               | 10+ tools, definitions consuming >10K tokens, accuracy issues with large sets, MCP systems with 200+ tools                                                       |
| **Programmatic Tool Calling** | Processing large datasets needing aggregates, multi-step workflows with 3+ dependent calls, data filtering/transformation, parallel operations across many items |
| **`input_examples`**          | Complex tools with nested objects, format-sensitive parameters, ambiguous usage patterns                                                                         |
| **Tool Runner**               | Most implementations — removes boilerplate of manual tool call loops                                                                                             |

### Layering Strategy

These features compose well:

1. **Tool Search** reduces the catalog to 3-5 relevant tools
2. **PTC** lets Claude chain those tools with programmatic logic (loops, conditionals, data processing)
3. **`input_examples`** help Claude use complex tools correctly once discovered
4. **Tool Runner** manages the entire loop automatically in your application code

### Formatting Rules (Common Pitfalls)

- Tool result blocks must **immediately follow** their corresponding tool use blocks
- In a user message containing tool results, `tool_result` blocks must come **first** — text after
- For parallel tools: **all** tool results in a **single** user message (NOT separate messages)
- For PTC: user messages responding to programmatic calls must contain **only** `tool_result` blocks (no text at all)

### Error Handling

- Return instructive error messages: not `"failed"` but `"Rate limit exceeded. Retry after 60 seconds."`
- Set `is_error: true` on tool results when the tool execution errored
- Claude retries invalid tool names 2-3 times before giving up — use `strict: true` to eliminate this entirely
- For PTC container timeouts: monitor `expires_at`, implement tool execution timeouts, break long operations into smaller chunks
