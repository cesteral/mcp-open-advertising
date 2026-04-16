// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { mapReportingError, ReportingError } from "../../src/utils/report-errors.js";

describe("mapReportingError", () => {
  it("wraps HTTP 429 as retryable", () => {
    const err = mapReportingError({ response: { status: 429 } }, "ttd");
    expect(err).toBeInstanceOf(ReportingError);
    expect(err.platform).toBe("ttd");
    expect(err.upstreamCode).toBe(429);
    expect(err.retryable).toBe(true);
  });

  it("marks 5xx as retryable", () => {
    const err = mapReportingError({ response: { status: 503 } }, "meta");
    expect(err.retryable).toBe(true);
  });

  it("marks 4xx (non-429) as non-retryable", () => {
    const err = mapReportingError({ response: { status: 400 } }, "google");
    expect(err.retryable).toBe(false);
  });

  it("maps TTD error envelope", () => {
    const err = mapReportingError(
      {
        response: {
          status: 400,
          data: { ErrorCode: "InvalidArg", Message: "bad request" },
        },
      },
      "ttd",
    );
    expect(err.upstreamCode).toBe("InvalidArg");
    expect(err.message).toBe("bad request");
    expect(err.retryable).toBe(false);
  });

  it("maps Meta FB error", () => {
    const err = mapReportingError(
      {
        response: {
          status: 400,
          data: { error: { code: 100, message: "Permission denied" } },
        },
      },
      "meta",
    );
    expect(err.upstreamCode).toBe(100);
    expect(err.message).toBe("Permission denied");
  });

  it("maps Google RPC status envelope", () => {
    const err = mapReportingError(
      {
        response: {
          status: 403,
          data: { error: { status: "PERMISSION_DENIED", message: "nope" } },
        },
      },
      "google",
    );
    expect(err.upstreamCode).toBe("PERMISSION_DENIED");
    expect(err.message).toBe("nope");
  });

  it("maps Microsoft Errors envelope", () => {
    const err = mapReportingError(
      {
        response: {
          status: 400,
          data: { Errors: [{ Code: "AuthenticationTokenExpired", Message: "expired" }] },
        },
      },
      "microsoft",
    );
    expect(err.upstreamCode).toBe("AuthenticationTokenExpired");
    expect(err.message).toBe("expired");
  });

  it("preserves an existing ReportingError unchanged", () => {
    const original = new ReportingError("test", {
      platform: "ttd",
      upstreamCode: 1,
      retryable: false,
    });
    expect(mapReportingError(original, "ttd")).toBe(original);
  });

  it("falls back to message when no envelope matches", () => {
    const err = mapReportingError(new Error("network down"), "linkedin");
    expect(err.message).toBe("network down");
    expect(err.platform).toBe("linkedin");
  });
});
