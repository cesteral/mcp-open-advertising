import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerStaticResourcesFromDefinitions, type StaticResourceDefinition } from "../../src/utils/resource-handler-factory.js";
import type { Logger } from "pino";

function createMockServer() {
  return {
    registerResource: vi.fn(),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
}

describe("registerStaticResourcesFromDefinitions", () => {
  let server: ReturnType<typeof createMockServer>;
  let logger: Logger;

  beforeEach(() => {
    server = createMockServer();
    logger = createMockLogger();
  });

  it("should register all resources on the server", () => {
    const resources: StaticResourceDefinition[] = [
      {
        uri: "metric://types",
        name: "Metric Types",
        description: "All metric types",
        mimeType: "application/json",
        getContent: () => '{"metrics": []}',
      },
      {
        uri: "filter://types",
        name: "Filter Types",
        description: "All filter types",
        mimeType: "application/json",
        getContent: () => '{"filters": []}',
      },
    ];

    registerStaticResourcesFromDefinitions({ server, resources, logger });

    expect(server.registerResource).toHaveBeenCalledTimes(2);
  });

  it("should generate sanitized resource ID from URI", () => {
    const resources: StaticResourceDefinition[] = [
      {
        uri: "entity-schema://campaign",
        name: "Campaign Schema",
        description: "Schema",
        mimeType: "application/json",
        getContent: () => "{}",
      },
    ];

    registerStaticResourcesFromDefinitions({ server, resources, logger });

    const registeredId = server.registerResource.mock.calls[0][0];
    expect(registeredId).toBe("entity_schema___campaign");
  });

  it("should call handler that returns correct content format", async () => {
    const resources: StaticResourceDefinition[] = [
      {
        uri: "test://resource",
        name: "Test",
        description: "Test resource",
        mimeType: "text/plain",
        getContent: () => "Hello world",
      },
    ];

    registerStaticResourcesFromDefinitions({ server, resources, logger });

    const handler = server.registerResource.mock.calls[0][3];
    const result = await handler(new URL("test://resource"));

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("test://resource");
    expect(result.contents[0].mimeType).toBe("text/plain");
    expect(result.contents[0].text).toBe("Hello world");
  });

  it("should propagate errors from getContent", async () => {
    const resources: StaticResourceDefinition[] = [
      {
        uri: "error://resource",
        name: "Error",
        description: "Error resource",
        mimeType: "application/json",
        getContent: () => {
          throw new Error("Content generation failed");
        },
      },
    ];

    registerStaticResourcesFromDefinitions({ server, resources, logger });

    const handler = server.registerResource.mock.calls[0][3];
    await expect(handler(new URL("error://resource"))).rejects.toThrow("Content generation failed");
  });

  it("should log resource count after registration", () => {
    registerStaticResourcesFromDefinitions({ server, resources: [], logger });
    expect(logger.info).toHaveBeenCalledWith({ resourceCount: 0 }, "Registered MCP resources");
  });
});
