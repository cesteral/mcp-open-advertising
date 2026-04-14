// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Interaction Logger
 *
 * Append-only JSONL logger capturing tool execution data.
 * Persists raw interaction data alongside OTEL traces for local debugging.
 *
 * Features:
 * - Append-only JSONL format (one line per tool call)
 * - File rotation by date and size (configurable)
 * - Secret sanitization (strips tokens/keys from logged params)
 * - Fire-and-forget writes (no blocking the tool response)
 * - Optional GCS bucket for cloud persistence (buffered writes)
 */

import { createWriteStream, existsSync, mkdirSync, statSync, type WriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import type { Logger } from "pino";
import type { UpstreamHttpRecord } from "./http-request-recorder.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InteractionLogEntry {
  /**
   * Record type discriminator. Omitted for legacy writers (treated as
   * "tool_call" by consumers).
   */
  type?: "tool_call" | "tool_failure";
  id?: string;
  ts: string;
  sessionId: string;
  tool: string;
  params: Record<string, unknown>;
  success: boolean;
  durationMs: number;
  workflowId?: string;
  platform?: string;
  packageName?: string;
  requestId?: string;
  /**
   * Failure-only fields. Populated by `logFailure()`.
   */
  errorCode?: number | string;
  errorMessage?: string;
  errorData?: unknown;
  upstream?: UpstreamHttpRecord[];
}

/**
 * Destination mode for interaction entries.
 *
 * - `file`: JSONL on the local filesystem (default when no GCS bucket set).
 * - `gcs`:  buffered flush to a GCS bucket (hosted default on Cloud Run).
 * - `stdout`: emit each entry as a single structured Pino log line at
 *            `info` (success) or `error` (failure). Intended for self-hosters
 *            who want to ship logs through their own stdout pipeline.
 */
export type InteractionLogMode = "file" | "gcs" | "stdout";

export interface InteractionLoggerOptions {
  /** Directory for log files. Defaults to `data/interactions` relative to cwd. */
  dataDir?: string;
  /** Server name used in the log filename (e.g. "ttd-mcp"). */
  serverName: string;
  /** Maximum file size in bytes before rotating (default: 10 MB). */
  maxFileSizeBytes?: number;
  /** Logger for internal diagnostics. */
  logger: Logger;
  /** GCS bucket name. When provided, entries are buffered and flushed to GCS periodically. */
  gcsBucket?: string;
  /** Prefix for all GCS paths (typically the server name). Defaults to serverName. */
  gcsPrefix?: string;
  /** Flush interval in ms for GCS mode. Default: 5000 (5s). */
  flushIntervalMs?: number;
  /**
   * Destination mode. Defaults to `gcs` when `gcsBucket` is set, otherwise
   * `file`. Set to `stdout` to emit entries as Pino log lines instead.
   */
  mode?: InteractionLogMode;
}

export interface GenerateEntryIdInput {
  ts: string;
  sessionId: string;
  tool: string;
  requestId?: string;
  nonce?: number;
}

/**
 * Generate a collision-resistant 16-char hex ID for an interaction log entry.
 */
export function generateEntryId(input: GenerateEntryIdInput): string {
  const { ts, sessionId, tool, requestId, nonce } = input;
  return createHash("sha256")
    .update(`${ts}:${sessionId}:${tool}:${requestId ?? "no-request-id"}:${nonce ?? 0}`)
    .digest("hex")
    .slice(0, 16);
}

// Keys are redacted if they contain any of these substrings (case-insensitive).
// Covers: access_token, refresh_token, api_secret, app_secret, client_secret,
// authorization, x-ttd-api-secret, x-pinterest-app-secret, etc.
const SENSITIVE_KEY_PATTERNS = ["secret", "token", "authorization", "password", "key", "credential", "partner-id"];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some(pattern => lower.includes(pattern));
}

// ---------------------------------------------------------------------------
// Sanitiser
// ---------------------------------------------------------------------------

/**
 * Deep-clone an object, replacing sensitive values with "[REDACTED]".
 */
export function sanitizeParams(input: unknown, depth = 0): unknown {
  if (depth > 10) return "[DEPTH_LIMIT]";
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean") return input;

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeParams(item, depth + 1));
  }

  if (typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeParams(value, depth + 1);
      }
    }
    return result;
  }

  return String(input);
}

// ---------------------------------------------------------------------------
// InteractionLogger
// ---------------------------------------------------------------------------

export class InteractionLogger {
  private readonly dataDir: string;
  private readonly serverName: string;
  private readonly maxFileSizeBytes: number;
  private readonly logger: Logger;
  private readonly gcsBucket?: string;
  private readonly gcsPrefix: string;
  private readonly mode: InteractionLogMode;

  // Local FS mode
  private currentDate: string = "";
  private stream: WriteStream | null = null;
  private currentFilePath: string = "";
  private entryNonce = 0;

  // GCS buffered mode
  private readonly instanceId: string;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private bucketPromise: Promise<any> | null = null;

  constructor(options: InteractionLoggerOptions) {
    this.dataDir = options.dataDir ?? join(homedir(), ".cesteral", "interactions");
    this.serverName = options.serverName;
    this.maxFileSizeBytes = options.maxFileSizeBytes ?? 10 * 1024 * 1024; // 10 MB
    this.logger = options.logger;
    this.gcsBucket = options.gcsBucket;
    this.gcsPrefix = options.gcsPrefix ?? options.serverName;
    this.instanceId = randomBytes(4).toString("hex");
    // Precedence: explicit `mode` option > INTERACTION_LOG_MODE env var >
    // implicit (gcs if bucket is set, else file). This keeps self-hosters one
    // env var away from stdout routing without touching per-server construction.
    const envMode = process.env.INTERACTION_LOG_MODE as InteractionLogMode | undefined;
    const validEnvMode = envMode === "file" || envMode === "gcs" || envMode === "stdout" ? envMode : undefined;
    this.mode = options.mode ?? validEnvMode ?? (this.gcsBucket ? "gcs" : "file");

    if (this.mode === "gcs" && !this.gcsBucket) {
      throw new Error("InteractionLogger: mode=gcs requires gcsBucket");
    }

    if (this.mode === "gcs") {
      const interval = options.flushIntervalMs ?? 5000;
      this.flushTimer = setInterval(() => {
        this.flushBuffer().catch((err) => {
          this.logger.warn({ error: err }, "InteractionLogger: flush failed");
        });
      }, interval);
      // Unref so the timer doesn't keep the process alive
      if (this.flushTimer.unref) this.flushTimer.unref();
    }
  }

  /**
   * Append a single interaction entry. Fire-and-forget — errors are logged
   * but never thrown to the caller.
   */
  append(entry: InteractionLogEntry): void {
    try {
      if (!entry.id) {
        entry.id = generateEntryId({
          ts: entry.ts,
          sessionId: entry.sessionId,
          tool: entry.tool,
          requestId: entry.requestId,
          nonce: this.entryNonce++,
        });
      }

      if (this.mode === "stdout") {
        const level = entry.type === "tool_failure" || entry.success === false ? "error" : "info";
        this.logger[level](
          { event: "mcp.interaction", interaction: entry },
          `mcp.interaction ${entry.type ?? "tool_call"} ${entry.tool}`,
        );
        return;
      }

      const line = JSON.stringify(entry) + "\n";

      if (this.mode === "gcs") {
        this.buffer.push(line);
      } else {
        const stream = this.getStream();
        stream.write(line);
      }
    } catch (error) {
      this.logger.warn({ error }, "InteractionLogger: failed to write entry");
    }
  }

  /**
   * Convenience for emitting a `tool_failure` record. Fire-and-forget.
   *
   * Keeps the full tool-call context (params, sessionId, requestId) plus
   * the structured error and the captured upstream HTTP trail so downstream
   * analysis (BigQuery, log queries) can correlate failures to platform
   * responses without replaying the call.
   */
  logFailure(entry: Omit<InteractionLogEntry, "type" | "success"> & {
    errorCode?: number | string;
    errorMessage?: string;
    errorData?: unknown;
    upstream?: UpstreamHttpRecord[];
  }): void {
    this.append({ ...entry, type: "tool_failure", success: false });
  }

  /**
   * Flush and close the underlying write stream or GCS buffer.
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.mode === "gcs") {
      // Wait for any in-progress flush to complete before final drain
      while (this.flushing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      await this.flushBuffer();
    } else if (this.mode === "stdout") {
      // Nothing to drain — Pino transport handles its own flushing.
    } else {
      if (this.stream) {
        const stream = this.stream;
        this.stream = null;
        await new Promise<void>((resolve) => {
          stream.end(() => resolve());
        });
      }
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async flushBuffer(): Promise<void> {
    if (this.mode !== "gcs" || !this.gcsBucket || this.buffer.length === 0 || this.flushing) return;
    this.flushing = true;
    try {
      const lines = this.buffer.slice(0);
      const payload = lines.join("");
      const today = new Date().toISOString().slice(0, 10);
      // Instance-unique path prevents read-modify-write races between Cloud Run instances
      const filePath = `interactions/${this.serverName}-${this.instanceId}-${today}.jsonl`;
      await this.appendToGcs(filePath, payload);
      this.buffer.splice(0, lines.length);
    } catch (error) {
      this.logger.warn({ error }, "InteractionLogger: failed to flush buffer to GCS");
    } finally {
      this.flushing = false;
    }
  }

  private async getBucket(): Promise<any> {
    if (!this.bucketPromise) {
      const bucketName = this.gcsBucket!;
      this.bucketPromise = (async () => {
        const moduleName = "@google-cloud/storage";
        const gcsModule = await import(moduleName);
        const StorageCtor = (gcsModule as { Storage: new () => any }).Storage;
        const storage = new StorageCtor();
        return storage.bucket(bucketName);
      })();
    }
    return this.bucketPromise;
  }

  private gcsObjectPath(path: string): string {
    return this.gcsPrefix ? `${this.gcsPrefix}/${path}` : path;
  }

  private async appendToGcs(path: string, content: string): Promise<void> {
    const bucket = await this.getBucket();
    const file = bucket.file(this.gcsObjectPath(path));
    // Instance-unique paths eliminate cross-instance races; the flushing
    // flag prevents concurrent flushes within the same instance.
    let existing = "";
    try {
      const [data] = await file.download();
      existing = data.toString("utf-8");
    } catch (err: any) {
      if (err.code !== 404) throw err;
      // File doesn't exist yet — start fresh
    }
    await file.save(existing + content, {
      contentType: "text/plain; charset=utf-8",
      resumable: false,
    });
  }

  private getStream(): WriteStream {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Rotate on date change
    if (today !== this.currentDate) {
      this.rotateStream(today);
      return this.stream!;
    }

    // Rotate on size
    if (this.currentFilePath && existsSync(this.currentFilePath)) {
      try {
        const stats = statSync(this.currentFilePath);
        if (stats.size >= this.maxFileSizeBytes) {
          this.rotateStream(today);
        }
      } catch {
        // stat failure is non-critical
      }
    }

    return this.stream!;
  }

  private rotateStream(date: string): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
    this.currentDate = date;

    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Find a filename that doesn't collide (handles size-based rotation)
    let suffix = 0;
    let filePath: string;
    do {
      const suffixStr = suffix === 0 ? "" : `-${suffix}`;
      filePath = join(this.dataDir, `${this.serverName}-${date}${suffixStr}.jsonl`);
      if (!existsSync(filePath)) break;
      try {
        const stats = statSync(filePath);
        if (stats.size < this.maxFileSizeBytes) break;
      } catch {
        break;
      }
      suffix++;
    } while (suffix < 1000);

    this.currentFilePath = filePath;

    // Ensure parent dir exists (in case dataDir was removed at runtime)
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.stream = createWriteStream(filePath, { flags: "a" });
    this.stream.on("error", (err) => {
      this.logger.warn({ error: err, filePath }, "InteractionLogger: stream error");
    });

    this.logger.info({ filePath }, "InteractionLogger: opened log file");
  }
}