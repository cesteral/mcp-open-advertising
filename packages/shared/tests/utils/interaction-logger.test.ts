import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  InteractionLogger,
  generateEntryId,
  sanitizeParams,
} from "../../src/utils/interaction-logger.js";

// ---------------------------------------------------------------------------
// GCS mock — maintained at module level so vi.mock hoisting works correctly
// ---------------------------------------------------------------------------

const gcsFiles = new Map<string, string>();

vi.mock("@google-cloud/storage", () => ({
  Storage: vi.fn().mockImplementation(() => ({
    bucket: vi.fn().mockReturnValue({
      file: vi.fn().mockImplementation((objectPath: string) => ({
        download: vi.fn().mockImplementation(async () => {
          const content = gcsFiles.get(objectPath);
          if (!content) {
            const err: any = new Error("Not found");
            err.code = 404;
            throw err;
          }
          return [Buffer.from(content)];
        }),
        save: vi.fn().mockImplementation(async (content: string) => {
          gcsFiles.set(objectPath, content);
        }),
      })),
    }),
  })),
}));

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "shared-interaction-logger-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  gcsFiles.clear();
});

describe("generateEntryId", () => {
  it("changes when requestId or nonce changes", () => {
    const base = {
      ts: "2026-02-19T21:00:00.000Z",
      sessionId: "session-1",
      tool: "ttd_update_entity",
    };

    const idA = generateEntryId({ ...base, requestId: "req-1", nonce: 0 });
    const idB = generateEntryId({ ...base, requestId: "req-2", nonce: 0 });
    const idC = generateEntryId({ ...base, requestId: "req-1", nonce: 1 });

    expect(idA).not.toBe(idB);
    expect(idA).not.toBe(idC);
  });
});

describe("sanitizeParams", () => {
  it("redacts x-ttd-partner-id header", () => {
    const result = sanitizeParams({ "x-ttd-partner-id": "abc123" }) as Record<string, unknown>;
    expect(result["x-ttd-partner-id"]).toBe("[REDACTED]");
  });
});

describe("InteractionLogger", () => {
  it("generates unique ids for same ts/session/tool entries", async () => {
    const dataDir = createTempDir();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
      level: "debug",
    } as any;

    const interactionLogger = new InteractionLogger({
      dataDir,
      serverName: "test-server",
      logger,
    });

    const ts = "2026-02-19T21:00:00.000Z";
    interactionLogger.append({
      ts,
      sessionId: "session-1",
      tool: "ttd_update_entity",
      params: { a: 1 },
      success: true,
      durationMs: 1,
    });
    interactionLogger.append({
      ts,
      sessionId: "session-1",
      tool: "ttd_update_entity",
      params: { a: 1 },
      success: true,
      durationMs: 1,
    });
    await interactionLogger.close();

    const files = readdirSync(dataDir);
    expect(files.length).toBe(1);

    const lines = readFileSync(join(dataDir, files[0]), "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { id: string });

    expect(lines.length).toBe(2);
    expect(lines[0].id).not.toBe(lines[1].id);
  });

  it("logFailure emits a tool_failure record with upstream trail", async () => {
    const dataDir = createTempDir();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
      level: "debug",
    } as any;

    const interactionLogger = new InteractionLogger({
      dataDir,
      serverName: "test-server",
      logger,
    });

    interactionLogger.logFailure({
      ts: "2026-02-19T21:00:00.000Z",
      sessionId: "session-1",
      tool: "ttd_update_entity",
      params: { advertiserId: "adv-1" },
      durationMs: 12,
      errorCode: -32001,
      errorMessage: "400 Bad Request",
      upstream: [
        {
          method: "POST",
          url: "https://api.thetradedesk.com/v3/campaign",
          status: 400,
          durationMs: 11,
          attempt: 0,
          responseBodyRedacted: '{"Message":"Invalid advertiser id"}',
        },
      ],
    });
    await interactionLogger.close();

    const files = readdirSync(dataDir);
    expect(files.length).toBe(1);
    const entry = JSON.parse(readFileSync(join(dataDir, files[0]), "utf-8").trim()) as {
      type: string;
      success: boolean;
      upstream: Array<{ status: number }>;
      errorCode: number;
    };

    expect(entry.type).toBe("tool_failure");
    expect(entry.success).toBe(false);
    expect(entry.upstream[0].status).toBe(400);
    expect(entry.errorCode).toBe(-32001);
  });

  it("stdout mode emits entries via the injected logger instead of writing files", () => {
    const dataDir = createTempDir();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
      level: "debug",
    } as any;

    const interactionLogger = new InteractionLogger({
      dataDir,
      serverName: "test-server",
      logger,
      mode: "stdout",
    });

    interactionLogger.append({
      type: "tool_call",
      ts: "2026-02-19T21:00:00.000Z",
      sessionId: "session-1",
      tool: "ttd_list_entities",
      params: {},
      success: true,
      durationMs: 3,
    });
    interactionLogger.logFailure({
      ts: "2026-02-19T21:00:01.000Z",
      sessionId: "session-1",
      tool: "ttd_update_entity",
      params: {},
      durationMs: 4,
      errorMessage: "boom",
    });

    expect(readdirSync(dataDir)).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "mcp.interaction" }),
      expect.stringContaining("tool_call")
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "mcp.interaction" }),
      expect.stringContaining("tool_failure")
    );
  });

  it("buffers and flushes entries when gcsBucket is provided", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
      level: "debug",
    } as any;

    const interactionLogger = new InteractionLogger({
      serverName: "test-server",
      logger,
      gcsBucket: "test-bucket",
      flushIntervalMs: 5,
    });

    interactionLogger.append({
      ts: "2026-02-19T21:00:00.000Z",
      sessionId: "session-1",
      tool: "ttd_update_entity",
      params: { a: 1 },
      success: true,
      durationMs: 1,
    });
    interactionLogger.append({
      ts: "2026-02-19T21:00:01.000Z",
      sessionId: "session-1",
      tool: "ttd_update_entity",
      params: { a: 2 },
      success: true,
      durationMs: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    await interactionLogger.close();

    // gcsObjectPath = `${gcsPrefix}/${filePath}` where gcsPrefix defaults to serverName
    // Instance-unique paths include a hex instanceId to prevent cross-instance races
    const [path, payload] = Array.from(gcsFiles.entries())[0] ?? [];
    expect(path).toMatch(
      /^test-server\/interactions\/test-server-[a-f0-9]{8}-\d{4}-\d{2}-\d{2}\.jsonl$/
    );
    const lines = (payload ?? "")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { id: string });
    expect(lines).toHaveLength(2);
    expect(lines[0].id).not.toBe(lines[1].id);
  });
});
