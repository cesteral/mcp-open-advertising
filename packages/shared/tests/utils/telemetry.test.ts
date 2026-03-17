import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock OTEL dependencies — all mocks inline in factory
vi.mock("@google-cloud/opentelemetry-cloud-trace-exporter", () => ({
  TraceExporter: vi.fn().mockImplementation(() => ({ type: "gcp-trace" })),
}));
vi.mock("@google-cloud/opentelemetry-cloud-monitoring-exporter", () => ({
  MetricExporter: vi.fn().mockImplementation(() => ({ type: "gcp-metrics" })),
}));
vi.mock("@opentelemetry/api", () => {
  const span = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
    spanContext: vi.fn().mockReturnValue({
      traceId: "abc123trace",
      spanId: "def456span",
    }),
  };

  const tracer = {
    startSpan: vi.fn().mockReturnValue(span),
  };

  return {
    trace: {
      getTracer: vi.fn().mockReturnValue(tracer),
      getActiveSpan: vi.fn().mockReturnValue(span),
      setSpan: vi.fn().mockReturnValue({}),
    },
    context: {
      active: vi.fn().mockReturnValue({}),
      with: vi.fn().mockImplementation((_ctx: unknown, fn: () => unknown) => fn()),
    },
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
    },
    __mockSpan: span,
    __mockTracer: tracer,
  };
});

vi.mock("@opentelemetry/sdk-node", () => ({ NodeSDK: vi.fn() }));
vi.mock("@opentelemetry/auto-instrumentations-node", () => ({
  getNodeAutoInstrumentations: vi.fn().mockReturnValue([]),
}));
vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: vi.fn(),
}));
vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({
  OTLPMetricExporter: vi.fn(),
}));
vi.mock("@opentelemetry/sdk-metrics", () => ({
  PeriodicExportingMetricReader: vi.fn(),
}));
vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: vi.fn().mockReturnValue({}),
}));
vi.mock("@opentelemetry/semantic-conventions", () => ({
  ATTR_SERVICE_NAME: "service.name",
  ATTR_SERVICE_VERSION: "service.version",
}));

import { __mockSpan, __mockTracer } from "@opentelemetry/api";
import { TraceExporter as GcpTraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import { MetricExporter as GcpMetricExporter } from "@google-cloud/opentelemetry-cloud-monitoring-exporter";

import {
  otelLogMixin,
  getTracer,
  withSpan,
  withToolSpan,
  setSpanAttribute,
  recordSpanError,
  createPlatformSpanHelper,
} from "../../src/utils/telemetry.js";

const mockSpan = __mockSpan as any;
const mockTracer = __mockTracer as any;

describe("telemetry utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("otelLogMixin", () => {
    it("returns a function that injects trace context", () => {
      const mixin = otelLogMixin();
      expect(mixin).toBeTypeOf("function");

      const result = mixin();
      expect(result).toEqual({
        trace_id: "abc123trace",
        span_id: "def456span",
      });
    });
  });

  describe("getTracer", () => {
    it("returns a tracer", () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
    });

    it("accepts a custom name", () => {
      getTracer("custom-tracer");
    });
  });

  describe("withSpan", () => {
    it("executes the function within a span and sets OK status on success", async () => {
      const result = await withSpan("test-span", async () => "result");

      expect(mockTracer.startSpan).toHaveBeenCalledWith("test-span");
      expect(result).toBe("result");
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // SpanStatusCode.OK
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it("sets attributes on the span", async () => {
      await withSpan("test-span", async () => "ok", {
        key1: "value1",
        key2: 42,
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith("key1", "value1");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("key2", 42);
    });

    it("records exception and sets ERROR status on failure", async () => {
      const error = new Error("boom");

      try {
        await withSpan("test-span", async () => {
          throw error;
        });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBe(error);
      }

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: "boom",
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe("withToolSpan", () => {
    it("creates a span with tool name prefix", async () => {
      await withToolSpan("get_entities", {}, async () => "result");

      expect(mockTracer.startSpan).toHaveBeenCalledWith("tool.get_entities");
    });

    it("sets advertiserId and entityType attributes from input", async () => {
      await withToolSpan(
        "list_entities",
        { advertiserId: "adv-123", entityType: "campaign" },
        async () => "ok"
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        "mcp.tool.input.advertiserId",
        "adv-123"
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        "mcp.tool.input.entityType",
        "campaign"
      );
    });
  });

  describe("setSpanAttribute", () => {
    it("sets attribute on the active span", () => {
      setSpanAttribute("test.key", "test-value");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("test.key", "test-value");
    });
  });

  describe("recordSpanError", () => {
    it("records exception and sets ERROR status on active span", () => {
      const error = new Error("test error");
      recordSpanError(error);

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: "test error",
      });
    });
  });

  describe("createPlatformSpanHelper", () => {
    it("creates a span named {prefix}.{operation} with operation attribute", async () => {
      const withMetaSpan = createPlatformSpanHelper("meta");
      const result = await withMetaSpan("list_entities", undefined, async () => "ok");

      expect(mockTracer.startSpan).toHaveBeenCalledWith("meta.list_entities");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("meta.operation", "list_entities");
      expect(result).toBe("ok");
    });

    it("sets entityType attribute when provided", async () => {
      const withTtdSpan = createPlatformSpanHelper("ttd");
      await withTtdSpan("get_entity", "campaign", async () => "ok");

      expect(mockTracer.startSpan).toHaveBeenCalledWith("ttd.get_entity");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("ttd.operation", "get_entity");
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("ttd.entityType", "campaign");
    });

    it("omits entityType attribute when undefined", async () => {
      const withDv360Span = createPlatformSpanHelper("dv360");
      await withDv360Span("list_accounts", undefined, async () => "ok");

      expect(mockSpan.setAttribute).toHaveBeenCalledWith("dv360.operation", "list_accounts");
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        "dv360.entityType",
        expect.anything()
      );
    });

    it("propagates errors from the wrapped function", async () => {
      const withMetaSpan = createPlatformSpanHelper("meta");
      const error = new Error("api failure");

      await expect(
        withMetaSpan("create_entity", "adSet", async () => {
          throw error;
        })
      ).rejects.toThrow("api failure");

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    });
  });

  describe("buildExporters", () => {
    const originalKService = process.env.K_SERVICE;

    beforeEach(() => {
      vi.clearAllMocks();
      delete process.env.K_SERVICE;
    });

    afterEach(() => {
      if (originalKService !== undefined) {
        process.env.K_SERVICE = originalKService;
      } else {
        delete process.env.K_SERVICE;
      }
    });

    it("selects GCP exporters when K_SERVICE env var is set", async () => {
      process.env.K_SERVICE = "dbm-mcp";

      const { buildExporters } = await import("../../src/utils/telemetry.js");
      const { traceExporter, metricReader } = buildExporters({
        otelEnabled: true,
        otelServiceName: "test",
      });

      expect(GcpTraceExporter).toHaveBeenCalledOnce();
      expect(GcpMetricExporter).toHaveBeenCalledOnce();
      expect(traceExporter).toBeDefined();
      expect(metricReader).toBeDefined();
    });

    it("selects GCP exporters when gcpExporter: true is passed explicitly", async () => {
      // K_SERVICE not set — config override
      const { buildExporters } = await import("../../src/utils/telemetry.js");
      const { traceExporter, metricReader } = buildExporters({
        otelEnabled: true,
        otelServiceName: "test",
        gcpExporter: true,
      });

      expect(GcpTraceExporter).toHaveBeenCalledOnce();
      expect(GcpMetricExporter).toHaveBeenCalledOnce();
      expect(traceExporter).toBeDefined();
      expect(metricReader).toBeDefined();
    });

    it("selects OTLP exporters when endpoints are configured and not on Cloud Run", async () => {
      const { buildExporters } = await import("../../src/utils/telemetry.js");
      const { traceExporter, metricReader } = buildExporters({
        otelEnabled: true,
        otelServiceName: "test",
        otelExporterOtlpTracesEndpoint: "http://localhost:4318/v1/traces",
        otelExporterOtlpMetricsEndpoint: "http://localhost:4318/v1/metrics",
      });

      const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
      const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http");

      expect(OTLPTraceExporter).toHaveBeenCalledOnce();
      expect(OTLPMetricExporter).toHaveBeenCalledOnce();
      expect(traceExporter).toBeDefined();
      expect(metricReader).toBeDefined();
    });

    it("returns undefined exporters when no Cloud Run and no OTLP endpoints", async () => {
      const { buildExporters } = await import("../../src/utils/telemetry.js");
      const { traceExporter, metricReader } = buildExporters({
        otelEnabled: true,
        otelServiceName: "test",
      });

      expect(traceExporter).toBeUndefined();
      expect(metricReader).toBeUndefined();
    });
  });
});
