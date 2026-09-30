// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDuplicateEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { runGAdsDuplicateDryRun, resolveGAdsDuplicateCapability } from "../utils/dry-run.js";
import { captureGAdsSnapshot } from "../utils/capture-snapshot.js";
import { buildGAdsDuplicateCopy } from "../utils/duplicate-copy.js";
import {
  McpError,
  JsonRpcErrorCode,
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
  createLogger,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  NormalizedEntitySnapshot,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const logger = createLogger("gads-duplicate-entity");

const TOOL_NAME = "gads_duplicate_entity";

const TOOL_TITLE = "Duplicate Google Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a Google Ads entity (copy it).

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Creates a copy of the entity (clone via read + create — Google Ads has no native copy op).
Reads the source with GAQL, strips the server-assigned id/resourceName, and creates a new
entity via the :mutate endpoint. The copy reuses the source's shared budget. Use \`options\`
(e.g. \`{ "name": "Copy of …" }\`) to rename or re-state the copy; a \`null\` value removes a field.

**The copy is always created \`PAUSED\`**, whatever the source's status, so it cannot spend
until you enable it with \`gads_update_entity\` or \`gads_bulk_update_status\`. A \`status\` in
\`options\` is ignored.

**Bidding** is copied: the source's portfolio \`biddingStrategy\`, or its standard scheme with
its parameters (e.g. \`targetCpa.targetCpaMicros\`). A bidding scheme in \`options\` replaces it.
Strategy types that cannot be copied faithfully (e.g. TARGET_CPM, FIXED_CPM) are refused.

**Dates:** a source \`startDateTime\` that may already have passed is omitted (Google applies
its default start). A source \`endDateTime\` that may already have passed is refused unless
\`options.endDateTime\` sets a future end, or \`null\` to run indefinitely. Every change made
to the source's values is listed in \`copyAdjustments\`.`;

/** Extract the new numeric ID from a mutate result's resourceName. */
function extractNewId(result: unknown): string {
  const results = (result as { results?: Array<{ resourceName?: string }> })?.results;
  const resourceName = results?.[0]?.resourceName;
  if (typeof resourceName !== "string") return "";
  const tail = resourceName.split("/").pop() ?? "";
  // Composite IDs (e.g. adGroupId~adId) — take the last segment.
  return tail.split("~").pop() ?? "";
}

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicateEntityTypeEnum()).describe("Type of entity to duplicate"),
    customerId: z
      .string()
      .regex(/^\d+$/, "Customer ID must contain only digits (no dashes)")
      .describe("Google Ads customer ID (no dashes)"),
    entityId: z.string().min(1).describe("ID of the entity to duplicate"),
    options: z
      .record(z.any())
      .optional()
      .describe(
        "Optional copy overrides (e.g., a new name, a future endDateTime, or a bidding scheme). A null value removes the field. A status here is ignored: the copy is always PAUSED."
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the duplication with Google Ads' native validateOnly mutate and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy, with `status` forced to `PAUSED`) without creating anything. No copy is created."
      ),
  })
  .describe("Parameters for duplicating a Google Ads entity");

export const DuplicateEntityOutputSchema = z
  .object({
    result: z.record(z.any()).describe("Mutate response for the created copy"),
    sourceEntityId: z.string(),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No copy was created."
    ),
    copyAdjustments: z
      .array(z.string())
      .optional()
      .describe(
        "Changes made to the source's values in the copy (e.g. a past startDateTime omitted). Absent when none."
      ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-duplicate canonical snapshot of the created copy (in-scope kind: campaign), re-read by the new ID. Duplicate has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Entity duplication result");

type DuplicateEntityInput = z.infer<typeof DuplicateEntityInputSchema>;
type DuplicateEntityOutput = z.infer<typeof DuplicateEntityOutputSchema>;

export async function duplicateEntityLogic(
  input: DuplicateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DuplicateEntityOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveGAdsDuplicateCapability(input.entityType);

  // Read the source and project it to a mutate-create payload.
  // Only `campaign` is duplicable (the input enum is restricted to it).
  const row = (await gadsService.getCampaignForDuplicate(
    input.customerId,
    input.entityId,
    context
  )) as Record<string, unknown>;
  const { payload, ignoredStatus, adjustments } = buildGAdsDuplicateCopy(
    input.entityType,
    row,
    input.options
  );
  const copyAdjustments = adjustments.length > 0 ? { copyAdjustments: adjustments } : {};
  if (ignoredStatus !== undefined) {
    logger.warn(
      { entityType: input.entityType, requestedStatus: ignoredStatus },
      "Ignoring status override on duplicate; copies are always created PAUSED"
    );
  }
  if (Object.keys(payload).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `${input.entityType} ${input.entityId} has no duplicable fields`
    );
  }

  if (input.dry_run === true) {
    const dryRun = await runGAdsDuplicateDryRun(
      { entityType: input.entityType, customerId: input.customerId, data: payload },
      gadsService,
      context
    );
    return {
      result: {},
      sourceEntityId: input.entityId,
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      ...copyAdjustments,
      dispatchedCapability,
    };
  }

  const result = (await gadsService.createEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    payload,
    context
  )) as Record<string, unknown>;

  // Re-read the created copy by its new ID for the canonical `after` snapshot.
  // Duplicate has no `before`. Best-effort: undefined on read failure.
  const newId = extractNewId(result);
  const after: NormalizedEntitySnapshot | undefined = newId
    ? await captureGAdsSnapshot(gadsService, input.entityType, input.customerId, newId, context)
    : undefined;

  return {
    result,
    sourceEntityId: input.entityId,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
    ...copyAdjustments,
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

function formatAdjustments(adjustments?: string[]): string {
  return adjustments && adjustments.length > 0
    ? `\nCopy adjustments:\n${adjustments.map((a) => `  - ${a}`).join("\n")}`
    : "";
}

export function duplicateEntityResponseFormatter(result: DuplicateEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedStateSource } = result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: duplicating ${result.entityType} ${verdict} (validation: ${validationSource}, expected-state: ${expectedStateSource}). No copy was created.` +
          (errs ? `\n${errs}` : "") +
          formatAdjustments(result.copyAdjustments) +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.sourceEntityId} duplicated successfully (created PAUSED)${formatAdjustments(result.copyAdjustments)}\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const duplicateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DuplicateEntityInputSchema,
  outputSchema: DuplicateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "google_ads",
      contractPlatformSlug: "google_ads",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      // Only `campaign` supports duplication on Google Ads (its curated SELECT
      // fields are all writable-on-create); the input enum already restricts to it.
      entityKinds: ["campaign"],
      entityIdArgs: ["customerId", "entityId"],
      readPartner: {
        toolName: "gads_get_entity",
        argMap: { entityType: "entityType", customerId: "customerId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "google_ads.duplicate_entity.v1",
      // `dry_run` = native validateOnly + symbolic post-state projection. `after`
      // is re-read by the new ID on execute (duplicate has no `before`).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Duplicate a campaign",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        entityId: "9876543",
      },
    },
    {
      label: "Duplicate a campaign with a new name",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        entityId: "9876543",
        options: { name: "Copy of Summer Campaign" },
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
  // The dry run reads the source entity and validationErrors carry Google's raw validateOnly error body, printed in the dry-run text.
  untrustedContent: {
    structuredPaths: ["$.result", "$.dryRun", "$.after"],
    contentBlocks: [0],
  },
};
