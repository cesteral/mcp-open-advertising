// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import pino from "pino";

// Mock the dynamic `@google-cloud/storage` import. `vi.mock` hoists, so the
// factory captures spies from a top-level `vi.hoisted` block.
const { mockSave, mockGetSignedUrl, mockDeleteFiles, mockStorageCtor } = vi.hoisted(() => {
  const save = vi.fn().mockResolvedValue(undefined);
  const getSignedUrl = vi.fn().mockResolvedValue(["https://signed.example/object"]);
  const deleteFiles = vi.fn().mockResolvedValue(undefined);
  const fileFn = vi.fn((_path: string) => ({ save, getSignedUrl }));
  const bucketFn = vi.fn((_name: string) => ({
    file: fileFn,
    deleteFiles,
  }));
  const ctor = vi.fn(function (this: any) {
    this.bucket = bucketFn;
  });
  return {
    mockSave: save,
    mockGetSignedUrl: getSignedUrl,
    mockDeleteFiles: deleteFiles,
    mockStorageCtor: ctor,
  };
});

vi.mock("@google-cloud/storage", () => ({
  Storage: mockStorageCtor,
}));

import {
  REPORT_SPILL_ENV,
  deleteSpilledObjectsForSession,
  spillCsvToGcs,
} from "../../src/utils/report-spill.js";

const logger = pino({ level: "silent" });

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("spillCsvToGcs", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of Object.values(REPORT_SPILL_ENV)) {
      originalEnv[name] = process.env[name];
      delete process.env[name];
    }
    mockSave.mockClear();
    mockGetSignedUrl.mockClear();
    mockGetSignedUrl.mockResolvedValue(["https://signed.example/object"]);
    mockSave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(originalEnv)) setEnv({ [k]: v });
  });

  it("returns disabled when REPORT_SPILL_BUCKET is not set", async () => {
    const result = await spillCsvToGcs({
      csv: "a,b\n1,2\n".repeat(10_000),
      server: "ttd",
      reportId: "r-1",
      logger,
    });
    expect(result).toEqual({ disabled: true, reason: "bucket-not-set" });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("returns disabled under both byte and row thresholds", async () => {
    setEnv({ [REPORT_SPILL_ENV.BUCKET]: "test-bucket" });
    const result = await spillCsvToGcs({
      csv: "a,b\n1,2\n",
      server: "ttd",
      reportId: "r-1",
      rowCount: 1,
      logger,
    });
    expect(result).toEqual({ disabled: true, reason: "under-threshold" });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("spills when byte threshold exceeded", async () => {
    setEnv({
      [REPORT_SPILL_ENV.BUCKET]: "test-bucket",
      [REPORT_SPILL_ENV.THRESHOLD_BYTES]: "100",
    });
    const result = await spillCsvToGcs({
      csv: "a,b\n1,2\n".repeat(100),
      server: "ttd",
      reportId: "r-1",
      sessionId: "s-1",
      rowCount: 10,
      logger,
    });
    expect(result).toMatchObject({ spilled: true, bucket: "test-bucket" });
    if ("spilled" in result && result.spilled) {
      expect(result.objectName).toMatch(/^ttd\/s-1\/r-1-/);
      expect(result.signedUrl).toBe("https://signed.example/object");
      expect(result.mimeType).toBe("text/csv");
      expect(result.expiresAt).toBeDefined();
      expect(result.bytes).toBeGreaterThan(100);
    }
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockGetSignedUrl).toHaveBeenCalledWith({
      action: "read",
      expires: expect.any(Number),
    });
  });

  it("spills when row threshold exceeded", async () => {
    setEnv({
      [REPORT_SPILL_ENV.BUCKET]: "test-bucket",
      [REPORT_SPILL_ENV.THRESHOLD_ROWS]: "50",
    });
    const result = await spillCsvToGcs({
      csv: "tiny\n",
      server: "pinterest",
      reportId: "r-2",
      rowCount: 100,
      logger,
    });
    expect(result).toMatchObject({ spilled: true, rowCount: 100 });
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("honors explicit options over env overrides", async () => {
    setEnv({
      [REPORT_SPILL_ENV.BUCKET]: "test-bucket",
      [REPORT_SPILL_ENV.THRESHOLD_BYTES]: "1000000",
    });
    const result = await spillCsvToGcs({
      csv: "a,b\n1,2\n",
      server: "ttd",
      reportId: "r-3",
      thresholdBytes: 5, // tiny — forces spill
      rowCount: 1,
      logger,
    });
    expect(result).toMatchObject({ spilled: true });
  });

  it("returns { error } and does not throw when save fails", async () => {
    setEnv({
      [REPORT_SPILL_ENV.BUCKET]: "test-bucket",
      [REPORT_SPILL_ENV.THRESHOLD_BYTES]: "10",
    });
    mockSave.mockRejectedValueOnce(new Error("gcs down"));
    const result = await spillCsvToGcs({
      csv: "a,b\n1,2\n".repeat(100),
      server: "ttd",
      reportId: "r-4",
      logger,
    });
    expect(result).toEqual({ error: "gcs down" });
  });

  it("uses application/json content type when mimeType indicates JSON", async () => {
    setEnv({
      [REPORT_SPILL_ENV.BUCKET]: "test-bucket",
      [REPORT_SPILL_ENV.THRESHOLD_BYTES]: "10",
    });
    const result = await spillCsvToGcs({
      csv: JSON.stringify({ x: 1 }).repeat(100),
      mimeType: "application/json",
      server: "amazonDsp",
      reportId: "r-5",
      logger,
    });
    expect(mockSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ contentType: "application/json" })
    );
    if ("spilled" in result && result.spilled) {
      expect(result.objectName).toMatch(/\.json$/);
    }
  });

  it("respects signedUrlTtlSeconds option for expires calculation", async () => {
    setEnv({
      [REPORT_SPILL_ENV.BUCKET]: "test-bucket",
      [REPORT_SPILL_ENV.THRESHOLD_BYTES]: "10",
    });
    const before = Date.now();
    await spillCsvToGcs({
      csv: "x".repeat(100),
      server: "ttd",
      reportId: "r-6",
      signedUrlTtlSeconds: 120,
      logger,
    });
    const call = mockGetSignedUrl.mock.calls[0]?.[0] as { expires: number };
    expect(call.expires).toBeGreaterThanOrEqual(before + 120 * 1000 - 1000);
    expect(call.expires).toBeLessThanOrEqual(before + 120 * 1000 + 5000);
  });

  it("sanitizes unsafe characters in sessionId and reportId", async () => {
    setEnv({
      [REPORT_SPILL_ENV.BUCKET]: "test-bucket",
      [REPORT_SPILL_ENV.THRESHOLD_BYTES]: "10",
    });
    const result = await spillCsvToGcs({
      csv: "x".repeat(100),
      server: "ttd",
      reportId: "rep/orted?id",
      sessionId: "sess/with../slash",
      logger,
    });
    if ("spilled" in result && result.spilled) {
      expect(result.objectName).not.toMatch(/\?/);
      expect(result.objectName).not.toMatch(/\.\.\//);
      expect(result.objectName).toMatch(/^ttd\/sess_with\.\._slash\//);
    }
  });
});

describe("deleteSpilledObjectsForSession", () => {
  const originalBucket = process.env[REPORT_SPILL_ENV.BUCKET];

  beforeEach(() => {
    delete process.env[REPORT_SPILL_ENV.BUCKET];
    mockDeleteFiles.mockClear();
    mockDeleteFiles.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setEnv({ [REPORT_SPILL_ENV.BUCKET]: originalBucket });
  });

  it("is a no-op when REPORT_SPILL_BUCKET is not set", async () => {
    const count = await deleteSpilledObjectsForSession("ttd", "s-1", logger);
    expect(count).toBe(0);
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it("deletes all objects under the server/session prefix", async () => {
    process.env[REPORT_SPILL_ENV.BUCKET] = "test-bucket";
    const count = await deleteSpilledObjectsForSession("ttd", "s-1", logger);
    expect(count).toBe(1);
    expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: "ttd/s-1/" });
  });

  it("swallows errors from the GCS API", async () => {
    process.env[REPORT_SPILL_ENV.BUCKET] = "test-bucket";
    mockDeleteFiles.mockRejectedValueOnce(new Error("permissions"));
    const count = await deleteSpilledObjectsForSession("ttd", "s-1", logger);
    expect(count).toBe(0);
  });

  it("sanitizes unsafe characters in sessionId", async () => {
    process.env[REPORT_SPILL_ENV.BUCKET] = "test-bucket";
    await deleteSpilledObjectsForSession("ttd", "sess/with../slash", logger);
    expect(mockDeleteFiles).toHaveBeenCalledWith({
      prefix: "ttd/sess_with.._slash/",
    });
  });
});
