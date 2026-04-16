// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * In-memory store for raw report CSV bodies, addressable as MCP resources via
 * `report-csv://{resourceId}`. Used by `*_download_report` tools when the
 * caller opts in via `storeRawCsv: true` — lets a model fetch only a bounded
 * preview while keeping the full CSV available to a downstream tool/user
 * without inflating the model's context.
 *
 * Design (v1):
 * - In-memory, per-process. No GCS — keeps blast radius local. Can swap behind
 *   the `ReportCsvStore` interface later without touching callers.
 * - Bounded by entry count and TTL; LRU eviction by createdAt when full.
 * - Optional sessionId scoping so per-session cleanup can be wired by the
 *   embedding server. Cross-session reads are allowed by default since MCP
 *   resource reads aren't always tied to a session.
 * - Redaction reuses `redactBodyString`-style patterns from
 *   `http-request-recorder.ts`. CSV bodies above the byte cap are truncated
 *   with a marker line.
 */

import { randomUUID } from "node:crypto";

const REPORT_CSV_DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REPORT_CSV_DEFAULT_MAX_ENTRIES = 100;
const REPORT_CSV_DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export const REPORT_CSV_RESOURCE_SCHEME = "report-csv";

export function buildReportCsvUri(resourceId: string): string {
  return `${REPORT_CSV_RESOURCE_SCHEME}://${resourceId}`;
}

export function parseReportCsvUri(uri: string): string | undefined {
  const prefix = `${REPORT_CSV_RESOURCE_SCHEME}://`;
  if (!uri.startsWith(prefix)) return undefined;
  const id = uri.slice(prefix.length).split("/")[0];
  return id && id.length > 0 ? id : undefined;
}

export interface ReportCsvEntry {
  resourceId: string;
  csv: string;
  mimeType: string;
  createdAt: number;
  expiresAt: number;
  sessionId?: string;
  truncated: boolean;
  byteLength: number;
  warnings: string[];
}

export interface StoreReportCsvOptions {
  csv: string;
  /** Defaults to "text/csv". */
  mimeType?: string;
  /** Optional session scope. When set, `clearForSession()` evicts the entry. */
  sessionId?: string;
}

export interface ReportCsvStoreOptions {
  ttlMs?: number;
  maxEntries?: number;
  maxBytes?: number;
  /** Override `Date.now()` for tests. */
  now?: () => number;
  /** Override `randomUUID` for tests. */
  generateId?: () => string;
}

const CSV_REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]"],
  [/("?(?:access_token|refresh_token|client_secret|api_secret|password|developer_token)"?\s*[:=]\s*"?)[^",\s]+/gi,
    '$1[REDACTED]'],
];

function redactCsv(csv: string): string {
  let out = csv;
  for (const [pattern, replacement] of CSV_REDACTION_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Truncate a UTF-8 string to at most `maxBytes` bytes, preserving character
 * boundaries. `Buffer.byteLength` measures bytes, not characters; using
 * `string.slice` directly under-counts multi-byte characters and can blow past
 * the byte cap (e.g. emoji = 4 bytes per char), so we slice on the byte buffer
 * and walk back to the nearest UTF-8 boundary.
 */
function truncateToByteBudget(input: string, maxBytes: number): { text: string; bytes: number } {
  const buf = Buffer.from(input, "utf-8");
  if (buf.length <= maxBytes) return { text: input, bytes: buf.length };
  let cut = maxBytes;
  // UTF-8 continuation bytes are 0b10xxxxxx (0x80-0xBF). Walk back until the
  // byte at `cut` is a leading byte (or 0), so the slice [0, cut) ends on a
  // complete character.
  while (cut > 0 && (buf[cut]! & 0xc0) === 0x80) {
    cut--;
  }
  const truncated = buf.subarray(0, cut);
  return { text: truncated.toString("utf-8"), bytes: truncated.length };
}

export class ReportCsvStore {
  private readonly entries = new Map<string, ReportCsvEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private readonly generateId: () => string;

  constructor(opts: ReportCsvStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? REPORT_CSV_DEFAULT_TTL_MS;
    this.maxEntries = opts.maxEntries ?? REPORT_CSV_DEFAULT_MAX_ENTRIES;
    this.maxBytes = opts.maxBytes ?? REPORT_CSV_DEFAULT_MAX_BYTES;
    this.now = opts.now ?? (() => Date.now());
    this.generateId = opts.generateId ?? (() => randomUUID());
  }

  store(opts: StoreReportCsvOptions): ReportCsvEntry {
    this.evictExpired();

    const warnings: string[] = [];
    let csv = redactCsv(opts.csv);
    const originalBytes = Buffer.byteLength(csv, "utf-8");
    let truncated = false;

    if (originalBytes > this.maxBytes) {
      // Reserve headroom for the truncation marker line so the final stored
      // body stays under maxBytes even after the suffix is appended.
      const markerBudget = truncateToByteBudget(
        `\n# [TRUNCATED ${originalBytes} bytes]\n`,
        this.maxBytes
      );
      const marker = markerBudget.text;
      const markerBytes = markerBudget.bytes;
      const targetBytes = Math.max(0, this.maxBytes - markerBytes);
      const cut = truncateToByteBudget(csv, targetBytes);
      csv = cut.text + marker;
      truncated = true;
      const finalBytes = Buffer.byteLength(csv, "utf-8");
      warnings.push(
        `CSV exceeded ${this.maxBytes} bytes (was ${originalBytes}); truncated to ${finalBytes} bytes.`
      );
    }

    if (this.entries.size >= this.maxEntries) {
      this.evictOldest();
    }

    const resourceId = this.generateId();
    const createdAt = this.now();
    const entry: ReportCsvEntry = {
      resourceId,
      csv,
      mimeType: opts.mimeType ?? "text/csv",
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      sessionId: opts.sessionId,
      truncated,
      byteLength: Buffer.byteLength(csv, "utf-8"),
      warnings,
    };

    this.entries.set(resourceId, entry);
    return entry;
  }

  get(resourceId: string): ReportCsvEntry | undefined {
    const entry = this.entries.get(resourceId);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(resourceId);
      return undefined;
    }
    return entry;
  }

  /** Resolve by full URI (e.g. "report-csv://abc-123"). */
  getByUri(uri: string): ReportCsvEntry | undefined {
    const id = parseReportCsvUri(uri);
    if (!id) return undefined;
    return this.get(id);
  }

  list(): ReportCsvEntry[] {
    this.evictExpired();
    return Array.from(this.entries.values());
  }

  clearForSession(sessionId: string): number {
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (entry.sessionId === sessionId) {
        this.entries.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /** Test helper. */
  size(): number {
    return this.entries.size;
  }

  private evictExpired(): void {
    const cutoff = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= cutoff) this.entries.delete(id);
    }
  }

  private evictOldest(): void {
    let oldestId: string | undefined;
    let oldestCreatedAt = Infinity;
    for (const [id, entry] of this.entries) {
      if (entry.createdAt < oldestCreatedAt) {
        oldestCreatedAt = entry.createdAt;
        oldestId = id;
      }
    }
    if (oldestId) this.entries.delete(oldestId);
  }
}
