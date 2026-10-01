// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * amazon_dsp_list_entities over the Unified API (#234): `nextToken` cursor
 * pagination (DSPQuery<Entity>Request.nextToken / DSP<Entity>SuccessResponse
 * .nextToken — unified-api-dsp.json, amzn/ads-advanced-tools-docs @ e25aace0).
 * The service is mocked here; the request body is asserted in
 * amazon-dsp-unified-wire.test.ts. The legacy offset cursor survives only on
 * amazon_dsp_list_advertisers (see amazon-dsp-list-advertisers.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock session services
vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  listEntitiesLogic,
  listEntitiesResponseFormatter,
  ListEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";

const mockListEntities = vi.fn();
const ACCOUNT = "5550001112223";

beforeEach(() => {
  mockListEntities.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspService: {
      listEntities: mockListEntities,
    },
    boundProfileId: "1234567890",
  } as any);
});

describe("amazonDsp_list_entities tool", () => {
  const baseContext = { requestId: "test-req" } as any;
  const baseSdkContext = { sessionId: "test-session" } as any;

  describe("listEntitiesLogic()", () => {
    it("returns the page and a null cursor when Amazon sends no nextToken", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [
          { campaignId: "cmp_001", name: "Order A", state: "ENABLED" },
          { campaignId: "cmp_002", name: "Order B", state: "PAUSED" },
        ],
        nextToken: undefined,
      });

      const result = await listEntitiesLogic(
        { entityType: "order", profileId: "1234567890", accountId: ACCOUNT, pageSize: 25 },
        baseContext,
        baseSdkContext
      );

      expect(result.entities).toHaveLength(2);
      expect(result.pagination.pageSize).toBe(2);
      expect(result.pagination.totalCount).toBeUndefined();
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.nextPageInputKey).toBe("nextToken");
    });

    it("surfaces Amazon's nextToken as the cursor", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [{ campaignId: "cmp_001" }],
        nextToken: "tok-2",
      });

      const result = await listEntitiesLogic(
        { entityType: "order", profileId: "1234567890", accountId: ACCOUNT, pageSize: 1 },
        baseContext,
        baseSdkContext
      );

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("tok-2");
      expect(listEntitiesResponseFormatter(result)[0].text).toContain('nextToken: "tok-2"');
    });

    it("passes accountId, filters, pageSize and nextToken to the service", async () => {
      mockListEntities.mockResolvedValueOnce({ entities: [], nextToken: undefined });

      await listEntitiesLogic(
        {
          entityType: "lineItem",
          profileId: "1234567890",
          accountId: ACCOUNT,
          filters: { orderId: "cmp_123" },
          nextToken: "tok-1",
          pageSize: 50,
        },
        baseContext,
        baseSdkContext
      );

      expect(mockListEntities).toHaveBeenCalledWith(
        "lineItem",
        ACCOUNT,
        { filters: { orderId: "cmp_123" }, maxResults: 50, nextToken: "tok-1" },
        baseContext
      );
    });

    it("reports an empty page as empty", async () => {
      mockListEntities.mockResolvedValueOnce({ entities: [], nextToken: undefined });

      const result = await listEntitiesLogic(
        { entityType: "order", profileId: "1234567890", accountId: ACCOUNT, pageSize: 25 },
        baseContext,
        baseSdkContext
      );

      expect(result.pagination.pageSize).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
      expect(listEntitiesResponseFormatter(result)[0].text).toContain("No entities found");
    });

    it("rejects a profileId other than the session's before calling Amazon", async () => {
      await expect(
        listEntitiesLogic(
          { entityType: "order", profileId: "999", accountId: ACCOUNT, pageSize: 25 },
          baseContext,
          baseSdkContext
        )
      ).rejects.toThrow();
      expect(mockListEntities).not.toHaveBeenCalled();
    });
  });

  describe("input schema validation", () => {
    it("accepts valid input", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "order",
        profileId: "1234567890",
        accountId: ACCOUNT,
      });
      expect(result.success).toBe(true);
    });

    it("requires accountId", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "order",
        profileId: "1234567890",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown entity types", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "unknownType",
        profileId: "1234567890",
        accountId: ACCOUNT,
      });
      expect(result.success).toBe(false);
    });

    it("rejects an empty profile ID", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "order",
        profileId: "",
        accountId: ACCOUNT,
      });
      expect(result.success).toBe(false);
    });

    it("rejects page size over 100 (Unified maxResults maximum for campaigns/adGroups/ads)", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "order",
        profileId: "1234567890",
        accountId: ACCOUNT,
        pageSize: 101,
      });
      expect(result.success).toBe(false);
    });

    it("accepts all supported entity types", () => {
      for (const entityType of ["order", "lineItem", "creative", "target", "creativeAssociation"]) {
        const result = ListEntitiesInputSchema.safeParse({
          entityType,
          profileId: "1234567890",
          accountId: ACCOUNT,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});
