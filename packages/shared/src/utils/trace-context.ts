// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Trace context carried in an MCP request's `_meta` (#247).
 *
 * Kept apart from `telemetry.ts` on purpose: this is a pure parser with no
 * SDK/exporter imports, so the many tests that mock `telemetry.js` wholesale
 * don't have to know about it.
 */

import {
  createTraceState,
  isSpanContextValid,
  TraceFlags,
  type SpanContext,
} from "@opentelemetry/api";

// W3C Trace Context `traceparent`: version-traceid-parentid-flags, lowercase
// hex. Version ff is invalid; version 00 forbids trailing fields, later
// versions may append them (https://www.w3.org/TR/trace-context/#traceparent-header).
const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-[^\s]*)?$/;
const MAX_TRACESTATE_LENGTH = 512;

/**
 * The remote parent a client put in a request's `_meta` (SEP-414, documented
 * in MCP 2026-07-28: `traceparent` / `tracestate` / `baggage` keys). Returns
 * `undefined` for anything that is not a valid W3C traceparent — a malformed
 * value must not break the call, it just doesn't parent the span (#247).
 *
 * `baggage` is deliberately NOT read: it is caller-supplied key/value data,
 * and propagating it would let any client inject entries into every
 * downstream span and log that reads baggage.
 */
export function remoteParentFromMeta(meta: unknown): SpanContext | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const { traceparent, tracestate } = meta as Record<string, unknown>;
  if (typeof traceparent !== "string") return undefined;

  const match = TRACEPARENT_RE.exec(traceparent.trim());
  if (!match) return undefined;
  const [, version, traceId, spanId, flags, rest] = match;
  if (version === "ff" || (version === "00" && rest)) return undefined;

  const spanContext: SpanContext = {
    traceId: traceId!,
    spanId: spanId!,
    traceFlags: parseInt(flags!, 16) & TraceFlags.SAMPLED,
    isRemote: true,
  };
  if (typeof tracestate === "string" && tracestate.length <= MAX_TRACESTATE_LENGTH) {
    spanContext.traceState = createTraceState(tracestate);
  }
  // Rejects the all-zero trace/span ids the regex lets through.
  return isSpanContextValid(spanContext) ? spanContext : undefined;
}
