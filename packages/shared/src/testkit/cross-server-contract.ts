// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { getObjectShape } from "../utils/conformance/conformance-test-helpers.js";
import {
  getBoundedReportViewOutputMissingKeys,
  isBoundedReportViewInputSchema,
} from "../utils/reporting/report-view.js";

/**
 * The part of a tool definition the fleet contract inspects. Server tool
 * definitions are structurally assignable to it; fields are `unknown` because
 * the suite is what asserts their shape.
 */
export interface ContractTool {
  name: string;
  description: string;
  title?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
  inputExamples?: unknown;
  annotations?: { readOnlyHint?: unknown; destructiveHint?: unknown };
  logic?: unknown;
  responseFormatter?: unknown;
}

/**
 * One tool the server must register, written without the platform prefix.
 * - a string: the tool `<prefix><name>` must exist
 * - a string array: at least one of those `<prefix><name>` tools must exist
 * - `{ nameIncludes }`: at least one tool name must contain one of the fragments
 */
export type RequiredTool =
  | string
  | readonly string[]
  | { readonly nameIncludes: readonly string[] };

/**
 * The tools every full entity-CRUD server (DV360, Google Ads, LinkedIn, Meta,
 * TikTok, TTD) must register.
 */
export const ENTITY_CRUD_TOOLS: readonly RequiredTool[] = [
  "list_entities",
  "get_entity",
  "create_entity",
  "update_entity",
  ["delete_entity", "remove_entity"],
  "bulk_update_status",
  { nameIncludes: ["adjust_bids", "adjust_line_item_bids"] },
  "validate_entity",
];

export interface CrossServerContractOptions {
  tools: readonly ContractTool[];
  /** Platform tool prefix including the trailing underscore, e.g. `dv360_`. */
  prefix: string;
  /** Tools the server must register: its fleet-contract surface. */
  requiredTools: readonly RequiredTool[];
  /**
   * Tool names (without the prefix) that must carry `destructiveHint: true`.
   * Omit for servers that do not pin any.
   */
  destructiveTools?: readonly string[];
}

const CANONICAL_BULK_TOOL = /_(bulk_update_status|bulk_create_entities|bulk_update_entities)$/;

function describeRequiredTools(options: CrossServerContractOptions): void {
  const { tools, prefix, requiredTools } = options;
  const toolNames = tools.map((t) => t.name);
  describe("required tool categories", () => {
    for (const required of requiredTools) {
      if (typeof required === "string") {
        it(`has ${required} tool`, () => {
          expect(toolNames).toContain(`${prefix}${required}`);
        });
      } else if ("nameIncludes" in required) {
        it(`has a tool whose name includes ${required.nameIncludes.join(" or ")}`, () => {
          expect(toolNames.some((n) => required.nameIncludes.some((f) => n.includes(f)))).toBe(
            true
          );
        });
      } else {
        it(`has ${required.join(" or ")} tool`, () => {
          expect(required.some((name) => toolNames.includes(`${prefix}${name}`))).toBe(true);
        });
      }
    }
  });
}

function describeToolStructure(options: CrossServerContractOptions): void {
  const { tools } = options;
  describe("tool structure requirements", () => {
    for (const tool of tools) {
      describe(tool.name, () => {
        it("has description longer than 10 chars", () => {
          expect(tool.description.length).toBeGreaterThan(10);
        });

        it("has title", () => {
          expect(typeof tool.title).toBe("string");
          expect((tool.title as string).length).toBeGreaterThan(0);
        });

        it("has inputSchema with parse method", () => {
          expect(tool.inputSchema).toBeDefined();
          expect(typeof (tool.inputSchema as { parse?: unknown }).parse).toBe("function");
        });

        it("has at least 1 inputExample", () => {
          expect(tool.inputExamples).toBeDefined();
          expect((tool.inputExamples as unknown[]).length).toBeGreaterThanOrEqual(1);
        });

        it("has annotations with readOnlyHint", () => {
          expect(tool.annotations).toBeDefined();
          expect(typeof tool.annotations?.readOnlyHint).toBe("boolean");
        });

        it("has logic function", () => {
          expect(typeof tool.logic).toBe("function");
        });

        it("has responseFormatter function", () => {
          expect(typeof tool.responseFormatter).toBe("function");
        });

        if (CANONICAL_BULK_TOOL.test(tool.name)) {
          it("canonical bulk tools expose results, successCount and failureCount", () => {
            expect(tool.outputSchema).toBeDefined();
            const shape = getObjectShape(tool.outputSchema);
            expect(shape).not.toBeNull();
            expect(shape).toHaveProperty("results");
            expect(shape).toHaveProperty("successCount");
            expect(shape).toHaveProperty("failureCount");
            expect(shape).toHaveProperty("timestamp");
          });
        }
      });
    }
  });
}

function describeDestructiveTools(options: CrossServerContractOptions): void {
  const { tools, prefix, destructiveTools } = options;
  if (!destructiveTools?.length) return;
  describe("mutating tool safety metadata", () => {
    for (const name of destructiveTools) {
      it(`marks ${prefix}${name} as destructive`, () => {
        expect(tools.find((t) => t.name === `${prefix}${name}`)?.annotations?.destructiveHint).toBe(
          true
        );
      });
    }
  });
}

function describeBoundedReportView(tools: readonly ContractTool[]): void {
  describe("bounded report-view contract", () => {
    const reportTools = tools.filter((t) => isBoundedReportViewInputSchema(t.inputSchema));

    if (reportTools.length === 0) {
      it("has no bounded report-view tools registered", () => {
        expect(reportTools).toEqual([]);
      });
    } else {
      for (const tool of reportTools) {
        it(`${tool.name} output schema includes bounded report-view fields`, () => {
          expect(getBoundedReportViewOutputMissingKeys(tool.outputSchema)).toEqual([]);
        });
      }
    }
  });
}

/**
 * The fleet-wide cross-server contract, run against one server's tool registry:
 * the tools it must register, the metadata every tool must carry, the bulk-tool
 * output shape, the destructive-hint pins, and the bounded report-view schema.
 * What genuinely differs per server is a parameter; anything else a server
 * wants to pin stays a local test beside the call.
 */
export function describeCrossServerContract(options: CrossServerContractOptions): void {
  describe("Cross-server contract compliance", () => {
    describeRequiredTools(options);
    describeToolStructure(options);
    describeDestructiveTools(options);
  });
  describeBoundedReportView(options.tools);
}
