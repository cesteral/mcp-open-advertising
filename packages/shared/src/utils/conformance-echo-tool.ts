// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Conformance Test Tools
 *
 * Tools required by the MCP conformance test harness (@modelcontextprotocol/conformance).
 * Each tool matches a specific conformance scenario by name and expected behavior.
 *
 * These are lightweight, stateless tools that can be safely included in all servers.
 */
import { z } from "zod";
import type { ToolDefinitionForFactory, ToolSdkContext } from "./tool-handler-factory.js";

// ---------------------------------------------------------------------------
// echo — general connectivity test
// ---------------------------------------------------------------------------

const echoInputSchema = z.object({
  message: z.string().describe("Message to echo back"),
});

export const echoTool: ToolDefinitionForFactory = {
  name: "echo",
  title: "Echo",
  description:
    "Echoes back the provided message. Used for connectivity testing and conformance validation.",
  inputSchema: echoInputSchema,
  annotations: { readOnlyHint: true },
  inputExamples: [{ label: "Echo hello", input: { message: "hello" } }],
  logic: async (input: z.infer<typeof echoInputSchema>) => {
    return input.message;
  },
  responseFormatter: (result: string) => [
    { type: "text" as const, text: result },
  ],
};

// ---------------------------------------------------------------------------
// test_simple_text — conformance scenario: tools-call
// ---------------------------------------------------------------------------

export const testSimpleTextTool: ToolDefinitionForFactory = {
  name: "test_simple_text",
  title: "Test Simple Text",
  description: "Returns a fixed text response. Used by MCP conformance tests.",
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  inputExamples: [{ label: "Simple text test", input: {} }],
  logic: async () => {
    return "This is a simple text response for testing.";
  },
  responseFormatter: (result: string) => [
    { type: "text" as const, text: result },
  ],
};

// ---------------------------------------------------------------------------
// test_tool_with_logging — conformance scenario: tools-call-with-logging
// Requires the server to have logging capability enabled and sendLoggingMessage
// wired through the McpServerLike interface.
// ---------------------------------------------------------------------------

export const testToolWithLoggingTool: ToolDefinitionForFactory = {
  name: "test_tool_with_logging",
  title: "Test Tool With Logging",
  description:
    "Sends structured log notifications during execution. Used by MCP conformance tests.",
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  inputExamples: [{ label: "Logging test", input: {} }],
  logic: async (_input: unknown, _context: unknown, sdkContext?: ToolSdkContext) => {
    const send = sdkContext?.sendLoggingMessage as
      | ((params: { level: string; logger?: string; data?: unknown }) => Promise<void>)
      | undefined;

    if (send) {
      await send({ level: "info", logger: "test_tool_with_logging", data: "Tool execution started" });
      await new Promise((r) => setTimeout(r, 50));
      await send({ level: "info", logger: "test_tool_with_logging", data: "Tool processing data" });
      await new Promise((r) => setTimeout(r, 50));
      await send({ level: "info", logger: "test_tool_with_logging", data: "Tool execution completed" });
    }

    return "Logging test completed successfully.";
  },
  responseFormatter: (result: string) => [
    { type: "text" as const, text: result },
  ],
};

// ---------------------------------------------------------------------------
// test_elicitation — conformance scenario: tools-call-elicitation
// ---------------------------------------------------------------------------

const testElicitationInputSchema = z.object({
  message: z.string().describe("The message to show the user"),
});

export const testElicitationTool: ToolDefinitionForFactory = {
  name: "test_elicitation",
  title: "Test Elicitation",
  description:
    "Requests user input via MCP elicitation. Used by MCP conformance tests.",
  inputSchema: testElicitationInputSchema,
  annotations: { readOnlyHint: true },
  inputExamples: [{ label: "Elicitation test", input: { message: "Please provide a value" } }],
  logic: async (
    input: z.infer<typeof testElicitationInputSchema>,
    _context: unknown,
    sdkContext?: ToolSdkContext,
  ) => {
    if (!sdkContext?.elicitInput) {
      return "Elicitation not supported by client.";
    }

    const result: { action: string; content?: unknown } = await sdkContext.elicitInput({
      message: input.message,
      requestedSchema: {
        type: "object",
        properties: {
          response: {
            type: "string",
            title: "Response",
            description: "Your response to the prompt",
          },
        },
        required: ["response"],
      },
    }) as any;

    return `Elicitation completed: action=${result.action}, content=${JSON.stringify(result.content ?? {})}`;
  },
  responseFormatter: (result: string) => [
    { type: "text" as const, text: result },
  ],
};

// ---------------------------------------------------------------------------
// test_elicitation_sep1034_defaults — conformance scenario
// ---------------------------------------------------------------------------

export const testElicitationSep1034DefaultsTool: ToolDefinitionForFactory = {
  name: "test_elicitation_sep1034_defaults",
  title: "Test Elicitation SEP-1034 Defaults",
  description:
    "Tests elicitation with default values for all primitive types. Used by MCP conformance tests.",
  inputSchema: z.object({}),
  inputExamples: [{ label: "SEP-1034 defaults test", input: {} }],
  annotations: { readOnlyHint: true },
  logic: async (_input: unknown, _context: unknown, sdkContext?: ToolSdkContext) => {
    if (!sdkContext?.elicitInput) {
      return "Elicitation not supported by client.";
    }

    const result: { action: string; content?: unknown } = await sdkContext.elicitInput({
      message: "Please confirm or modify the following default values:",
      requestedSchema: {
        type: "object",
        properties: {
          name: { type: "string", title: "Name", default: "John Doe" },
          age: { type: "integer", title: "Age", default: 30 },
          score: { type: "number", title: "Score", default: 95.5 },
          status: {
            type: "string",
            title: "Status",
            enum: ["active", "inactive", "pending"],
            default: "active",
          },
          verified: { type: "boolean", title: "Verified", default: true },
        },
        required: ["name", "age", "score", "status", "verified"],
      },
    }) as any;

    return `Elicitation completed: action=${result.action}, content=${JSON.stringify(result.content ?? {})}`;
  },
  responseFormatter: (result: string) => [
    { type: "text" as const, text: result },
  ],
};

// ---------------------------------------------------------------------------
// test_elicitation_sep1330_enums — conformance scenario
// ---------------------------------------------------------------------------

export const testElicitationSep1330EnumsTool: ToolDefinitionForFactory = {
  name: "test_elicitation_sep1330_enums",
  title: "Test Elicitation SEP-1330 Enums",
  description:
    "Tests all 5 enum variants in elicitation schemas. Used by MCP conformance tests.",
  inputSchema: z.object({}),
  inputExamples: [{ label: "SEP-1330 enums test", input: {} }],
  annotations: { readOnlyHint: true },
  logic: async (_input: unknown, _context: unknown, sdkContext?: ToolSdkContext) => {
    if (!sdkContext?.elicitInput) {
      return "Elicitation not supported by client.";
    }

    const result: { action: string; content?: unknown } = await sdkContext.elicitInput({
      message: "Please select values for each enum variant:",
      requestedSchema: {
        type: "object",
        properties: {
          // 1. Untitled single-select
          untitledSingle: {
            type: "string",
            enum: ["option1", "option2", "option3"],
          },
          // 2. Titled single-select (oneOf with const+title)
          titledSingle: {
            type: "string",
            oneOf: [
              { const: "value1", title: "First Option" },
              { const: "value2", title: "Second Option" },
              { const: "value3", title: "Third Option" },
            ],
          },
          // 3. Untitled multi-select
          untitledMulti: {
            type: "array",
            items: {
              type: "string",
              enum: ["option1", "option2", "option3"],
            },
          },
          // 4. Titled multi-select
          titledMulti: {
            type: "array",
            items: {
              anyOf: [
                { const: "value1", title: "First Choice" },
                { const: "value2", title: "Second Choice" },
                { const: "value3", title: "Third Choice" },
              ],
            },
          },
        },
        required: [
          "untitledSingle",
          "titledSingle",
          "untitledMulti",
          "titledMulti",
        ],
      },
    }) as any;

    return `Elicitation completed: action=${result.action}, content=${JSON.stringify(result.content ?? {})}`;
  },
  responseFormatter: (result: string) => [
    { type: "text" as const, text: result },
  ],
};

// ---------------------------------------------------------------------------
// All conformance tools — import this array in each server's tools/index.ts
// ---------------------------------------------------------------------------

export const conformanceTools: ToolDefinitionForFactory[] = [
  echoTool,
  testSimpleTextTool,
  testToolWithLoggingTool,
  testElicitationTool,
  testElicitationSep1034DefaultsTool,
  testElicitationSep1330EnumsTool,
];