// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import pino, { type Logger } from "pino";

/**
 * Default logger used when a caller does not supply one — silent, so spill
 * calls from tool handlers that can't easily plumb a logger don't spam
 * stdout. Production server telemetry is still captured via
 * InteractionLogger because spill errors surface as bounded-view warnings.
 */
const defaultLogger: Logger = pino({ name: "report-spill", level: "silent" });

/**
 * Environment variable names the spill helper reads at call time. We read
 * through `process.env` each call rather than snapshotting at import time so
 * tests can toggle behavior per-case without re-importing the module.
 */
export const REPORT_SPILL_ENV = {
  BUCKET: "REPORT_SPILL_BUCKET",
  THRESHOLD_BYTES: "REPORT_SPILL_THRESHOLD_BYTES",
  THRESHOLD_ROWS: "REPORT_SPILL_THRESHOLD_ROWS",
  SIGNED_URL_TTL_SECONDS: "REPORT_SPILL_SIGNED_URL_TTL_SECONDS",
} as const;

/** Default threshold: 16 MB (UTF-8 byte length). */
export const DEFAULT_SPILL_THRESHOLD_BYTES = 16 * 1024 * 1024;
/** Default threshold: 100_000 parsed rows. */
export const DEFAULT_SPILL_THRESHOLD_ROWS = 100_000;
/** Default signed URL TTL: 1 hour. */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;

export interface SpillCsvOptions {
  /** Raw CSV (or JSON) body to potentially spill. */
  csv: string;
  /** MIME type stored with the GCS object. Defaults to `text/csv`. */
  mimeType?: string;
  /** Session ID used to scope the object path — enables session-cleanup sweeps. */
  sessionId?: string;
  /** Server slug (`ttd`, `pinterest`, …). Used as the first GCS path segment. */
  server: string;
  /** Report identifier. Used as the final GCS path segment. */
  reportId: string;
  /** Parsed row count. When provided and >= row threshold, spill triggers. */
  rowCount?: number;
  /** Override byte threshold (default 16 MB). */
  thresholdBytes?: number;
  /** Override row threshold (default 100k). */
  thresholdRows?: number;
  /** Override signed URL TTL in seconds (default 3600). */
  signedUrlTtlSeconds?: number;
  /** Logger for spill lifecycle events. Defaults to a silent logger. */
  logger?: Logger;
}

/**
 * Result of a spill attempt. Exactly one of the three outcomes holds:
 *
 * - `disabled: true` — `REPORT_SPILL_BUCKET` unset, or payload under both
 *   thresholds. Nothing persisted; callers should behave as pre-Phase-4.
 * - `spilled: true` — persisted to GCS. Callers may surface the returned
 *   `signedUrl` and `objectName` alongside their bounded view.
 * - `error: <message>` — spill was attempted but failed. Callers should
 *   continue with the bounded-view-only path and MAY surface the error
 *   to the model as a bounded-view warning.
 */
export type SpillResult =
  | { disabled: true; reason: "bucket-not-set" | "under-threshold" }
  | {
      spilled: true;
      bucket: string;
      objectName: string;
      bytes: number;
      rowCount?: number;
      signedUrl: string;
      expiresAt: string;
      mimeType: string;
    }
  | { error: string };

function readNumericEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Build the GCS object path. Sessioned objects live under
 * `{server}/{sessionId}/{reportId}-{timestamp}.csv` so session-end cleanup
 * can delete the whole session prefix in one call.
 */
function buildObjectName(opts: SpillCsvOptions): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = opts.mimeType?.includes("json") ? "json" : "csv";
  const safeReportId = opts.reportId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const sessionSegment = opts.sessionId
    ? `${opts.sessionId.replace(/[^a-zA-Z0-9._-]/g, "_")}/`
    : "";
  return `${opts.server}/${sessionSegment}${safeReportId}-${ts}.${ext}`;
}

/**
 * Spill a CSV body to GCS when `REPORT_SPILL_BUCKET` is set and the payload
 * exceeds one of the configured thresholds. Otherwise returns
 * `{ disabled: true, ... }` immediately with no GCS work.
 *
 * The helper never throws: every failure is captured as
 * `{ error: <message> }` so callers can always continue to return a
 * bounded view to the MCP client.
 */
export async function spillCsvToGcs(opts: SpillCsvOptions): Promise<SpillResult> {
  const bucketName = process.env[REPORT_SPILL_ENV.BUCKET];
  if (!bucketName) {
    return { disabled: true, reason: "bucket-not-set" };
  }

  const thresholdBytes =
    opts.thresholdBytes ??
    readNumericEnv(REPORT_SPILL_ENV.THRESHOLD_BYTES) ??
    DEFAULT_SPILL_THRESHOLD_BYTES;
  const thresholdRows =
    opts.thresholdRows ??
    readNumericEnv(REPORT_SPILL_ENV.THRESHOLD_ROWS) ??
    DEFAULT_SPILL_THRESHOLD_ROWS;

  const bytes = Buffer.byteLength(opts.csv, "utf8");
  const underByteThreshold = bytes < thresholdBytes;
  const underRowThreshold = opts.rowCount === undefined ? true : opts.rowCount < thresholdRows;

  if (underByteThreshold && underRowThreshold) {
    return { disabled: true, reason: "under-threshold" };
  }

  const ttl =
    opts.signedUrlTtlSeconds ??
    readNumericEnv(REPORT_SPILL_ENV.SIGNED_URL_TTL_SECONDS) ??
    DEFAULT_SIGNED_URL_TTL_SECONDS;
  const objectName = buildObjectName(opts);
  const mimeType = opts.mimeType ?? "text/csv";

  try {
    // Dynamic import so `@google-cloud/storage` stays an optional peer dep —
    // self-hosted deployments that don't set REPORT_SPILL_BUCKET never load
    // the SDK. Same pattern as InteractionLogger.
    const moduleName = "@google-cloud/storage";
    const gcsModule = await import(moduleName);
    const StorageCtor = (gcsModule as { Storage: new () => unknown }).Storage;
    const storage = new StorageCtor() as {
      bucket: (name: string) => {
        file: (path: string) => {
          save: (
            data: string | Buffer,
            opts: { contentType?: string; resumable?: boolean }
          ) => Promise<unknown>;
          getSignedUrl: (opts: { action: "read"; expires: number }) => Promise<[string]>;
        };
      };
    };
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(opts.csv, { contentType: mimeType, resumable: false });

    const expiresAtMs = Date.now() + ttl * 1000;
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: expiresAtMs,
    });

    const log = opts.logger ?? defaultLogger;
    log.info(
      { bucket: bucketName, objectName, bytes, rowCount: opts.rowCount },
      "Report CSV spilled to GCS"
    );

    return {
      spilled: true,
      bucket: bucketName,
      objectName,
      bytes,
      rowCount: opts.rowCount,
      signedUrl,
      expiresAt: new Date(expiresAtMs).toISOString(),
      mimeType,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const log = opts.logger ?? defaultLogger;
    log.warn(
      { err, bucket: bucketName, objectName },
      "Report CSV spill to GCS failed; continuing with bounded-view only"
    );
    return { error: message };
  }
}

/**
 * Delete all spill objects for the given session. Called by server session-
 * cleanup hooks on session close / timeout / shutdown so stale CSVs never
 * outlive their session (belt-and-braces alongside the bucket-level 24h
 * lifecycle rule).
 *
 * Returns the number of objects deleted. Errors are logged and swallowed —
 * cleanup must never throw from a session-close path.
 */
export async function deleteSpilledObjectsForSession(
  server: string,
  sessionId: string,
  logger?: Logger
): Promise<number> {
  const bucketName = process.env[REPORT_SPILL_ENV.BUCKET];
  if (!bucketName) return 0;

  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const prefix = `${server}/${safeSessionId}/`;

  try {
    const moduleName = "@google-cloud/storage";
    const gcsModule = await import(moduleName);
    const StorageCtor = (gcsModule as { Storage: new () => unknown }).Storage;
    const storage = new StorageCtor() as {
      bucket: (name: string) => {
        deleteFiles: (opts: { prefix: string }) => Promise<unknown>;
      };
    };
    const bucket = storage.bucket(bucketName);
    await bucket.deleteFiles({ prefix });
    const log = logger ?? defaultLogger;
    log.info({ bucket: bucketName, prefix }, "Spill objects for session deleted");
    return 1;
  } catch (err) {
    const log = logger ?? defaultLogger;
    log.warn(
      { err, bucket: bucketName, prefix },
      "Spill cleanup failed; relying on bucket lifecycle rule"
    );
    return 0;
  }
}
