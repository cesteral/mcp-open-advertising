// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDuplicateEntityTypeEnum } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_duplicate_entity";
const TOOL_TITLE = "Duplicate Meta Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a campaign, ad set, or ad via POST /{id}/copies.

**Supported entity types:** ${getDuplicateEntityTypeEnum().join(", ")}

Returns the new entity ID. Use meta_get_entity to fetch the full entity.

**Options:**
- \`rename_options\`: { prefix, suffix } for naming the copy
- \`status_option\`: ACTIVE, PAUSED, or INHERITED

**Note:** Effective 2026-05-19 Meta blocks \`/copies\` for Advantage+ Shopping and Advantage+ App campaigns (Marketing API v25.0). Use the standard Advantage+ campaign structure for those objectives instead.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z.enum(getDuplicateEntityTypeEnum()).describe("Type of entity to duplicate"),
    entityId: z.string().min(1).describe("ID of the entity to duplicate"),
    renameOptions: z
      .object({
        prefix: z.string().optional(),
        suffix: z.string().optional(),
      })
      .optional()
      .describe("Naming options for the copy"),
    statusOption: z
      .enum(["ACTIVE", "PAUSED", "INHERITED"])
      .optional()
      .describe("Status for the copy (default: PAUSED)"),
  })
  .describe("Parameters for duplicating a Meta Ads entity");

export const DuplicateEntityOutputSchema = z
  .object({
    result: z.record(z.any()).describe("Duplication result (includes new entity ID)"),
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
  const { metaService } = resolveSessionServices(sdkContext);

  const options: Record<string, unknown> = {};

  if (input.renameOptions) {
    const renameOptions: Record<string, string> = {};
    if (input.renameOptions.prefix) {
      renameOptions.rename_prefix = input.renameOptions.prefix;
    }
    if (input.renameOptions.suffix) {
      renameOptions.rename_suffix = input.renameOptions.suffix;
    }
    if (Object.keys(renameOptions).length > 0) {
      options.rename_options = renameOptions;
    }
  }

  if (input.statusOption) {
    options.status_option = input.statusOption;
  }

  const result = await metaService.duplicateEntity(
    input.entityId,
    Object.keys(options).length > 0 ? options : undefined,
    context
  );

  return {
    result: result as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function duplicateEntityResponseFormatter(result: DuplicateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity duplicated successfully\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Duplicate a campaign with prefix",
      input: {
        entityType: "campaign",
        entityId: "23456789012345",
        renameOptions: { prefix: "Copy of " },
        statusOption: "PAUSED",
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
