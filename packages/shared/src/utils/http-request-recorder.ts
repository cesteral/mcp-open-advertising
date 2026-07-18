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
  if (byteLen <= maxBytes) return redactBodyString(text);

  // Truncate on character boundary approximating byte budget
  const approxChars = Math.max(0, maxBytes - 64);
  return (
    redactBodyString(text.slice(0, approxChars)) +
    `...[TRUNCATED ${byteLen - approxChars} bytes of ${byteLen}]`
  );
}

// Redact secret-bearing fields in request/response bodies. The first pattern
// covers both JSON (`"key":"value"`) and form-urlencoded / query (`key=value`)
// shapes — the OAuth2 token-exchange and refresh bodies are
// `application/x-www-form-urlencoded` (e.g. `client_secret=…&refresh_token=…`),
// which a JSON-only (`":"`-anchored) pattern would miss entirely. Optional
// quotes are tolerated on both key and value; the value runs until the next
// quote, comma, ampersand, or whitespace. `developer[_-]?token` matches the
// snake_case and hyphenated spellings.
const BODY_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [
    /("?(?:access_token|refresh_token|client_secret|api_secret|developer[_-]?token|password|assertion|id_token)"?\s*[:=]\s*"?)[^"&,\s]+/gi,
    "$1[REDACTED]",
  ],
  [/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]"],
];

function redactBodyString(text: string): string {
  let out = text;
  for (const [pattern, replacement] of BODY_SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// Query-param names whose values are stripped from recorded URLs. Matches by
// substring, case-insensitive — narrower than the header patterns to avoid
// redacting benign params (header "key" patterns would clobber `?key=primary`).
const SENSITIVE_URL_PARAM_PATTERNS = [
  "token",
  "secret",
  "password",
  "credential",
  "signature",
  "authorization",
  "api_key",
  "apikey",
  "api-key",
];

function isSensitiveUrlParam(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_URL_PARAM_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Strip values of known-sensitive query parameters from a URL string. Used
 * before persisting URLs to the upstream-request log so credentials accidentally
 * placed in query strings (e.g. Meta Graph API `access_token=…`) don't leak.
 *
 * Unparseable inputs are returned unchanged.
 */
export function redactUrl(url: string): string {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  let mutated = false;
  for (const [name] of [...parsed.searchParams.entries()]) {
    if (isSensitiveUrlParam(name)) {
      parsed.searchParams.set(name, "[REDACTED]");
      mutated = true;
    }
  }
  return mutated ? parsed.toString() : url;
}

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
