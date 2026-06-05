// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import { runLinkedInCreateDryRun, resolveLinkedInCreateCapability } from "../utils/dry-run.js";
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

const TOOL_NAME = "linkedin_create_entity";
const TOOL_TITLE = "Create LinkedIn Ads Entity";
const TOOL_DESCRIPTION = `Create a new LinkedIn Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Key requirements by entity type:**
- **campaignGroup**: requires \`name\`, \`account\` (URN), \`status\`
- **campaign**: requires \`name\`, \`campaignGroup\` (URN), \`account\` (URN), \`type\`, \`objectiveType\`, \`status\`
- **creative**: requires \`campaign\` (URN), \`status\`, \`reference\`
- **conversionRule**: requires \`name\`, \`type\`, \`account\` (URN), \`status\`

**Gotchas:**
- All entity IDs are URNs (e.g., urn:li:sponsoredAccount:123)
- Budget values use CurrencyAmount objects: \`{ "amount": "10.00", "currencyCode": "USD" }\`
- Campaigns require \`type\` (TEXT_AD, SPONSORED_UPDATES, etc.) and \`objectiveType\`
- Writes are rate-limited at 3x read cost`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    data: z.record(z.any()).describe("Entity fields as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without calling the LinkedIn API. No entity is created."
      ),
  })
  .describe("Parameters for creating a LinkedIn Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity (returns id/URN at minimum)"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entity was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, normalized from the created entity (in-scope kind: campaign). Create has no `before`."
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
  const { linkedInService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveLinkedInCreateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runLinkedInCreateDryRun(
      { entityType: input.entityType, data: input.data },
      linkedInService,
      context
    );
    return {
      entity: {},
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const entity = (await linkedInService.createEntity(
    input.entityType as LinkedInEntityType,
    input.data,
    context
  )) as unknown as Record<string, unknown>;

  // Normalize the created entity for the canonical `after` snapshot (the create
  // response is the created resource). Create has no `before`. Best-effort.
  const createdUrn =
    typeof entity?.id === "string" ? entity.id : typeof entity?.urn === "string" ? entity.urn : "";
  const after: NormalizedEntitySnapshot | undefined = snapshotFromLinkedInEntity(
    input.entityType,
    createdUrn,
    entity
  );

  return {
    entity,
    entityType: input.entityType,
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
          `Dry-run: creating ${result.entityType} ${outcome}.` +
          (errs ? `\nValidation: ${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "linkedin_ads",
      contractPlatformSlug: "linkedin_ads",
      contractToolSlug: "create_entity",
      operation: ["create"],
      // Governed scope is `campaign`. campaignGroup / creative / conversionRule
      // are creatable but resolve canonicalEntityKind:null — still token-gated.
      entityKinds: ["campaign"],
      // Create has no top-level entity/account ID arg (the account URN lives in
      // `data`); the new URN is assigned by the server and returned in `entity`.
      entityIdArgs: [],
      readPartner: {
        toolName: "linkedin_get_entity",
        argMap: { entityType: "entityType" },
      },
      schemaVersion: 1,
      contractId: "linkedin_ads.create_entity.v1",
      // `dry_run` = symbolic validate + symbolic apply. `after` normalized from
      // the created entity (no `before`).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a campaign group",
      input: {
        entityType: "campaignGroup",
        data: {
          name: "Q1 2026 Brand Awareness",
          account: "urn:li:sponsoredAccount:123456789",
          status: "DRAFT",
          totalBudget: { amount: "5000.00", currencyCode: "USD" },
          runSchedule: { start: 1735689600000, end: 1748476800000 },
        },
      },
    },
    {
      label: "Create a campaign",
      input: {
        entityType: "campaign",
        data: {
          name: "LinkedIn Awareness Campaign",
          campaignGroup: "urn:li:sponsoredCampaignGroup:987654321",
          account: "urn:li:sponsoredAccount:123456789",
          type: "SPONSORED_UPDATES",
          objectiveType: "BRAND_AWARENESS",
          status: "DRAFT",
          dailyBudget: { amount: "50.00", currencyCode: "USD" },
          bidType: "CPM",
          unitCost: { amount: "10.00", currencyCode: "USD" },
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
