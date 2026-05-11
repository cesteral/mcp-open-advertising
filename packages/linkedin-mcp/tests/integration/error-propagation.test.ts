// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  linkedInService: {
    listAdAccounts: vi.fn(),
    listEntities: vi.fn(),
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    bulkUpdateStatus: vi.fn(),
    duplicateEntity: vi.fn(),
    adjustBids: vi.fn(),
    searchTargeting: vi.fn(),
    getTargetingOptions: vi.fn(),
    getDeliveryForecast: vi.fn(),
    getAdPreview: vi.fn(),
    bulkCreateEntities: vi.fn(),
    bulkUpdateEntities: vi.fn(),
    uploadImage: vi.fn(),
    uploadVideo: vi.fn(),
  },
  linkedInReportingService: {
    getAnalytics: vi.fn(),
    getAnalyticsBreakdowns: vi.fn(),
  },
}));

const mockServices = {
  linkedInService: mockState.linkedInService,
  linkedInReportingService: mockState.linkedInReportingService,
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
  serviceName: "linkedin-mcp-test",
  port: 3006,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "none",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "linkedin-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  linkedinApiBaseUrl: "https://api.linkedin.com",
  linkedinApiVersion: "202409",
  linkedinRateLimitPerMinute: 100,
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

describe("mcp transport error propagation (LinkedIn)", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.linkedInService.getEntity.mockRejectedValue(
      new McpError(
        JsonRpcErrorCode.NotFound,
        "Campaign with URN urn:li:sponsoredCampaign:999 not found"
      )
    );

    mockState.linkedInService.createEntity.mockRejectedValue(
      new McpError(
        JsonRpcErrorCode.Forbidden,
        "LinkedIn API: 403 Forbidden — token missing rw_ads scope"
      )
    );

    mockState.linkedInService.listEntities.mockRejectedValue(
      new McpError(JsonRpcErrorCode.InvalidParams, "adAccountUrn is required for entityType")
    );

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("propagates NotFound McpError from get_entity", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "linkedin_get_entity",
        arguments: {
          entityType: "campaign",
          entityUrn: "urn:li:sponsoredCampaign:999",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.sessionId).toBeDefined();
    expect(mockState.linkedInService.getEntity).toHaveBeenCalledOnce();
    const combinedOutput = `${result.text}\n${JSON.stringify(result.json ?? {})}`;
    expect(combinedOutput).toContain("not found");
  });

  it("propagates Forbidden McpError from create_entity", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "linkedin_create_entity",
        arguments: {
          entityType: "campaign",
          adAccountUrn: "urn:li:sponsoredAccount:123",
          data: { name: "Will Fail" },
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
        name: "linkedin_list_entities",
        arguments: {
          entityType: "campaign",
          adAccountUrn: "urn:li:sponsoredAccount:123",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.sessionId).toBeDefined();
    const combinedOutput = `${result.text}\n${JSON.stringify(result.json ?? {})}`;
    expect(combinedOutput).toContain("required");
  });
});
