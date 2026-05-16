// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";

describe("dv360-mcp cesteral.* annotations (round 1)", () => {
  it("annotates dv360_update_entity as a write contract with the canonical fields", () => {
    const cesteral = updateEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("write");
    expect(cesteral!.platform).toBe("dv360");
    expect(cesteral!.contractId).toBe("dv360.update_entity.v1");
    expect(cesteral!.schemaVersion).toBe(1);

    if (cesteral!.kind !== "write") throw new Error("expected write kind");
    expect(cesteral.operation).toEqual(
      expect.arrayContaining(["update_budget", "pause", "resume", "update_status", "update"])
    );
    // Round-1 governance scope is campaign / IO / line item; broader entity
    // coverage lands with later rounds.
    expect(cesteral.entityKinds).toEqual(["campaign", "insertion_order", "line_item"]);
    expect(cesteral.entityIdArgs).toEqual([
      "advertiserId",
      "campaignId",
      "insertionOrderId",
      "lineItemId",
    ]);
    expect(cesteral.readPartner.toolName).toBe("dv360_get_entity");
    expect(cesteral.readPartner.argMap).toMatchObject({
      advertiserId: "advertiserId",
      campaignId: "campaignId",
      insertionOrderId: "insertionOrderId",
      lineItemId: "lineItemId",
    });
    expect(cesteral.supportsDryRun).toBe(true);
    expect(cesteral.supportsBeforeAfterSnapshot).toBe(true);
  });

  it("annotates dv360_get_entity as a read contract", () => {
    const cesteral = getEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("read");
    expect(cesteral!.platform).toBe("dv360");
    expect(cesteral!.contractId).toBe("dv360.get_entity.v1");
    expect(cesteral!.schemaVersion).toBe(1);
    expect(cesteral!.entityKinds).toEqual(["campaign", "insertion_order", "line_item"]);
    expect(cesteral as unknown as { operation?: unknown }).not.toHaveProperty("operation");
    expect(cesteral as unknown as { readPartner?: unknown }).not.toHaveProperty("readPartner");
  });

  it("write tool's readPartner.toolName resolves to the annotated read tool", () => {
    const writeCesteral = updateEntityTool.annotations?.cesteral;
    if (!writeCesteral || writeCesteral.kind !== "write")
      throw new Error("expected write annotations");
    expect(writeCesteral.readPartner.toolName).toBe(getEntityTool.name);
  });
});
