// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  CesteralReadToolAnnotations,
} from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  DSPCommitmentSchema,
  type DSPCommitmentT,
} from "../../../services/amazon-dsp/v1-schemas.js";

const TOOL_NAME = "amazon_dsp_get_commitment";
const TOOL_TITLE = "Get a single Amazon DSP commitment";
const TOOL_DESCRIPTION = `Fetch one commitment by ID and return its full DSPCommitment record. Used
as the read partner for the governed \`amazon_dsp_update_commitment\` write
tool so the governance control plane can capture pre/post snapshots.

Internally wraps the batch retrieve endpoint with a 1-element array. If
the commitment is missing or rejected, the call throws an McpError with
JsonRpcErrorCode.InvalidParams carrying the Amazon ErrorCode + message.
For batch reads, use \`amazon_dsp_get_commitments\` instead.`;

export const GetCommitmentInputSchema = z
  .object({
    profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
    commitmentId: z.string().min(1).describe("Commitment to fetch"),
  })
  .describe("Parameters for fetching a single Amazon DSP commitment");

export const GetCommitmentOutputSchema = z
  .object({
    commitment: DSPCommitmentSchema.describe("Full commitment record"),
    timestamp: z.string().datetime(),
  })
  .describe("Single commitment result");

type GetCommitmentInput = z.infer<typeof GetCommitmentInputSchema>;
type GetCommitmentOutput = z.infer<typeof GetCommitmentOutputSchema>;

export async function getCommitmentLogic(
  input: GetCommitmentInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetCommitmentOutput> {
  const { amazonDspV1Service } = resolveSessionServices(sdkContext);
  const commitment = (await amazonDspV1Service.getCommitment(
    input.commitmentId,
    context
  )) as DSPCommitmentT;
  return { commitment, timestamp: new Date().toISOString() };
}

export function getCommitmentResponseFormatter(result: GetCommitmentOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Commitment retrieved\n${JSON.stringify(result.commitment, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getCommitmentTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetCommitmentInputSchema,
  outputSchema: GetCommitmentOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "read",
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "get_commitment",
      entityKinds: ["commitment"],
      entityIdArgs: ["commitmentId"],
      schemaVersion: 1,
      contractId: "amazon_dsp.get_commitment.v1",
    } satisfies CesteralReadToolAnnotations,
  },
  inputExamples: [
    {
      label: "Get a commitment by ID",
      input: { profileId: "1234567890", commitmentId: "c-001" },
    },
  ],
  logic: getCommitmentLogic,
  responseFormatter: getCommitmentResponseFormatter,
};
