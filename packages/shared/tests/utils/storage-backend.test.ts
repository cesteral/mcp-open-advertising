import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createGcsStorageBackend,
  createLocalStorageBackend,
  resolveStorageBackend,
} from "../../src/utils/storage-backend.js";

const tempDirs: string[] = [];

const { gcsFiles, storageCtorMock } = vi.hoisted(() => ({
  gcsFiles: new Map<string, string>(),
  storageCtorMock: vi.fn(),
}));

vi.mock("@google-cloud/storage", () => {
  const bucket = {
    file: (name: string) => ({
      async download(): Promise<[Buffer]> {
        if (!gcsFiles.has(name)) {
          const err = new Error("Not Found") as Error & { code: number };
          err.code = 404;
          throw err;
        }
        return [Buffer.from(gcsFiles.get(name)!, "utf-8")];
      },
      async save(content: string): Promise<void> {
        gcsFiles.set(name, content);
      },
      async exists(): Promise<[boolean]> {
        return [gcsFiles.has(name)];
      },
    }),
    async getFiles(opts: { prefix: string }): Promise<[Array<{ name: string }>]> {
      const files = Array.from(gcsFiles.keys())
        .filter((name) => name.startsWith(opts.prefix))
        .map((name) => ({ name }));
      return [files];
    },
  };

  storageCtorMock.mockImplementation(() => ({
    bucket: () => bucket,
  }));

  return { Storage: storageCtorMock };
}, { virtual: true });

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "shared-storage-backend-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  gcsFiles.clear();
  storageCtorMock.mockClear();
});

describe("storage-backend", () => {
  it("uses local storage backend when gcsBucket is not provided", async () => {
    const dir = createTempDir();
    const backend = resolveStorageBackend({ localBasePath: dir });
    expect(backend.type).toBe("local");

    await backend.writeFile("a/b/test.txt", "hello");
    const content = readFileSync(join(dir, "a/b/test.txt"), "utf-8");
    expect(content).toBe("hello");
  });

  it("supports local backend append/list semantics", async () => {
    const dir = createTempDir();
    const backend = createLocalStorageBackend(dir);

    await backend.writeFile("findings/f1.jsonl", "one\n");
    await backend.appendFile("findings/f1.jsonl", "two\n");
    await backend.writeFile("findings/f2.txt", "skip");

    expect(await backend.readFile("findings/f1.jsonl")).toBe("one\ntwo\n");
    expect(await backend.exists("findings/f1.jsonl")).toBe(true);

    const jsonl = await backend.listFiles("findings", ".jsonl");
    expect(jsonl).toEqual(["findings/f1.jsonl"]);
  });

  it("supports gcs backend read/write/append/list/exists semantics", async () => {
    const backend = createGcsStorageBackend("test-bucket", "dv360-mcp");
    expect(backend.type).toBe("gcs");

    await backend.writeFile("findings/f1.jsonl", "one\n");
    expect(gcsFiles.get("dv360-mcp/findings/f1.jsonl")).toBe("one\n");

    await backend.appendFile("findings/f1.jsonl", "two\n");
    expect(gcsFiles.get("dv360-mcp/findings/f1.jsonl")).toBe("one\ntwo\n");

    expect(await backend.readFile("findings/f1.jsonl")).toBe("one\ntwo\n");
    expect(await backend.readFile("findings/missing.jsonl")).toBeNull();
    expect(await backend.exists("findings/f1.jsonl")).toBe(true);
    expect(await backend.exists("findings/missing.jsonl")).toBe(false);

    await backend.writeFile("findings/other.txt", "x");
    const files = await backend.listFiles("findings", ".jsonl");
    expect(files).toEqual(["findings/f1.jsonl"]);

    expect(storageCtorMock).toHaveBeenCalledTimes(1);
  });
});
