// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_entity";
const TOOL_TITLE = "Get LinkedIn Ads Entity";
const TOOL_DESCRIPTION = `Get a single LinkedIn Ads entity by URN.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Important:** LinkedIn entity IDs are URNs like \`urn:li:sponsoredAccount:123\`.`;

export const GetEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to retrieve"),
    entityUrn: z
      .string()
      .min(1)
      .describe("The entity URN to retrieve (e.g., urn:li:sponsoredAccount:123)"),
  })
  .describe("Parameters for getting a LinkedIn Ads entity");

export const GetEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Retrieved entity data"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity retrieval result");

type GetEntityInput = z.infer<typeof GetEntityInputSchema>;
type GetEntityOutput = z.infer<typeof GetEntityOutputSchema>;

export async function getEntityLogic(
  input: GetEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetEntityOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const entity = await linkedInService.getEntity(
    input.entityType as LinkedInEntityType,
    input.entityUrn,
    context
  );

  return {
    entity: entity as unknown as Record<string, unknown>,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function getEntityResponseFormatter(result: GetEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} retrieved\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetEntityInputSchema,
  outputSchema: GetEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get a campaign by URN",
      input: {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:123456789",
      },
    },
    {
      label: "Get an ad account",
      input: {
        entityType: "adAccount",
        entityUrn: "urn:li:sponsoredAccount:123456789",
      },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};