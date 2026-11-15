// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { describeServerCard, readServerCard } from "@cesteral/shared/testkit";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";
import { TEST_LINKEDIN_API_VERSION } from "../testkit/api-version.js";

const serverCard = {
  packageName: "linkedin-mcp",
  createServer: createMcpHttpServer,
  platformConfig: {
    port: 3006,
    linkedinApiBaseUrl: "https://api.linkedin.com",
    linkedinApiVersion: TEST_LINKEDIN_API_VERSION,
  },
};

describeServerCard(serverCard);

describe("/.well-known/mcp/server-card.json untrusted-content boundary (linkedin-mcp)", () => {
  // #204 Tier 1: the untrusted-content boundary is declared on every card.
  it("declares the untrusted-content boundary per response", async () => {
    const body = await readServerCard(serverCard);
    expect(body.untrusted_content.returns_third_party_content).toBe(true);
    expect(body.untrusted_content.client_obligations.length).toBeGreaterThan(0);
    // Every linkedin tool declares where platform text sits (or declares
    // none), so the card claims per-response. The claim is ratcheted in
    // scripts/lib/untrusted-declarations.test.mjs.
    expect(body.untrusted_content.path_reporting).toBe("per-response");
  });
});
