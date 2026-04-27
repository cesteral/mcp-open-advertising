import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createServerCapabilitiesResource,
  type ToolDefinitionForFactory,
} from "../../src/utils/index.js";

function tool(name: string): ToolDefinitionForFactory {
  return {
    name,
    description: `${name} description`,
    inputSchema: z.object({}),
    logic: async () => ({}),
  };
}

describe("createServerCapabilitiesResource", () => {
  it("includes counts, summaries, discovery metadata, and ungrouped tools", () => {
    const resource = createServerCapabilitiesResource({
      serverName: "example-mcp",
      allTools: [tool("example_list"), tool("example_create"), tool("example_orphan")],
      toolGroups: {
        read: ["example_list"],
        write: ["example_create"],
      },
      commonWorkflows: ["inspect_entities"],
      discoveryFlow: ["Read this resource first."],
      relatedResources: ["entity-schema://all"],
      startHere: "example_list",
    });

    const content = JSON.parse(resource.getContent() as string);

    expect(content.serverName).toBe("example-mcp");
    expect(content.toolCount).toBe(3);
    expect(content.toolGroupSummaries.read.toolCount).toBe(1);
    expect(content.ungroupedTools).toEqual(["example_orphan"]);
    expect(content.commonWorkflows).toEqual(["inspect_entities"]);
    expect(content.discoveryFlow).toEqual(["Read this resource first."]);
    expect(content.relatedResources).toEqual(["entity-schema://all"]);
    expect(content.startHere).toBe("example_list");
  });
});
