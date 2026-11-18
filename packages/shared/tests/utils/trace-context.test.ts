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
import { Client } from "@modelcontextprotocol/client";
import {
  McpServer,
  InMemoryTransport,
  createMcpHandler,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
} from "@modelcontextprotocol/server";
import {
  remoteParentFromMeta,
  remoteParentFromRequest,
} from "../../src/utils/observability/trace-context.js";
import { withSpan } from "../../src/utils/observability/telemetry.js";
import { registerToolsFromDefinitions } from "../../src/utils/mcp/tool-handler-factory.js";
import { extractZodShape } from "../../src/utils/mcp/zod-helpers.js";
import { NO_UNTRUSTED_CONTENT } from "../../src/utils/mcp/untrusted-content.js";

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

describe("remoteParentFromRequest (#247)", () => {
  const OTHER_TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
  const OTHER_SPAN_ID = "b7ad6b7169203331";
  const headerOf = (h: Record<string, string>) => ({
    get: (n: string) => h[n.toLowerCase()] ?? null,
  });

  it("falls back to the HTTP traceparent header when _meta has none", () => {
    const parent = remoteParentFromRequest(
      undefined,
      headerOf({ traceparent: TRACEPARENT, tracestate: "v=1" })
    );
    expect(parent).toMatchObject({ traceId: TRACE_ID, spanId: SPAN_ID, isRemote: true });
    expect(parent?.traceState?.get("v")).toBe("1");
  });

  it("prefers _meta over the header", () => {
    const parent = remoteParentFromRequest(
      { traceparent: `00-${OTHER_TRACE_ID}-${OTHER_SPAN_ID}-01` },
      headerOf({ traceparent: TRACEPARENT })
    );
    expect(parent?.traceId).toBe(OTHER_TRACE_ID);
  });

  it("uses the header when the _meta traceparent is invalid", () => {
    const parent = remoteParentFromRequest(
      { traceparent: "garbage" },
      headerOf({ traceparent: TRACEPARENT })
    );
    expect(parent?.traceId).toBe(TRACE_ID);
  });

  it("does not pair a header tracestate with a _meta traceparent", () => {
    const parent = remoteParentFromRequest(
      { traceparent: TRACEPARENT },
      headerOf({ tracestate: "v=1" })
    );
    expect(parent?.traceState).toBeUndefined();
  });

  it("ignores an invalid header, missing headers, and never reads baggage", () => {
    expect(remoteParentFromRequest(undefined, headerOf({ traceparent: "nope" }))).toBeUndefined();
    expect(remoteParentFromRequest(undefined, undefined)).toBeUndefined();
    const get = vi.fn(() => null);
    remoteParentFromRequest(undefined, { get });
    expect(get.mock.calls.map((c) => c[0])).not.toContain("baggage");
  });
});

describe("HTTP traceparent header over the SDK handler (#247)", () => {
  const OTHER = `00-${"c".repeat(32)}-${"d".repeat(16)}-01`;
  let started: { name: string; parent: SpanContext | undefined }[];

  beforeEach(() => {
    started = [];
    vi.spyOn(trace, "getTracer").mockReturnValue({
      startSpan: (name: string, _o?: SpanOptions, ctx?: Context) => {
        started.push({ name, parent: ctx ? trace.getSpanContext(ctx) : undefined });
        return trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      },
    } as unknown as Tracer);
  });
  afterEach(() => vi.restoreAllMocks());

  async function call(headerTp?: string, metaTp?: string) {
    const handler = createMcpHandler(() => {
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
      return server;
    });
    const res = await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-method": "tools/call",
          "mcp-name": "probe_trace",
          "mcp-protocol-version": "2026-07-28",
          ...(headerTp && { traceparent: headerTp }),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "probe_trace",
            arguments: {},
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
              [CLIENT_INFO_META_KEY]: { name: "c", version: "0.0.0" },
              [CLIENT_CAPABILITIES_META_KEY]: {},
              ...(metaTp && { traceparent: metaTp }),
            },
          },
        }),
      })
    );
    expect(res.status).toBe(200);
    await res.text();
    return started.filter((s) => s.name === "tool.probe_trace");
  }

  it("parents the tool span on the header traceparent", async () => {
    const spans = await call(TRACEPARENT);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.parent).toMatchObject({ traceId: TRACE_ID, spanId: SPAN_ID, isRemote: true });
  });

  it("lets _meta win over the header", async () => {
    const spans = await call(OTHER, TRACEPARENT);
    expect(spans[0]!.parent?.traceId).toBe(TRACE_ID);
  });

  it("starts no remote parent when neither carries one", async () => {
    expect((await call())[0]!.parent).toBeUndefined();
  });
});
