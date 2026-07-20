// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildDeploymentIdentity,
  __resetDeploymentIdentityCacheForTest,
} from "../../src/utils/deployment-identity.js";

const AUD = "https://meta-mcp-abc.run.app";
const SA = "meta-mcp-runtime@proj.iam.gserviceaccount.com";

/** Route metadata-server GETs by path suffix. */
function stubMetadata(overrides: Record<string, string | null> = {}): ReturnType<typeof vi.fn> {
  const defaults: Record<string, string> = {
    identity: "signed.jwt.token",
    email: SA,
    "project-id": "proj",
    region: "projects/123/regions/europe-west2",
  };
  const fetchMock = vi.fn(async (url: string) => {
    let key = "";
    if (url.includes("/identity?")) key = "identity";
    else if (url.endsWith("/email")) key = "email";
    else if (url.endsWith("/project-id")) key = "project-id";
    else if (url.endsWith("/region")) key = "region";
    const val = key in overrides ? overrides[key] : defaults[key];
    if (val === null || val === undefined) return { ok: false, text: async () => "" };
    return { ok: true, text: async () => val };
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return fetchMock;
}

describe("buildDeploymentIdentity", () => {
  beforeEach(() => {
    __resetDeploymentIdentityCacheForTest();
    process.env.K_SERVICE = "meta-mcp";
    process.env.K_REVISION = "meta-mcp-00001";
    process.env.DEPLOYMENT_IDENTITY_AUDIENCE = AUD;
    delete process.env.CESTERAL_IMAGE_DIGEST;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.K_SERVICE;
    delete process.env.K_REVISION;
    delete process.env.DEPLOYMENT_IDENTITY_AUDIENCE;
  });

  it("returns null off Cloud Run (no K_SERVICE) without touching the metadata server", async () => {
    delete process.env.K_SERVICE;
    const fetchMock = stubMetadata();
    expect(await buildDeploymentIdentity()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when no audience is configured", async () => {
    delete process.env.DEPLOYMENT_IDENTITY_AUDIENCE;
    expect(await buildDeploymentIdentity()).toBeNull();
  });

  it("returns null when the identity token cannot be minted", async () => {
    stubMetadata({ identity: null });
    expect(await buildDeploymentIdentity()).toBeNull();
  });

  it("returns null when the service-account email is unavailable", async () => {
    stubMetadata({ email: null });
    expect(await buildDeploymentIdentity()).toBeNull();
  });

  it("mints an identity token bound to the configured audience and returns the block", async () => {
    const fetchMock = stubMetadata();
    process.env.CESTERAL_IMAGE_DIGEST = "sha256:abc";
    const block = await buildDeploymentIdentity();
    expect(block).toEqual({
      service_account: SA,
      project: "proj",
      region: "europe-west2",
      revision: "meta-mcp-00001",
      image_digest: "sha256:abc",
      identity_token: "signed.jwt.token",
    });
    const identityCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/identity?"));
    expect(String(identityCall?.[0])).toContain(`audience=${encodeURIComponent(AUD)}`);
  });

  it("caches the minted token across calls within its TTL", async () => {
    const fetchMock = stubMetadata();
    await buildDeploymentIdentity();
    await buildDeploymentIdentity();
    const identityCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/identity?"));
    expect(identityCalls).toHaveLength(1);
  });
});
