// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import { runGAdsCreateDryRun, resolveGAdsCreateCapability } from "../utils/dry-run.js";
import { captureGAdsSnapshot } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "gads_create_entity";
const TOOL_TITLE = "Create Google Ads Entity";
const TOOL_DESCRIPTION = `Create a new Google Ads entity using the :mutate API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Provide entity data matching the Google Ads API v23 field format.
Refer to \`entity-schema://{entityType}\` resources for field reference.

**Important**: For campaigns, create a campaignBudget first and reference it via the \`campaignBudget\` field.`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    customerId: z.string().min(1).describe("Google Ads customer ID (no dashes)"),
    data: z
      .record(z.any())
      .describe("Entity data to create (fields vary by entity type — see entity-schema resources)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation natively (Google Ads validateOnly) and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without creating it."
      ),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for creating a Google Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    mutateResult: z.record(z.any()).describe("Mutate operation result"),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entity was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, re-read by the new entity ID from the mutate resourceName (in-scope kinds: campaign, ad_group, campaign_budget). Create has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Entity creation result");

type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;

export async function createEntityLogic(
  input: CreateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateEntityOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveGAdsCreateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runGAdsCreateDryRun(
      { entityType: input.entityType, customerId: input.customerId, data: input.data },
      gadsService,
      context
    );
    return {
      mutateResult: {},
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const result = (await gadsService.createEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.data,
    context
  )) as Record<string, any>;

  // Re-read the created entity for the canonical `after` snapshot. The mutate
  // response carries the new resourceName; its last segment is the entity ID.
  // Create has no `before`. Best-effort: undefined for out-of-scope kinds.
  const resourceName: unknown = result?.results?.[0]?.resourceName ?? result?.resourceName;
  const createdId = typeof resourceName === "string" ? resourceName.split("/").pop() : undefined;
  const after: NormalizedEntitySnapshot | undefined = createdId
    ? await captureGAdsSnapshot(gadsService, input.entityType, input.customerId, createdId, context)
    : undefined;

  return {
    mutateResult: result,
    timestamp: new Date().toISOString(),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const outcome = result.dryRun.wouldSucceed ? "would succeed" : "would FAIL";
    const errs = result.dryRun.validationErrors.map((e) => e.message).join("; ");
    return [
      {
        type: "text" as const,
        text:
          `Dry-run: creating entity ${outcome}.` +
          (errs ? `\nValidation: ${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Entity created successfully\n${JSON.stringify(result.mutateResult, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateEntityInputSchema,
  outputSchema: CreateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "google_ads",
      contractPlatformSlug: "google_ads",
      contractToolSlug: "create_entity",
      operation: ["create"],
      entityKinds: ["campaign", "ad_group", "campaign_budget"],
      entityIdArgs: ["customerId"],
      readPartner: {
        toolName: "gads_get_entity",
        argMap: { customerId: "customerId" },
      },
      schemaVersion: 1,
      contractId: "google_ads.create_entity.v1",
      // `dry_run` = native Google Ads validateOnly + symbolic post-state. `after`
      // re-read by the new ID from the mutate resourceName (no `before`).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a campaign budget",
      input: {
        entityType: "campaignBudget",
        customerId: "1234567890",
        data: {
          name: "Q1 2025 Search Budget",
          amountMicros: "50000000000",
          deliveryMethod: "STANDARD",
        },
      },
    },
    {
      label: "Create a search campaign",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        data: {
          name: "Q1 2025 Brand Search",
          advertisingChannelType: "SEARCH",
          status: "PAUSED",
          campaignBudget: "customers/1234567890/campaignBudgets/9876543",
          startDate: "2025-01-15",
          endDate: "2025-03-31",
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
          },
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
