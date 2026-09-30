// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * #228: `msads_get_entity` and `msads_update_entity` used a top-level
 * discriminated union, which MCP clients received as an empty input schema.
 * Both are now a flat object whose per-type context requirements are enforced
 * in `superRefine`. These tests pin that the flattening kept the union's
 * behaviour: the same fields are required per type, fields that do not apply
 * to the type are ignored, and the published shape lists every parameter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { extractZodShape, type RateLimiter } from "@cesteral/shared";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import {
  GetEntityInputSchema,
  getEntityLogic,
  getEntityTool,
} from "../../src/mcp-server/tools/definitions/get-entity.tool.js";
import {
  UpdateEntityInputSchema,
  updateEntityLogic,
  updateEntityTool,
} from "../../src/mcp-server/tools/definitions/update-entity.tool.js";
import {
  getEntityContextKeys,
  getSupportedEntityTypes,
  getWriteParent,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

let http: Record<"post" | "put" | "delete" | "request", ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  http = {
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    request: vi.fn(),
  };
  http.request.mockImplementation(async (method: string, path: string, data: unknown) =>
    http[method.toLowerCase() as "post" | "put" | "delete"](path, data)
  );
  const customer = { post: vi.fn().mockResolvedValue({ Account: { CurrencyCode: "EUR" } }) };
  const msadsService = new MsAdsService(
    { consume: vi.fn().mockResolvedValue(undefined) } as unknown as RateLimiter,
    http as unknown as MsAdsHttpClient,
    pino({ level: "silent" }),
    { userId: "u1", customerId: "c1" },
    { customerClient: customer as unknown as MsAdsHttpClient, accountId: "900" }
  );
  mockResolveSessionServices.mockReturnValue({ msadsService });
});

const REQUIRED_CONTEXT: Record<string, string[]> = {
  campaign: ["accountId"],
  adGroup: ["campaignId"],
  ad: ["adGroupId"],
  keyword: ["adGroupId"],
  adExtension: ["accountId", "adExtensionType"],
  budget: [],
  audience: [],
  label: [],
};

describe.each([
  ["msads_get_entity", GetEntityInputSchema, getEntityTool, {}],
  [
    "msads_update_entity",
    UpdateEntityInputSchema,
    updateEntityTool,
    { data: { Status: "Paused" } },
  ],
] as const)("%s input schema", (_name, schema, tool, extra) => {
  it("publishes a flat shape listing every parameter (not a union)", () => {
    const shape = extractZodShape(tool.inputSchema as any);
    expect(Object.keys(shape)).toEqual(
      expect.arrayContaining([
        "entityType",
        "entityId",
        "accountId",
        "campaignId",
        "adGroupId",
        "adExtensionType",
      ])
    );
  });

  it("covers every supported entity type", () => {
    expect(Object.keys(REQUIRED_CONTEXT).sort()).toEqual([...getSupportedEntityTypes()].sort());
  });

  it.each(Object.entries(REQUIRED_CONTEXT))("%s requires exactly %j", (entityType, required) => {
    const full = {
      entityType,
      entityId: "1",
      accountId: "900",
      campaignId: "20",
      adGroupId: "30",
      adExtensionType: "SitelinkAdExtension",
      ...extra,
    };
    expect(schema.safeParse(full).success).toBe(true);

    for (const key of required) {
      const { [key]: _omitted, ...without } = full as Record<string, unknown>;
      const result = schema.safeParse(without);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((i) => i.path.join("."))).toContain(key);
    }

    const bare = { entityType, entityId: "1", ...extra };
    expect(schema.safeParse(bare).success).toBe(required.length === 0);
  });

  it("rejects an unknown entity type", () => {
    expect(schema.safeParse({ entityType: "widget", entityId: "1", ...extra }).success).toBe(false);
  });
});

describe("context keys", () => {
  it("every parented type's Update body parent is one of its read context keys", () => {
    for (const entityType of getSupportedEntityTypes()) {
      const parent = getWriteParent(entityType);
      if (parent) expect(getEntityContextKeys(entityType)).toContain(parent.inputKey);
    }
  });
});

describe("fields that do not apply to the entity type are ignored, as the union stripped them", () => {
  it("get: a campaign read sends AccountId only", async () => {
    http.post.mockResolvedValue({ Campaigns: [{ Id: 1 }] });
    await getEntityLogic(
      GetEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "1",
        accountId: "900",
        adGroupId: "30",
      }),
      ctx,
      sdk
    );
    const body = http.post.mock.calls.find((c) => c[0] === "/Campaigns/QueryByIds")?.[1];
    expect(body).toMatchObject({ AccountId: 900, CampaignIds: [1] });
    expect(body).not.toHaveProperty("AdGroupId");
  });

  it("update: an ad group Update body carries CampaignId only", async () => {
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adGroup",
        entityId: "1",
        campaignId: "20",
        accountId: "900",
        data: { Status: "Paused" },
      }),
      ctx,
      sdk
    );
    expect(http.put).toHaveBeenCalledWith(
      "/AdGroups",
      { CampaignId: 20, AdGroups: [{ Id: 1, Status: "Paused" }] },
      ctx
    );
  });
});

describe("msads_update_entity readPartner", () => {
  it("maps every context field, so governance's read is satisfiable from the manifest", () => {
    const argMap = updateEntityTool.annotations.cesteral.readPartner.argMap as Record<
      string,
      string
    >;
    for (const entityType of getSupportedEntityTypes()) {
      for (const key of getEntityContextKeys(entityType)) {
        expect(argMap[key], `${entityType} needs ${key}`).toBe(key);
      }
    }
  });
});
