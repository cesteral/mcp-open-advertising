/**
 * Learnings Index
 *
 * Maintains a JSON index of all learning entries across the markdown tree.
 * Enables fast structured lookups for deduplication and filtered retrieval
 * without parsing markdown at read time.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

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
// Index operations
// ---------------------------------------------------------------------------

/**
 * Rebuild the learnings index by scanning all markdown files.
 * Writes `index.json` to the learnings root.
 */
export function rebuildLearningsIndex(learningsRoot: string): LearningsIndex {
  const entries: LearningsIndexEntry[] = [];
  const scanDirs = ["platforms", "workflows", "agent-behaviors", "auto-generated"];

  for (const subDir of scanDirs) {
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
