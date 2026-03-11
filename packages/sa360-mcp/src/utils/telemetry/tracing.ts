/**
 * Telemetry utilities for sa360-mcp
 *
 * Re-exports core OTEL + tracing from @cesteral/shared,
 * plus SA360 API-specific span helpers.
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
 * Create a span for SA360 API calls
 */
export async function withSA360ApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "sa360.operation": operation,
    "sa360.entityType": entityType,
  };

  return withSpan(`sa360.${operation}`, fn, attributes);
}
