// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";

export class ReportTimeoutError extends McpError {
  constructor(attempts: number) {
    super(
      JsonRpcErrorCode.InternalError,
      `Report polling exceeded ${attempts} attempts`,
    );
    this.name = "ReportTimeoutError";
  }
}

export class ReportFailedError<T = unknown> extends McpError {
  readonly status: T;
  constructor(status: T, message = "Report generation failed") {
    super(JsonRpcErrorCode.InternalError, message, {
      status: status as unknown as Record<string, unknown>,
    });
    this.name = "ReportFailedError";
    this.status = status;
  }
}

export interface PollOptions<T> {
  fetchStatus: () => Promise<T>;
  isComplete: (status: T) => boolean;
  isFailed?: (status: T) => boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  backoffFactor?: number;
  signal?: AbortSignal;
}

export async function pollUntilComplete<T>(opts: PollOptions<T>): Promise<T> {
  const {
    fetchStatus,
    isComplete,
    isFailed,
    initialDelayMs = 2000,
    maxDelayMs = 30000,
    maxAttempts = 60,
    backoffFactor = 1.5,
    signal,
  } = opts;

  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error("Polling aborted");
    const status = await fetchStatus();
    if (isFailed?.(status)) throw new ReportFailedError(status);
    if (isComplete(status)) return status;
    if (attempt === maxAttempts) break;
    await sleep(delay, signal);
    delay = Math.min(Math.round(delay * backoffFactor), maxDelayMs);
  }
  throw new ReportTimeoutError(maxAttempts);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Polling aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
