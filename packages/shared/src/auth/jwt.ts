// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { createHash } from "node:crypto";
import * as jose from "jose";
import { McpError, JsonRpcErrorCode } from "../utils/mcp-errors.js";

export interface JwtPayload {
  sub: string; // User ID
  iss: string; // Issuer
  aud: string; // Audience
  exp: number; // Expiration
  iat: number; // Issued at
  scope?: string; // Optional scope
  allowed_advertisers?: string[];
}

/** RFC 8707: prefer MCP_RESOURCE_URI as audience (the server's resource indicator) */
function getJwtAudience(): string {
  return process.env.MCP_RESOURCE_URI || "cesteral-services";
}

function getJwtIssuer(): string {
  return process.env.JWT_ISSUER || "cesteral-mcp";
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  try {
    const secretKey = new TextEncoder().encode(secret);

    const { payload } = await jose.jwtVerify(token, secretKey, {
      // Pin the accepted algorithm. jose already infers HS* from the symmetric
      // key (so `alg: "none"` and RS/HS confusion are rejected), but stating it
      // explicitly makes the single supported algorithm auditable and defends
      // against a future key-type change silently widening what is accepted.
      algorithms: ["HS256"],
      issuer: getJwtIssuer(),
      audience: getJwtAudience(),
    });

    return payload as JwtPayload;
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw new McpError(JsonRpcErrorCode.Unauthorized, "Token has expired");
    }
    if (error instanceof jose.errors.JWTInvalid) {
      throw new McpError(JsonRpcErrorCode.Unauthorized, "Invalid token");
    }
    throw new McpError(JsonRpcErrorCode.Unauthorized, "Token verification failed");
  }
}

/**
 * Decode a JWT payload without cryptographic verification.
 * Used for lightweight operations (e.g., fingerprinting on session reuse)
 * where the token was already fully verified at session creation.
 */
export function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new McpError(JsonRpcErrorCode.Unauthorized, "Malformed JWT: expected 3 segments");
  }
  try {
    const decoded = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    throw new McpError(JsonRpcErrorCode.Unauthorized, "Malformed JWT: unable to decode payload");
  }
}

/**
 * Create a stable credential fingerprint from a JWT's identity AND authorization
 * claims.
 *
 * The fingerprint is what `validateSessionReuse` compares on the hot path, and a
 * match means the existing session — including its cached auth context — is
 * reused as-is. `allowedAdvertisers` is captured into that context only when a
 * session is created or rebuilt (`setAuthContext` in the transport factory), so
 * whatever the fingerprint ignores cannot take effect until the session goes.
 *
 * Fingerprinting `iss:sub` alone therefore made authorization changes inert: a
 * validly signed, unexpired token reissued for the same subject with NARROWED
 * `allowed_advertisers` produced an identical fingerprint, passed reuse, and the
 * session kept enforcing the original, broader scope at the `allowedAdvertisers`
 * check in `tool-handler-factory`. Because `touchSession` extends the idle
 * timeout on every request, an actively-used session never ages out — so the
 * stale scope persisted indefinitely, not for some bounded window.
 * (Security review H-4.)
 *
 * Including the authorization-bearing claims makes a scope change produce a
 * different fingerprint, which fails reuse with 401 and forces a rebuild that
 * re-reads the scope. Fail-closed and self-healing: the next request
 * re-authenticates and picks up the new scope.
 *
 * Deliberately NOT included: `exp` / `iat`. A routine token refresh that keeps
 * the same scope should keep reusing its session — binding to those would tear
 * down and rebuild on every refresh (an upstream `validate()` each time) for no
 * security gain. Expiry and signature are enforced separately and on every
 * reuse: `JwtBearerAuthStrategy.getCredentialFingerprint` calls `verifyJwt`,
 * not `decodeJwtPayload`, so an expired or forged token is rejected before the
 * fingerprint is ever compared.
 *
 * `allowed_advertisers` is sorted so claim ordering alone cannot force a
 * spurious rebuild, and the parts are JSON-encoded rather than joined with a
 * delimiter so no advertiser id or scope string containing the separator can
 * alias a different claim set into the same fingerprint.
 */
export function getJwtCredentialFingerprint(payload: JwtPayload): string {
  const material = JSON.stringify([
    payload.iss,
    payload.sub,
    payload.scope ?? null,
    payload.allowed_advertisers ? [...payload.allowed_advertisers].sort() : null,
  ]);
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Create a new JWT token (for testing/development)
 */
export async function createJwt(
  userId: string,
  secret: string,
  expiresIn: string = "24h"
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);

  const token = await new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(getJwtIssuer())
    .setAudience(getJwtAudience())
    .setExpirationTime(expiresIn)
    .sign(secretKey);

  return token;
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader?: string): string {
  if (!authHeader) {
    throw new McpError(JsonRpcErrorCode.Unauthorized, "Missing Authorization header");
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    throw new McpError(
      JsonRpcErrorCode.Unauthorized,
      "Invalid Authorization header format. Expected: Bearer <token>"
    );
  }

  return parts[1];
}
