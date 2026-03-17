// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared OpenTelemetry initialization and tracing utilities
 *
 * Consolidates OTEL setup that was previously duplicated across server packages.
 * Features: GCP Cloud Run detection, Pino log correlation, configurable sampling.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { TraceExporter as GcpTraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import { MetricExporter as GcpMetricExporter } from "@google-cloud/opentelemetry-cloud-monitoring-exporter";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import {
  trace,
  context,
  SpanStatusCode,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { IncomingMessage } from "http";
import type { Logger } from "pino";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OtelConfig {
  otelEnabled: boolean;
  otelServiceName: string;
  otelExporterOtlpTracesEndpoint?: string;
  otelExporterOtlpMetricsEndpoint?: string;
  gcpExporter?: boolean;
}

// ---------------------------------------------------------------------------
// Singleton SDK
// ---------------------------------------------------------------------------

let sdk: NodeSDK | null = null;

/**
 * Select trace exporter and metric reader based on environment.
 * - Cloud Run (K_SERVICE set) or gcpExporter:true → GCP-native exporters (workload identity auth)
 * - OTLP endpoint env vars set → OTLP HTTP exporters (local dev / custom collector)
 * - Neither → no-op (undefined)
 */
export function buildExporters(config: OtelConfig): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traceExporter: any;
  metricReader: PeriodicExportingMetricReader | undefined;
} {
  const useGcp = config.gcpExporter ?? !!process.env.K_SERVICE;

  if (useGcp) {
    return {
      traceExporter: new GcpTraceExporter(),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new GcpMetricExporter(),
        exportIntervalMillis: 60_000,
      }),
    };
  }

  const traceExporter = config.otelExporterOtlpTracesEndpoint
    ? new OTLPTraceExporter({ url: config.otelExporterOtlpTracesEndpoint })
    : undefined;

  const metricReader = config.otelExporterOtlpMetricsEndpoint
    ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: config.otelExporterOtlpMetricsEndpoint,
        }),
        exportIntervalMillis: 60_000,
      })
    : undefined;

  return { traceExporter, metricReader };
}

/**
 * Initialize OpenTelemetry with GCP Cloud Run detection and configurable sampling.
 */
export function initializeOpenTelemetry(
  config: OtelConfig,
  logger: Logger
): NodeSDK | null {
  if (sdk) {
    logger.warn("OpenTelemetry SDK already initialized, skipping");
    return sdk;
  }

  if (!config.otelEnabled) {
    logger.info("OpenTelemetry is disabled (OTEL_ENABLED=false)");
    return null;
  }

  logger.info("Initializing OpenTelemetry SDK...");

  try {
    // Build resource with GCP Cloud Run detection
    const resourceAttrs: Record<string, string> = {
      [ATTR_SERVICE_NAME]: config.otelServiceName,
    };

    // Detect GCP Cloud Run environment
    const kService = process.env.K_SERVICE;
    const kRevision = process.env.K_REVISION;
    const kConfiguration = process.env.K_CONFIGURATION;
    const gcpProjectId = process.env.GCP_PROJECT_ID;

    if (kService) {
      resourceAttrs["cloud.provider"] = "gcp";
      resourceAttrs["cloud.platform"] = "gcp_cloud_run";
      resourceAttrs["faas.name"] = kService;
      if (kRevision) resourceAttrs["faas.version"] = kRevision;
      if (kConfiguration) resourceAttrs["faas.instance"] = kConfiguration;
      if (gcpProjectId) resourceAttrs["cloud.account.id"] = gcpProjectId;
      const region = process.env.CLOUD_RUN_REGION;
      if (region) resourceAttrs["cloud.region"] = region;
    }

    // Detect service version from package.json (if set in env)
    const serviceVersion = process.env.SERVICE_VERSION;
    if (serviceVersion) {
      resourceAttrs[ATTR_SERVICE_VERSION] = serviceVersion;
    }

    const resource = resourceFromAttributes(resourceAttrs);

    // Configure exporters (GCP on Cloud Run, OTLP for local dev, none otherwise)
    const { traceExporter, metricReader } = buildExporters(config);

    sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader,
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-http": {
            enabled: true,
            ignoreIncomingRequestHook: (req: IncomingMessage) => {
              return (
                req.url === "/health" ||
                req.url === "/.well-known/oauth-protected-resource"
              );
            },
          },
          "@opentelemetry/instrumentation-fs": {
            enabled: false,
          },
          "@opentelemetry/instrumentation-dns": {
            enabled: false,
          },
        }),
      ],
    });

    sdk.start();

    logger.info(
      {
        serviceName: config.otelServiceName,
        gcpExporter: !!(config.gcpExporter ?? !!process.env.K_SERVICE),
        tracesEndpoint: config.otelExporterOtlpTracesEndpoint,
        metricsEndpoint: config.otelExporterOtlpMetricsEndpoint,
        cloudRunService: kService || "local",
      },
      "OpenTelemetry SDK started successfully"
    );

    return sdk;
  } catch (error) {
    logger.error({ error }, "Failed to initialize OpenTelemetry SDK");
    return null;
  }
}

/**
 * Shutdown OpenTelemetry SDK gracefully with timeout protection.
 */
export async function shutdownOpenTelemetry(
  logger: Logger,
  timeoutMs: number = 5_000
): Promise<void> {
  if (!sdk) {
    logger.debug("OpenTelemetry SDK not initialized, skipping shutdown");
    return;
  }

  logger.info("Shutting down OpenTelemetry SDK...");

  try {
    await Promise.race([
      sdk.shutdown(),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error("OpenTelemetry shutdown timed out")),
          timeoutMs
        )
      ),
    ]);
    sdk = null;
    logger.info("OpenTelemetry SDK shut down successfully");
  } catch (error) {
    logger.error({ error }, "Error shutting down OpenTelemetry SDK");
    sdk = null;
  }
}

export function getOpenTelemetrySDK(): NodeSDK | null {
  return sdk;
}

export function isOpenTelemetryEnabled(): boolean {
  return sdk !== null;
}

// ---------------------------------------------------------------------------
// Pino log correlation — inject trace_id and span_id into log lines
// ---------------------------------------------------------------------------

/**
 * Creates a Pino mixin that injects OpenTelemetry trace context into log lines.
 * Use as: `pino({ mixin: otelLogMixin() })`
 */
export function otelLogMixin(): () => Record<string, string | undefined> {
  return () => {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const ctx = span.spanContext();
    return {
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
    };
  };
}

// ---------------------------------------------------------------------------
// Tracing helpers
// ---------------------------------------------------------------------------

export function getTracer(name: string = "cesteral"): Tracer {
  return trace.getTracer(name);
}

/**
 * Create a span and execute a function within its context.
 */
export async function withSpan<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName);

  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
  }

  try {
    const result = await context.with(
      trace.setSpan(context.active(), span),
      () => fn(span)
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message || String(error),
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a span for MCP tool execution.
 */
export async function withToolSpan<T>(
  toolName: string,
  input: Record<string, any>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes: Record<string, string | number | boolean> = {
    "mcp.tool.name": toolName,
  };

  if (input.advertiserId) attributes["mcp.tool.input.advertiserId"] = input.advertiserId;
  if (input.campaignId) attributes["mcp.tool.input.campaignId"] = input.campaignId;
  if (input.entityType) attributes["mcp.tool.input.entityType"] = input.entityType;

  return withSpan(`tool.${toolName}`, fn, attributes);
}

/**
 * Set attribute on current active span.
 */
export function setSpanAttribute(
  key: string,
  value: string | number | boolean
): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.setAttribute(key, value);
  }
}

/**
 * Record error on current active span.
 */
export function recordSpanError(error: unknown): void {
  if (!(error instanceof Error)) return;
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.recordException(error);
    currentSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

/**
 * Factory to create a platform-specific span helper.
 * Each server calls this once with its platform prefix (e.g., "meta", "ttd")
 * to get a typed span wrapper that sets platform-scoped attributes.
 */
export function createPlatformSpanHelper(prefix: string) {
  return async function <T>(
    operation: string,
    entityType: string | undefined,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const attributes: Record<string, string> = {
      [`${prefix}.operation`]: operation,
    };
    if (entityType !== undefined) {
      attributes[`${prefix}.entityType`] = entityType;
    }
    return withSpan(`${prefix}.${operation}`, fn, attributes);
  };
}

// Re-export relevant OTEL API types for consumers
export {
  type Span,
  type Tracer,
  SpanStatusCode,
  trace,
  context,
} from "@opentelemetry/api";