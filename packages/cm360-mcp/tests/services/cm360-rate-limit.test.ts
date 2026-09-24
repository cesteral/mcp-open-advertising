/**
 * CM360 against a REAL platform limiter, not a `consume: vi.fn()` mock.
 *
 * Every call site used to consume the bare key `"cm360"`, which does not match
 * the configured pattern `cm360:*`, so nothing was ever limited while the
 * server card published 5/min. A mocked limiter cannot see that — it accepts
 * any key — so these tests build the limiter with the same factory the server
 * uses and observe whether calls are actually paced.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";
import { CM360Service } from "../../src/services/cm360/cm360-service.js";
import { CM360ReportingService } from "../../src/services/cm360/cm360-reporting-service.js";

const LIMIT = 5; // cm360's default CM360_RATE_LIMIT_PER_MINUTE

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "debug",
  } as any;
}

describe("CM360 rate limiting (real limiter)", () => {
  let limiter: RateLimiter;
  let httpClient: { fetch: ReturnType<typeof vi.fn>; fetchRaw: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    limiter = createPlatformRateLimiter("cm360", LIMIT);
    httpClient = {
      fetch: vi.fn().mockResolvedValue({ status: "PROCESSING" }),
      fetchRaw: vi.fn(),
    };
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("actually enforces the configured limit on trafficking calls", async () => {
    const service = new CM360Service(createMockLogger(), limiter, httpClient as any);

    for (let i = 0; i < LIMIT; i++) await service.getEntity("campaign", "12345", `c${i}`);
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT);

    // Over the cap: queued for the window, not sent. With the old bare key the
    // limiter found no config and this call went straight through.
    const over = service.getEntity("campaign", "12345", "over");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT);

    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it("keys trafficking per profile, so one profile's burst does not starve another", async () => {
    const service = new CM360Service(createMockLogger(), limiter, httpClient as any);
    for (let i = 0; i < LIMIT; i++) await service.getEntity("campaign", "111", `c${i}`);
    expect(limiter.getRemainingTokens("cm360:111")).toBe(0);

    await service.getEntity("campaign", "222", "c0");
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it("paces a bulk status update over the cap instead of failing the tail of the batch", async () => {
    const service = new CM360Service(createMockLogger(), limiter, httpClient as any);
    httpClient.fetch.mockImplementation(async (_path: string, _ctx: unknown, init?: RequestInit) =>
      init?.method === "PUT" ? {} : { id: "x", active: true }
    );

    // 6 items × (GET + PUT) = 12 calls at 5/min: needs three windows.
    const ids = ["1", "2", "3", "4", "5", "6"];
    const pending = service.bulkUpdateStatus("campaign", "12345", ids, "PAUSED", (c) => c);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    const results = await pending;

    expect(results.map((r) => r.success)).toEqual(ids.map(() => true));
    expect(httpClient.fetch).toHaveBeenCalledTimes(12);
  });

  it("gives reporting its own bucket, so report polls do not eat trafficking's budget", async () => {
    const reporting = new CM360ReportingService(limiter, httpClient as any, createMockLogger());
    const service = new CM360Service(createMockLogger(), limiter, httpClient as any);

    for (let i = 0; i < LIMIT; i++) await reporting.checkReportFile("12345", "r", "f");
    expect(limiter.getRemainingTokens("cm360:reporting:12345")).toBe(0);

    await service.getEntity("campaign", "12345", "c0");
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it("paces runReport's status polls down to the limit rather than failing the report", async () => {
    httpClient.fetch
      .mockResolvedValueOnce({ id: "report-1" }) // create
      .mockResolvedValueOnce({ id: "file-1" }) // run
      .mockResolvedValueOnce({ status: "PROCESSING" })
      .mockResolvedValueOnce({ status: "PROCESSING" })
      .mockResolvedValueOnce({ status: "PROCESSING" })
      .mockResolvedValueOnce({ status: "PROCESSING" }) // 6th call: over the cap
      .mockResolvedValueOnce({ status: "REPORT_AVAILABLE", urls: { apiUrl: "https://x" } });
    const reporting = new CM360ReportingService(limiter, httpClient as any, createMockLogger());

    const pending = reporting.runReport("12345", { name: "r", type: "STANDARD" });
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    const result = (await pending) as { downloadUrl?: string };

    expect(result.downloadUrl).toBe("https://x");
    expect(httpClient.fetch).toHaveBeenCalledTimes(7);
  });

  it("keeps userProfiles.list under the limiter", async () => {
    const service = new CM360Service(createMockLogger(), limiter, httpClient as any);
    await service.listUserProfiles();
    expect(limiter.getRemainingTokens("cm360:global")).toBe(LIMIT - 1);
  });
});
