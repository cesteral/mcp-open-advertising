/**
 * Telemetry utilities for linkedin-mcp
 *
 * Re-exports core OTEL + tracing from @cesteral/shared,
 * plus LinkedIn API-specific span helpers.
 */

export {
  initializeOpenTelemetry,
  shutdownOpenTelemetry,
  getOpenTelemetrySDK,
  isOpenTelemetryEnabled,
  otelLogMixin,
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
 * Create a span for LinkedIn API calls
 */
export async function withLinkedInApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "linkedin.operation": operation,
    "linkedin.entityType": entityType,
  };

  return withSpan(`linkedin.${operation}`, fn, attributes);
}
