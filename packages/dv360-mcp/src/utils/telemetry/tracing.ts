/**
 * Telemetry utilities for dv360-mcp
 *
 * Re-exports core OTEL + tracing from @cesteral/shared,
 * plus DV360 API-specific span helpers.
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
 * Create a span for DV360 API calls
 */
export async function withDV360ApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "dv360.operation": operation,
    "dv360.entityType": entityType,
  };

  return withSpan(`dv360.${operation}`, fn, attributes);
}
