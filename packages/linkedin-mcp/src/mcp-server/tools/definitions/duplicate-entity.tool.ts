// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import {
  runLinkedInDuplicateDryRun,
  resolveLinkedInDuplicateCapability,
} from "../utils/dry-run.js";
import { snapshotFromLinkedInEntity } from "../utils/capture-snapshot.js";
import {
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

const TOOL_NAME = "linkedin_duplicate_entity";
const TOOL_TITLE = "Duplicate LinkedIn Ads Entity";
const TOOL_DESCRIPTION = `Copy a LinkedIn Ads entity by reading it and creating a new entity with the same settings.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

LinkedIn does not have a native copy API endpoint, so this tool:
1. Reads the source entity
2. Strips read-only fields (id, changeAuditStamps, etc.)
3. Sets name to "Copy of {name}" (or custom name if provided)
4. Sets status to DRAFT
5. Creates the new entity

**Gotchas:**
- The new entity will be in DRAFT status regardless of source status.
- Some entity-specific fields may need manual adjustment after duplication.
- Campaign URNs in references (e.g., creative.campaign) are preserved from source.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to duplicate"),
    entityUrn: z.string().min(1).describe("The source entity URN to copy"),
    newName: z
      .string()
      .optional()
      .describe("Name for the new entity (defaults to 'Copy of {original name}')"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the duplication and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created copy in DRAFT, projected from the source) without creating anything."
      ),
  })
  .describe("Parameters for duplicating a LinkedIn Ads entity");

export const DuplicateEntityOutputSchema = z
  .object({
    sourceUrn: z.string(),
    newEntity: z.record(z.any()).describe("The newly created entity"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No copy was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-duplicate canonical snapshot of the created copy (in-scope kind: campaign). Duplicate has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Duplication result");

type DuplicateEntityInput = z.infer<typeof DuplicateEntityInputSchema>;
type DuplicateEntityOutput = z.infer<typeof DuplicateEntityOutputSchema>;

export async function duplicateEntityLogic(
  input: DuplicateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DuplicateEntityOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveLinkedInDuplicateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runLinkedInDuplicateDryRun(
      { entityType: input.entityType, entityUrn: input.entityUrn, newName: input.newName },
      linkedInService,
      context
    );
    return {
      sourceUrn: input.entityUrn,
      newEntity: {},
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const newEntity = (await linkedInService.duplicateEntity(
    input.entityType as LinkedInEntityType,
    input.entityUrn,
    { newName: input.newName },
    context
  )) as unknown as Record<string, unknown>;

  // The duplicate returns the full new entity, so normalize it directly for the
  // canonical `after` snapshot (no re-read needed). Duplicate has no `before`.
  // Best-effort: undefined for out-of-scope kinds.
  const newUrn = newEntity?.id != null ? String(newEntity.id) : "";
  const after: NormalizedEntitySnapshot | undefined = snapshotFromLinkedInEntity(
    input.entityType,
    newUrn,
    newEntity
  );

  return {
    sourceUrn: input.entityUrn,
    newEntity,
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
      text: `${result.entityType} duplicated from ${result.sourceUrn}\n\nNew entity:\n${JSON.stringify(result.newEntity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "linkedin_ads",
      contractPlatformSlug: "linkedin_ads",
      contractToolSlug: "duplicate_entity",
      operation: ["duplicate"],
      // Governed scope is campaign. campaignGroup / creative duplicate but
      // resolve canonicalEntityKind:null — still token-gated.
      entityKinds: ["campaign"],
      entityIdArgs: ["entityUrn"],
      readPartner: {
        toolName: "linkedin_get_entity",
        argMap: { entityUrn: "entityUrn" },
      },
      schemaVersion: 1,
      contractId: "linkedin_ads.duplicate_entity.v1",
      // `dry_run` = symbolic: read the source and project it as the DRAFT copy
      // (empty new URN). `after` is normalized from the returned new entity
      // (the LinkedIn duplicate re-creates and returns it). No `before`.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Duplicate a campaign with default name",
      input: {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:123456789",
      },
    },
    {
      label: "Duplicate a campaign group with custom name",
      input: {
        entityType: "campaignGroup",
        entityUrn: "urn:li:sponsoredCampaignGroup:987654321",
        newName: "Q2 2026 Brand Awareness (Copy)",
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
