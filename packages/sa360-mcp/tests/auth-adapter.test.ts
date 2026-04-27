import { describe, it, expect } from "vitest";
import {
  parseSA360CredentialsFromHeaders,
  getSA360CredentialFingerprint,
} from "../src/auth/sa360-auth-adapter.js";

describe("SA360 Auth Adapter", () => {
  describe("parseSA360CredentialsFromHeaders", () => {
    it("should parse valid credentials from headers", () => {
      const headers: Record<string, string> = {
        "x-sa360-client-id": "test-client-id",
        "x-sa360-client-secret": "test-client-secret",
        "x-sa360-refresh-token": "test-refresh-token",
      };

      const creds = parseSA360CredentialsFromHeaders(headers);
      expect(creds.clientId).toBe("test-client-id");
      expect(creds.clientSecret).toBe("test-client-secret");
      expect(creds.refreshToken).toBe("test-refresh-token");
      expect(creds.loginCustomerId).toBeUndefined();
    });

    it("should parse optional loginCustomerId", () => {
      const headers: Record<string, string> = {
        "x-sa360-client-id": "test-client-id",
        "x-sa360-client-secret": "test-client-secret",
        "x-sa360-refresh-token": "test-refresh-token",
        "x-sa360-login-customer-id": "1234567890",
      };

      const creds = parseSA360CredentialsFromHeaders(headers);
      expect(creds.loginCustomerId).toBe("1234567890");
    });

    it("should throw when client-id is missing", () => {
      const headers: Record<string, string> = {
        "x-sa360-client-secret": "test-client-secret",
        "x-sa360-refresh-token": "test-refresh-token",
      };

      expect(() => parseSA360CredentialsFromHeaders(headers)).toThrow(
        "Missing required header: X-SA360-Client-Id"
      );
    });

    it("should throw when client-secret is missing", () => {
      const headers: Record<string, string> = {
        "x-sa360-client-id": "test-client-id",
        "x-sa360-refresh-token": "test-refresh-token",
      };

      expect(() => parseSA360CredentialsFromHeaders(headers)).toThrow(
        "Missing required header: X-SA360-Client-Secret"
      );
    });

    it("should throw when refresh-token is missing", () => {
      const headers: Record<string, string> = {
        "x-sa360-client-id": "test-client-id",
        "x-sa360-client-secret": "test-client-secret",
      };

      expect(() => parseSA360CredentialsFromHeaders(headers)).toThrow(
        "Missing required header: X-SA360-Refresh-Token"
      );
    });
  });

  describe("getSA360CredentialFingerprint", () => {
    it("should return a 32-character hex fingerprint", () => {
      const fingerprint = getSA360CredentialFingerprint({
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        refreshToken: "test-refresh-token",
      });

      expect(fingerprint).toHaveLength(32);
      expect(fingerprint).toMatch(/^[0-9a-f]+$/);
    });

    it("should produce same fingerprint for same client ID", () => {
      const creds = {
        clientId: "same-id",
        clientSecret: "secret-1",
        refreshToken: "token-1",
      };
      const creds2 = {
        clientId: "same-id",
        clientSecret: "secret-2",
        refreshToken: "token-2",
      };

      expect(getSA360CredentialFingerprint(creds)).toBe(getSA360CredentialFingerprint(creds2));
    });

    it("should produce different fingerprint for different client IDs", () => {
      const creds1 = {
        clientId: "id-1",
        clientSecret: "secret",
        refreshToken: "token",
      };
      const creds2 = {
        clientId: "id-2",
        clientSecret: "secret",
        refreshToken: "token",
      };

      expect(getSA360CredentialFingerprint(creds1)).not.toBe(getSA360CredentialFingerprint(creds2));
    });
  });
});
