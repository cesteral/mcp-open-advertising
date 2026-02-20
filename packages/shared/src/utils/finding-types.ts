import type { EvaluatorIssueClass } from "./mcp-errors.js";

export type FindingRecommendationAction =
  | "none"
  | "log_only"
  | "propose_playbook_delta"
  | "block";

export interface PersistedIssue {
  class: EvaluatorIssueClass;
  message: string;
  isRecoverable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PersistedFinding {
  id: string;
  sessionId: string;
  timestamp: string;
  toolName: string;
  workflowId?: string;
  platform: string;
  serverPackage: string;
  issues: PersistedIssue[];
  inputQualityScore?: number;
  efficiencyScore?: number;
  recommendationAction: FindingRecommendationAction;
  durationMs: number;
}

export interface DetectedPattern {
  patternId: string;
  workflowId?: string;
  issueClass: EvaluatorIssueClass;
  description: string;
  occurrenceCount: number;
  confidence: number;
  firstSeen: string;
  lastSeen: string;
  sampleFindingIds: string[];
}

export interface FindingQueryFilter {
  workflowId?: string;
  platform?: string;
  serverPackage?: string;
  issueClass?: EvaluatorIssueClass;
  minOccurrences?: number;
  timeWindowDays?: number;
}

export interface FindingSummary {
  totalFindings: number;
  findingsByClass: Record<string, number>;
  findingsByWorkflow: Record<string, number>;
  topPatterns: DetectedPattern[];
}

export interface FindingBuffer {
  push(finding: PersistedFinding): void;
  getAll(): PersistedFinding[];
  getByWorkflow(workflowId: string): PersistedFinding[];
  size(): number;
  clear(): PersistedFinding[];
}

export interface FindingStore {
  append(findings: PersistedFinding[]): Promise<void>;
  query(filter?: FindingQueryFilter): Promise<PersistedFinding[]>;
  getPatterns(filter?: FindingQueryFilter, preloadedFindings?: PersistedFinding[]): Promise<DetectedPattern[]>;
  getSummary(filter?: FindingQueryFilter): Promise<FindingSummary>;
  prune(): Promise<number>;
}

