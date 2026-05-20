// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";

describe("amazon-dsp-mcp cesteral.* annotations (round 2)", () => {
  it("annotates amazon_dsp_update_entity as a write contract with the canonical fields", () => {
    const cesteral = updateEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("write");
    expect(cesteral!.platform).toBe("amazon_dsp");
    expect(cesteral!.contractId).toBe("amazon_dsp.update_entity.v1");
    expect(cesteral!.schemaVersion).toBe(1);

    if (cesteral!.kind !== "write") throw new Error("expected write kind");
    // Multi-operation dispatcher: every value is in the contract-schema
    // writeOperationSchema enum.
    expect(cesteral.operation).toEqual(
      expect.arrayContaining(["update_budget", "pause", "resume", "update_status", "update"])
    );
    // order (campaign-equivalent) + line_item (ad-group-equivalent).
    expect(cesteral.entityKinds).toEqual(["order", "line_item"]);
    expect(cesteral.entityIdArgs).toEqual(["entityId"]);
    expect(cesteral.readPartner.toolName).toBe("amazon_dsp_get_entity");
    expect(cesteral.readPartner.argMap).toEqual({
      profileId: "profileId",
      entityId: "entityId",
    });
    // R2-U4: symbolic-apply dry-run + before/after capture.
    expect(cesteral.supportsDryRun).toBe(true);
    expect(cesteral.supportsBeforeAfterSnapshot).toBe(true);
  });

  it("annotates amazon_dsp_get_entity as a read contract with no operation/readPartner", () => {
    const cesteral = getEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("read");
    expect(cesteral!.platform).toBe("amazon_dsp");
    expect(cesteral!.contractId).toBe("amazon_dsp.get_entity.v1");
    expect(cesteral!.schemaVersion).toBe(1);
    expect(cesteral!.entityKinds).toEqual(["order", "line_item"]);
    expect(cesteral!.entityIdArgs).toEqual(["entityId"]);
    expect(cesteral as unknown as { operation?: unknown }).not.toHaveProperty("operation");
    expect(cesteral as unknown as { readPartner?: unknown }).not.toHaveProperty("readPartner");
  });

  it("write tool's readPartner.toolName resolves to the annotated read tool", () => {
    const writeCesteral = updateEntityTool.annotations?.cesteral;
    if (!writeCesteral || writeCesteral.kind !== "write")
      throw new Error("expected write annotations");
    expect(writeCesteral.readPartner.toolName).toBe(getEntityTool.name);
  });

  it("declares dryRun / before / after on the write tool's outputSchema", () => {
    const shape = (updateEntityTool.outputSchema as { shape: Record<string, unknown> }).shape;
    expect(shape).toHaveProperty("dryRun");
    expect(shape).toHaveProperty("before");
    expect(shape).toHaveProperty("after");
  });
});
