import { describe, it, expect } from "vitest";
import {
  inspectTarball,
  TARBALL_LICENSE_PATH,
  TARBALL_MANIFEST_PATH,
} from "./inspect-tarball.mjs";

const cleanManifest = {
  name: "@cesteral/ttd-mcp",
  version: "1.2.3",
  dependencies: { "@cesteral/shared": "1.2.3", zod: "^3.23.0" },
};

const baseFiles = ["package/package.json", "package/dist/index.js", TARBALL_LICENSE_PATH];

describe("inspectTarball", () => {
  it("passes a clean tarball with no manifest expectation", () => {
    expect(inspectTarball({ manifest: cleanManifest, fileList: baseFiles })).toEqual([]);
  });

  it("flags an unresolved workspace: dependency range", () => {
    const failures = inspectTarball({
      manifest: { ...cleanManifest, dependencies: { "@cesteral/shared": "workspace:*" } },
      fileList: baseFiles,
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("workspace:*");
  });

  it("flags unresolved workspace deps across peer/optional sections", () => {
    const failures = inspectTarball({
      manifest: {
        ...cleanManifest,
        peerDependencies: { "@cesteral/a": "workspace:^" },
        optionalDependencies: { "@cesteral/b": "workspace:*" },
      },
      fileList: baseFiles,
    });
    expect(failures).toHaveLength(2);
  });

  it("flags a missing LICENSE.md", () => {
    const failures = inspectTarball({
      manifest: cleanManifest,
      fileList: ["package/package.json", "package/dist/index.js"],
    });
    expect(failures).toEqual(["LICENSE.md is missing from the tarball"]);
  });

  it("requires the attestation manifest when expectManifest is set", () => {
    const failures = inspectTarball({
      manifest: cleanManifest,
      fileList: baseFiles,
      expectManifest: true,
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(TARBALL_MANIFEST_PATH);
  });

  it("passes when the expected manifest is present", () => {
    expect(
      inspectTarball({
        manifest: cleanManifest,
        fileList: [...baseFiles, TARBALL_MANIFEST_PATH],
        expectManifest: true,
      })
    ).toEqual([]);
  });

  it("does not require the manifest for ungoverned packages (expectManifest false)", () => {
    // dbm-mcp / shared / contract-hash ship no manifest — absence is fine.
    expect(
      inspectTarball({ manifest: cleanManifest, fileList: baseFiles, expectManifest: false })
    ).toEqual([]);
  });
});
