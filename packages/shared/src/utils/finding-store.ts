import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "pino";
import type {
  DetectedPattern,
  FindingQueryFilter,
  FindingStore,
  FindingSummary,
  PersistedFinding,
} from "./finding-types.js";
import type { EvaluatorIssueClass } from "./mcp-errors.js";

interface CreateFindingStoreOptions {
  filePath: string;
  retentionDays?: number;
  logger: Logger;
}

interface PatternAccumulator {
  workflowId?: string;
  issueClass: EvaluatorIssueClass;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  sampleFindingIds: string[];
  sampleMessage: string;
}

function normalizeIssueMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

function toPatternId(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

function calculateConfidence(occurrenceCount: number): number {
  const raw = 0.45 + Math.log10(occurrenceCount + 1) * 0.3;
  return Math.min(0.95, Number(raw.toFixed(3)));
}

function withinTimeWindow(timestamp: string, timeWindowDays?: number): boolean {
  if (!timeWindowDays || timeWindowDays <= 0) return true;
  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) return false;
  const cutoff = Date.now() - timeWindowDays * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
}

function findingMatchesFilter(finding: PersistedFinding, filter?: FindingQueryFilter): boolean {
  if (!filter) return true;
  if (filter.workflowId && finding.workflowId !== filter.workflowId) return false;
  if (filter.platform && finding.platform !== filter.platform) return false;
  if (filter.serverPackage && finding.serverPackage !== filter.serverPackage) return false;
  if (filter.issueClass && !finding.issues.some((issue) => issue.class === filter.issueClass)) {
    return false;
  }
  if (!withinTimeWindow(finding.timestamp, filter.timeWindowDays)) return false;
  return true;
}

function parseJsonLine(line: string, logger: Logger): PersistedFinding | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as PersistedFinding;
  } catch {
    logger.warn({ line: trimmed.slice(0, 100) }, "Finding store: skipping malformed JSONL line");
    return null;
  }
}

export function createFindingStore(options: CreateFindingStoreOptions): FindingStore {
  const { filePath, logger, retentionDays = 30 } = options;

  async function ensureFileDir(): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
  }

  async function readFindingsFromDisk(): Promise<PersistedFinding[]> {
    if (!existsSync(filePath)) return [];
    try {
      const raw = await readFile(filePath, "utf-8");
      return raw
        .split("\n")
        .map((line) => parseJsonLine(line, logger))
        .filter((finding): finding is PersistedFinding => finding !== null);
    } catch (error) {
      logger.warn({ error, filePath }, "Failed to read finding store file");
      return [];
    }
  }

  return {
    async append(findings: PersistedFinding[]): Promise<void> {
      if (findings.length === 0) return;
      try {
        await ensureFileDir();
        const payload = findings.map((finding) => JSON.stringify(finding)).join("\n") + "\n";
        await appendFile(filePath, payload, "utf-8");
      } catch (error) {
        logger.warn({ error, filePath }, "Failed to append findings");
      }
    },

    async query(filter?: FindingQueryFilter): Promise<PersistedFinding[]> {
      const findings = await readFindingsFromDisk();
      return findings.filter((finding) => findingMatchesFilter(finding, filter));
    },

    async getPatterns(filter?: FindingQueryFilter, preloadedFindings?: PersistedFinding[]): Promise<DetectedPattern[]> {
      const findings = preloadedFindings ?? await this.query(filter);
      const minOccurrences = filter?.minOccurrences ?? 3;
      const groups = new Map<string, PatternAccumulator>();

      for (const finding of findings) {
        for (const issue of finding.issues) {
          if (filter?.issueClass && issue.class !== filter.issueClass) continue;

          const normalized = normalizeIssueMessage(issue.message);
          const key = `${finding.workflowId ?? "unknown"}::${issue.class}::${normalized}`;
          const existing = groups.get(key);
          if (!existing) {
            groups.set(key, {
              workflowId: finding.workflowId,
              issueClass: issue.class,
              occurrenceCount: 1,
              firstSeen: finding.timestamp,
              lastSeen: finding.timestamp,
              sampleFindingIds: [finding.id],
              sampleMessage: issue.message,
            });
            continue;
          }

          existing.occurrenceCount += 1;
          if (finding.timestamp < existing.firstSeen) existing.firstSeen = finding.timestamp;
          if (finding.timestamp > existing.lastSeen) existing.lastSeen = finding.timestamp;
          if (existing.sampleFindingIds.length < 5 && !existing.sampleFindingIds.includes(finding.id)) {
            existing.sampleFindingIds.push(finding.id);
          }
        }
      }

      const patterns: DetectedPattern[] = [];
      for (const [key, group] of groups.entries()) {
        if (group.occurrenceCount < minOccurrences) continue;
        patterns.push({
          patternId: toPatternId(key),
          workflowId: group.workflowId,
          issueClass: group.issueClass,
          description: `Recurring ${group.issueClass} pattern: ${group.sampleMessage}`,
          occurrenceCount: group.occurrenceCount,
          confidence: calculateConfidence(group.occurrenceCount),
          firstSeen: group.firstSeen,
          lastSeen: group.lastSeen,
          sampleFindingIds: group.sampleFindingIds,
        });
      }

      patterns.sort((a, b) => {
        if (b.occurrenceCount !== a.occurrenceCount) {
          return b.occurrenceCount - a.occurrenceCount;
        }
        return b.lastSeen.localeCompare(a.lastSeen);
      });

      return patterns;
    },

    async getSummary(filter?: FindingQueryFilter): Promise<FindingSummary> {
      const findings = await this.query(filter);
      const findingsByClass: Record<string, number> = {};
      const findingsByWorkflow: Record<string, number> = {};

      for (const finding of findings) {
        const workflow = finding.workflowId ?? "unknown";
        findingsByWorkflow[workflow] = (findingsByWorkflow[workflow] ?? 0) + 1;

        for (const issue of finding.issues) {
          findingsByClass[issue.class] = (findingsByClass[issue.class] ?? 0) + 1;
        }
      }

      const topPatterns = (await this.getPatterns(filter, findings)).slice(0, 10);
      return {
        totalFindings: findings.length,
        findingsByClass,
        findingsByWorkflow,
        topPatterns,
      };
    },

    async prune(): Promise<number> {
      const findings = await readFindingsFromDisk();
      if (findings.length === 0) return 0;

      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const retained = findings.filter((finding) => {
        const ts = Date.parse(finding.timestamp);
        return Number.isFinite(ts) && ts >= cutoff;
      });

      const removedCount = findings.length - retained.length;
      if (removedCount === 0) return 0;

      try {
        await ensureFileDir();
        const payload = retained.map((finding) => JSON.stringify(finding)).join("\n");
        await writeFile(filePath, payload ? `${payload}\n` : "", "utf-8");
      } catch (error) {
        logger.warn({ error, filePath }, "Failed to prune finding store");
        return 0;
      }

      return removedCount;
    },
  };
}

