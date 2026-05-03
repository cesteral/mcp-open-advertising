import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerStaticResourcesFromDefinitions,
  registerTemplatedResourcesFromDefinitions,
  type StaticResourceDefinition,
  type TemplatedResourceDefinition,
} from "../../src/utils/resource-handler-factory.js";
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

  it("should support async getContent implementations", async () => {
    const resources: StaticResourceDefinition[] = [
      {
        uri: "async://resource",
        name: "Async",
        description: "Async resource",
        mimeType: "text/plain",
        getContent: async () => "async-content",
      },
    ];

    registerStaticResourcesFromDefinitions({ server, resources, logger });

    const handler = server.registerResource.mock.calls[0][3];
    const result = await handler(new URL("async://resource"));
    expect(result.contents[0].text).toBe("async-content");
  });
});

describe("registerTemplatedResourcesFromDefinitions", () => {
  let server: ReturnType<typeof createMockServer>;
  let logger: Logger;
  let templateBuilder: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    server = createMockServer();
    logger = createMockLogger();
    templateBuilder = vi.fn((uriTemplate, options) => ({ __template: uriTemplate, options }));
  });

  it("registers templated resources and forwards the built template", () => {
    const resources: TemplatedResourceDefinition[] = [
      {
        uriTemplate: "entity-schema://{type}",
        name: "Entity Schema",
        description: "Schema for an entity",
        mimeType: "application/json",
        resolveContent: (_uri, vars) => `{"type":"${vars.type as string}"}`,
      },
    ];

    registerTemplatedResourcesFromDefinitions({ server, templateBuilder, resources, logger });

    expect(templateBuilder).toHaveBeenCalledWith("entity-schema://{type}", { list: undefined });
    expect(server.registerResource).toHaveBeenCalledTimes(1);
    const [id, template, metadata] = server.registerResource.mock.calls[0];
    expect(id).toBe("entity_schema____type_");
    expect(template).toEqual({
      __template: "entity-schema://{type}",
      options: { list: undefined },
    });
    expect(metadata).toEqual({
      description: "Schema for an entity",
      mimeType: "application/json",
      title: "Entity Schema",
    });
  });

  it("invokes resolveContent with parsed variables and returns canonical content shape", async () => {
    const resolveContent = vi.fn((_uri, vars) => `{"type":"${vars.type as string}"}`);
    const resources: TemplatedResourceDefinition[] = [
      {
        uriTemplate: "entity-schema://{type}",
        name: "Entity Schema",
        description: "Schema",
        mimeType: "application/json",
        resolveContent,
      },
    ];

    registerTemplatedResourcesFromDefinitions({ server, templateBuilder, resources, logger });

    const handler = server.registerResource.mock.calls[0][3];
    const uri = new URL("entity-schema://campaign");
    const result = await handler(uri, { type: "campaign" });

    expect(resolveContent).toHaveBeenCalledWith(uri, { type: "campaign" });
    expect(result).toEqual({
      contents: [
        {
          uri: "entity-schema://campaign",
          mimeType: "application/json",
          text: '{"type":"campaign"}',
        },
      ],
    });
  });

  it("wires the optional list callback through templateBuilder", async () => {
    const list = vi.fn(async () => [
      { uri: "entity-schema://campaign", name: "Campaign schema" },
      { uri: "entity-schema://adGroup", name: "Ad group schema", mimeType: "text/plain" },
    ]);
    const resources: TemplatedResourceDefinition[] = [
      {
        uriTemplate: "entity-schema://{type}",
        name: "Entity Schema",
        description: "Schema",
        mimeType: "application/json",
        resolveContent: () => "{}",
        list,
      },
    ];

    registerTemplatedResourcesFromDefinitions({ server, templateBuilder, resources, logger });

    const passedOptions = templateBuilder.mock.calls[0][1];
    const listed = await passedOptions.list();
    expect(list).toHaveBeenCalled();
    expect(listed.resources).toEqual([
      {
        uri: "entity-schema://campaign",
        name: "Campaign schema",
        description: undefined,
        mimeType: "application/json",
      },
      {
        uri: "entity-schema://adGroup",
        name: "Ad group schema",
        description: undefined,
        mimeType: "text/plain",
      },
    ]);
  });

  it("propagates errors from resolveContent", async () => {
    const resources: TemplatedResourceDefinition[] = [
      {
        uriTemplate: "broken://{x}",
        name: "Broken",
        description: "Broken",
        mimeType: "text/plain",
        resolveContent: () => {
          throw new Error("boom");
        },
      },
    ];

    registerTemplatedResourcesFromDefinitions({ server, templateBuilder, resources, logger });

    const handler = server.registerResource.mock.calls[0][3];
    await expect(handler(new URL("broken://1"), { x: "1" })).rejects.toThrow("boom");
  });
});
