import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  restRequestLogic,
  RestRequestToolInputSchema,
} from "../../src/mcp-server/tools/definitions/rest-request.tool.js";
import { getJobStatusLogic } from "../../src/mcp-server/tools/definitions/get-job-status.tool.js";
import { getFirstPartyDataJobLogic } from "../../src/mcp-server/tools/definitions/get-first-party-data-job.tool.js";
import { getThirdPartyDataJobLogic } from "../../src/mcp-server/tools/definitions/get-third-party-data-job.tool.js";
import { getCampaignVersionLogic } from "../../src/mcp-server/tools/definitions/get-campaign-version.tool.js";
import {
  createCampaignsLogic,
  CreateCampaignsToolInputSchema,
} from "../../src/mcp-server/tools/definitions/create-campaigns.tool.js";
import { updateCampaignsLogic } from "../../src/mcp-server/tools/definitions/update-campaigns.tool.js";
import {
  createAdGroupsLogic,
  CreateAdGroupsToolInputSchema,
} from "../../src/mcp-server/tools/definitions/create-ad-groups.tool.js";
import { updateAdGroupsLogic } from "../../src/mcp-server/tools/definitions/update-ad-groups.tool.js";
import { GraphqlQueryInputSchema } from "../../src/mcp-server/tools/definitions/graphql-query.tool.js";
import { GraphqlQueryBulkInputSchema } from "../../src/mcp-server/tools/definitions/graphql-query-bulk.tool.js";

function createMockContext() {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

describe("ttd workflows tools", () => {
  let mockTtdService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTtdService = {
      restRequest: vi.fn(),
      getJobStatus: vi.fn(),
      getFirstPartyDataJob: vi.fn(),
      getThirdPartyDataJob: vi.fn(),
      getCampaignVersion: vi.fn(),
      createCampaignWorkflow: vi.fn(),
      updateCampaignWorkflow: vi.fn(),
      createCampaignsJob: vi.fn(),
      updateCampaignsJob: vi.fn(),
      createAdGroupWorkflow: vi.fn(),
      updateAdGroupWorkflow: vi.fn(),
      createAdGroupsJob: vi.fn(),
      updateAdGroupsJob: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
      ttdReportingService: {},
    });
  });

  it("returns raw outputs for REST, job status, and campaign version tools", async () => {
    mockTtdService.restRequest.mockResolvedValueOnce({ ok: true });
    mockTtdService.getJobStatus.mockResolvedValueOnce({ Status: "Complete" });
    mockTtdService.getCampaignVersion.mockResolvedValueOnce({ Version: 7 });

    const context = createMockContext();
    const sdkContext = createMockSdkContext();

    expect(
      (await restRequestLogic({ methodType: "GET", endpoint: "campaign/1" }, context, sdkContext))
        .result
    ).toEqual({ ok: true });
    expect((await getJobStatusLogic({ jobId: 42 }, context, sdkContext)).jobStatus).toEqual({
      Status: "Complete",
    });
    expect(
      (await getCampaignVersionLogic({ campaignId: "camp1" }, context, sdkContext)).campaignVersion
    ).toEqual({ Version: 7 });
  });

  it("passes callback inputs through first-party and third-party data jobs", async () => {
    mockTtdService.getFirstPartyDataJob.mockResolvedValueOnce({ JobId: 1 });
    mockTtdService.getThirdPartyDataJob.mockResolvedValueOnce({ JobId: 2 });

    const context = createMockContext();
    const sdkContext = createMockSdkContext();

    await getFirstPartyDataJobLogic(
      {
        advertiserId: "adv1",
        callbackInput: {
          callbackUrl: "https://example.com/webhook",
          callbackHeaders: { Authorization: "Bearer abc" },
        },
      },
      context,
      sdkContext
    );

    await getThirdPartyDataJobLogic(
      {
        partnerId: "partner1",
        callbackInput: {
          callbackUrl: "https://example.com/webhook",
        },
      },
      context,
      sdkContext
    );

    expect(mockTtdService.getFirstPartyDataJob).toHaveBeenCalledWith(
      {
        advertiserId: "adv1",
        callbackInput: {
          callbackUrl: "https://example.com/webhook",
          callbackHeaders: { Authorization: "Bearer abc" },
        },
      },
      context
    );
    expect(mockTtdService.getThirdPartyDataJob).toHaveBeenCalledWith(
      {
        partnerId: "partner1",
        callbackInput: {
          callbackUrl: "https://example.com/webhook",
        },
      },
      context
    );
  });

  it("dispatches single vs batch mode through the collapsed workflow tools", async () => {
    mockTtdService.createCampaignWorkflow.mockResolvedValueOnce({ CampaignId: "c1" });
    mockTtdService.updateCampaignWorkflow.mockResolvedValueOnce({ CampaignId: "c1" });
    mockTtdService.createCampaignsJob.mockResolvedValueOnce({ JobId: 11 });
    mockTtdService.updateCampaignsJob.mockResolvedValueOnce({ JobId: 12 });
    mockTtdService.createAdGroupWorkflow.mockResolvedValueOnce({ AdGroupId: "ag1" });
    mockTtdService.updateAdGroupWorkflow.mockResolvedValueOnce({ AdGroupId: "ag1" });
    mockTtdService.createAdGroupsJob.mockResolvedValueOnce({ JobId: 21 });
    mockTtdService.updateAdGroupsJob.mockResolvedValueOnce({ JobId: 22 });

    const context = createMockContext();
    const sdkContext = createMockSdkContext();

    await createCampaignsLogic(
      { mode: "single", primaryInput: { name: "Campaign" } },
      context,
      sdkContext
    );
    await updateCampaignsLogic({ mode: "single", id: "camp1" }, context, sdkContext);
    await createCampaignsLogic({ mode: "batch", input: [] }, context, sdkContext);
    await updateCampaignsLogic({ mode: "batch", input: [] }, context, sdkContext);
    await createAdGroupsLogic(
      { mode: "single", campaignId: "camp1", primaryInput: { name: "AG" } },
      context,
      sdkContext
    );
    await updateAdGroupsLogic({ mode: "single", id: "ag1" }, context, sdkContext);
    await createAdGroupsLogic({ mode: "batch", input: [] }, context, sdkContext);
    await updateAdGroupsLogic({ mode: "batch", input: [] }, context, sdkContext);

    // Single-mode payloads must strip the discriminator before reaching the service.
    expect(mockTtdService.createCampaignWorkflow).toHaveBeenCalledWith(
      { primaryInput: { name: "Campaign" } },
      context
    );
    expect(mockTtdService.updateCampaignWorkflow).toHaveBeenCalledWith({ id: "camp1" }, context);
    expect(mockTtdService.createCampaignsJob).toHaveBeenCalled();
    expect(mockTtdService.updateCampaignsJob).toHaveBeenCalled();
    expect(mockTtdService.createAdGroupWorkflow).toHaveBeenCalled();
    expect(mockTtdService.updateAdGroupWorkflow).toHaveBeenCalled();
    expect(mockTtdService.createAdGroupsJob).toHaveBeenCalled();
    expect(mockTtdService.updateAdGroupsJob).toHaveBeenCalled();
  });

  it("validates focused workflow schemas and GraphQL beta fields", () => {
    expect(() =>
      RestRequestToolInputSchema.parse({ methodType: "TRACE", endpoint: "campaign/1" })
    ).toThrow();

    const campaign = CreateCampaignsToolInputSchema.parse({
      mode: "single",
      primaryInput: {
        advertiserId: "adv1",
        name: "Campaign",
      },
      validateInputOnly: true,
    });
    expect(campaign.mode).toBe("single");
    expect((campaign as { validateInputOnly?: boolean }).validateInputOnly).toBe(true);

    const adGroupsJob = CreateAdGroupsToolInputSchema.parse({
      mode: "batch",
      input: [
        {
          campaignId: "camp1",
          primaryInput: { name: "AG" },
        },
      ],
      callbackInput: {
        callbackUrl: "https://example.com/webhook",
      },
    });
    expect(adGroupsJob.mode).toBe("batch");
    expect(
      (adGroupsJob as { callbackInput?: { callbackUrl: string } }).callbackInput?.callbackUrl
    ).toBe("https://example.com/webhook");

    const gql = GraphqlQueryInputSchema.parse({
      query: "query { me { id } }",
      betaFeatures: "beta-flag",
    });
    expect(gql.betaFeatures).toBe("beta-flag");

    const gqlBulk = GraphqlQueryBulkInputSchema.parse({
      query: "query Test($id: ID!) { advertiser(id: $id) { id } }",
      variables: [{ id: "a1" }],
      betaFeatures: "beta-flag",
    });
    expect(gqlBulk.betaFeatures).toBe("beta-flag");
  });
});
