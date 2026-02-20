import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InteractionLogger, generateEntryId } from "../../src/utils/interaction-logger.js";

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

  it("buffers and flushes entries when storageBackend is provided", async () => {
    const files = new Map<string, string>();
    const storageBackend = {
      type: "local" as const,
      async readFile(path: string): Promise<string | null> {
        return files.get(path) ?? null;
      },
      async writeFile(path: string, content: string): Promise<void> {
        files.set(path, content);
      },
      async appendFile(path: string, content: string): Promise<void> {
        files.set(path, (files.get(path) ?? "") + content);
      },
      async exists(path: string): Promise<boolean> {
        return files.has(path);
      },
      async listFiles(_prefix: string, _extension?: string): Promise<string[]> {
        return [];
      },
      async mkdir(_path: string): Promise<void> {
        // no-op
      },
    };

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
      storageBackend,
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

    const [path, payload] = Array.from(files.entries())[0] ?? [];
    expect(path).toMatch(/^interactions\/test-server-\d{4}-\d{2}-\d{2}\.jsonl$/);
    const lines = (payload ?? "").trim().split("\n").map((line) => JSON.parse(line) as { id: string });
    expect(lines).toHaveLength(2);
    expect(lines[0].id).not.toBe(lines[1].id);
  });
});
