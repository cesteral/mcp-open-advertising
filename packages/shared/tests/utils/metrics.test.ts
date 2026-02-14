import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factory must NOT reference top-level variables (hoisting).
// Instead, define mocks inline in the factory.
vi.mock("@opentelemetry/api", () => {
  const counter = { add: vi.fn() };
  const histogram = { record: vi.fn() };
  const gauge = { addCallback: vi.fn() };
  const meter = {
    createCounter: vi.fn().mockReturnValue(counter),
    createHistogram: vi.fn().mockReturnValue(histogram),
    createObservableGauge: vi.fn().mockReturnValue(gauge),
  };
  return {
    metrics: {
      getMeter: vi.fn().mockReturnValue(meter),
    },
    __mockCounter: counter,
    __mockHistogram: histogram,
    __mockGauge: gauge,
    __mockMeter: meter,
  };
});

// Import the mock handles after vi.mock
import { __mockCounter, __mockHistogram, __mockGauge, __mockMeter } from "@opentelemetry/api";

import {
  recordToolExecution,
  recordEvaluatorFinding,
  recordWorkflowCallDepth,
  registerActiveSessionsGauge,
  recordAuthValidation,
  recordRateLimitHit,
} from "../../src/utils/metrics.js";
import { EvaluatorIssueClass } from "../../src/utils/mcp-errors.js";

const mockCounter = __mockCounter as any;
const mockHistogram = __mockHistogram as any;
const mockGauge = __mockGauge as any;
const mockMeter = __mockMeter as any;

describe("metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordToolExecution", () => {
    it("records a successful tool execution with counter and histogram", () => {
      recordToolExecution("test_tool", "success", 150);

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        tool_name: "test_tool",
        status: "success",
      });
      expect(mockHistogram.record).toHaveBeenCalledWith(150, {
        tool_name: "test_tool",
        status: "success",
      });
    });

    it("records an error tool execution", () => {
      recordToolExecution("failing_tool", "error", 50);

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        tool_name: "failing_tool",
        status: "error",
      });
      expect(mockHistogram.record).toHaveBeenCalledWith(50, {
        tool_name: "failing_tool",
        status: "error",
      });
    });
  });

  describe("recordEvaluatorFinding", () => {
    it("records evaluator finding with correct labels", () => {
      recordEvaluatorFinding("test_tool", EvaluatorIssueClass.InputQuality, true);

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        tool_name: "test_tool",
        issue_class: "input_quality",
        is_recoverable: "true",
      });
    });

    it("records non-recoverable finding", () => {
      recordEvaluatorFinding("test_tool", EvaluatorIssueClass.WorkflowSequencing, false);

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        tool_name: "test_tool",
        issue_class: "workflow_sequencing",
        is_recoverable: "false",
      });
    });
  });

  describe("recordWorkflowCallDepth", () => {
    it("records call depth for a workflow", () => {
      recordWorkflowCallDepth("workflow-1", 3);

      expect(mockHistogram.record).toHaveBeenCalledWith(3, {
        workflow_id: "workflow-1",
      });
    });

    it("does nothing when workflowId is undefined", () => {
      recordWorkflowCallDepth(undefined, 1);

      expect(mockHistogram.record).not.toHaveBeenCalled();
    });
  });

  describe("registerActiveSessionsGauge", () => {
    it("creates an observable gauge with a callback", () => {
      const getCount = vi.fn().mockReturnValue(5);
      const gauge = registerActiveSessionsGauge(getCount);

      expect(gauge).toBeDefined();
      expect(mockMeter.createObservableGauge).toHaveBeenCalledWith(
        "mcp.session.active",
        expect.objectContaining({ description: expect.any(String) })
      );
      expect(mockGauge.addCallback).toHaveBeenCalledWith(expect.any(Function));
    });

    it("callback invokes getSessionCount and reports result", () => {
      const getCount = vi.fn().mockReturnValue(7);
      registerActiveSessionsGauge(getCount);

      const callbackFn = mockGauge.addCallback.mock.calls[0][0];
      const mockResult = { observe: vi.fn() };
      callbackFn(mockResult);

      expect(getCount).toHaveBeenCalled();
      expect(mockResult.observe).toHaveBeenCalledWith(7);
    });
  });

  describe("recordAuthValidation", () => {
    it("records successful auth validation", () => {
      recordAuthValidation("jwt", "success");

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        auth_type: "jwt",
        result: "success",
      });
    });

    it("records failed auth validation", () => {
      recordAuthValidation("google-headers", "failure");

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        auth_type: "google-headers",
        result: "failure",
      });
    });
  });

  describe("recordRateLimitHit", () => {
    it("records rate limit hit with key pattern", () => {
      recordRateLimitHit("dv360:*");

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        key_pattern: "dv360:*",
      });
    });
  });
});
