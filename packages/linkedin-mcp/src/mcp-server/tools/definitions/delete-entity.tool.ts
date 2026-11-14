// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import { adAccountUrnSchema, refineAdAccountUrn } from "../utils/ad-account-param.js";
import { runLinkedInDeleteDryRun, resolveLinkedInDeleteCapability } from "../utils/dry-run.js";
import { snapshotFromLinkedInEntity, buildLinkedInSnapshot } from "../utils/capture-snapshot.js";
import {
  elicitDeleteConfirmation,
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

const TOOL_NAME = "linkedin_delete_entity";
const TOOL_TITLE = "Delete LinkedIn Ads Entity";
/** LinkedIn documents no delete for a conversion rule. */
const DELETABLE_ENTITY_TYPES = getEntityTypeEnum().filter((t) => t !== "conversionRule") as [
  string,
  ...string[],
];

const TOOL_DESCRIPTION = `Delete a LinkedIn Ads entity by URN (HTTP DELETE).

**Supported entity types:** ${DELETABLE_ENTITY_TYPES.join(", ")}

**Gotchas:**
- Pass the owning ad account as \`adAccountUrn\` for every type except adAccount.
- LinkedIn deletes only DRAFT campaigns, campaign groups and ad accounts this way, and a creative only while it or its campaign is DRAFT (or a video whose processing failed). To delete anything else, set its status (a creative's \`intendedStatus\`) to PENDING_DELETION with linkedin_update_entity.
- Deletion cannot be undone.
- Conversion rules cannot be deleted: LinkedIn documents no delete for them.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(DELETABLE_ENTITY_TYPES).describe("Type of entity to delete"),
    entityUrn: z
      .string()
      .min(1)
      .describe("The entity URN to delete (e.g., urn:li:sponsoredCampaign:123)"),
    adAccountUrn: adAccountUrnSchema,
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the deletion and returns a DryRunResult under `dryRun` (expected post-state = the entity with canonical status `deleted`) without calling the LinkedIn API. The entity is never deleted."
      ),
  })
  .superRefine(refineAdAccountUrn)
  .describe("Parameters for deleting a LinkedIn Ads entity");

export const DeleteEntityOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    success: z.boolean(),
    entityUrn: z.string(),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The entity was NOT deleted."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-delete canonical snapshot (in-scope kind: campaign), from the read performed before deletion."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-delete canonical snapshot — the pre-delete entity with canonical status `deleted`. Undefined for out-of-scope kinds."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Entity deletion result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveLinkedInDeleteCapability(input.entityType);

  // Dry-run never mutates and never prompts for confirmation.
  if (input.dry_run === true) {
    const dryRun = await runLinkedInDeleteDryRun(
      {
        entityType: input.entityType,
        entityUrn: input.entityUrn,
        adAccountUrn: input.adAccountUrn,
      },
      linkedInService,
      context
    );
    return {
      confirmed: true,
      success: dryRun.wouldSucceed,
      entityUrn: input.entityUrn,
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitDeleteConfirmation({
    entityLabel: input.entityType,
    entityId: input.entityUrn,
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      success: false,
      entityUrn: input.entityUrn,
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  // Capture pre-delete state for in-scope kinds (best-effort).
  let before: NormalizedEntitySnapshot | undefined;
  let beforeRaw: Record<string, unknown> | undefined;
  try {
    beforeRaw =
      typeof linkedInService.getEntity === "function"
        ? ((await linkedInService.getEntity(
            input.entityType as LinkedInEntityType,
            input.entityUrn,
            input.adAccountUrn,
            context
          )) as unknown as Record<string, unknown>)
        : undefined;
    before = beforeRaw
      ? snapshotFromLinkedInEntity(input.entityType, input.entityUrn, beforeRaw)
      : undefined;
  } catch {
    before = undefined;
  }

  await linkedInService.deleteEntity(
    input.entityType as LinkedInEntityType,
    input.entityUrn,
    input.adAccountUrn,
    context
  );

  const after: NormalizedEntitySnapshot | undefined = beforeRaw
    ? (buildLinkedInSnapshot(input.entityType, input.entityUrn, beforeRaw, { status: "REMOVED" }) ??
      undefined)
    : undefined;

  return {
    confirmed: true,
    success: true,
    entityUrn: input.entityUrn,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Deletion of ${result.entityType} ${result.entityUrn} cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityUrn} deleted successfully\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const deleteEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DeleteEntityInputSchema,
  outputSchema: DeleteEntityOutputSchema,
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
      contractToolSlug: "delete_entity",
      operation: ["delete"],
      // Governed scope is `campaign`. campaignGroup / creative are deletable but
      // resolve canonicalEntityKind:null — still token-gated under enforce.
      entityKinds: ["campaign"],
      entityIdArgs: ["entityUrn"],
      readPartner: {
        toolName: "linkedin_get_entity",
        argMap: {
          entityType: "entityType",
          entityUrn: "entityUrn",
          adAccountUrn: "adAccountUrn",
        },
      },
      schemaVersion: 1,
      contractId: "linkedin_ads.delete_entity.v1",
      // `dry_run` = symbolic validate (incl. ACTIVE-must-be-paused precondition)
      // + symbolic apply (expected post-state = entity with status `deleted`).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Delete a DRAFT campaign",
      input: {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:123456789",
        adAccountUrn: "urn:li:sponsoredAccount:512345678",
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.dryRun", "$.before", "$.after"],
    contentBlocks: [],
  },
};
