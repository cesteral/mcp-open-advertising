// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The parsers read pages Google controls, so what matters most here is the
// failure direction: a page that stops parsing must throw (exit 2), never look
// like the all-clear state (an empty Deprecation Date).

import { describe, expect, it } from "vitest";
import {
  ParseError,
  evaluate,
  parseDeprecationRow,
  parseDiscoveryList,
  parseLatestVersion,
  parsePinnedVersion,
} from "../check/check-dv360-api-version-watch.mjs";

const CONFIG = `const schema = z.object({
  dv360ApiBaseUrl: z.string().url().default("https://displayvideo.googleapis.com/v4"),
});`;

const releaseNotes = (v) =>
  `<p>This page provides release notes.</p>\n<p><strong>Latest API version: ${v}</strong></p>\n<h2>November 12, 2026</h2>`;

const FEATURES_TABLE = `<table class="fixed"><tbody><tr><th>Feature</th><th>Initial Effective Date</th><th>Description</th></tr>
<tr><td>Something</td><td>January 2027</td><td>v4 text</td></tr></tbody></table>`;

const deprecations = (v4Dep = "", v4Sunset = "") => `<h1>Deprecations</h1>
<table>
<thead><tr><th>API Version</th><th>Release Date</th><th>Deprecation Date</th><th>Sunset Date</th><th>Migration Guide</th></tr></thead>
<tbody>
<tr><td><a href="/display-video/api/reference/rest/v4">v4</a></td><td>March 27, 2025</td><td>${v4Dep}</td><td>${v4Sunset}</td><td></td></tr>
<tr><td><a href="/display-video/api/reference/rest/v3">v3</a></td><td>October 31, 2023</td><td>April 2, 2025</td><td>October 7, 2025</td><td><a href="/x">Migrate</a></td></tr>
</tbody></table>
${FEATURES_TABLE}`;

const item = (version, preferred = false) => ({ name: "displayvideo", version, preferred });
const directory = (...items) => JSON.stringify({ kind: "discovery#directoryList", items });

describe("parsePinnedVersion", () => {
  it("reads the default base URL version", () => {
    expect(parsePinnedVersion(CONFIG)).toBe("v4");
    expect(parsePinnedVersion(CONFIG.replace("/v4", "/v12"))).toBe("v12");
  });
  it("throws when there is no default", () => {
    expect(() => parsePinnedVersion("const x = 1;")).toThrow(ParseError);
  });
});

describe("parseLatestVersion", () => {
  it("reads the version, with or without inline markup", () => {
    expect(parseLatestVersion(releaseNotes("v4"))).toBe("v4");
    expect(parseLatestVersion("<p>Latest API version: v5</p>")).toBe("v5");
  });
  it("throws when the line is gone", () => {
    expect(() => parseLatestVersion("<p>No version here</p>")).toThrow(ParseError);
  });
});

describe("parseDeprecationRow", () => {
  it("returns empty dates for the all-clear row", () => {
    expect(parseDeprecationRow(deprecations(), "v4")).toEqual({
      deprecationDate: "",
      sunsetDate: "",
    });
  });
  it("returns the dates once the row has them", () => {
    expect(parseDeprecationRow(deprecations("June 1, 2027", "December 1, 2027"), "v4")).toEqual({
      deprecationDate: "June 1, 2027",
      sunsetDate: "December 1, 2027",
    });
  });
  it("finds a deprecated older row by its link text", () => {
    expect(parseDeprecationRow(deprecations(), "v3").deprecationDate).toBe("April 2, 2025");
  });
  it("throws when the table is gone", () => {
    expect(() => parseDeprecationRow(`<h1>x</h1>${FEATURES_TABLE}`, "v4")).toThrow(
      /Deprecation Date/
    );
  });
  it("throws when there is no row for the pin, instead of reading as all-clear", () => {
    expect(() => parseDeprecationRow(deprecations(), "v9")).toThrow(/no row for v9/);
  });
  it("throws on a localized page whose headers are not English", () => {
    const localized = deprecations().replace("Deprecation Date", "Ngày ngừng sử dụng");
    expect(() => parseDeprecationRow(localized, "v4")).toThrow(ParseError);
  });
});

describe("parseDiscoveryList", () => {
  it("returns versions and the preferred one", () => {
    expect(parseDiscoveryList(directory(item("v4"), item("v5", true)))).toEqual({
      versions: ["v4", "v5"],
      preferred: "v5",
    });
  });
  it("tolerates no preferred version", () => {
    expect(parseDiscoveryList(directory(item("v4"))).preferred).toBeNull();
  });
  it("throws on non-JSON, a missing items array, or no displayvideo entries", () => {
    expect(() => parseDiscoveryList("<html>")).toThrow(/not JSON/);
    expect(() => parseDiscoveryList("{}")).toThrow(/items/);
    expect(() => parseDiscoveryList(directory({ name: "other", version: "v1" }))).toThrow(
      /no displayvideo/
    );
  });
});

describe("evaluate", () => {
  const base = {
    pinned: "v4",
    latest: "v4",
    deprecationRow: { deprecationDate: "", sunsetDate: "" },
    discovery: { versions: ["v4", "v5"], preferred: "v5" },
  };

  it("is quiet today: v5 preferred but beta", () => {
    const { signals, info } = evaluate(base);
    expect(signals).toEqual([]);
    expect(info[0]).toMatch(/v5 as preferred/);
  });
  it("fires when a newer version is the latest", () => {
    expect(evaluate({ ...base, latest: "v5" }).signals).toEqual([
      expect.stringMatching(/latest API version is v5/),
    ]);
  });
  it("fires on a deprecation date for the pin", () => {
    const { signals } = evaluate({
      ...base,
      deprecationRow: { deprecationDate: "June 1, 2027", sunsetDate: "" },
    });
    expect(signals).toEqual([expect.stringMatching(/v4 is deprecated as of June 1, 2027/)]);
  });
  it("fires when the pin leaves the Discovery directory", () => {
    const { signals } = evaluate({ ...base, discovery: { versions: ["v5"], preferred: "v5" } });
    expect(signals).toEqual([expect.stringMatching(/v4 is missing/)]);
  });
  it("reports every signal that fired", () => {
    const { signals } = evaluate({
      ...base,
      latest: "v5",
      deprecationRow: { deprecationDate: "June 1, 2027", sunsetDate: "" },
      discovery: { versions: ["v5"], preferred: "v5" },
    });
    expect(signals).toHaveLength(3);
  });
});
