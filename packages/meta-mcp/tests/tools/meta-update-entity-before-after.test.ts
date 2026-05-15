// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * PR-D: `before` / `after` snapshot capture on real (non-dry-run) writes.
 *
 * The handler reads the entity twice (once before, once after) since Meta's
 * update endpoint returns only `{ success: true }`. Both reads go through the
 * same `metaService.getEntity` abstraction the dry-run path uses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: vi
    .fn()
    .mockReturnValue(["campaign", "adSet", "ad", "adCreative", "customAudience"]),
}));

import {
  updateEntityLogic,
  UpdateEntityOutputSchema,
  updateEntityTool,
} from "../../src/mcp-server/tools/definitions/update-entity.tool.js";

function ctx() {
  return { requestId: "r-ba", timestamp: new Date().toISOString(), operation: "test" } as any;
}

describe("meta_update_entity before/after capture (PR-D)", () => {
  let metaService: {
    updateEntity: ReturnType<typeof vi.fn>;
    getEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    metaService = {
      updateEntity: vi.fn().mockResolvedValue({ success: true }),
      getEntity: vi
        .fn()
        // Pre-read returns ACTIVE; post-read returns PAUSED (mutation succeeded).
        .mockResolvedValueOnce({
          id: "777",
          name: "Pause Me",
          status: "ACTIVE",
          daily_budget: 5000,
          currency: "USD",
          account_id: "act_REDACTED_1",
        })
        .mockResolvedValueOnce({
          id: "777",
          name: "Pause Me",
          status: "PAUSED",
          daily_budget: 5000,
          currency: "USD",
          account_id: "act_REDACTED_1",
        }),
    };
    mockResolveSessionServices.mockReturnValue({ metaService });
  });

  it("populates before and after snapshots in canonical shape on a successful write", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "777",
        data: { status: "PAUSED" },
        dry_run: false,
      },
      ctx(),
      { sessionId: "s" } as any
    );

    expect(metaService.updateEntity).toHaveBeenCalledOnce();
    expect(metaService.getEntity).toHaveBeenCalledTimes(2);

    expect(result.success).toBe(true);
    expect(result.before).toBeDefined();
    expect(result.after).toBeDefined();

    expect(result.before).toMatchObject({
      schemaVersion: 1,
      platform: "meta_ads",
      entityKind: "campaign",
      platformEntityId: "777",
      status: { canonical: "active", platformRaw: "ACTIVE" },
      budget: { daily: { amountMinor: 5000, currency: "USD" } },
    });
    expect(result.after).toMatchObject({
      schemaVersion: 1,
      platform: "meta_ads",
      entityKind: "campaign",
      platformEntityId: "777",
      status: { canonical: "paused", platformRaw: "PAUSED" },
      budget: { daily: { amountMinor: 5000, currency: "USD" } },
    });
  });

  it("output schema accepts before/after as optional NormalizedEntitySnapshot fields", () => {
    const ok = UpdateEntityOutputSchema.safeParse({
      success: true,
      entityId: "1",
      timestamp: new Date().toISOString(),
    });
    expect(ok.success).toBe(true);
  });

  it("annotation now declares supportsBeforeAfterSnapshot: true", () => {
    const cesteral = (updateEntityTool.annotations as any).cesteral;
    expect(cesteral.supportsBeforeAfterSnapshot).toBe(true);
  });

  it("leaves before/after undefined when the read partner cannot resolve the entity", async () => {
    metaService.getEntity = vi.fn().mockRejectedValue(new Error("not found"));
    const result = await updateEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "777",
        data: { status: "PAUSED" },
        dry_run: false,
      },
      ctx(),
      { sessionId: "s" } as any
    );
    expect(result.before).toBeUndefined();
    expect(result.after).toBeUndefined();
    expect(result.success).toBe(true);
  });
});
