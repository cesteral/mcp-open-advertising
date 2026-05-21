// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";

describe("cm360-mcp cesteral.* annotations (round 4)", () => {
  it("annotates cm360_update_entity as a write contract with the canonical fields", () => {
    const cesteral = updateEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("write");
    expect(cesteral!.platform).toBe("cm360");
    expect(cesteral!.contractPlatformSlug).toBe("cm360");
    expect(cesteral!.contractToolSlug).toBe("update_entity");
    expect(cesteral!.contractId).toBe("cm360.update_entity.v1");
    expect(cesteral!.contractId).toBe(
      `${cesteral!.contractPlatformSlug}.${cesteral!.contractToolSlug}.v${cesteral!.schemaVersion}`
    );
    expect(cesteral!.schemaVersion).toBe(1);

    if (cesteral!.kind !== "write") throw new Error("expected write kind");
    // Multi-operation dispatcher: every value is in the contract-schema
    // writeOperationSchema enum.
    expect(cesteral.operation).toEqual(
      expect.arrayContaining(["update_budget", "pause", "resume", "update_status", "update"])
    );
    // campaign + ad — the CM360 entities carrying a canonical status.
    expect(cesteral.entityKinds).toEqual(["campaign", "ad"]);
    expect(cesteral.entityIdArgs).toEqual(["entityId"]);
    expect(cesteral.readPartner.toolName).toBe("cm360_get_entity");
    expect(cesteral.readPartner.argMap).toEqual({
      profileId: "profileId",
      entityType: "entityType",
      entityId: "entityId",
    });
    // R4-U2: symbolic-apply dry-run + before/after capture.
    expect(cesteral.supportsDryRun).toBe(true);
    expect(cesteral.supportsBeforeAfterSnapshot).toBe(true);
    // Contract promises required by the governance admission layer.
    expect(cesteral.requiresValidation).toBe(true);
    expect(cesteral.requiresSimulation).toBe(true);
  });

  it("annotates cm360_get_entity as a read contract with no operation/readPartner", () => {
    const cesteral = getEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("read");
    expect(cesteral!.platform).toBe("cm360");
    expect(cesteral!.contractPlatformSlug).toBe("cm360");
    expect(cesteral!.contractToolSlug).toBe("get_entity");
    expect(cesteral!.contractId).toBe("cm360.get_entity.v1");
    expect(cesteral!.schemaVersion).toBe(1);
    expect(cesteral!.entityKinds).toEqual(["campaign", "ad"]);
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
    expect(shape).toHaveProperty("dispatchedCapability");
  });
});
