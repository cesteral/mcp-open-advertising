// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Governed stub (effect class: a report job has no canonical entity
 * snapshot). The handler throws until the call is implemented.
 *
 * TODO(scaffold): implement the submission, a symbolic effect dry-run checked
 * by `assertGovernedEffectDryRun` (see tiktok-mcp's submit-report.tool.ts),
 * and a wire-request test that calls `submitReportLogic` with only `fetch`
 * stubbed.
 */

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { notImplemented } from "../utils/not-implemented.js";
import {
  EffectDryRunResultSchema,
  EffectResultSchema,
  DispatchedCapabilitySchema,
  NO_UNTRUSTED_CONTENT,
  assertAccountScope,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "{{key}}_submit_report";
const TOOL_TITLE = "Submit {{displayName}} Report";
const TOOL_DESCRIPTION = `Submit an asynchronous {{displayName}} report job. Poll it with \`{{key}}_check_report_status\`, then fetch it with \`{{key}}_download_report\`.

Not implemented yet: every call, including \`dry_run\`, returns an error.`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const SubmitReportInputSchema = z
  .object({
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    startDate: z.string().regex(DATE).describe("First day, YYYY-MM-DD"),
    endDate: z.string().regex(DATE).describe("Last day, YYYY-MM-DD"),
    dimensions: z.array(z.string().min(1)).min(1).describe("Dimensions to break rows down by"),
    metrics: z.array(z.string().min(1)).min(1).describe("Metrics to return"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` without submitting it."
      ),
  })
  .describe("Parameters for submitting a {{displayName}} report");

export const SubmitReportOutputSchema = z
  .object({
    reportId: z.string().optional().describe("Report job ID. Absent on a dry_run."),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No report was submitted."
    ),
    effect: EffectResultSchema.optional().describe("Effect-class result identity, on a submission."),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "`submit_report` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Report submission result");

type SubmitReportInput = z.infer<typeof SubmitReportInputSchema>;
type SubmitReportOutput = z.infer<typeof SubmitReportOutputSchema>;

export async function submitReportLogic(
  input: SubmitReportInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<SubmitReportOutput> {
  const { boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");
  return notImplemented(TOOL_NAME);
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report submitted: ${result.reportId}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const submitReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SubmitReportInputSchema,
  outputSchema: SubmitReportOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "{{key}}",
      contractPlatformSlug: "{{key}}",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "{{key}}.submit_report.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Daily totals for a week",
      input: {
        accountId: "1234567890",
        startDate: "2026-11-01",
        endDate: "2026-11-07",
        dimensions: ["date"],
        metrics: ["impressions", "clicks", "spend"],
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
  untrustedContent: NO_UNTRUSTED_CONTENT,
};
