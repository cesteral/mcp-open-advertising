/**
 * Workflow Tracker
 *
 * Tracks multi-step skill workflow runs. Each workflow run records
 * its constituent tool calls so the system can evaluate the workflow
 * as a whole (not just individual tool calls).
 *
 * Session-scoped, similar to FindingBuffer.
 */

import { randomUUID } from "node:crypto";
import type { WorkflowRun, WorkflowToolCall, WorkflowOutcome } from "./finding-types.js";

export interface WorkflowTracker {
  start(skillName: string, workflowId?: string): string;
  recordToolCall(workflowRunId: string, call: WorkflowToolCall): void;
  complete(workflowRunId: string, outcome: WorkflowOutcome): WorkflowRun | undefined;
  getActiveRun(workflowRunId: string): WorkflowRun | undefined;
  getAllRuns(): WorkflowRun[];
}

export function createWorkflowTracker(): WorkflowTracker {
  const runs = new Map<string, WorkflowRun>();

  return {
    start(skillName: string, workflowId?: string): string {
      const workflowRunId = randomUUID();
      runs.set(workflowRunId, {
        workflowRunId,
        skillName,
        workflowId,
        startedAt: new Date().toISOString(),
        toolCalls: [],
      });
      return workflowRunId;
    },

    recordToolCall(workflowRunId: string, call: WorkflowToolCall): void {
      const run = runs.get(workflowRunId);
      if (run && !run.completedAt) {
        run.toolCalls.push(call);
      }
    },

    complete(workflowRunId: string, outcome: WorkflowOutcome): WorkflowRun | undefined {
      const run = runs.get(workflowRunId);
      if (!run) return undefined;
      run.completedAt = new Date().toISOString();
      run.outcome = outcome;
      return run;
    },

    getActiveRun(workflowRunId: string): WorkflowRun | undefined {
      const run = runs.get(workflowRunId);
      if (run && !run.completedAt) return run;
      return undefined;
    },

    getAllRuns(): WorkflowRun[] {
      return Array.from(runs.values());
    },
  };
}
