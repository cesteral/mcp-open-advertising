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
 * Codegen reproducibility (issue #175).
 *
 * The generated `schemas/{types,zod}.ts` used to churn ~3.4k lines between
 * regenerations with no spec change. The delta was a PURE PERMUTATION — sorting
 * the two files made them byte-identical — because the pipeline emitted schemas
 * and properties in `Object.keys()` order, i.e. the key order of the upstream
 * Discovery document. That order is not stable across fetches, so two developers
 * fetching the same API version could commit two different orderings and each
 * regeneration would flip the file back.
 *
 * The fix sorts at the conversion boundary so every downstream artifact (the
 * YAML spec, `types.ts` via openapi-typescript, and `zod.ts`) inherits a stable
 * order from one place. These tests feed deliberately UNSORTED input and assert
 * sorted output — they fail on the pre-fix pipeline.
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

/** Schema names deliberately out of alphabetical order, as a raw Discovery doc can be. */
function unsortedSchemas(): Record<string, DiscoverySchema> {
  return {
    Zebra: {
      type: "object",
      properties: {
        gamma: { type: "string" },
        alpha: { type: "string" },
        beta: { type: "string" },
      },
    },
    Alpha: {
      type: "object",
      properties: {
        zulu: { type: "string" },
        mike: { type: "string" },
      },
    },
    Mango: {
      type: "object",
      properties: {
        delta: { type: "string" },
        charlie: { type: "string" },
      },
    },
  } as unknown as Record<string, DiscoverySchema>;
}

describe("codegen determinism (#175)", () => {
  it("emits top-level schemas in a stable sorted order, not Discovery order", async () => {
    const spec = await convertToOpenAPI(
      unsortedSchemas(),
      DISCOVERY_DOC,
      EXTRACTION_REPORT,
      CONFIG
    );

    expect(Object.keys(spec.components.schemas)).toEqual(["Alpha", "Mango", "Zebra"]);
  });

  it("emits each schema's properties in a stable sorted order", async () => {
    const spec = await convertToOpenAPI(
      unsortedSchemas(),
      DISCOVERY_DOC,
      EXTRACTION_REPORT,
      CONFIG
    );

    expect(Object.keys(spec.components.schemas.Zebra.properties ?? {})).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(Object.keys(spec.components.schemas.Alpha.properties ?? {})).toEqual(["mike", "zulu"]);
  });

  it("produces identical output when the same schemas arrive in a different key order", async () => {
    const forward = unsortedSchemas();
    const reversed = Object.fromEntries(Object.entries(unsortedSchemas()).reverse()) as Record<
      string,
      DiscoverySchema
    >;

    const a = await convertToOpenAPI(forward, DISCOVERY_DOC, EXTRACTION_REPORT, CONFIG);
    const b = await convertToOpenAPI(reversed, DISCOVERY_DOC, EXTRACTION_REPORT, CONFIG);

    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("generates a zod header with no wall-clock timestamp", async () => {
    const spec = await convertToOpenAPI(
      unsortedSchemas(),
      DISCOVERY_DOC,
      EXTRACTION_REPORT,
      CONFIG
    );

    const output = generateZodSchemas(spec);

    // An ISO-8601 instant anywhere in the file makes every regeneration a diff.
    expect(output).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(output).not.toContain("Generated at:");
  });

  it("generates byte-identical zod output across repeated runs", async () => {
    const spec = await convertToOpenAPI(
      unsortedSchemas(),
      DISCOVERY_DOC,
      EXTRACTION_REPORT,
      CONFIG
    );

    expect(generateZodSchemas(spec)).toEqual(generateZodSchemas(spec));
  });
});
