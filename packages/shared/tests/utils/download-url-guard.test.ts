// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { assertSafeDownloadUrl, checkDownloadUrl } from "../../src/utils/download-url-guard.js";
import { McpError, JsonRpcErrorCode } from "../../src/utils/mcp-errors.js";

const GOOGLE = { allowedHostSuffixes: ["googleapis.com"] };

describe("checkDownloadUrl — generic checks", () => {
  it.each([
    "https://download.api.bingads.microsoft.com/reports/abc.zip",
    "https://my-bucket.s3.us-east-1.amazonaws.com/report.csv?X-Amz-Signature=abc",
    "https://www.googleapis.com/dfareporting/v5/reports/1/files/2?alt=media",
  ])("accepts public https URL %s", (url) => {
    expect(checkDownloadUrl(url)).toBeNull();
  });

  it.each([
    ["http://example.com/r.csv", "https"],
    ["file:///etc/passwd", "https"],
    ["not a url", "valid URL"],
    ["https://user:pw@example.com/r.csv", "credentials"],
    ["https://169.254.169.254/computeMetadata/v1/", "IP address"],
    ["https://127.0.0.1/r.csv", "IP address"],
    ["https://2130706433/r.csv", "IP address"],
    ["https://[::1]/r.csv", "IP address"],
    ["https://localhost/r.csv", "not a public host"],
    ["https://metadata.google.internal/computeMetadata/v1/", "not a public host"],
    ["https://svc.cluster.local/r.csv", "not a public host"],
    ["https://intranet/r.csv", "not a public host"],
  ])("rejects %s", (url, reason) => {
    expect(checkDownloadUrl(url)).toContain(reason);
  });
});

describe("checkDownloadUrl — host allowlist", () => {
  it("admits the suffix itself and its subdomains", () => {
    expect(checkDownloadUrl("https://googleapis.com/x", GOOGLE)).toBeNull();
    expect(checkDownloadUrl("https://www.googleapis.com/x", GOOGLE)).toBeNull();
    expect(checkDownloadUrl("https://WWW.GoogleApis.com./x", GOOGLE)).toBeNull();
  });

  // The failure this exists for: a bearer token sent to a host the caller chose.
  it.each([
    "https://attacker.example/steal",
    "https://googleapis.com.attacker.example/x",
    "https://evilgoogleapis.com/x",
  ])("rejects %s", (url) => {
    expect(checkDownloadUrl(url, GOOGLE)).toContain("not an allowed report host");
  });
});

describe("assertSafeDownloadUrl", () => {
  it("throws InvalidParams naming the tool", () => {
    try {
      assertSafeDownloadUrl("https://attacker.example/x", {
        ...GOOGLE,
        toolName: "cm360_download_report",
      });
      expect.fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(JsonRpcErrorCode.InvalidParams);
      expect((error as McpError).message).toContain("cm360_download_report");
    }
  });

  it("returns for an acceptable URL", () => {
    expect(() => assertSafeDownloadUrl("https://www.googleapis.com/x", GOOGLE)).not.toThrow();
  });
});
