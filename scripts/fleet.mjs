#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The fleet's server list, read from registry.json, for shell scripts and
// Cloud Build steps. Those used to carry their own copies of the list, and a
// server missing from one was silently never published, built or tested.
//
//   node scripts/fleet.mjs servers        every server, one package name per line, registry order
//   node scripts/fleet.mjs deployable     the stable servers only: what publish and deploy cover
//   node scripts/fleet.mjs port <package>  the package's default port
//
// Plain node, no dependencies: it runs before `pnpm install` in Cloud Build.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deployableServers } from "./lib/server-status.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
const servers = registry.servers;

function fail(message) {
  process.stderr.write(`fleet: ${message}\n`);
  process.exit(2);
}

const [command, arg] = process.argv.slice(2);
switch (command) {
  case "servers":
    process.stdout.write(servers.map((s) => s.package).join("\n") + "\n");
    break;
  case "deployable":
    process.stdout.write(
      deployableServers(registry)
        .map((s) => s.package)
        .join("\n") + "\n"
    );
    break;
  case "port": {
    const server = servers.find((s) => s.package === arg);
    if (!server) fail(`unknown server ${arg ?? "(none)"}; see registry.json`);
    if (!Number.isInteger(server.port)) fail(`${arg} has no port in registry.json`);
    process.stdout.write(`${server.port}\n`);
    break;
  }
  default:
    fail("usage: fleet.mjs servers | fleet.mjs deployable | fleet.mjs port <package>");
}
