// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import { DryRunResultSchema, NormalizedEntitySnapshotSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "gads_update_entity";
const TOOL_TITLE = "Update Google Ads Entity";
const TOOL_DESCRIPTION = `Update an existing Google Ads entity using the :mutate API with updateMask discipline.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**updateMask is required** — specify which fields to update as a comma-separated string.
Only fields listed in updateMask will be modified. This prevents accidental overwrites.

Example updateMask: "name,status" or "campaignBudget,startDate"

**Composite entityId required for:** \`ad\` → use \`{adGroupId}~{adId}\`, \`keyword\` → use \`{adGroupId}~{criterionId}\`. Other entity types use simple IDs.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    customerId: z.string().min(1).describe("Google Ads customer ID (no dashes)"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    data: z.record(z.any()).describe("Entity data fields to update"),
    updateMask: z
      .string()
      .min(1)
      .describe("Comma-separated list of fields to update (e.g., 'name,status')"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>,
      [],
      { validateCompositeIds: true }
    );
  })
  .describe("Parameters for updating a Google Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    mutateResult: z.record(z.any()).describe("Mutate operation result"),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied; `mutateResult` is empty."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (campaign, ad_group, campaign_budget) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity. Captured by re-reading after the write because the Google Ads :mutate endpoint returns only a resourceName. Undefined when the post-read fails or the entity type is out of canonical scope."
    ),
  })
  .describe("Entity update result");

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(
  input: UpdateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  const result = await gadsService.updateEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.entityId,
    input.data,
    input.updateMask,
    context
  );

  return {
    mutateResult: result as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity updated successfully\n${JSON.stringify(result.mutateResult, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      platform: "google_ads",
      // `gads_update_entity` is a multi-operation dispatcher: callers change
      // status, budget, name, etc. via the `data` + `updateMask` payload, so
      // the contract advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Governed scope is campaign / ad_group / campaign_budget — the kinds
      // that round-trip cleanly through the read partner and carry a canonical
      // status/budget snapshot. `ad` and `keyword` use composite IDs
      // (`{adGroupId}~{adId}`) that the read partner's simple-ID GAQL lookup
      // cannot resolve, and `asset` is create-only with no canonical kind;
      // all three are intentionally out of governed scope.
      entityKinds: ["campaign", "ad_group", "campaign_budget"],
      entityIdArgs: ["customerId", "entityId"],
      readPartner: {
        toolName: "gads_get_entity",
        argMap: { customerId: "customerId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "google_ads.update_entity.v1",
      // `supportsDryRun` / `supportsBeforeAfterSnapshot` are wired in Task
      // R2-U3 (native `validateOnly` + before/after capture) and set there.
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Update campaign name",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        entityId: "123456",
        data: { name: "Updated Campaign Name" },
        updateMask: "name",
      },
    },
    {
      label: "Pause an ad group",
      input: {
        entityType: "adGroup",
        customerId: "1234567890",
        entityId: "789012",
        data: { status: "PAUSED" },
        updateMask: "status",
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
