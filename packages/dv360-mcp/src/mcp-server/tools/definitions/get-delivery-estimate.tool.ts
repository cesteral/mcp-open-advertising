// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "dv360_get_delivery_estimate";
const TOOL_TITLE = "Get DV360 Delivery Estimate";
const TOOL_DESCRIPTION = `Get delivery and targeting information for an existing DV360 line item, for campaign planning.

Fetches the line item's configuration (budget, pacing, bid strategy, flight) and all of its
assigned targeting options, giving a complete picture of its current delivery settings and
targeting scope. This is configuration context, not a volume forecast — DV360's API exposes no
advertiser-level default line item or delivery forecast to read here.`;

export const GetDeliveryEstimateInputSchema = z
  .object({
    advertiserId: z.string().describe("DV360 Advertiser ID"),
    lineItemId: z
      .string()
      .min(1)
      .describe("Existing Line Item ID to get targeting/delivery info for"),
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
  const header = "DV360 Line Item Delivery Info";

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
  ],
  logic: getDeliveryEstimateLogic,
  responseFormatter: getDeliveryEstimateResponseFormatter,
};
