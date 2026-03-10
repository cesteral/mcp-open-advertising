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
