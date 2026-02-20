/**
 * Workflow Evaluator
 *
 * Evaluates completed workflow runs holistically. Unlike per-tool
 * evaluation (which checks individual calls), this assesses the
 * overall multi-step workflow for patterns like redundant calls,
 * excessive duration, or failed steps despite a "success" outcome.
 */

import type { WorkflowRun, WorkflowEvaluationResult } from "./finding-types.js";

export interface WorkflowEvaluator {
  evaluate(run: WorkflowRun): WorkflowEvaluationResult;
}

export function createDefaultWorkflowEvaluator(): WorkflowEvaluator {
  return {
    evaluate(run: WorkflowRun): WorkflowEvaluationResult {
      const aggregateIssues: string[] = [];
      const recommendations: string[] = [];

      const totalCalls = run.toolCalls.length;
      const failedCalls = run.toolCalls.filter((c) => !c.success).length;
      const totalDurationMs = run.toolCalls.reduce((sum, c) => sum + c.durationMs, 0);

      // Check: failed calls despite success outcome
      if (run.outcome === "success" && failedCalls > 0) {
        aggregateIssues.push(
          `Workflow marked as success but ${failedCalls}/${totalCalls} tool calls failed`
        );
        recommendations.push(
          "Verify that failed intermediate calls did not corrupt workflow state"
        );
      }

      // Check: high call count
      if (totalCalls > 10) {
        aggregateIssues.push(
          `High tool call count (${totalCalls}); may indicate retry loops or over-decomposition`
        );
        recommendations.push(
          "Consider using bulk operations or reducing workflow granularity"
        );
      }

      // Check: long duration
      if (totalDurationMs > 60_000) {
        aggregateIssues.push(
          `Workflow duration ${Math.round(totalDurationMs / 1000)}s exceeds 60s threshold`
        );
        recommendations.push(
          "Consider parallelizing independent steps or using batch APIs"
        );
      }

      // Check: redundant calls (same tool called >3 times)
      const toolCounts = new Map<string, number>();
      for (const call of run.toolCalls) {
        toolCounts.set(call.toolName, (toolCounts.get(call.toolName) ?? 0) + 1);
      }
      for (const [toolName, count] of toolCounts) {
        if (count > 3) {
          aggregateIssues.push(
            `Tool "${toolName}" called ${count} times; possible redundancy`
          );
          recommendations.push(
            `Consider batching repeated "${toolName}" calls into a single bulk operation`
          );
        }
      }

      return {
        workflowRunId: run.workflowRunId,
        skillName: run.skillName,
        totalCalls,
        failedCalls,
        totalDurationMs,
        aggregateIssues,
        recommendations,
      };
    },
  };
}
