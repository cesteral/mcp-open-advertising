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
export function fromGoogleStatus(raw: { done?: boolean; error?: unknown }): ReportStatus {
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

/**
 * Normalize a CM360 report-file status (`PROCESSING`/`REPORT_AVAILABLE`/
 * `FAILED`/`CANCELLED`) to {@link ReportStatus}.
 *
 * CM360 has its own state machine — distinct from the generic Google
 * long-running operation shape handled by {@link fromGoogleStatus}.
 */
export function fromCm360Status(raw: { status?: string; downloadUrl?: string }): ReportStatus {
  const s = raw.status ?? "";
  const state: ReportStatus["state"] =
    s === "REPORT_AVAILABLE"
      ? "complete"
      : s === "FAILED"
        ? "failed"
        : s === "CANCELLED"
          ? "cancelled"
          : s === "PROCESSING"
            ? "running"
            : "pending";
  return {
    state,
    ...(raw.downloadUrl ? { downloadUrl: raw.downloadUrl } : {}),
  };
}

/**
 * Normalize a TikTok report task status (`PENDING`/`RUNNING`/`DONE`/`FAILED`)
 * to {@link ReportStatus}.
 */
export function fromTikTokStatus(raw: { status?: string; downloadUrl?: string }): ReportStatus {
  const s = raw.status ?? "";
  const state: ReportStatus["state"] =
    s === "DONE" ? "complete" : s === "FAILED" ? "failed" : s === "RUNNING" ? "running" : "pending";
  return {
    state,
    ...(raw.downloadUrl ? { downloadUrl: raw.downloadUrl } : {}),
  };
}

/**
 * Normalize a Snapchat report status (`PENDING`/`RUNNING`/`COMPLETE`/
 * `FAILED`) to {@link ReportStatus}. Accepts both Snapchat's raw API strings
 * (e.g. `STARTED`, `COMPLETED`) and the pre-normalized forms emitted by
 * snapchat-mcp's internal status normalizer.
 */
export function fromSnapchatStatus(raw: { status?: string; downloadUrl?: string }): ReportStatus {
  const s = (raw.status ?? "").toUpperCase();
  const state: ReportStatus["state"] =
    s === "COMPLETE" || s === "COMPLETED"
      ? "complete"
      : s === "FAILED"
        ? "failed"
        : s === "RUNNING" || s === "STARTED"
          ? "running"
          : "pending";
  return {
    state,
    ...(raw.downloadUrl ? { downloadUrl: raw.downloadUrl } : {}),
  };
}

/**
 * Normalize an Amazon DSP report status (`PENDING`/`PROCESSING`/`COMPLETED`/
 * `FAILED`) to {@link ReportStatus}.
 */
export function fromAmazonDspStatus(raw: { status?: string; downloadUrl?: string }): ReportStatus {
  const s = (raw.status ?? "").toUpperCase();
  const state: ReportStatus["state"] =
    s === "COMPLETED" || s === "SUCCESS"
      ? "complete"
      : s === "FAILED"
        ? "failed"
        : s === "CANCELLED"
          ? "cancelled"
          : s === "PROCESSING" || s === "RUNNING"
            ? "running"
            : "pending";
  return {
    state,
    ...(raw.downloadUrl ? { downloadUrl: raw.downloadUrl } : {}),
  };
}

/**
 * Normalize a Pinterest async report status (`IN_PROGRESS`/`FINISHED`/
 * `FAILED`/`EXPIRED`/`DOES_NOT_EXIST`) to {@link ReportStatus}. `EXPIRED`
 * and `DOES_NOT_EXIST` surface as `failed` since the artifact is no longer
 * retrievable.
 */
export function fromPinterestStatus(raw: { status?: string; downloadUrl?: string }): ReportStatus {
  const s = raw.status ?? "";
  const state: ReportStatus["state"] =
    s === "FINISHED"
      ? "complete"
      : s === "FAILED" || s === "EXPIRED" || s === "DOES_NOT_EXIST"
        ? "failed"
        : s === "IN_PROGRESS"
          ? "running"
          : "pending";
  return {
    state,
    ...(raw.downloadUrl ? { downloadUrl: raw.downloadUrl } : {}),
  };
}
