// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  DSPCommitmentMultiStatusResponseSchema,
  type DSPCommitmentMultiStatusResponseT,
} from "../../../services/amazon-dsp/v1-schemas.js";

const TOOL_NAME = "amazon_dsp_get_commitments";
const TOOL_TITLE = "Get Amazon DSP commitments (batch)";
const TOOL_DESCRIPTION = `Batch-fetch commitments by ID. Returns Amazon's multi-status response shape
unmodified: \`success[i].commitment\` carries the entity, \`error[i].errors\`
carries one or more per-item errors with their original \`fieldLocation\` /
\`code\` / \`message\`.

Up to 1000 IDs per call. For a single commitment that returns a clean
DSPCommitment (or throws on rejection), use \`amazon_dsp_get_commitment\`.`;

export const GetCommitmentsInputSchema = z
  .object({
    profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
    commitmentIds: z
      .array(z.string().min(1))
      .min(1)
      .max(1000)
      .describe("Commitment IDs to fetch, 1..1000 per call"),
  })
  .describe("Parameters for batch-fetching Amazon DSP commitments");

export const GetCommitmentsOutputSchema = z
  .object({
    response: DSPCommitmentMultiStatusResponseSchema.describe(
      "Amazon multi-status response (success[].commitment + error[].errors[])",
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Batch get commitments result");

type GetCommitmentsInput = z.infer<typeof GetCommitmentsInputSchema>;
type GetCommitmentsOutput = z.infer<typeof GetCommitmentsOutputSchema>;

export async function getCommitmentsLogic(
  input: GetCommitmentsInput,
  context: RequestContext,
  sdkContext?: SdkContext,
): Promise<GetCommitmentsOutput> {
  const { amazonDspV1Service } = resolveSessionServices(sdkContext);
  const response = await amazonDspV1Service.retrieveCommitments(
    { commitmentIds: input.commitmentIds },
    context,
  );
  return {
    response,
    timestamp: new Date().toISOString(),
  };
}

export function getCommitmentsResponseFormatter(result: GetCommitmentsOutput): McpTextContent[] {
  const response = result.response as DSPCommitmentMultiStatusResponseT;
  const successCount = response.success?.length ?? 0;
  const errorCount = response.error?.length ?? 0;
  return [
    {
      type: "text" as const,
      text: `${successCount} succeeded, ${errorCount} failed\n\n${JSON.stringify(response, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getCommitmentsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetCommitmentsInputSchema,
  outputSchema: GetCommitmentsOutputSchema,
  // No `cesteral` block: batch read endpoints are not attested in the
  // governance manifest. The singular `amazon_dsp_get_commitment` carries
  // the cesteral.kind="read" annotation as the read partner for
  // `amazon_dsp_update_commitment`; this batch tool is a plain readOnly
  // utility next to it.
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Fetch three commitments",
      input: { profileId: "1234567890", commitmentIds: ["c-001", "c-002", "c-003"] },
    },
  ],
  logic: getCommitmentsLogic,
  responseFormatter: getCommitmentsResponseFormatter,
};
