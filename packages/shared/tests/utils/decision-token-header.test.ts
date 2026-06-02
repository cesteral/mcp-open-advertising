// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  createRequestContext,
  runWithRequestContext,
  getRequestContext,
} from "../../src/utils/request-context.js";

/**
 * Locks the header wiring the streamable-HTTP transport relies on: the governance
 * decision token must be readable case-insensitively under the exact name the
 * transport looks up, and land on RequestContext.decisionToken. Guards against a
 * header-name typo regression in mcp-http-transport-factory.
 */
describe("decision token header threading", () => {
  it("reads X-Cesteral-Decision-Token (case-insensitively) into RequestContext", async () => {
    const app = new Hono();
    app.post("/mcp", async (c) => {
      const reqCtx = createRequestContext("test");
      reqCtx.decisionToken = c.req.header("x-cesteral-decision-token");
      const seen = await runWithRequestContext(
        reqCtx,
        async () => getRequestContext()?.decisionToken
      );
      return c.json({ seen: seen ?? null });
    });

    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "X-Cesteral-Decision-Token": "tok-abc.def.ghi" },
    });
    expect(await res.json()).toEqual({ seen: "tok-abc.def.ghi" });
  });

  it("leaves decisionToken undefined when the header is absent", async () => {
    const app = new Hono();
    app.post("/mcp", async (c) => {
      const reqCtx = createRequestContext("test");
      reqCtx.decisionToken = c.req.header("x-cesteral-decision-token");
      return c.json({ seen: reqCtx.decisionToken ?? null });
    });

    const res = await app.request("/mcp", { method: "POST" });
    expect(await res.json()).toEqual({ seen: null });
  });
});
