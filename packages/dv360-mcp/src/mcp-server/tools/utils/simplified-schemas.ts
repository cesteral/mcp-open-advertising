// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { getSupportedEntityTypesDynamic } from "./entity-mapping-dynamic.js";
import { EntityIdFieldsSchema } from "./entity-id-extraction.js";

function getEntityTypeEnum(): [string, ...string[]] {
  const supportedTypes = getSupportedEntityTypesDynamic();
  if (supportedTypes.length === 0) {
    throw new Error("No supported DV360 entity types discovered for simplified schema generation");
  }
  return supportedTypes as [string, ...string[]];
}

export function createSimplifiedCreateEntityInputSchema(): z.ZodTypeAny {
  return z.object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Entity type. Fetch entity-schema://{entityType} for required fields."),
    ...EntityIdFieldsSchema,
    data: z
      .record(z.any())
      .describe(
        "Entity payload. Use entity-schema://{entityType}, entity-fields://{entityType}, and entity-examples://{entityType} before calling."
      ),
  });
}

export function createSimplifiedUpdateEntityInputSchema(): z.ZodTypeAny {
  return z.object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Entity type. Fetch entity-fields://{entityType} for valid updateMask paths."),
    ...EntityIdFieldsSchema,
    data: z.record(z.any()).describe("Partial payload containing only fields to update."),
    updateMask: z
      .string()
      .describe("Comma-separated field paths to update (e.g. displayName,entityStatus)."),
    reason: z.string().optional().describe("Optional reason for audit trail"),
  });
}

export function estimateSchemaSize(schema: unknown): number {
  return JSON.stringify(schema).length;
}
