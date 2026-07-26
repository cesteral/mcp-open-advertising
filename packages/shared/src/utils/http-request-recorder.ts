// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * HTTP Request Recorder
 *
 * Captures the upstream HTTP request/response for every outbound platform API
 * call made during an MCP tool invocation. The tool handler factory reads the
 * recorded entries on failure and attaches them to the structured failure log
 * so we can diagnose why a platform (TTD, Meta, DV360, ...) rejected a call
 * without having to re-run it.
 *
 * Storage: piggybacks on the existing per-request AsyncLocalStorage
 * (`requestContextStorage`). The recorder mutates `ctx.upstreamRequests`.
 *
 * Redaction + truncation rules live here — callers pass raw headers/bodies.
 */

import { requestContextStorage } from "./request-context.js";
import { redactSecretsInString, redactUrl } from "./secret-redaction.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpstreamHttpRecord {
  method: string;
  url: string;
  status?: number;
  requestBodyRedacted?: string;
  responseBodyRedacted?: string;
  requestHeadersRedacted?: Record<string, string>;
  responseHeadersRedacted?: Record<string, string>;
  durationMs: number;
  attempt?: number;
  /** Error message if the request itself threw (network error, timeout). */
  networkError?: string;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_HEADER_PATTERNS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-ttd-api-secret",
  "ttd-auth",
  "developertoken",
  "access_token",
  "access-token",
  "bearer",
  "proxy-authorization",
  "x-goog-api-key",
];

/**
 * Normalize by lower-casing and stripping separators (`-`, `_`, spaces) so a
 * pattern matches regardless of how a header spells its word boundaries. Without
 * this, `"developertoken"` fails to match the real Google Ads `developer-token`
 * header (the hyphen breaks the substring match) and the token leaks into the
 * failure log. Matching on the separator-free form catches all spellings
 * (`developer-token`, `developer_token`, `DeveloperToken`) at once.
 */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[-_\s]/g, "");
}

function isSensitiveHeader(name: string): boolean {
  const norm = normalizeForMatch(name);
  return SENSITIVE_HEADER_PATTERNS.some((p) => norm.includes(normalizeForMatch(p)));
}

export function redactHeaders(
  headers: Record<string, string | string[] | undefined> | Headers | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;

  const entries: Array<[string, string | string[] | undefined]> =
    typeof (headers as Headers).forEach === "function"
      ? []
      : Object.entries(headers as Record<string, string | string[] | undefined>);

  if (entries.length === 0 && typeof (headers as Headers).forEach === "function") {
    (headers as Headers).forEach((value, key) => {
      entries.push([key, value]);
    });
  }

  for (const [name, value] of entries) {
    if (value === undefined) continue;
    const rendered = Array.isArray(value) ? value.join(", ") : value;
    out[name] = isSensitiveHeader(name) ? "[REDACTED]" : rendered;
  }
  return out;
}

/**
 * Maximum bytes retained from an HTTP body before truncation. Bounds log size
 * so one chatty failure can't explode a JSONL flush.
 */
export const MAX_CAPTURED_BODY_BYTES = 8 * 1024;

export function truncateBody(
  input: unknown,
  maxBytes: number = MAX_CAPTURED_BODY_BYTES
): string | undefined {
  if (input === undefined || input === null) return undefined;
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  }

  if (text.length === 0) return undefined;

  const byteLen = Buffer.byteLength(text, "utf-8");
  if (byteLen <= maxBytes) return redactSecretsInString(text);

  // Truncate on character boundary approximating byte budget
  const approxChars = Math.max(0, maxBytes - 64);
  return (
    redactSecretsInString(text.slice(0, approxChars)) +
    `...[TRUNCATED ${byteLen - approxChars} bytes of ${byteLen}]`
  );
}

// Body and URL redaction live in `secret-redaction.ts`, shared with
// `mcp-errors.ts`. They used to be two copies that drifted: the error path's
// copy was JSON-quoted-keys-only and caught one of the four shapes these see
// (sweep 2026-07-25, 02-F5/F6/F7). Re-exported so this module's public API is
// unchanged for existing importers.
export { redactUrl };

// ---------------------------------------------------------------------------
// Recording API
// ---------------------------------------------------------------------------

interface MutableContext {
  upstreamRequests?: UpstreamHttpRecord[];
}

/**
 * Append a recorded upstream request to the current request's ALS context.
 * No-op when called outside `runWithRequestContext` — we only capture for
 * traffic that ran inside a tool invocation.
 *
 * The last entry appended for a given (method, url) should be marked `final`
 * so readers can surface the definitive outcome.
 */
export function recordUpstreamRequest(entry: UpstreamHttpRecord): void {
  const ctx = requestContextStorage.getStore() as MutableContext | undefined;
  if (!ctx) return;
  if (!ctx.upstreamRequests) ctx.upstreamRequests = [];
  const safe = entry.url ? { ...entry, url: redactUrl(entry.url) } : entry;
  ctx.upstreamRequests.push(safe);
  // Bound memory: keep only the most recent 20 attempts per tool invocation
  if (ctx.upstreamRequests.length > 20) {
    ctx.upstreamRequests.splice(0, ctx.upstreamRequests.length - 20);
  }
}

export function getRecordedUpstreamRequests(): UpstreamHttpRecord[] {
  const ctx = requestContextStorage.getStore() as MutableContext | undefined;
  return ctx?.upstreamRequests ?? [];
}

export function clearRecordedUpstreamRequests(): void {
  const ctx = requestContextStorage.getStore() as MutableContext | undefined;
  if (ctx) ctx.upstreamRequests = [];
}
