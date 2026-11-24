// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Renders MCP client configuration (Claude Code, Codex) from the `client` block
// of each registry.json entry. Pure functions: scripts/generate/generate-client-configs.mjs
// writes the output, scripts/lib/client-configs.test.mjs checks it against the code.
//
// What goes into a snippet: every `required` entry, plus the `preferred`
// members of an `alternative` group. `optional` entries are listed in the
// reference table but never in a snippet, because an unset `${VAR}` reaches the
// server as the literal text "${VAR}" in Claude Code.

import { deployableServers } from "./server-status.mjs";

/** Name a client config uses for a server: `dv360-mcp` becomes `cesteral-dv360`. */
export const serverKey = (server) => `cesteral-${server.package.replace(/-mcp$/, "")}`;

/** The npm package a stdio client launches. */
export const npmPackage = (server) => `@cesteral/${server.package}`;

/** Entries that belong in a generated snippet. */
export const inSnippet = (entry) =>
  entry.requirement === "required" || (entry.requirement === "alternative" && entry.preferred);

export const stdioEnv = (server) => server.client.stdio.env.filter(inSnippet);
export const httpHeaders = (server) => server.client.http.headers.filter(inSnippet);

/** Self-hosted URL a locally run HTTP server answers on. */
export const localUrl = (server) => `http://localhost:${server.port}/mcp`;

/** `${NAME}`: the variable expansion Claude Code does in a config value. */
const expand = (name) => "${" + name + "}";

/** One header's value, as Claude Code expands it. */
const headerValue = (h) => h.value ?? (h.prefix ?? "") + expand(h.env);

export function claudeCodeStdio(server) {
  const env = { MCP_TRANSPORT_MODE: "stdio" };
  for (const e of stdioEnv(server)) env[e.name] = expand(e.name);
  return { command: "npx", args: ["-y", npmPackage(server)], env };
}

export function claudeCodeHttp(server) {
  const headers = {};
  for (const h of httpHeaders(server)) headers[h.name] = headerValue(h);
  return { type: "http", url: localUrl(server), headers };
}

/** `.mcp.json` text for the given servers. */
export function claudeCodeMcpJson(servers, transport = "stdio") {
  const mcpServers = {};
  for (const s of servers) {
    mcpServers[serverKey(s)] = transport === "http" ? claudeCodeHttp(s) : claudeCodeStdio(s);
  }
  return JSON.stringify({ mcpServers }, null, 2) + "\n";
}

/** `claude mcp add` one-liner (stdio). Secrets come from the shell at add time. */
export function claudeCodeAddCommand(server) {
  const env = [
    "--env MCP_TRANSPORT_MODE=stdio",
    ...stdioEnv(server).map((e) => `--env ${e.name}="$${e.name}"`),
  ];
  return `claude mcp add --transport stdio ${serverKey(server)} ${env.join(" ")} -- npx -y ${npmPackage(server)}`;
}

const tomlString = (s) => JSON.stringify(s);

/** Codex `[mcp_servers.<name>]` table for a stdio server. */
export function codexStdio(server) {
  const names = stdioEnv(server).map((e) => e.name);
  const lines = [
    `[mcp_servers.${serverKey(server)}]`,
    `command = "npx"`,
    `args = ["-y", ${tomlString(npmPackage(server))}]`,
    `env = { MCP_TRANSPORT_MODE = "stdio" }`,
  ];
  if (names.length) lines.push(`env_vars = [${names.map(tomlString).join(", ")}]`);
  return lines.join("\n") + "\n";
}

/**
 * Codex table for a self-hosted HTTP server: a bearer token goes in
 * `bearer_token_env_var`, a fixed header in `http_headers`, and a header taken
 * from the environment in `env_http_headers`. Returns null for a header Codex
 * cannot express (a prefixed value on a header other than Authorization), and
 * the reference then points at stdio.
 */
export function codexHttp(server) {
  const lines = [`[mcp_servers.${serverKey(server)}]`, `url = ${tomlString(localUrl(server))}`];
  const fixed = [];
  const fromEnv = [];
  for (const h of httpHeaders(server)) {
    if (h.name === "Authorization" && h.prefix === "Bearer ") {
      lines.push(`bearer_token_env_var = ${tomlString(h.env)}`);
    } else if (h.prefix) {
      return null;
    } else if (h.value) {
      fixed.push(`${tomlString(h.name)} = ${tomlString(h.value)}`);
    } else {
      fromEnv.push(`${tomlString(h.name)} = ${tomlString(h.env)}`);
    }
  }
  if (fixed.length) lines.push(`http_headers = { ${fixed.join(", ")} }`);
  if (fromEnv.length) lines.push(`env_http_headers = { ${fromEnv.join(", ")} }`);
  return lines.join("\n") + "\n";
}

export function codexConfigToml(servers) {
  return servers.map(codexStdio).join("\n");
}

// ---------------------------------------------------------------------------
// Reference document
// ---------------------------------------------------------------------------

const cell = (s) => String(s).replace(/\|/g, "\\|");
const req = (e) =>
  e.requirement === "alternative"
    ? `one of: ${e.group}${e.preferred ? " (preferred)" : ""}`
    : e.requirement;

function envTable(server) {
  const rows = server.client.stdio.env.map(
    (e) => `| \`${e.name}\` | ${req(e)} | ${e.secret ? "yes" : "no"} | ${cell(e.description)} |`
  );
  return ["| Variable | Needed | Secret | What it is |", "| --- | --- | --- | --- |", ...rows].join(
    "\n"
  );
}

function headerTable(server) {
  const rows = server.client.http.headers.map((h) => {
    const value = h.value
      ? `\`${h.value}\``
      : `\`$${h.env}\`${h.prefix ? ` (prefixed \`${h.prefix.trim()}\`)` : ""}`;
    return `| \`${h.name}\` | ${req(h)} | ${value} | ${cell(h.description)} |`;
  });
  return ["| Header | Needed | Value | What it is |", "| --- | --- | --- | --- |", ...rows].join(
    "\n"
  );
}

function section(server) {
  const key = serverKey(server);
  const codexH = codexHttp(server);
  const out = [
    `## ${server.title} (${key})`,
    "",
    `${server.description}. Port \`${server.port}\`.`,
    "",
    "### Credentials (stdio)",
    "",
    envTable(server),
    "",
    "### Claude Code, stdio",
    "",
    "Put this in `.mcp.json`:",
    "",
    "```json",
    JSON.stringify({ mcpServers: { [key]: claudeCodeStdio(server) } }, null, 2),
    "```",
    "",
    "Or add it from the shell:",
    "",
    "```bash",
    claudeCodeAddCommand(server),
    "```",
    "",
    "### Codex, stdio",
    "",
    "Put this in `~/.codex/config.toml`:",
    "",
    "```toml",
    codexStdio(server).trimEnd(),
    "```",
    "",
    "### Self-hosted HTTP",
    "",
    `Run \`./scripts/dev-server.sh ${server.package}\` first. Headers the server reads:`,
    "",
    headerTable(server),
    "",
    "Claude Code:",
    "",
    "```json",
    JSON.stringify({ mcpServers: { [key]: claudeCodeHttp(server) } }, null, 2),
    "```",
    "",
  ];
  if (codexH) {
    out.push("Codex:", "", "```toml", codexH.trimEnd(), "```", "");
  } else {
    out.push(
      "Codex: this server sends a header Codex cannot express over HTTP. Use the stdio config above.",
      ""
    );
  }
  return out.join("\n");
}

/** GitHub's heading anchor for a section title. */
function anchor(server) {
  return `${server.title} (${serverKey(server)})`
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/ /g, "-");
}

export function referenceDocument(registry) {
  const servers = deployableServers(registry);
  return [
    "<!-- Generated by scripts/generate/generate-client-configs.mjs from registry.json. Do not edit by hand: run `pnpm run generate:client-configs`. -->",
    "",
    "# Client configuration reference",
    "",
    "Every server, with the credentials it needs and a ready config for Claude Code and Codex. Start with [Connect your AI client](connect-clients.md) for the walkthrough.",
    "",
    "Snippets read secrets from your shell environment (`${VAR}` in Claude Code, `env_vars` in Codex), so no secret is written into a config file. Optional variables are in the tables but left out of the snippets.",
    "",
    "| Server | Config name | Port |",
    "| --- | --- | --- |",
    ...servers.map((s) => `| [${s.title}](#${anchor(s)}) | \`${serverKey(s)}\` | ${s.port} |`),
    "",
    ...servers.map(section),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const REQUIREMENTS = ["required", "optional", "alternative"];

/**
 * Violations in the `client` block of each given server, one line each. A stable
 * server needs a complete block, because its package is published and the
 * generated configs tell users to `npx` it. An experimental server is never
 * published, so the generator skips it and promotion (`pnpm promote:server`)
 * is where the block becomes required.
 */
export function checkClientBlocks(servers) {
  const out = [];
  for (const s of servers) {
    const env = s.client?.stdio?.env;
    const headers = s.client?.http?.headers;
    if (!Array.isArray(env) || !env.length || !Array.isArray(headers) || !headers.length) {
      out.push(
        `${s.package}: registry \`client\` needs \`stdio.env\` (the variables the server reads) and \`http.headers\` (see docs/guides/adding-a-new-server.md)`
      );
      continue;
    }
    const names = env.map((e) => e.name);
    if (new Set(names).size !== names.length)
      out.push(`${s.package}: client.stdio.env names a variable twice`);
    for (const e of env) {
      const where = `${s.package}: client.stdio.env ${e.name}`;
      if (!REQUIREMENTS.includes(e.requirement))
        out.push(`${where}: requirement must be one of ${REQUIREMENTS.join(", ")}`);
      if (typeof e.secret !== "boolean") out.push(`${where}: secret must be true or false`);
      if (!e.description) out.push(`${where}: needs a description`);
      if (e.requirement === "alternative" && !e.group)
        out.push(`${where}: an alternative needs a group`);
    }
    for (const h of headers) {
      const where = `${s.package}: client.http.headers ${h.name}`;
      if (!REQUIREMENTS.includes(h.requirement))
        out.push(`${where}: requirement must be one of ${REQUIREMENTS.join(", ")}`);
      if (!h.description) out.push(`${where}: needs a description`);
      if (Boolean(h.value) === Boolean(h.env))
        out.push(
          `${where}: needs exactly one of value (fixed) or env (a variable the user exports)`
        );
    }
    if (!stdioEnv(s).length)
      out.push(
        `${s.package}: client.stdio.env has no required or preferred entry, so a snippet would carry no credential`
      );
  }
  return out;
}
