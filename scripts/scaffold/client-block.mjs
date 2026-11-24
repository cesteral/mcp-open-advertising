// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The registry `client` block of a scaffolded server, as a contributor writes it
// before `pnpm promote:server`. The scaffold itself has none on purpose: it is
// experimental, so never published, and promotion requires the block. The names
// below are the ones the server template reads (templates/server/base: `{{ENV}}_ACCESS_TOKEN`
// and `{{ENV}}_ACCOUNT_ID` over stdio, `Authorization` and `X-{{Pascal}}-Account-Id` over HTTP),
// so the scaffold-smoke journey and the promote tests exercise a block that is true to the code.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { names } from "./entries.mjs";

/** The `client` block for the template's own credentials. */
export function templateClientBlock(key) {
  const { ENV, Pascal } = names(key);
  return {
    stdio: {
      env: [
        {
          name: `${ENV}_ACCESS_TOKEN`,
          requirement: "required",
          secret: true,
          description: "API access token.",
        },
        {
          name: `${ENV}_ACCOUNT_ID`,
          requirement: "required",
          secret: false,
          description: "Account ID the session works on.",
        },
      ],
    },
    http: {
      headers: [
        {
          name: "Authorization",
          requirement: "required",
          env: `${ENV}_ACCESS_TOKEN`,
          prefix: "Bearer ",
          description: "API access token.",
        },
        {
          name: `X-${Pascal}-Account-Id`,
          requirement: "required",
          env: `${ENV}_ACCOUNT_ID`,
          description: "Account ID.",
        },
      ],
    },
  };
}

/** Writes the template's `client` block into the registry entry whose tool_prefix is `key`. */
export function addClientBlock(root, key) {
  const path = join(root, "registry.json");
  const registry = JSON.parse(readFileSync(path, "utf8"));
  const entry = registry.servers.find((s) => s.tool_prefix === key);
  if (!entry) throw new Error(`no server with tool_prefix "${key}" in registry.json`);
  entry.client = templateClientBlock(key);
  writeFileSync(path, JSON.stringify(registry, null, 2) + "\n");
}
