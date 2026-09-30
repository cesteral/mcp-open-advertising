/**
 * #232 — the async report chain at the wire. Only `fetch` is stubbed; tool
 * logic, session services, TikTokHttpClient, executeWithRetry and a real
 * RateLimiter run as in production.
 *
 * Evidence (tiktok/tiktok-business-api-sdk @ f809c39): the official SDK
 * defines report/task/create/, report/task/check/ and report/task/cancel/ and
 * no report-task download operation; report_task_check.yml's data object
 * declares no properties and its response rule maps only `status` and
 * `message`. A task created by tiktok_submit_report could never be fetched, so
 * submit and download refuse before anything reaches TikTok, and the status
 * check never surfaces a download URL.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWireSession,
  installFetchStub,
  TEST_ACCESS_TOKEN,
  TEST_ADVERTISER_ID,
  type FetchStub,
  type WireSession,
} from "../helpers/wire.js";
import { submitReportLogic } from "../../src/mcp-server/tools/definitions/submit-report.tool.js";
import { downloadReportLogic } from "../../src/mcp-server/tools/definitions/download-report.tool.js";
import {
  checkReportStatusLogic,
  checkReportStatusResponseFormatter,
  CheckReportStatusOutputSchema,
} from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";

const ctx = { requestId: "wire-req" } as any;

const submitInput = {
  advertiserId: TEST_ADVERTISER_ID,
  reportType: "BASIC",
  serviceType: "AUCTION",
  dataLevel: "AUCTION_CAMPAIGN",
  dimensions: ["campaign_id", "stat_time_day"],
  metrics: ["impressions", "spend"],
  startDate: "2026-09-01",
  endDate: "2026-09-07",
  dry_run: false,
} as const;

describe("tiktok async report chain at the wire (#232)", () => {
  let session: WireSession;
  let stub: FetchStub;

  beforeEach(() => {
    session = createWireSession("wire-232");
    stub = installFetchStub([
      { method: "POST", path: /\/report\/task\/create\/$/, data: { task_id: "task-created-1" } },
    ]);
  });

  afterEach(() => {
    stub.restore();
    session.dispose();
  });

  it("tiktok_submit_report refuses before creating a task: no request leaves the process", async () => {
    await expect(
      submitReportLogic(submitInput as any, ctx, { sessionId: session.sessionId } as any)
    ).rejects.toMatchObject({
      code: -32600,
      message: expect.stringContaining("No report task was created"),
    });
    expect(stub.requests).toEqual([]);
  });

  it("the refusal names the SDK gap and points at the synchronous tools", async () => {
    const err = await submitReportLogic(submitInput as any, ctx, {
      sessionId: session.sessionId,
    } as any).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("no report-task download endpoint");
    expect(message).toContain("tiktok_get_report");
    expect(message).toContain("tiktok_get_report_breakdowns");
    expect(message).not.toContain("tiktok_download_report");
  });

  it("tiktok_submit_report dry_run refuses too instead of predicting a success nothing can use", async () => {
    await expect(
      submitReportLogic({ ...submitInput, dry_run: true } as any, ctx, {
        sessionId: session.sessionId,
      } as any)
    ).rejects.toMatchObject({ code: -32600 });
    expect(stub.requests).toEqual([]);
  });

  it("tiktok_download_report refuses without fetching the URL it was given", async () => {
    await expect(
      downloadReportLogic(
        {
          downloadUrl: "https://analytics.tiktok.com/reports/task-abc123/report.csv",
          storeRawCsv: false,
          mode: "summary",
          offset: 0,
        } as any,
        ctx,
        { sessionId: session.sessionId } as any
      )
    ).rejects.toMatchObject({
      code: -32600,
      message: expect.stringContaining("Nothing was downloaded"),
    });
    expect(stub.requests).toEqual([]);
  });

  it("tiktok_check_report_status sends the documented GET and never surfaces an undocumented download_url", async () => {
    // A download_url in the payload is NOT part of report_task_check.yml; the
    // tool must not turn it into a downloadUrl a client would then try to fetch.
    stub.restore();
    stub = installFetchStub([
      {
        method: "GET",
        path: /\/report\/task\/check\/$/,
        data: { status: "DONE", download_url: "https://example.com/undocumented.csv" },
      },
    ]);

    const result = await checkReportStatusLogic(
      { advertiserId: TEST_ADVERTISER_ID, taskId: "task-existing-1" },
      ctx,
      { sessionId: session.sessionId } as any
    );

    expect(stub.requests).toHaveLength(1);
    const [req] = stub.requests;
    expect(req.method).toBe("GET");
    expect(req.host).toBe("business-api.tiktok.com");
    expect(req.path).toBe("/open_api/v1.3/report/task/check/");
    expect(req.query).toEqual({ advertiser_id: TEST_ADVERTISER_ID, task_id: "task-existing-1" });
    expect(req.headers["access-token"]).toBe(TEST_ACCESS_TOKEN);

    expect(result.state).toBe("complete");
    expect(result.isComplete).toBe(true);
    expect(result).not.toHaveProperty("downloadUrl");
    expect(() => CheckReportStatusOutputSchema.parse(result)).not.toThrow();

    const text = checkReportStatusResponseFormatter(result)[0].text;
    expect(text).toContain("tiktok_get_report");
    expect(text).not.toContain("tiktok_download_report");
    expect(text).not.toContain("undocumented.csv");
  });
});
