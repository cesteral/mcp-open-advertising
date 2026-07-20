// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Cloud Run deployment identity for the server-card `deployment` block
 * (C2 / #742, stage S1 — the producer half).
 *
 * The governance layer promotes a tool to `attested` when its descriptor hash
 * matches a signed npm release, but nothing proves the endpoint executing
 * `tools/call` IS that provenance-covered artifact. This module lets a Cloud Run
 * connector prove it: it mints a **Google-signed OIDC identity token** from the
 * instance metadata server, minted by the service's runtime SA, which the
 * governance layer verifies against a pinned fleet allowlist before allowing
 * attested execution.
 *
 * Anti-relay: the token is minted with `aud = DEPLOYMENT_IDENTITY_AUDIENCE` — the
 * connector's OWN canonical public origin, a fixed configured value, never
 * derived from the inbound request Host (which a proxy could spoof). The
 * governance layer requires `aud === originOf(endpoint)`, so a token copied from
 * this (unauthenticated) card cannot be replayed from a different endpoint.
 *
 * Best-effort and inert off Cloud Run: returns null when `K_SERVICE` is unset
 * (not Cloud Run), when `DEPLOYMENT_IDENTITY_AUDIENCE` is unconfigured, or on any
 * metadata error — the card is then served without a `deployment` block.
 */

const METADATA_BASE = "http://metadata.google.internal/computeMetadata/v1";
const METADATA_HEADER = { "Metadata-Flavor": "Google" } as const;
const METADATA_TIMEOUT_MS = 2000;
// Identity tokens are valid ~1h; refresh a little early.
const TOKEN_TTL_MS = 55 * 60 * 1000;

/** The `deployment` block served on the server-card. Snake_case per card style. */
export interface DeploymentIdentityBlock {
  service_account: string;
  project?: string;
  region?: string;
  revision?: string;
  image_digest?: string;
  identity_token: string;
}

interface CachedToken {
  token: string;
  audience: string;
  fetchedAtMs: number;
}
let tokenCache: CachedToken | null = null;

async function metadataText(path: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    const res = await fetch(`${METADATA_BASE}${path}`, {
      headers: METADATA_HEADER,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mint (or return a cached) identity token bound to `audience`. Cache is keyed
 * by audience so an audience change (reconfiguration) forces a fresh mint.
 */
async function mintIdentityToken(audience: string, nowMs: number): Promise<string | null> {
  if (
    tokenCache &&
    tokenCache.audience === audience &&
    nowMs - tokenCache.fetchedAtMs < TOKEN_TTL_MS
  ) {
    return tokenCache.token;
  }
  const token = await metadataText(
    `/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}&format=full`
  );
  if (!token) return null;
  tokenCache = { token, audience, fetchedAtMs: nowMs };
  return token;
}

/** Cloud Run `instance/region` returns `projects/<num>/regions/<region>`. */
function parseRegion(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const parts = raw.split("/");
  return parts[parts.length - 1] || undefined;
}

/**
 * Build the server-card `deployment` block, or null when it cannot / should not
 * be produced (not on Cloud Run, no configured audience, metadata unavailable).
 * Never throws.
 */
export async function buildDeploymentIdentity(): Promise<DeploymentIdentityBlock | null> {
  // Only Cloud Run has the metadata identity endpoint and a K_SERVICE marker.
  if (!process.env.K_SERVICE) return null;

  const audience = process.env.DEPLOYMENT_IDENTITY_AUDIENCE;
  if (!audience || audience.length === 0) return null;

  try {
    const nowMs = Date.now();
    const token = await mintIdentityToken(audience, nowMs);
    if (!token) return null;

    const [serviceAccount, project, regionRaw] = await Promise.all([
      metadataText("/instance/service-accounts/default/email"),
      metadataText("/project/project-id"),
      metadataText("/instance/region"),
    ]);
    if (!serviceAccount) return null;

    return {
      service_account: serviceAccount,
      project: project ?? undefined,
      region: parseRegion(regionRaw),
      revision: process.env.K_REVISION || undefined,
      // Tier-2 (S2): the running image digest, injected at deploy time. Optional
      // here — governance uses it only for the image-provenance cross-check.
      image_digest: process.env.CESTERAL_IMAGE_DIGEST || undefined,
      identity_token: token,
    };
  } catch {
    return null;
  }
}

/** Test-only: reset the module-level token cache. */
export function __resetDeploymentIdentityCacheForTest(): void {
  tokenCache = null;
}
