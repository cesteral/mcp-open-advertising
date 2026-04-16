// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * Canonical report-status shape returned by `*_check_report_status` tools across
 * every reporting-capable MCP server.
 */
export const ReportStatusSchema = z.object({
  state: z.enum(["pending", "running", "complete", "failed", "cancelled"]),
  progress: z.number().min(0).max(1).optional(),
  downloadUrl: z.string().url().optional(),
  errors: z.array(z.string()).optional(),
  submittedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export type ReportStatus = z.infer<typeof ReportStatusSchema>;

/**
 * Normalize a The Trade Desk report execution status to {@link ReportStatus}.
 */
export function fromTtdStatus(raw: {
  ExecutionState?: string;
  ReportDownloadUrl?: string;
}): ReportStatus {
  const map: Record<string, ReportStatus["state"]> = {
    Pending: "pending",
    InProgress: "running",
    Complete: "complete",
    Failed: "failed",
    Cancelled: "cancelled",
  };
  return {
    state: map[raw.ExecutionState ?? "Pending"] ?? "pending",
    ...(raw.ReportDownloadUrl ? { downloadUrl: raw.ReportDownloadUrl } : {}),
  };
}

/**
 * Normalize a Meta async report status (`async_status` + optional percent) to
 * {@link ReportStatus}.
 */
export function fromMetaStatus(raw: {
  async_status?: string;
  async_percent_completion?: number;
}): ReportStatus {
  const s = raw.async_status ?? "";
  const state: ReportStatus["state"] =
    s === "Job Completed"
      ? "complete"
      : s === "Job Failed"
        ? "failed"
        : s === "Job Started" || s === "Job Running"
          ? "running"
          : "pending";
  return {
    state,
    ...(typeof raw.async_percent_completion === "number"
      ? { progress: raw.async_percent_completion / 100 }
      : {}),
  };
}

/**
 * Normalize a Google long-running operation (used by DV360/CM360/SA360) to
 * {@link ReportStatus}.
 */
export function fromGoogleStatus(raw: {
  done?: boolean;
  error?: unknown;
}): ReportStatus {
  if (raw.error) {
    const msg =
      typeof raw.error === "object" && raw.error !== null && "message" in raw.error
        ? String((raw.error as { message: unknown }).message)
        : String(raw.error);
    return { state: "failed", errors: [msg] };
  }
  return { state: raw.done ? "complete" : "running" };
}

/**
 * Normalize a Microsoft Advertising `ReportRequestStatus` envelope to
 * {@link ReportStatus}.
 */
export function fromMicrosoftStatus(raw: {
  ReportRequestStatus?: string;
  ReportDownloadUrl?: string;
}): ReportStatus {
  const s = raw.ReportRequestStatus ?? "";
  const state: ReportStatus["state"] =
    s === "Success" ? "complete" : s === "Error" ? "failed" : "running";
  return {
    state,
    ...(raw.ReportDownloadUrl ? { downloadUrl: raw.ReportDownloadUrl } : {}),
  };
}
