// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Governed stub (effect class: one batch is governed as one effect, with no
 * per-entity snapshot). The handler throws until the call is implemented.
 *
 * TODO(scaffold): implement the batch (with an elicitation confirmation via
 * `elicitBulkStatusChangeConfirmation`), a symbolic effect dry-run checked by
 * `assertGovernedEffectDryRun`, and a wire-request test that calls
 * `bulkUpdateStatusLogic` with only `fetch` stubbed. A status the platform
 * cannot reverse (ARCHIVED, DELETED) must also be declared in registry.json's
 * terminalOperations.
 */

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
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

const TOOL_NAME = "{{key}}_bulk_update_status";
const TOOL_TITLE = "Bulk Update {{displayName}} Entity Status";
const TOOL_DESCRIPTION = `Set the status of several {{displayName}} entities at once.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Not implemented yet: every call, including \`dry_run\`, returns an error.`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to update"),
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    entityIds: z.array(z.string().min(1)).min(1).max(50).describe("Entity IDs to update (max 50)"),
    operationStatus: z.enum(["ACTIVE", "PAUSED"]).describe("Target status to apply"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the batch and returns an EffectDryRunResult under `dryRun` without calling the {{displayName}} API."
      ),
  })
  .describe("Parameters for a bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No statuses were changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity. Present on an executed batch."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "`bulk_job` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Bulk status update result");

type BulkUpdateStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;
type BulkUpdateStatusOutput = z.infer<typeof BulkUpdateStatusOutputSchema>;

export async function bulkUpdateStatusLogic(
  input: BulkUpdateStatusInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateStatusOutput> {
  const { boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");
  return notImplemented(TOOL_NAME);
}

export function bulkUpdateStatusResponseFormatter(
  result: BulkUpdateStatusOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Bulk status update: ${result.successCount}/${result.totalRequested} succeeded\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkUpdateStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateStatusInputSchema,
  outputSchema: BulkUpdateStatusOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "{{key}}",
      contractPlatformSlug: "{{key}}",
      contractToolSlug: "bulk_update_status",
      operation: ["bulk_job"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "{{key}}.bulk_update_status.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Pause two campaigns",
      input: {
        entityType: "campaign",
        accountId: "1234567890",
        entityIds: ["1800123456789", "1800123456790"],
        operationStatus: "PAUSED",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
  // Replace with the paths that carry platform text once the call is implemented.
  untrustedContent: NO_UNTRUSTED_CONTENT,
};
