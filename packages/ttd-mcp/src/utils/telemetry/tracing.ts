/**
 * Tracing utilities for ttd-mcp
 *
 * Core tracing helpers are in @cesteral/shared.
 * This file adds TTD API-specific span helpers.
 */

export {
  getTracer,
  withSpan,
  withToolSpan,
  setSpanAttribute,
  recordSpanError,
  type Span,
} from "@cesteral/shared";

import { withSpan } from "@cesteral/shared";
import type { Span } from "@cesteral/shared";

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
