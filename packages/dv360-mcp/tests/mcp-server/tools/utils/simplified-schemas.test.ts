// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import {
  getSupportedEntityTypesDynamic,
  getCreatableEntityTypesDynamic,
  getUpdatableEntityTypesDynamic,
} from "../../../../src/mcp-server/tools/utils/entity-mapping-dynamic.js";
import {
  createSimplifiedCreateEntityInputSchema,
  createSimplifiedUpdateEntityInputSchema,
} from "../../../../src/mcp-server/tools/utils/simplified-schemas.js";

// `partner` and `adGroupAd` are `isReadOnly` in STATIC_ENTITY_API_METADATA —
// DV360 refuses to create/update them. They must not appear in the create/update
// tool schemas, or a call passes Zod only to fail opaquely at API dispatch.
const READ_ONLY_TYPES = ["partner", "adGroupAd"];

describe("read-only entity types are excluded from create/update schemas", () => {
  it("read-only types are still listed as supported (reads/deletes)", () => {
    const supported = getSupportedEntityTypesDynamic();
    for (const t of READ_ONLY_TYPES) {
      expect(supported).toContain(t);
    }
  });

  it("getCreatableEntityTypesDynamic omits read-only types but keeps writable ones", () => {
    const creatable = getCreatableEntityTypesDynamic();
    for (const t of READ_ONLY_TYPES) {
      expect(creatable).not.toContain(t);
    }
    expect(creatable).toContain("campaign");
    expect(creatable).toContain("lineItem");
  });

  it("getUpdatableEntityTypesDynamic omits read-only types but keeps writable ones", () => {
    const updatable = getUpdatableEntityTypesDynamic();
    for (const t of READ_ONLY_TYPES) {
      expect(updatable).not.toContain(t);
    }
    expect(updatable).toContain("campaign");
    expect(updatable).toContain("lineItem");
  });

  it("the create schema rejects a read-only entityType and accepts a writable one", () => {
    const schema = createSimplifiedCreateEntityInputSchema();
    expect(schema.safeParse({ entityType: "partner", data: {} }).success).toBe(false);
    expect(
      schema.safeParse({ entityType: "campaign", advertiserId: "1", data: {} }).success
    ).toBe(true);
  });

  it("the update schema rejects a read-only entityType and accepts a writable one", () => {
    const schema = createSimplifiedUpdateEntityInputSchema();
    expect(
      schema.safeParse({ entityType: "adGroupAd", data: {}, updateMask: "displayName" }).success
    ).toBe(false);
    expect(
      schema.safeParse({
        entityType: "lineItem",
        advertiserId: "1",
        data: {},
        updateMask: "displayName",
      }).success
    ).toBe(true);
  });
});
