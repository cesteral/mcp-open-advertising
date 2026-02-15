import { describe, expect, it } from "vitest";

import {
  STATIC_ENTITY_API_METADATA,
  getEntityRelationships,
} from "../../../../src/mcp-server/tools/utils/entity-mapping-dynamic.js";

type DocPathExpectation = {
  readonly apiPath: string;
  readonly docUrl: string;
};

const EXPECTED_PATHS_FROM_DOCS: Record<string, DocPathExpectation> = {
  partner: {
    apiPath: "/partners",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/partners/list#http-request",
  },
  advertiser: {
    apiPath: "/advertisers",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/advertisers/list#http-request",
  },
  campaign: {
    apiPath: "/advertisers/{advertiserId}/campaigns",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/advertisers.campaigns/list#http-request",
  },
  insertionOrder: {
    apiPath: "/advertisers/{advertiserId}/insertionOrders",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/advertisers.insertionOrders/list#http-request",
  },
  lineItem: {
    apiPath: "/advertisers/{advertiserId}/lineItems",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/advertisers.lineItems/list#http-request",
  },
  adGroup: {
    apiPath: "/advertisers/{advertiserId}/adGroups",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/advertisers.adGroups/list#http-request",
  },
  adGroupAd: {
    apiPath: "/advertisers/{advertiserId}/adGroupAds",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/advertisers.adGroupAds/list#http-request",
  },
  creative: {
    apiPath: "/advertisers/{advertiserId}/creatives",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/advertisers.creatives/list#http-request",
  },
  customBiddingAlgorithm: {
    apiPath: "/customBiddingAlgorithms",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/customBiddingAlgorithms/list#http-request",
  },
  inventorySource: {
    apiPath: "/inventorySources",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/inventorySources/list#http-request",
  },
  inventorySourceGroup: {
    apiPath: "/inventorySourceGroups",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/inventorySourceGroups/list#http-request",
  },
  locationList: {
    apiPath: "/advertisers/{advertiserId}/locationLists",
    docUrl: "https://developers.google.com/display-video/api/reference/rest/v4/advertisers.locationLists/list#http-request",
  },
} satisfies Record<string, DocPathExpectation>;

describe("STATIC_ENTITY_API_METADATA", () => {
  it("only contains entity types we have validated against the DV360 docs", () => {
    expect(Object.keys(STATIC_ENTITY_API_METADATA).sort()).toEqual(
      Object.keys(EXPECTED_PATHS_FROM_DOCS).sort(),
    );
  });

  for (const [entityType, expectation] of Object.entries(EXPECTED_PATHS_FROM_DOCS)) {
    it(`matches the documented path for ${entityType}`, () => {
      expect(STATIC_ENTITY_API_METADATA[entityType]).toBeDefined();
      expect(STATIC_ENTITY_API_METADATA[entityType]?.apiPathTemplate).toBe(expectation.apiPath);
    });
  }

  it("keeps relationship metadata aligned with required parentResourceIds", () => {
    for (const [entityType, metadata] of Object.entries(STATIC_ENTITY_API_METADATA)) {
      const requiredRelationships = getEntityRelationships(entityType)
        .filter((relationship) => relationship.required)
        .map((relationship) => relationship.parentFieldName);

      for (const parentResourceId of metadata.parentResourceIds) {
        expect(requiredRelationships).toContain(parentResourceId);
      }
    }
  });
});
