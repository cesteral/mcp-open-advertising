// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Ratchet (#341): the ids dv360-mcp requires and sends on get / update / delete
 * must be the parameters Google's v4 Discovery document gives those methods.
 * advertisers.get takes only the advertiser id, but the tool required a
 * partnerId and sent it as a query parameter, which DV360 rejects ("Cannot
 * bind query parameter").
 *
 * basis: tests/fixtures/dv360-v4-item-methods.json, extracted from
 *   https://displayvideo.googleapis.com/$discovery/rest?version=v4
 *   (revision recorded in its `_provenance`): per mapped entity type, the
 *   path and query parameter names of its resource's get / patch / delete.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  getAllEntityConfigs,
  type EntityConfig,
} from "../../src/mcp-server/tools/utils/entity-mapping-dynamic.js";

interface MethodParams {
  path: string[];
  query: string[];
}

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/dv360-v4-item-methods.json", import.meta.url), "utf8")
) as { entities: Record<string, { resource: string; methods: Record<string, MethodParams> }> };

const configs = getAllEntityConfigs();
const sorted = (ids: readonly string[]) => [...ids].sort();

/** The query parameter names DV360Service sends on each item method. */
function sentQuery(config: EntityConfig, method: "get" | "patch" | "delete"): string[] {
  if (method === "get") return config.getQueryParamIds;
  return config.writeScopeInQuery ? config.queryParamIds : [];
}

describe("DV360 item-method parameters match v4 Discovery", () => {
  it("covers every mapped entity type", () => {
    expect(sorted(Object.keys(fixture.entities))).toEqual(sorted([...configs.keys()]));
  });

  for (const [entityType, config] of configs) {
    describe(entityType, () => {
      const methods = fixture.entities[entityType]?.methods ?? {};
      const entityIdField = `${entityType}Id`;

      it("requires exactly the get method's path ids", () => {
        expect(sorted([...config.itemParentIds, entityIdField])).toEqual(
          sorted(methods.get?.path ?? [])
        );
      });

      for (const method of ["get", "patch", "delete"] as const) {
        const params = methods[method];
        if (!params) continue;

        it(`${method}: sends only query parameters Discovery declares`, () => {
          for (const key of sentQuery(config, method)) {
            expect(params.query, `${entityType}.${method} ?${key}`).toContain(key);
          }
        });

        it(`${method}: path ids are the required ids`, () => {
          expect(sorted(params.path)).toEqual(sorted([...config.itemParentIds, entityIdField]));
        });
      }
    });
  }
});
