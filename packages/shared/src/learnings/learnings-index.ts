/**
 * Learnings Index
 *
 * Maintains a JSON index of all learning entries across the markdown tree.
 * Enables fast structured lookups for deduplication and filtered retrieval
 * without parsing markdown at read time.
 *
 * Provides both sync functions (local FS) and async overloads (StorageBackend/GCS).
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { StorageBackend } from "../utils/storage-backend.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningsIndexEntry {
  tool?: string;
  workflow?: string;
  file: string;
  heading: string;
  date?: string;
  appliesTo?: string;
}

export interface LearningsIndex {
  entries: LearningsIndexEntry[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single markdown file into index entries by splitting on `## ` headings.
 */
export function parseMarkdownEntries(filePath: string, relPath: string): LearningsIndexEntry[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  return parseMarkdownEntriesFromContent(content, relPath);
}

/**
 * Parse markdown content (string) into index entries. Shared by sync and async paths.
 */
function parseMarkdownEntriesFromContent(content: string, relPath: string): LearningsIndexEntry[] {
  const sections = content.split(/\n(?=## )/);
  const entries: LearningsIndexEntry[] = [];

  for (const section of sections) {
    const headingMatch = section.match(/^## (.+)/);
    if (!headingMatch) continue;

    const heading = headingMatch[1].trim();
    const entry: LearningsIndexEntry = { file: relPath, heading };

    const dateMatch = section.match(/\*\*Date\*\*:\s*(\S+)/);
    if (dateMatch) entry.date = dateMatch[1];

    const appliesToMatch = section.match(/\*\*Applies to\*\*:\s*(.+)/);
    if (appliesToMatch) entry.appliesTo = appliesToMatch[1].trim();

    // Extract tool references from appliesTo
    const toolMatch = entry.appliesTo?.match(/\b(\w+_\w+)\b/);
    if (toolMatch) entry.tool = toolMatch[1];

    // Infer workflow from file path
    if (relPath.startsWith("workflows/")) {
      entry.workflow = relPath.replace(/^workflows\//, "").replace(/\.md$/, "");
    }

    entries.push(entry);
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Directory walking
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .md files under a directory.
 */
function walkMarkdownFiles(dir: string, root: string): string[] {
  if (!existsSync(dir)) return [];

  const results: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(fullPath, root));
    } else if (entry.name.endsWith(".md")) {
      results.push(relative(root, fullPath));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Index operations (sync — local filesystem)
// ---------------------------------------------------------------------------

const SCAN_DIRS = ["platforms", "workflows", "agent-behaviors", "auto-generated"];

/**
 * Rebuild the learnings index by scanning all markdown files.
 * Writes `index.json` to the learnings root.
 */
export function rebuildLearningsIndex(learningsRoot: string): LearningsIndex {
  const entries: LearningsIndexEntry[] = [];

  for (const subDir of SCAN_DIRS) {
    const dirPath = join(learningsRoot, subDir);
    const files = walkMarkdownFiles(dirPath, learningsRoot);
    for (const relPath of files) {
      const fullPath = join(learningsRoot, relPath);
      entries.push(...parseMarkdownEntries(fullPath, relPath));
    }
  }

  const index: LearningsIndex = {
    entries,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(join(learningsRoot, "index.json"), JSON.stringify(index, null, 2), "utf-8");

  return index;
}

/**
 * Load an existing index from disk. Returns null if not found.
 */
export function loadLearningsIndex(learningsRoot: string): LearningsIndex | null {
  const indexPath = join(learningsRoot, "index.json");
  if (!existsSync(indexPath)) return null;

  try {
    return JSON.parse(readFileSync(indexPath, "utf-8")) as LearningsIndex;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Index operations (async — StorageBackend)
// ---------------------------------------------------------------------------

/**
 * Rebuild the learnings index via StorageBackend.
 * Scans markdown files in the standard subdirectories via backend.listFiles().
 */
export async function rebuildLearningsIndexAsync(
  _learningsRoot: string,
  backend: StorageBackend
): Promise<LearningsIndex> {
  const entries: LearningsIndexEntry[] = [];

  for (const subDir of SCAN_DIRS) {
    const prefix = `learnings/${subDir}`;
    const files = await backend.listFiles(prefix, ".md");
    for (const filePath of files) {
      // filePath is relative to backend root, e.g. "learnings/platforms/foo.md"
      const content = await backend.readFile(filePath);
      if (!content) continue;
      // relPath should be relative to learningsRoot, e.g. "platforms/foo.md"
      const relPath = filePath.startsWith("learnings/")
        ? filePath.slice("learnings/".length)
        : filePath;
      entries.push(...parseMarkdownEntriesFromContent(content, relPath));
    }
  }

  const index: LearningsIndex = {
    entries,
    generatedAt: new Date().toISOString(),
  };

  await backend.writeFile("learnings/index.json", JSON.stringify(index, null, 2));

  return index;
}

/**
 * Load an existing index via StorageBackend. Returns null if not found.
 */
export async function loadLearningsIndexAsync(
  _learningsRoot: string,
  backend: StorageBackend
): Promise<LearningsIndex | null> {
  try {
    const raw = await backend.readFile("learnings/index.json");
    if (!raw) return null;
    return JSON.parse(raw) as LearningsIndex;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Filter index entries by tool name, workflow, or general text match on appliesTo.
 */
export function queryIndex(
  index: LearningsIndex,
  filters: { tool?: string; workflow?: string }
): LearningsIndexEntry[] {
  return index.entries.filter((entry) => {
    if (filters.tool) {
      const toolLower = filters.tool.toLowerCase();
      if (entry.tool?.toLowerCase() === toolLower) return true;
      if (entry.appliesTo?.toLowerCase().includes(toolLower)) return true;
      return false;
    }
    if (filters.workflow) {
      return entry.workflow === filters.workflow;
    }
    return true;
  });
}
