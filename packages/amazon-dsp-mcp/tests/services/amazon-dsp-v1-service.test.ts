// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import type { Logger } from "pino";
import { AmazonDspV1Service } from "../../src/services/amazon-dsp/amazon-dsp-v1-service.js";
import { AMAZON_DSP_V1_PATHS } from "../../src/services/amazon-dsp/amazon-dsp-v1-api-contract.js";
import type { AmazonDspHttpClient } from "../../src/services/amazon-dsp/amazon-dsp-http-client.js";
import type { DSPCommitmentT } from "../../src/services/amazon-dsp/v1-schemas.js";

const logger: Logger = pino({ level: "silent" });

const sampleCommitment: DSPCommitmentT = {
  commitmentId: "c1",
  commitmentName: "Q3 Upfront",
  committedSpend: 100,
  currencyCode: "USD",
  endDateTime: "2027-01-01T00:00:00+00:00",
  fulfillmentLevel: "LEVEL_5",
  spendCalculationMode: "CAMPAIGN",
  startDateTime: "2026-01-01T00:00:00+00:00",
};

function makeClient(responseBody: unknown): {
  client: AmazonDspHttpClient;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn().mockResolvedValue(responseBody);
  const post = vi.fn().mockResolvedValue(responseBody);
  const put = vi.fn();
  const client = { get, post, put } as unknown as AmazonDspHttpClient;
  return { client, get, post };
}

describe("AmazonDspV1Service", () => {
  it("listCommitments hits GET /adsApi/v1/commitments/dsp with application/json (no vendor media type)", async () => {
    const { client, get } = makeClient({ commitments: [sampleCommitment] });
    const svc = new AmazonDspV1Service(client, logger);
    const result = await svc.listCommitments({ maxResults: 25 });
    expect(get).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.listCommitments,
      expect.objectContaining({ maxResults: "25" }),
      undefined,
    );
    // Confirm no vendor Accept header was passed (4th arg should be undefined).
    expect(get.mock.calls[0][3]).toBeUndefined();
    expect(result.commitments).toEqual([sampleCommitment]);
  });

  it("retrieveCommitments hits POST /adsApi/v1/retrieve/commitments/dsp and parses multi-status verbatim", async () => {
    const body = {
      success: [{ commitment: sampleCommitment, index: 0 }],
      error: [],
    };
    const { client, post } = makeClient(body);
    const svc = new AmazonDspV1Service(client, logger);
    const result = await svc.retrieveCommitments({ commitmentIds: ["c1"] });
    expect(post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCommitments,
      { commitmentIds: ["c1"] },
      undefined,
    );
    expect(result).toEqual(body);
  });

  it("getCommitment wraps the id into a 1-element batch and unwraps success[0].commitment", async () => {
    const body = {
      success: [{ commitment: sampleCommitment, index: 0 }],
      error: [],
    };
    const { client, post } = makeClient(body);
    const svc = new AmazonDspV1Service(client, logger);
    const result = await svc.getCommitment("c1");
    expect(post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCommitments,
      { commitmentIds: ["c1"] },
      undefined,
    );
    expect(result).toEqual(sampleCommitment);
  });

  it("getCommitment throws McpError when Amazon returns the id in error[].errors[]", async () => {
    const body = {
      success: [],
      error: [
        {
          errors: [{ code: "NOT_FOUND", message: "Commitment missing not found" }],
          index: 0,
        },
      ],
    };
    const { client } = makeClient(body);
    const svc = new AmazonDspV1Service(client, logger);
    await expect(svc.getCommitment("missing")).rejects.toMatchObject({
      message: expect.stringContaining("not found"),
    });
  });

  it("createCommitment wraps input into a 1-element batch and unwraps success[0].commitment", async () => {
    const created: DSPCommitmentT = { ...sampleCommitment, commitmentId: "c-new" };
    const body = { success: [{ commitment: created, index: 0 }], error: [] };
    const { client, post } = makeClient(body);
    const svc = new AmazonDspV1Service(client, logger);
    const input = {
      commitmentName: "Q3 Upfront",
      committedSpend: 100,
      currencyCode: "USD",
      endDateTime: "2027-01-01T00:00:00+00:00",
      fulfillmentLevel: "LEVEL_5",
      spendCalculationMode: "CAMPAIGN",
      startDateTime: "2026-01-01T00:00:00+00:00",
    } as const;
    const result = await svc.createCommitment(input);
    expect(post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.createCommitments,
      { commitments: [input] },
      undefined,
    );
    expect(result).toEqual(created);
  });

  it("createCommitment throws McpError when Amazon returns the item in error[].errors[]", async () => {
    const body = {
      success: [],
      error: [
        {
          errors: [
            {
              code: "FIELD_VALUE_IS_INVALID",
              message: "Overlapping dates",
              fieldLocation: "startDateTime",
            },
          ],
          index: 0,
        },
      ],
    };
    const { client } = makeClient(body);
    const svc = new AmazonDspV1Service(client, logger);
    const input = {
      commitmentName: "X",
      committedSpend: 100,
      currencyCode: "USD",
      endDateTime: "2027-01-01T00:00:00+00:00",
      fulfillmentLevel: "LEVEL_5",
      spendCalculationMode: "CAMPAIGN",
      startDateTime: "2026-01-01T00:00:00+00:00",
    } as const;
    await expect(svc.createCommitment(input)).rejects.toMatchObject({
      message: expect.stringContaining("Overlapping dates"),
    });
  });

  it("updateCommitment wraps input + unwraps success[0].commitment", async () => {
    const updated: DSPCommitmentT = { ...sampleCommitment, committedSpend: 200 };
    const body = { success: [{ commitment: updated, index: 0 }], error: [] };
    const { client, post } = makeClient(body);
    const svc = new AmazonDspV1Service(client, logger);
    const input = { commitmentId: "c1", committedSpend: 200 } as const;
    const result = await svc.updateCommitment(input);
    expect(post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.updateCommitments,
      { commitments: [input] },
      undefined,
    );
    expect(result).toEqual(updated);
  });

  it("retrieveCampaignForecast posts to /adsApi/v1/retrieve/campaignForecasts/dsp", async () => {
    const body = { success: [], error: [] };
    const { client, post } = makeClient(body);
    const svc = new AmazonDspV1Service(client, logger);
    await svc.retrieveCampaignForecast({ campaignForecastDescriptions: [] });
    expect(post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCampaignForecast,
      expect.objectContaining({ campaignForecastDescriptions: [] }),
      undefined,
    );
  });

  it("retrieveCommitmentSpend posts to /adsApi/v1/retrieve/commitmentSpends/dsp", async () => {
    const body = { success: [], error: [] };
    const { client, post } = makeClient(body);
    const svc = new AmazonDspV1Service(client, logger);
    await svc.retrieveCommitmentSpend({ commitmentIds: [] });
    expect(post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCommitmentSpend,
      expect.objectContaining({ commitmentIds: [] }),
      undefined,
    );
  });
});
