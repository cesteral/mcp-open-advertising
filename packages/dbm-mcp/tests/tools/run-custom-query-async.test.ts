import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * dbm_run_custom_query_async end-to-end over a real MCP Client ↔ McpServer
 * pair. The tool is registered with `taskSupport: "required"`, so it is only
 * usable when the server advertises the `tasks` capability AND was built with
 * a task store — before that was wired, every task-augmented call failed with
 * "Server does not support task creation" and every plain call with
 * "requires task augmentation". These tests drive the real protocol path.
 */

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolResultSchema,
  CreateTaskResultSchema,
  GetTaskResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServer } from "../../src/mcp-server/server.js";
import { computeAsyncQueryTaskTtlMs } from "../../src/mcp-server/tools/definitions/run-custom-query-async.tool.js";
import { computeWorstCaseReportDurationMs } from "../../src/services/bid-manager/report-timing.js";
import { mcpConfig } from "../../src/config/index.js";

const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
};
logger.child.mockReturnValue(logger);

const toolArgs = {
  reportType: "STANDARD",
  groupBys: ["FILTER_DATE"],
  metrics: ["METRIC_IMPRESSIONS"],
  dateRange: { preset: "LAST_7_DAYS" },
};

async function connect(): Promise<{ client: Client; server: McpServer }> {
  const server = await createMcpServer(logger, "sess-async");
  const client = new Client(
    { name: "async-test-client", version: "1.0.0" },
    { capabilities: { tasks: {} } as any }
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

async function waitForTerminal(client: Client, taskId: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const task = await client.request(
      { method: "tasks/get", params: { taskId } },
      GetTaskResultSchema
    );
    if (task.status !== "working") return task.status;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("task never reached a terminal status");
}

describe("dbm_run_custom_query_async over MCP", () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    mockResolveSessionServices.mockReturnValue({
      bidManagerService: {
        executeCustomQuery: vi.fn().mockResolvedValue({
          queryId: "q-1",
          reportId: "r-1",
          status: "DONE",
          rowCount: 1,
          columns: ["Date", "Impressions"],
          data: [{ Date: "2026-01-01", Impressions: "1000" }],
        }),
      },
    });
    ({ client, server } = await connect());
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    vi.clearAllMocks();
  });

  it("advertises the tasks capability for tools/call", () => {
    const caps = client.getServerCapabilities() as any;
    expect(caps.tasks?.requests?.tools?.call).toBeDefined();
  });

  it("creates a task, completes it, and returns the report through tasks/result", async () => {
    const created = await client.request(
      {
        method: "tools/call",
        params: { name: "dbm_run_custom_query_async", arguments: toolArgs, task: { ttl: 60_000 } },
      },
      CreateTaskResultSchema
    );
    expect(created.task.taskId).toBeTruthy();

    expect(await waitForTerminal(client, created.task.taskId)).toBe("completed");

    const result = await client.request(
      { method: "tasks/result", params: { taskId: created.task.taskId } },
      CallToolResultSchema
    );
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as any).queryId).toBe("q-1");
  });

  it("uses a task TTL that outlives the worst-case report run", async () => {
    const created = await client.request(
      {
        method: "tools/call",
        params: { name: "dbm_run_custom_query_async", arguments: toolArgs, task: { ttl: 60_000 } },
      },
      CreateTaskResultSchema
    );
    // The in-memory store deletes a task at its TTL regardless of status, so a
    // TTL shorter than the run would drop the result before it is stored.
    expect(created.task.ttl).toBeGreaterThan(computeWorstCaseReportDurationMs(mcpConfig));
    expect(created.task.ttl).toBe(computeAsyncQueryTaskTtlMs());
    await waitForTerminal(client, created.task.taskId);
  });

  it("records the real failure message when the query fails", async () => {
    mockResolveSessionServices.mockReturnValue({
      bidManagerService: {
        executeCustomQuery: vi.fn().mockRejectedValue(new Error("Invalid metric for report type")),
      },
    });
    const created = await client.request(
      {
        method: "tools/call",
        params: { name: "dbm_run_custom_query_async", arguments: toolArgs, task: { ttl: 60_000 } },
      },
      CreateTaskResultSchema
    );
    expect(await waitForTerminal(client, created.task.taskId)).toBe("failed");
    const result = await client.request(
      { method: "tasks/result", params: { taskId: created.task.taskId } },
      CallToolResultSchema
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Invalid metric for report type");
  });
});

describe("async task TTL sizing", () => {
  it("sums every poll sleep, every retry attempt and every cooldown", () => {
    // 2 attempts × (initial 100 + sleeps 100, 200) + 1 cooldown of 1000
    expect(
      computeWorstCaseReportDurationMs({
        reportPollInitialDelayMs: 100,
        reportPollMaxDelayMs: 1000,
        reportPollMaxRetries: 3,
        reportQueryRetries: 2,
        reportRetryCooldownMs: 1000,
      })
    ).toBe(2 * (100 + 100 + 200) + 1000);
  });

  it("covers the ~72 minute worst case of the shipped defaults", () => {
    const worst = computeWorstCaseReportDurationMs({
      reportPollInitialDelayMs: 5000,
      reportPollMaxDelayMs: 30000,
      reportPollMaxRetries: 30,
      reportQueryRetries: 5,
      reportRetryCooldownMs: 60000,
    });
    // initial 5s + sleeps 5,10,20 then 26×30s = 820s per attempt; ×5 + 4×60s
    expect(worst).toBe((5 * 820 + 4 * 60) * 1000);
  });
});
