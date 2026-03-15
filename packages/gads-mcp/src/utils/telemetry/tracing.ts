// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Telemetry utilities for gads-mcp
 *
 * Re-exports core OTEL + tracing from @cesteral/shared,
 * plus Google Ads API-specific span helpers.
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