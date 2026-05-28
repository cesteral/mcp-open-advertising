// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  DSPCommitmentSpendMultiStatusResponseSchema,
  type DSPCommitmentSpendMultiStatusResponseT,
} from "../../../services/amazon-dsp/v1-schemas.js";

const TOOL_NAME = "amazon_dsp_get_commitment_spend";
const TOOL_TITLE = "Get Amazon DSP commitment spend";
const TOOL_DESCRIPTION = `Return spend accrual + projection for one commitment, optionally broken down
by advertiser / campaign / deal via \`spendDimension\`. The Amazon endpoint
caps both request and response at 1 entry per call.

Returns: \`accruedSpendValue\`, \`accruedToDateTime\`, \`projectedSpendValue\`,
\`spendAtRiskValue\`, \`currencyCode\`, and the \`spendDimensionType\`
(ADVERTISER / CAMPAIGN / COMMITMENT / DEAL).`;

// Mirrors DSPSpendDimension union from the spec: exactly one of advertiserAccountId,
// campaignId, or dealId may be set. Encoded as an optional field on the identifier;
// the API rejects multiple keys.
const SpendDimensionSchema = z
  .union([
    z.object({ advertiserAccountId: z.string().min(1) }),
    z.object({ campaignId: z.string().min(1) }),
    z.object({ dealId: z.string().min(1) }),
  ])
  .describe("Optional breakdown dimension (pick exactly one of advertiserAccountId / campaignId / dealId)");

const CommitmentSpendIdentifierSchema = z
  .object({
    commitmentId: z.string().min(1).describe("Commitment to fetch spend for"),
    spendDimension: SpendDimensionSchema.optional(),
  })
  .describe("Identifier + optional breakdown dimension");

export const GetCommitmentSpendInputSchema = z
  .object({
    profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
    commitmentIds: z
      .array(CommitmentSpendIdentifierSchema)
      .length(1)
      .describe("Identifier list. Amazon's endpoint accepts exactly 1 entry per call."),
  })
  .describe("Parameters for retrieving Amazon DSP commitment spend");

export const GetCommitmentSpendOutputSchema = z
  .object({
    response: DSPCommitmentSpendMultiStatusResponseSchema.describe(
      "Multi-status response (success[].commitmentSpend + error[].errors[])",
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Commitment spend result");

type GetCommitmentSpendInput = z.infer<typeof GetCommitmentSpendInputSchema>;
type GetCommitmentSpendOutput = z.infer<typeof GetCommitmentSpendOutputSchema>;

export async function getCommitmentSpendLogic(
  input: GetCommitmentSpendInput,
  context: RequestContext,
  sdkContext?: SdkContext,
): Promise<GetCommitmentSpendOutput> {
  const { amazonDspV1Service } = resolveSessionServices(sdkContext);
  const response = await amazonDspV1Service.retrieveCommitmentSpend(
    { commitmentIds: input.commitmentIds },
    context,
  );
  return { response, timestamp: new Date().toISOString() };
}

export function getCommitmentSpendResponseFormatter(
  result: GetCommitmentSpendOutput,
): McpTextContent[] {
  const response = result.response as DSPCommitmentSpendMultiStatusResponseT;
  const successCount = response.success?.length ?? 0;
  const errorCount = response.error?.length ?? 0;
  return [
    {
      type: "text" as const,
      text: `${successCount} succeeded, ${errorCount} failed\n\n${JSON.stringify(response, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getCommitmentSpendTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetCommitmentSpendInputSchema,
  outputSchema: GetCommitmentSpendOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Spend for one commitment (no breakdown)",
      input: {
        profileId: "1234567890",
        commitmentIds: [{ commitmentId: "c-001" }],
      },
    },
    {
      label: "Spend broken down by campaign",
      input: {
        profileId: "1234567890",
        commitmentIds: [
          { commitmentId: "c-001", spendDimension: { campaignId: "cmp-abc" } },
        ],
      },
    },
  ],
  logic: getCommitmentSpendLogic,
  responseFormatter: getCommitmentSpendResponseFormatter,
};
