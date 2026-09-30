import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
import {
  SA360SearchInputSchema,
  SA360SearchOutputSchema,
  sa360SearchLogic,
} from "../../src/mcp-server/tools/definitions/gaql-search.tool.js";

describe("SA360SearchInputSchema", () => {
  it("accepts valid search input", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.success).toBe(true);
  });

  it("defaults to summary mode", () => {
    const result = SA360SearchInputSchema.parse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.mode).toBe("summary");
  });

  it("rejects empty customerId", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty query", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts pageToken for pagination", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
      pageToken: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing customerId", () => {
    const result = SA360SearchInputSchema.safeParse({
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing query", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
    });
    expect(result.success).toBe(false);
  });
});

describe("sa360SearchLogic", () => {
  it("requests returnTotalResultsCount so the total can be reported", async () => {
    const sa360Search = vi.fn().mockResolvedValue({
      results: [{ campaign: { id: "1" } }],
      nextPageToken: "p2",
      totalResultsCount: 42,
    });
    vi.mocked(resolveSessionServices).mockReturnValue({ sa360Service: { sa360Search } } as any);

    const result = await sa360SearchLogic(
      SA360SearchInputSchema.parse({
        customerId: "1234567890",
        query: "SELECT campaign.id FROM campaign",
      }),
      { requestId: "r" } as any
    );

    expect(sa360Search.mock.calls[0][5]).toEqual({ returnTotalResultsCount: true });
    expect(result.totalResultsCount).toBe(42);
    expect(SA360SearchOutputSchema.safeParse(result).success).toBe(true);
  });
});
