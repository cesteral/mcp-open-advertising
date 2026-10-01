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
import { EntityIdFieldsSchema } from "../../../../src/mcp-server/tools/utils/entity-id-extraction.js";
import { createEntityTool } from "../../../../src/mcp-server/tools/definitions/create-entity.tool.js";
import { BulkCreateEntitiesInputSchema } from "../../../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { BulkUpdateEntitiesInputSchema } from "../../../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";

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
    expect(schema.safeParse({ entityType: "campaign", advertiserId: "1", data: {} }).success).toBe(
      true
    );
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

// dv360 #18: the bulk tools used getSupportedEntityTypesDynamic(), so they
// offered the read-only types the single create/update tools filter out.
describe("read-only entity types are excluded from the bulk create/update schemas", () => {
  const enumOf = (schema: unknown): string[] => {
    let s = schema as { _def: { schema?: unknown; innerType?: unknown }; shape?: unknown };
    while (!s.shape) s = (s._def.schema ?? s._def.innerType) as typeof s;
    return (s.shape as { entityType: { options: string[] } }).entityType.options;
  };

  it("bulk create offers exactly the creatable types", () => {
    expect(enumOf(BulkCreateEntitiesInputSchema)).toEqual(getCreatableEntityTypesDynamic());
    for (const t of READ_ONLY_TYPES) expect(enumOf(BulkCreateEntitiesInputSchema)).not.toContain(t);
  });

  it("bulk update offers exactly the updatable types", () => {
    expect(enumOf(BulkUpdateEntitiesInputSchema)).toEqual(getUpdatableEntityTypesDynamic());
    for (const t of READ_ONLY_TYPES) expect(enumOf(BulkUpdateEntitiesInputSchema)).not.toContain(t);
  });
});

// dv360 #26: there is no `ad` entity type, so no `adId`; and create's
// validation is the client-side check against the generated schema.
describe("dv360 entity id fields and create description", () => {
  it("offers no adId", () => {
    expect(EntityIdFieldsSchema).not.toHaveProperty("adId");
  });

  it("does not claim server-side validation", () => {
    expect(createEntityTool.description).not.toMatch(/server-side validation/);
  });
});
