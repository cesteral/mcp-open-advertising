import { describe, it, expect } from "vitest";

import { convertToOpenAPI } from "../../scripts/lib/convert-to-openapi.js";
import type {
  DiscoverySchema,
  DiscoveryDocument,
  ExtractionReport,
} from "../../scripts/lib/types.js";
import type { SchemaExtractionConfig } from "../../config/schema-extraction.config.js";

/**
 * `REQUIRED_FIELDS_OVERRIDES` against the Discovery descriptions that made a
 * response field required on regeneration. The generated zod schemas parse
 * GET / list responses, so "Required." (an input rule) must not become a
 * required response field when DV360 can omit it (#341).
 *
 * These feed the descriptions from v4 Discovery revision 20261117 to the real
 * converter, so they fail if the override is dropped, without needing the
 * network or a regeneration.
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

async function requiredOf(name: string, schema: DiscoverySchema): Promise<string[]> {
  const spec = await convertToOpenAPI({ [name]: schema }, DISCOVERY_DOC, EXTRACTION_REPORT, CONFIG);
  return (spec.components.schemas[name] as { required?: string[] }).required ?? [];
}

describe("REQUIRED_FIELDS_OVERRIDES", () => {
  it("keeps InsertionOrder.optimizationObjective optional under the 'Required.' description", async () => {
    const required = await requiredOf("InsertionOrder", {
      id: "InsertionOrder",
      type: "object",
      properties: {
        displayName: {
          type: "string",
          description: "Required. The display name of the insertion order.",
        },
        optimizationObjective: {
          type: "string",
          description: "Required. The optimization objective of the insertion order.",
          enum: ["OPTIMIZATION_OBJECTIVE_UNSPECIFIED", "CONVERSION", "CLICK"],
        },
      },
    } as unknown as DiscoverySchema);

    expect(required).toContain("displayName");
    expect(required).not.toContain("optimizationObjective");
  });

  it("keeps SdfConfig.version optional (#341)", async () => {
    const required = await requiredOf("SdfConfig", {
      id: "SdfConfig",
      type: "object",
      properties: {
        version: {
          type: "string",
          description: "Required. The version of SDF being used.",
          enum: ["SDF_VERSION_UNSPECIFIED", "SDF_VERSION_9_2"],
        },
      },
    } as unknown as DiscoverySchema);

    expect(required).not.toContain("version");
  });
});
