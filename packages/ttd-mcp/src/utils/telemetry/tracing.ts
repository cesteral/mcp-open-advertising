/**
 * Tracing utilities for ttd-mcp
 *
 * Core tracing helpers are in @bidshifter/shared.
 * This file adds TTD API-specific span helpers.
 */

export {
  getTracer,
  withSpan,
  withToolSpan,
  setSpanAttribute,
  recordSpanError,
  type Span,
} from "@bidshifter/shared";

import { withSpan } from "@bidshifter/shared";
import type { Span } from "@bidshifter/shared";

/**
 * Create a span for TTD API calls
 */
export async function withTtdApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "ttd.operation": operation,
    "ttd.entityType": entityType,
  };

  return withSpan(`ttd.${operation}`, fn, attributes);
}
