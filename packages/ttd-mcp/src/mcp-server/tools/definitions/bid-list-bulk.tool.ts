// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  McpTextContent,
  RequestContext,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "ttd_bulk_manage_bid_lists";
const TOOL_TITLE = "TTD Bulk Manage Bid Lists";
const TOOL_DESCRIPTION = `Batch get or batch update multiple TTD bid lists via GraphQL.

TTD's GraphQL has no native multi-id bid-list query or multi-input update mutation — this tool fans out individual \`bidList(id:)\` queries and \`bidListUpdate(input:)\` mutations in parallel (concurrency=5) and aggregates the per-item results.

### Operations
- **batch_get** — Retrieve up to 50 bid lists by their IDs
- **batch_update** — Update up to 50 bid lists; each item must be a complete \`BidListUpdateInput\`

### Notes
- TTD's \`/v3/bidlist/batch*\` REST endpoints are deprecated; this tool uses GraphQL.
- Per-item failures are surfaced in the response without aborting other items.
- Optional \`selection\` lets you override the GraphQL selection set (default: \`"id name"\`).
- For single bid list operations including create/set/delete, use \`ttd_manage_bid_list\`.`;

export const BidListBulkInputSchema = z
  .object({
    operation: z.enum(["batch_get", "batch_update"]).describe("Operation to perform"),
    bidListIds: z
      .array(z.string())
      .min(1)
      .max(50)
      .optional()
      .describe("Required for batch_get; array of bid list IDs (max 50)"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .optional()
      .describe("Required for batch_update; each must be a complete BidListUpdateInput (max 50)"),
    selection: z
      .string()
      .optional()
      .describe('GraphQL selection set on returned BidList. Default: "id name"'),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the batch request and returns an EffectDryRunResult under `dryRun` (expected effect = a batch bid-list job over N items) without calling the TTD API. No bid lists are changed."
      ),
  })
  .refine(
    (val) =>
      val.operation === "batch_get"
        ? Array.isArray(val.bidListIds) && val.bidListIds.length > 0
        : true,
    {
      message: "bidListIds is required for batch_get",
      path: ["bidListIds"],
    }
  )
  .refine(
    (val) =>
      val.operation === "batch_update" ? Array.isArray(val.items) && val.items.length > 0 : true,
    {
      message: "items is required for batch_update",
      path: ["items"],
    }
  )
  .describe("Parameters for bulk bid list operations via GraphQL");

export const BidListBulkOutputSchema = z
  .object({
    operation: z.string(),
    totalItems: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    results: z.array(z.record(z.any())),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No bid lists were changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `bid_lists_managed` + scalar batch audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Bulk bid list operation result");

type BidListBulkInput = z.infer<typeof BidListBulkInputSchema>;
type BidListBulkOutput = z.infer<typeof BidListBulkOutputSchema>;

export async function bidListBulkLogic(
  input: BidListBulkInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BidListBulkOutput> {
  // Effect-class write: a batch bid-list job carries no per-item canonical
  // snapshot — the governed result is the batch effect.
  const dispatchedCapability: DispatchedCapability = {
    operation: "bulk_job",
    canonicalEntityKind: null,
  };
  const ts = new Date().toISOString();
  const requested =
    input.operation === "batch_get" ? (input.bidListIds?.length ?? 0) : (input.items?.length ?? 0);

  if (input.dry_run === true) {
    return {
      operation: input.operation,
      totalItems: requested,
      succeeded: 0,
      failed: 0,
      results: [],
      timestamp: ts,
      dryRun: buildBidListBulkEffectDryRun(input.operation, requested),
      dispatchedCapability,
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);
  const selection = input.selection ?? "id name";

  const results =
    input.operation === "batch_get"
      ? await ttdService.batchGetBidLists(input.bidListIds!, context, selection)
      : await ttdService.batchUpdateBidLists(input.items!, context, selection);

  const succeeded = results.filter((r) => r.success).length;
  const effect: EffectResult = {
    effectKind: "bid_lists_managed",
    summary: {
      operation: input.operation,
      requested: results.length,
      succeeded,
      failed: results.length - succeeded,
    },
  };

  return {
    operation: input.operation,
    totalItems: results.length,
    succeeded,
    failed: results.length - succeeded,
    results: results as unknown as Record<string, unknown>[],
    timestamp: ts,
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `ttd_bulk_manage_bid_lists`. The per-operation
 * required arrays (bidListIds / items, each 1..50) are enforced by the input
 * schema, so a well-formed call always passes; the projected effect is a batch
 * job over the supplied items. Pure (no I/O); never includes the raw item
 * payloads.
 */
function buildBidListBulkEffectDryRun(
  operation: BidListBulkInput["operation"],
  requested: number
): EffectDryRunResult {
  const expectedEffect: EffectResult = {
    effectKind: "bid_lists_managed",
    summary: { operation, requested },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function bidListBulkResponseFormatter(result: BidListBulkOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: ${result.operation} over ${result.totalItems} item(s) ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No bid lists were changed.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const label = result.operation === "batch_get" ? "Batch get" : "Batch update";
  return [
    {
      type: "text" as const,
      text: [
        `${label} via GraphQL: ${result.succeeded}/${result.totalItems} succeeded, ${result.failed} failed`,
        "",
        `Results: ${JSON.stringify(result.results, null, 2)}`,
        `Timestamp: ${result.timestamp}`,
      ].join("\n"),
    },
  ];
}

export const bulkManageBidListsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BidListBulkInputSchema,
  outputSchema: BidListBulkOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "bulk_manage_bid_lists",
      operation: ["bulk_job"],
      entityKinds: [],
      entityIdArgs: ["bidListIds"],
      schemaVersion: 1,
      contractId: "ttd.bulk_manage_bid_lists.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Batch get bid lists by IDs",
      input: {
        operation: "batch_get",
        bidListIds: ["bl-abc123", "bl-def456", "bl-ghi789"],
        selection: "id name adjustmentType",
      },
    },
    {
      label: "Batch incremental updates",
      input: {
        operation: "batch_update",
        items: [
          {
            id: "bl-abc123",
            linesToAdd: [
              { dimensionValues: [{ dimension: "Site", value: "nytimes.com" }], adjustment: 1.5 },
            ],
          },
          {
            id: "bl-def456",
            linesToRemove: [{ dimensionValues: [{ dimension: "Site", value: "example-bad.com" }] }],
          },
        ],
      },
    },
  ],
  logic: bidListBulkLogic,
  responseFormatter: bidListBulkResponseFormatter,
};
