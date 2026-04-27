import { describe, it, expect } from "vitest";
import {
  extractEntitiesFromListResponse,
  type ExtractedEntities,
} from "../../src/services/dv360/entity-response-parser.js";

describe("extractEntitiesFromListResponse", () => {
  // ==========================================================================
  // Standard pluralisation (append "s")
  // ==========================================================================

  describe("standard plural (append s)", () => {
    it('finds "campaigns" for entityType "campaign"', () => {
      const response = {
        campaigns: [{ id: "1" }, { id: "2" }],
      };

      const result = extractEntitiesFromListResponse(response, "campaign");

      expect(result.entities).toEqual([{ id: "1" }, { id: "2" }]);
      expect(result.nextPageToken).toBeUndefined();
    });

    it('finds "lineItems" for entityType "lineItem"', () => {
      const response = {
        lineItems: [{ id: "li-1" }],
      };

      const result = extractEntitiesFromListResponse(response, "lineItem");

      expect(result.entities).toEqual([{ id: "li-1" }]);
    });

    it('finds "insertionOrders" for entityType "insertionOrder"', () => {
      const response = {
        insertionOrders: [{ id: "io-1" }, { id: "io-2" }],
      };

      const result = extractEntitiesFromListResponse(response, "insertionOrder");

      expect(result.entities).toEqual([{ id: "io-1" }, { id: "io-2" }]);
    });

    it('finds "advertisers" for entityType "advertiser"', () => {
      const response = {
        advertisers: [{ advertiserId: "adv-1" }],
      };

      const result = extractEntitiesFromListResponse(response, "advertiser");

      expect(result.entities).toEqual([{ advertiserId: "adv-1" }]);
    });

    it('finds "creatives" for entityType "creative"', () => {
      const response = {
        creatives: [{ id: "c1" }],
      };

      const result = extractEntitiesFromListResponse(response, "creative");

      expect(result.entities).toEqual([{ id: "c1" }]);
    });
  });

  // ==========================================================================
  // Y-ending pluralisation (consonant + y → ies)
  // ==========================================================================

  describe("y-ending plural (consonant + y → ies)", () => {
    it('finds "categories" for entityType "category"', () => {
      const response = {
        categories: [{ name: "cat-1" }],
      };

      const result = extractEntitiesFromListResponse(response, "category");

      expect(result.entities).toEqual([{ name: "cat-1" }]);
    });

    it('finds "frequencies" for entityType "frequency"', () => {
      const response = {
        frequencies: [{ value: 5 }],
      };

      const result = extractEntitiesFromListResponse(response, "frequency");

      expect(result.entities).toEqual([{ value: 5 }]);
    });

    it('does NOT use -ies for vowel + y (e.g. "key" → "keys")', () => {
      const response = {
        keys: [{ id: "k1" }],
      };

      const result = extractEntitiesFromListResponse(response, "key");

      expect(result.entities).toEqual([{ id: "k1" }]);
    });
  });

  // ==========================================================================
  // S/X/Z/CH/SH endings (append "es")
  // ==========================================================================

  describe('s/x/z/ch/sh endings (append "es")', () => {
    it('finds "statuses" for entityType "status"', () => {
      const response = {
        statuses: [{ state: "ACTIVE" }],
      };

      const result = extractEntitiesFromListResponse(response, "status");

      expect(result.entities).toEqual([{ state: "ACTIVE" }]);
    });

    it('finds "matches" for entityType "match"', () => {
      const response = {
        matches: [{ value: "exact" }],
      };

      const result = extractEntitiesFromListResponse(response, "match");

      expect(result.entities).toEqual([{ value: "exact" }]);
    });

    it('finds "boxes" for entityType "box" (x-ending)', () => {
      const response = {
        boxes: [{ id: "b1" }],
      };

      // "box" → candidates: ["boxs", "boxes"]
      const result = extractEntitiesFromListResponse(response, "box");

      expect(result.entities).toEqual([{ id: "b1" }]);
    });
  });

  // ==========================================================================
  // nextPageToken handling
  // ==========================================================================

  describe("nextPageToken", () => {
    it("includes nextPageToken when present in response", () => {
      const response = {
        campaigns: [{ id: "1" }],
        nextPageToken: "page2-token",
      };

      const result = extractEntitiesFromListResponse(response, "campaign");

      expect(result.entities).toEqual([{ id: "1" }]);
      expect(result.nextPageToken).toBe("page2-token");
    });

    it("returns undefined nextPageToken when not present", () => {
      const response = {
        campaigns: [{ id: "1" }],
      };

      const result = extractEntitiesFromListResponse(response, "campaign");

      expect(result.nextPageToken).toBeUndefined();
    });

    it("returns nextPageToken even when no entities found", () => {
      const response = {
        nextPageToken: "some-token",
      };

      const result = extractEntitiesFromListResponse(response, "campaign");

      expect(result.entities).toEqual([]);
      expect(result.nextPageToken).toBe("some-token");
    });

    it("ignores non-string nextPageToken", () => {
      const response = {
        campaigns: [{ id: "1" }],
        nextPageToken: 12345,
      };

      const result = extractEntitiesFromListResponse(response, "campaign");

      expect(result.nextPageToken).toBeUndefined();
    });
  });

  // ==========================================================================
  // Empty / missing responses
  // ==========================================================================

  describe("empty and missing responses", () => {
    it("returns empty entities for an empty object", () => {
      const result = extractEntitiesFromListResponse({}, "campaign");

      expect(result.entities).toEqual([]);
      expect(result.nextPageToken).toBeUndefined();
    });

    it("returns empty entities when the key exists but is not an array", () => {
      const response = {
        campaigns: "not-an-array",
      };

      const result = extractEntitiesFromListResponse(response, "campaign");

      // "campaigns" is not an array, fallback scanning also finds nothing
      expect(result.entities).toEqual([]);
    });
  });

  // ==========================================================================
  // Fallback to first array-valued key
  // ==========================================================================

  describe("fallback to first array-valued key", () => {
    it("falls back to the first array key when no standard plural matches", () => {
      const response = {
        customResults: [{ id: "r1" }, { id: "r2" }],
        metadata: { count: 2 },
      };

      const result = extractEntitiesFromListResponse(response, "weirdEntity");

      expect(result.entities).toEqual([{ id: "r1" }, { id: "r2" }]);
    });

    it("skips nextPageToken key during fallback scan", () => {
      const response = {
        nextPageToken: "token",
        // nextPageToken is not an array, but even if it were it should be skipped
        results: [{ id: "1" }],
      };

      const result = extractEntitiesFromListResponse(response, "unknown");

      expect(result.entities).toEqual([{ id: "1" }]);
      expect(result.nextPageToken).toBe("token");
    });
  });

  // ==========================================================================
  // Invalid / non-object input
  // ==========================================================================

  describe("invalid input handling", () => {
    it("returns empty entities for null", () => {
      const result = extractEntitiesFromListResponse(null, "campaign");

      expect(result).toEqual({ entities: [] });
    });

    it("returns empty entities for undefined", () => {
      const result = extractEntitiesFromListResponse(undefined, "campaign");

      expect(result).toEqual({ entities: [] });
    });

    it("returns empty entities for a string", () => {
      const result = extractEntitiesFromListResponse("not an object" as any, "campaign");

      expect(result).toEqual({ entities: [] });
    });

    it("returns empty entities for a number", () => {
      const result = extractEntitiesFromListResponse(42 as any, "campaign");

      expect(result).toEqual({ entities: [] });
    });

    it("returns empty entities for a boolean", () => {
      const result = extractEntitiesFromListResponse(true as any, "campaign");

      expect(result).toEqual({ entities: [] });
    });
  });
});
