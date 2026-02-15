/**
 * OpenTelemetry — re-export from shared
 *
 * The core OTEL initialization is now in @cesteral/shared.
 * This file re-exports for backward compatibility.
 */

export {
  initializeOpenTelemetry,
  shutdownOpenTelemetry,
  getOpenTelemetrySDK,
  isOpenTelemetryEnabled,
  otelLogMixin,
} from "@cesteral/shared";
