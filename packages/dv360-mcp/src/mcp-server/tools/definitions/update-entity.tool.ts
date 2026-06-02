// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getSupportedEntityTypesDynamic,
  getEntitySchemaForOperation,
} from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds, EntityIdFieldsSchema } from "../utils/entity-id-extraction.js";
import { createSimplifiedUpdateEntityInputSchema } from "../utils/simplified-schemas.js";
import {
  getEntityTypesWithExamples,
  getEntityExamples,
  findMatchingExample,
} from "../utils/entity-examples.js";
import { addIdValidationIssues, mergeIdsIntoData } from "../utils/parent-id-validation.js";
import { runDv360UpdateDryRun, resolveDv360DispatchedCapability } from "../utils/dry-run.js";
import { snapshotFromDv360Entity, captureDv360Snapshot } from "../utils/capture-snapshot.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  CesteralWriteToolAnnotations,
  DryRunValidationError,
} from "@cesteral/shared";

const TOOL_NAME = "dv360_update_entity";

// Generate dynamic description with examples and hierarchy
function generateToolDescription(): string {
  const typesWithExamples = getEntityTypesWithExamples().slice(0, 6).join(", ");
  const examplesHint =
    typesWithExamples.length > 0 ? ` Common examples available for: ${typesWithExamples}.` : "";
  return (
    "Update a DV360 entity using partial data plus updateMask. " +
    "Use updateMask as a comma-separated list of field paths to specify exactly which fields to update (e.g., 'entityStatus' or 'budget.budgetSegments'). " +
    "Fetch entity-fields://{entityType} for the full field schema and entity-examples://{entityType} for common update patterns before calling." +
    examplesHint
  );
}

// Full validation schema (with refine logic)
const FullUpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getSupportedEntityTypesDynamic() as [string, ...string[]]),
    ...EntityIdFieldsSchema,
    data: z.record(z.any()),
    updateMask: z.string().min(1),
    reason: z.string().optional(),
    dry_run: z.boolean().optional().default(false),
  })
  .superRefine((input, ctx) => {
    const mergedData = mergeIdsIntoData(
      input.entityType,
      input.data as Record<string, unknown>,
      input as Record<string, unknown>
    );
    addIdValidationIssues(ctx, {
      entityType: input.entityType,
      input: input as Record<string, unknown>,
      data: mergedData,
      operation: "update",
      requireEntityId: true,
    });
  });

// Export simplified schema for MCP
export const UpdateEntityInputSchema = createSimplifiedUpdateEntityInputSchema().describe(
  "Update DV360 entity. Fetch entity-fields://{entityType} and entity-examples://{entityType} first."
);

export const UpdateEntityOutputSchema = z.object({
  entity: z.record(z.any()),
  previousValues: z.record(z.any()).optional(),
  timestamp: z.string().datetime(),
  dryRun: DryRunResultSchema.optional().describe(
    "Present only when the request was made with `dry_run: true`. The mutation was NOT applied; `entity` reflects the symbolic post-state and `previousValues` is empty."
  ),
  before: NormalizedEntitySnapshotSchema.optional().describe(
    "Pre-write canonical snapshot of the entity, captured at the start of the handler. Populated when the entity type is in canonical scope (campaign, insertionOrder, lineItem) and the read partner returns the entity. Undefined for out-of-scope types or when the pre-read fails."
  ),
  after: NormalizedEntitySnapshotSchema.optional().describe(
    "Post-write canonical snapshot of the entity. Captured by normalizing the patched resource that the DV360 PATCH call returns. Undefined when the entity type is out of canonical scope."
  ),
  dispatchedCapability: DispatchedCapabilitySchema.describe(
    "The concrete (operation, entityKind) this call resolved to, derived from the `data` + `updateMask` payload. Present on every response — dry-run and real write alike."
  ),
});

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(
  input: UpdateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  // Server-side validation using full schema
  const validatedInput = FullUpdateEntityInputSchema.parse(input);
  const mergedData = mergeIdsIntoData(
    validatedInput.entityType,
    validatedInput.data,
    validatedInput as Record<string, unknown>
  );

  const { dv360Service } = resolveSessionServices(sdkContext);
  const entityIds = extractEntityIds(validatedInput, validatedInput.entityType);

  // The (operation, entityKind) this call resolves to — derived from the
  // `data` payload. Required on every governed response.
  const dispatchedCapability = resolveDv360DispatchedCapability(
    validatedInput.entityType,
    mergedData
  );

  if (validatedInput.dry_run === true) {
    const dryRun = await runDv360UpdateDryRun(
      {
        entityType: validatedInput.entityType,
        ids: entityIds,
        data: mergedData,
        updateMask: validatedInput.updateMask,
      },
      dv360Service,
      context,
      (entityType, applied) => {
        const errors: DryRunValidationError[] = [];
        try {
          const schema = getEntitySchemaForOperation(entityType, "update");
          schema.parse(applied);
        } catch (err: any) {
          if (err?.issues && Array.isArray(err.issues)) {
            for (const issue of err.issues) {
              errors.push({
                code: issue.code ?? "ZOD",
                message: issue.message ?? String(err),
                field: Array.isArray(issue.path) ? issue.path.join(".") : undefined,
              });
            }
          } else {
            errors.push({ code: "ZOD", message: err?.message ?? String(err) });
          }
        }
        return errors;
      }
    );
    return {
      entity: dryRun.expectedPostState
        ? (dryRun.expectedPostState as unknown as Record<string, any>)
        : {},
      previousValues: {},
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  try {
    const current = (await dv360Service.getEntity(
      validatedInput.entityType,
      entityIds,
      context
    )) as Record<string, any>;
    const updateFields = validatedInput.updateMask.split(",").map((f) => f.trim());
    const previousValues: Record<string, any> = {};
    for (const field of updateFields) {
      const parts = field.split(".");
      let value: any = current;
      for (const part of parts) {
        value = value?.[part];
      }
      previousValues[field] = value;
    }
    // PR-D: normalize pre-state from the same `current` we already read for
    // previousValues — no extra round-trip.
    const before = snapshotFromDv360Entity(validatedInput.entityType, entityIds, current ?? {});

    const updated = await dv360Service.updateEntity(
      validatedInput.entityType,
      entityIds,
      mergedData,
      validatedInput.updateMask,
      context,
      current
    );
    // PR-D: DV360 PATCH returns the patched resource directly. If the SDK
    // shape is unexpected (e.g. wrapped), fall back to a re-read so `after`
    // is still populated.
    let after = snapshotFromDv360Entity(
      validatedInput.entityType,
      entityIds,
      (updated as Record<string, unknown>) ?? {}
    );
    if (!after) {
      after = await captureDv360Snapshot(
        dv360Service,
        validatedInput.entityType,
        entityIds,
        context
      );
    }
    return {
      entity: updated as Record<string, any>,
      previousValues,
      timestamp: new Date().toISOString(),
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
      dispatchedCapability,
    };
  } catch (error: any) {
    // Enhance error message with example suggestions
    const examples = getEntityExamples(validatedInput.entityType);

    if (examples.length > 0) {
      const exampleSuggestions = examples
        .slice(0, 3)
        .map((ex) => `  - ${ex.operation}: updateMask="${ex.updateMask}"`)
        .join("\n");

      const enhancedMessage = `${error.message}\n\nTip: Try one of these common patterns for ${validatedInput.entityType}:\n${exampleSuggestions}`;
      error.message = enhancedMessage;
    }

    throw error;
  }
}

export function updateEntityResponseFormatter(
  result: UpdateEntityOutput,
  input?: UpdateEntityInput
): McpTextContent[] {
  let responseText = "Entity updated successfully:\n" + JSON.stringify(result.entity, null, 2);

  // Add helpful note if this matches a known pattern
  if (input) {
    const matchingExample = findMatchingExample(input.entityType, input.data, input.updateMask);
    if (matchingExample) {
      responseText += `\n\n[OK] Applied pattern: ${matchingExample.operation}\n`;
      responseText += `Note: ${matchingExample.notes}`;
    }
  }

  return [{ type: "text" as const, text: responseText }];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: "Update Entity",
  description: generateToolDescription(),
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  inputExamples: [
    {
      label: "Pause a line item",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "7654321",
        data: { entityStatus: "ENTITY_STATUS_PAUSED" },
        updateMask: "entityStatus",
        reason: "Pausing for budget review",
      },
    },
    {
      label: "Update insertion order budget",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        insertionOrderId: "5555555",
        data: {
          budget: {
            budgetUnit: "BUDGET_UNIT_CURRENCY",
            automationType: "INSERTION_ORDER_AUTOMATION_TYPE_BUDGET",
            budgetSegments: [
              {
                budgetAmountMicros: "75000000000",
                dateRange: {
                  startDate: { year: 2025, month: 1, day: 15 },
                  endDate: { year: 2025, month: 6, day: 30 },
                },
              },
            ],
          },
        },
        updateMask: "budget.budgetSegments",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "update_entity",
      // `dv360_update_entity` dispatches to budget, status, and arbitrary
      // field updates via the `data` + `updateMask` payload, so it advertises
      // every canonical op it can express.
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      // Round-1 governance scope is campaign / insertion_order / line_item;
      // the tool itself accepts more DV360 types (creatives, ad groups, etc.)
      // but those land with later rounds as canonical-snapshot coverage grows.
      entityKinds: ["campaign", "insertion_order", "line_item"],
      entityIdArgs: ["advertiserId", "campaignId", "insertionOrderId", "lineItemId"],
      readPartner: {
        toolName: "dv360_get_entity",
        argMap: {
          advertiserId: "advertiserId",
          campaignId: "campaignId",
          insertionOrderId: "insertionOrderId",
          lineItemId: "lineItemId",
        },
      },
      schemaVersion: 1,
      contractId: "dv360.update_entity.v1",
      // PR-C wires `dry_run` (symbolic Zod validator + symbolic apply via the
      // read partner). PR-D normalizes the pre-read entity into `before` and
      // the patched resource returned by the PATCH call into `after`.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      // Contract promises the governance admission layer requires.
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
