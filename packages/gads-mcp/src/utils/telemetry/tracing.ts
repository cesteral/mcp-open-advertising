/**
 * Tracing utilities for gads-mcp
 *
 * Core tracing helpers are in @cesteral/shared.
 * This file adds Google Ads API-specific span helpers.
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
 * Create a span for Google Ads API calls
 */
export async function withGAdsApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "gads.operation": operation,
    "gads.entityType": entityType,
  };

  return withSpan(`gads.${operation}`, fn, attributes);
}
