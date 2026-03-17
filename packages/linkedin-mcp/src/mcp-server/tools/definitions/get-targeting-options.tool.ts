// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_targeting_options";
const TOOL_TITLE = "Get LinkedIn Ads Targeting Options";
const TOOL_DESCRIPTION = `Browse available targeting categories and facets for a LinkedIn Ads account.

Returns targeting facet metadata available for the given ad account.
Use linkedin_search_targeting to search within a specific facet.`;

export const GetTargetingOptionsInputSchema = z
  .object({
    adAccountUrn: z
      .string()
      .min(1)
      .describe("The ad account URN (e.g., urn:li:sponsoredAccount:123)"),
    facetType: z
      .string()
      .optional()
      .describe("Filter to a specific facet type (optional, returns all if omitted)"),
  })
  .describe("Parameters for getting LinkedIn targeting options");

export const GetTargetingOptionsOutputSchema = z
  .object({
    options: z.array(z.record(z.any())).describe("Available targeting options"),
    count: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting options result");

type GetTargetingOptionsInput = z.infer<typeof GetTargetingOptionsInputSchema>;
type GetTargetingOptionsOutput = z.infer<typeof GetTargetingOptionsOutputSchema>;

export async function getTargetingOptionsLogic(
  input: GetTargetingOptionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetTargetingOptionsOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const result = (await linkedInService.getTargetingOptions(
    input.adAccountUrn,
    input.facetType,
    context
  )) as Record<string, unknown>;

  const elements = (result.elements as unknown[]) ?? [];

  return {
    options: elements as Record<string, unknown>[],
    count: elements.length,
    timestamp: new Date().toISOString(),
  };
}

export function getTargetingOptionsResponseFormatter(
  result: GetTargetingOptionsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.count} targeting options\n\n${JSON.stringify(result.options, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getTargetingOptionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetTargetingOptionsInputSchema,
  outputSchema: GetTargetingOptionsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get all targeting options for an account",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
      },
    },
    {
      label: "Get interest targeting options",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        facetType: "MEMBER_INTERESTS",
      },
    },
  ],
  logic: getTargetingOptionsLogic,
  responseFormatter: getTargetingOptionsResponseFormatter,
};