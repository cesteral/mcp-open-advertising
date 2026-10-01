// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * #229: the three Marketing API v26.0 changes third-party sources report apply
 * to every API version from 2026-10-27 (platform-facts
 * `meta.v26_changes_apply_to_all_versions`) get a TEXT-ONLY warning, never a
 * refusal and never a structured entry:
 *
 * 1. `targeting.instagram_positions` containing "explore";
 * 2. `targeting.messenger_positions` containing "story";
 * 3. an ad set in a Housing / Employment / Financial special ad category
 *    without an explicit `targeting.targeting_automation.advantage_audience`.
 *
 * Each dry run's structured `dryRun` is asserted EQUAL to the same call with
 * harmless targeting, so `validationErrors` and `wouldSucceed` never change;
 * the warnings appear only in the response text, on dry runs and executes,
 * and the request is still sent unchanged. Runs over REAL session services
 * with only `fetch` stubbed (tests/helpers/wire.ts), so the one read check 3
 * adds on an update / duplicate dry run shows on the wire and in the
 * session's rate-limiter bucket. The last block drives the real MCP server
 * (`createMcpServer`) over an in-memory transport, proving the factory hands
 * the logic's result to the formatter so the text survives end to end.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import pino from "pino";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { mcpConfig } from "../../src/config/index.js";
import { META_READ_TOKENS } from "../../src/services/meta/meta-service.js";
import { createMcpServer } from "../../src/mcp-server/server.js";
import {
  createEntityLogic,
  createEntityResponseFormatter,
  CreateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/create-entity.tool.js";
import {
  updateEntityLogic,
  updateEntityResponseFormatter,
  UpdateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/update-entity.tool.js";
import {
  duplicateEntityLogic,
  duplicateEntityResponseFormatter,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
import {
  bulkCreateEntitiesLogic,
  bulkCreateEntitiesResponseFormatter,
  BulkCreateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import {
  bulkUpdateEntitiesLogic,
  bulkUpdateEntitiesResponseFormatter,
  BulkUpdateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import {
  META_V26_FACT_ID,
  META_V26_WARNING_CODES as CODES,
  formatMetaV26Warnings,
  metaV26TargetingWarnings,
} from "../../src/mcp-server/tools/utils/v26-targeting-warnings.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  rateLimiter,
  GRAPH_HOST,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const ACT = "act_1234567890";
const ADSET_ID = "120210000000001";
const CAMPAIGN_ID = "120200000000001";
const LIMIT = mcpConfig.metaRateLimitPerMinute;
const USER_KEY = "meta:user:10150000000000001";
const ctx = { requestId: "v26-req" } as any;

/** Trips checks 1 and 2, and leaves advantage_audience unset (check 3). */
const RISKY_TARGETING = {
  geo_locations: { countries: ["US"] },
  publisher_platforms: ["instagram", "messenger"],
  instagram_positions: ["stream", "explore"],
  messenger_positions: ["story"],
};

/** Trips nothing: the same audience, no reported placements, explicit flag. */
const CLEAN_TARGETING = {
  geo_locations: { countries: ["US"] },
  publisher_platforms: ["instagram", "messenger"],
  instagram_positions: ["stream"],
  messenger_positions: ["messenger_home"],
  targeting_automation: { advantage_audience: 0 },
};

const BLOCK_HEADER = "Warnings (non-blocking, unconfirmed by Meta):";

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;

beforeEach(async () => {
  stub = installFetchStub();
  session = await createWireSession();
  sdk = acceptingSdkContext(session.sessionId);
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

function apiRequests(): WireRequest[] {
  return stub.to(GRAPH_HOST).filter((r) => !r.path.endsWith("/me"));
}
const writes = () => apiRequests().filter((r) => r.method !== "GET");
const campaignReads = () =>
  apiRequests().filter((r) => r.method === "GET" && r.query.fields === "special_ad_categories");

/** Route node reads: the ad set (with `targeting`) and its campaign (with categories). */
function routeAdSetAndCampaign(targeting: unknown, categories: string[] | "error") {
  stub.route({
    method: "GET",
    path: /^\/v[\d.]+\/\d+$/,
    response: (req: WireRequest) => {
      const id = req.path.split("/").pop();
      if (id === CAMPAIGN_ID) return { id, special_ad_categories: categories };
      return { id, name: "Source", status: "PAUSED", campaign_id: CAMPAIGN_ID, targeting };
    },
  });
  if (categories === "error") {
    stub.route({
      method: "GET",
      path: new RegExp(`/${CAMPAIGN_ID}$`),
      status: 400,
      response: { error: { message: "nope", type: "OAuthException", code: 100 } },
    });
  }
}

/** The `[CODE]` tags in a response text's warnings block, in order. */
function warningCodes(text: string): string[] {
  return [...text.matchAll(/\[(META_V26_[A-Z_]+)\]/g)].map((m) => m[1]!);
}

function expectBlock(text: string) {
  expect(text).toContain(BLOCK_HEADER);
  expect(text).toContain("third-party sources");
  expect(text).toContain("2026-10-27");
  expect(text).toContain(META_V26_FACT_ID);
  expect(text).toContain("#229");
  expect(text).toContain("sent unchanged");
}

describe("the checks (pure)", () => {
  const opts = { targetingPath: "data.targeting", location: "in data.targeting" };
  const codes = (w: { code: string }[]) => w.map((x) => x.code);

  it('check 1: "explore", not "explore_home"', () => {
    expect(codes(metaV26TargetingWarnings({ instagram_positions: ["explore"] }, opts))).toEqual([
      CODES.instagramExplore,
    ]);
    expect(metaV26TargetingWarnings({ instagram_positions: ["explore_home"] }, opts)).toEqual([]);
  });

  it('check 2: "story", not "messenger_home"', () => {
    expect(codes(metaV26TargetingWarnings({ messenger_positions: ["story"] }, opts))).toEqual([
      CODES.messengerStory,
    ]);
    expect(metaV26TargetingWarnings({ messenger_positions: ["messenger_home"] }, opts)).toEqual([]);
  });

  it("check 3: each HEC-F category without an explicit flag; silent otherwise", () => {
    for (const c of ["HOUSING", "EMPLOYMENT", "FINANCIAL_PRODUCTS_SERVICES", "CREDIT"]) {
      const w = metaV26TargetingWarnings({}, { ...opts, specialAdCategories: [c] });
      expect(codes(w)).toEqual([CODES.advantageAudience]);
      expect(w[0]!.message).toContain(c);
    }
    const hecf = { ...opts, specialAdCategories: ["HOUSING"] };
    for (const v of [0, 1]) {
      expect(
        metaV26TargetingWarnings({ targeting_automation: { advantage_audience: v } }, hecf)
      ).toEqual([]);
    }
    expect(metaV26TargetingWarnings({}, { ...opts, specialAdCategories: ["NONE"] })).toEqual([]);
    expect(metaV26TargetingWarnings({}, opts)).toEqual([]);
    const unknown = metaV26TargetingWarnings(
      {},
      { ...opts, specialAdCategories: { unknown: "x" } }
    );
    expect(codes(unknown)).toEqual([CODES.advantageAudienceUnchecked]);
    expect(unknown[0]!.message).toContain("were not checked (x)");
  });

  it("reads a JSON-string targeting, as Graph accepts", () => {
    expect(codes(metaV26TargetingWarnings(JSON.stringify(RISKY_TARGETING), opts))).toEqual([
      CODES.instagramExplore,
      CODES.messengerStory,
    ]);
  });

  it("the text block names the fact, the date and that Meta has not confirmed it", () => {
    expect(formatMetaV26Warnings([])).toBe("");
    const text = formatMetaV26Warnings(
      metaV26TargetingWarnings(RISKY_TARGETING, { ...opts, specialAdCategories: ["EMPLOYMENT"] })
    );
    expectBlock(text);
    expect(warningCodes(text)).toEqual([
      CODES.instagramExplore,
      CODES.messengerStory,
      CODES.advantageAudience,
    ]);
  });
});

describe("dry runs: identical structured result, warnings in text only", () => {
  it("meta_create_entity (adSet): checks 1-2, check 3 not checked; no Graph call", async () => {
    const run = (targeting: unknown) => {
      const input = CreateEntityInputSchema.parse({
        entityType: "adSet",
        adAccountId: ACT,
        data: { name: "A", campaign_id: CAMPAIGN_ID, targeting },
        dry_run: true,
      });
      return createEntityLogic(input, ctx, sdk);
    };
    const risky = await run(RISKY_TARGETING);
    const clean = await run(CLEAN_TARGETING);
    expect(risky.dryRun).toEqual(clean.dryRun);
    expect(risky.dryRun?.wouldSucceed).toBe(true);
    expect(risky.dryRun?.validationErrors).toEqual([]);
    expect(apiRequests()).toEqual([]);

    const text = createEntityResponseFormatter(risky)[0]!.text;
    expectBlock(text);
    expect(warningCodes(text)).toEqual([
      CODES.instagramExplore,
      CODES.messengerStory,
      CODES.advantageAudienceUnchecked,
    ]);
    expect(text).toContain(`a create makes no read, so campaign ${CAMPAIGN_ID} was not read`);
    expect(createEntityResponseFormatter(clean)[0]!.text).not.toContain(BLOCK_HEADER);
  });

  it("meta_update_entity (adSet): one campaign read through the limiter; check 3 applies", async () => {
    routeAdSetAndCampaign({}, ["HOUSING"]);
    const run = (targeting: unknown) =>
      updateEntityLogic(
        UpdateEntityInputSchema.parse({
          entityType: "adSet",
          entityId: ADSET_ID,
          data: { targeting },
          dry_run: true,
        }),
        ctx,
        sdk
      );
    const risky = await run(RISKY_TARGETING);
    expect(writes()).toEqual([]);
    expect(campaignReads()).toHaveLength(1);
    expect(campaignReads()[0]!.path.endsWith(`/${CAMPAIGN_ID}`)).toBe(true);
    // The ad set read plus the campaign read, both on the session's user bucket.
    expect(rateLimiter.getRemainingTokens(USER_KEY)).toBe(LIMIT - 2 * META_READ_TOKENS);

    const clean = await run(CLEAN_TARGETING);
    expect(campaignReads()).toHaveLength(1); // explicit flag: no second campaign read
    expect(risky.dryRun).toEqual(clean.dryRun);
    expect(risky.success).toBe(clean.success);

    const text = updateEntityResponseFormatter(risky)[0]!.text;
    expectBlock(text);
    expect(warningCodes(text)).toEqual([
      CODES.instagramExplore,
      CODES.messengerStory,
      CODES.advantageAudience,
    ]);
    expect(text).toContain("special_ad_categories includes HOUSING");
    expect(updateEntityResponseFormatter(clean)[0]!.text).not.toContain(BLOCK_HEADER);
  });

  it("meta_update_entity: NONE category is silent; a failed read says not checked", async () => {
    routeAdSetAndCampaign({}, ["NONE"]);
    const input = UpdateEntityInputSchema.parse({
      entityType: "adSet",
      entityId: ADSET_ID,
      data: { targeting: { geo_locations: { countries: ["US"] } } },
      dry_run: true,
    });
    const none = await updateEntityLogic(input, ctx, sdk);
    expect(updateEntityResponseFormatter(none)[0]!.text).not.toContain(BLOCK_HEADER);

    routeAdSetAndCampaign({}, "error");
    const failed = await updateEntityLogic(input, ctx, sdk);
    expect(failed.dryRun).toEqual(none.dryRun);
    const text = updateEntityResponseFormatter(failed)[0]!.text;
    expect(warningCodes(text)).toEqual([CODES.advantageAudienceUnchecked]);
    expect(text).toContain("reading the parent campaign failed");
  });

  it("meta_duplicate_entity (adSet): checks the source's targeting and its campaign", async () => {
    const run = async (targeting: unknown) => {
      routeAdSetAndCampaign(targeting, ["EMPLOYMENT"]);
      return duplicateEntityLogic(
        DuplicateEntityInputSchema.parse({
          entityType: "adSet",
          entityId: ADSET_ID,
          dry_run: true,
        }),
        ctx,
        sdk
      );
    };
    const risky = await run(RISKY_TARGETING);
    expect(campaignReads()).toHaveLength(1);
    const clean = await run(CLEAN_TARGETING);
    expect(risky.dryRun).toEqual(clean.dryRun);
    expect(writes()).toEqual([]);

    const text = duplicateEntityResponseFormatter(risky)[0]!.text;
    expectBlock(text);
    expect(warningCodes(text)).toEqual([
      CODES.instagramExplore,
      CODES.messengerStory,
      CODES.advantageAudience,
    ]);
    expect(text).toContain("copied from the source ad set");
    expect(duplicateEntityResponseFormatter(clean)[0]!.text).not.toContain(BLOCK_HEADER);
  });

  it("meta_bulk_create_entities: per-item text; dryRun unchanged; no Graph call", async () => {
    const run = (targeting: unknown) =>
      bulkCreateEntitiesLogic(
        BulkCreateEntitiesInputSchema.parse({
          entityType: "adSet",
          adAccountId: ACT,
          items: [
            { name: "ok", targeting: CLEAN_TARGETING },
            { name: "x", targeting },
          ],
          dry_run: true,
        }),
        ctx,
        sdk
      );
    const risky = await run(RISKY_TARGETING);
    const clean = await run(CLEAN_TARGETING);
    expect(risky.dryRun).toEqual(clean.dryRun);
    expect(apiRequests()).toEqual([]);
    const text = bulkCreateEntitiesResponseFormatter(risky)[0]!.text;
    expectBlock(text);
    expect(text).toContain("items.1.targeting.instagram_positions");
    expect(warningCodes(text)).toEqual([
      CODES.instagramExplore,
      CODES.messengerStory,
      CODES.advantageAudienceUnchecked,
    ]);
  });

  it("meta_bulk_update_entities: per-item text; dryRun unchanged; no Graph call", async () => {
    const run = (targeting: unknown) =>
      bulkUpdateEntitiesLogic(
        BulkUpdateEntitiesInputSchema.parse({
          entityType: "adSet",
          items: [
            { entityId: "1", data: { name: "rename only" } },
            { entityId: "2", data: { targeting } },
          ],
          dry_run: true,
        }),
        ctx,
        sdk
      );
    const risky = await run({ messenger_positions: ["story"] });
    const clean = await run(CLEAN_TARGETING);
    expect(risky.dryRun).toEqual(clean.dryRun);
    expect(apiRequests()).toEqual([]);
    const text = bulkUpdateEntitiesResponseFormatter(risky)[0]!.text;
    expect(text).toContain("items.1.data.targeting.messenger_positions");
    expect(warningCodes(text)).toEqual([CODES.messengerStory, CODES.advantageAudienceUnchecked]);
  });
});

describe("execute: the targeting is sent unchanged and the text warns", () => {
  it("meta_create_entity: POSTs explore + story as given; no campaign read", async () => {
    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "adSet",
        adAccountId: ACT,
        data: { name: "A", campaign_id: CAMPAIGN_ID, targeting: RISKY_TARGETING },
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.path.endsWith(`/${ACT}/adsets`)).toBe(true);
    expect(JSON.parse(writes()[0]!.form!.targeting!)).toEqual(RISKY_TARGETING);
    expect(campaignReads()).toEqual([]);
    const text = createEntityResponseFormatter(out)[0]!.text;
    expect(text).toContain("created successfully");
    expectBlock(text);
    expect(warningCodes(text)).toEqual([
      CODES.instagramExplore,
      CODES.messengerStory,
      CODES.advantageAudienceUnchecked,
    ]);
  });

  it("meta_update_entity: POSTs the targeting as given; reads only the ad set", async () => {
    routeAdSetAndCampaign({}, ["HOUSING"]);
    stub.route({ method: "POST", path: new RegExp(`/${ADSET_ID}$`), response: { success: true } });
    const out = await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adSet",
        entityId: ADSET_ID,
        data: { targeting: RISKY_TARGETING },
      }),
      ctx,
      sdk
    );
    expect(out.success).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0]!.form!.targeting!)).toEqual(RISKY_TARGETING);
    expect(campaignReads()).toEqual([]);
    expect(
      apiRequests()
        .filter((r) => r.method === "GET")
        .every((r) => r.path.endsWith(`/${ADSET_ID}`))
    ).toBe(true);
    const text = updateEntityResponseFormatter(out)[0]!.text;
    expect(text).toContain("updated successfully");
    expectBlock(text);
    expect(warningCodes(text)).toEqual([
      CODES.instagramExplore,
      CODES.messengerStory,
      CODES.advantageAudienceUnchecked,
    ]);
  });

  it("meta_bulk_create_entities: the risky item is POSTed", async () => {
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "adSet",
        adAccountId: ACT,
        items: [{ name: "risky", targeting: RISKY_TARGETING }],
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0]!.form!.targeting!)).toEqual(RISKY_TARGETING);
    expect(warningCodes(bulkCreateEntitiesResponseFormatter(out)[0]!.text)).toContain(
      CODES.instagramExplore
    );
  });

  it("meta_bulk_update_entities: the risky item is POSTed", async () => {
    stub.route({ method: "POST", path: /\/\d+$/, response: { success: true } });
    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "adSet",
        items: [{ entityId: ADSET_ID, data: { targeting: RISKY_TARGETING } }],
      }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0]!.form!.targeting!)).toEqual(RISKY_TARGETING);
    expect(warningCodes(bulkUpdateEntitiesResponseFormatter(out)[0]!.text)).toContain(
      CODES.messengerStory
    );
  });
});

describe("over MCP: the text reaches the client; structuredContent does not change", () => {
  async function connect() {
    const server = await createMcpServer(pino({ level: "silent" }), session.sessionId);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "v26-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return client;
  }

  it("meta_duplicate_entity dry run (warnings from the reads, not the input)", async () => {
    routeAdSetAndCampaign(RISKY_TARGETING, ["CREDIT"]);
    const client = await connect();
    const res = await client.callTool({
      name: "meta_duplicate_entity",
      arguments: { entityType: "adSet", entityId: ADSET_ID, dry_run: true },
    });
    expect(res.isError).toBeFalsy();
    const text = (res.content as { type: string; text: string }[])[0]!.text;
    expectBlock(text);
    expect(warningCodes(text)).toEqual([
      CODES.instagramExplore,
      CODES.messengerStory,
      CODES.advantageAudience,
    ]);
    const structured = res.structuredContent as { dryRun: Record<string, unknown> };
    expect(structured.dryRun.validationErrors).toEqual([]);
    expect(structured.dryRun.wouldSucceed).toBe(true);
    expect(JSON.stringify(res.structuredContent)).not.toContain("META_V26");
    await client.close();
  });
});
