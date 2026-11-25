#!/usr/bin/env node
/**
 * DV360 API version watch.
 *
 * Tells us when to start moving `packages/dv360-mcp` off the DV360 API version
 * it targets (v4 at the time of writing). The design and rationale are in
 * docs/plans/2026-11-25-dv360-v5-migration.md ("Weekly watch").
 *
 * Signals (any one exits 1):
 *   1. The release notes say "Latest API version: vX" and vX is not our pin
 *      (a newer version went GA).
 *   2. The deprecations table has a non-empty Deprecation Date on our pin's row.
 *   3. Our pin is missing from the Discovery directory (sunset).
 *
 * `preferred` in the Discovery directory is NOT a signal: v5 is `preferred`
 * while still in public beta. It is logged as information only.
 *
 * Why this is not PR-blocking: it reads pages Google controls, so it runs on a
 * schedule (see .github/workflows/codegen-drift.yml), never in the PR path.
 *
 * Exit codes: 0 = nothing to do, 1 = a signal fired, 2 = could not check.
 * A page that no longer parses is exit 2, never a silent pass: an empty
 * Deprecation Date is the normal all-clear, so a missing row must not look like it.
 */

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG_PATH = "packages/dv360-mcp/src/config/index.ts";

const RELEASE_NOTES_URL = "https://developers.google.com/display-video/api/release-notes";
const DEPRECATIONS_URL = "https://developers.google.com/display-video/api/deprecations";
const DISCOVERY_URL = "https://discovery.googleapis.com/discovery/v1/apis?name=displayvideo";

const EXIT_OK = 0;
const EXIT_SIGNAL = 1;
const EXIT_CANNOT_CHECK = 2;

/** A page or document no longer has the shape this check reads. */
export class ParseError extends Error {}

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The version in the default `dv360ApiBaseUrl` of the config source, e.g. "v4". */
export function parsePinnedVersion(configSource) {
  const m = /dv360ApiBaseUrl:[^\n]*?displayvideo\.googleapis\.com\/(v\d+)\b/.exec(configSource);
  if (!m) throw new ParseError("no default dv360ApiBaseUrl (displayvideo.googleapis.com/vN) found");
  return m[1];
}

/** The version in "Latest API version: vX" on the release notes page. */
export function parseLatestVersion(html) {
  const m = /Latest API version:\s*(?:<[^>]*>\s*)*(v\d+)\b/i.exec(html);
  if (!m) throw new ParseError('release notes have no "Latest API version: vN"');
  return m[1].toLowerCase();
}

/**
 * The pinned version's row of the deprecations table (the one whose header has
 * a "Deprecation Date" column). Returns `{ deprecationDate, sunsetDate }`, each
 * "" when the cell is empty.
 */
export function parseDeprecationRow(html, version) {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  const table = tables.find((t) => /<th[^>]*>\s*Deprecation Date\s*<\/th>/i.test(t));
  if (!table) throw new ParseError('no table with a "Deprecation Date" header');

  const header = [
    ...(/<thead[\s\S]*?<\/thead>/i.exec(table)?.[0] ?? "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi),
  ].map((m) => stripTags(m[1]));
  const depIdx = header.indexOf("Deprecation Date");
  const sunsetIdx = header.indexOf("Sunset Date");
  if (depIdx < 0) throw new ParseError('table header has no "Deprecation Date" column');

  const body = /<tbody[\s\S]*?<\/tbody>/i.exec(table)?.[0] ?? table;
  for (const row of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells[0]?.toLowerCase() === version) {
      return {
        deprecationDate: cells[depIdx] ?? "",
        sunsetDate: sunsetIdx >= 0 ? (cells[sunsetIdx] ?? "") : "",
      };
    }
  }
  throw new ParseError(`deprecations table has no row for ${version}`);
}

/** `{ versions, preferred }` from the Discovery directory JSON text. */
export function parseDiscoveryList(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new ParseError("Discovery directory is not JSON");
  }
  if (!doc || !Array.isArray(doc.items))
    throw new ParseError("Discovery directory has no items array");
  const items = doc.items.filter(
    (i) => i && i.name === "displayvideo" && typeof i.version === "string"
  );
  if (items.length === 0)
    throw new ParseError("Discovery directory lists no displayvideo versions");
  return {
    versions: items.map((i) => i.version),
    preferred: items.find((i) => i.preferred === true)?.version ?? null,
  };
}

/** Pure decision: `{ signals, info }`; any signal means exit 1. */
export function evaluate({ pinned, latest, deprecationRow, discovery }) {
  const signals = [];
  if (latest !== pinned) {
    signals.push(
      `release notes say the latest API version is ${latest}, but dv360-mcp targets ${pinned}`
    );
  }
  if (deprecationRow.deprecationDate) {
    const sunset = deprecationRow.sunsetDate ? `, sunset ${deprecationRow.sunsetDate}` : "";
    signals.push(`${pinned} is deprecated as of ${deprecationRow.deprecationDate}${sunset}`);
  }
  if (!discovery.versions.includes(pinned)) {
    signals.push(
      `${pinned} is missing from the Discovery directory (${discovery.versions.join(", ")})`
    );
  }
  const info = [
    `Discovery marks ${discovery.preferred ?? "no version"} as preferred (information only)`,
  ];
  return { signals, info };
}

// developers.google.com localizes by request (a bare fetch returned Vietnamese,
// Russian and Japanese pages at random), and the parsers read English headers.
// `hl=en` plus Accept-Language pins the English page; a page that still is not
// English fails to parse and exits 2, which is the safe outcome.
async function fetchText(url) {
  const target = new URL(url);
  if (target.hostname === "developers.google.com") target.searchParams.set("hl", "en");
  const res = await fetch(target, {
    headers: { "accept-language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

async function main() {
  let result;
  let pinned;
  let latest;
  try {
    pinned = parsePinnedVersion(readFileSync(path.join(REPO_ROOT, CONFIG_PATH), "utf8"));
    const [notes, deprecations, discoveryText] = await Promise.all([
      fetchText(RELEASE_NOTES_URL),
      fetchText(DEPRECATIONS_URL),
      fetchText(DISCOVERY_URL),
    ]);
    latest = parseLatestVersion(notes);
    result = evaluate({
      pinned,
      latest,
      deprecationRow: parseDeprecationRow(deprecations, pinned),
      discovery: parseDiscoveryList(discoveryText),
    });
  } catch (err) {
    console.error(`dv360 API version watch: could not check: ${err.message}`);
    return EXIT_CANNOT_CHECK;
  }

  for (const line of result.info) console.log(`info: ${line}`);
  if (result.signals.length > 0) {
    for (const s of result.signals) console.error(`SIGNAL: ${s}`);
    console.error(
      "Time to plan the dv360-mcp API version migration (docs/plans/2026-11-25-dv360-v5-migration.md)."
    );
    return EXIT_SIGNAL;
  }
  console.log(`dv360-mcp targets ${pinned}; release notes say latest is ${latest}`);
  return EXIT_OK;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
