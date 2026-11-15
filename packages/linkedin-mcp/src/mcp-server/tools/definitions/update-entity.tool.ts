// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import { adAccountUrnSchema, refineAdAccountUrn } from "../utils/ad-account-param.js";
import {
  runLinkedInUpdateDryRun,
  resolveLinkedInDispatchedCapability,
  symbolicValidate,
  creativeStatusFieldError,
} from "../utils/dry-run.js";
import { captureLinkedInSnapshot, snapshotFromLinkedInEntity } from "../utils/capture-snapshot.js";
import {
  McpError,
  JsonRpcErrorCode,
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "linkedin_update_entity";
const TOOL_TITLE = "Update LinkedIn Ads Entity";
const TOOL_DESCRIPTION = `Update an existing LinkedIn Ads entity via PATCH (partial update).

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses X-Restli-Method: PARTIAL_UPDATE semantics — only provided fields are updated.

**Gotchas:**
- Pass the owning ad account as \`adAccountUrn\` for every type except adAccount.
- LinkedIn PATCH uses a \`patch.$set\` wrapper internally; just provide the fields to update.
- Status values: ACTIVE, PAUSED, DRAFT, ARCHIVED, CANCELED, PENDING_DELETION. ARCHIVED is reversible (set ACTIVE or PAUSED again). PENDING_DELETION is how LinkedIn deletes anything that is not DRAFT.
- A creative's status field is \`intendedStatus\`, not \`status\`; \`status\` is refused for a creative.
- Budget changes are applied immediately.
- Writes are rate-limited at 3x read cost.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    entityUrn: z
      .string()
      .min(1)
      .describe("The entity URN to update (e.g., urn:li:sponsoredCampaign:123)"),
    adAccountUrn: adAccountUrnSchema,
    data: z.record(z.any()).describe("Fields to update as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the LinkedIn API. The underlying entity is never modified."
      ),
  })
  .superRefine(refineAdAccountUrn)
  .describe("Parameters for updating a LinkedIn Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    success: z.boolean(),
    entityUrn: z.string(),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (campaign) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity, normalized from the entity the LinkedIn partial update returns (re-read fallback). Undefined when the entity type is out of canonical scope or both reads fail."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to, derived from the `data` payload. Present on every response — dry-run and real write alike."
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
  const { linkedInService } = resolveSessionServices(sdkContext);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolveLinkedInDispatchedCapability(input.entityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runLinkedInUpdateDryRun(
      {
        entityType: input.entityType,
        entityUrn: input.entityUrn,
        adAccountUrn: input.adAccountUrn,
        data: input.data,
      },
      linkedInService,
      context
    );
    return {
      success: false,
      entityUrn: input.entityUrn,
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Fail fast on an empty or invalid update payload before hitting the API,
  // applying the same symbolic validation the dry-run path uses (finding M3) so
  // a payload the tool reports "would FAIL" under dry-run can't execute for real.
  if (Object.keys(input.data).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`data` must contain at least one field to update a LinkedIn entity."
    );
  }
  const updateValidationErrors = symbolicValidate(input.data);
  const creativeStatusError = creativeStatusFieldError(input.entityType, input.data);
  if (creativeStatusError) updateValidationErrors.push(creativeStatusError);
  if (updateValidationErrors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid update payload: ${updateValidationErrors.map((e) => e.message).join("; ")}`
    );
  }

  // R3-U3: capture pre-state before mutating. Best-effort — out-of-scope
  // entity types and read failures leave `before` undefined.
  const before = await captureLinkedInSnapshot(
    linkedInService,
    input.entityType,
    input.entityUrn,
    input.adAccountUrn,
    context
  );

  const updated = await linkedInService.updateEntity(
    input.entityType as LinkedInEntityType,
    input.entityUrn,
    input.adAccountUrn,
    input.data,
    context
  );

  // R3-U3: the LinkedIn partial update returns the updated entity — normalize
  // it directly, falling back to a re-read if the response shape is unexpected.
  let after = snapshotFromLinkedInEntity(
    input.entityType,
    input.entityUrn,
    (updated as unknown as Record<string, unknown>) ?? {}
  );
  if (!after) {
    after = await captureLinkedInSnapshot(
      linkedInService,
      input.entityType,
      input.entityUrn,
      input.adAccountUrn,
      context
    );
  }

  return {
    success: true,
    entityUrn: input.entityUrn,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedStateSource } = result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errorLines = validationErrors.length
      ? "\n" + validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n")
      : "";
    return [
      {
        type: "text" as const,
        text: `Dry run: mutation ${verdict} (validation: ${validationSource}, expected-state: ${expectedStateSource}). The entity was NOT modified.${errorLines}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityUrn} updated successfully\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "linkedin_ads",
      contractPlatformSlug: "linkedin_ads",
      contractToolSlug: "update_entity",
      // `linkedin_update_entity` is a multi-operation dispatcher: callers
      // change status, budget, name, etc. via the `data` payload, so the
      // contract advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Governed scope is `campaign` — the LinkedIn entity carrying a
      // canonical status/budget snapshot. `campaignGroup` is intentionally
      // out of scope (governance taxonomy decision pending); creative /
      // adAccount / conversionRule have no canonical entity kind.
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
      contractId: "linkedin_ads.update_entity.v1",
      // R3-U3: `dry_run` is symbolic apply — LinkedIn exposes no native
      // validate / preview / draft mode. Validation runs symbolic business
      // rules; expected post-state is the read-partner snapshot shallow-merged
      // with the patch. `before` / `after` are captured pre-write and from the
      // entity the partial update returns.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      // Contract promises the governance admission layer requires.
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Pause a campaign",
      input: {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:123456789",
        adAccountUrn: "urn:li:sponsoredAccount:512345678",
        data: { status: "PAUSED" },
      },
    },
    {
      label: "Update campaign daily budget",
      input: {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:123456789",
        adAccountUrn: "urn:li:sponsoredAccount:512345678",
        data: {
          dailyBudget: { amount: "100.00", currencyCode: "USD" },
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.dryRun", "$.before", "$.after"],
    contentBlocks: [],
  },
};
