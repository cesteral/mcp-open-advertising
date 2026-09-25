import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  searchTargetingLogic,
  SearchTargetingInputSchema,
} from "../../src/mcp-server/tools/definitions/search-targeting.tool.js";
import { listAdvertisersLogic } from "../../src/mcp-server/tools/definitions/list-advertisers.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("tiktok_search_targeting request body (TikTok tool_targeting_search spec)", () => {
  const searchTargeting = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSessionServices.mockReturnValue({
      tiktokService: { searchTargeting },
      boundAdvertiserId: "adv-1",
    });
  });

  it("sends keywords[] + search_type + placements + objective_type, not keyword/scene/page_size", async () => {
    searchTargeting.mockResolvedValueOnce({
      targeting_tag_list: [{ name: "Stockholm", targeting_type: "GEO" }],
    });

    const input = SearchTargetingInputSchema.parse({
      advertiserId: "adv-1",
      query: "stockholm",
      placements: ["PLACEMENT_TIKTOK"],
      objectiveType: "REACH",
    });
    const result = await searchTargetingLogic(input, ctx, sdk);

    const body = searchTargeting.mock.calls[0][0];
    expect(body).toEqual({
      keywords: ["stockholm"],
      search_type: "FUZZY_SEARCH",
      placements: ["PLACEMENT_TIKTOK"],
      objective_type: "REACH",
    });
    expect(body).not.toHaveProperty("keyword");
    expect(body).not.toHaveProperty("scene");
    expect(body).not.toHaveProperty("page_size");
    // Results come back under targeting_tag_list per the spec's response rule.
    expect(result.count).toBe(1);
    expect(result.results[0]).toMatchObject({ name: "Stockholm" });
  });

  it("passes batch keywords and region codes through", async () => {
    searchTargeting.mockResolvedValueOnce({ targeting_tag_list: [] });

    const input = SearchTargetingInputSchema.parse({
      advertiserId: "adv-1",
      query: ["10001", "10002"],
      searchType: "BATCH_ZIPCODE_SEARCH",
      placements: ["PLACEMENT_TIKTOK"],
      objectiveType: "REACH",
      regionCodes: ["US"],
    });
    await searchTargetingLogic(input, ctx, sdk);

    expect(searchTargeting.mock.calls[0][0]).toMatchObject({
      keywords: ["10001", "10002"],
      search_type: "BATCH_ZIPCODE_SEARCH",
      region_codes: ["US"],
    });
  });

  it("requires placements and objectiveType (required by the spec)", () => {
    expect(
      SearchTargetingInputSchema.safeParse({ advertiserId: "adv-1", query: "x" }).success
    ).toBe(false);
  });

  it("rejects multiple keywords for FUZZY_SEARCH", () => {
    expect(
      SearchTargetingInputSchema.safeParse({
        advertiserId: "adv-1",
        query: ["a", "b"],
        placements: ["PLACEMENT_TIKTOK"],
        objectiveType: "REACH",
      }).success
    ).toBe(false);
  });
});

describe("tiktok_list_advertisers", () => {
  it("asks advertiser/info/ for the session-bound advertiser (advertiser_ids is required)", async () => {
    const listAdvertisers = vi.fn().mockResolvedValue({ list: [{ advertiser_id: "adv-1" }] });
    mockResolveSessionServices.mockReturnValue({
      tiktokService: { listAdvertisers },
      boundAdvertiserId: "adv-1",
    });

    const result = await listAdvertisersLogic({}, ctx, sdk);

    expect(listAdvertisers).toHaveBeenCalledWith(["adv-1"], ctx);
    expect(result.count).toBe(1);
  });
});
