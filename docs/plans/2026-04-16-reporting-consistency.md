# Reporting Consistency & Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate reporting inconsistencies across 12 MCP servers by building shared infra, adopting it everywhere, adding per-server features (CSV resources, discovery, scheduling), and enabling GCS-backed CSV spill for large reports.

**Architecture:** Foundation-first phased rollout. Phase 1 adds shared helpers (polling, CSV, status schema, error mapping, computed metrics) to `@cesteral/shared`. Phase 2 migrates every server to consume them. Phase 3 fans out `report-csv://` resources, discovery tools, and native scheduling. Phase 4 adds GCS spill for reports above a threshold. Dependency direction stays linear: servers → shared.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm + Turborepo, MCP SDK 1.26.0, Node streams, `@google-cloud/storage`.

**Design doc:** [docs/plans/2026-04-16-reporting-consistency-design.md](./2026-04-16-reporting-consistency-design.md)

**Rollout gates:** Phase N+1 PRs cannot land until Phase N exit criteria are green on `main`.

---

## Phase 1 — Shared Infra

Each task is an independent PR against `@cesteral/shared`. No server consumes these yet.

### Task 1.1: `pollUntilComplete` helper

**Files:**
- Create: `packages/shared/src/utils/report-polling.ts`
- Create: `packages/shared/tests/utils/report-polling.test.ts`
- Modify: `packages/shared/src/index.ts` (add export)

**Step 1: Write the failing test**

```ts
// packages/shared/tests/utils/report-polling.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  pollUntilComplete,
  ReportFailedError,
  ReportTimeoutError,
} from "../../src/utils/report-polling.js";

describe("pollUntilComplete", () => {
  it("resolves when isComplete returns true", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "running" })
      .mockResolvedValueOnce({ state: "complete" });
    const result = await pollUntilComplete({
      fetchStatus,
      isComplete: (s) => s.state === "complete",
      initialDelayMs: 1,
      maxDelayMs: 2,
    });
    expect(result.state).toBe("complete");
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("throws ReportFailedError when isFailed returns true", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ state: "failed" });
    await expect(
      pollUntilComplete({
        fetchStatus,
        isComplete: (s) => s.state === "complete",
        isFailed: (s) => s.state === "failed",
        initialDelayMs: 1,
      }),
    ).rejects.toBeInstanceOf(ReportFailedError);
  });

  it("throws ReportTimeoutError after maxAttempts", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ state: "pending" });
    await expect(
      pollUntilComplete({
        fetchStatus,
        isComplete: () => false,
        initialDelayMs: 1,
        maxAttempts: 3,
      }),
    ).rejects.toBeInstanceOf(ReportTimeoutError);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("aborts on signal", async () => {
    const controller = new AbortController();
    const fetchStatus = vi.fn().mockResolvedValue({ state: "pending" });
    const promise = pollUntilComplete({
      fetchStatus,
      isComplete: () => false,
      initialDelayMs: 50,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toThrow(/abort/i);
  });

  it("applies exponential backoff capped by maxDelayMs", async () => {
    const delays: number[] = [];
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      delays.push(ms ?? 0);
      return origSetTimeout(fn, 0);
    }) as typeof setTimeout);
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "complete" });
    await pollUntilComplete({
      fetchStatus,
      isComplete: (s) => s.state === "complete",
      initialDelayMs: 100,
      maxDelayMs: 300,
      backoffFactor: 2,
    });
    expect(delays.slice(0, 3)).toEqual([100, 200, 300]);
    vi.restoreAllMocks();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm vitest run tests/utils/report-polling.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```ts
// packages/shared/src/utils/report-polling.ts
import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";

export class ReportTimeoutError extends McpError {
  constructor(attempts: number) {
    super(`Report polling exceeded ${attempts} attempts`, {
      code: JsonRpcErrorCode.InternalError,
    });
    this.name = "ReportTimeoutError";
  }
}

export class ReportFailedError<T = unknown> extends McpError {
  readonly status: T;
  constructor(status: T, message = "Report generation failed") {
    super(message, { code: JsonRpcErrorCode.InternalError, data: { status } });
    this.name = "ReportFailedError";
    this.status = status;
  }
}

export interface PollOptions<T> {
  fetchStatus: () => Promise<T>;
  isComplete: (status: T) => boolean;
  isFailed?: (status: T) => boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  backoffFactor?: number;
  signal?: AbortSignal;
}

export async function pollUntilComplete<T>(
  opts: PollOptions<T>,
): Promise<T> {
  const {
    fetchStatus,
    isComplete,
    isFailed,
    initialDelayMs = 2000,
    maxDelayMs = 30000,
    maxAttempts = 60,
    backoffFactor = 1.5,
    signal,
  } = opts;

  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error("Polling aborted");
    const status = await fetchStatus();
    if (isFailed?.(status)) throw new ReportFailedError(status);
    if (isComplete(status)) return status;
    if (attempt === maxAttempts) break;
    await sleep(delay, signal);
    delay = Math.min(Math.round(delay * backoffFactor), maxDelayMs);
  }
  throw new ReportTimeoutError(maxAttempts);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Polling aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
```

Add to `packages/shared/src/index.ts`:
```ts
export * from "./utils/report-polling.js";
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared && pnpm vitest run tests/utils/report-polling.test.ts`
Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add packages/shared/src/utils/report-polling.ts \
        packages/shared/tests/utils/report-polling.test.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): add pollUntilComplete helper for report polling"
```

---

### Task 1.2: Consolidated CSV parser

**Files:**
- Modify: `packages/shared/src/utils/csv-parser.ts` (add `parseCSV` full-document function)
- Create: `packages/shared/tests/utils/csv-parser-document.test.ts`

**Step 1: Write the failing test**

```ts
// packages/shared/tests/utils/csv-parser-document.test.ts
import { describe, expect, it } from "vitest";
import { parseCSV } from "../../src/utils/csv-parser.js";

describe("parseCSV", () => {
  it("parses headers and rows", () => {
    const out = parseCSV("a,b,c\n1,2,3\n4,5,6\n");
    expect(out.headers).toEqual(["a", "b", "c"]);
    expect(out.rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("normalizes CRLF to LF", () => {
    const out = parseCSV("a,b\r\n1,2\r\n");
    expect(out.rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("handles quoted fields with embedded commas and newlines", () => {
    const out = parseCSV('a,b\n"hello, world","line1\nline2"\n');
    expect(out.rows[0]).toEqual({ a: "hello, world", b: "line1\nline2" });
  });

  it("returns empty rows when body is blank", () => {
    const out = parseCSV("a,b\n");
    expect(out.rows).toEqual([]);
  });

  it("skips empty trailing lines", () => {
    const out = parseCSV("a\n1\n\n\n");
    expect(out.rows).toEqual([{ a: "1" }]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm vitest run tests/utils/csv-parser-document.test.ts`
Expected: FAIL — `parseCSV` not exported.

**Step 3: Write minimal implementation**

Append to `packages/shared/src/utils/csv-parser.ts`:

```ts
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCSV(text: string): ParsedCsv {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = splitCsvLines(normalized);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === "") continue;
    const fields = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = fields[j] ?? "";
    }
    rows.push(row);
  }
  return { headers, rows };
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared && pnpm vitest run tests/utils/csv-parser-document.test.ts`
Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add packages/shared/src/utils/csv-parser.ts \
        packages/shared/tests/utils/csv-parser-document.test.ts
git commit -m "feat(shared): add parseCSV full-document helper"
```

---

### Task 1.3: Canonical computed-metrics row wrapper + flag schema

**Files:**
- Modify: `packages/shared/src/utils/computed-metrics.ts`
- Create: `packages/shared/tests/utils/computed-metrics-rows.test.ts`

**Step 1: Write the failing test**

```ts
// packages/shared/tests/utils/computed-metrics-rows.test.ts
import { describe, expect, it } from "vitest";
import {
  ComputedMetricsFlagSchema,
  appendComputedMetricsToRows,
} from "../../src/utils/computed-metrics.js";

describe("ComputedMetricsFlagSchema", () => {
  it("defaults includeComputedMetrics to false", () => {
    const parsed = ComputedMetricsFlagSchema.parse({});
    expect(parsed.includeComputedMetrics).toBe(false);
  });
});

describe("appendComputedMetricsToRows", () => {
  it("appends CPA/ROAS/CPM/CTR/CPC columns per row", () => {
    const rows = [
      {
        cost: "100",
        impressions: "10000",
        clicks: "200",
        conversions: "4",
        conversionValue: "400",
      },
    ];
    const out = appendComputedMetricsToRows(rows);
    expect(out[0]).toMatchObject({
      cpa: "25",
      roas: "4",
      cpm: "10",
      ctr: "2",
      cpc: "0.5",
    });
  });

  it("emits warning when required input missing", () => {
    const rows = [{ cost: "100", impressions: "1000" }];
    const out = appendComputedMetricsToRows(rows);
    expect(out[0]!.cpa).toBe("");
    expect(out[0]!._computedMetricsWarnings).toContain("missing:clicks");
  });

  it("is a no-op on empty input", () => {
    expect(appendComputedMetricsToRows([])).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm vitest run tests/utils/computed-metrics-rows.test.ts`
Expected: FAIL — `appendComputedMetricsToRows`/`ComputedMetricsFlagSchema` not exported.

**Step 3: Write minimal implementation**

Append to `packages/shared/src/utils/computed-metrics.ts`:

```ts
import { z } from "zod";

export const ComputedMetricsFlagSchema = z.object({
  includeComputedMetrics: z.boolean().default(false),
});

const REQUIRED = ["cost", "impressions", "clicks", "conversions", "conversionValue"] as const;

export function appendComputedMetricsToRows(
  rows: Record<string, string>[],
  aliases: Partial<Record<(typeof REQUIRED)[number], string[]>> = {},
): Record<string, string>[] {
  if (rows.length === 0) return rows;
  const findCol = (key: (typeof REQUIRED)[number]): string | null => {
    const candidates = [key, ...(aliases[key] ?? [])];
    for (const c of candidates) {
      if (c in rows[0]!) return c;
    }
    return null;
  };
  const cols = Object.fromEntries(REQUIRED.map((k) => [k, findCol(k)])) as Record<
    (typeof REQUIRED)[number],
    string | null
  >;
  const warnings: string[] = REQUIRED.filter((k) => !cols[k]).map((k) => `missing:${k}`);
  return rows.map((row) => {
    const num = (k: (typeof REQUIRED)[number]): number => {
      const col = cols[k];
      return col ? Number(row[col]) || 0 : 0;
    };
    const m = computeMetrics({
      cost: num("cost"),
      impressions: num("impressions"),
      clicks: num("clicks"),
      conversions: num("conversions"),
      conversionValue: num("conversionValue"),
    });
    const out: Record<string, string> = { ...row };
    out.cpa = m.cpa?.toString() ?? "";
    out.roas = m.roas?.toString() ?? "";
    out.cpm = m.cpm?.toString() ?? "";
    out.ctr = m.ctr?.toString() ?? "";
    out.cpc = m.cpc?.toString() ?? "";
    if (warnings.length > 0) out._computedMetricsWarnings = warnings.join(",");
    return out;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared && pnpm vitest run tests/utils/computed-metrics-rows.test.ts`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add packages/shared/src/utils/computed-metrics.ts \
        packages/shared/tests/utils/computed-metrics-rows.test.ts
git commit -m "feat(shared): add ComputedMetricsFlagSchema and row wrapper"
```

---

### Task 1.4: Canonical `ReportStatusSchema` + per-platform normalizers

**Files:**
- Create: `packages/shared/src/schemas/report-status.ts`
- Create: `packages/shared/tests/schemas/report-status.test.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Write the failing test**

```ts
// packages/shared/tests/schemas/report-status.test.ts
import { describe, expect, it } from "vitest";
import {
  ReportStatusSchema,
  fromTtdStatus,
  fromMetaStatus,
  fromGoogleStatus,
  fromMicrosoftStatus,
} from "../../src/schemas/report-status.js";

describe("ReportStatusSchema", () => {
  it("validates a complete status", () => {
    const parsed = ReportStatusSchema.parse({
      state: "complete",
      submittedAt: "2026-04-16T12:00:00Z",
      completedAt: "2026-04-16T12:01:00Z",
      downloadUrl: "https://example/report.csv",
    });
    expect(parsed.state).toBe("complete");
  });

  it("rejects invalid state", () => {
    expect(() => ReportStatusSchema.parse({ state: "weird" })).toThrow();
  });
});

describe("normalizers", () => {
  it("fromTtdStatus maps TTD enum", () => {
    expect(fromTtdStatus({ ExecutionState: "Complete" }).state).toBe("complete");
    expect(fromTtdStatus({ ExecutionState: "Failed" }).state).toBe("failed");
    expect(fromTtdStatus({ ExecutionState: "InProgress" }).state).toBe("running");
  });
  it("fromMetaStatus maps async_status", () => {
    expect(fromMetaStatus({ async_status: "Job Completed" }).state).toBe("complete");
    expect(fromMetaStatus({ async_status: "Job Failed" }).state).toBe("failed");
  });
  it("fromGoogleStatus maps Google operation", () => {
    expect(fromGoogleStatus({ done: true }).state).toBe("complete");
    expect(fromGoogleStatus({ done: false }).state).toBe("running");
  });
  it("fromMicrosoftStatus maps Microsoft status", () => {
    expect(fromMicrosoftStatus({ ReportRequestStatus: "Success" }).state).toBe("complete");
    expect(fromMicrosoftStatus({ ReportRequestStatus: "Error" }).state).toBe("failed");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm vitest run tests/schemas/report-status.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```ts
// packages/shared/src/schemas/report-status.ts
import { z } from "zod";

export const ReportStatusSchema = z.object({
  state: z.enum(["pending", "running", "complete", "failed", "cancelled"]),
  progress: z.number().min(0).max(1).optional(),
  downloadUrl: z.string().url().optional(),
  errors: z.array(z.string()).optional(),
  submittedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export function fromTtdStatus(raw: { ExecutionState?: string; ReportDownloadUrl?: string; ReportStartDateInclusive?: string; ReportEndDateExclusive?: string }): ReportStatus {
  const map: Record<string, ReportStatus["state"]> = {
    Pending: "pending",
    InProgress: "running",
    Complete: "complete",
    Failed: "failed",
    Cancelled: "cancelled",
  };
  return {
    state: map[raw.ExecutionState ?? "Pending"] ?? "pending",
    downloadUrl: raw.ReportDownloadUrl,
  };
}

export function fromMetaStatus(raw: { async_status?: string; async_percent_completion?: number }): ReportStatus {
  const s = raw.async_status ?? "";
  const state: ReportStatus["state"] = s === "Job Completed" ? "complete"
    : s === "Job Failed" ? "failed"
    : s === "Job Started" || s === "Job Running" ? "running"
    : "pending";
  return {
    state,
    progress: typeof raw.async_percent_completion === "number" ? raw.async_percent_completion / 100 : undefined,
  };
}

export function fromGoogleStatus(raw: { done?: boolean; error?: unknown }): ReportStatus {
  if (raw.error) return { state: "failed", errors: [String(raw.error)] };
  return { state: raw.done ? "complete" : "running" };
}

export function fromMicrosoftStatus(raw: { ReportRequestStatus?: string; ReportDownloadUrl?: string }): ReportStatus {
  const s = raw.ReportRequestStatus ?? "";
  const state: ReportStatus["state"] = s === "Success" ? "complete"
    : s === "Error" ? "failed"
    : "running";
  return { state, downloadUrl: raw.ReportDownloadUrl };
}
```

Add to `packages/shared/src/index.ts`:
```ts
export * from "./schemas/report-status.js";
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared && pnpm vitest run tests/schemas/report-status.test.ts`
Expected: PASS (6 tests).

**Step 5: Commit**

```bash
git add packages/shared/src/schemas/report-status.ts \
        packages/shared/tests/schemas/report-status.test.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): add ReportStatusSchema with per-platform normalizers"
```

---

### Task 1.5: Reporting error mapper + `ReportingError` base class

**Files:**
- Create: `packages/shared/src/utils/report-errors.ts`
- Create: `packages/shared/tests/utils/report-errors.test.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Write the failing test**

```ts
// packages/shared/tests/utils/report-errors.test.ts
import { describe, expect, it } from "vitest";
import { mapReportingError, ReportingError } from "../../src/utils/report-errors.js";

describe("mapReportingError", () => {
  it("wraps HTTP 429 as retryable for any platform", () => {
    const err = mapReportingError({ response: { status: 429 } }, "ttd");
    expect(err).toBeInstanceOf(ReportingError);
    expect(err.data).toMatchObject({ platform: "ttd", upstreamCode: 429, retryable: true });
  });

  it("maps TTD error envelope", () => {
    const err = mapReportingError(
      { response: { status: 400, data: { ErrorCode: "InvalidArg", Message: "bad" } } },
      "ttd",
    );
    expect(err.data).toMatchObject({ platform: "ttd", upstreamCode: "InvalidArg", retryable: false });
  });

  it("maps Meta FB error", () => {
    const err = mapReportingError(
      { response: { status: 400, data: { error: { code: 100, message: "Permission denied" } } } },
      "meta",
    );
    expect(err.data).toMatchObject({ platform: "meta", upstreamCode: 100, retryable: false });
  });

  it("preserves existing ReportingError unchanged", () => {
    const original = new ReportingError("test", { platform: "ttd", upstreamCode: 1, retryable: false });
    expect(mapReportingError(original, "ttd")).toBe(original);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm vitest run tests/utils/report-errors.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```ts
// packages/shared/src/utils/report-errors.ts
import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";

export type ReportingPlatform =
  | "ttd" | "meta" | "google" | "dbm" | "cm360" | "sa360" | "tiktok"
  | "linkedin" | "pinterest" | "snapchat" | "amazonDsp" | "microsoft";

export interface ReportingErrorData {
  platform: ReportingPlatform;
  upstreamCode?: string | number;
  retryable: boolean;
  rawMessage?: string;
}

export class ReportingError extends McpError {
  readonly platform: ReportingPlatform;
  readonly upstreamCode?: string | number;
  readonly retryable: boolean;
  constructor(message: string, data: ReportingErrorData) {
    super(message, { code: JsonRpcErrorCode.InternalError, data });
    this.name = "ReportingError";
    this.platform = data.platform;
    this.upstreamCode = data.upstreamCode;
    this.retryable = data.retryable;
  }
}

export function mapReportingError(err: unknown, platform: ReportingPlatform): ReportingError {
  if (err instanceof ReportingError) return err;
  const anyErr = err as { response?: { status?: number; data?: unknown }; message?: string };
  const status = anyErr.response?.status;
  const body = anyErr.response?.data as Record<string, unknown> | undefined;
  const retryable = status === 429 || (typeof status === "number" && status >= 500);

  let upstreamCode: string | number | undefined = status;
  let msg = anyErr.message ?? "Reporting call failed";

  if (platform === "ttd" && body) {
    const e = body as { ErrorCode?: string; Message?: string };
    if (e.ErrorCode) upstreamCode = e.ErrorCode;
    if (e.Message) msg = e.Message;
  } else if (platform === "meta" && body) {
    const e = body as { error?: { code?: number; message?: string } };
    if (e.error?.code) upstreamCode = e.error.code;
    if (e.error?.message) msg = e.error.message;
  } else if (platform === "google" && body) {
    const e = body as { error?: { status?: string; message?: string } };
    if (e.error?.status) upstreamCode = e.error.status;
    if (e.error?.message) msg = e.error.message;
  } else if (platform === "microsoft" && body) {
    const e = body as { Errors?: Array<{ Code?: string; Message?: string }> };
    if (e.Errors?.[0]?.Code) upstreamCode = e.Errors[0].Code;
    if (e.Errors?.[0]?.Message) msg = e.Errors[0].Message!;
  }

  return new ReportingError(msg, { platform, upstreamCode, retryable, rawMessage: msg });
}
```

Add to `packages/shared/src/index.ts`:
```ts
export * from "./utils/report-errors.js";
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared && pnpm vitest run tests/utils/report-errors.test.ts`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add packages/shared/src/utils/report-errors.ts \
        packages/shared/tests/utils/report-errors.test.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): add mapReportingError and ReportingError base class"
```

---

### Task 1.6: Rebuild shared package + gate Phase 1

**Files:** none (verification only)

**Step 1: Typecheck and test the whole shared package**

Run: `cd packages/shared && pnpm run typecheck && pnpm run test`
Expected: PASS.

**Step 2: Rebuild workspace**

Run: `pnpm run build`
Expected: all packages build green (none consume the new helpers yet).

**Step 3: Commit (empty — marker)**

Skip — nothing to commit. Phase 1 is done when the five tasks above are on `main`.

---

## Phase 2 — Adoption

Twelve tasks, one per server. All follow the **migration template** below, adapted to each server's service files.

### Migration template (applies to every Phase 2 task)

For each server:

1. **Find reporting service + tool files:**
   - `packages/<server>/src/services/*reporting*.ts` (or whichever file drives submit/poll/download)
   - `packages/<server>/src/mcp-server/tools/definitions/submit-report.tool.ts`
   - `packages/<server>/src/mcp-server/tools/definitions/check-report-status.tool.ts`
   - `packages/<server>/src/mcp-server/tools/definitions/download-report.tool.ts`
   - `packages/<server>/src/mcp-server/tools/definitions/get-report.tool.ts` (blocking wrapper, if present)
2. **Polling:** replace inline `for` / `setTimeout` poll loops with `pollUntilComplete` from `@cesteral/shared`.
3. **CSV parsing:** replace local parser with `parseCSV` from `@cesteral/shared`. Delete dead parser code.
4. **Computed metrics:** import `ComputedMetricsFlagSchema` and `appendComputedMetricsToRows`. Merge the flag schema into the download tool's input schema. Remove server-local computation.
5. **Status normalization:** in the service layer, map raw platform status through `from{Platform}Status` before returning. `check_report_status` tool returns `ReportStatusSchema.parse(normalized)`.
6. **Error mapping:** in the service layer `catch` blocks, replace `throw new McpError(...)` / `McpError.fromError(err)` with `throw mapReportingError(err, '<platform>')`.
7. **Fixtures:** update `packages/<server>/tests/fixtures/*.json` to match new response shapes.
8. **Tests:** add fixture-driven tests covering (a) status shape validates against `ReportStatusSchema`, (b) download tool honors `includeComputedMetrics`, (c) error path surfaces `ReportingError`.
9. **Verification:** `cd packages/<server> && pnpm run typecheck && pnpm run test`.
10. **Commit:** one commit per server. Commit message: `refactor(<server>-mcp): adopt shared reporting helpers (polling, csv, metrics, status, errors)`.

### Task 2.1: Migrate `ttd-mcp`

**Files:**
- Modify: `packages/ttd-mcp/src/services/ttd/ttd-reporting-service.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/check-report-status.tool.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/download-report.tool.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/get-report.tool.ts`
- Modify: `packages/ttd-mcp/tests/fixtures/*.json` (as needed)

**Step 1: Write the failing tests**

Add `packages/ttd-mcp/tests/reporting-canonicalization.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ReportStatusSchema } from "@cesteral/shared";
import { checkReportStatusHandler } from "../src/mcp-server/tools/definitions/check-report-status.tool.js";
// ... build a mock session that returns a TTD "Complete" status
it("check_report_status returns ReportStatusSchema-shaped output", async () => {
  const result = await checkReportStatusHandler({ reportScheduleId: "abc" }, mockCtx);
  const parsed = JSON.parse(result.content[0]!.text as string);
  expect(() => ReportStatusSchema.parse(parsed)).not.toThrow();
});
```

Add a test asserting the download tool passes `includeComputedMetrics` through, and a test asserting upstream 429 throws `ReportingError` with `retryable: true`.

**Step 2: Run test to verify it fails**

Run: `cd packages/ttd-mcp && pnpm vitest run tests/reporting-canonicalization.test.ts`
Expected: FAIL (current code doesn't return canonical shape).

**Step 3: Apply the migration template**

Follow steps 2–6 from the migration template above against the TTD files. Key call sites to update:
- `ttd-reporting-service.ts` polling loop → `pollUntilComplete`
- `ttd-reporting-service.ts` CSV parse → `parseCSV`
- `check-report-status.tool.ts` → `fromTtdStatus(rawStatus)` → `ReportStatusSchema.parse(...)`
- Error `catch` blocks → `mapReportingError(err, "ttd")`
- `download-report.tool.ts` input schema → `.merge(ComputedMetricsFlagSchema)`; pass flag to `appendComputedMetricsToRows` inside the download path.

**Step 4: Run tests to verify they pass**

Run: `cd packages/ttd-mcp && pnpm run typecheck && pnpm run test`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/ttd-mcp
git commit -m "refactor(ttd-mcp): adopt shared reporting helpers (polling, csv, metrics, status, errors)"
```

---

### Task 2.2: Migrate `meta-mcp`

**Files:**
- Modify: `packages/meta-mcp/src/services/reporting-service.ts`
- Modify: `packages/meta-mcp/src/mcp-server/tools/definitions/{submit,check,download,get}-report.tool.ts`
- Modify: `packages/meta-mcp/tests/fixtures/*.json`

**Step 1–5:** Apply migration template. Use `fromMetaStatus` in step 5, `mapReportingError(err, "meta")` in step 6.

Commit: `refactor(meta-mcp): adopt shared reporting helpers (polling, csv, metrics, status, errors)`

---

### Task 2.3: Migrate `cm360-mcp`

Files under `packages/cm360-mcp/src/services/` + reporting tool definitions. Use `fromGoogleStatus` (CM360 uses Google long-running operation shape); `mapReportingError(err, "cm360")`.

---

### Task 2.4: Migrate `sa360-mcp`

Files under `packages/sa360-mcp/src/services/` + reporting tool definitions. Use `fromGoogleStatus`; `mapReportingError(err, "sa360")`.

---

### Task 2.5: Migrate `tiktok-mcp`

Files under `packages/tiktok-mcp/src/services/` + reporting tool definitions. TikTok uses custom status codes — add `fromTikTokStatus` to `schemas/report-status.ts` in a small follow-up PR, or map inline in the service layer. `mapReportingError(err, "tiktok")`.

---

### Task 2.6: Migrate `snapchat-mcp`

Same pattern. Add `fromSnapchatStatus` normalizer. `mapReportingError(err, "snapchat")`.

---

### Task 2.7: Migrate `amazon-dsp-mcp`

Same pattern. Add `fromAmazonDspStatus` normalizer. `mapReportingError(err, "amazonDsp")`.

---

### Task 2.8: Migrate `msads-mcp`

Uses `fromMicrosoftStatus`. `mapReportingError(err, "microsoft")`.

---

### Task 2.9: Migrate `pinterest-mcp`

Pinterest already uses `ReportCsvStore`; migration focuses on polling + CSV parser dedup + status canonicalization. Add `fromPinterestStatus`. `mapReportingError(err, "pinterest")`.

---

### Task 2.10: Migrate `dbm-mcp`

DBM already uses bounded view. Migration scope:
- Swap any Bid Manager query polling to `pollUntilComplete`.
- Swap CSV parse to shared `parseCSV`.
- Normalize long-running-query status via `fromGoogleStatus`.
- `mapReportingError(err, "dbm")`.

---

### Task 2.11: Migrate `gads-mcp`

Synchronous GAQL — scope is narrow:
- No polling.
- Use shared `parseCSV` if any CSV is returned.
- Error mapping: `mapReportingError(err, "google")`.
- Computed-metrics flag on `gads_get_insights`.

---

### Task 2.12: Migrate `linkedin-mcp` (bounded-view migration + shared helpers)

**Files:**
- Modify: `packages/linkedin-mcp/src/mcp-server/tools/definitions/get-analytics.tool.ts`
- Modify: `packages/linkedin-mcp/src/mcp-server/tools/definitions/get-analytics-breakdowns.tool.ts`
- Modify: `packages/linkedin-mcp/src/services/*analytics*.ts`
- Create: `packages/linkedin-mcp/tests/bounded-view.test.ts`

**Step 1: Write the failing test**

```ts
// packages/linkedin-mcp/tests/bounded-view.test.ts
import { describe, expect, it } from "vitest";
import { ReportViewOutputSchema } from "@cesteral/shared";
import { getAnalyticsHandler } from "../src/mcp-server/tools/definitions/get-analytics.tool.js";

describe("linkedin_get_analytics bounded view", () => {
  it("returns ReportViewOutputSchema-conformant payload", async () => {
    // mock: LinkedIn API returns 3 elements
    const result = await getAnalyticsHandler(
      { accountId: "123", pivots: ["CAMPAIGN"], mode: "summary", maxRows: 10 },
      mockCtx,
    );
    const parsed = JSON.parse(result.content[0]!.text as string);
    expect(() => ReportViewOutputSchema.parse(parsed)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/linkedin-mcp && pnpm vitest run tests/bounded-view.test.ts`
Expected: FAIL — handler still returns raw `{ elements, paging }`.

**Step 3: Write minimal implementation**

- Input schema: `.merge(ReportViewInputSchema.omit({ offset: true }))` (LinkedIn uses `start`/`count` cursors, not offset).
- Handler: call LinkedIn Insights API, flatten `elements` into `Record<string, string>` rows keyed by pivot + metric names, and wrap via the shared bounded-view helper.
- Output: `{ ...ReportViewOutputSchema fields, nextStart, fetchedAllRows }` (mirror Meta precedent).
- Apply the rest of the migration template (shared parser N/A for JSON API, but polling/error mapping/computed metrics still apply).

**Step 4: Run test to verify it passes**

Run: `cd packages/linkedin-mcp && pnpm run typecheck && pnpm run test`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/linkedin-mcp
git commit -m "refactor(linkedin-mcp): adopt bounded-view contract and shared reporting helpers"
```

---

### Task 2.13: Phase 2 gate — dead-code check

**Files:** none

**Step 1: Grep for removed duplicates**

Run:
```bash
# Should return zero matches across non-shared packages:
grep -rn "function parseCsvLine" packages/ | grep -v "/shared/"
grep -rn "function sleep.*Promise.*setTimeout" packages/ | grep -v "/shared/"
grep -rn "exponential.*backoff" packages/ | grep -v "/shared/"
```
Expected: no matches outside `packages/shared`.

**Step 2: Full build + typecheck + test**

Run: `pnpm run build && pnpm run typecheck && pnpm run test`
Expected: PASS.

**Step 3: Commit (marker only, skip if clean)**

Phase 2 is done when Tasks 2.1–2.12 are on `main` and the grep above is clean.

---

## Phase 3 — Per-Server Features

### Track 3A — `report-csv://` resources for 5 servers

#### Task 3A.0: Shared resource handler factory

**Files:**
- Create: `packages/shared/src/utils/report-csv-resource.ts`
- Create: `packages/shared/tests/utils/report-csv-resource.test.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1:** Extract the Pinterest resource handler pattern into `createReportCsvResourceHandler(store)` that returns an MCP resource handler.

**Step 2:** Fixture test stores a CSV, resolves `report-csv://<id>`, asserts content + redaction.

**Step 3:** Commit: `feat(shared): add createReportCsvResourceHandler factory`

#### Task 3A.1: Add `report-csv://` resource to `ttd-mcp`

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/download-report.tool.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/resources/index.ts`
- Modify: `packages/ttd-mcp/src/services/session-services.ts` (add per-session `ReportCsvStore`)
- Modify: `packages/ttd-mcp/tests/download-report.test.ts`

**Step 1:** Test asserts `download-report { storeRawCsv: true }` returns `csvResourceUri` and the resource resolves to the full CSV.

**Step 2:** Run — FAIL (flag/resource not wired).

**Step 3:** Add `storeRawCsv` to input schema; write CSV to `ReportCsvStore`; register handler via `createReportCsvResourceHandler`.

**Step 4:** Run — PASS.

**Step 5:** Commit: `feat(ttd-mcp): expose raw report CSVs via report-csv:// MCP resources`

#### Tasks 3A.2–3A.5: Repeat for `tiktok-mcp`, `snapchat-mcp`, `amazon-dsp-mcp`, `msads-mcp`

Same 5-step pattern as 3A.1. One commit per server. Commit messages follow the Pinterest precedent: `feat(<server>-mcp): expose raw report CSVs via report-csv:// MCP resources`.

---

### Track 3B — Discovery tools for Meta and SA360

#### Task 3B.1: `meta_get_available_metrics`

**Files:**
- Create: `packages/meta-mcp/src/config/insights-catalog.json`
- Create: `packages/meta-mcp/src/mcp-server/tools/definitions/get-available-metrics.tool.ts`
- Modify: `packages/meta-mcp/src/mcp-server/tools/index.ts`
- Create: `packages/meta-mcp/tests/get-available-metrics.test.ts`

**Step 1:** Test asserts the tool returns `{ entityType: "Ad" | "AdSet" | "Campaign", metrics: [...], breakdowns: [...], actionBreakdowns: [...] }` shape.

**Step 2:** FAIL — tool missing.

**Step 3:** Seed the JSON catalog from Meta Marketing API v24.0 docs. Tool reads the catalog, filters by `entityType` param, returns the slice.

**Step 4:** PASS.

**Step 5:** Commit: `feat(meta-mcp): add meta_get_available_metrics discovery tool`

#### Task 3B.2: `sa360_list_report_columns`

**Files:**
- Create: `packages/sa360-mcp/src/mcp-server/tools/definitions/list-report-columns.tool.ts`
- Create: `packages/sa360-mcp/src/config/report-columns-catalog.json` (fallback if live endpoint unavailable)
- Modify: `packages/sa360-mcp/src/mcp-server/tools/index.ts`
- Create: `packages/sa360-mcp/tests/list-report-columns.test.ts`

**Step 1–5:** Same pattern. Tool prefers the live `searchFields` equivalent when available; falls back to the catalog.

Commit: `feat(sa360-mcp): add sa360_list_report_columns discovery tool`

---

### Track 3C — Native scheduling for Meta and SA360; normalization for TTD/CM360/MSADS

#### Task 3C.0: `ReportScheduleSummarySchema` in `@cesteral/shared`

**Files:**
- Create: `packages/shared/src/schemas/report-schedule.ts`
- Create: `packages/shared/tests/schemas/report-schedule.test.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1:** Define `ReportScheduleSummarySchema` with fields: `scheduleId`, `name`, `platform`, `frequency` (SINGLE_RUN|DAILY|WEEKLY|MONTHLY|QUARTERLY|CUSTOM), `status` (ACTIVE|DISABLED), `reportType?`, `advertiserIds?`, `nextRunAt?`, `lastRunAt?`, `createdAt?`, `updatedAt?`.

**Step 2–5:** Fixture tests validate round-trip from TTD/CM360/MSADS response shapes.

Commit: `feat(shared): add ReportScheduleSummarySchema`

#### Task 3C.1: Normalize TTD/CM360/MSADS list/get responses to `ReportScheduleSummarySchema`

Three separate commits (one per server), updating existing list/get tools to map into the summary schema.

Commit messages:
- `refactor(ttd-mcp): normalize schedule list/get to ReportScheduleSummarySchema`
- `refactor(cm360-mcp): normalize schedule list/get to ReportScheduleSummarySchema`
- `refactor(msads-mcp): normalize schedule list/get to ReportScheduleSummarySchema`

#### Task 3C.2: `meta_{create,list,delete}_report_schedule`

**Files:**
- Create: `packages/meta-mcp/src/services/report-schedule-service.ts`
- Create: `packages/meta-mcp/src/mcp-server/tools/definitions/{create,list,delete}-report-schedule.tool.ts`
- Modify: `packages/meta-mcp/src/mcp-server/tools/index.ts`
- Create: `packages/meta-mcp/tests/report-schedules.test.ts`

**Step 1:** Fixture test covers create → list → delete cycle; asserts `ReportScheduleSummarySchema` on list/get; asserts `ReportingError` with `upstreamCode: 100` on "not entitled" path.

**Step 2:** FAIL.

**Step 3:** Implement service against Meta async reports + custom exports endpoint; gate on entitlement via `mapReportingError(err, "meta")`.

**Step 4:** PASS.

**Step 5:** Commit: `feat(meta-mcp): add meta report schedule CRUD tools`

#### Task 3C.3: `sa360_{create,list,delete}_report_schedule`

Same structure against SA360 v2 recurring report endpoints.

Commit: `feat(sa360-mcp): add sa360 report schedule CRUD tools`

---

### Task 3D: Phase 3 gate

**Files:** none

**Step 1:** Run `pnpm run build && pnpm run typecheck && pnpm run test`. PASS.
**Step 2:** Manually smoke-test (via `curl` MCP ping) that each new tool registers. Done when all Phase 3 tasks are green on `main`.

---

## Phase 4 — GCS-Backed CSV Spill

### Task 4.1: Shared `report-spill.ts` helper + streamed download

**Files:**
- Create: `packages/shared/src/utils/report-spill.ts`
- Create: `packages/shared/src/utils/download-file-stream.ts`
- Create: `packages/shared/tests/utils/report-spill.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add `@google-cloud/storage` dependency)

**Step 1: Write the failing test**

Fixture tests mock `@google-cloud/storage` and assert:
- Below threshold: spill disabled, bounded view returned only.
- Above threshold: spill triggered, `{ bucket, objectName, bytes, rowCount, signedUrl, expiresAt }` returned.
- Spill failure: bounded view returned with `spill.error`, no `csvResourceUri`.

**Step 2:** FAIL — module missing.

**Step 3:** Implement `spillCsvToGcs({ stream, sessionId, server, reportId, thresholdBytes, thresholdRows })` using tee-split Node streams. When enabled (`REPORT_SPILL_BUCKET` set), pipe one branch to GCS `createWriteStream`, the other to the existing bounded-view parser. Generate signed URL via `getSignedUrl({ action: "read", expires: Date.now() + ttl*1000 })`.

**Step 4:** PASS.

**Step 5:** Commit: `feat(shared): add GCS-backed CSV spill helper`

### Task 4.2: Wire spill into Pinterest download tool (reference implementation)

**Files:**
- Modify: `packages/pinterest-mcp/src/mcp-server/tools/definitions/download-report.tool.ts`
- Modify: `packages/pinterest-mcp/tests/download-report.test.ts`
- Modify: `packages/pinterest-mcp/src/config/*.ts` (add `REPORT_SPILL_BUCKET`, `REPORT_SPILL_THRESHOLD_*` envs)

**Step 1:** Test: when `REPORT_SPILL_BUCKET` set and CSV exceeds 16 MB, `spill.bucket` is returned and `report-csv://<id>` resolves via GCS.

**Step 2:** FAIL.

**Step 3:** Replace synchronous `downloadFile` call with streaming downloader; wire through `spillCsvToGcs`.

**Step 4:** PASS.

**Step 5:** Commit: `feat(pinterest-mcp): enable GCS-backed CSV spill for large reports`

### Tasks 4.3–4.7: Wire spill into TTD, TikTok, Snapchat, Amazon DSP, MSADS

Same 5-step pattern as 4.2. One commit per server. Commit: `feat(<server>-mcp): enable GCS-backed CSV spill for large reports`.

### Task 4.8: Session cleanup hook

**Files:**
- Modify: `packages/shared/src/utils/session-store.ts`
- Modify: `packages/shared/src/utils/report-spill.ts`

**Step 1:** Test: closing a session deletes all spill objects under `/${sessionId}/`.

**Step 2:** FAIL.

**Step 3:** Register a cleanup callback on `SessionServiceStore` that calls `bucket.deleteFiles({ prefix: ${server}/${sessionId}/ })`.

**Step 4:** PASS.

**Step 5:** Commit: `feat(shared): cleanup GCS spill objects on session close`

### Task 4.9: Terraform bucket + lifecycle rule

**Files:**
- Modify: `terraform/gcs.tf` (or appropriate file in `terraform/`)

**Step 1:** Add `google_storage_bucket "report_spill"` resource with a 24-hour `lifecycle_rule { condition { age = 1 } action { type = "Delete" } }`.

**Step 2:** Run `cd terraform && terraform validate && terraform plan`
Expected: plan shows 1 resource to add, 1 lifecycle rule.

**Step 3:** Commit: `infra(terraform): provision GCS report-spill bucket with 24h lifecycle`

### Task 4.10: Document `REPORT_SPILL_*` envs in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Step 1:** Add a `## Report CSV Spill` section listing `REPORT_SPILL_BUCKET`, `REPORT_SPILL_THRESHOLD_BYTES`, `REPORT_SPILL_THRESHOLD_ROWS`, `REPORT_SPILL_SIGNED_URL_TTL_SECONDS` with defaults and behavior when unset.

**Step 2:** Commit: `docs(claude-md): document REPORT_SPILL_* environment variables`

### Task 4.11: Phase 4 gate

**Step 1:** `pnpm run build && pnpm run typecheck && pnpm run test` — PASS.
**Step 2:** Verify fixture tests prove spill triggers above threshold and bounded-view-only path runs below.
**Step 3:** Done.

---

## Final Gate — Whole-plan verification

- All Phase 1–4 exit criteria satisfied.
- Grep confirms no duplicated polling/CSV/status logic outside `@cesteral/shared`.
- Update [MEMORY.md](~/.claude/projects/-Users-daniel-thorner-GitHub-cesteral-mcp-servers/memory/MEMORY.md) index with a pointer to the delivered consistency work.
- Consider requesting code review via `superpowers:requesting-code-review`.
