// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import {
  getCreatableEntityTypesDynamic,
  getUpdatableEntityTypesDynamic,
} from "./entity-mapping-dynamic.js";
import { EntityIdFieldsSchema } from "./entity-id-extraction.js";

function toEntityTypeEnum(types: string[]): [string, ...string[]] {
  if (types.length === 0) {
    throw new Error("No supported DV360 entity types discovered for simplified schema generation");
  }
  return types as [string, ...string[]];
}

export function createSimplifiedCreateEntityInputSchema(): z.ZodTypeAny {
  return z.object({
    entityType: z
      .enum(toEntityTypeEnum(getCreatableEntityTypesDynamic()))
      .describe("Entity type. Fetch entity-schema://{entityType} for required fields."),
    ...EntityIdFieldsSchema,
    data: z
      .record(z.any())
      .describe(
        "Entity payload. Use entity-schema://{entityType}, entity-fields://{entityType}, and entity-examples://{entityType} before calling."
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation against the entity schema and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without invoking the DV360 API. No entity is created."
      ),
  });
}

export function createSimplifiedUpdateEntityInputSchema(): z.ZodTypeAny {
  return z.object({
    entityType: z
      .enum(toEntityTypeEnum(getUpdatableEntityTypesDynamic()))
      .describe("Entity type. Fetch entity-fields://{entityType} for valid updateMask paths."),
    ...EntityIdFieldsSchema,
    data: z.record(z.any()).describe("Partial payload containing only fields to update."),
    updateMask: z
      .string()
      .describe("Comma-separated field paths to update (e.g. displayName,entityStatus)."),
    reason: z.string().optional().describe("Optional reason for audit trail"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed mutation against the entity schema and returns a DryRunResult under `dryRun` without invoking the DV360 API. The underlying entity is never mutated."
      ),
  });
}

export function estimateSchemaSize(schema: unknown): number {
  return JSON.stringify(schema).length;
}
