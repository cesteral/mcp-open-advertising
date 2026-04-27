import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnapchatService } from "../../src/services/snapchat/snapchat-service.js";

const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockRateLimiter = { consume: vi.fn().mockResolvedValue(undefined) };

describe("SnapchatService", () => {
  let service: SnapchatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SnapchatService(
      mockHttpClient as any,
      "org_123",
      "acct_456",
      mockRateLimiter as any
    );
  });

  it("lists entities using next_link pagination and accepts lowercase success", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "success",
      campaigns: [{ sub_request_status: "success", campaign: { id: "c1", name: "Test" } }],
      paging: {
        next_link: "https://adsapi.snapchat.com/v1/adaccounts/acct_456/campaigns?cursor=abc",
      },
    });

    const result = await service.listEntities("campaign", { adAccountId: "acct_456" });

    expect(mockHttpClient.get).toHaveBeenCalledWith(
      "/v1/adaccounts/acct_456/campaigns",
      {},
      undefined
    );
    expect(result.entities).toEqual([{ id: "c1", name: "Test" }]);
    expect(result.nextCursor).toContain("cursor=abc");
  });

  it("passes the next page link through unchanged on subsequent list calls", async () => {
    const nextLink = "https://adsapi.snapchat.com/v1/adaccounts/acct_456/campaigns?cursor=abc";
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      campaigns: [],
      paging: {},
    });

    await service.listEntities("campaign", { adAccountId: "acct_456" }, nextLink);

    expect(mockHttpClient.get).toHaveBeenCalledWith(nextLink, {}, undefined);
  });

  it("gets entities from the dedicated GET path", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Test" } }],
    });

    const result = await service.getEntity("campaign", "c1");

    expect(mockHttpClient.get).toHaveBeenCalledWith("/v1/campaigns/c1", undefined, undefined);
    expect((result as any).id).toBe("c1");
  });

  it("creates campaigns on the ad-account scoped collection", async () => {
    mockHttpClient.post.mockResolvedValueOnce({
      request_status: "SUCCESS",
      campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "new_c", name: "New" } }],
    });

    const result = await service.createEntity(
      "campaign",
      { adAccountId: "acct_456" },
      { name: "New", status: "ACTIVE" }
    );

    expect(mockHttpClient.post).toHaveBeenCalledWith(
      "/v1/adaccounts/acct_456/campaigns",
      { campaigns: [{ name: "New", status: "ACTIVE" }] },
      undefined
    );
    expect((result as any).id).toBe("new_c");
  });

  it("updates campaigns via the parent-scoped collection route with a merged payload", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      campaigns: [
        {
          sub_request_status: "SUCCESS",
          campaign: {
            id: "c1",
            ad_account_id: "acct_456",
            name: "Original",
            status: "ACTIVE",
            objective: "WEB_CONVERSION",
            daily_budget_micro: 10000000,
          },
        },
      ],
    });
    mockHttpClient.put.mockResolvedValueOnce({
      request_status: "SUCCESS",
      campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Updated" } }],
    });

    await service.updateEntity("campaign", "c1", { adAccountId: "acct_456" }, { name: "Updated" });

    expect(mockHttpClient.put).toHaveBeenCalledWith(
      "/v1/adaccounts/acct_456/campaigns",
      {
        campaigns: [
          {
            id: "c1",
            ad_account_id: "acct_456",
            name: "Updated",
            status: "ACTIVE",
            objective: "WEB_CONVERSION",
            daily_budget_micro: 10000000,
          },
        ],
      },
      undefined
    );
  });

  it("updates status by reusing the merged update flow", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      campaigns: [
        {
          sub_request_status: "SUCCESS",
          campaign: {
            id: "c1",
            ad_account_id: "acct_456",
            name: "Original",
            status: "ACTIVE",
            objective: "WEB_CONVERSION",
            daily_budget_micro: 10000000,
          },
        },
      ],
    });
    mockHttpClient.put.mockResolvedValueOnce({
      request_status: "SUCCESS",
      campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", status: "PAUSED" } }],
    });

    await service.updateEntityStatus("campaign", "c1", "PAUSED", { adAccountId: "acct_456" });

    expect(mockHttpClient.put).toHaveBeenCalledWith(
      "/v1/adaccounts/acct_456/campaigns",
      expect.objectContaining({
        campaigns: [expect.objectContaining({ id: "c1", status: "PAUSED" })],
      }),
      undefined
    );
  });

  it("deletes entities with entity-specific DELETE routes", async () => {
    mockHttpClient.delete.mockResolvedValueOnce({ request_status: "SUCCESS" });

    await service.deleteEntity("campaign", "c1");

    expect(mockHttpClient.delete).toHaveBeenCalledWith("/v1/campaigns/c1", undefined, undefined);
  });

  it("lists ad accounts and returns the next page link", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      adaccounts: [
        { adaccount: { id: "acct_1", name: "Account 1" } },
        { adaccount: { id: "acct_2", name: "Account 2" } },
      ],
      paging: {
        next_link: "https://adsapi.snapchat.com/v1/organizations/org_123/adaccounts?cursor=2",
      },
    });

    const result = await service.listAdAccounts();

    expect(result.entities).toEqual([
      { id: "acct_1", name: "Account 1" },
      { id: "acct_2", name: "Account 2" },
    ]);
    expect(result.nextCursor).toContain("cursor=2");
  });

  it("fetches creative previews from the documented creative_preview endpoint", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      creative_preview_link: "https://ad-preview.snapchat.com/?creative_id=cr_1",
    });

    await service.getCreativePreview("cr_1");

    expect(mockHttpClient.get).toHaveBeenCalledWith(
      "/v1/creatives/cr_1/creative_preview",
      undefined,
      undefined
    );
  });

  it("posts audience estimates to audience_size_v2", async () => {
    mockHttpClient.post.mockResolvedValueOnce({
      request_status: "SUCCESS",
      audience_size: { audience_size_minimum: 100 },
    });

    await service.getAudienceEstimate({ name: "Audience Spec" }, "acct_456");

    expect(mockHttpClient.post).toHaveBeenCalledWith(
      "/v1/adaccounts/acct_456/audience_size_v2",
      { name: "Audience Spec" },
      undefined
    );
  });

  it("queries documented targeting endpoints and unwraps targeting dimensions", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      targeting_dimensions: [
        { sub_request_status: "SUCCESS", scls: { id: "SLC_1", name: "Adventure Seekers" } },
      ],
      paging: {},
    });

    const result = await service.getTargetingOptions("interests_slc", "us", 100);

    expect(mockHttpClient.get).toHaveBeenCalledWith(
      "/v1/targeting/v1/interests/scls",
      { country_code: "us", limit: "100" },
      undefined
    );
    expect(result.results).toEqual([{ id: "SLC_1", name: "Adventure Seekers" }]);
  });

  it("filters targeting results client-side for search", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      targeting_dimensions: [
        { sub_request_status: "SUCCESS", scls: { id: "SLC_1", name: "Adventure Seekers" } },
        { sub_request_status: "SUCCESS", scls: { id: "SLC_2", name: "Gaming Fans" } },
      ],
      paging: {},
    });

    const result = await service.searchTargeting("interests_slc", "us", "gaming", 20);

    expect(result.results).toEqual([{ id: "SLC_2", name: "Gaming Fans" }]);
  });

  it("bulk updates campaigns with merged payloads and positional result mapping", async () => {
    mockHttpClient.get
      .mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          {
            sub_request_status: "SUCCESS",
            campaign: {
              id: "c1",
              ad_account_id: "acct_456",
              name: "A",
              status: "ACTIVE",
              objective: "WEB_CONVERSION",
              daily_budget_micro: 100,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          {
            sub_request_status: "SUCCESS",
            campaign: {
              id: "c2",
              ad_account_id: "acct_456",
              name: "B",
              status: "ACTIVE",
              objective: "WEB_CONVERSION",
              daily_budget_micro: 200,
            },
          },
        ],
      });
    mockHttpClient.put.mockResolvedValueOnce({
      request_status: "SUCCESS",
      campaigns: [
        { sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Updated A" } },
        { sub_request_status: "FAILED", sub_request_error_message: "Budget too low" },
      ],
    });

    const result = await service.bulkUpdateEntities("campaign", { adAccountId: "acct_456" }, [
      { entityId: "c1", data: { name: "Updated A" } },
      { entityId: "c2", data: { daily_budget_micro: 50 } },
    ]);

    expect(mockHttpClient.put).toHaveBeenCalledWith(
      "/v1/adaccounts/acct_456/campaigns",
      {
        campaigns: [
          {
            id: "c1",
            ad_account_id: "acct_456",
            name: "Updated A",
            status: "ACTIVE",
            objective: "WEB_CONVERSION",
            daily_budget_micro: 100,
          },
          {
            id: "c2",
            ad_account_id: "acct_456",
            name: "B",
            status: "ACTIVE",
            objective: "WEB_CONVERSION",
            daily_budget_micro: 50,
          },
        ],
      },
      undefined
    );
    expect(result.results).toEqual([
      { entityId: "c1", success: true, error: undefined },
      { entityId: "c2", success: false, error: "Budget too low" },
    ]);
  });

  it("bulk status updates reuse bulk entity updates", async () => {
    mockHttpClient.get
      .mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          {
            sub_request_status: "SUCCESS",
            campaign: {
              id: "c1",
              ad_account_id: "acct_456",
              name: "A",
              status: "ACTIVE",
              objective: "WEB_CONVERSION",
              daily_budget_micro: 100,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          {
            sub_request_status: "SUCCESS",
            campaign: {
              id: "c2",
              ad_account_id: "acct_456",
              name: "B",
              status: "ACTIVE",
              objective: "WEB_CONVERSION",
              daily_budget_micro: 200,
            },
          },
        ],
      });
    mockHttpClient.put.mockResolvedValueOnce({
      request_status: "SUCCESS",
      campaigns: [
        { sub_request_status: "SUCCESS", campaign: { id: "c1", status: "PAUSED" } },
        { sub_request_status: "SUCCESS", campaign: { id: "c2", status: "PAUSED" } },
      ],
    });

    const result = await service.bulkUpdateStatus(
      "campaign",
      { adAccountId: "acct_456" },
      ["c1", "c2"],
      "PAUSED"
    );

    expect(result.results).toEqual([
      { entityId: "c1", success: true, error: undefined },
      { entityId: "c2", success: true, error: undefined },
    ]);
  });
});
