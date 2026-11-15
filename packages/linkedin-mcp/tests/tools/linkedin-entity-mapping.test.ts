// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Entity path model after the staged /v2/ -> /rest/ migration (#210).
//
// The migration is still staged: creative list/create need a schema rewrite and
// stay on /v2/adCreatives. Item paths (get/update/delete) are all on /rest/ and
// take the owning ad account (#210). A half-done migration is exactly the kind
// of state that rots quietly, so the invariants that keep it coherent are
// pinned here rather than left to reviewer memory.

import { describe, expect, it } from "vitest";
import {
  ACCOUNT_SCOPED_ENTITY_TYPES,
  adAccountIdFromUrn,
  getEntityConfig,
  getSupportedEntityTypes,
  entityItemRequest,
  isAccountScopedEntity,
  itemRequiresAdAccount,
  type LinkedInEntityType,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";

describe("adAccountIdFromUrn", () => {
  it("extracts the numeric id LinkedIn's /rest/ paths expect", () => {
    // A URN interpolated whole yields /rest/adAccounts/urn:li:sponsoredAccount:123/...,
    // which 404s in a way that reads like a missing account rather than our bug.
    expect(adAccountIdFromUrn("urn:li:sponsoredAccount:123456789")).toBe("123456789");
    expect(adAccountIdFromUrn("  urn:li:sponsoredAccount:42  ")).toBe("42");
  });

  it("accepts a bare numeric id", () => {
    expect(adAccountIdFromUrn("123456789")).toBe("123456789");
  });

  it("rejects anything else rather than building a broken path", () => {
    expect(() => adAccountIdFromUrn("urn:li:sponsoredCampaign:123")).toThrow(/ad account URN/i);
    expect(() => adAccountIdFromUrn("")).toThrow(/ad account URN/i);
    expect(() => adAccountIdFromUrn("urn:li:sponsoredAccount:abc")).toThrow(/ad account URN/i);
  });
});

describe("collection paths", () => {
  it("embeds the account id in the path for migrated entities", () => {
    expect(getEntityConfig("campaign").collectionPath("123")).toBe(
      "/rest/adAccounts/123/adCampaigns"
    );
    expect(getEntityConfig("campaignGroup").collectionPath("123")).toBe(
      "/rest/adAccounts/123/adCampaignGroups"
    );
    expect(getEntityConfig("adAccount").collectionPath()).toBe("/rest/adAccounts");
  });

  it("refuses to build an account-scoped path without an account", () => {
    // Better a named error than `/rest/adAccounts/undefined/adCampaigns`.
    expect(() => getEntityConfig("campaign").collectionPath()).toThrow(/ad account is required/i);
  });
});

describe("staged migration invariants", () => {
  const types = getSupportedEntityTypes();

  it("covers every entity type (an empty set would make the rest vacuous)", () => {
    expect(types).toEqual(["adAccount", "campaignGroup", "campaign", "creative", "conversionRule"]);
  });

  it.each(types)("%s: apiSurface agrees with the path it actually builds", (type) => {
    const config = getEntityConfig(type as LinkedInEntityType);
    const path = config.accountScoped ? config.collectionPath("123") : config.collectionPath();
    if (config.apiSurface === "rest") {
      expect(path, `${type} claims rest but builds ${path}`).toMatch(/^\/rest\//);
    } else {
      expect(path, `${type} claims legacy-v2 but builds ${path}`).toMatch(/^\/v2\//);
    }
  });

  it.each(types)("%s: anything left on /v2/ says why", (type) => {
    const config = getEntityConfig(type as LinkedInEntityType);
    if (config.apiSurface !== "legacy-v2") return;
    // Without this, "not migrated yet" and "nobody noticed" look identical.
    expect(config.migrationBlockedBy ?? "", `${type} is on /v2/ with no reason`).not.toHaveLength(
      0
    );
  });

  it("still requires an ad account to list creatives and conversion rules", () => {
    // THE regression this guards. Those two stayed on /v2/, where the account is
    // a query parameter rather than part of the path. Deriving "needs an
    // account" from `accountScoped` alone would have quietly stopped requiring
    // one for exactly the entities the migration left behind.
    expect(getEntityConfig("creative").accountScoped).toBe(false);
    expect(getEntityConfig("conversionRule").accountScoped).toBe(false);
    expect(isAccountScopedEntity("creative")).toBe(true);
    expect(isAccountScopedEntity("conversionRule")).toBe(true);

    expect([...ACCOUNT_SCOPED_ENTITY_TYPES].sort()).toEqual([
      "campaign",
      "campaignGroup",
      "conversionRule",
      "creative",
    ]);
    expect(isAccountScopedEntity("adAccount")).toBe(false);
  });
});

const ACCOUNT = "urn:li:sponsoredAccount:512";

describe("entityItemRequest: every item path is on /rest/ (#210)", () => {
  // basis: LinkedIn Campaigns / Campaign Groups / Creatives / Conversion
  // Tracking / Ad Accounts pages (learn.microsoft.com/en-us/linkedin, read
  // 2026-11-14): GET/POST/DELETE on these exact item paths.
  it("campaign: /rest/adAccounts/{id}/adCampaigns/{numeric campaign id}", () => {
    expect(entityItemRequest("campaign", "urn:li:sponsoredCampaign:77", ACCOUNT)).toEqual({
      path: "/rest/adAccounts/512/adCampaigns/77",
    });
  });

  it("campaignGroup: /rest/adAccounts/{id}/adCampaignGroups/{numeric group id}", () => {
    expect(entityItemRequest("campaignGroup", "urn:li:sponsoredCampaignGroup:66", ACCOUNT)).toEqual(
      { path: "/rest/adAccounts/512/adCampaignGroups/66" }
    );
  });

  it("creative: /rest/adAccounts/{id}/creatives/{ENCODED creative URN}", () => {
    expect(entityItemRequest("creative", "urn:li:sponsoredCreative:88", ACCOUNT)).toEqual({
      path: "/rest/adAccounts/512/creatives/urn%3Ali%3AsponsoredCreative%3A88",
    });
    // A bare id is the creative's numeric id; the path still carries the URN.
    expect(entityItemRequest("creative", "88", ACCOUNT).path).toBe(
      "/rest/adAccounts/512/creatives/urn%3Ali%3AsponsoredCreative%3A88"
    );
  });

  it("conversionRule: /rest/conversions/{numeric id} with the account as a query parameter", () => {
    expect(entityItemRequest("conversionRule", "urn:lla:llaPartnerConversion:99", ACCOUNT)).toEqual(
      { path: "/rest/conversions/99", query: { account: ACCOUNT } }
    );
  });

  it("adAccount: /rest/adAccounts/{numeric id}, no adAccountUrn needed", () => {
    expect(entityItemRequest("adAccount", "urn:li:sponsoredAccount:512", undefined)).toEqual({
      path: "/rest/adAccounts/512",
    });
    expect(entityItemRequest("adAccount", "urn:li:sponsoredAccount:512", ACCOUNT).path).toBe(
      "/rest/adAccounts/512"
    );
  });

  it("refuses an adAccountUrn that names a different account than the adAccount entity", () => {
    expect(() =>
      entityItemRequest("adAccount", "urn:li:sponsoredAccount:512", "urn:li:sponsoredAccount:1")
    ).toThrow(/different ad account/i);
  });

  it.each(["campaign", "campaignGroup", "creative", "conversionRule"] as const)(
    "%s: refuses to build an item path without an ad account",
    (type) => {
      expect(itemRequiresAdAccount(type)).toBe(true);
      expect(() => entityItemRequest(type, "123", undefined)).toThrow(/adAccountUrn/);
    }
  );

  it("adAccount is the only entity whose item path needs no adAccountUrn", () => {
    expect(getSupportedEntityTypes().filter((t) => !itemRequiresAdAccount(t))).toEqual([
      "adAccount",
    ]);
  });

  it("refuses a URN of the wrong entity type rather than addressing another entity", () => {
    // urn:li:sponsoredCampaign:7 as a campaignGroup would PATCH group 7.
    expect(() => entityItemRequest("campaignGroup", "urn:li:sponsoredCampaign:7", ACCOUNT)).toThrow(
      /sponsoredCampaignGroup/
    );
    expect(() => entityItemRequest("campaign", "urn:li:sponsoredCampaign:x", ACCOUNT)).toThrow(
      /sponsoredCampaign/
    );
  });
});
