// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  ListReportColumnsInputSchema,
  listReportColumnsLogic,
  listReportColumnsResponseFormatter,
  listReportColumnsTool,
} from "../../src/mcp-server/tools/definitions/list-report-columns.tool.js";

const baseContext = { requestId: "req-1" } as any;
const baseSdkContext = { sessionId: "s-1" } as any;

describe("sa360_list_report_columns input schema", () => {
  it("accepts empty input", () => {
    expect(ListReportColumnsInputSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a specific resource", () => {
    expect(ListReportColumnsInputSchema.safeParse({ resource: "campaign" }).success).toBe(true);
  });

  it("defaults includeMetrics and includeSegments to true", () => {
    const parsed = ListReportColumnsInputSchema.parse({ resource: "campaign" });
    expect(parsed.includeMetrics).toBe(true);
    expect(parsed.includeSegments).toBe(true);
    expect(parsed.preferLive).toBe(true);
  });
});

describe("listReportColumnsLogic — catalog path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the full catalog when no resource is supplied", async () => {
    const result = await listReportColumnsLogic({ preferLive: false }, baseContext, baseSdkContext);
    expect(result.source).toBe("catalog");
    expect(result.resource).toBeNull();
    expect(result.fieldGroups).toBeDefined();
    expect(result.fieldGroups!.campaign).toBeDefined();
    expect(result.fieldGroups!.metrics).toBeDefined();
    expect(result.fields.length).toBeGreaterThan(10);
    expect(result.fields[0]).toHaveProperty("name");
  });

  it("scopes to a single resource plus metrics + segments by default", async () => {
    const result = await listReportColumnsLogic(
      { resource: "campaign", preferLive: false },
      baseContext,
      baseSdkContext
    );
    expect(result.source).toBe("catalog");
    expect(result.resource).toBe("campaign");
    expect(Object.keys(result.fieldGroups!)).toEqual(
      expect.arrayContaining(["campaign", "metrics", "segments"])
    );
  });

  it("respects includeMetrics=false and includeSegments=false", async () => {
    const result = await listReportColumnsLogic(
      {
        resource: "ad_group",
        includeMetrics: false,
        includeSegments: false,
        preferLive: false,
      },
      baseContext,
      baseSdkContext
    );
    expect(Object.keys(result.fieldGroups!)).toEqual(["ad_group"]);
  });

  it("falls back to full catalog when the resource is unknown", async () => {
    const result = await listReportColumnsLogic(
      { resource: "zzz_not_a_resource", preferLive: false },
      baseContext,
      baseSdkContext
    );
    // No scoping — returns all groups
    expect(Object.keys(result.fieldGroups!).length).toBeGreaterThan(1);
  });
});

describe("listReportColumnsLogic — live path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns live fields when preferLive is true and the live call succeeds", async () => {
    const mockSearchFields = vi.fn().mockResolvedValue({
      fields: [
        {
          name: "campaign.id",
          category: "RESOURCE",
          data_type: "INT64",
          selectable: true,
          filterable: true,
          sortable: false,
        },
      ],
      totalSize: 1,
    });
    mockResolveSession.mockReturnValue({
      sa360Service: { searchFields: mockSearchFields },
    } as any);

    const result = await listReportColumnsLogic(
      { resource: "campaign" },
      baseContext,
      baseSdkContext
    );
    expect(result.source).toBe("live");
    expect(result.resource).toBe("campaign");
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({ name: "campaign.id" });
    expect(result.fieldGroups).toBeUndefined();
    expect(mockSearchFields).toHaveBeenCalled();
    const query = mockSearchFields.mock.calls[0]?.[0];
    expect(query).toContain("'campaign.%'");
  });

  it("falls back to catalog when the live call throws", async () => {
    const mockSearchFields = vi.fn().mockRejectedValue(new Error("no creds"));
    mockResolveSession.mockReturnValue({
      sa360Service: { searchFields: mockSearchFields },
    } as any);

    const result = await listReportColumnsLogic(
      { resource: "campaign" },
      baseContext,
      baseSdkContext
    );
    expect(result.source).toBe("catalog");
    expect(result.resource).toBe("campaign");
  });

  it("falls back to catalog when the live call returns zero fields", async () => {
    const mockSearchFields = vi.fn().mockResolvedValue({ fields: [], totalSize: 0 });
    mockResolveSession.mockReturnValue({
      sa360Service: { searchFields: mockSearchFields },
    } as any);

    const result = await listReportColumnsLogic(
      { resource: "campaign" },
      baseContext,
      baseSdkContext
    );
    expect(result.source).toBe("catalog");
  });
});

describe("listReportColumnsResponseFormatter", () => {
  it("renders catalog groups when source is catalog", async () => {
    const result = await listReportColumnsLogic(
      { resource: "campaign", preferLive: false },
      baseContext,
      baseSdkContext
    );
    const content = listReportColumnsResponseFormatter(result);
    expect(content).toHaveLength(1);
    expect(content[0]!.text).toContain("SA360 report columns");
    expect(content[0]!.text).toContain("source: catalog");
    expect(content[0]!.text).toContain("campaign");
    expect(content[0]!.text).toContain("metrics");
  });

  it("renders live fields when source is live", () => {
    const content = listReportColumnsResponseFormatter({
      resource: "campaign",
      source: "live",
      fields: [{ name: "campaign.id", selectable: true }],
      notes: ["note-1"],
      timestamp: new Date().toISOString(),
    });
    expect(content[0]!.text).toContain("source: live");
    expect(content[0]!.text).toContain("campaign.id");
    expect(content[0]!.text).toContain("note-1");
  });
});

describe("tool metadata", () => {
  it("is a read-only discovery tool", () => {
    expect(listReportColumnsTool.name).toBe("sa360_list_report_columns");
    expect(listReportColumnsTool.annotations.readOnlyHint).toBe(true);
  });
});
