// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "dv360_get_delivery_estimate";
const TOOL_TITLE = "Get DV360 Delivery Estimate";
const TOOL_DESCRIPTION = `Get delivery and targeting information for DV360 campaign planning.

**Two modes of operation:**

1. **With lineItemId:** Fetches the line item's configuration and all assigned targeting
   options, providing a complete picture of current delivery settings and targeting scope.

2. **Without lineItemId:** Calls the DV360 generateDefault endpoint to get DV360's
   recommended default line item settings for the advertiser, useful for planning.

Returns targeting assignments, budget configuration, and bid strategy details
that can be used to estimate delivery potential.`;

export const GetDeliveryEstimateInputSchema = z
  .object({
    advertiserId: z.string().describe("DV360 Advertiser ID"),
    lineItemId: z
      .string()
      .optional()
      .describe("Optional: existing Line Item ID to get targeting/delivery info for"),
  })
  .describe("Parameters for getting a DV360 delivery estimate");

export const GetDeliveryEstimateOutputSchema = z
  .object({
    estimate: z
      .record(z.any())
      .describe("Delivery estimate data including targeting and configuration"),
    timestamp: z.string().datetime(),
  })
  .describe("Delivery estimate result");

type GetDeliveryEstimateInput = z.infer<typeof GetDeliveryEstimateInputSchema>;
type GetDeliveryEstimateOutput = z.infer<typeof GetDeliveryEstimateOutputSchema>;

export async function getDeliveryEstimateLogic(
  input: GetDeliveryEstimateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetDeliveryEstimateOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  const estimate = await dv360Service.getDeliveryEstimate(
    input.advertiserId,
    input.lineItemId,
    context
  );

  return {
    estimate,
    timestamp: new Date().toISOString(),
  };
}

export function getDeliveryEstimateResponseFormatter(
  result: GetDeliveryEstimateOutput
): McpTextContent[] {
  const source = (result.estimate as Record<string, unknown>).source as string | undefined;
  const header =
    source === "lineItem"
      ? "DV360 Line Item Delivery Info"
      : "DV360 Default Line Item Configuration";

  return [
    {
      type: "text" as const,
      text: `${header}\n\n${JSON.stringify(result.estimate, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getDeliveryEstimateTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetDeliveryEstimateInputSchema,
  outputSchema: GetDeliveryEstimateOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get delivery info for an existing line item",
      input: {
        advertiserId: "1234567890",
        lineItemId: "9876543210",
      },
    },
    {
      label: "Get default line item configuration",
      input: {
        advertiserId: "1234567890",
      },
    },
  ],
  logic: getDeliveryEstimateLogic,
  responseFormatter: getDeliveryEstimateResponseFormatter,
};
