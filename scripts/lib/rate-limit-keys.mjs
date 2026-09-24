// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// "Does every rate-limit key a server consumes actually match a limit that
// server configured?" — static extraction for the ratchet in
// rate-limit-keys.test.mjs.
//
// WHY THIS EXISTS
//
// `RateLimiter.consume(key)` returns immediately for a key that matches no
// configured pattern. That is a silent no-op, not an error, and two servers
// shipped it: every cm360 call site consumed the bare key "cm360" against the
// pattern `cm360:*` (so cm360 was never limited, while its server card —
// which reads the LIVE limiter's configured patterns — still published
// 5/min), and sa360's v2 reporting and conversion-upload writes consumed
// `sa360v2:…` against `sa360:*`. Nothing failed, the card looked right, and a
// mocked limiter in every unit test accepted any key.
//
// WHAT IT DOES
//
// For every `packages/*-mcp/src/**/*.ts` file it finds `…limiter.consume(` /
// `…limiter?.consume(` calls and classifies the first argument:
//   - a string literal                 -> checked as-is
//   - a template literal               -> checked with every `${…}` replaced by
//                                         a sample value; its STATIC PREFIX
//                                         (text before the first `${`) must be
//                                         non-empty, so the platform prefix is
//                                         fixed in source, not supplied at
//                                         runtime
//   - a bare identifier                -> resolved to a `const NAME = "literal"`
//                                         declared somewhere in the same
//                                         package's src (msads' MSADS_READ_KEY)
//   - anything else                    -> UNRESOLVED, which the ratchet fails
//
// Configured patterns come from `createPlatformRateLimiter("<name>", …)` (->
// `<name>:*`) and literal `…limiter.configure("<pattern>", …)` calls in the same
// package. Matching is done by the real shared `RateLimiter` in the test, not by
// a copy of its glob logic here.
//
// LIMITS (read before trusting a green run)
//
//   - Regex-based, not an AST. Commented-out consume calls are scanned too
//     (fails safe: a stale comment can only produce a false failure).
//   - Keys built by a helper function, passed in as a parameter, or stored in
//     anything but a top-level string-literal const are UNRESOLVED and fail
//     the ratchet rather than being skipped. The fix is to pass a literal or
//     template literal at the call site; the ratchet deliberately does not
//     follow calls or imports across packages.
//   - A template's `${…}` parts are sampled, not evaluated. The ratchet proves
//     the static prefix routes the key to a configured pattern; it cannot prove
//     what a runtime value does after that (e.g. an id containing `*`).
//   - A limiter constructed any other way (not `createPlatformRateLimiter` and
//     not a literal `.configure`) is invisible here; its package then has no
//     configured pattern and every consume in it fails the ratchet.
//   - Only the key is checked. Whether the configured LIMIT is right for the
//     platform's quota is a platform fact this cannot see.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Value substituted for each `${…}` in a template key. */
export const TEMPLATE_SAMPLE = "x";

const CONSUME_CALL = /\b\w*[Ll]imiter\??\.consume\(/g;
const PLATFORM_FACTORY = /createPlatformRateLimiter\(\s*(["'`])([^"'`$\\]+)\1/g;
const LITERAL_CONFIGURE = /\b\w*[Ll]imiter\??\.configure\(\s*(["'])([^"'\\]+)\1/g;

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Parse the expression starting at `start` (the first char after `consume(`)
 * far enough to classify it. Returns `{ kind, ... }`.
 */
export function parseKeyArgument(source, start) {
  let i = start;
  while (i < source.length && /\s/.test(source[i])) i++;
  const ch = source[i];

  if (ch === '"' || ch === "'") {
    let j = i + 1;
    let value = "";
    while (j < source.length && source[j] !== ch) {
      if (source[j] === "\\") {
        value += source[j + 1];
        j += 2;
        continue;
      }
      if (source[j] === "\n") return { kind: "unresolved", text: source.slice(i, j) };
      value += source[j++];
    }
    return finishArgument(source, j + 1, { kind: "literal", key: value });
  }

  if (ch === "`") {
    let j = i + 1;
    let sample = "";
    let staticPrefix = null;
    while (j < source.length && source[j] !== "`") {
      if (source[j] === "\\") {
        sample += source[j + 1];
        j += 2;
        continue;
      }
      if (source[j] === "$" && source[j + 1] === "{") {
        if (staticPrefix === null) staticPrefix = sample;
        // Skip the substitution, honouring nested braces.
        let depth = 1;
        j += 2;
        while (j < source.length && depth > 0) {
          if (source[j] === "{") depth++;
          else if (source[j] === "}") depth--;
          j++;
        }
        sample += TEMPLATE_SAMPLE;
        continue;
      }
      sample += source[j++];
    }
    const template = source.slice(i, j + 1);
    return finishArgument(source, j + 1, {
      kind: "template",
      key: sample,
      staticPrefix: staticPrefix ?? sample,
      text: template,
    });
  }

  const ident = /^[A-Za-z_$][\w$]*/.exec(source.slice(i));
  if (ident) {
    return finishArgument(source, i + ident[0].length, { kind: "identifier", name: ident[0] });
  }

  return { kind: "unresolved", text: source.slice(i, i + 40) };
}

/** The argument must end at `,` or `)` — `a + b`, `fn(x)` etc. are unresolved. */
function finishArgument(source, end, parsed) {
  let k = end;
  while (k < source.length && /\s/.test(source[k])) k++;
  if (source[k] === "," || source[k] === ")") return parsed;
  return { kind: "unresolved", text: source.slice(end - 1, k + 20) };
}

/** Every `…limiter.consume(` call in one source file. */
export function extractConsumeCalls(source, file = "<source>") {
  const calls = [];
  for (const match of source.matchAll(CONSUME_CALL)) {
    const argStart = match.index + match[0].length;
    calls.push({ file, line: lineOf(source, match.index), ...parseKeyArgument(source, argStart) });
  }
  return calls;
}

/** Patterns configured by literal factory / configure calls in one source. */
export function extractConfiguredPatterns(source) {
  const patterns = [];
  for (const m of source.matchAll(PLATFORM_FACTORY)) patterns.push(`${m[2]}:*`);
  for (const m of source.matchAll(LITERAL_CONFIGURE)) patterns.push(m[2]);
  return patterns;
}

/** `const NAME = "literal"` (optionally exported / typed) declarations. */
export function extractStringConsts(source) {
  const consts = new Map();
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(["'])([^"'\\\n]*)\2\s*[;\n]/g;
  for (const m of source.matchAll(re)) consts.set(m[1], m[3]);
  const tpl = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*`([^`$\\]*)`\s*[;\n]/g;
  for (const m of source.matchAll(tpl)) consts.set(m[1], m[2]);
  return consts;
}

function walkTs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTs(full, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/**
 * Scan one package's src. Identifier keys are resolved against string consts
 * declared anywhere in the same package.
 *
 * @returns {{ pkg: string, patterns: string[], calls: Array<object> }}
 */
export function scanPackage(root, pkg) {
  const srcDir = join(root, "packages", pkg, "src");
  const files = walkTs(srcDir);
  const patterns = [];
  const consts = new Map();
  const rawCalls = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const rel = relative(root, file);
    patterns.push(...extractConfiguredPatterns(source));
    for (const [k, v] of extractStringConsts(source)) consts.set(k, v);
    rawCalls.push(...extractConsumeCalls(source, rel));
  }

  const calls = rawCalls.map((call) => {
    if (call.kind !== "identifier") return call;
    if (!consts.has(call.name)) return { ...call, kind: "unresolved", text: call.name };
    return { ...call, kind: "const", key: consts.get(call.name) };
  });

  return { pkg, patterns: [...new Set(patterns)], calls };
}

/** Human-readable location + key for failure messages. */
export function describeCall(call) {
  const shown =
    call.kind === "template"
      ? call.text
      : call.kind === "const"
        ? `${call.name} (= "${call.key}")`
        : call.kind === "unresolved"
          ? call.text
          : JSON.stringify(call.key);
  return `${call.file}:${call.line} consume(${shown})`;
}
