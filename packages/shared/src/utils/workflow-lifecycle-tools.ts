/**
 * Workflow Lifecycle Tools
 *
 * MCP tools that let agents explicitly start and end skill workflows.
 * This gives the system clear workflow boundaries for holistic evaluation.
 *
 * - start_skill_workflow: begins a tracked workflow run
 * - end_skill_workflow: completes it, triggers workflow-level evaluation
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { ToolDefinitionForFactory } from "./tool-handler-factory.js";
import type { WorkflowTracker } from "./workflow-tracker.js";
import type { WorkflowEvaluator } from "./workflow-evaluator.js";
import type { FindingBuffer, WorkflowOutcome } from "./finding-types.js";
import { EvaluatorIssueClass } from "./mcp-errors.js";

// ---------------------------------------------------------------------------
// start_skill_workflow
// ---------------------------------------------------------------------------

const StartWorkflowInputSchema = z.object({
  skillName: z
    .string()
    .min(1)
    .describe("Name of the skill orchestrating this workflow (e.g. 'dv360-entity-updater')"),
  workflowId: z
    .string()
    .optional()
    .describe("Optional workflow category ID (e.g. 'mcp.execute.dv360_entity_update')"),
});

const StartWorkflowOutputSchema = z.object({
  workflowRunId: z.string().describe("Unique ID for this workflow run — pass to subsequent tool calls via _skillContext"),
  skillName: z.string(),
  startedAt: z.string().datetime(),
});

type StartWorkflowInput = z.infer<typeof StartWorkflowInputSchema>;
type StartWorkflowOutput = z.infer<typeof StartWorkflowOutputSchema>;

// ---------------------------------------------------------------------------
// end_skill_workflow
// ---------------------------------------------------------------------------

const EndWorkflowInputSchema = z.object({
  workflowRunId: z
    .string()
    .min(1)
    .describe("The workflowRunId returned by start_skill_workflow"),
  outcome: z
    .enum(["success", "partial_success", "failure", "abandoned"])
    .describe("Overall workflow outcome"),
});

const EndWorkflowOutputSchema = z.object({
  workflowRunId: z.string(),
  skillName: z.string(),
  outcome: z.string(),
  totalCalls: z.number(),
  failedCalls: z.number(),
  totalDurationMs: z.number(),
  aggregateIssues: z.array(z.string()),
  recommendations: z.array(z.string()),
});

type EndWorkflowInput = z.infer<typeof EndWorkflowInputSchema>;
type EndWorkflowOutput = z.infer<typeof EndWorkflowOutputSchema>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface WorkflowLifecycleToolDeps {
  getTracker: () => WorkflowTracker | undefined;
  getEvaluator: () => WorkflowEvaluator;
  getFindingBuffer: () => FindingBuffer | undefined;
  platform?: string;
  packageName?: string;
  sessionId?: string;
}

export function createWorkflowLifecycleTools(
  deps: WorkflowLifecycleToolDeps
): ToolDefinitionForFactory[] {
  const startTool: ToolDefinitionForFactory = {
    name: "start_skill_workflow",
    title: "Start Skill Workflow",
    description:
      "Begin tracking a multi-step skill workflow. Returns a workflowRunId " +
      "that should be passed to subsequent tool calls via the _skillContext parameter.",
    inputSchema: StartWorkflowInputSchema,
    outputSchema: StartWorkflowOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    logic: async (input: StartWorkflowInput): Promise<StartWorkflowOutput> => {
      const tracker = deps.getTracker();
      if (!tracker) {
        throw new Error("Workflow tracking is not available for this session");
      }

      const workflowRunId = tracker.start(input.skillName, input.workflowId);
      return {
        workflowRunId,
        skillName: input.skillName,
        startedAt: new Date().toISOString(),
      };
    },
    responseFormatter: (result: StartWorkflowOutput) => [
      {
        type: "text" as const,
        text:
          `Workflow started: ${result.skillName}\n` +
          `Run ID: ${result.workflowRunId}\n` +
          `Pass this workflowRunId in _skillContext on subsequent tool calls.`,
      },
    ],
  };

  const endTool: ToolDefinitionForFactory = {
    name: "end_skill_workflow",
    title: "End Skill Workflow",
    description:
      "Complete a tracked skill workflow and trigger workflow-level evaluation. " +
      "Returns aggregate metrics and recommendations.",
    inputSchema: EndWorkflowInputSchema,
    outputSchema: EndWorkflowOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    logic: async (input: EndWorkflowInput): Promise<EndWorkflowOutput> => {
      const tracker = deps.getTracker();
      if (!tracker) {
        throw new Error("Workflow tracking is not available for this session");
      }

      const run = tracker.complete(
        input.workflowRunId,
        input.outcome as WorkflowOutcome
      );
      if (!run) {
        throw new Error(
          `No active workflow run found for ID: ${input.workflowRunId}`
        );
      }

      const evaluator = deps.getEvaluator();
      const evaluation = evaluator.evaluate(run);

      // Push a workflow-level finding to the finding buffer
      const findingBuffer = deps.getFindingBuffer();
      if (findingBuffer) {
        findingBuffer.push({
          id: randomUUID(),
          sessionId: deps.sessionId ?? "unknown",
          timestamp: new Date().toISOString(),
          toolName: "end_skill_workflow",
          workflowId: run.workflowId,
          skillName: run.skillName,
          workflowRunId: run.workflowRunId,
          platform: deps.platform ?? "unknown",
          serverPackage: deps.packageName ?? "unknown",
          issues: evaluation.aggregateIssues.map((msg) => ({
            class: EvaluatorIssueClass.WorkflowPattern,
            message: msg,
          })),
          recommendationAction:
            evaluation.aggregateIssues.length > 0
              ? "propose_playbook_delta"
              : "none",
          durationMs: evaluation.totalDurationMs,
        });
      }

      return {
        workflowRunId: evaluation.workflowRunId,
        skillName: evaluation.skillName,
        outcome: input.outcome,
        totalCalls: evaluation.totalCalls,
        failedCalls: evaluation.failedCalls,
        totalDurationMs: evaluation.totalDurationMs,
        aggregateIssues: evaluation.aggregateIssues,
        recommendations: evaluation.recommendations,
      };
    },
    responseFormatter: (result: EndWorkflowOutput) => {
      const lines = [
        `Workflow completed: ${result.skillName} (${result.outcome})`,
        `Calls: ${result.totalCalls} total, ${result.failedCalls} failed`,
        `Duration: ${Math.round(result.totalDurationMs / 1000)}s`,
      ];
      if (result.aggregateIssues.length > 0) {
        lines.push("Issues:");
        for (const issue of result.aggregateIssues) {
          lines.push(`  - ${issue}`);
        }
      }
      if (result.recommendations.length > 0) {
        lines.push("Recommendations:");
        for (const rec of result.recommendations) {
          lines.push(`  - ${rec}`);
        }
      }
      return [{ type: "text" as const, text: lines.join("\n") }];
    },
  };

  return [startTool, endTool];
}
