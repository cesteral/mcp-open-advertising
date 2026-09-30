/**
 * The v2 (DoubleClick Search) services against a REAL platform limiter.
 *
 * They consumed `sa360v2:…` keys while the limiter is configured for `sa360:*`
 * only, so v2 reporting and — the governed writes — offline conversion
 * uploads were never throttled. A `consume: vi.fn()` mock accepts any key and
 * cannot catch that, so this builds the limiter with the server's own factory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";
import { ConversionService } from "../../src/services/sa360-v2/conversion-service.js";
import { SA360ReportingService } from "../../src/services/sa360-v2/reporting-service.js";

const LIMIT = 2;

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

const row = {
  clickId: "click-1",
  conversionId: "order-1",
  conversionTimestamp: "1700000000000",
  segmentationType: "FLOODLIGHT",
};

describe("SA360 v2 rate limiting (real limiter)", () => {
  let limiter: RateLimiter;
  let httpClient: { fetch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    limiter = createPlatformRateLimiter("sa360", LIMIT);
    httpClient = { fetch: vi.fn().mockResolvedValue({ id: "r1", isReportReady: false }) };
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("throttles conversion uploads under the sa360 limit", async () => {
    const service = new ConversionService(createMockLogger(), limiter, httpClient as any);

    for (let i = 0; i < LIMIT; i++) await service.insertConversions("ag", "adv-1", [row]);
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT);

    const over = service.updateConversions("ag", "adv-1", [row]);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT);
    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT + 1);
  });

  // Why the governed conversion tools carry no bulk-capacity pre-check
  // (`assertBulkCapacity`): a whole batch — up to the tools' 200-row max — is
  // ONE POST/PUT and ONE token on `sa360:v2:{advertiserId}`, so its rate-limit
  // cost does not grow with input size. If this ever becomes per-row (e.g.
  // chunking), the tools must project the batch before the confirmation prompt.
  it("spends one token and one request per conversion batch, regardless of row count", async () => {
    const service = new ConversionService(createMockLogger(), limiter, httpClient as any);
    const rows = Array.from({ length: 200 }, (_, i) => ({ ...row, conversionId: `order-${i}` }));

    await service.insertConversions("ag", "adv-1", rows);
    expect(httpClient.fetch).toHaveBeenCalledTimes(1);
    expect(limiter.getRemainingTokens("sa360:v2:adv-1")).toBe(LIMIT - 1);

    await service.updateConversions("ag", "adv-1", rows);
    expect(httpClient.fetch).toHaveBeenCalledTimes(2);
    expect(limiter.getRemainingTokens("sa360:v2:adv-1")).toBe(LIMIT - 2);
  });

  it("throttles v2 report submission and polling under the sa360 limit", async () => {
    const service = new SA360ReportingService(
      createMockLogger(),
      limiter,
      httpClient as any,
      {} as any
    );

    for (let i = 0; i < LIMIT; i++) await service.getReportStatus("r1");
    expect(limiter.getRemainingTokens("sa360:v2:reports")).toBe(0);

    const over = service.getReportStatus("r1");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT);
    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT + 1);
  });
});
