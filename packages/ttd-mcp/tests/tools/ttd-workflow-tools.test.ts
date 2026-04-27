import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { restRequestLogic } from "../../src/mcp-server/tools/definitions/rest-request.tool.js";
import { getJobStatusLogic } from "../../src/mcp-server/tools/definitions/get-job-status.tool.js";
import { getFirstPartyDataJobLogic } from "../../src/mcp-server/tools/definitions/get-first-party-data-job.tool.js";
import { getThirdPartyDataJobLogic } from "../../src/mcp-server/tools/definitions/get-third-party-data-job.tool.js";
import { getCampaignVersionLogic } from "../../src/mcp-server/tools/definitions/get-campaign-version.tool.js";
import { createCampaignWorkflowLogic } from "../../src/mcp-server/tools/definitions/create-campaign-workflow.tool.js";
import { updateCampaignWorkflowLogic } from "../../src/mcp-server/tools/definitions/update-campaign-workflow.tool.js";
import { createCampaignsJobLogic } from "../../src/mcp-server/tools/definitions/create-campaigns-job.tool.js";
import { updateCampaignsJobLogic } from "../../src/mcp-server/tools/definitions/update-campaigns-job.tool.js";
import { createAdGroupWorkflowLogic } from "../../src/mcp-server/tools/definitions/create-ad-group-workflow.tool.js";
import { updateAdGroupWorkflowLogic } from "../../src/mcp-server/tools/definitions/update-ad-group-workflow.tool.js";
import { createAdGroupsJobLogic } from "../../src/mcp-server/tools/definitions/create-ad-groups-job.tool.js";
import { updateAdGroupsJobLogic } from "../../src/mcp-server/tools/definitions/update-ad-groups-job.tool.js";
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

describe("ttd workflow tools", () => {
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

  it("restRequestLogic delegates to TtdService", async () => {
    mockTtdService.restRequest.mockResolvedValueOnce({ ok: true });

    const result = await restRequestLogic(
      { methodType: "GET", endpoint: "campaign/c1" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.result).toEqual({ ok: true });
    expect(mockTtdService.restRequest).toHaveBeenCalledWith(
      { methodType: "GET", endpoint: "campaign/c1" },
      expect.any(Object)
    );
  });

  it("getJobStatusLogic delegates to TtdService", async () => {
    mockTtdService.getJobStatus.mockResolvedValueOnce({ JobId: 1, Status: "Running" });

    const result = await getJobStatusLogic(
      { jobId: 1 },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.jobStatus.JobId).toBe(1);
  });

  it("maps callbackInput for first-party and third-party data jobs", async () => {
    mockTtdService.getFirstPartyDataJob.mockResolvedValueOnce({ JobId: 11 });
    mockTtdService.getThirdPartyDataJob.mockResolvedValueOnce({ JobId: 12 });

    await getFirstPartyDataJobLogic(
      {
        advertiserId: "adv-1",
        callbackInput: { callbackUrl: "https://example.com/hook", callbackHeaders: { A: "1" } },
      },
      createMockContext(),
      createMockSdkContext()
    );

    await getThirdPartyDataJobLogic(
      {
        partnerId: "partner-1",
        callbackInput: { callbackUrl: "https://example.com/hook" },
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdService.getFirstPartyDataJob).toHaveBeenCalledWith(
      {
        advertiserId: "adv-1",
        nameFilter: undefined,
        queryShape: undefined,
        callbackInput: {
          callbackUrl: "https://example.com/hook",
          callbackHeaders: { A: "1" },
        },
      },
      expect.any(Object)
    );
    expect(mockTtdService.getThirdPartyDataJob).toHaveBeenCalledWith(
      {
        partnerId: "partner-1",
        queryShape: undefined,
        callbackInput: {
          callbackUrl: "https://example.com/hook",
        },
      },
      expect.any(Object)
    );
  });

  it("exposes campaign version lookup", async () => {
    mockTtdService.getCampaignVersion.mockResolvedValueOnce({ Version: 7 });

    const result = await getCampaignVersionLogic(
      { campaignId: "camp-1" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.campaignVersion.Version).toBe(7);
  });

  it("delegates campaign and ad group workflow operations", async () => {
    mockTtdService.createCampaignWorkflow.mockResolvedValueOnce({ CampaignId: "c1" });
    mockTtdService.updateCampaignWorkflow.mockResolvedValueOnce({ CampaignId: "c1" });
    mockTtdService.createAdGroupWorkflow.mockResolvedValueOnce({ AdGroupId: "ag1" });
    mockTtdService.updateAdGroupWorkflow.mockResolvedValueOnce({ AdGroupId: "ag1" });

    const createCampaign = await createCampaignWorkflowLogic(
      { primaryInput: { advertiserId: "adv-1", name: "Campaign" } },
      createMockContext(),
      createMockSdkContext()
    );
    const updateCampaign = await updateCampaignWorkflowLogic(
      { id: "c1", primaryInput: { name: "Updated" } },
      createMockContext(),
      createMockSdkContext()
    );
    const createAdGroup = await createAdGroupWorkflowLogic(
      { campaignId: "c1", primaryInput: { name: "AG" } },
      createMockContext(),
      createMockSdkContext()
    );
    const updateAdGroup = await updateAdGroupWorkflowLogic(
      { id: "ag1", primaryInput: { name: "AG Updated" } },
      createMockContext(),
      createMockSdkContext()
    );

    expect(createCampaign.campaign.CampaignId).toBe("c1");
    expect(updateCampaign.campaign.CampaignId).toBe("c1");
    expect(createAdGroup.adGroup.AdGroupId).toBe("ag1");
    expect(updateAdGroup.adGroup.AdGroupId).toBe("ag1");
  });

  it("delegates bulk workflow jobs and preserves callbackInput mapping", async () => {
    mockTtdService.createCampaignsJob.mockResolvedValueOnce({ JobId: 20 });
    mockTtdService.updateCampaignsJob.mockResolvedValueOnce({ JobId: 21 });
    mockTtdService.createAdGroupsJob.mockResolvedValueOnce({ JobId: 22 });
    mockTtdService.updateAdGroupsJob.mockResolvedValueOnce({ JobId: 23 });

    await createCampaignsJobLogic(
      {
        input: [{ primaryInput: { advertiserId: "adv-1", name: "Bulk 1" } }],
        callbackInput: { callbackUrl: "https://example.com/hook" },
      },
      createMockContext(),
      createMockSdkContext()
    );
    await updateCampaignsJobLogic(
      { input: [{ id: "c1", primaryInput: { name: "Bulk Update" } }] },
      createMockContext(),
      createMockSdkContext()
    );
    await createAdGroupsJobLogic(
      { input: [{ campaignId: "c1", primaryInput: { name: "AG Bulk" } }] },
      createMockContext(),
      createMockSdkContext()
    );
    await updateAdGroupsJobLogic(
      { input: [{ id: "ag1", primaryInput: { name: "AG Bulk Update" } }] },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdService.createCampaignsJob).toHaveBeenCalledWith(
      {
        input: [{ primaryInput: { advertiserId: "adv-1", name: "Bulk 1" } }],
        callbackInput: { callbackUrl: "https://example.com/hook" },
      },
      expect.any(Object)
    );
    expect(mockTtdService.updateCampaignsJob).toHaveBeenCalled();
    expect(mockTtdService.createAdGroupsJob).toHaveBeenCalled();
    expect(mockTtdService.updateAdGroupsJob).toHaveBeenCalled();
  });

  it("validates betaFeatures on GraphQL tool schemas", () => {
    const gql = GraphqlQueryInputSchema.parse({
      query: "query { partners { nodes { id } } }",
      betaFeatures: "flag-1",
    });
    const gqlBulk = GraphqlQueryBulkInputSchema.parse({
      query: "query A { partners { nodes { id } } }",
      variables: [{}],
      betaFeatures: "flag-2",
    });

    expect(gql.betaFeatures).toBe("flag-1");
    expect(gqlBulk.betaFeatures).toBe("flag-2");
  });
});
