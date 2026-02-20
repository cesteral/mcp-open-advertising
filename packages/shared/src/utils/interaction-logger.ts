/**
 * Interaction Logger
 *
 * Append-only JSONL logger capturing tool execution data.
 * Feeds the learnings-based self-improvement system by persisting
 * raw interaction data that was previously only emitted via OTEL.
 *
 * Features:
 * - Append-only JSONL format (one line per tool call)
 * - File rotation by date and size (configurable)
 * - Secret sanitization (strips tokens/keys from logged params)
 * - Fire-and-forget writes (no blocking the tool response)
 */

import { createWriteStream, existsSync, mkdirSync, statSync, type WriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { Logger } from "pino";

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
  evaluatorIssues?: string[];
  inputQualityScore?: number;
  efficiencyScore?: number;
  recommendationAction?: string;
  workflowId?: string;
  skillName?: string;
  workflowRunId?: string;
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

  private currentDate: string = "";
  private stream: WriteStream | null = null;
  private currentFilePath: string = "";
  private entryNonce = 0;

  constructor(options: InteractionLoggerOptions) {
    this.dataDir = options.dataDir ?? join(process.cwd(), "data", "interactions");
    this.serverName = options.serverName;
    this.maxFileSizeBytes = options.maxFileSizeBytes ?? 10 * 1024 * 1024; // 10 MB
    this.logger = options.logger;
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
      const stream = this.getStream();
      stream.write(line);
    } catch (error) {
      this.logger.warn({ error }, "InteractionLogger: failed to write entry");
    }
  }

  /**
   * Flush and close the underlying write stream.
   */
  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

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
    this.close();
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
