/**
 * Fleet review 2026-09, dv360-mcp findings fixed in the #237 triage.
 *
 * Expected values cite the Display & Video 360 v4 Discovery document,
 * revision 20260928 (https://displayvideo.googleapis.com/$discovery/rest?version=v4).
 * Real entity metadata and a real DV360Service; only the HTTP client is stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

// Real entity metadata; only response/entity schema parsing is a passthrough,
// so a minimal line item can reach the PATCH under test.
vi.mock("../../src/services/domain/entity-mapping.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/domain/entity-mapping.js")
  >("../../src/services/domain/entity-mapping.js");
  return {
    ...actual,
    getEntitySchemaForOperation: () => ({ parse: (v: unknown) => v }),
  };
});

import {
  DV360Service,
  DV360_HIGH_LATENCY_TIMEOUT_MS,
} from "../../src/services/dv360/DV360-service.js";
import { getEntityConfigDynamic } from "../../src/mcp-server/tools/utils/entity-mapping-dynamic.js";
import { listEntitiesLogic } from "../../src/mcp-server/tools/definitions/list-entities.tool.js";
import { getTroubleshootUnderdeliveryPromptMessage } from "../../src/mcp-server/prompts/definitions/troubleshoot-underdelivery.prompt.js";
import { ListAssignedTargetingInputSchema } from "../../src/mcp-server/tools/definitions/list-assigned-targeting.tool.js";

const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

function makeService() {
  const httpClient = {
    fetch: vi.fn().mockResolvedValue({}),
    fetchRaw: vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ asset: { mediaId: "m1" } }), { status: 200 })
      ),
    getUploadBaseUrl: vi.fn().mockReturnValue("https://displayvideo.googleapis.com/upload/v4"),
  };
  const rateLimiter: any = { consume: vi.fn().mockResolvedValue(undefined) };
  return { service: new DV360Service(logger, rateLimiter, httpClient as any), httpClient };
}

describe("dv360 review #12: Discovery's high-latency writes get the long timeout", () => {
  const timeoutOf = (httpClient: { fetch: ReturnType<typeof vi.fn> }, method: string) =>
    httpClient.fetch.mock.calls.find((c) => c[2]?.method === method)?.[3];

  it("lineItems.patch", async () => {
    const { service, httpClient } = makeService();
    await service.updateEntity(
      "lineItem",
      { advertiserId: "1", lineItemId: "2" },
      { displayName: "x" },
      "displayName",
      undefined,
      { lineItemId: "2", advertiserId: "1", displayName: "old" }
    );
    expect(timeoutOf(httpClient, "PATCH")).toEqual({ timeoutMs: DV360_HIGH_LATENCY_TIMEOUT_MS });
  });

  it("campaigns.delete", async () => {
    const { service, httpClient } = makeService();
    await service.deleteEntity("campaign", { advertiserId: "1", campaignId: "2" });
    expect(timeoutOf(httpClient, "DELETE")).toEqual({ timeoutMs: DV360_HIGH_LATENCY_TIMEOUT_MS });
  });

  it("does not stretch a write Discovery does not flag (creatives.delete)", async () => {
    const { service, httpClient } = makeService();
    await service.deleteEntity("creative", { advertiserId: "1", creativeId: "2" });
    const call = httpClient.fetch.mock.calls.find((c) => c[2]?.method === "DELETE")!;
    expect(call).toHaveLength(3);
  });
});

describe("dv360 review #13: asset size limits are per type (10 MB image, 200 MB ZIP, 1 GB video)", () => {
  const MB = 1024 * 1024;
  const upload = (bytes: number, contentType: string) => {
    const { service, httpClient } = makeService();
    return {
      httpClient,
      run: service.uploadAsset("1", Buffer.alloc(bytes), "f", contentType),
    };
  };

  it("refuses an 11 MB image before uploading", async () => {
    const { run, httpClient } = upload(11 * MB, "image/png");
    await expect(run).rejects.toThrow(/10 MB for images/);
    expect(httpClient.fetchRaw).not.toHaveBeenCalled();
  });

  it("accepts a 250 MB video (the old flat 200 MB cap refused it)", async () => {
    const { run, httpClient } = upload(250 * MB, "video/mp4");
    await run.catch(() => undefined);
    expect(httpClient.fetchRaw).toHaveBeenCalledOnce();
  });

  it("still refuses a ZIP over 200 MB", async () => {
    const { run } = upload(201 * MB, "application/zip");
    await expect(run).rejects.toThrow(/200 MB/);
  });
});

describe("dv360 review #14: list filters are quoted and the caller's expression is grouped", () => {
  beforeEach(() => {
    mockResolveSessionServices.mockReset();
  });

  it("parenthesises the caller's filter and quotes the hierarchy restriction", async () => {
    const listEntities = vi.fn().mockResolvedValue({ entities: [] });
    mockResolveSessionServices.mockReturnValue({ dv360Service: { listEntities } });

    await listEntitiesLogic(
      {
        entityType: "insertionOrder",
        advertiserId: "1",
        campaignId: "42",
        filter: 'entityStatus="ENTITY_STATUS_ACTIVE" OR entityStatus="ENTITY_STATUS_PAUSED"',
      } as any,
      { requestId: "r" } as any
    );

    expect(listEntities.mock.calls[0][2]).toBe(
      '(entityStatus="ENTITY_STATUS_ACTIVE" OR entityStatus="ENTITY_STATUS_PAUSED") AND campaignId="42"'
    );
  });

  it("sends a lone hierarchy restriction quoted", async () => {
    const listEntities = vi.fn().mockResolvedValue({ entities: [] });
    mockResolveSessionServices.mockReturnValue({ dv360Service: { listEntities } });

    await listEntitiesLogic(
      { entityType: "lineItem", advertiserId: "1", insertionOrderId: "7" } as any,
      { requestId: "r" } as any
    );

    expect(listEntities.mock.calls[0][2]).toBe('insertionOrderId="7"');
  });
});

describe("dv360 review #15: partners.list takes a filter in v4", () => {
  it("partner metadata supports filtering", () => {
    expect(getEntityConfigDynamic("partner").supportsFilter).toBe(true);
  });
});

describe("dv360 review #21: the underdelivery prompt calls list_assigned_targeting correctly", () => {
  it.each(["lineItem", "insertionOrder", "campaign"])("for a %s", (entityType) => {
    const text = getTroubleshootUnderdeliveryPromptMessage({
      advertiserId: "1",
      entityType,
      entityId: "9",
    });
    const block = text
      .split("Tool: dv360_list_assigned_targeting (dv360-mcp)\nParameters:\n")[1]
      .split("```")[0];
    const params = JSON.parse(block);
    const parsed = ListAssignedTargetingInputSchema.safeParse(params);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    expect(params.parentType).toBe("lineItem");
  });
});
