/**
 * Tracing utilities for dbm-mcp
 *
 * Core tracing helpers are in @cesteral/shared.
 * This file adds Bid Manager API-specific span helpers.
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
 * Create a span for Bid Manager API calls
 */
export async function withBidManagerApiSpan<T>(
  operation: string,
  queryId: string | undefined,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes: Record<string, string | number | boolean> = {
    "bidmanager.operation": operation,
  };

  if (queryId) {
    attributes["bidmanager.queryId"] = queryId;
  }

  return withSpan(`bidmanager.${operation}`, fn, attributes);
}
