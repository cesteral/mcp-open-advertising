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

/**
 * Verify and decode a JWT token
 */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    // RFC 8707: prefer MCP_RESOURCE_URI as audience (the server's resource indicator)
    const audience =
      process.env.MCP_RESOURCE_URI ||
      process.env.JWT_AUDIENCE ||
      "cesteral-services";

    const { payload } = await jose.jwtVerify(token, secretKey, {
      issuer: process.env.JWT_ISSUER || "cesteral-mcp",
      audience,
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
 * Create a stable credential fingerprint from JWT identity claims.
 */
export function getJwtCredentialFingerprint(payload: JwtPayload): string {
  return createHash("sha256")
    .update(`${payload.iss}:${payload.sub}`)
    .digest("hex");
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
    .setIssuer(process.env.JWT_ISSUER || "cesteral-mcp")
    .setAudience(process.env.MCP_RESOURCE_URI || process.env.JWT_AUDIENCE || "cesteral-services")
    .setExpirationTime(expiresIn)
    .sign(secretKey);

  return token;
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader?: string): string {
  if (!authHeader) {
    throw new McpError(JsonRpcErrorCode.Unauthorized,"Missing Authorization header");
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new McpError(JsonRpcErrorCode.Unauthorized,"Invalid Authorization header format. Expected: Bearer <token>");
  }

  return parts[1];
}
