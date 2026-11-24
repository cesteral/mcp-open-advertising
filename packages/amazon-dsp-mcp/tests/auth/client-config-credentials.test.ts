// basis: registry.json `client` block of amazon-dsp-mcp (what the generated Claude Code and
// Codex configs tell a user to set) against the real auth code, with only `fetch` stubbed.
// Amazon's QueryAdvertiserAccount requires the `Amazon-Ads-ClientId` header (see
// amazon-dsp-auth-adapter.ts), so a static-token config without the client ID fails
// validation with a 401. A config that omits it must fail here, not at a user's first call.

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmazonDspBearerAuthStrategy } from "../../src/auth/amazon-dsp-auth-strategy.js";
import { parseConfig } from "../../src/config/index.js";
import { buildEnvAuthAdapter } from "../../src/services/session-wiring.js";

interface ClientEntry {
  name: string;
  requirement: "required" | "optional" | "alternative";
  group?: string;
  env?: string;
  value?: string;
  prefix?: string;
}

const registry = JSON.parse(
  readFileSync(new URL("../../../../registry.json", import.meta.url), "utf8")
) as {
  servers: {
    package: string;
    client: { stdio: { env: ClientEntry[] }; http: { headers: ClientEntry[] } };
  }[];
};
const client = registry.servers.find((s) => s.package === "amazon-dsp-mcp")!.client;

/** Stand-in values for every variable the registry names. */
const VALUES: Record<string, string> = {
  AMAZON_DSP_PROFILE_ID: "profile-1",
  AMAZON_DSP_ACCESS_TOKEN: "static-token",
  AMAZON_DSP_CLIENT_ID: "amzn1.application-oa2-client.test",
};

const requests: Headers[] = [];

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      requests.push(headers);
      if (!headers.get("Amazon-Ads-ClientId")) {
        return new Response("missing client id", { status: 401 });
      }
      return new Response(JSON.stringify({ advertiserAccounts: [] }), { status: 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Amazon DSP static-token configs from the registry", () => {
  it("HTTP: the generated headers authenticate and send the client ID upstream", async () => {
    const headers: Record<string, string> = {};
    for (const h of client.http.headers.filter((e) => e.requirement === "required")) {
      headers[h.name.toLowerCase()] = h.value ?? `${h.prefix ?? ""}${VALUES[h.env!]}`;
    }
    const result = await new AmazonDspBearerAuthStrategy("https://example.test").verify(headers);
    expect(result.authInfo.authType).toBe("amazon-dsp-bearer");
    expect(requests).toHaveLength(1);
    expect(requests[0].get("Amazon-Ads-ClientId")).toBe(VALUES.AMAZON_DSP_CLIENT_ID);
  });

  it("HTTP: dropping the client ID header fails, so the test can tell", async () => {
    const headers: Record<string, string> = {};
    for (const h of client.http.headers.filter((e) => e.requirement === "required")) {
      if (h.name === "Amazon-Advertising-API-ClientId") continue;
      headers[h.name.toLowerCase()] = h.value ?? `${h.prefix ?? ""}${VALUES[h.env!]}`;
    }
    await expect(
      new AmazonDspBearerAuthStrategy("https://example.test").verify(headers)
    ).rejects.toThrow(/401/);
  });

  it("stdio: the access-token group validates and sends the client ID upstream", async () => {
    const names = client.stdio.env
      .filter((e) => e.requirement === "required" || e.group === "access-token")
      .map((e) => e.name);
    for (const name of names) vi.stubEnv(name, VALUES[name]);
    const adapter = buildEnvAuthAdapter(parseConfig());
    expect(adapter).toBeDefined();
    await adapter!.validate();
    expect(requests[0].get("Amazon-Ads-ClientId")).toBe(VALUES.AMAZON_DSP_CLIENT_ID);
  });

  it("stdio: the group without the client ID is rejected upstream, so the test can tell", async () => {
    vi.stubEnv("AMAZON_DSP_PROFILE_ID", VALUES.AMAZON_DSP_PROFILE_ID);
    vi.stubEnv("AMAZON_DSP_ACCESS_TOKEN", VALUES.AMAZON_DSP_ACCESS_TOKEN);
    const adapter = buildEnvAuthAdapter(parseConfig());
    await expect(adapter!.validate()).rejects.toThrow(/401/);
  });
});
