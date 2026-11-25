import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  REVISION_PIN_FILE,
  buildRevisionPin,
  serializeRevisionPin,
} from "../../scripts/lib/discovery-revision.js";
import type { DiscoveryDocument } from "../../scripts/lib/types.js";
import { VALIDATED_CONFIG } from "../../config/schema-extraction.config.js";

/**
 * Discovery revision pin.
 *
 * Google edits the Discovery document in place, and the generated schemas used
 * to record nothing about which revision they came from. `discovery-revision.json`
 * is that record. These tests keep it well-formed and in step with the config;
 * whether it still matches Google's live document is the scheduled drift
 * check's job, not a PR check (that would let Google turn `main` red).
 */

const GENERATED_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../",
  VALIDATED_CONFIG.output.generatedPath
);

describe("discovery revision pin", () => {
  it("is built from the document's name, version and revision", () => {
    const doc = {
      name: "displayvideo",
      version: "v4",
      revision: "20261117",
      schemas: {},
    } as unknown as DiscoveryDocument;

    expect(buildRevisionPin(doc)).toEqual({
      api: "displayvideo",
      version: "v4",
      revision: "20261117",
    });
  });

  it("serializes stably, so regenerating the same revision changes no bytes", () => {
    const pin = { api: "displayvideo", version: "v4", revision: "20261117" };
    expect(serializeRevisionPin(pin)).toBe(serializeRevisionPin({ ...pin }));
    expect(serializeRevisionPin(pin).endsWith("\n")).toBe(true);
  });

  it("is committed next to the generated schemas, for the API version the config targets", () => {
    const pin = JSON.parse(readFileSync(path.join(GENERATED_DIR, REVISION_PIN_FILE), "utf8"));

    expect(pin.api).toBe("displayvideo");
    expect(pin.version).toBe(VALIDATED_CONFIG.apiVersion);
    expect(pin.revision).toMatch(/^\d{8}$/);
  });
});
