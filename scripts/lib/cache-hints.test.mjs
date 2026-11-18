// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// 2026-07-28 cache hints, fleet-wide (#248). SEP-2549 makes `ttlMs` and
// `cacheScope` mandatory on the list results and `resources/read`; the SDK's
// default is `0` / `private`. The catalogs are fixed per release and identical
// for every principal, so every server advertises them as long-lived and
// shareable, and a regression to the default (which costs every client and
// gateway the ~125k-token fleet catalog on each session) fails here.
//
// What must never be `public` is tenant data: `report-csv://` bodies, and the
// `resources/list` that enumerates them. The per-read TTL cap is asserted in
// packages/shared/tests/utils/cache-hints-wire.test.ts, which has data to read.

import { describe, expect, it } from "vitest";
import { fleetPackages } from "./fleet-snapshot.mjs";
import { serverSnapshot } from "./fleet-snapshot-inject.mjs";

const ONE_HOUR = 3_600_000;

describe.each(fleetPackages())("%s cache hints", (pkg) => {
  const { cacheHints, capabilities } = serverSnapshot(pkg);

  it("advertises the catalogs as public with a long TTL", () => {
    expect(cacheHints["tools/list"]).toEqual({ ttlMs: ONE_HOUR, cacheScope: "public" });
    if (capabilities.prompts) {
      expect(cacheHints["prompts/list"]).toEqual({ ttlMs: ONE_HOUR, cacheScope: "public" });
    }
    if (capabilities.resources) {
      expect(cacheHints["resources/templates/list"]).toEqual({
        ttlMs: ONE_HOUR,
        cacheScope: "public",
      });
    }
  });

  it("advertises every static resource as public, and never report-csv://", () => {
    for (const [uri, hint] of Object.entries(cacheHints.reads)) {
      if (uri.startsWith("report-csv://")) {
        expect(hint.cacheScope, uri).toBe("private");
      } else {
        expect(hint, uri).toEqual({ ttlMs: ONE_HOUR, cacheScope: "public" });
      }
    }
  });
});
