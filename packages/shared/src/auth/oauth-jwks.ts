// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `oauth` auth mode: access tokens issued by an external OAuth 2.1
 * authorization server, verified against that server's JWKS (#246, option A).
 *
 * Boundary: this verifies tokens. It does not issue them. A compatible
 * authorization server (PKCE, RFC 8707 `resource`, ideally Client ID Metadata
 * Documents) must provide the client authorization flow and token issuance;
 * this repo supplies neither.
 *
 * Separate from the `jwt` mode (HS256 shared secret, service-to-service).
 * The two never fall back to each other: `oauth` accepts asymmetric
 * signatures only and holds no shared secret, `jwt` accepts HS256 only and
 * holds no JWKS, and a token rejected by one is never retried against the other.
 *
 * Trust anchors come only from configuration, never from the token:
 * `MCP_OAUTH_ISSUER` (the required `iss`), `MCP_JWKS_URI` (where signing keys
 * are fetched) and `MCP_RESOURCE_URI` (the required `aud`, RFC 8707). A token
 * carrying `jku`, `jwk` or `x5u` headers is rejected outright.
 */

import * as jose from "jose";
import type { Logger } from "pino";
import { McpError, JsonRpcErrorCode } from "../utils/mcp-errors.js";
import type { AuthResult, AuthStrategy } from "./auth-strategy.js";
import { extractBearerToken, getJwtCredentialFingerprint, type JwtPayload } from "./jwt.js";

/**
 * Asymmetric algorithms accepted. An explicit allow-list: `none` and every
 * HS* algorithm are absent, so an attacker cannot make the verifier treat a
 * public key as an HMAC secret (algorithm confusion).
 */
export const OAUTH_ALLOWED_ALGORITHMS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
] as const;

/** Header parameters that tell a verifier to trust key material named by the token. */
const FORBIDDEN_HEADER_PARAMS = ["jku", "jwk", "x5u", "x5c"] as const;

export interface OAuthJwksConfig {
  /** Required `iss`. Exact string match (RFC 9207 / RFC 8414 issuer identifier). */
  issuer: string;
  /** Where signing keys are fetched. Configured, never read from a token. */
  jwksUri: string;
  /** Required `aud`: the canonical resource URI of this server (RFC 8707). */
  audience: string;
  /** Allowed clock skew when checking `exp` / `nbf`, in seconds. Default 5. */
  clockToleranceSec?: number;
  /** Minimum ms between JWKS refetches (bounds refetch on an unknown `kid`). Default 30s. */
  cooldownMs?: number;
  /** Max age of the cached key set in ms before a refresh. Default 10 min. */
  cacheMaxAgeMs?: number;
  /** JWKS HTTP timeout in ms. Default 5s. */
  timeoutMs?: number;
}

function isHttpsOrLoopback(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

/**
 * Read and validate the `oauth` mode settings. Throws on anything missing or
 * malformed: a server that cannot verify tokens must not start, rather than
 * start and guess (no default audience, no default issuer).
 */
export function loadOAuthJwksConfig(
  env: Record<string, string | undefined> = process.env
): OAuthJwksConfig {
  const issuer = env.MCP_OAUTH_ISSUER?.trim();
  const jwksUri = env.MCP_JWKS_URI?.trim();
  const audience = env.MCP_RESOURCE_URI?.trim();
  const problems: string[] = [];

  if (!issuer || !isHttpsOrLoopback(issuer)) {
    problems.push("MCP_OAUTH_ISSUER must be the authorization server's https issuer URL");
  }
  if (!jwksUri || !isHttpsOrLoopback(jwksUri)) {
    problems.push("MCP_JWKS_URI must be an https URL (http only for localhost)");
  }
  if (!audience || !isHttpsOrLoopback(audience)) {
    problems.push(
      "MCP_RESOURCE_URI must be this server's canonical https resource URI (it is the required token audience)"
    );
  }
  if (problems.length > 0) {
    throw new Error(`MCP_AUTH_MODE=oauth is misconfigured: ${problems.join("; ")}`);
  }
  return { issuer: issuer!, jwksUri: jwksUri!, audience: audience! };
}

export type OAuthTokenVerifier = (token: string) => Promise<JwtPayload>;

/** Scopes from a verified token: `scope` (RFC 9068, space-delimited) or `scp` (string or array). */
export function scopesFromClaims(payload: Record<string, unknown>): string[] {
  const raw = payload.scope ?? payload.scp;
  if (typeof raw === "string") return raw.split(" ").filter(Boolean);
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  return [];
}

/** Fingerprint over the normalized scope set, so `scp`-style tokens bind to their scopes too. */
function fingerprintOf(payload: JwtPayload): string {
  const scope = scopesFromClaims(payload as unknown as Record<string, unknown>)
    .sort()
    .join(" ");
  return getJwtCredentialFingerprint({ ...payload, scope: scope || undefined });
}

/**
 * Build a verifier bound to one issuer, JWKS endpoint and audience. The key
 * set is cached and refreshed on expiry; an unknown `kid` triggers one refetch
 * per cooldown window, which is how key rotation is picked up without letting
 * an attacker turn arbitrary `kid` values into upstream requests.
 */
export function createOAuthJwksVerifier(config: OAuthJwksConfig): OAuthTokenVerifier {
  const keys = jose.createRemoteJWKSet(new URL(config.jwksUri), {
    cooldownDuration: config.cooldownMs ?? 30_000,
    cacheMaxAge: config.cacheMaxAgeMs ?? 600_000,
    timeoutDuration: config.timeoutMs ?? 5_000,
  });

  return async (token: string): Promise<JwtPayload> => {
    try {
      const header = jose.decodeProtectedHeader(token);
      for (const param of FORBIDDEN_HEADER_PARAMS) {
        if (param in header) {
          throw new McpError(
            JsonRpcErrorCode.Unauthorized,
            `Invalid token: "${param}" header is not accepted`
          );
        }
      }

      const { payload } = await jose.jwtVerify(token, keys, {
        algorithms: [...OAUTH_ALLOWED_ALGORITHMS],
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: ["sub", "exp", "iat"],
        clockTolerance: config.clockToleranceSec ?? 5,
      });

      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new McpError(JsonRpcErrorCode.Unauthorized, "Invalid token");
      }
      const advertisers = payload.allowed_advertisers;
      if (
        advertisers !== undefined &&
        !(Array.isArray(advertisers) && advertisers.every((a) => typeof a === "string"))
      ) {
        throw new McpError(JsonRpcErrorCode.Unauthorized, "Invalid token");
      }
      return payload as unknown as JwtPayload;
    } catch (error) {
      if (error instanceof McpError) throw error;
      if (error instanceof jose.errors.JWTExpired) {
        throw new McpError(JsonRpcErrorCode.Unauthorized, "Token has expired");
      }
      throw new McpError(JsonRpcErrorCode.Unauthorized, "Token verification failed");
    }
  };
}

/**
 * Bearer-token strategy for `MCP_AUTH_MODE=oauth`. Produces `authType: "oauth"`
 * so scope enforcement (`mcp:read` / `mcp:write`) applies to every caller.
 */
export class OAuthJwksAuthStrategy implements AuthStrategy {
  private readonly verifyToken: OAuthTokenVerifier;

  constructor(
    config: OAuthJwksConfig,
    private readonly logger?: Logger
  ) {
    this.verifyToken = createOAuthJwksVerifier(config);
  }

  private async payloadFrom(
    headers: Record<string, string | string[] | undefined>
  ): Promise<JwtPayload> {
    const raw = headers["authorization"];
    const authHeader = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
    return this.verifyToken(extractBearerToken(authHeader));
  }

  async verify(headers: Record<string, string | string[] | undefined>): Promise<AuthResult> {
    const payload = await this.payloadFrom(headers);
    this.logger?.debug({ sub: payload.sub, iss: payload.iss }, "OAuth access token validated");
    return {
      authInfo: {
        clientId: payload.sub,
        subject: payload.sub,
        authType: "oauth",
        scopes: scopesFromClaims(payload as unknown as Record<string, unknown>),
      },
      credentialFingerprint: fingerprintOf(payload),
      allowedAdvertisers: payload.allowed_advertisers,
    };
  }

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    return fingerprintOf(await this.payloadFrom(headers));
  }
}
