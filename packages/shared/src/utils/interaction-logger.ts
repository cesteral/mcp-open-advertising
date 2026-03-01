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
 * - Optional StorageBackend for GCS persistence (buffered writes)
 */

import { createWriteStream, existsSync, mkdirSync, statSync, type WriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { Logger } from "pino";
import type { StorageBackend } from "./storage-backend.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InteractionLogEntry {
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
}

export interface InteractionLoggerOptions {
  /** Directory for log files. Defaults to `data/interactions` relative to cwd. */
  dataDir?: string;
  /** Server name used in the log filename (e.g. "ttd-mcp"). */
  serverName: string;
  /** Maximum file size in bytes before rotating (default: 10 MB). */
  maxFileSizeBytes?: number;
  /** Logger for internal diagnostics. */
  logger: Logger;
  /** Optional StorageBackend for GCS persistence. When provided, entries are buffered and flushed periodically. */
  storageBackend?: StorageBackend;
  /** Flush interval in ms for StorageBackend mode. Default: 5000 (5s). */
  flushIntervalMs?: number;
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

// Secrets / tokens that should never be logged
const SENSITIVE_KEYS = new Set([
  "apiSecret",
  "api_secret",
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "token",
  "secret",
  "password",
  "credential",
  "credentials",
  "authorization",
  "x-ttd-api-secret",
  "x-ttd-partner-id",
]);

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
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
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
  private readonly storageBackend?: StorageBackend;

  // Local FS mode
  private currentDate: string = "";
  private stream: WriteStream | null = null;
  private currentFilePath: string = "";
  private entryNonce = 0;

  // StorageBackend buffered mode
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(options: InteractionLoggerOptions) {
    this.dataDir = options.dataDir ?? join(process.cwd(), "data", "interactions");
    this.serverName = options.serverName;
    this.maxFileSizeBytes = options.maxFileSizeBytes ?? 10 * 1024 * 1024; // 10 MB
    this.logger = options.logger;
    this.storageBackend = options.storageBackend;

    if (this.storageBackend) {
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
      const line = JSON.stringify(entry) + "\n";

      if (this.storageBackend) {
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
   * Flush and close the underlying write stream or storage backend buffer.
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.storageBackend) {
      await this.flushBuffer();
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

  /**
   * Synchronous close for backward compatibility (local FS only).
   */
  closeSync(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async flushBuffer(): Promise<void> {
    if (!this.storageBackend || this.buffer.length === 0 || this.flushing) return;
    this.flushing = true;
    try {
      const lines = this.buffer.splice(0);
      const payload = lines.join("");
      const today = new Date().toISOString().slice(0, 10);
      const filePath = `interactions/${this.serverName}-${today}.jsonl`;
      await this.storageBackend.appendFile(filePath, payload);
    } catch (error) {
      this.logger.warn({ error }, "InteractionLogger: failed to flush buffer to storage backend");
    } finally {
      this.flushing = false;
    }
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
