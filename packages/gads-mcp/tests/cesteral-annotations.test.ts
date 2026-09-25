// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { resolveTokenMode } from "@cesteral/shared";
import { allTools } from "../src/mcp-server/tools/index.js";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";

describe("gads-mcp cesteral.* annotations (round 2)", () => {
  it("annotates gads_update_entity as a write contract with the canonical fields", () => {
    const cesteral = updateEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("write");
    expect(cesteral!.platform).toBe("google_ads");
    expect(cesteral!.contractPlatformSlug).toBe("google_ads");
    expect(cesteral!.contractToolSlug).toBe("update_entity");
    expect(cesteral!.contractId).toBe("google_ads.update_entity.v1");
    expect(cesteral!.contractId).toBe(
      `${cesteral!.contractPlatformSlug}.${cesteral!.contractToolSlug}.v${cesteral!.schemaVersion}`
    );
    expect(cesteral!.schemaVersion).toBe(1);

    if (cesteral!.kind !== "write") throw new Error("expected write kind");
    // Multi-operation dispatcher: declares every canonical op the tool can
    // express. Every value is in the contract-schema writeOperationSchema enum.
    expect(cesteral.operation).toEqual(
      expect.arrayContaining(["update_budget", "pause", "resume", "update_status", "update"])
    );
    // Governed scope: campaign / ad_group / campaign_budget. ad / keyword /
    // asset are intentionally out of scope (see the annotation comment).
    expect(cesteral.entityKinds).toEqual(["campaign", "ad_group", "campaign_budget"]);
    expect(cesteral.entityIdArgs).toEqual(["customerId", "entityId"]);
    expect(cesteral.readPartner.toolName).toBe("gads_get_entity");
    expect(cesteral.readPartner.argMap).toEqual({
      entityType: "entityType",
      customerId: "customerId",
      entityId: "entityId",
    });
    // R2-U3: native validateOnly dry-run + before/after capture.
    expect(cesteral.supportsDryRun).toBe(true);
    expect(cesteral.supportsBeforeAfterSnapshot).toBe(true);
    // Contract promises required by the governance admission layer.
    expect(cesteral.requiresValidation).toBe(true);
    expect(cesteral.requiresSimulation).toBe(true);
  });

  it("annotates gads_get_entity as a read contract with no operation/readPartner", () => {
    const cesteral = getEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("read");
    expect(cesteral!.platform).toBe("google_ads");
    expect(cesteral!.contractPlatformSlug).toBe("google_ads");
    expect(cesteral!.contractToolSlug).toBe("get_entity");
    expect(cesteral!.contractId).toBe("google_ads.get_entity.v1");
    expect(cesteral!.schemaVersion).toBe(1);
    expect(cesteral!.entityKinds).toEqual(["campaign", "ad_group", "campaign_budget"]);
    expect(cesteral!.entityIdArgs).toEqual(["customerId", "entityId"]);
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

describe("gads-mcp contract namespace (#235)", () => {
  const governed = allTools.flatMap((tool) => {
    const cesteral = (tool.annotations as { cesteral?: Record<string, unknown> } | undefined)
      ?.cesteral;
    return cesteral ? [{ name: tool.name, cesteral }] : [];
  });

  it("puts every governed tool under google_ads, including duplicate and the uploads", () => {
    expect(governed.map((t) => t.name)).toEqual(
      expect.arrayContaining(["gads_duplicate_entity", "gads_upload_image", "gads_upload_video"])
    );
    for (const { name, cesteral } of governed) {
      expect(cesteral.contractPlatformSlug, name).toBe("google_ads");
      expect(cesteral.contractId, name).toBe(
        `google_ads.${cesteral.contractToolSlug}.v${cesteral.schemaVersion}`
      );
    }
  });

  it("GOVERNANCE_TOKEN_MODE_GOOGLE_ADS reaches every governed gads tool", () => {
    // The per-server override is keyed on the contractId's slug. Under the old
    // split namespace this left gads_duplicate_entity, gads_upload_image and
    // gads_upload_video on the global mode ("warn" here).
    const env = { GOVERNANCE_TOKEN_MODE: "warn", GOVERNANCE_TOKEN_MODE_GOOGLE_ADS: "enforce" };
    for (const { name, cesteral } of governed) {
      expect(resolveTokenMode({ contractId: cesteral.contractId as string, env }), name).toBe(
        "enforce"
      );
    }
  });
});
