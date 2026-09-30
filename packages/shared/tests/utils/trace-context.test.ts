/**
 * #247: a client's W3C trace context in `tools/call` `_meta` parents the tool
 * span (SEP-414, documented in MCP 2026-07-28).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import pino from "pino";
import {
  trace,
  context,
  INVALID_SPAN_CONTEXT,
  ROOT_CONTEXT,
  type Context,
  type SpanContext,
  type SpanOptions,
  type Tracer,
} from "@opentelemetry/api";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { remoteParentFromMeta } from "../../src/utils/trace-context.js";
import { withSpan } from "../../src/utils/telemetry.js";
import { registerToolsFromDefinitions } from "../../src/utils/tool-handler-factory.js";
import { extractZodShape } from "../../src/utils/zod-helpers.js";
import { NO_UNTRUSTED_CONTENT } from "../../src/utils/untrusted-content.js";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN_ID = "00f067aa0ba902b7";
const TRACEPARENT = `00-${TRACE_ID}-${SPAN_ID}-01`;

describe("remoteParentFromMeta", () => {
  it("parses a valid traceparent as a remote, sampled parent", () => {
    expect(remoteParentFromMeta({ traceparent: TRACEPARENT })).toMatchObject({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: 1,
      isRemote: true,
    });
  });

  it("keeps an unsampled flag unsampled", () => {
    expect(remoteParentFromMeta({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-00` })?.traceFlags).toBe(
      0
    );
  });

  it("carries tracestate", () => {
    const parent = remoteParentFromMeta({ traceparent: TRACEPARENT, tracestate: "vendor=abc" });
    expect(parent?.traceState?.get("vendor")).toBe("abc");
  });

  it.each([
    ["absent _meta", undefined],
    ["no traceparent", { other: 1 }],
    ["non-string", { traceparent: 42 }],
    ["garbage", { traceparent: "not-a-trace" }],
    ["uppercase hex", { traceparent: `00-${TRACE_ID.toUpperCase()}-${SPAN_ID}-01` }],
    ["version ff", { traceparent: `ff-${TRACE_ID}-${SPAN_ID}-01` }],
    ["v00 with trailing field", { traceparent: `${TRACEPARENT}-extra` }],
    ["all-zero trace id", { traceparent: `00-${"0".repeat(32)}-${SPAN_ID}-01` }],
    ["all-zero span id", { traceparent: `00-${TRACE_ID}-${"0".repeat(16)}-01` }],
  ])("ignores %s", (_label, meta) => {
    expect(remoteParentFromMeta(meta)).toBeUndefined();
  });

  it("accepts a future version with trailing fields", () => {
    expect(
      remoteParentFromMeta({ traceparent: `01-${TRACE_ID}-${SPAN_ID}-01-future` })
    ).toBeDefined();
  });
});

describe("tools/call _meta trace context over the SDK", () => {
  interface StartedSpan {
    name: string;
    parent: SpanContext | undefined;
    links: SpanContext[];
  }

  let started: StartedSpan[];

  beforeEach(() => {
    started = [];
    // Capture what the tool span is parented on. No tracer provider or
    // context manager is registered in unit tests, so asserting on the
    // active span inside the tool would see nothing either way.
    vi.spyOn(trace, "getTracer").mockReturnValue({
      startSpan: (name: string, options?: SpanOptions, ctx?: Context) => {
        started.push({
          name,
          parent: ctx ? trace.getSpanContext(ctx) : undefined,
          links: (options?.links ?? []).map((l) => l.context),
        });
        return trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      },
    } as unknown as Tracer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function connect() {
    const server = new McpServer({ name: "trace-probe", version: "0.0.0" });
    registerToolsFromDefinitions({
      server: server as never,
      tools: [
        {
          name: "probe_trace",
          description: "probe",
          inputSchema: z.object({}),
          untrustedContent: NO_UNTRUSTED_CONTENT,
          logic: async () => ({ ok: true }),
        },
      ],
      logger: pino({ level: "silent" }),
      transformSchema: (s) => extractZodShape(s),
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "trace-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return client;
  }

  const toolSpans = () => started.filter((s) => s.name === "tool.probe_trace");

  it("parents the tool span on the caller's traceparent", async () => {
    const client = await connect();
    await client.callTool({
      name: "probe_trace",
      arguments: {},
      _meta: { traceparent: TRACEPARENT },
    });
    await client.close();

    expect(toolSpans()).toHaveLength(1);
    expect(toolSpans()[0]!.parent).toMatchObject({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      isRemote: true,
    });
  });

  it("leaves the parent to the active context when _meta has no trace", async () => {
    const client = await connect();
    await client.callTool({ name: "probe_trace", arguments: {} });
    await client.close();

    expect(toolSpans()).toHaveLength(1);
    expect(toolSpans()[0]!.parent).toBeUndefined();
  });

  it("keeps an already-active span (e.g. the HTTP server span) as a link", async () => {
    const httpSpan: SpanContext = {
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      traceFlags: 1,
    };
    vi.spyOn(context, "active").mockReturnValue(trace.setSpanContext(ROOT_CONTEXT, httpSpan));

    await withSpan("tool.linked", async () => undefined, undefined, {
      parent: remoteParentFromMeta({ traceparent: TRACEPARENT }),
    });

    const span = started.find((s) => s.name === "tool.linked")!;
    expect(span.parent?.traceId).toBe(TRACE_ID);
    expect(span.links).toEqual([httpSpan]);
  });
});
