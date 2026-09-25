// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  findProductionEndpointsUnderSandbox,
  isTtdProductionUrl,
} from "../../src/config/sandbox-guard.js";

const PROD_REST = "https://api.thetradedesk.com/v3";
const PROD_GQL = "https://desk.thetradedesk.com/graphql";
const SB_REST = "https://ext-api.sb.thetradedesk.com/v3";
const SB_GQL = "https://ext-api.sb.thetradedesk.com/graphql";

describe("isTtdProductionUrl", () => {
  it("treats TTD hosts without an sb label as production", () => {
    expect(isTtdProductionUrl(PROD_REST)).toBe(true);
    expect(isTtdProductionUrl(PROD_GQL)).toBe(true);
    expect(isTtdProductionUrl("https://API.TheTradeDesk.com/v3")).toBe(true);
  });

  it("treats the sandbox host as non-production", () => {
    expect(isTtdProductionUrl(SB_REST)).toBe(false);
    expect(isTtdProductionUrl(SB_GQL)).toBe(false);
  });

  it("treats non-TTD hosts (mocks, proxies) and lookalikes as non-production", () => {
    expect(isTtdProductionUrl("http://localhost:4010/v3")).toBe(false);
    expect(isTtdProductionUrl("https://thetradedesk.com.example.org/v3")).toBe(false);
    expect(isTtdProductionUrl("not a url")).toBe(false);
  });
});

describe("findProductionEndpointsUnderSandbox", () => {
  it("allows production endpoints when sandbox mode is off", () => {
    expect(
      findProductionEndpointsUnderSandbox({
        ttdUseSandbox: false,
        ttdApiBaseUrl: PROD_REST,
        ttdGraphqlUrl: PROD_GQL,
      })
    ).toEqual([]);
  });

  it("allows sandbox endpoints under sandbox mode", () => {
    expect(
      findProductionEndpointsUnderSandbox({
        ttdUseSandbox: true,
        ttdApiBaseUrl: SB_REST,
        ttdGraphqlUrl: SB_GQL,
      })
    ).toEqual([]);
  });

  // The shipped .env.example used to pin TTD_API_BASE_URL to production, which
  // overrode the sandbox default: GraphQL went to the sandbox, REST writes to prod.
  it("flags a production REST override under sandbox mode", () => {
    expect(
      findProductionEndpointsUnderSandbox({
        ttdUseSandbox: true,
        ttdApiBaseUrl: PROD_REST,
        ttdGraphqlUrl: SB_GQL,
      })
    ).toEqual([{ setting: "TTD_API_BASE_URL", url: PROD_REST }]);
  });

  it("flags a production GraphQL override under sandbox mode", () => {
    expect(
      findProductionEndpointsUnderSandbox({
        ttdUseSandbox: true,
        ttdApiBaseUrl: SB_REST,
        ttdGraphqlUrl: PROD_GQL,
      })
    ).toEqual([{ setting: "TTD_GRAPHQL_URL", url: PROD_GQL }]);
  });
});

// Each case re-imports the config module (and @cesteral/shared) from a reset
// module registry — ~3s cold, so allow headroom under a parallel turbo run.
describe("parseConfig sandbox guard", { timeout: 30_000 }, () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  async function parseWith(env: Record<string, string | undefined>) {
    for (const key of ["TTD_USE_SANDBOX", "TTD_API_BASE_URL", "TTD_GRAPHQL_URL"]) {
      delete process.env[key];
    }
    Object.assign(process.env, env);
    vi.resetModules();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { parseConfig } = await import("../../src/config/index.js");
    return parseConfig();
  }

  it("defaults both endpoints to the sandbox under sandbox mode", async () => {
    const config = await parseWith({ TTD_USE_SANDBOX: "true" });
    expect(config.ttdApiBaseUrl).toBe(SB_REST);
    expect(config.ttdGraphqlUrl).toBe(SB_GQL);
  });

  it("refuses to start with sandbox mode and a production REST override", async () => {
    await expect(
      parseWith({ TTD_USE_SANDBOX: "true", TTD_API_BASE_URL: PROD_REST })
    ).rejects.toThrow("Invalid configuration");
  });

  it("still allows an explicit production URL when sandbox mode is off", async () => {
    const config = await parseWith({ TTD_API_BASE_URL: PROD_REST });
    expect(config.ttdApiBaseUrl).toBe(PROD_REST);
  });
});
