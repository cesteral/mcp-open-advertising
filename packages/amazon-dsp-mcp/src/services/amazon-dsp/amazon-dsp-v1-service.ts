// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import { McpError, JsonRpcErrorCode, type RequestContext } from "@cesteral/shared";
import type { AmazonDspHttpClient } from "./amazon-dsp-http-client.js";
import { AMAZON_DSP_V1_PATHS } from "./amazon-dsp-v1-api-contract.js";
import {
  DSPCommitmentSuccessResponseSchema,
  DSPCommitmentMultiStatusResponseSchema,
  DSPCampaignForecastMultiStatusResponseSchema,
  DSPCommitmentSpendMultiStatusResponseSchema,
  type DSPCommitmentT,
  type DSPCommitmentCreateT,
  type DSPCommitmentUpdateT,
  type DSPCommitmentSuccessResponseT,
  type DSPCommitmentMultiStatusResponseT,
  type DSPRetrieveCampaignForecastRequestT,
  type DSPCampaignForecastMultiStatusResponseT,
  type DSPRetrieveCommitmentSpendRequestT,
  type DSPCommitmentSpendMultiStatusResponseT,
  type ErrorsIndexT,
} from "./v1-schemas.js";

export interface ListCommitmentsParams {
  nextToken?: string;
  maxResults?: number;
}

/**
 * Service for Amazon Ads API v1 DSP commitment + forecast + spend endpoints.
 *
 * Singular write helpers (`createCommitment`, `updateCommitment`, `getCommitment`)
 * wrap the batch endpoints with a 1-element array on send and unwrap
 * `success[0].commitment` on response. Per-item rejections in the multi-status
 * `error[].errors[]` shape are surfaced as `McpError`.
 */
export class AmazonDspV1Service {
  constructor(
    private readonly client: AmazonDspHttpClient,
    private readonly logger: Logger,
  ) {}

  async listCommitments(
    params: ListCommitmentsParams,
    context?: RequestContext,
  ): Promise<DSPCommitmentSuccessResponseT> {
    const query: Record<string, string> = {};
    if (params.nextToken !== undefined) query.nextToken = params.nextToken;
    if (params.maxResults !== undefined) query.maxResults = String(params.maxResults);
    this.logger.debug({ params }, "AmazonDspV1Service.listCommitments");
    const raw = await this.client.get(AMAZON_DSP_V1_PATHS.listCommitments, query, context);
    return DSPCommitmentSuccessResponseSchema.parse(raw);
  }

  async retrieveCommitments(
    body: { commitmentIds: string[] },
    context?: RequestContext,
  ): Promise<DSPCommitmentMultiStatusResponseT> {
    const raw = await this.client.post(AMAZON_DSP_V1_PATHS.retrieveCommitments, body, context);
    return DSPCommitmentMultiStatusResponseSchema.parse(raw);
  }

  /**
   * Singular read partner for the governed `update_commitment` write tool.
   * Wraps `retrieveCommitments` with a 1-element id array, then unwraps
   * `success[0].commitment`. Throws `McpError` if Amazon returns the id in
   * `error[]` or if the response has an unexpected multi-status shape.
   */
  async getCommitment(commitmentId: string, context?: RequestContext): Promise<DSPCommitmentT> {
    const parsed = await this.retrieveCommitments({ commitmentIds: [commitmentId] }, context);
    if (
      parsed.success?.length === 1 &&
      (!parsed.error || parsed.error.length === 0) &&
      parsed.success[0].commitment
    ) {
      return parsed.success[0].commitment;
    }
    if (parsed.error?.length === 1) {
      const errEntry = parsed.error[0] as ErrorsIndexT;
      const firstErr = errEntry.errors[0];
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Amazon DSP could not retrieve commitment ${commitmentId}: ${firstErr?.message ?? "not found"}`,
        { code: firstErr?.code, raw: errEntry },
      );
    }
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Amazon DSP returned unexpected multi-status shape for single getCommitment: success=${parsed.success?.length ?? 0}, error=${parsed.error?.length ?? 0}`,
      { raw: parsed },
    );
  }

  async createCommitment(
    commitment: DSPCommitmentCreateT,
    context?: RequestContext,
  ): Promise<DSPCommitmentT> {
    const raw = await this.client.post(
      AMAZON_DSP_V1_PATHS.createCommitments,
      { commitments: [commitment] },
      context,
    );
    return this.unwrapSingleCommitmentResult(raw, "create");
  }

  async updateCommitment(
    commitment: DSPCommitmentUpdateT,
    context?: RequestContext,
  ): Promise<DSPCommitmentT> {
    const raw = await this.client.post(
      AMAZON_DSP_V1_PATHS.updateCommitments,
      { commitments: [commitment] },
      context,
    );
    return this.unwrapSingleCommitmentResult(raw, "update");
  }

  async retrieveCampaignForecast(
    body: DSPRetrieveCampaignForecastRequestT,
    context?: RequestContext,
  ): Promise<DSPCampaignForecastMultiStatusResponseT> {
    const raw = await this.client.post(
      AMAZON_DSP_V1_PATHS.retrieveCampaignForecast,
      body as unknown as Record<string, unknown>,
      context,
    );
    return DSPCampaignForecastMultiStatusResponseSchema.parse(raw);
  }

  async retrieveCommitmentSpend(
    body: DSPRetrieveCommitmentSpendRequestT,
    context?: RequestContext,
  ): Promise<DSPCommitmentSpendMultiStatusResponseT> {
    const raw = await this.client.post(
      AMAZON_DSP_V1_PATHS.retrieveCommitmentSpend,
      body as unknown as Record<string, unknown>,
      context,
    );
    return DSPCommitmentSpendMultiStatusResponseSchema.parse(raw);
  }

  private unwrapSingleCommitmentResult(raw: unknown, op: "create" | "update"): DSPCommitmentT {
    const parsed = DSPCommitmentMultiStatusResponseSchema.parse(raw);
    if (
      parsed.success?.length === 1 &&
      (!parsed.error || parsed.error.length === 0) &&
      parsed.success[0].commitment
    ) {
      return parsed.success[0].commitment;
    }
    if (parsed.error?.length === 1) {
      const errEntry = parsed.error[0] as ErrorsIndexT;
      const firstErr = errEntry.errors[0];
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Amazon DSP rejected the ${op} commitment request: ${firstErr?.message ?? "unknown"}`,
        { code: firstErr?.code, fieldLocation: firstErr?.fieldLocation, raw: errEntry },
      );
    }
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Amazon DSP returned unexpected multi-status shape for single-item ${op}: success=${parsed.success?.length ?? 0}, error=${parsed.error?.length ?? 0}`,
      { raw },
    );
  }
}
