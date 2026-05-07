// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  msadsService: {
    listEntities: vi.fn(),
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
  },
  msadsCustomerService: {},
  msadsReportingService: {},
}));

const mockServices = {
  msadsService: mockState.msadsService,
  msadsCustomerService: mockState.msadsCustomerService,
  msadsReportingService: mockState.msadsReportingService,
};

vi.mock("../../src/services/session-services.js", async () => {
  const fingerprints = new Map<string, string>();
  const authContexts = new Map<string, any>();
  const store = {
    set(_sessionId: string, _sessionServices: any, credentialFingerprint?: string) {
      if (credentialFingerprint) fingerprints.set(_sessionId, credentialFingerprint);
    },
    get(_sessionId: string) {
      return mockServices;
    },
    delete(sessionId: string) {
      fingerprints.delete(sessionId);
      authContexts.delete(sessionId);
    },
    validateFingerprint(sessionId: string, credentialFingerprint: string) {
      const stored = fingerprints.get(sessionId);
      if (!stored) return true;
      return stored === credentialFingerprint;
    },
    getFingerprint(sessionId: string) {
      return fingerprints.get(sessionId);
    },
    setAuthContext(sessionId: string, authContext: any) {
      authContexts.set(sessionId, authContext);
    },
    getAuthContext(sessionId: string) {
      return authContexts.get(sessionId);
    },
    isFull() {
      return false;
    },
    get size() {
      return 1;
    },
  };
  return {
    sessionServiceStore: store,
    createSessionServices: vi.fn(() => mockServices),
    reportCsvStore: {
      list: () => [],
      getByUri: () => undefined,
    },
  };
});

import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
logger.child.mockReturnValue(logger);

const config: any = {
  serviceName: "msads-mcp-test",
  port: 3013,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "none",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "msads-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  msadsCampaignApiUrl: "https://campaign.api.bingads.microsoft.com",
  msadsReportingApiUrl: "https://reporting.api.bingads.microsoft.com",
  msadsCustomerApiUrl: "https://clientcenter.api.bingads.microsoft.com",
  msadsRateLimitPerMinute: 100,
};

async function postMcp(app: any, payload: unknown, sessionId?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26",
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  const response = await app.request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return {
    response,
    json,
    text,
    sessionId: response.headers.get("mcp-session-id") ?? json?.result?.sessionId ?? json?.sessionId,
  };
}

describe("mcp transport error propagation (Microsoft Ads)", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.msadsService.createEntity.mockRejectedValue(
      new McpError(
        JsonRpcErrorCode.Forbidden,
        "Microsoft Ads API: 403 Forbidden — token missing required scope"
      )
    );

    mockState.msadsService.listEntities.mockRejectedValue(
      new McpError(JsonRpcErrorCode.InvalidParams, "accountId is required for entityType")
    );

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("propagates NotFound McpError from delete_entity", async () => {
    mockState.msadsService.deleteEntity.mockRejectedValueOnce(
      new McpError(JsonRpcErrorCode.NotFound, "Campaign with ID 999 not found")
    );

    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "msads_delete_entity",
        arguments: {
          entityType: "campaign",
          entityIds: ["999"],
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.sessionId).toBeDefined();
    expect(mockState.msadsService.deleteEntity).toHaveBeenCalledOnce();
    const combinedOutput = `${result.text}\n${JSON.stringify(result.json ?? {})}`;
    expect(combinedOutput).toContain("not found");
  });

  it("propagates Forbidden McpError from create_entity", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "msads_create_entity",
        arguments: {
          entityType: "campaign",
          data: { Campaigns: [{ Name: "Will Fail" }] },
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.sessionId).toBeDefined();
    const combinedOutput = `${result.text}\n${JSON.stringify(result.json ?? {})}`;
    expect(combinedOutput).toContain("Forbidden");
  });

  it("propagates InvalidParams McpError from list_entities", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "msads_list_entities",
        arguments: {
          entityType: "budget",
          accountId: "789012",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.sessionId).toBeDefined();
    const combinedOutput = `${result.text}\n${JSON.stringify(result.json ?? {})}`;
    expect(combinedOutput).toContain("required");
  });
});
