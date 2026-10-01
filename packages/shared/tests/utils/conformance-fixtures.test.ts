import { describe, it, expect } from "vitest";
import { conformancePrompts } from "../../src/utils/conformance-fixtures.js";
import { testElicitationSep1330EnumsTool } from "../../src/utils/conformance-echo-tool.js";

// These fixtures exist only to satisfy @modelcontextprotocol/conformance
// scenarios, which call them with fixed names and inspect fixed fields. The
// names below are the harness's contract, not ours (#241).

describe("conformance fixtures", () => {
  it("test_prompt_with_arguments takes the harness's arg1/arg2 and substitutes both", () => {
    const prompt = conformancePrompts.find((p) => p.name === "test_prompt_with_arguments");
    expect(prompt).toBeDefined();
    expect(prompt!.arguments?.map((a) => [a.name, a.required])).toEqual([
      ["arg1", true],
      ["arg2", false],
    ]);
    const text = prompt!.generateMessage({ arg1: "testValue1", arg2: "testValue2" });
    expect(text).toContain("testValue1");
    expect(text).toContain("testValue2");
  });

  it("test_elicitation_sep1330_enums requests all five enum variants, legacy enumNames included", async () => {
    let requested: Record<string, any> | undefined;
    const sdkContext = {
      elicitInput: async (params: Record<string, unknown>) => {
        requested = params.requestedSchema as Record<string, any>;
        return { action: "decline" };
      },
    };
    await testElicitationSep1330EnumsTool.logic({}, {} as never, sdkContext as never);

    const props = requested?.properties ?? {};
    expect(Object.keys(props).sort()).toEqual(
      ["legacyEnum", "titledMulti", "titledSingle", "untitledMulti", "untitledSingle"].sort()
    );
    expect(props.legacyEnum.type).toBe("string");
    expect(props.legacyEnum.enumNames).toHaveLength(props.legacyEnum.enum.length);
  });
});
