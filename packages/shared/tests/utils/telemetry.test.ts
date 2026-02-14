import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock OTEL dependencies — all mocks inline in factory
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

import {
  otelLogMixin,
  getTracer,
  withSpan,
  withToolSpan,
  setSpanAttribute,
  recordSpanError,
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
});
