import { describe, it, expect } from "vitest";
import { promptRegistry, getAllPrompts } from "../../src/mcp-server/prompts/index.js";

const EXPECTED_COUNT = 11;

describe("MCP Prompt Registration", () => {
  it("registers expected number of prompts", () => {
    expect(promptRegistry.size).toBe(EXPECTED_COUNT);
  });

  it("getAllPrompts returns all prompt metadata", () => {
    const prompts = getAllPrompts();
    expect(prompts).toHaveLength(EXPECTED_COUNT);
    for (const prompt of prompts) {
      expect(prompt.name).toBeTruthy();
      expect(prompt.description).toBeTruthy();
    }
  });

  describe("each prompt generates valid messages", () => {
    for (const [name, def] of promptRegistry) {
      it(`${name} produces non-empty message without args`, () => {
        const message = def.generateMessage();
        expect(message.length).toBeGreaterThan(100);
        expect(message).toContain("#"); // has markdown headings
      });

      if (def.prompt.arguments?.some((a) => a.required)) {
        it(`${name} interpolates required arguments`, () => {
          const args: Record<string, string> = {};
          for (const arg of def.prompt.arguments!) {
            if (arg.required) args[arg.name] = `test_${arg.name}_value`;
          }
          const message = def.generateMessage(args);
          for (const value of Object.values(args)) {
            expect(message).toContain(value);
          }
        });
      }
    }
  });
});

/**
 * Fleet review ttd REST #6/#7 (prompt half): TTD's v3 PUT is partial
 * (vendored TTD Foundations §8, "Partial Object Updates"), and echoing a GET
 * payload back re-sends deprecated properties (410 Gone). Two prompts still
 * told agents PUT was a full replacement and to send the whole entity.
 */
describe("prompt update guidance", () => {
  it("never describes TTD PUT as full replacement", () => {
    const offending: string[] = [];
    for (const [name, def] of promptRegistry) {
      const text = def.generateMessage({ advertiserId: "adv1", entityType: "campaign" });
      if (
        /full (entity )?replacement|entire entity is replaced|full payload|full entity with your changes/i.test(
          text
        )
      ) {
        offending.push(name);
      }
    }
    expect(offending).toEqual([]);
  });
});

/**
 * Fleet review ttd REST #25: two prompts walked agents through
 * ttd_create_entity / ttd_list_entities with entityType "ad". TTD has no ad
 * entity (the 2026-04-01 live-test fix removed it), so every such call fails
 * input validation. Every entityType a prompt names must be one some
 * registered tool accepts.
 *
 * Found while fixing "ad": ttd_campaign_setup_workflow and
 * ttd_targeting_discovery_workflow also sent siteList, bidList and deal to
 * ttd_create_entity / ttd_list_entities, and pointed at entity-schema://
 * resources for them that are not registered. Bid lists now go through
 * ttd_manage_bid_list; no tool manages site lists or deals.
 */
describe("prompt entityType literals", () => {
  function enumValues(schema: unknown): string[] {
    let s = schema as { _def?: { typeName?: string; innerType?: unknown; values?: string[] } };
    while (s?._def && s._def.innerType) s = s._def.innerType as typeof s;
    return s?._def?.typeName === "ZodEnum" ? (s._def.values ?? []) : [];
  }

  it("names only entity types a registered tool accepts", async () => {
    const { allTools } = await import("../../src/mcp-server/tools/definitions/index.js");
    const accepted = new Set<string>();
    for (const tool of allTools) {
      const shape = (tool.inputSchema as { shape?: Record<string, unknown> }).shape;
      for (const value of enumValues(shape?.entityType)) accepted.add(value);
    }
    expect(accepted.size).toBeGreaterThan(0);

    const unknown: string[] = [];
    for (const [name, def] of promptRegistry) {
      const text = def.generateMessage({ advertiserId: "adv1", entityType: "campaign" });
      for (const match of text.matchAll(/"entityType":\s*"([A-Za-z]+)"/g)) {
        if (!accepted.has(match[1])) unknown.push(`${name}: ${match[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});

describe("prompt resource references", () => {
  it("names only registered resources", async () => {
    const { allResources } = await import("../../src/mcp-server/resources/index.js");
    const registered = new Set(allResources.map((r) => r.uri));
    const schemes = [...new Set([...registered].map((uri) => uri.split("://")[0]))];
    expect(schemes.length).toBeGreaterThan(0);
    // Concrete URIs only: `entity-schema://{entityType}` templates are skipped.
    const uriPattern = new RegExp(`\\b(?:${schemes.join("|")})://[A-Za-z]+\\b`, "g");

    const unknown: string[] = [];
    for (const [name, def] of promptRegistry) {
      const text = def.generateMessage({ advertiserId: "adv1", entityType: "campaign" });
      for (const [uri] of text.matchAll(uriPattern)) {
        if (!registered.has(uri)) unknown.push(`${name}: ${uri}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("sends bid lists to ttd_manage_bid_list, not ttd_create_entity", () => {
    for (const name of ["ttd_campaign_setup_workflow", "ttd_targeting_discovery_workflow"]) {
      const text = promptRegistry.get(name)!.generateMessage({ advertiserId: "adv1" });
      expect(text, name).toContain("Tool: ttd_manage_bid_list");
    }
  });
});
