// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDuplicateEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_duplicate_entity";
const TOOL_TITLE = "Duplicate Pinterest Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a Pinterest Ads entity (copy it).

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Creates a copy of the entity. The copy is created in DISABLED status by default.
Use the returned entity ID to make modifications before enabling.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicateEntityTypeEnum()).describe("Type of entity to duplicate"),
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    entityId: z.string().min(1).describe("ID of the entity to duplicate"),
    options: z
      .record(z.any())
      .optional()
      .describe("Optional copy options (e.g., new name, target campaign ID)"),
  })
  .describe("Parameters for duplicating a Pinterest Ads entity");

export const DuplicateEntityOutputSchema = z
  .object({
    newEntity: z.record(z.any()).describe("Newly created duplicate entity data"),
    sourceEntityId: z.string(),
    entityType: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity duplication result");

type DuplicateEntityInput = z.infer<typeof DuplicateEntityInputSchema>;
type DuplicateEntityOutput = z.infer<typeof DuplicateEntityOutputSchema>;

export async function duplicateEntityLogic(
  input: DuplicateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DuplicateEntityOutput> {
  const { pinterestService } = resolveSessionServices(sdkContext);

  const newEntity = await pinterestService.duplicateEntity(
    input.entityType as PinterestEntityType,
    { adAccountId: input.adAccountId },
    input.entityId,
    input.options,
    context
  );

  return {
    newEntity: newEntity as Record<string, unknown>,
    sourceEntityId: input.entityId,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function duplicateEntityResponseFormatter(result: DuplicateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.sourceEntityId} duplicated successfully\nNew entity:\n${JSON.stringify(result.newEntity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Duplicate a campaign",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
        entityId: "1800123456789",
      },
    },
    {
      label: "Duplicate an ad group with new name",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        entityId: "1700123456789",
        options: {
          adgroup_name: "Copy of Ad Group A",
        },
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
