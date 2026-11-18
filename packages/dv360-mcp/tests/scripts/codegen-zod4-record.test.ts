import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { convertToOpenAPI } from "../../scripts/lib/convert-to-openapi.js";
import { generateZodSchemas } from "../../scripts/lib/generate-zod-schemas.js";
import type {
  DiscoverySchema,
  DiscoveryDocument,
  ExtractionReport,
} from "../../scripts/lib/types.js";
import type { SchemaExtractionConfig } from "../../config/schema-extraction.config.js";

/**
 * Zod 4 `z.record` takes a key schema (#377). Zod 3's one-argument
 * `z.record(V)` fails typecheck under Zod 4 (TS2554: "Expected 2-3 arguments,
 * but got 1"). The Zod 4 migration (#368) fixed the 8 sites by hand in the
 * committed zod.ts, but the generator kept emitting the one-argument form, so
 * every regeneration reverted them, broke the build, and showed up as drift in
 * `check:dv360-codegen-drift` even when Discovery had not changed.
 */

const DISCOVERY_DOC = {
  name: "displayvideo",
  version: "v4",
  title: "Display & Video 360 API",
  description: "test double",
  schemas: {},
} as unknown as DiscoveryDocument;

const EXTRACTION_REPORT = {
  extractionMetadata: { apiVersion: "v4", extractedAt: "1970-01-01T00:00:00.000Z" },
} as unknown as ExtractionReport;

const CONFIG = { apiVersion: "v4" } as unknown as SchemaExtractionConfig;

/** The two map shapes v4 Discovery uses, as on DemandGenImageAd.customParameters and Status.details. */
function mapSchemas(): Record<string, DiscoverySchema> {
  return {
    DemandGenImageAd: {
      id: "DemandGenImageAd",
      type: "object",
      properties: {
        customParameters: {
          type: "object",
          description: "Optional. The custom parameters to add to the tracking URL.",
          additionalProperties: { type: "string" },
        },
      },
    },
    Status: {
      id: "Status",
      type: "object",
      properties: {
        details: {
          type: "array",
          description: "A list of messages that carry the error details.",
          items: {
            type: "object",
            additionalProperties: { type: "any", description: "Properties of the object." },
          },
        },
      },
    },
    FreeForm: {
      id: "FreeForm",
      type: "object",
      properties: {
        anything: { type: "object", additionalProperties: true },
      },
    },
  } as unknown as Record<string, DiscoverySchema>;
}

/** Every `z.record(` call in `source` whose first argument is not a `z.string()` key schema. */
function oneArgumentRecords(source: string): string[] {
  return source.split("\n").filter((line) => /z\.record\((?!z\.string\(\), )/.test(line));
}

describe("generated z.record carries a key schema (#377)", () => {
  it("emits z.record(z.string(), V) for typed and free-form maps", async () => {
    const spec = await convertToOpenAPI(mapSchemas(), DISCOVERY_DOC, EXTRACTION_REPORT, CONFIG);
    const output = generateZodSchemas(spec);

    expect(output).toContain("customParameters: z.record(z.string(), z.string()).optional(),");
    expect(output).toContain("details: z.array(z.record(z.string(), z.unknown())).optional(),");
    expect(output).toContain("anything: z.record(z.string(), z.unknown()).optional(),");
    expect(oneArgumentRecords(output)).toEqual([]);
  });

  it("the committed zod.ts has no one-argument z.record", () => {
    const committed = readFileSync(
      fileURLToPath(new URL("../../src/generated/schemas/zod.ts", import.meta.url)),
      "utf8"
    );

    expect(committed).toContain("z.record(z.string(), ");
    expect(oneArgumentRecords(committed)).toEqual([]);
  });
});
