// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import {
  ReportScheduleSummarySchema,
  fromTtdSchedule,
  fromCm360Schedule,
  fromMsAdsSchedule,
} from "../../src/schemas/report-schedule.js";

describe("ReportScheduleSummarySchema", () => {
  it("accepts a minimal canonical payload", () => {
    const parsed = ReportScheduleSummarySchema.parse({
      scheduleId: "s-1",
      name: "Daily perf",
      platform: "ttd",
      frequency: "DAILY",
      status: "ACTIVE",
    });
    expect(parsed.scheduleId).toBe("s-1");
  });

  it("rejects an unknown platform", () => {
    expect(() =>
      ReportScheduleSummarySchema.parse({
        scheduleId: "s-1",
        name: "n",
        platform: "myspace",
        frequency: "DAILY",
        status: "ACTIVE",
      }),
    ).toThrow();
  });

  it("rejects an unknown frequency", () => {
    expect(() =>
      ReportScheduleSummarySchema.parse({
        scheduleId: "s-1",
        name: "n",
        platform: "ttd",
        frequency: "FORTNIGHTLY",
        status: "ACTIVE",
      }),
    ).toThrow();
  });
});

describe("fromTtdSchedule", () => {
  it("maps ReportScheduleType + enabled flag", () => {
    const result = fromTtdSchedule({
      ReportScheduleId: 12345,
      ReportScheduleName: "Weekly ROI",
      ReportScheduleType: "Weekly",
      ReportTemplateId: 99,
      AdvertiserFilters: ["adv-1", "adv-2"],
      Enabled: true,
    });
    expect(result.scheduleId).toBe("12345");
    expect(result.platform).toBe("ttd");
    expect(result.frequency).toBe("WEEKLY");
    expect(result.status).toBe("ACTIVE");
    expect(result.reportType).toBe("99");
    expect(result.advertiserIds).toEqual(["adv-1", "adv-2"]);
    expect(() => ReportScheduleSummarySchema.parse(result)).not.toThrow();
  });

  it("treats Enabled=false as DISABLED", () => {
    const result = fromTtdSchedule({
      ReportScheduleId: "s",
      ReportScheduleName: "x",
      ReportScheduleType: "Daily",
      Enabled: false,
    });
    expect(result.status).toBe("DISABLED");
  });

  it("maps Once to SINGLE_RUN and unknown to CUSTOM", () => {
    expect(fromTtdSchedule({ ReportScheduleId: "a", ReportScheduleType: "Once" }).frequency).toBe(
      "SINGLE_RUN",
    );
    expect(fromTtdSchedule({ ReportScheduleId: "b", ReportScheduleType: "Cron" }).frequency).toBe(
      "CUSTOM",
    );
  });
});

describe("fromCm360Schedule", () => {
  it("maps a scheduled CM360 report", () => {
    const result = fromCm360Schedule({
      id: 100,
      name: "Campaign overview",
      type: "STANDARD",
      accountId: 55,
      schedule: {
        active: true,
        repeats: "WEEKLY",
        every: 1,
        startDate: "2026-01-01",
      },
      lastModifiedTime: "1717200000000",
    });
    expect(result.scheduleId).toBe("100");
    expect(result.platform).toBe("cm360");
    expect(result.frequency).toBe("WEEKLY");
    expect(result.status).toBe("ACTIVE");
    expect(result.reportType).toBe("STANDARD");
    expect(result.advertiserIds).toEqual(["55"]);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(() => ReportScheduleSummarySchema.parse(result)).not.toThrow();
  });

  it("defaults to SINGLE_RUN when schedule.repeats is absent", () => {
    const result = fromCm360Schedule({ id: 1, name: "x" });
    expect(result.frequency).toBe("SINGLE_RUN");
  });

  it("treats schedule.active=false as DISABLED", () => {
    const result = fromCm360Schedule({
      id: 1,
      name: "x",
      schedule: { active: false, repeats: "DAILY" },
    });
    expect(result.status).toBe("DISABLED");
  });

  it("maps QUARTERLY", () => {
    const result = fromCm360Schedule({
      id: 1,
      name: "x",
      schedule: { repeats: "QUARTERLY" },
    });
    expect(result.frequency).toBe("QUARTERLY");
  });
});

describe("fromMsAdsSchedule", () => {
  it("maps an MSADS report schedule return value", () => {
    const result = fromMsAdsSchedule({
      scheduleId: "abc-123",
      scheduleName: "Daily spend",
      reportType: "CampaignPerformanceReportRequest",
      accountId: 999,
      schedule: {
        Type: "Daily",
        StartDate: { Year: 2026, Month: 3, Day: 1 },
      },
      enabled: true,
    });
    expect(result.scheduleId).toBe("abc-123");
    expect(result.platform).toBe("microsoft");
    expect(result.frequency).toBe("DAILY");
    expect(result.status).toBe("ACTIVE");
    expect(result.reportType).toBe("CampaignPerformanceReportRequest");
    expect(result.advertiserIds).toEqual(["999"]);
    expect(result.createdAt).toBe("2026-03-01T00:00:00.000Z");
    expect(() => ReportScheduleSummarySchema.parse(result)).not.toThrow();
  });

  it("treats enabled=false as DISABLED", () => {
    const result = fromMsAdsSchedule({
      scheduleId: "x",
      scheduleName: "n",
      schedule: { Type: "Monthly" },
      enabled: false,
    });
    expect(result.status).toBe("DISABLED");
    expect(result.frequency).toBe("MONTHLY");
  });

  it("falls back to ReportName when scheduleName missing", () => {
    const result = fromMsAdsSchedule({
      scheduleId: "x",
      ReportName: "Fallback Name",
      schedule: { Type: "Weekly" },
    });
    expect(result.name).toBe("Fallback Name");
  });
});
