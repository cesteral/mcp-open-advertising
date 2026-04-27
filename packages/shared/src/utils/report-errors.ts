// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { JsonRpcErrorCode, McpError } from "./mcp-errors.js";

/** Platforms whose reporting errors are normalized through {@link mapReportingError}. */
export type ReportingPlatform =
  | "ttd"
  | "meta"
  | "google"
  | "dbm"
  | "cm360"
  | "sa360"
  | "tiktok"
  | "linkedin"
  | "pinterest"
  | "snapchat"
  | "amazonDsp"
  | "microsoft";

export interface ReportingErrorData {
  platform: ReportingPlatform;
  upstreamCode?: string | number;
  retryable: boolean;
  rawMessage?: string;
  [key: string]: unknown;
}

/**
 * Canonical error thrown from every reporting service layer after
 * {@link mapReportingError} has normalized an upstream failure.
 *
 * Carries {@link platform}, {@link upstreamCode}, and {@link retryable}
 * so downstream handlers (and the `InteractionLogger` upstream trail) can
 * consistently reason about the failure mode without parsing a message string.
 */
export class ReportingError extends McpError {
  readonly platform: ReportingPlatform;
  readonly upstreamCode?: string | number;
  readonly retryable: boolean;

  constructor(message: string, data: ReportingErrorData) {
    super(JsonRpcErrorCode.InternalError, message, data);
    this.name = "ReportingError";
    this.platform = data.platform;
    this.upstreamCode = data.upstreamCode;
    this.retryable = data.retryable;
  }
}

interface HttpLikeError {
  response?: {
    status?: number;
    data?: unknown;
  };
  message?: string;
}

/**
 * Normalize an upstream reporting failure into a {@link ReportingError}.
 *
 * - 429 and 5xx statuses are flagged as `retryable: true`.
 * - Platform-specific error envelopes (TTD `ErrorCode`/`Message`, Meta
 *   `error.code`/`error.message`, Google RPC `error.status`/`error.message`,
 *   Microsoft `Errors[0].Code`/`Errors[0].Message`) are unpacked when present.
 * - An existing {@link ReportingError} is returned unchanged.
 */
export function mapReportingError(err: unknown, platform: ReportingPlatform): ReportingError {
  if (err instanceof ReportingError) return err;

  const httpErr = err as HttpLikeError;
  const status = httpErr.response?.status;
  const body = httpErr.response?.data as Record<string, unknown> | undefined;
  const retryable = status === 429 || (typeof status === "number" && status >= 500);

  let upstreamCode: string | number | undefined = status;
  let msg = httpErr.message ?? "Reporting call failed";

  if (body) {
    if (platform === "ttd") {
      const e = body as { ErrorCode?: string; Message?: string };
      if (e.ErrorCode) upstreamCode = e.ErrorCode;
      if (e.Message) msg = e.Message;
    } else if (platform === "meta") {
      const e = body as { error?: { code?: number; message?: string } };
      if (typeof e.error?.code === "number") upstreamCode = e.error.code;
      if (e.error?.message) msg = e.error.message;
    } else if (
      platform === "google" ||
      platform === "dbm" ||
      platform === "cm360" ||
      platform === "sa360"
    ) {
      const e = body as { error?: { status?: string; message?: string } };
      if (e.error?.status) upstreamCode = e.error.status;
      if (e.error?.message) msg = e.error.message;
    } else if (platform === "microsoft") {
      const e = body as { Errors?: Array<{ Code?: string; Message?: string }> };
      const first = e.Errors?.[0];
      if (first?.Code) upstreamCode = first.Code;
      if (first?.Message) msg = first.Message;
    }
  }

  return new ReportingError(msg, {
    platform,
    upstreamCode,
    retryable,
    rawMessage: msg,
  });
}
