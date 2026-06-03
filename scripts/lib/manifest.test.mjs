import { describe, it, expect } from "vitest";
import { toManifestEntry, validateManifest } from "./manifest.mjs";

const writeTool = {
  name: "meta_update_entity",
  description: "Update a Meta entity.",
  inputSchema: { type: "object" },
  annotations: {
    destructiveHint: true,
    cesteral: {
      kind: "write",
      platform: "meta_ads",
      contractId: "meta.update_entity.v1",
      schemaVersion: 1,
    },
  },
};

describe("toManifestEntry", () => {
  it("derives a manifest entry from a governed tool", () => {
    const entry = toManifestEntry(writeTool);
    expect(entry).toEqual({
      toolName: "meta_update_entity",
      contractPlatformSlug: "meta",
      contractToolSlug: "update_entity",
      schemaVersion: "1",
      definitionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("derives a manifest entry from an underscore-slug platform contractId", () => {
    const gadsTool = {
      ...writeTool,
      name: "gads_update_entity",
      annotations: {
        cesteral: {
          kind: "write",
          platform: "google_ads",
          contractId: "google_ads.update_entity.v1",
          schemaVersion: 1,
        },
      },
    };
    const entry = toManifestEntry(gadsTool);
    expect(entry.contractPlatformSlug).toBe("google_ads");
    expect(entry.contractToolSlug).toBe("update_entity");
  });

  it("returns null for a tool with no cesteral annotation", () => {
    expect(toManifestEntry({ name: "meta_list_entities", annotations: {} })).toBeNull();
    expect(toManifestEntry({ name: "meta_list_entities" })).toBeNull();
  });

  it("throws on a malformed contractId", () => {
    const bad = {
      ...writeTool,
      annotations: { cesteral: { contractId: "nope", schemaVersion: 1 } },
    };
    expect(() => toManifestEntry(bad)).toThrow(/contractId/);
  });

  it("throws when contractId version disagrees with schemaVersion", () => {
    const bad = {
      ...writeTool,
      annotations: { cesteral: { contractId: "meta.update_entity.v2", schemaVersion: 1 } },
    };
    expect(() => toManifestEntry(bad)).toThrow(/disagrees/);
  });

  it("throws when schemaVersion is not a number", () => {
    const missing = {
      ...writeTool,
      annotations: { cesteral: { contractId: "meta.update_entity.v1" } },
    };
    expect(() => toManifestEntry(missing)).toThrow(/schemaVersion/);
    const stringy = {
      ...writeTool,
      annotations: { cesteral: { contractId: "meta.update_entity.v1", schemaVersion: "1" } },
    };
    expect(() => toManifestEntry(stringy)).toThrow(/schemaVersion/);
  });

  it("throws when contractId is absent", () => {
    const bad = { ...writeTool, annotations: { cesteral: { schemaVersion: 1 } } };
    expect(() => toManifestEntry(bad)).toThrow(/contractId/);
  });

  it("throws when contractPlatformSlug disagrees with contractId", () => {
    // The LinkedIn-uploads bug class: slug "linkedin" but contractId "linkedin_ads.…".
    const bad = {
      ...writeTool,
      annotations: {
        cesteral: {
          kind: "write",
          contractPlatformSlug: "linkedin",
          contractToolSlug: "upload_image",
          contractId: "linkedin_ads.upload_image.v1",
          schemaVersion: 1,
        },
      },
    };
    expect(() => toManifestEntry(bad)).toThrow(/contractPlatformSlug/);
  });

  it("throws when contractToolSlug disagrees with contractId", () => {
    const bad = {
      ...writeTool,
      annotations: {
        cesteral: {
          kind: "write",
          contractPlatformSlug: "meta",
          contractToolSlug: "upload_image",
          contractId: "meta.upload_video.v1",
          schemaVersion: 1,
        },
      },
    };
    expect(() => toManifestEntry(bad)).toThrow(/contractToolSlug/);
  });

  it("accepts a tool whose slug fields agree with contractId", () => {
    const ok = {
      ...writeTool,
      annotations: {
        cesteral: {
          kind: "write",
          contractPlatformSlug: "linkedin_ads",
          contractToolSlug: "upload_image",
          contractId: "linkedin_ads.upload_image.v1",
          schemaVersion: 1,
        },
      },
    };
    expect(() => toManifestEntry(ok)).not.toThrow();
  });

  it("derives a manifest entry from a read-kind governed tool", () => {
    const readTool = {
      name: "meta_get_entity",
      description: "Read a Meta entity.",
      inputSchema: { type: "object" },
      annotations: {
        readOnlyHint: true,
        cesteral: {
          kind: "read",
          platform: "meta_ads",
          contractId: "meta.get_entity.v1",
          schemaVersion: 1,
        },
      },
    };
    const entry = toManifestEntry(readTool);
    expect(entry).toEqual({
      toolName: "meta_get_entity",
      contractPlatformSlug: "meta",
      contractToolSlug: "get_entity",
      schemaVersion: "1",
      definitionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });
});

describe("validateManifest", () => {
  const valid = {
    manifestVersion: 1,
    packageName: "@cesteral/meta-mcp",
    packageVersion: "1.0.0",
    generatedAt: "2026-05-20T00:00:00.000Z",
    tools: [
      {
        toolName: "meta_update_entity",
        contractPlatformSlug: "meta",
        contractToolSlug: "update_entity",
        schemaVersion: "1",
        definitionHash: "a".repeat(64),
      },
    ],
  };

  it("accepts a well-formed manifest", () => {
    expect(() => validateManifest(valid)).not.toThrow();
  });

  it("rejects an empty tools array", () => {
    expect(() => validateManifest({ ...valid, tools: [] })).toThrow(/tools/);
  });

  it("rejects a non-hex definitionHash", () => {
    const bad = { ...valid, tools: [{ ...valid.tools[0], definitionHash: "XYZ" }] };
    expect(() => validateManifest(bad)).toThrow(/definitionHash/);
  });

  it("rejects a packageName that is not an @cesteral/*-mcp package", () => {
    expect(() => validateManifest({ ...valid, packageName: "@cesteral/shared" })).toThrow(
      /packageName/
    );
  });
});
