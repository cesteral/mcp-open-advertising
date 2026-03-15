// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Telemetry utilities for amazon-dsp-mcp
 *
 * Re-exports core OTEL + tracing from @cesteral/shared,
 * plus AmazonDsp API-specific span helpers.
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
 * Create a span for AmazonDsp API calls
 */
export async function withAmazonDspApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "amazon_dsp.operation": operation,
    "amazon_dsp.entityType": entityType,
  };

  return withSpan(`amazon_dsp.${operation}`, fn, attributes);
}