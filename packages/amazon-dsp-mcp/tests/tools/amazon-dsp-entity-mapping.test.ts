// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Entity type → Unified API resource mapping (#234).
 *
 * basis: amzn/ads-advanced-tools-docs @ e25aace0ec07997c113dac48f333298472243558,
 * unified-campaign-management-migration-skills/api-specs/unified-api-dsp.json —
 * the paths and operationIds below (e.g. `POST /adsApi/v1/query/campaigns`,
 * operationId DSPQueryCampaign), the `<Resource>IdFilter` query filters, the
 * `maxItems` batch limits on DSPCreate<Entity>Request, and the absence of
 * delete for campaigns/adGroups/ads, of update for targets, and of a targetId
 * filter on DSPQueryTargetRequest.
 */

import { describe, it, expect } from "vitest";
import {
  getCanonicalEntityType,
  getCreatableEntityTypeEnum,
  getDeletableEntityTypeEnum,
  getDuplicableEntityTypeEnum,
  getEntityContract,
  getGettableEntityTypeEnum,
  getSupportedEntityTypes,
  getUpdatableEntityTypeEnum,
  interpolatePath,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";
import { unifiedEntityPath } from "../../src/services/amazon-dsp/amazon-dsp-api-contract.js";

describe("Amazon DSP entity mapping (Unified API)", () => {
  it.each([
    ["order", "campaigns", "campaign", "campaignId", "campaignIdFilter", 5],
    ["lineItem", "adGroups", "adGroup", "adGroupId", "adGroupIdFilter", 20],
    ["creative", "ads", "ad", "adId", "adIdFilter", 10],
    ["target", "targets", "target", "targetId", undefined, 1000],
    [
      "creativeAssociation",
      "adAssociations",
      "adAssociation",
      "adAssociationId",
      "adAssociationIdFilter",
      20,
    ],
  ] as const)(
    "%s → /adsApi/v1/*/%s (item %s, id %s, filter %s, batch %d)",
    (entityType, resource, itemKey, idField, idFilter, batch) => {
      const c = getEntityContract(entityType);
      expect(c.unified.resource).toBe(resource);
      expect(c.unified.itemKey).toBe(itemKey);
      expect(c.idField).toBe(idField);
      expect(c.unified.idField).toBe(idField);
      expect(c.unified.idFilter).toBe(idFilter);
      expect(c.unified.writeBatchMax).toBe(batch);
      expect(unifiedEntityPath("query", c.unified.resource)).toBe(`/adsApi/v1/query/${resource}`);
    }
  );

  it("adProductFilter is required on every query except adAssociations", () => {
    for (const t of getSupportedEntityTypes()) {
      expect(getEntityContract(t).unified.adProductFilter, t).toBe(t !== "creativeAssociation");
    }
  });

  it("only targets and ad associations have a Unified delete", () => {
    expect(getEntityContract("target").unified.deleteIdsKey).toBe("targetIds");
    expect(getEntityContract("creativeAssociation").unified.deleteIdsKey).toBe("adAssociationIds");
    for (const t of ["order", "lineItem", "creative"] as const) {
      expect(getEntityContract(t).unified.operations.delete, t).toBeUndefined();
    }
  });

  it("orders and line items keep the LEGACY archive fallback, clearly separate", () => {
    expect(getEntityContract("order").legacyArchive).toEqual({
      pathTemplate: "/dsp/orders/{entityId}",
      mediaType: "application/vnd.dsporders.v2.2+json",
    });
    expect(getEntityContract("lineItem").legacyArchive).toEqual({
      pathTemplate: "/dsp/lineItems/{entityId}",
      mediaType: "application/vnd.dsplineitems.v3.1+json",
    });
    for (const t of ["creative", "target", "creativeAssociation"] as const) {
      expect(getEntityContract(t).legacyArchive, t).toBeUndefined();
    }
  });

  it("capability enums follow the spec's operation set", () => {
    expect(getCreatableEntityTypeEnum()).toEqual([
      "order",
      "lineItem",
      "creative",
      "target",
      "creativeAssociation",
    ]);
    // DSPQueryTargetRequest has no targetId filter.
    expect(getGettableEntityTypeEnum()).toEqual([
      "order",
      "lineItem",
      "creative",
      "creativeAssociation",
    ]);
    // No update operation for targets in unified-api-dsp.json.
    expect(getUpdatableEntityTypeEnum()).toEqual([
      "order",
      "lineItem",
      "creative",
      "creativeAssociation",
    ]);
    // No delete/ads and no ARCHIVED update state.
    expect(getDeletableEntityTypeEnum()).toEqual([
      "order",
      "lineItem",
      "target",
      "creativeAssociation",
    ]);
    expect(getDuplicableEntityTypeEnum()).toEqual([
      "order",
      "lineItem",
      "creative",
      "creativeAssociation",
    ]);
  });

  it("campaigns and ad groups must be created PAUSED (DSPCreateState description)", () => {
    expect(getEntityContract("order").createStateMustBe).toBe("PAUSED");
    expect(getEntityContract("lineItem").createStateMustBe).toBe("PAUSED");
    expect(getEntityContract("creative").createStateMustBe).toBeUndefined();
  });

  describe("getSupportedEntityTypes", () => {
    it("returns all canonical entity types", () => {
      expect(getSupportedEntityTypes()).toEqual([
        "order",
        "lineItem",
        "creative",
        "target",
        "creativeAssociation",
      ]);
    });
  });

  describe("getCanonicalEntityType", () => {
    it("returns the entity type for a valid input", () => {
      expect(getCanonicalEntityType("order")).toBe("order");
      expect(getCanonicalEntityType("lineItem")).toBe("lineItem");
    });

    it("throws on an unknown entity type", () => {
      expect(() => getCanonicalEntityType("campaign" as never)).toThrow();
    });
  });

  describe("interpolatePath (legacy archive path)", () => {
    it("replaces {entityId}", () => {
      expect(interpolatePath("/dsp/orders/{entityId}", { entityId: "ord_1" })).toBe(
        "/dsp/orders/ord_1"
      );
    });

    it("URI-encodes IDs so they cannot rewrite the upstream path", () => {
      expect(interpolatePath("/dsp/orders/{entityId}", { entityId: "../advertisers" })).toBe(
        "/dsp/orders/..%2Fadvertisers"
      );
      expect(interpolatePath("/dsp/orders/{entityId}", { entityId: "a?b#c" })).toBe(
        "/dsp/orders/a%3Fb%23c"
      );
    });

    it("rejects dot-segment and empty IDs", () => {
      for (const bad of ["..", ".", ""]) {
        expect(() => interpolatePath("/dsp/orders/{entityId}", { entityId: bad })).toThrow(
          /Invalid entityId/
        );
      }
    });
  });
});
