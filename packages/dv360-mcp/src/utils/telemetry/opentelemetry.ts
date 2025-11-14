/**
 * OpenTelemetry Setup and Configuration
 *
 * Provides distributed tracing and metrics for the dv360-mcp server.
 * Automatically instruments HTTP servers, fetch calls, and custom spans.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import type { AppConfig } from "../../config/index.js";
import type { Logger } from "pino";

/**
 * OpenTelemetry SDK instance
 * Singleton to ensure only one SDK is initialized
 */
let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK with configuration
 *
 * @param config - Application configuration
 * @param logger - Pino logger instance
 * @returns NodeSDK instance or null if disabled
 */
export function initializeOpenTelemetry(config: AppConfig, logger: Logger): NodeSDK | null {
  // Skip if already initialized
  if (sdk) {
    logger.warn("OpenTelemetry SDK already initialized, skipping");
    return sdk;
  }

  // Skip if disabled
  if (!config.otelEnabled) {
    logger.info("OpenTelemetry is disabled (OTEL_ENABLED=false)");
    return null;
  }

  logger.info("Initializing OpenTelemetry SDK...");

  try {
    // Configure trace exporter (if endpoint provided)
    const traceExporter = config.otelExporterOtlpTracesEndpoint
      ? new OTLPTraceExporter({
          url: config.otelExporterOtlpTracesEndpoint,
          headers: {
            // Add custom headers if needed (e.g., API keys)
          },
        })
      : undefined;

    // Configure metric exporter (if endpoint provided)
    const metricReader = config.otelExporterOtlpMetricsEndpoint
      ? new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: config.otelExporterOtlpMetricsEndpoint,
            headers: {
              // Add custom headers if needed
            },
          }),
          exportIntervalMillis: 60000, // Export metrics every 60 seconds
        })
      : undefined;

    // Initialize SDK with auto-instrumentation
    sdk = new NodeSDK({
      serviceName: config.otelServiceName,
      traceExporter,
      metricReader,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Customize auto-instrumentation options
          "@opentelemetry/instrumentation-http": {
            enabled: true,
            // Ignore health check endpoints
            ignoreIncomingRequestHook: (req) => {
              return req.url === "/health" || req.url === "/.well-known/oauth-protected-resource";
            },
          },
          "@opentelemetry/instrumentation-express": {
            enabled: true,
          },
          "@opentelemetry/instrumentation-fs": {
            enabled: false, // Disable file system instrumentation (too noisy)
          },
          "@opentelemetry/instrumentation-dns": {
            enabled: false, // Disable DNS instrumentation (too noisy)
          },
        }),
      ],
    });

    // Start the SDK
    sdk.start();

    logger.info({
      serviceName: config.otelServiceName,
      tracesEndpoint: config.otelExporterOtlpTracesEndpoint,
      metricsEndpoint: config.otelExporterOtlpMetricsEndpoint,
    }, "OpenTelemetry SDK started successfully");

    // Register shutdown handlers
    process.on("SIGTERM", () => {
      shutdownOpenTelemetry(logger)
        .then(() => process.exit(0))
        .catch((error) => {
          logger.error({ error }, "Error during OpenTelemetry shutdown");
          process.exit(1);
        });
    });

    return sdk;
  } catch (error) {
    logger.error({ error }, "Failed to initialize OpenTelemetry SDK");
    return null;
  }
}

/**
 * Shutdown OpenTelemetry SDK gracefully
 *
 * @param logger - Pino logger instance
 */
export async function shutdownOpenTelemetry(logger: Logger): Promise<void> {
  if (!sdk) {
    logger.debug("OpenTelemetry SDK not initialized, skipping shutdown");
    return;
  }

  logger.info("Shutting down OpenTelemetry SDK...");

  try {
    await sdk.shutdown();
    sdk = null;
    logger.info("OpenTelemetry SDK shut down successfully");
  } catch (error) {
    logger.error({ error }, "Error shutting down OpenTelemetry SDK");
    throw error;
  }
}

/**
 * Get the current OpenTelemetry SDK instance
 *
 * @returns NodeSDK instance or null if not initialized
 */
export function getOpenTelemetrySDK(): NodeSDK | null {
  return sdk;
}

/**
 * Check if OpenTelemetry is enabled and initialized
 *
 * @returns true if SDK is initialized and running
 */
export function isOpenTelemetryEnabled(): boolean {
  return sdk !== null;
}
