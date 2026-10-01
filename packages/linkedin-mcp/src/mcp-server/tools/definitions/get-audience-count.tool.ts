// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { TargetingCriteriaSchema } from "../utils/targeting-criteria-schema.js";
import { NO_UNTRUSTED_CONTENT } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_audience_count";
const TOOL_TITLE = "Get LinkedIn Ads Audience Count";
const TOOL_DESCRIPTION = `Count the LinkedIn members that match a targetingCriteria.

Returns \`active\` (members more likely to visit LinkedIn) and \`total\` (all matching members, a rounded approximation). LinkedIn reports \`total\` as 0 when the audience is under 300 members, to protect member privacy; 300 is also the minimum audience needed to run a campaign. So a total of 0 means "too small to report", not necessarily an empty audience.

This is the audience size. For impressions, clicks and spend over a period, use linkedin_get_delivery_forecast.`;

export const GetAudienceCountInputSchema = z
  .object({
    targetingCriteria: TargetingCriteriaSchema,
  })
  .describe("Parameters for counting a LinkedIn audience");

export const GetAudienceCountOutputSchema = z
  .object({
    active: z.number().nullable().describe("Active audience count, null if LinkedIn returned none"),
    total: z.number().nullable().describe("Total audience count, 0 below 300 members"),
    belowPrivacyThreshold: z
      .boolean()
      .describe("True when total is 0, which LinkedIn uses for audiences under 300"),
    timestamp: z.string().datetime(),
  })
  .describe("Audience count result");

type GetAudienceCountInput = z.infer<typeof GetAudienceCountInputSchema>;
type GetAudienceCountOutput = z.infer<typeof GetAudienceCountOutputSchema>;

interface AudienceCountElement {
  active?: number;
  total?: number;
}

export async function getAudienceCountLogic(
  input: GetAudienceCountInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAudienceCountOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = (await linkedInService.getAudienceCount(input.targetingCriteria, context)) as {
    elements?: AudienceCountElement[];
  };
  const count = result.elements?.[0];
  const total = count?.total ?? null;

  return {
    active: count?.active ?? null,
    total,
    belowPrivacyThreshold: total === 0,
    timestamp: new Date().toISOString(),
  };
}

export function getAudienceCountResponseFormatter(
  result: GetAudienceCountOutput
): McpTextContent[] {
  const note = result.belowPrivacyThreshold
    ? "\nTotal is 0: LinkedIn reports 0 for audiences with fewer than 300 members (the minimum to run a campaign)."
    : "";
  return [
    {
      type: "text" as const,
      text: `Audience count\nActive: ${result.active ?? "n/a"}\nTotal: ${result.total ?? "n/a"}${note}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getAudienceCountTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAudienceCountInputSchema,
  outputSchema: GetAudienceCountOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Count members in North America with the Engineering skill",
      input: {
        targetingCriteria: {
          include: {
            and: [
              { or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:102221843"] } },
              { or: { "urn:li:adTargetingFacet:skills": ["urn:li:skill:17"] } },
            ],
          },
        },
      },
    },
  ],
  logic: getAudienceCountLogic,
  responseFormatter: getAudienceCountResponseFormatter,
  // Numbers and a flag only: nothing the platform authored as text.
  untrustedContent: NO_UNTRUSTED_CONTENT,
};
