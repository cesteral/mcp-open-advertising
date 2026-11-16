#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The checked-in render fixture: sha256 of every file the management template
// renders for `foo_bar`, read-only and with writes. render.test.mjs compares
// against it, so a template change is a reviewable diff of this file:
//
//   node scripts/scaffold/render-fixture.mjs --update

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_DIR, renderTemplate } from "./render.mjs";

export const FIXTURE = join(import.meta.dirname, "fixtures/management-render.json");

export const FIXTURE_VARS = {
  key: "foo_bar",
  package: "foo-bar-mcp",
  Pascal: "FooBar",
  ENV: "FOO_BAR",
  displayName: "Foo Bar Ads",
  port: "3014",
  baseUrl: "https://api.foobar.example",
  docsUrl: "https://developers.foobar.example/docs",
  rateLimitPerMinute: "25",
};

const sha = (t) => createHash("sha256").update(t).digest("hex");

/** `{ readOnly: {path: sha}, writes: {path: sha} }` for the current template. */
export function currentRender() {
  const out = {};
  for (const writes of [false, true]) {
    const files = [...renderTemplate(TEMPLATE_DIR, "management", FIXTURE_VARS, { writes })].sort();
    out[writes ? "writes" : "readOnly"] = Object.fromEntries(files.map(([p, t]) => [p, sha(t)]));
  }
  return out;
}

export function readFixture() {
  return JSON.parse(readFileSync(FIXTURE, "utf8"));
}

if (process.argv.includes("--update")) {
  writeFileSync(FIXTURE, JSON.stringify(currentRender(), null, 2) + "\n");
  console.log(`updated ${FIXTURE}`);
}
