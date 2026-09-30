import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { AmazonDspReportingService } from "../../src/services/amazon-dsp/amazon-dsp-reporting-service.js";
import type { AmazonDspHttpClient } from "../../src/services/amazon-dsp/amazon-dsp-http-client.js";

// Contract under test: Amazon's Postman collection (amzn/ads-advanced-tools-docs,
// postman/Amazon_Ads_API.postman_collection.json → Reporting / DSP report).
//   POST {api_url}/accounts/{dspAccountId}/dsp/reports
//     Accept: application/vnd.dspcreatereports.v3+json
//     body { startDate: "2023-02-21", endDate: "2023-02-27", type, dimensions: [...], metrics: [...] }
//   GET  {api_url}/accounts/{dspAccountId}/dsp/reports/:reportId
//     Accept: application/vnd.dspgetreports.v3+json

const logger = pino({ level: "silent" });
const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) } as any;

function makeService(response: unknown) {
  const post = vi.fn().mockResolvedValue(response);
  const get = vi.fn().mockResolvedValue(response);
  const httpClient = { post, get, put: vi.fn() } as unknown as AmazonDspHttpClient;
  const service = new AmazonDspReportingService(rateLimiter, httpClient, logger, 1, 3);
  return { service, post, get };
}

describe("AmazonDspReportingService (DSP reports v3)", () => {
  it("submits to the account-scoped path with the create Accept type, ISO dates and a metrics array", async () => {
    const { service, post } = makeService({ reportId: "rpt-1", status: "IN_PROGRESS" });

    const result = await service.submitReport({
      accountId: "577020615253975655",
      startDate: "2026-03-01",
      endDate: "2026-03-04",
      type: "CAMPAIGN",
      dimensions: ["ORDER", "LINE_ITEM"],
      metrics: ["impressions", "totalCost"],
    });

    expect(result.taskId).toBe("rpt-1");
    expect(post).toHaveBeenCalledWith(
      "/accounts/577020615253975655/dsp/reports",
      {
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        type: "CAMPAIGN",
        timeUnit: "DAILY",
        dimensions: ["ORDER", "LINE_ITEM"],
        metrics: ["impressions", "totalCost"],
      },
      undefined,
      "application/vnd.dspcreatereports.v3+json"
    );
  });

  it("checks status on the account-scoped path with the get Accept type", async () => {
    const { service, get } = makeService({
      reportId: "rpt-1",
      status: "SUCCESS",
      location: "https://corvo-reports.s3.amazonaws.com/x",
    });

    const result = await service.checkReportStatus("577020615253975655", "rpt-1");

    expect(get).toHaveBeenCalledWith(
      "/accounts/577020615253975655/dsp/reports/rpt-1",
      undefined,
      undefined,
      "application/vnd.dspgetreports.v3+json"
    );
    expect(result).toEqual({
      taskId: "rpt-1",
      status: "SUCCESS",
      downloadUrl: "https://corvo-reports.s3.amazonaws.com/x",
    });
  });

  it("polls the account-scoped status path during getReport", async () => {
    const { service, post, get } = makeService(undefined);
    post.mockResolvedValueOnce({ reportId: "rpt-9", status: "IN_PROGRESS" });
    get.mockResolvedValueOnce({ reportId: "rpt-9", status: "FAILURE" });

    await expect(
      service.getReport({
        accountId: "adv-1",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        type: "CAMPAIGN",
      })
    ).rejects.toThrow(/failed/);

    expect(post.mock.calls[0][0]).toBe("/accounts/adv-1/dsp/reports");
    expect(get.mock.calls[0][0]).toBe("/accounts/adv-1/dsp/reports/rpt-9");
    expect(get.mock.calls[0][3]).toBe("application/vnd.dspgetreports.v3+json");
  });

  it("encodes the accountId and reportId path segments", async () => {
    const { service, get } = makeService({ reportId: "a/b", status: "IN_PROGRESS" });
    await service.checkReportStatus("adv/1", "a/b");
    expect(get.mock.calls[0][0]).toBe("/accounts/adv%2F1/dsp/reports/a%2Fb");
    await expect(service.checkReportStatus("..", "x")).rejects.toThrow(/Invalid accountId/);
  });
});
