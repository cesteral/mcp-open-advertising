// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { getUpdatableEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import {
  runAmazonDspUpdateDryRun,
  resolveAmazonDspDispatchedCapability,
  symbolicValidateUpdate,
} from "../utils/dry-run.js";
import { AccountIdSchema } from "../utils/account-id.js";
import {
  captureAmazonDspSnapshot,
  snapshotFromAmazonDspEntity,
} from "../utils/capture-snapshot.js";
import {
  McpError,
  JsonRpcErrorCode,
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_update_entity";
const TOOL_TITLE = "Update AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Update an Amazon DSP entity via the Amazon Ads Unified API (\`POST /adsApi/v1/update/{campaigns|adGroups|ads|adAssociations}\` with \`[{ <id>: entityId, ...data }]\`). Only the fields sent are changed.

**Supported entity types:** ${getUpdatableEntityTypeEnum().join(", ")} (targets have no Unified update — delete and recreate)

**Gotchas:**
- \`state\` accepts ENABLED or PAUSED only; ARCHIVED is not an update state — use \`amazon_dsp_delete_entity\`
- Budgets are \`budgets[]\` of \`{ budgetType: "MONETARY", budgetValue: { monetaryBudgetValue: { monetaryBudget: { value } } }, recurrenceTimePeriod: "DAILY" | "LIFETIME" }\`; a legacy DAILY/LIFETIME \`budget\` is mapped
- Use \`amazon_dsp_bulk_update_status\` for status-only changes`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getUpdatableEntityTypeEnum()).describe("Type of entity to update"),
    profileId: z.string().min(1).describe("Amazon Ads profile ID bound to this session"),
    accountId: AccountIdSchema,
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to update (campaignId / adGroupId / adId / adAssociationId)"),
    data: z.record(z.any()).describe("Fields to update (Unified API field names)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation and returns a DryRunResult under `dryRun` without invoking the Amazon DSP API. The underlying entity is never modified."
      ),
  })
  .describe("Parameters for updating a AmazonDsp Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    entityId: z.string(),
    entityType: z.string(),
    updated: z.boolean(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. The mutation was NOT applied."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (order, lineItem) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity, normalized from the entity the Unified update returns (re-read fallback). Undefined when the entity type is out of canonical scope or both reads fail."
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
  const { amazonDspService, boundProfileId } = resolveSessionServices(sdkContext);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolveAmazonDspDispatchedCapability(input.entityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runAmazonDspUpdateDryRun(
      {
        entityType: input.entityType,
        accountId: input.accountId,
        entityId: input.entityId,
        data: input.data,
      },
      amazonDspService,
      context
    );
    return {
      entityId: input.entityId,
      entityType: input.entityType,
      updated: false,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Fail fast on a mismatched account — but only on the real-execution path, so a
  // dry-run preview with a different id is allowed (matches the other write tools).
  assertAccountScope(input.profileId, boundProfileId, "profileId");

  // Fail fast on an empty or invalid update payload before hitting the API,
  // applying the same symbolic validation the dry-run path uses (finding M3) so
  // a payload the tool reports "would FAIL" under dry-run can't execute for real.
  if (Object.keys(input.data).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`data` must contain at least one field to update an Amazon DSP entity."
    );
  }
  const updateValidationErrors = symbolicValidateUpdate(
    input.entityType,
    input.entityId,
    input.data,
    input.accountId
  );
  if (updateValidationErrors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid update payload: ${updateValidationErrors.map((e) => e.message).join("; ")}`
    );
  }

  // R2-U4: capture pre-state before mutating. Best-effort — out-of-scope
  // entity types and read failures leave `before` undefined.
  const before = await captureAmazonDspSnapshot(
    amazonDspService,
    input.entityType,
    input.accountId,
    input.entityId,
    context
  );

  const updated = await amazonDspService.updateEntity(
    input.entityType as AmazonDspEntityType,
    input.accountId,
    input.entityId,
    input.data,
    context
  );

  // R2-U4: the 207 multi-status carries the updated entity
  // (`success[0].<item>`) — normalize it directly, falling back to a re-read
  // if it lacks the snapshot fields.
  let after = snapshotFromAmazonDspEntity(
    input.entityType,
    input.entityId,
    updated ?? {},
    input.accountId
  );
  if (!after) {
    after = await captureAmazonDspSnapshot(
      amazonDspService,
      input.entityType,
      input.accountId,
      input.entityId,
      context
    );
  }

  return {
    entityId: input.entityId,
    entityType: input.entityType,
    updated: true,
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
      text: `${result.entityType} ${result.entityId} updated successfully\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "update_entity",
      // `amazon_dsp_update_entity` is a multi-operation dispatcher: callers
      // change status, budget, name, schedule, etc. via the `data` payload,
      // so the contract advertises every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Governed scope is order (Unified campaign) and lineItem (Unified ad
      // group) — the entities carrying a canonical status/budget snapshot.
      // creative / creativeAssociation have no canonical entity kind and are
      // intentionally out of scope; target cannot be updated at all.
      entityKinds: ["order", "line_item"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "amazon_dsp_get_entity",
        argMap: {
          entityType: "entityType",
          profileId: "profileId",
          accountId: "accountId",
          entityId: "entityId",
        },
      },
      schemaVersion: 1,
      contractId: "amazon_dsp.update_entity.v1",
      // R2-U4: `dry_run` is symbolic apply — the Unified DSP spec declares no
      // validate / preview mode. Validation is the execute path's request
      // translation; expected post-state is the read-partner snapshot
      // shallow-merged with the translated patch. `before` / `after` are
      // captured pre-write and from the entity the update returns.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      // Contract promises the governance admission layer requires.
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Rename an order (campaign) and set a daily budget",
      input: {
        entityType: "order",
        profileId: "1234567890",
        accountId: "5550001112223",
        entityId: "581234567890123",
        data: {
          name: "Updated Campaign Name",
          budgets: [
            {
              budgetType: "MONETARY",
              budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 2000 } } },
              recurrenceTimePeriod: "DAILY",
            },
          ],
        },
      },
    },
    {
      label: "Update a line item (ad group) base bid",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        accountId: "5550001112223",
        entityId: "592345678901234",
        data: { bid: { baseBid: 2.0 } },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
  // Formatter prints only entityType/entityId and symbolic validation text over caller input, so no content block carries platform text.
  untrustedContent: {
    structuredPaths: ["$.dryRun", "$.before", "$.after"],
    contentBlocks: [],
  },
};
