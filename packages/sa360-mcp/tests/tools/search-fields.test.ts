import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
import {
  SearchFieldsInputSchema,
  SearchFieldsOutputSchema,
  searchFieldsLogic,
  searchFieldsResponseFormatter,
} from "../../src/mcp-server/tools/definitions/search-fields.tool.js";

describe("SearchFieldsInputSchema", () => {
  it("accepts valid query", () => {
    const result = SearchFieldsInputSchema.safeParse({
      query: "SELECT name FROM searchAds360Fields WHERE name LIKE 'campaign.%'",
    });
    expect(result.success).toBe(true);
  });

  it("requires query", () => {
    const result = SearchFieldsInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty query", () => {
    const result = SearchFieldsInputSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("defaults pageSize to 100", () => {
    const result = SearchFieldsInputSchema.parse({
      query: "SELECT name FROM searchAds360Fields",
    });
    expect(result.pageSize).toBe(100);
  });

  it("accepts custom pageSize", () => {
    const result = SearchFieldsInputSchema.safeParse({
      query: "SELECT name FROM searchAds360Fields",
      pageSize: 200,
    });
    expect(result.success).toBe(true);
  });

  it("rejects pageSize over 1000", () => {
    const result = SearchFieldsInputSchema.safeParse({
      query: "SELECT name FROM searchAds360Fields",
      pageSize: 1001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize less than 1", () => {
    const result = SearchFieldsInputSchema.safeParse({
      query: "SELECT name FROM searchAds360Fields",
      pageSize: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("searchFieldsLogic", () => {
  it("forwards pageToken and surfaces totalResultsCount + nextPageToken", async () => {
    const searchFields = vi.fn().mockResolvedValue({
      fields: [{ name: "campaign.id" }],
      totalResultsCount: 250,
      nextPageToken: "tok-2",
    });
    vi.mocked(resolveSessionServices).mockReturnValue({ sa360Service: { searchFields } } as any);

    const input = SearchFieldsInputSchema.parse({
      query: "SELECT name FROM searchAds360Fields",
      pageToken: "tok-1",
    });
    const result = await searchFieldsLogic(input, { requestId: "r" } as any);

    expect(searchFields).toHaveBeenCalledWith(
      "SELECT name FROM searchAds360Fields",
      100,
      "tok-1",
      expect.anything()
    );
    expect(result.totalResultsCount).toBe(250);
    expect(result.nextPageToken).toBe("tok-2");
    expect(SearchFieldsOutputSchema.safeParse(result).success).toBe(true);
    const text = searchFieldsResponseFormatter(result)[0].text;
    expect(text).toContain("250 total");
    expect(text).toContain("tok-2");
  });

  it("omits nextPageToken on the last page", async () => {
    const searchFields = vi.fn().mockResolvedValue({ fields: [], totalResultsCount: 0 });
    vi.mocked(resolveSessionServices).mockReturnValue({ sa360Service: { searchFields } } as any);

    const result = await searchFieldsLogic(
      SearchFieldsInputSchema.parse({ query: "SELECT name FROM searchAds360Fields" }),
      { requestId: "r" } as any
    );

    expect(result).not.toHaveProperty("nextPageToken");
    expect(result.totalResultsCount).toBe(0);
  });
});
