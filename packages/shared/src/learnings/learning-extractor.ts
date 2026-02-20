/**
 * Learning Extractor
 *
 * Automatically extracts learnings from evaluator findings after
 * repeated observation of the same issue class. Closes the learning
 * loop: evaluator → threshold → curated markdown.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ToolInteractionIssue } from "../utils/tool-handler-factory.js";
import type { SkillContext } from "../utils/finding-types.js";
import { rebuildLearningsIndex } from "./learnings-index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningExtractorOptions {
  learningsRoot: string;
  dataDir: string;
  /** Number of occurrences before auto-generating a learning. Default: 5 */
  threshold?: number;
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
  private counts: IssueCounts;

  constructor(options: LearningExtractorOptions) {
    this.learningsRoot = options.learningsRoot;
    this.dataDir = options.dataDir;
    this.threshold = options.threshold ?? 5;
    this.countsPath = join(this.dataDir, "issue-counts.json");
    this.counts = this.loadCounts();
  }

  /**
   * Process evaluator issues for a tool execution.
   * Increments counts and auto-generates learnings when threshold is reached.
   * Optionally accepts a skill context for skill-aware counting.
   */
  processEvaluation(toolName: string, issues: ToolInteractionIssue[], skillContext?: SkillContext): void {
    if (!issues.length) return;

    for (const issue of issues) {
      // Per-tool key (always counted)
      const key = `${toolName}::${issue.class}`;
      this.incrementCount(key, issue);

      if (this.counts[key].count === this.threshold) {
        this.generateLearning(toolName, issue.class, this.counts[key]);
      }

      // Per-skill key (when skill context is provided)
      if (skillContext?.skillName) {
        const skillKey = `skill:${skillContext.skillName}::${toolName}::${issue.class}`;
        this.incrementCount(skillKey, issue);

        if (this.counts[skillKey].count === this.threshold) {
          this.generateLearning(
            toolName,
            issue.class,
            this.counts[skillKey],
            skillContext.skillName
          );
        }
      }
    }

    this.saveCounts();
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

  private generateLearning(tool: string, issueClass: string, data: IssueCountData, skillName?: string): void {
    const autoDir = join(this.learningsRoot, "auto-generated");
    if (!existsSync(autoDir)) {
      mkdirSync(autoDir, { recursive: true });
    }

    const safeClass = issueClass.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    const safeTool = tool.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    const safeSkill = skillName ? skillName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() : "";
    const fileName = skillName
      ? `${safeSkill}-${safeTool}-${safeClass}.md`
      : `${safeTool}-${safeClass}.md`;
    const filePath = join(autoDir, fileName);

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

    writeFileSync(filePath, content, "utf-8");

    try {
      rebuildLearningsIndex(this.learningsRoot);
    } catch {
      // Non-critical
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

  private saveCounts(): void {
    try {
      const dir = dirname(this.countsPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.countsPath, JSON.stringify(this.counts, null, 2), "utf-8");
    } catch {
      // Fire-and-forget — don't crash the tool execution
    }
  }
}
