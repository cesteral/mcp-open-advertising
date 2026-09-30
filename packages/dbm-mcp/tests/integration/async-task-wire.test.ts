/**
 * #245: dbm_run_custom_query_async must complete over the real MCP wire.
 *
 * The capabilities test only checks that the tool is listed. The server used to
 * be built with no `taskStore` and no `tasks` capability, so every call failed
 * inside the SDK ("No task store provided.") while the listing test stayed
 * green. This drives `createMcpServer` with a real SDK Client: task-augmented
 * call → poll → result.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import pino from "pino";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const { mockExecuteCustomQuery } = vi.hoisted(() => ({
  mockExecuteCustomQuery: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: () => ({
    bidManagerService: { executeCustomQuery: mockExecuteCustomQuery },
  }),
}));

import { createMcpServer } from "../../src/mcp-server/server.js";

const TOOL_NAME = "dbm_run_custom_query_async";

const validArgs = {
  reportType: "STANDARD",
  groupBys: ["FILTER_DATE"],
  metrics: ["METRIC_IMPRESSIONS"],
  dateRange: { preset: "LAST_7_DAYS" },
  strictValidation: false,
};

describe("dbm_run_custom_query_async over the SDK", () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeEach(async () => {
    mockExecuteCustomQuery.mockReset();
    mockExecuteCustomQuery.mockResolvedValue({
      queryId: "q-1",
      reportId: "r-1",
      status: "DONE",
      rowCount: 1,
      columns: ["Date", "Impressions"],
      data: [{ Date: "2026-01-01", Impressions: 1000 }],
    });

    const server = await createMcpServer(pino({ level: "silent" }), "session-1");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "task-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    close = async () => {
      await client.close();
      await server.close();
    };
  });

  afterEach(async () => {
    await close();
  });

  it("advertises the tasks capability for tools/call", () => {
    const caps = client.getServerCapabilities();
    expect(caps?.tasks?.requests?.tools?.call).toBeDefined();
  });

  it("completes a task-augmented call and returns the query result", async () => {
    const messages: Array<{ type: string; [key: string]: unknown }> = [];
    const stream = client.experimental.tasks.callToolStream(
      { name: TOOL_NAME, arguments: validArgs },
      CallToolResultSchema,
      { task: { ttl: 60_000 } }
    );
    for await (const message of stream) {
      messages.push(message as { type: string });
    }

    const types = messages.map((m) => m.type);
    expect(types[0]).toBe("taskCreated");
    expect(types).not.toContain("error");
    expect(types.at(-1)).toBe("result");

    const result = messages.at(-1)!.result as {
      isError?: boolean;
      structuredContent?: { queryId?: string };
    };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.queryId).toBe("q-1");
    expect(mockExecuteCustomQuery).toHaveBeenCalledTimes(1);
  });

  it("stores a failed task result when the query throws", async () => {
    mockExecuteCustomQuery.mockRejectedValueOnce(new Error("upstream exploded"));

    const messages: Array<{ type: string; [key: string]: unknown }> = [];
    const stream = client.experimental.tasks.callToolStream(
      { name: TOOL_NAME, arguments: validArgs },
      CallToolResultSchema,
      { task: { ttl: 60_000 } }
    );
    for await (const message of stream) {
      messages.push(message as { type: string });
    }

    expect(messages[0]!.type).toBe("taskCreated");
    // The SDK client reports a `failed` task status as an error message
    // rather than fetching its result…
    expect(messages.at(-1)!.type).toBe("error");

    // …so read the stored result directly: it must be the redacted isError
    // payload runInBackground recorded, not a missing task.
    const taskId = (messages[0]!.task as { taskId: string }).taskId;
    const stored = await client.experimental.tasks.getTaskResult(taskId, CallToolResultSchema);
    expect(stored.isError).toBe(true);
    expect(JSON.stringify(stored.content)).toContain("upstream exploded");
  });
});
