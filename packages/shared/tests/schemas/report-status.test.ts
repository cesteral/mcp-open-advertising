// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import {
  ReportStatusSchema,
  fromTtdStatus,
  fromMetaStatus,
  fromGoogleStatus,
  fromMicrosoftStatus,
} from "../../src/schemas/report-status.js";

describe("ReportStatusSchema", () => {
  it("validates a complete status", () => {
    const parsed = ReportStatusSchema.parse({
      state: "complete",
      submittedAt: "2026-04-16T12:00:00Z",
      completedAt: "2026-04-16T12:01:00Z",
      downloadUrl: "https://example.com/report.csv",
    });
    expect(parsed.state).toBe("complete");
  });

  it("rejects invalid state", () => {
    expect(() => ReportStatusSchema.parse({ state: "weird" })).toThrow();
  });
});

describe("fromTtdStatus", () => {
  it("maps Complete", () => {
    expect(fromTtdStatus({ ExecutionState: "Complete" }).state).toBe("complete");
  });
  it("maps Failed", () => {
    expect(fromTtdStatus({ ExecutionState: "Failed" }).state).toBe("failed");
  });
  it("maps InProgress", () => {
    expect(fromTtdStatus({ ExecutionState: "InProgress" }).state).toBe("running");
  });
  it("propagates ReportDownloadUrl", () => {
    expect(
      fromTtdStatus({
        ExecutionState: "Complete",
        ReportDownloadUrl: "https://ttd/report.csv",
      }).downloadUrl,
    ).toBe("https://ttd/report.csv");
  });
});

describe("fromMetaStatus", () => {
  it("maps Job Completed", () => {
    expect(fromMetaStatus({ async_status: "Job Completed" }).state).toBe("complete");
  });
  it("maps Job Failed", () => {
    expect(fromMetaStatus({ async_status: "Job Failed" }).state).toBe("failed");
  });
  it("maps Job Running", () => {
    expect(fromMetaStatus({ async_status: "Job Running" }).state).toBe("running");
  });
  it("converts percent to progress", () => {
    expect(
      fromMetaStatus({ async_status: "Job Running", async_percent_completion: 50 })
        .progress,
    ).toBe(0.5);
  });
});

describe("fromGoogleStatus", () => {
  it("maps done:true", () => {
    expect(fromGoogleStatus({ done: true }).state).toBe("complete");
  });
  it("maps done:false", () => {
    expect(fromGoogleStatus({ done: false }).state).toBe("running");
  });
  it("maps error presence to failed", () => {
    const status = fromGoogleStatus({ done: true, error: { message: "boom" } });
    expect(status.state).toBe("failed");
    expect(status.errors).toEqual(["boom"]);
  });
});

describe("fromMicrosoftStatus", () => {
  it("maps Success", () => {
    expect(fromMicrosoftStatus({ ReportRequestStatus: "Success" }).state).toBe("complete");
  });
  it("maps Error", () => {
    expect(fromMicrosoftStatus({ ReportRequestStatus: "Error" }).state).toBe("failed");
  });
  it("maps Pending to running", () => {
    expect(fromMicrosoftStatus({ ReportRequestStatus: "Pending" }).state).toBe("running");
  });
  it("propagates ReportDownloadUrl", () => {
    expect(
      fromMicrosoftStatus({
        ReportRequestStatus: "Success",
        ReportDownloadUrl: "https://bingads/r.csv",
      }).downloadUrl,
    ).toBe("https://bingads/r.csv");
  });
});
