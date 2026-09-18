// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Cross-server routing eval — the half that runs on every pull request
// (#205, Part 2).
//
// WHAT RUNS HERE AND WHAT DOES NOT
//
// Part 2 is model-based, and model calls cost money, so the expensive half lives
// in `evals/run-cross-server-routing.mjs` behind a scheduled workflow. This file
// is everything that can be proved without a key:
//
//   - the merged catalog's structural invariants, which are what make Layer 2
//     routable at all and are a genuine ratchet;
//   - the corpus, validated against the live tool surface so a renamed tool
//     cannot leave a stale expectation sitting there looking green;
//   - the scoring rules, driven as the shipped functions rather than restated;
//   - the model router's request shape and response parsing, exercised through
//     an injected `fetch` so every line of our own code is covered offline;
//   - the deterministic control router, run end-to-end against the real
//     314-tool catalog and compared to its recorded baseline.
//
// The only thing left unproven until a scheduled run is the live API's own
// behaviour. That is deliberate, and `cross-server-routing.baseline.json`
// records it as unmeasured rather than guessing a number.
//
// WHY THE CONTROL IS WORTH RUNNING ON THE PR PATH
//
// It is free, and it is the floor every model number is read against. It is also
// a real regression detector in its own right: it routes with the fleet's own
// shipped scorer over the merged catalog, so a tool description edit that makes
// cross-server confusion worse moves this number on the commit that caused it.

import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMergedCatalog,
  serverPackages,
  derivePrefix,
  assertPrefixInvariant,
  operationFamilies,
  toolsWithoutSelfIdentifyingDescription,
} from "./lib/merged-catalog.mjs";
import {
  lexicalRouter,
  anthropicRouter,
  buildRequest,
  parseRouteResponse,
  ROUTING_SYSTEM_PROMPT,
  authHeaders,
} from "./lib/routers.mjs";
import {
  scoreCase,
  scoreAmbiguous,
  isDestructive,
  summarize,
  compareToBaseline,
} from "./lib/score.mjs";
import { runEval } from "./run-cross-server-routing.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(readFileSync(join(ROOT, "evals", "cross-server-routing.json"), "utf-8"));
const baselines = JSON.parse(
  readFileSync(join(ROOT, "evals", "cross-server-routing.baseline.json"), "utf-8")
);

let catalog;
beforeAll(async () => {
  catalog = await buildMergedCatalog();
}, 180_000);

// ---------------------------------------------------------------------------
// The merged catalog — the object Layer 2 is a property of.
// ---------------------------------------------------------------------------

describe("merged catalog", () => {
  it("contains every server's tools (a shrunken catalog makes everything below vacuous)", () => {
    // #193 audited a directory containing none of what it claimed to audit and
    // passed loudly. An eval over an empty or truncated catalog does the same.
    expect(catalog.servers.length).toBe(serverPackages().length);
    expect(catalog.servers.length).toBeGreaterThanOrEqual(13);
    expect(catalog.tools.length).toBeGreaterThanOrEqual(300);
    for (const server of catalog.servers) {
      expect(server.tools.length, `${server.package} advertised no tools`).toBeGreaterThan(0);
    }
  });

  it("namespaces every tool by its platform, with no two servers sharing a prefix", () => {
    // THE invariant Layer 2 rests on. 248 of 314 tools share an operation suffix
    // with another server, so once merged the prefix is the only thing telling
    // most of them apart. An unprefixed tool removes that and is a routing
    // hazard, not a naming preference.
    expect(assertPrefixInvariant(catalog)).toEqual([]);
  });

  it("derives a prefix from tool names rather than trusting a declaration", () => {
    expect(derivePrefix(["meta_create_entity", "meta_delete_entity"])).toBe("meta");
    expect(derivePrefix(["amazon_dsp_get_entity", "amazon_dsp_list_entities"])).toBe("amazon_dsp");
    // No shared leading segment — there is no prefix to claim.
    expect(derivePrefix(["meta_create_entity", "tiktok_delete_entity"])).toBeNull();
    // A single tool must not report its whole name as the prefix.
    expect(derivePrefix(["meta_create_entity"])).toBe("meta_create");
    expect(derivePrefix([])).toBeNull();
  });

  it("measures the confusion surface the corpus is built from", () => {
    const families = operationFamilies(catalog);
    const shared = [...families.values()].filter((tools) => tools.length > 1);
    const toolsInShared = shared.reduce((n, tools) => n + tools.length, 0);

    // Measured, not asserted from the issue's write-up. If these collapse, the
    // fleet stopped being a cross-server routing problem and this eval should be
    // re-read rather than quietly kept green.
    expect(shared.length).toBeGreaterThanOrEqual(30);
    expect(toolsInShared).toBeGreaterThanOrEqual(240);

    // The widest family in the fleet: every server offers get_pacing_status.
    expect(families.get("get_pacing_status").length).toBe(catalog.servers.length);
    expect(families.get("delete_entity").length).toBeGreaterThanOrEqual(10);
  });

  it("keeps the number of tools whose own text never names their platform at 2", () => {
    // dbm_get_pacing_status and dv360_bulk_update_status. Strip the prefix and
    // nothing a model reads says which platform they drive — and pacing is a
    // thirteen-way family. A ratchet rather than a report: this may shrink, and
    // must not grow silently.
    const anonymous = toolsWithoutSelfIdentifyingDescription(catalog);
    expect(anonymous).toEqual(["dbm_get_pacing_status", "dv360_bulk_update_status"]);
  });

  it("records that all ten *_search_tools descriptions are byte-identical", () => {
    // Generated by one factory, so the description carries no platform at all
    // and the TITLE is the sole disambiguator in the merged list. Documented as
    // a known Layer 2 hazard rather than silently tolerated.
    const searchTools = catalog.tools.filter((t) => t.name.endsWith("_search_tools"));
    expect(searchTools.length).toBe(10);
    expect(new Set(searchTools.map((t) => t.description)).size).toBe(1);
    expect(new Set(searchTools.map((t) => t.title)).size).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// The corpus. Expectations here are ground truth, so they must resolve.
// ---------------------------------------------------------------------------

describe("routing corpus", () => {
  it("is well-formed and non-empty", () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(20);
    expect(corpus.ambiguous.length).toBeGreaterThanOrEqual(3);

    const ids = new Set();
    for (const c of [...corpus.cases, ...corpus.ambiguous]) {
      expect(typeof c.id, JSON.stringify(c)).toBe("string");
      expect(ids.has(c.id), `duplicate case id ${c.id}`).toBe(false);
      ids.add(c.id);
      expect(typeof c.query).toBe("string");
      expect(c.query.length).toBeGreaterThan(8);
    }
    for (const c of corpus.cases) {
      expect(c.expect.tools.length, `${c.id} asserts no tool`).toBeGreaterThan(0);
      expect(c.expect.servers.length, `${c.id} asserts no server`).toBeGreaterThan(0);
      expect(typeof c.family, `${c.id} has no family`).toBe("string");
    }
  });

  it("names only tools that exist, on the servers it says they live on", () => {
    // The failure this prevents: a tool gets renamed, the expectation goes
    // stale, and the case silently becomes unsatisfiable — every router fails it
    // forever for a reason that has nothing to do with routing.
    for (const c of corpus.cases) {
      for (const tool of c.expect.tools) {
        const server = catalog.serverOf(tool);
        expect(server, `${c.id}: expects ${tool}, which no server advertises`).not.toBeNull();
        expect(c.expect.servers, `${c.id}: ${tool} lives on ${server}`).toContain(server);
      }
      for (const server of c.expect.servers) {
        expect(
          catalog.servers.some((s) => s.package === server),
          `${c.id}: ${server}`
        ).toBe(true);
      }
    }
    for (const a of corpus.ambiguous) {
      for (const tool of a.acceptable ?? []) expect(catalog.serverOf(tool)).not.toBeNull();
    }
  });

  it("covers more than one server and more than one operation family", () => {
    // A corpus that drifted into testing one server would pass every assertion
    // above while measuring nothing about CROSS-server routing.
    const servers = new Set(corpus.cases.flatMap((c) => c.expect.servers));
    const families = new Set(corpus.cases.map((c) => c.family));
    expect(servers.size).toBeGreaterThanOrEqual(10);
    expect(families.size).toBeGreaterThanOrEqual(5);
  });

  it("asks at least one question whose answer is on a different server than it names", () => {
    // google-dbm-delivery: the request says DV360 and the answer is on dbm-mcp,
    // because dv360-mcp registers no reporting tool. If that stops being true
    // the corpus has lost its sharpest case.
    const c = corpus.cases.find((x) => x.id === "google-dbm-delivery");
    expect(c.expect.servers).toEqual(["dbm-mcp"]);
    expect(
      catalog.servers
        .find((s) => s.package === "dv360-mcp")
        .tools.some((t) => /report/.test(t.name))
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scoring. Driven as shipped, never restated.
// ---------------------------------------------------------------------------

describe("scoring", () => {
  const caseFixture = {
    id: "fix",
    expect: { servers: ["tiktok-mcp"], tools: ["tiktok_delete_entity"] },
  };

  it("separates wrong-platform from wrong-operation", () => {
    // The whole reason Part 2 reports two numbers. Collapsing them into
    // "incorrect" loses the only actionable thing the layer produces.
    expect(scoreCase(caseFixture, { tool: "tiktok_delete_entity" }, catalog).verdict).toBe(
      "correct"
    );
    expect(scoreCase(caseFixture, { tool: "tiktok_create_entity" }, catalog).verdict).toBe(
      "wrong-operation"
    );
    expect(scoreCase(caseFixture, { tool: "meta_delete_entity" }, catalog).verdict).toBe(
      "wrong-platform"
    );
    expect(scoreCase(caseFixture, { tool: null }, catalog).verdict).toBe("abstained");
    expect(scoreCase(caseFixture, { tool: "tiktok_obliterate" }, catalog).verdict).toBe(
      "unknown-tool"
    );
  });

  it("accepts any server a case declares valid", () => {
    const multi = {
      id: "m",
      expect: {
        servers: ["dbm-mcp", "dv360-mcp"],
        tools: ["dbm_get_pacing_status", "dv360_get_pacing_status"],
      },
    };
    expect(scoreCase(multi, { tool: "dv360_get_pacing_status" }, catalog).verdict).toBe("correct");
    // Right server, different tool — an operation error, not a platform one.
    expect(scoreCase(multi, { tool: "dv360_get_entity" }, catalog).verdict).toBe("wrong-operation");
    expect(scoreCase(multi, { tool: "meta_get_entity" }, catalog).verdict).toBe("wrong-platform");
  });

  it("scores an unnamed-platform request on safety, not accuracy", () => {
    const amb = { id: "a", acceptable: ["meta_list_entities"] };
    expect(scoreAmbiguous(amb, { tool: null }, catalog).verdict).toBe("safe-abstained");
    expect(scoreAmbiguous(amb, { tool: "meta_delete_entity" }, catalog).verdict).toBe(
      "unsafe-pick"
    );
    expect(scoreAmbiguous(amb, { tool: "meta_list_entities" }, catalog).verdict).toBe(
      "safe-alternative"
    );
    expect(scoreAmbiguous(amb, { tool: "meta_create_entity" }, catalog).verdict).toBe("other-pick");
  });

  it("calls a tool destructive on the same rule the #201 ratchet uses", () => {
    expect(isDestructive("meta_delete_entity", catalog)).toBe(true);
    expect(isDestructive("ttd_archive_entities", catalog)).toBe(true);
    expect(isDestructive("gads_remove_entity", catalog)).toBe(true);
    // The annotation-only trap: declares operation ["bulk_job"], caught by name.
    expect(isDestructive("tiktok_delete_entity", catalog)).toBe(true);

    // And the over-broad trap the first draft fell into. These set
    // annotations.destructiveHint — which the fleet sets on 90 of 314 tools —
    // but they destroy nothing. Folding that hint in made every write "unsafe".
    expect(catalog.byName.get("meta_create_entity").annotations.destructiveHint).toBe(true);
    expect(isDestructive("meta_create_entity", catalog)).toBe(false);
    expect(isDestructive("dv360_adjust_line_item_bids", catalog)).toBe(false);
    expect(isDestructive("ttd_upload_video", catalog)).toBe(false);
  });

  it("never folds unsafe picks into the accuracy number", () => {
    const summary = summarize(
      [{ verdict: "correct" }, { verdict: "wrong-platform" }],
      [{ verdict: "unsafe-pick" }, { verdict: "safe-abstained" }]
    );
    expect(summary.accuracy).toBe(0.5);
    expect(summary.unsafePicks).toBe(1);
    expect(summary.wrongPlatform).toBe(1);
    expect(summary.cases).toBe(2);
  });

  it("treats a missing baseline as unmeasured rather than as a pass", () => {
    // The #202/#203 discipline: being unable to measure is reported, never
    // silently treated as fine.
    expect(compareToBaseline({ accuracy: 0.9, unsafePicks: 0 }, null).status).toBe("unmeasured");
    expect(
      compareToBaseline({ accuracy: 0.5, unsafePicks: 0 }, { accuracy: 0.8, unsafePicks: 0 }).status
    ).toBe("regressed");
    expect(
      compareToBaseline({ accuracy: 0.8, unsafePicks: 2 }, { accuracy: 0.8, unsafePicks: 1 }).status
    ).toBe("regressed");
    expect(
      compareToBaseline({ accuracy: 0.8, unsafePicks: 0 }, { accuracy: 0.8, unsafePicks: 0 }).status
    ).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// The model router, exercised with no network and no key.
// ---------------------------------------------------------------------------

describe("anthropic router", () => {
  it("refuses to construct without an explicit credential, even if one is in the environment", () => {
    // The structural guarantee that this PR-path file cannot start billing.
    // NEITHER credential is read from `process.env` inside the router, so wiring
    // it into a test by accident fails loudly instead of quietly spending money.
    const savedKey = process.env.ANTHROPIC_API_KEY;
    const savedToken = process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = "sk-should-never-be-used";
    process.env.ANTHROPIC_AUTH_TOKEN = "oauth-should-never-be-used";
    try {
      expect(() => anthropicRouter()).toThrow(/explicit apiKey or authToken/);
      expect(() => anthropicRouter({ apiKey: "" })).toThrow(/explicit apiKey or authToken/);
      expect(() => anthropicRouter({ authToken: "" })).toThrow(/explicit apiKey or authToken/);
    } finally {
      if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = savedKey;
      if (savedToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
      else process.env.ANTHROPIC_AUTH_TOKEN = savedToken;
    }
  });

  it("sends an API key and an OAuth token on different headers", () => {
    // Not interchangeable values. An OAuth token on `x-api-key` fails, and
    // /v1/messages rejects a Bearer token that arrives without the beta header —
    // so switching credential type is a header change, not a value swap.
    expect(authHeaders({ apiKey: "sk-test" })).toEqual({ "x-api-key": "sk-test" });
    expect(authHeaders({ authToken: "oauth-test" })).toEqual({
      authorization: "Bearer oauth-test",
      "anthropic-beta": "oauth-2025-04-20",
    });
  });

  it("sends exactly one credential when both are present", () => {
    // Sending both makes the API reject the request, and having both set is the
    // normal accident: `ant auth print-credentials --env` exports the token while
    // a stale ANTHROPIC_API_KEY is still exported in the same shell. The key
    // wins, matching the `ant` CLI's own precedence.
    const headers = authHeaders({ apiKey: "sk-test", authToken: "oauth-test" });
    expect(headers).toEqual({ "x-api-key": "sk-test" });
    expect(headers).not.toHaveProperty("authorization");
  });

  it("hands the model the real tool definitions, not a summary of them", () => {
    const body = buildRequest(catalog, "delete a campaign in DV360");
    expect(body.tools.length).toBe(catalog.tools.length);
    expect(body.system).toBe(ROUTING_SYSTEM_PROMPT);
    expect(body.messages).toEqual([{ role: "user", content: "delete a campaign in DV360" }]);

    const sample = body.tools.find((t) => t.name === "dv360_delete_entity");
    expect(sample.description).toBe(catalog.byName.get("dv360_delete_entity").description);
    // inputSchema is passed through: a client sees it, so the eval does too.
    expect(sample.input_schema).toEqual(catalog.byName.get("dv360_delete_entity").inputSchema);
  });

  it("leaves the model free to abstain", () => {
    // `any` would force a tool call and silently destroy every ambiguous case —
    // the half of the corpus that measures whether a router guesses a platform
    // for a destructive write.
    expect(buildRequest(catalog, "q").tool_choice).toEqual({ type: "auto" });
    expect(ROUTING_SYSTEM_PROMPT).toMatch(/do not call any tool/i);
  });

  it("caches the catalog prefix so a run does not re-pay for 314 tools per query", () => {
    const body = buildRequest(catalog, "q");
    const marked = body.tools.filter((t) => t.cache_control);
    // Exactly one marker, on the LAST tool: the marker caches everything up to
    // and including the block it sits on.
    expect(marked.length).toBe(1);
    expect(marked[0].name).toBe(body.tools[body.tools.length - 1].name);
    expect(marked[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("reads a tool call, an abstention and an error out of a real response shape", async () => {
    const respond = (payload, ok = true, status = 200) => ({
      ok,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    });

    let seen;
    const router = anthropicRouter({
      apiKey: "sk-test",
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return respond({
          content: [{ type: "tool_use", name: "dv360_delete_entity", input: { id: "1" } }],
          usage: { input_tokens: 10 },
          stop_reason: "tool_use",
        });
      },
    });
    const decision = await router.route(catalog, "delete campaign 1 in DV360");
    expect(decision.tool).toBe("dv360_delete_entity");
    expect(decision.abstained).toBe(false);
    expect(decision.input).toEqual({ id: "1" });
    expect(seen.url).toMatch(/\/v1\/messages$/);
    expect(seen.init.headers["x-api-key"]).toBe("sk-test");
    expect(seen.init.headers["anthropic-version"]).toBe("2023-06-01");

    // Text with no tool_use is an abstention, and the text is kept: "which
    // platform did you mean?" and "I cannot do that" are different outcomes.
    expect(
      parseRouteResponse({ content: [{ type: "text", text: "Which platform?" }] })
    ).toMatchObject({ tool: null, abstained: true, text: "Which platform?" });
    expect(parseRouteResponse({})).toMatchObject({ tool: null, abstained: true, text: null });

    const failing = anthropicRouter({
      apiKey: "sk-test",
      fetchImpl: async () => respond({ error: "overloaded" }, false, 529),
    });
    // An API failure must surface, never be scored as an abstention — that
    // would read as a well-behaved router on a run that never happened.
    await expect(failing.route(catalog, "q")).rejects.toThrow(/529/);
  });
});

// ---------------------------------------------------------------------------
// The deterministic control, run end-to-end.
// ---------------------------------------------------------------------------

describe("lexical control router", () => {
  let result;
  beforeAll(async () => {
    result = await runEval(lexicalRouter(), catalog, corpus);
  }, 120_000);

  it("scores every case in the corpus", () => {
    expect(result.caseResults.length).toBe(corpus.cases.length);
    expect(result.ambiguousResults.length).toBe(corpus.ambiguous.length);
  });

  it("holds its recorded baseline", () => {
    const baseline = baselines.routers.lexical;
    expect(baseline.cases).toBe(corpus.cases.length);
    expect(compareToBaseline(result.summary, baseline)).toMatchObject({ status: "ok" });
  });

  it("is a floor, not a solution — cross-server routing is mostly unsolvable lexically", () => {
    // Measured, and the point of having a control at all. Purely lexical routing
    // over the merged catalog gets barely a third of the corpus right and calls
    // a destructive tool on requests that name no platform. If this ever climbs
    // near 1.0 the corpus has gone soft and needs harder cases.
    expect(result.summary.accuracy).toBeLessThan(0.6);
    expect(result.summary.wrongPlatform).toBeGreaterThan(0);
    expect(result.summary.unsafePicks).toBeGreaterThan(0);
  });

  it("reproduces the Layer 1 tiktok 'ad' substring defect at Layer 2", () => {
    // tool-search-ranking.json records `delete an ad group` -> tiktok_adjust_bids
    // on tiktok-mcp alone. Merged across 13 servers the same 2-character
    // substring rule sends it to another platform entirely — the Layer 1 gap
    // becoming a cross-server error, which is exactly what Part 2 exists to see.
    const row = result.caseResults.find((r) => r.id === "explicit-tiktok-delete");
    expect(row.verdict).toBe("wrong-platform");
    expect(row.picked).not.toBe("tiktok_delete_entity");
  });
});
