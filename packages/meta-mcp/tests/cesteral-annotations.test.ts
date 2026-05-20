// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";

describe("meta-mcp cesteral.* annotations (round 1)", () => {
  it("annotates meta_update_entity as a write contract with the canonical fields", () => {
    const cesteral = updateEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("write");
    expect(cesteral!.platform).toBe("meta_ads");
    expect(cesteral!.contractPlatformSlug).toBe("meta");
    expect(cesteral!.contractToolSlug).toBe("update_entity");
    expect(cesteral!.contractId).toBe("meta.update_entity.v1");
    expect(cesteral!.contractId).toBe(
      `${cesteral!.contractPlatformSlug}.${cesteral!.contractToolSlug}.v${cesteral!.schemaVersion}`
    );
    expect(cesteral!.schemaVersion).toBe(1);

    if (cesteral!.kind !== "write") throw new Error("expected write kind");
    // Multi-operation dispatcher: declares every canonical op the tool can express.
    expect(cesteral.operation).toEqual(
      expect.arrayContaining(["update_budget", "pause", "resume", "update_status", "update"])
    );
    expect(cesteral.entityKinds).toEqual(["campaign", "ad_set", "ad"]);
    expect(cesteral.entityIdArgs).toEqual(["entityId"]);
    expect(cesteral.readPartner.toolName).toBe("meta_get_entity");
    expect(cesteral.readPartner.argMap).toEqual({ entityId: "entityId" });
    // PR-C wires dry_run; PR-D wires before/after via the read partner.
    expect(cesteral.supportsDryRun).toBe(true);
    expect(cesteral.supportsBeforeAfterSnapshot).toBe(true);
    // Contract promises required by the governance admission layer.
    expect(cesteral.requiresValidation).toBe(true);
    expect(cesteral.requiresSimulation).toBe(true);
  });

  it("annotates meta_get_entity as a read contract with no operation/readPartner", () => {
    const cesteral = getEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("read");
    expect(cesteral!.platform).toBe("meta_ads");
    expect(cesteral!.contractPlatformSlug).toBe("meta");
    expect(cesteral!.contractToolSlug).toBe("get_entity");
    expect(cesteral!.contractId).toBe("meta.get_entity.v1");
    expect(cesteral!.schemaVersion).toBe(1);
    expect(cesteral!.entityKinds).toEqual(["campaign", "ad_set", "ad"]);
    expect(cesteral!.entityIdArgs).toEqual(["entityId"]);
    // Read kind has no operation/readPartner (TypeScript discriminator + runtime guard).
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
