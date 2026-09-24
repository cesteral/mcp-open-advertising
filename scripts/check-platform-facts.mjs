#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Platform-facts ledger check (#202).
//
// This repo is full of load-bearing claims about external platforms — sixteen
// hardcoded API base URLs, a date-versioned LinkedIn header, and a set of
// behavioural constraints in CLAUDE.md that shape entire packages. Until now not
// one of them recorded when it was last verified or when it should be
// re-checked, and we already know what that costs:
//
//   - linkedin-mcp pinned `LinkedIn-Version: 202409` for roughly a year past
//     sunset. Every call errored. Nothing detected it (#206/#209).
//   - Google's v4 Discovery rev 20260608 removed campaign + insertion-order
//     assigned targeting and broke all CI (PR #79).
//
// One was caught loudly, the other was silent for a year. The difference was
// luck about which fact happened to be fetched at build time, not design.
//
// TWO MODES, BECAUSE THEY HAVE DIFFERENT FAILURE POLITICS
//
//   --structure (default)  Hermetic. Validates the ledger's shape and asserts
//                          every codeRef still exists AND still contains the
//                          value the ledger claims for it. Safe on the PR path:
//                          it can only fail because of something in this commit.
//
//   --freshness            Time-dependent. Reports facts whose refreshDue or
//                          verifyBy has passed, and facts whose deadline is
//                          parked further out than their class cadence allows.
//                          Also the fleet release gate (release.yml).
//
//   --due-within <days>    With --freshness: also report a fact due within
//                          <days>, so the weekly job warns BEFORE a deadline
//                          starts failing releases. Not used by release.yml. NOT for the PR path — it would
//                          turn `main` red by the mere passage of time, handing
//                          an outside system (the calendar) a switch, which is
//                          the same reason check-terraform-drift.mjs runs on a
//                          schedule. Wired to .github/workflows/platform-facts.yml.
//
// THE STRUCTURE CHECK IS THE ONE WITH TEETH TODAY
//
// A ledger whose `value` has silently drifted from the code it points at is
// worse than no ledger: it describes a version we no longer send. Asserting
// codeRef containment is mechanical, hermetic, and catches exactly the edit
// that would otherwise desynchronise the two.
//
// Exit codes, matching check-terraform-drift.mjs so a scheduled failure is
// diagnosable without opening logs:
//   0 = OK
//   1 = a fact needs attention (stale, or the ledger disagrees with the code)
//   2 = could not check (ledger missing or unparseable)

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_PATH = join(ROOT, "platform-facts.json");

export const EXIT_OK = 0;
export const EXIT_ATTENTION = 1;
export const EXIT_CANNOT_CHECK = 2;

const VALID_STATUS = new Set(["unverified", "verified", "superseded"]);
const VALID_CLASS = new Set([
  "date-versioned-header",
  "versioned-base-url",
  "unversioned-base-url",
  "behavioral-constraint",
  "auth-requirement",
]);

/**
 * Refresh cadence per fact class, in days. A date-versioned header rolls on a
 * 1-year sunset, so it gets the tightest loop — that is the #206 failure mode.
 */
export const REFRESH_DAYS = {
  "date-versioned-header": 90,
  "versioned-base-url": 90,
  "unversioned-base-url": 180,
  "behavioral-constraint": 180,
  "auth-requirement": 180,
};

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Validate the ledger's shape.
 *
 * The rules that matter:
 *   - `verified` REQUIRES a `verifiedAt`. A verified status with no date is the
 *     false confidence this whole mechanism exists to remove.
 *   - `unverified` FORBIDS a `verifiedAt`, so the two cannot disagree.
 *   - every fact carries a `verifyBy` deadline, so "nobody has checked this" is
 *     a tracked decision with a clock rather than a permanent shrug.
 */
export function validateLedger(ledger) {
  const errors = [];
  if (ledger?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!Array.isArray(ledger?.facts)) {
    errors.push("facts must be an array");
    return errors;
  }

  const seen = new Set();
  for (const fact of ledger.facts) {
    const id = fact?.id ?? "(missing id)";
    if (!id || typeof id !== "string") errors.push(`${id}: id must be a non-empty string`);
    if (seen.has(id)) errors.push(`${id}: duplicate fact id`);
    seen.add(id);

    if (!VALID_CLASS.has(fact.class)) {
      errors.push(
        `${id}: class ${JSON.stringify(fact.class)} is not one of ${[...VALID_CLASS].join(", ")}`
      );
    }
    if (!VALID_STATUS.has(fact.status)) {
      errors.push(
        `${id}: status ${JSON.stringify(fact.status)} is not one of ${[...VALID_STATUS].join(", ")}`
      );
    }
    if (typeof fact.claim !== "string" || fact.claim.length < 20) {
      errors.push(
        `${id}: claim must state the fact in full, so it can be re-checked without guessing`
      );
    }
    if (typeof fact.loadBearing !== "boolean") {
      errors.push(`${id}: loadBearing must be a boolean`);
    }
    if (!Array.isArray(fact.codeRefs) || fact.codeRefs.length === 0) {
      errors.push(`${id}: codeRefs must name at least one place the claim is relied on`);
    }

    if (fact.status === "verified" && !fact.verifiedAt) {
      errors.push(
        `${id}: status "verified" requires verifiedAt — the date of the CHECK, never backdated ` +
          `to when the code was written.`
      );
    }
    if (fact.status === "unverified" && fact.verifiedAt) {
      errors.push(`${id}: status "unverified" must not carry a verifiedAt`);
    }
    if (!fact.verifyBy && !fact.verifiedAt) {
      errors.push(`${id}: an unverified fact must carry a verifyBy deadline`);
    }
    for (const key of ["verifiedAt", "verifyBy", "refreshDue"]) {
      if (fact[key] != null && !/^\d{4}-\d{2}-\d{2}$/.test(fact[key])) {
        errors.push(`${id}: ${key} must be YYYY-MM-DD, got ${JSON.stringify(fact[key])}`);
      }
    }
  }
  return errors;
}

/**
 * Assert every codeRef exists and still contains the value the ledger claims.
 *
 * This is what stops the ledger describing a version the code stopped sending.
 * A `value` of null (behavioural constraints have no single literal) only has
 * its file checked.
 */
export function checkCodeRefs(ledger, root = ROOT) {
  const errors = [];
  for (const fact of ledger.facts) {
    for (const ref of fact.codeRefs ?? []) {
      const [relPath, lineNo] = ref.split(":");
      const abs = join(root, relPath);
      if (!existsSync(abs)) {
        errors.push(`${fact.id}: codeRef ${ref} — file does not exist`);
        continue;
      }
      const lines = readFileSync(abs, "utf-8").split("\n");
      if (lineNo !== undefined) {
        const idx = Number(lineNo) - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= lines.length) {
          errors.push(
            `${fact.id}: codeRef ${ref} — line ${lineNo} is out of range (${lines.length} lines)`
          );
          continue;
        }
        if (fact.value != null && !lines[idx].includes(fact.value)) {
          errors.push(
            `${fact.id}: codeRef ${ref} no longer contains the declared value ${JSON.stringify(fact.value)}.\n` +
              `      line reads: ${lines[idx].trim()}\n` +
              `      Either the code moved (update codeRefs) or the value changed (update the ledger AND re-verify).`
          );
        }
      } else if (fact.value != null && !readFileSync(abs, "utf-8").includes(fact.value)) {
        errors.push(`${fact.id}: codeRef ${ref} no longer contains ${JSON.stringify(fact.value)}`);
      }
    }
  }
  return errors;
}

/**
 * Classify each fact's freshness.
 *
 * An expired fact is NOT current. Being unable to check it does not make it
 * fresh — an unreachable vendor doc produces `unverified`, which is reported,
 * never silently treated as a pass.
 *
 * Two further classes, both about the DEADLINE rather than the fact:
 *
 *   parked   The deadline sits further out than the class cadence
 *            (REFRESH_DAYS) allows. Without this, the escape hatch for a
 *            blocked release — move `verifyBy` in a reviewed commit — accepts
 *            `2099-01-01` as readily as a real 90-day extension, and the gate
 *            becomes a rubber stamp. A legitimate extension is at most one
 *            cadence from the day it is made, so this only ever gets easier to
 *            satisfy as time passes and cannot turn anything red by itself.
 *   dueSoon  The deadline is within `dueWithinDays` (0 = off). Lets the weekly
 *            job warn before a deadline starts failing releases, instead of
 *            opening its first issue the same week they break.
 */
export function assessFreshness(ledger, now = new Date(), { dueWithinDays = 0 } = {}) {
  const stale = [];
  const overdue = [];
  const parked = [];
  const dueSoon = [];
  for (const fact of ledger.facts) {
    if (fact.status === "superseded") continue;
    const cadence = REFRESH_DAYS[fact.class] ?? 180;

    let due;
    if (fact.status === "unverified") {
      due = fact.verifyBy;
      if (due && daysBetween(new Date(due), now) > 0) {
        overdue.push({ fact, days: daysBetween(new Date(due), now) });
        continue;
      }
    } else {
      due =
        fact.refreshDue ??
        (() => {
          const d = new Date(fact.verifiedAt);
          d.setUTCDate(d.getUTCDate() + cadence);
          return d.toISOString().slice(0, 10);
        })();
      const overdueDays = daysBetween(new Date(due), now);
      if (overdueDays > 0) {
        stale.push({ fact, days: overdueDays, due });
        continue;
      }
    }
    if (!due) continue;

    const daysLeft = daysBetween(now, new Date(due));
    if (daysLeft > cadence) parked.push({ fact, due, daysLeft, cadence });
    else if (dueWithinDays > 0 && daysLeft <= dueWithinDays) dueSoon.push({ fact, due, daysLeft });
  }
  return { stale, overdue, parked, dueSoon };
}

function parseDueWithin(argv) {
  const i = argv.indexOf("--due-within");
  if (i === -1) return 0;
  const days = Number(argv[i + 1]);
  if (!Number.isInteger(days) || days < 1) {
    console.error(`check:platform-facts: --due-within needs a positive whole number of days`);
    process.exit(EXIT_CANNOT_CHECK);
  }
  return days;
}

function loadLedger() {
  if (!existsSync(LEDGER_PATH)) {
    console.error(`check:platform-facts: ${LEDGER_PATH} not found`);
    process.exit(EXIT_CANNOT_CHECK);
  }
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, "utf-8"));
  } catch (error) {
    console.error(`check:platform-facts: ledger is not valid JSON: ${error.message}`);
    process.exit(EXIT_CANNOT_CHECK);
  }
}

function main() {
  const freshness = process.argv.includes("--freshness");
  const ledger = loadLedger();

  const structural = [...validateLedger(ledger), ...checkCodeRefs(ledger)];
  if (structural.length > 0) {
    console.error("check:platform-facts FAILED — ledger does not match the code it describes:\n");
    for (const e of structural) console.error(`  - ${e}`);
    process.exit(EXIT_ATTENTION);
  }

  const counts = ledger.facts.reduce((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .sort()
    .map(([s, n]) => `${n} ${s}`)
    .join(", ");

  if (!freshness) {
    console.log(
      `check:platform-facts OK — ${ledger.facts.length} facts, every codeRef present and ` +
        `consistent with the declared value (${summary}).`
    );
    process.exit(EXIT_OK);
  }

  const { stale, overdue, parked, dueSoon } = assessFreshness(ledger, new Date(), {
    dueWithinDays: parseDueWithin(process.argv),
  });
  const blocking = [...stale, ...overdue, ...parked, ...dueSoon].filter((r) => r.fact.loadBearing);

  for (const { fact, days, due } of stale) {
    console.error(
      `STALE${fact.loadBearing ? " (load-bearing)" : ""}: ${fact.id} — verified ${fact.verifiedAt}, ` +
        `due ${due}, ${days} days overdue.\n    ${fact.claim}\n    Source: ${fact.sourceUrl ?? "(none)"}`
    );
  }
  for (const { fact, days } of overdue) {
    console.error(
      `NEVER VERIFIED${fact.loadBearing ? " (load-bearing)" : ""}: ${fact.id} — deadline ` +
        `${fact.verifyBy} passed ${days} days ago.\n    ${fact.claim}\n    Source: ${fact.sourceUrl ?? "(none)"}`
    );
  }

  for (const { fact, due, daysLeft, cadence } of parked) {
    console.error(
      `DEADLINE PARKED${fact.loadBearing ? " (load-bearing)" : ""}: ${fact.id} — due ${due}, ` +
        `${daysLeft} days out, but its class (${fact.class}) allows at most ${cadence}.\n` +
        `    A deadline may be moved to buy time, but by no more than one cadence from today.`
    );
  }
  for (const { fact, due, daysLeft } of dueSoon) {
    console.error(
      `DUE SOON${fact.loadBearing ? " (load-bearing)" : ""}: ${fact.id} — due ${due}, ` +
        `${daysLeft} days from now.\n    ${fact.claim}\n    Source: ${fact.sourceUrl ?? "(none)"}`
    );
  }

  if (blocking.length > 0) {
    console.error(
      `\ncheck:platform-facts: ${blocking.length} load-bearing fact(s) need attention. ` +
        `Re-verify against the source, or explicitly demote the fact and record what changed. ` +
        `Being unable to check does not make a fact fresh.`
    );
    process.exit(EXIT_ATTENTION);
  }

  console.log(`check:platform-facts OK — no load-bearing fact is stale (${summary}).`);
  process.exit(EXIT_OK);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
