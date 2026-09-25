// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { PINTEREST_TARGETING_TYPES } from "../../../services/pinterest/pinterest-service.js";

const TOOL_NAME = "pinterest_get_targeting_options";
const TOOL_TITLE = "Get Pinterest Targeting Options";
const TOOL_DESCRIPTION = `Browse available Pinterest ad targeting options.

Without \`targetingType\`, returns the targeting types Pinterest v5 accepts. With one, returns every option of that type from \`GET /v5/resources/targeting/{targeting_type}\`.
Use this to discover valid targeting values before creating or updating ad groups.

**Targeting types:** ${PINTEREST_TARGETING_TYPES.join(", ")}`;

export const GetTargetingOptionsInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    targetingType: z
      .enum(PINTEREST_TARGETING_TYPES)
      .optional()
      .describe(
        "Targeting type whose options to return (e.g., LOCATION, INTEREST). Omit to list the targeting types."
      ),
  })
  .describe("Parameters for browsing Pinterest targeting options");

export const GetTargetingOptionsOutputSchema = z
  .object({
    options: z.record(z.any()).describe("Available targeting options"),
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
  const { pinterestService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

  const options = (await pinterestService.getTargetingOptions(
    input.targetingType,
    { adAccountId: input.adAccountId },
    context
  )) as Record<string, unknown>;

  return {
    options,
    timestamp: new Date().toISOString(),
  };
}

export function getTargetingOptionsResponseFormatter(
  result: GetTargetingOptionsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Pinterest targeting options:\n${JSON.stringify(result.options, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "List the targeting types",
      input: {
        adAccountId: "1234567890",
      },
    },
    {
      label: "Get age bucket options",
      input: {
        adAccountId: "1234567890",
        targetingType: "AGE_BUCKET",
      },
    },
  ],
  logic: getTargetingOptionsLogic,
  responseFormatter: getTargetingOptionsResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.options"],
    contentBlocks: [0],
  },
};
