/**
 * Telemetry utilities for pinterest-mcp
 *
 * Re-exports core OTEL + tracing from @cesteral/shared,
 * plus Pinterest API-specific span helpers.
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
 * Create a span for Pinterest API calls
 */
export async function withPinterestApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "pinterest.operation": operation,
    "pinterest.entityType": entityType,
  };

  return withSpan(`pinterest.${operation}`, fn, attributes);
}
