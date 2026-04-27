// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * Canonical shape returned by every `*_list_report_schedules` and
 * `*_get_report_schedule` tool so callers can build cross-platform
 * schedule dashboards without branching on platform-specific envelope
 * shapes (TTD, CM360, MSADS today; Meta + SA360 in Phase 3 CRUD tracks).
 *
 * Platform-specific extras are allowed but should be pushed into the
 * `platformSpecific` bag rather than the top level so the canonical
 * fields stay stable.
 */
export const ReportScheduleSummarySchema = z.object({
  /** Platform-provided schedule identifier. */
  scheduleId: z.string().min(1),
  /** Human-readable name. */
  name: z.string(),
  /** Which platform this schedule lives on. Must match ReportingPlatform. */
  platform: z.enum([
    "ttd",
    "meta",
    "google",
    "dbm",
    "cm360",
    "sa360",
    "tiktok",
    "linkedin",
    "pinterest",
    "snapchat",
    "amazonDsp",
    "microsoft",
  ]),
  /** Cadence. `CUSTOM` covers platform-specific cron-like constructs. */
  frequency: z.enum(["SINGLE_RUN", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "CUSTOM"]),
  /** Lifecycle state. */
  status: z.enum(["ACTIVE", "DISABLED"]),
  /** Platform report-type identifier when the platform exposes one. */
  reportType: z.string().optional(),
  /** Scoped advertiser IDs when the platform scopes schedules by advertiser. */
  advertiserIds: z.array(z.string()).optional(),
  /** Next scheduled run, ISO-8601 UTC, when the platform reports it. */
  nextRunAt: z.string().datetime().optional(),
  /** Most recent run, ISO-8601 UTC, when the platform reports it. */
  lastRunAt: z.string().datetime().optional(),
  /** Creation timestamp when the platform reports it. */
  createdAt: z.string().datetime().optional(),
  /** Last-update timestamp when the platform reports it. */
  updatedAt: z.string().datetime().optional(),
  /** Any fields that do not map into the canonical shape. */
  platformSpecific: z.record(z.unknown()).optional(),
});

export type ReportScheduleSummary = z.infer<typeof ReportScheduleSummarySchema>;

// ─── Per-platform normalizers ──────────────────────────────────────────────

/**
 * Normalize a TTD report-schedule envelope (REST `myReportsReportSchedule`
 * or GraphQL schedule node) to {@link ReportScheduleSummary}.
 *
 * TTD returns `ReportScheduleType` (Once|Daily|Weekly|Monthly) plus an
 * implicit `Enabled` boolean; this normalizer maps both.
 */
export function fromTtdSchedule(raw: {
  ReportScheduleId?: string | number;
  ReportScheduleName?: string;
  ReportScheduleType?: string;
  ReportTemplateId?: string | number;
  AdvertiserFilters?: string[];
  Enabled?: boolean;
  NextRunAt?: string;
  LastRunAt?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
}): ReportScheduleSummary {
  const scheduleType = (raw.ReportScheduleType ?? "Once").toUpperCase();
  const freqMap: Record<string, ReportScheduleSummary["frequency"]> = {
    ONCE: "SINGLE_RUN",
    DAILY: "DAILY",
    WEEKLY: "WEEKLY",
    MONTHLY: "MONTHLY",
  };
  return {
    scheduleId: String(raw.ReportScheduleId ?? ""),
    name: raw.ReportScheduleName ?? "",
    platform: "ttd",
    frequency: freqMap[scheduleType] ?? "CUSTOM",
    status: raw.Enabled === false ? "DISABLED" : "ACTIVE",
    ...(raw.ReportTemplateId !== undefined ? { reportType: String(raw.ReportTemplateId) } : {}),
    ...(raw.AdvertiserFilters && raw.AdvertiserFilters.length > 0
      ? { advertiserIds: raw.AdvertiserFilters }
      : {}),
    ...(raw.NextRunAt ? { nextRunAt: raw.NextRunAt } : {}),
    ...(raw.LastRunAt ? { lastRunAt: raw.LastRunAt } : {}),
    ...(raw.CreatedAt ? { createdAt: raw.CreatedAt } : {}),
    ...(raw.UpdatedAt ? { updatedAt: raw.UpdatedAt } : {}),
  };
}

/**
 * Normalize a CM360 report resource (`userProfiles/{id}/reports/{id}` GET
 * response) to {@link ReportScheduleSummary}. CM360 nests schedule config
 * under `schedule` with `repeats` / `repeatsOnWeekDays` / `every`; this
 * normalizer maps `repeats` to our frequency enum.
 */
export function fromCm360Schedule(raw: {
  id?: string | number;
  name?: string;
  type?: string;
  accountId?: string | number;
  schedule?: {
    active?: boolean;
    repeats?: string;
    every?: number;
    startDate?: string;
    expirationDate?: string;
  };
  lastModifiedTime?: string;
}): ReportScheduleSummary {
  const schedule = raw.schedule ?? {};
  const repeats = (schedule.repeats ?? "").toUpperCase();
  const freqMap: Record<string, ReportScheduleSummary["frequency"]> = {
    DAILY: "DAILY",
    WEEKLY: "WEEKLY",
    MONTHLY: "MONTHLY",
    QUARTERLY: "QUARTERLY",
  };
  // CM360 reports with no schedule block still have a valid get endpoint; we
  // treat those as SINGLE_RUN since they fire once when `runReport` is called.
  const frequency: ReportScheduleSummary["frequency"] = !schedule.repeats
    ? "SINGLE_RUN"
    : (freqMap[repeats] ?? "CUSTOM");
  return {
    scheduleId: String(raw.id ?? ""),
    name: raw.name ?? "",
    platform: "cm360",
    frequency,
    status: schedule.active === false ? "DISABLED" : "ACTIVE",
    ...(raw.type ? { reportType: raw.type } : {}),
    ...(raw.accountId !== undefined ? { advertiserIds: [String(raw.accountId)] } : {}),
    ...(schedule.startDate ? { createdAt: new Date(schedule.startDate).toISOString() } : {}),
    ...(raw.lastModifiedTime
      ? { updatedAt: new Date(Number(raw.lastModifiedTime)).toISOString() }
      : {}),
  };
}

/**
 * Normalize a Microsoft Advertising ReportRequest / scheduled report
 * envelope to {@link ReportScheduleSummary}. Microsoft Ads does not return
 * schedules in a uniform shape — this normalizer accepts the fields the
 * current `msads_create_report_schedule` helper returns.
 */
export function fromMsAdsSchedule(raw: {
  scheduleId?: string | number;
  scheduleName?: string;
  ReportName?: string;
  reportType?: string;
  Type?: string;
  accountId?: string | number;
  schedule?: {
    Type?: string;
    StartDate?: { Year: number; Month: number; Day: number };
    EndDate?: { Year: number; Month: number; Day: number };
  };
  enabled?: boolean;
}): ReportScheduleSummary {
  const scheduleType = (raw.schedule?.Type ?? "Once").toUpperCase();
  const freqMap: Record<string, ReportScheduleSummary["frequency"]> = {
    ONCE: "SINGLE_RUN",
    DAILY: "DAILY",
    WEEKLY: "WEEKLY",
    MONTHLY: "MONTHLY",
  };
  const toIso = (d?: { Year: number; Month: number; Day: number }): string | undefined => {
    if (!d) return undefined;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.Year}-${pad(d.Month)}-${pad(d.Day)}T00:00:00.000Z`;
  };
  return {
    scheduleId: String(raw.scheduleId ?? ""),
    name: raw.scheduleName ?? raw.ReportName ?? "",
    platform: "microsoft",
    frequency: freqMap[scheduleType] ?? "CUSTOM",
    status: raw.enabled === false ? "DISABLED" : "ACTIVE",
    ...(raw.reportType ? { reportType: raw.reportType } : raw.Type ? { reportType: raw.Type } : {}),
    ...(raw.accountId !== undefined ? { advertiserIds: [String(raw.accountId)] } : {}),
    ...(toIso(raw.schedule?.StartDate) ? { createdAt: toIso(raw.schedule?.StartDate)! } : {}),
  };
}
