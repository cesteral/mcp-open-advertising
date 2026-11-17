// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

vi.mock("../../src/utils/mcp/tool-handler-factory.js", () => ({
  registerToolsFromDefinitions: vi.fn(() => {
    order.push("tools");
  }),
}));

vi.mock("../../src/utils/observability/interaction-logger.js", () => ({
  InteractionLogger: {
    shared: vi.fn().mockImplementation(function () {
      return { kind: "logger" };
    }),
  },
}));

import { createPlatformMcpServer } from "../../src/utils/mcp/platform-server-factory.js";
import { registerToolsFromDefinitions } from "../../src/utils/mcp/tool-handler-factory.js";
import { InteractionLogger } from "../../src/utils/observability/interaction-logger.js";
import { ReportCsvStore } from "../../src/utils/reporting/report-csv-store.js";

class FakeResourceTemplate {
  constructor(
    readonly uriTemplate: string,
    readonly options: { list: unknown }
  ) {}
}

class FakeMcpServer {
  static instances: FakeMcpServer[] = [];
  readonly resources: Array<{ id: string; target: unknown; metadata: Record<string, unknown> }> =
    [];
  readonly prompts: Array<{ name: string; config: Record<string, unknown> }> = [];
  readonly server = { elicitInput: vi.fn() };
  readonly sendLoggingMessage = vi.fn();
  readonly registerTool = vi.fn();

  constructor(
    readonly serverInfo: Record<string, unknown>,
    readonly options: Record<string, unknown>
  ) {
    FakeMcpServer.instances.push(this);
  }

  registerResource(id: string, target: unknown, metadata: Record<string, unknown>) {
    order.push(`resource:${id}`);
    this.resources.push({ id, target, metadata });
  }

  registerPrompt(name: string, config: Record<string, unknown>) {
    order.push(`prompt:${name}`);
    this.prompts.push({ name, config });
  }
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as never;

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    sdk: {
      McpServer: FakeMcpServer,
      ResourceTemplate: FakeResourceTemplate,
    },
    logger,
    packageName: "tiktok-mcp",
    platform: "tiktok",
    version: "9.9.9",
    description: "A description",
    instructions: "Some instructions",
    tools: [],
    resources: [
      {
        uri: "ref://static",
        name: "Static",
        description: "A static resource",
        mimeType: "text/plain",
        getContent: () => "static",
      },
    ],
    prompts: [
      {
        prompt: { name: "prompt_one", description: "First" },
        generateMessage: () => "one",
      },
      {
        prompt: {
          name: "prompt_two",
          arguments: [{ name: "campaignId", required: true }],
        },
        generateMessage: () => "two",
      },
    ],
    workflowIdByToolName: { tiktok_get_entity: "mcp.execute.tiktok_entity_read" },
    manifestUrl: new URL("file:///nonexistent/cesteral-manifest.json"),
    sessionServiceStore: { getAuthContext: vi.fn(), delete: vi.fn() },
    ...overrides,
  } as Parameters<typeof createPlatformMcpServer>[0];
}

describe("createPlatformMcpServer", () => {
  beforeEach(() => {
    order.length = 0;
    FakeMcpServer.instances.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.MCP_CONFORMANCE_FIXTURES;
  });

  it("builds the server with its info, the logging capability and its instructions", async () => {
    const server = (await createPlatformMcpServer(baseOptions())) as unknown as FakeMcpServer;

    expect(server.serverInfo).toMatchObject({
      name: "tiktok-mcp",
      version: "9.9.9",
      description: "A description",
    });
    expect(server.options).toEqual({
      capabilities: { logging: {} },
      instructions: "Some instructions",
    });
  });

  it("adds extra capabilities when given", async () => {
    const server = (await createPlatformMcpServer(
      baseOptions({ extraCapabilities: { completions: {} } })
    )) as unknown as FakeMcpServer;

    expect(server.options).toEqual({
      capabilities: { logging: {}, completions: {} },
      instructions: "Some instructions",
    });
  });

  it("registers tools, static resources, templated resources, report-csv, then prompts", async () => {
    await createPlatformMcpServer(
      baseOptions({
        templatedResources: [
          {
            uriTemplate: "tiktok-field-rules://{entityType}",
            name: "Field rules",
            description: "Rules",
            mimeType: "application/json",
            resolveContent: () => "{}",
          },
        ],
        reportCsv: {
          store: new ReportCsvStore(),
          platformLabel: "TikTok",
          downloadToolName: "tiktok_download_report",
        },
      })
    );

    expect(order).toEqual([
      "tools",
      "resource:ref___static",
      "resource:tiktok_field_rules____entityType_",
      "resource:report_csv_template",
      "prompt:prompt_one",
      "prompt:prompt_two",
    ]);
  });

  it("registers no report-csv template and no templated resources by default", async () => {
    const server = (await createPlatformMcpServer(baseOptions())) as unknown as FakeMcpServer;

    expect(server.resources.map((r) => r.id)).toEqual(["ref___static"]);
  });

  it("passes the platform wiring to the tool registration", async () => {
    const sessionServiceStore = { getAuthContext: vi.fn().mockReturnValue("ctx"), delete: vi.fn() };
    const workflowIdByToolName = { tiktok_get_entity: "mcp.execute.tiktok_entity_read" };
    await createPlatformMcpServer(
      baseOptions({
        sessionId: "sess-1",
        gcsBucket: "bucket",
        sessionServiceStore,
        workflowIdByToolName,
      })
    );

    expect(InteractionLogger.shared).toHaveBeenCalledWith({
      serverName: "tiktok-mcp",
      logger,
      gcsBucket: "bucket",
    });
    const call = vi.mocked(registerToolsFromDefinitions).mock.calls[0][0];
    expect(call).toMatchObject({
      packageName: "tiktok-mcp",
      platform: "tiktok",
      sessionId: "sess-1",
      defaultTextFormat: "compact",
      workflowIdByToolName,
      interactionLogger: { kind: "logger" },
    });
    expect(call.authContextResolver?.()).toBe("ctx");
    expect(sessionServiceStore.getAuthContext).toHaveBeenCalledWith("sess-1");
  });

  it("resolves definition hashes from the manifest only when it has one", async () => {
    await createPlatformMcpServer(baseOptions());
    expect(
      vi.mocked(registerToolsFromDefinitions).mock.calls[0][0].resolveManifestEntry
    ).toBeTypeOf("function");

    vi.mocked(registerToolsFromDefinitions).mockClear();
    await createPlatformMcpServer(baseOptions({ manifestUrl: undefined }));
    expect(
      vi.mocked(registerToolsFromDefinitions).mock.calls[0][0].resolveManifestEntry
    ).toBeUndefined();
  });

  it("has no auth-context resolver without a session id", async () => {
    await createPlatformMcpServer(baseOptions());

    const call = vi.mocked(registerToolsFromDefinitions).mock.calls[0][0];
    expect(call.authContextResolver).toBeUndefined();
  });

  it("drops the session on an Unauthorized tool failure only when asked to", async () => {
    const withDrop = { getAuthContext: vi.fn(), delete: vi.fn() };
    await createPlatformMcpServer(
      baseOptions({ sessionId: "s", sessionServiceStore: withDrop, dropSessionOnAuthError: true })
    );
    const dropping = vi.mocked(registerToolsFromDefinitions).mock.calls[0][0];
    dropping.onAuthError?.("stale-session", {} as never);
    expect(withDrop.delete).toHaveBeenCalledWith("stale-session");

    vi.mocked(registerToolsFromDefinitions).mockClear();
    await createPlatformMcpServer(baseOptions({ sessionId: "s" }));
    expect(vi.mocked(registerToolsFromDefinitions).mock.calls[0][0].onAuthError).toBeUndefined();
  });

  it("registers the conformance fixtures before the prompts only when enabled", async () => {
    await createPlatformMcpServer(baseOptions());
    expect(order.some((entry) => entry.includes("conformance"))).toBe(false);

    order.length = 0;
    process.env.MCP_CONFORMANCE_FIXTURES = "true";
    const server = (await createPlatformMcpServer(baseOptions())) as unknown as FakeMcpServer;

    expect(order.filter((entry) => entry.startsWith("resource:")).at(-1)).toBe(
      "resource:conformance_template"
    );
    expect(order.indexOf("resource:conformance_template")).toBeLessThan(
      order.indexOf("prompt:prompt_one")
    );
    expect(server.prompts.map((p) => p.name)).toEqual([
      "test_simple_prompt",
      "test_prompt_with_arguments",
      "prompt_one",
      "prompt_two",
    ]);
  });
});
