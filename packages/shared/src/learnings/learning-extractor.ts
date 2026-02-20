/**
 * Learning Extractor
 *
 * Automatically extracts learnings from evaluator findings after
 * repeated observation of the same issue class. Closes the learning
 * loop: evaluator -> threshold -> curated markdown.
 *
 * Supports optional StorageBackend for GCS persistence. When provided,
 * counts and auto-generated learnings are read/written via the backend
 * instead of direct filesystem access.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ToolInteractionIssue } from "../utils/tool-handler-factory.js";
import type { SkillContext } from "../utils/finding-types.js";
import type { StorageBackend } from "../utils/storage-backend.js";
import { rebuildLearningsIndex, rebuildLearningsIndexAsync } from "./learnings-index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningExtractorOptions {
  learningsRoot: string;
  dataDir: string;
  /** Number of occurrences before auto-generating a learning. Default: 5 */
  threshold?: number;
  /** Optional StorageBackend for GCS persistence. */
  storageBackend?: StorageBackend;
}

interface IssueCountData {
  count: number;
  lastSeen: string;
  sampleMessages: string[];
}

type IssueCounts = Record<string, IssueCountData>;

// ---------------------------------------------------------------------------
// LearningExtractor
// ---------------------------------------------------------------------------

export class LearningExtractor {
  private readonly learningsRoot: string;
  private readonly dataDir: string;
  private readonly threshold: number;
  private readonly countsPath: string;
  private readonly storageBackend?: StorageBackend;
  private counts: IssueCounts;
  private _ready: Promise<void>;

  constructor(options: LearningExtractorOptions) {
    this.learningsRoot = options.learningsRoot;
    this.dataDir = options.dataDir;
    this.threshold = options.threshold ?? 5;
    this.storageBackend = options.storageBackend;

    if (this.storageBackend) {
      this.countsPath = "learnings/issue-counts.json";
      this.counts = {};
      this._ready = this.loadCountsAsync();
    } else {
      this.countsPath = join(this.dataDir, "issue-counts.json");
      this.counts = this.loadCounts();
      this._ready = Promise.resolve();
    }
  }

  /**
   * Process evaluator issues for a tool execution.
   * Increments counts and auto-generates learnings when threshold is reached.
   * Optionally accepts a skill context for skill-aware counting.
   */
  async processEvaluation(toolName: string, issues: ToolInteractionIssue[], skillContext?: SkillContext): Promise<void> {
    if (!issues.length) return;

    // Ensure async init is complete (GCS count loading)
    await this._ready;

    for (const issue of issues) {
      // Per-tool key (always counted)
      const key = `${toolName}::${issue.class}`;
      this.incrementCount(key, issue);

      if (this.counts[key].count === this.threshold) {
        await this.generateLearning(toolName, issue.class, this.counts[key]);
      }

      // Per-skill key (when skill context is provided)
      if (skillContext?.skillName) {
        const skillKey = `skill:${skillContext.skillName}::${toolName}::${issue.class}`;
        this.incrementCount(skillKey, issue);

        if (this.counts[skillKey].count === this.threshold) {
          await this.generateLearning(
            toolName,
            issue.class,
            this.counts[skillKey],
            skillContext.skillName
          );
        }
      }
    }

    await this.saveCounts();
  }

  private incrementCount(key: string, issue: ToolInteractionIssue): void {
    const existing = this.counts[key];
    if (existing) {
      existing.count++;
      existing.lastSeen = new Date().toISOString();
      if (existing.sampleMessages.length < 3 && issue.message) {
        existing.sampleMessages.push(issue.message);
      }
    } else {
      this.counts[key] = {
        count: 1,
        lastSeen: new Date().toISOString(),
        sampleMessages: issue.message ? [issue.message] : [],
      };
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async generateLearning(tool: string, issueClass: string, data: IssueCountData, skillName?: string): Promise<void> {
    const safeClass = issueClass.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    const safeTool = tool.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    const safeSkill = skillName ? skillName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() : "";
    const fileName = skillName
      ? `${safeSkill}-${safeTool}-${safeClass}.md`
      : `${safeTool}-${safeClass}.md`;

    const date = new Date().toISOString().slice(0, 10);
    const samples = data.sampleMessages
      .map((msg) => `  - ${msg}`)
      .join("\n");

    const skillLine = skillName ? `- **Skill**: ${skillName}\n` : "";
    const title = skillName
      ? `${tool} — ${issueClass} (skill: ${skillName})`
      : `${tool} — ${issueClass}`;

    const content = `# Auto-Generated: ${title}

## ${issueClass} pattern detected for ${tool}
- **Date**: ${date}
- **Source**: Auto-extracted (${data.count} occurrences)
${skillLine}- **Context**: The evaluator has detected the \`${issueClass}\` issue class ${data.count} times for the \`${tool}\` tool${skillName ? ` when used within the \`${skillName}\` skill` : ""}. This suggests a recurring pattern that agents should be aware of.
- **Applies to**: ${tool}
${samples ? `- **Sample messages**:\n${samples}\n` : ""}- **Recommendation**: Review recent ${tool} interactions for this issue pattern and adjust usage accordingly.
`;

    if (this.storageBackend) {
      const filePath = `learnings/auto-generated/${fileName}`;
      await this.storageBackend.writeFile(filePath, content);
      try {
        await rebuildLearningsIndexAsync(this.learningsRoot, this.storageBackend);
      } catch {
        // Non-critical
      }
    } else {
      const autoDir = join(this.learningsRoot, "auto-generated");
      if (!existsSync(autoDir)) {
        mkdirSync(autoDir, { recursive: true });
      }
      const filePath = join(autoDir, fileName);
      writeFileSync(filePath, content, "utf-8");
      try {
        rebuildLearningsIndex(this.learningsRoot);
      } catch {
        // Non-critical
      }
    }
  }

  private async loadCountsAsync(): Promise<void> {
    if (!this.storageBackend) return;
    try {
      const raw = await this.storageBackend.readFile(this.countsPath);
      if (raw) {
        this.counts = JSON.parse(raw) as IssueCounts;
      }
    } catch {
      this.counts = {};
    }
  }

  private loadCounts(): IssueCounts {
    if (!existsSync(this.countsPath)) return {};
    try {
      return JSON.parse(readFileSync(this.countsPath, "utf-8")) as IssueCounts;
    } catch {
      return {};
    }
  }

  private async saveCounts(): Promise<void> {
    try {
      if (this.storageBackend) {
        await this.storageBackend.writeFile(this.countsPath, JSON.stringify(this.counts, null, 2));
      } else {
        const dir = dirname(this.countsPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(this.countsPath, JSON.stringify(this.counts, null, 2), "utf-8");
      }
    } catch {
      // Fire-and-forget — don't crash the tool execution
    }
  }
}
