// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDuplicateEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { runGAdsDuplicateDryRun, resolveGAdsDuplicateCapability } from "../utils/dry-run.js";
import { unwrapResource, captureGAdsSnapshot } from "../utils/capture-snapshot.js";
import {
  McpError,
  JsonRpcErrorCode,
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  NormalizedEntitySnapshot,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "gads_duplicate_entity";
const TOOL_TITLE = "Duplicate Google Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a Google Ads entity (copy it).

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Creates a copy of the entity (clone via read + create — Google Ads has no native copy op).
Reads the source with GAQL, strips the server-assigned id/resourceName, and creates a new
entity via the :mutate endpoint. The copy reuses the source's shared budget. Use \`options\`
(e.g. \`{ "name": "Copy of …" }\`) to rename or re-state the copy.`;

/** Project a GAQL-read resource row into a mutate-create payload. */
function projectCreatePayload(
  entityType: string,
  row: Record<string, unknown>,
  options?: Record<string, unknown>
): Record<string, unknown> {
  const resource = unwrapResource(entityType, row) ?? {};
  const payload: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(resource)) {
    // `id`/`resourceName` are server-assigned; the mutate-create endpoint
    // rejects them. Everything else in the curated SELECT is writable-on-create.
    if (key !== "id" && key !== "resourceName") payload[key] = val;
  }
  if (options) Object.assign(payload, options);
  return payload;
}

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
    options: z.record(z.any()).optional().describe("Optional copy overrides (e.g., a new name)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the duplication with Google Ads' native validateOnly mutate and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy) without creating anything. No copy is created."
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
  const row = (await gadsService.getEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.entityId,
    context
  )) as Record<string, unknown>;
  const payload = projectCreatePayload(input.entityType, row, input.options);
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
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
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
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.sourceEntityId} duplicated successfully\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      contractPlatformSlug: "gads",
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
      contractId: "gads.duplicate_entity.v1",
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
};
