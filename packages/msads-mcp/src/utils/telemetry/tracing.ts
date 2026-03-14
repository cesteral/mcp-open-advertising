/**
 * Telemetry utilities for msads-mcp
 *
 * Re-exports core OTEL + tracing from @cesteral/shared,
 * plus Microsoft Ads API-specific span helpers.
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
 * Create a span for Microsoft Ads API calls
 */
export async function withMsAdsApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "msads.operation": operation,
    "msads.entityType": entityType,
  };

  return withSpan(`msads.${operation}`, fn, attributes);
}
