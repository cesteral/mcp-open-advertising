// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Deterministic per-server ranker regression evals (#205, Part 1).
//
// WHAT THIS IS
//
// Every server that ships a `{platform}_search_tools` tool ranks its own
// registry with `packages/shared/src/utils/tool-search.ts`. That ranking is a
// pure function of tool NAME, TITLE and DESCRIPTION — text we hand-edit in
// nearly every feature PR — and until now nothing asserted its outcome. A
// one-word description tweak could reorder which tool a client lands on, and
// the diff would look harmless.
//
// HOW IT DRIVES THE RANKER
//
// It boots each built server and calls the real `{platform}_search_tools` tool
// over the MCP wire, then reads `structuredContent`. It does NOT import the
// scoring function and re-run it, and it does NOT reimplement the weights.
// That distinction is the whole point: this repo has been bitten twice by tests
// that asserted a reconstructed shape and stayed green when the fix was
// reverted (aa17072). Driving the shipped tool end-to-end means the thing under
// test is exactly what a client gets.
//
// WHAT IT PROVES, AND WHAT IT DOES NOT
//
// Layer 1 only. `tool-search.ts` searches ONE server's own registry, so
// cross-server confusion — a client's model picking between dv360 and meta from
// a merged `tools/list` — is unreachable from here and needs a model-based
// harness (#205 Part 2, deliberately not blocking this).
//
// Even within Layer 1 this is a proxy: real clients route with a model over the
// full tool list, and passing here does not prove an LLM picks correctly. What
// it proves is that a description edit did not silently invert the ranking.
// Mechanical, free, and worth having regardless.
//
// THE `gaps` SECTION IS NOT AN ENDORSEMENT
//
// `cases` pin rankings worth protecting. `gaps` pin rankings that are currently
// WRONG for a user — a synonym the lexical ranker cannot bridge, a 2-character
// query token buying a full name-weight match. They are asserted so the defect
// is auditable and so that IMPROVING the ranker fails loudly and visibly rather
// than passing silently. A failing gap means "this got better — promote it to a
// case", which is the opposite of a regression.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withServerClient } from "../scripts/lib/boot-server.mjs";
import { searchTools } from "../packages/shared/dist/utils/tool-search.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(readFileSync(join(ROOT, "evals", "tool-search-ranking.json"), "utf-8"));

/**
 * The SDK's CallToolResultSchema strips `structuredContent` for tools whose
 * output schema it has not been handed, so an identity schema returns the raw
 * result — the same trick `boot-server.mjs` uses for `tools/list`.
 */
const IDENTITY_SCHEMA = {
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
};

/** Run every query for one server against its live search tool, in one boot. */
async function rankAll(server, platform, queries) {
  return withServerClient(server, async (client) => {
    const out = new Map();
    for (const query of queries) {
      const res = await client.request(
        {
          method: "tools/call",
          params: {
            name: `${platform}_search_tools`,
            arguments: { query, limit: 50 },
          },
        },
        IDENTITY_SCHEMA
      );
      out.set(query, res.structuredContent);
    }
    return out;
  });
}

const rankOf = (results, name) => results.findIndex((r) => r.name === name);
const summarize = (results, n = 5) =>
  results
    .slice(0, n)
    .map((r, i) => `#${i + 1} ${r.name} (${r.score})`)
    .join(", ") || "(no matches)";

// ---------------------------------------------------------------------------
// Structure: a corpus that silently loses its cases must not pass quietly.
// ---------------------------------------------------------------------------

describe("eval corpus", () => {
  it("is well-formed", () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(Array.isArray(corpus.cases)).toBe(true);
    expect(Array.isArray(corpus.gaps)).toBe(true);

    for (const c of [...corpus.cases, ...corpus.gaps]) {
      expect(typeof c.server, JSON.stringify(c)).toBe("string");
      expect(typeof c.platform, JSON.stringify(c)).toBe("string");
      expect(typeof c.query, JSON.stringify(c)).toBe("string");
    }
    for (const c of corpus.cases) {
      const hasAssertion = c.expectTop || (Array.isArray(c.expectInTopN) && c.n);
      expect(hasAssertion, `case has no assertion: ${c.query}`).toBeTruthy();
    }
    for (const g of corpus.gaps) {
      expect(typeof g.wanted, JSON.stringify(g)).toBe("string");
      expect(typeof g.actualTop, JSON.stringify(g)).toBe("string");
      expect(typeof g.wantedNotInTopN, JSON.stringify(g)).toBe("number");
      // A gap without a reason is just a mystery assertion.
      expect((g.note ?? "").length, `gap needs a note: ${g.query}`).toBeGreaterThan(40);
    }
  });

  it("covers a meaningful share of the fleet's search-enabled servers", () => {
    // 10 of 13 servers register a search tool; dbm-mcp, gads-mcp and sa360-mcp
    // do NOT, so "one case per server" from the issue is unachievable for three
    // of them. Asserted so a future reader does not go looking for the missing
    // three, and so deleting coverage is visible.
    const servers = new Set(corpus.cases.map((c) => c.server));
    expect(servers.size).toBeGreaterThanOrEqual(8);
    for (const absent of ["dbm-mcp", "gads-mcp", "sa360-mcp"]) {
      expect(servers.has(absent), `${absent} has no search tool — it cannot be covered`).toBe(
        false
      );
    }
  });

  it("has enough cases to be worth running", () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Drive the real ranker, one boot per server.
// ---------------------------------------------------------------------------

const byServer = new Map();
for (const entry of [...corpus.cases, ...corpus.gaps]) {
  if (!byServer.has(entry.server)) {
    byServer.set(entry.server, { platform: entry.platform, queries: new Set() });
  }
  byServer.get(entry.server).queries.add(entry.query);
}

const ranked = new Map();

beforeAll(async () => {
  for (const [server, { platform, queries }] of byServer) {
    ranked.set(server, await rankAll(server, platform, [...queries]));
  }
}, 300_000);

afterAll(() => ranked.clear());

describe("ranker returns results at all", () => {
  it.each([...byServer.keys()])("%s: search tool responds over the wire", (server) => {
    const perQuery = ranked.get(server);
    expect(perQuery, `${server} produced no rankings`).toBeTruthy();
    for (const [query, structured] of perQuery) {
      // totalRegistered excludes the search tool itself. A zero here would make
      // every ranking assertion below vacuously unfalsifiable.
      expect(structured.totalRegistered, `${server} "${query}"`).toBeGreaterThan(0);
      expect(Array.isArray(structured.results), `${server} "${query}"`).toBe(true);
    }
  });
});

describe("rankings worth protecting", () => {
  it.each(corpus.cases.map((c) => [`${c.server} :: ${c.query}`, c]))("%s", (_label, c) => {
    const { results } = ranked.get(c.server).get(c.query);
    const seen = summarize(results);

    if (c.expectTop) {
      expect(results[0]?.name, `expected top hit for "${c.query}" — got: ${seen}`).toBe(
        c.expectTop
      );
    }

    for (const loser of c.outranks ?? []) {
      const winnerRank = rankOf(results, c.expectTop);
      const loserRank = rankOf(results, loser);
      expect(
        loserRank,
        `"${loser}" should appear at all for "${c.query}" — got: ${seen}`
      ).toBeGreaterThanOrEqual(0);
      expect(
        winnerRank,
        `"${c.expectTop}" must outrank "${loser}" for "${c.query}" — got: ${seen}`
      ).toBeLessThan(loserRank);
    }

    for (const name of c.expectInTopN ?? []) {
      const r = rankOf(results, name);
      expect(
        r,
        `"${name}" should be in the top ${c.n} for "${c.query}" — got: ${seen}`
      ).toBeGreaterThanOrEqual(0);
      expect(
        r,
        `"${name}" should be in the top ${c.n} for "${c.query}" — got: ${seen}`
      ).toBeLessThan(c.n);
    }
  });
});

describe("documented ranker gaps (a failure here means it got BETTER)", () => {
  it.each(corpus.gaps.map((g) => [`${g.server} :: ${g.query}`, g]))("%s", (_label, g) => {
    const { results } = ranked.get(g.server).get(g.query);
    const seen = summarize(results);

    expect(
      results[0]?.name,
      `gap moved for "${g.query}": expected the ranker to still surface "${g.actualTop}" first — got: ${seen}. ` +
        `If the ranker improved, update or promote this gap to a case.`
    ).toBe(g.actualTop);

    const wantedRank = rankOf(results, g.wanted);
    const inTopN = wantedRank >= 0 && wantedRank < g.wantedNotInTopN;
    expect(
      inTopN,
      `"${g.wanted}" is now within the top ${g.wantedNotInTopN} for "${g.query}" — the gap is closed. ` +
        `Promote this entry from gaps[] to cases[]. Ranking: ${seen}`
    ).toBe(false);
  });
});

describe("tie-breaking is registry order, not arbitrary", () => {
  it("equal scores resolve in tools/list order (stable sort)", async () => {
    // Not cosmetic: reordering the `allTools` array silently reorders search
    // results for every tied query, with no scoring change to show for it.
    // Nothing else in the repo states this, so it is pinned here.
    const { listRawTools } = await import("../scripts/lib/boot-server.mjs");
    await withServerClient("ttd-mcp", async (client) => {
      const registry = (await listRawTools(client)).map((t) => t.name);
      const res = await client.request(
        {
          method: "tools/call",
          params: {
            name: "ttd_search_tools",
            arguments: { query: "download the finished report as a CSV", limit: 10 },
          },
        },
        IDENTITY_SCHEMA
      );
      const results = res.structuredContent.results;

      const groups = new Map();
      for (const r of results) {
        if (!groups.has(r.score)) groups.set(r.score, []);
        groups.get(r.score).push(r.name);
      }
      const tied = [...groups.values()].filter((g) => g.length > 1);
      expect(tied.length, "this query is expected to produce at least one tie").toBeGreaterThan(0);

      for (const group of tied) {
        const indices = group.map((n) => registry.indexOf(n));
        const ascending = indices.every((v, i) => i === 0 || v > indices[i - 1]);
        expect(ascending, `tied group ${group.join(", ")} is not in registry order`).toBe(true);
      }
    });
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Scoring shape.
//
// The ordering cases above pin OUTCOMES, and it turned out they do not pin the
// ranker's scoring shape: flattening NAME_WEIGHT from 5 to 1 left all of them
// green, because in the real corpus the winner and its rivals usually both match
// on name, so scaling that weight uniformly preserves their relative order.
//
// These pin the constants directly, against the SHIPPED `searchTools` export
// (the module's own documented unit-test entry point) with synthetic tools, so
// the weights and their documented quirks cannot drift unnoticed.
// ---------------------------------------------------------------------------

describe("scoring weights and their documented quirks", () => {
  const tool = (name, title, description) => ({
    name,
    title,
    description,
    inputSchema: {},
    logic: async () => ({}),
  });
  const run = (tools, query) => searchTools(tools, { query }, "self").results;
  const scoreOf = (results, name) => results.find((r) => r.name === name)?.score;

  it("weights name 5, title 3, description 1", () => {
    const results = run(
      [
        tool("x_alpha", "Zulu", "zulu zulu"),
        tool("x_zulu", "Alpha", "zulu"),
        tool("x_zulu2", "Zulu", "alpha"),
      ],
      "alpha"
    );
    expect(scoreOf(results, "x_alpha")).toBe(5);
    expect(scoreOf(results, "x_zulu")).toBe(3);
    expect(scoreOf(results, "x_zulu2")).toBe(1);
  });

  it("splits a tool name into its words, and scores a name once per query word", () => {
    // Names used to be ONE token, because `_` is a word character in the
    // tokenizer. Only names are split now; descriptions keep `_` so an enum
    // like SINGLE_IMAGE_AD stays one token (see the "ad" test below).
    expect(run([tool("alpha_beta", "Zulu", "zulu")], "alpha")[0].score).toBe(5);
    expect(run([tool("alpha_beta", "Zulu", "zulu")], "beta")[0].score).toBe(5);
    // Name weight accumulates per QUERY word that matches some name word...
    expect(run([tool("alpha_beta", "Zulu", "zulu")], "alpha beta")[0].score).toBe(10);
    // ...but a name repeating a word still pays one query word only once.
    expect(run([tool("alpha_alpha", "Zulu", "zulu")], "alpha")[0].score).toBe(5);
  });

  it("accumulates title and description matches, unlike name", () => {
    // Two title hits (3+3) plus three description hits (1+1+1).
    expect(run([tool("x_zulu", "Alpha Alpha", "alpha alpha alpha")], "alpha")[0].score).toBe(9);
  });

  it("does not let a 2-character query word match inside a longer name word", () => {
    // The old rule matched substrings in EITHER direction across the whole
    // name, so "ad" scored +5 on `adjust`, `download` and `upload` — which is
    // how `delete an ad group` used to rank tiktok_adjust_bids first.
    expect(run([tool("x_adjust", "Zulu", "zulu")], "ad")).toHaveLength(0);
    expect(run([tool("x_download_report", "Zulu", "zulu")], "ad")).toHaveLength(0);
    expect(run([tool("x_upload_video", "Zulu", "zulu")], "ad")).toHaveLength(0);
    // The word "ad" itself still matches.
    expect(run([tool("x_get_ad_preview", "Zulu", "zulu")], "ad")[0].score).toBe(5);
  });

  it("matches a name word by prefix only from 3 characters", () => {
    expect(run([tool("x_campaigns", "Zulu", "zulu")], "camp")[0].score).toBe(5);
    expect(run([tool("x_campaigns", "Zulu", "zulu")], "ca")).toHaveLength(0);
    // One-directional: a query word longer than the name word is not a match.
    expect(run([tool("x_camp", "Zulu", "zulu")], "campaign")).toHaveLength(0);
  });

  it("folds plurals in names and titles; in descriptions, only the query side", () => {
    expect(run([tool("x_create_entity", "Zulu", "zulu")], "entities")[0].score).toBe(5);
    expect(run([tool("x_zulu", "Campaigns", "zulu")], "campaign")[0].score).toBe(3);
    // Folding description WORDS let "deletes" in cm360_delete_report_schedule's
    // prose count as "delete" and tie cm360's delete-a-campaign case, so it is
    // off there...
    expect(run([tool("x_zulu", "Zulu", "reports")], "report")).toHaveLength(0);
    // ...but the QUERY word is still folded, so a plural query meets a
    // singular description word.
    expect(run([tool("x_zulu", "Zulu", "report")], "reports")[0].score).toBe(1);
  });

  it("reads a small set of query synonyms as the word tool names use", () => {
    // "remove" → "delete" is the synonym gap #205 recorded on dv360 and ttd.
    expect(run([tool("x_delete_entity", "Zulu", "zulu")], "remove")[0].score).toBe(5);
    expect(run([tool("x_update_entity", "Zulu", "zulu")], "modify")[0].score).toBe(5);
    // matchedTokens reports the word the caller typed, not the synonym.
    expect(run([tool("x_delete_entity", "Zulu", "zulu")], "remove")[0].matchedTokens).toEqual([
      "remove",
    ]);
    // delete ↔ remove goes both ways, because gads names its tool gads_remove_entity...
    expect(run([tool("x_remove_entity", "Zulu", "zulu")], "delete")[0].score).toBe(5);
    // ...but other entries go one way only: "delete" does not reach "erase".
    expect(run([tool("x_erase_entity", "Zulu", "zulu")], "delete")).toHaveLength(0);
  });

  it("ignores description tokens past the 400-token cap", () => {
    const filler = Array(400).fill("zulu").join(" ");
    expect(run([tool("x_zulu", "Zulu", `alpha ${filler}`)], "alpha")[0].score).toBe(1);
    // Same token, one position beyond the cap: silently invisible. Long
    // descriptions have their tails ignored, which is not obvious from reading one.
    expect(run([tool("x_zulu", "Zulu", `${filler} alpha`)], "alpha")).toHaveLength(0);
  });

  it("falls back to a browse listing when the query is all stop words", () => {
    // Not an empty result: the inventory comes back unscored. A client that
    // treats score 0 as "no match" would misread this.
    const results = run([tool("x_zulu", "Zulu", "zulu")], "the");
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].matchedTokens).toEqual([]);
  });

  it("excludes the search tool itself and any zero-scoring tool", () => {
    expect(
      run([tool("x_zulu", "Zulu", "zulu"), tool("self", "Self", "alpha")], "alpha")
    ).toHaveLength(0);
  });
});
