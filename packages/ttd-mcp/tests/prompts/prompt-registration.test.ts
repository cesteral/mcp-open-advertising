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
