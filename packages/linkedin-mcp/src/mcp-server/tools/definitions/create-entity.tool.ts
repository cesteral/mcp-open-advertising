// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

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
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to create"),
    data: z
      .record(z.any())
      .describe("Entity fields as key-value pairs"),
  })
  .describe("Parameters for creating a LinkedIn Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity (returns id/URN at minimum)"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
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

  const entity = await linkedInService.createEntity(
    input.entityType as LinkedInEntityType,
    input.data,
    context
  );

  return {
    entity: entity as Record<string, unknown>,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
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