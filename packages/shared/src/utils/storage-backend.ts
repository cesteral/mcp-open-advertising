/**
 * Storage Backend Abstraction
 *
 * Provides a unified interface for filesystem and GCS storage.
 * On Cloud Run, containers are ephemeral — GCS ensures data survives
 * deploys, scale-to-zero, and restarts.
 *
 * Usage:
 *   const backend = resolveStorageBackend({ gcsBucket: "my-bucket", gcsPrefix: "dv360-mcp" });
 *   await backend.writeFile("interactions/2025-01-01.jsonl", data);
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { join, dirname, relative, posix } from "node:path";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface StorageBackend {
  /** Read file contents. Returns null if not found. */
  readFile(path: string): Promise<string | null>;
  /** Write (overwrite) file contents. */
  writeFile(path: string, content: string): Promise<void>;
  /** Append content to a file. For GCS this is download + concat + upload. */
  appendFile(path: string, content: string): Promise<void>;
  /** Check if a file exists. */
  exists(path: string): Promise<boolean>;
  /** List files under a prefix, optionally filtering by extension. Returns relative paths. */
  listFiles(prefix: string, extension?: string): Promise<string[]>;
  /** Ensure a directory exists. No-op for GCS. */
  mkdir(path: string): Promise<void>;
  /** Backend type identifier for logging. */
  readonly type: "local" | "gcs";
}

// ---------------------------------------------------------------------------
// Local Filesystem Backend
// ---------------------------------------------------------------------------

export function createLocalStorageBackend(basePath: string): StorageBackend {
  function resolve(p: string): string {
    return join(basePath, p);
  }

  return {
    type: "local" as const,

    async readFile(path: string): Promise<string | null> {
      const fullPath = resolve(path);
      try {
        return await readFile(fullPath, "utf-8");
      } catch (err: any) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },

    async writeFile(path: string, content: string): Promise<void> {
      const fullPath = resolve(path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    },

    async appendFile(path: string, content: string): Promise<void> {
      const fullPath = resolve(path);
      await mkdir(dirname(fullPath), { recursive: true });
      await appendFile(fullPath, content, "utf-8");
    },

    async exists(path: string): Promise<boolean> {
      return existsSync(resolve(path));
    },

    async listFiles(prefix: string, extension?: string): Promise<string[]> {
      const results: string[] = [];
      const dirPath = resolve(prefix);

      async function walk(dir: string): Promise<void> {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch (err: any) {
          if (err.code === "ENOENT") return;
          throw err;
        }
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (!extension || entry.name.endsWith(extension)) {
            results.push(relative(basePath, fullPath));
          }
        }
      }

      await walk(dirPath);
      return results;
    },

    async mkdir(path: string): Promise<void> {
      await mkdir(resolve(path), { recursive: true });
    },
  };
}

// ---------------------------------------------------------------------------
// GCS Backend
// ---------------------------------------------------------------------------

export function createGcsStorageBackend(bucketName: string, prefix?: string): StorageBackend {
  // Lazy-init: only import @google-cloud/storage when actually used
  let bucketInstance: any;

  function getBucket(): any {
    if (!bucketInstance) {
      // Dynamic import at first use to avoid pulling in GCS SDK when not needed.
      // We use require-style here because the Storage class is needed synchronously
      // after the first call. The @google-cloud/storage package uses ADC on Cloud Run.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Storage } = require("@google-cloud/storage") as typeof import("@google-cloud/storage");
      const storage = new Storage();
      bucketInstance = storage.bucket(bucketName);
    }
    return bucketInstance;
  }

  function gcsPath(path: string): string {
    const parts = prefix ? [prefix, path] : [path];
    return posix.join(...parts);
  }

  return {
    type: "gcs" as const,

    async readFile(path: string): Promise<string | null> {
      try {
        const [contents] = await getBucket().file(gcsPath(path)).download();
        return contents.toString("utf-8");
      } catch (err: any) {
        if (err.code === 404) return null;
        throw err;
      }
    },

    async writeFile(path: string, content: string): Promise<void> {
      await getBucket().file(gcsPath(path)).save(content, {
        contentType: "text/plain; charset=utf-8",
        resumable: false,
      });
    },

    async appendFile(path: string, content: string): Promise<void> {
      const file = getBucket().file(gcsPath(path));
      let existing = "";
      try {
        const [data] = await file.download();
        existing = data.toString("utf-8");
      } catch (err: any) {
        if (err.code !== 404) throw err;
        // File doesn't exist yet — start fresh
      }
      await file.save(existing + content, {
        contentType: "text/plain; charset=utf-8",
        resumable: false,
      });
    },

    async exists(path: string): Promise<boolean> {
      const [exists] = await getBucket().file(gcsPath(path)).exists();
      return exists;
    },

    async listFiles(prefix_: string, extension?: string): Promise<string[]> {
      const fullPrefix = gcsPath(prefix_);
      const [files] = await getBucket().getFiles({ prefix: fullPrefix });
      const results: string[] = [];
      for (const file of files) {
        const name: string = file.name;
        if (extension && !name.endsWith(extension)) continue;
        // Return path relative to the backend prefix
        const relPath = prefix ? name.slice(prefix.length + 1) : name;
        if (relPath) results.push(relPath);
      }
      return results;
    },

    async mkdir(_path: string): Promise<void> {
      // No-op for GCS — directories are virtual
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface ResolveStorageBackendOptions {
  /** GCS bucket name. If set, uses GCS backend. */
  gcsBucket?: string;
  /** Prefix for all GCS paths (typically the server name). */
  gcsPrefix?: string;
  /** Base path for local filesystem backend. Defaults to cwd. */
  localBasePath?: string;
}

/**
 * Resolve the appropriate storage backend based on configuration.
 * If gcsBucket is set, returns a GCS backend; otherwise returns a local FS backend.
 */
export function resolveStorageBackend(opts: ResolveStorageBackendOptions): StorageBackend {
  if (opts.gcsBucket) {
    return createGcsStorageBackend(opts.gcsBucket, opts.gcsPrefix);
  }
  return createLocalStorageBackend(opts.localBasePath ?? process.cwd());
}
