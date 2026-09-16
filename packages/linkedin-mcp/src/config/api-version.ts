// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The LinkedIn Marketing API version this server pins, and the rules that keep
 * the pin from rotting.
 *
 * LinkedIn ships a versioned release every month, identified by a `YYYYMM`
 * moniker sent as the `LinkedIn-Version` header, and supports each release for
 * a minimum of one year. A request carrying a sunset version does not get a
 * deprecation warning — it gets an error response. So an un-refreshed pin is not
 * a latent risk, it is a dead server.
 *
 * That is not hypothetical here: this server pinned `202409` (September 2024)
 * until 2026-09, roughly a year past its sunset, and nothing detected it because
 * no test asserted anything about the value and nothing exercises the live API
 * (#206). The staleness check below exists so the next lapse fails CI instead.
 */

/**
 * Pinned `LinkedIn-Version`. Single source of truth — the config default reads
 * this, and every adapter takes the version as a required constructor argument
 * so nothing can silently fall back to a stale literal.
 */
export const LINKEDIN_API_VERSION = "202608";

/**
 * When a human last confirmed {@link LINKEDIN_API_VERSION} against LinkedIn's
 * published list of supported versions.
 *
 * This is the date of the CHECK, not the date the code was written. Backdating
 * it to the pin's release month reproduces exactly the false confidence this
 * guard removes.
 *
 * Source: https://learn.microsoft.com/en-us/linkedin/marketing/versioning
 */
export const LINKEDIN_API_VERSION_VERIFIED_AT = "2026-09-16";

/**
 * LinkedIn's documented minimum support window, in months. Releases are
 * "supported and stable for a minimum of one year before sunset" — a floor, not
 * a promise, so treating it as the deadline is the conservative reading.
 */
export const LINKEDIN_VERSION_SUPPORT_MONTHS = 12;

/**
 * Re-check this many months before the window closes, so the migration is
 * planned rather than discovered by an outage.
 */
export const LINKEDIN_VERSION_REFRESH_LEAD_MONTHS = 3;

/** A `YYYYMM` moniker, 2015-01 onward — LinkedIn has never issued anything older. */
const VERSION_PATTERN = /^20(?:1[5-9]|[2-9]\d)(?:0[1-9]|1[0-2])$/;

/** True when `value` is a syntactically valid `LinkedIn-Version` moniker. */
export function isValidLinkedInApiVersion(value: string): boolean {
  return VERSION_PATTERN.test(value);
}

/** Whole months from a `YYYYMM` moniker to `now`. Negative for a future version. */
export function monthsSinceVersion(version: string, now: Date = new Date()): number {
  if (!isValidLinkedInApiVersion(version)) {
    throw new Error(`Not a LinkedIn-Version moniker (expected YYYYMM): ${version}`);
  }
  const year = Number(version.slice(0, 4));
  const month = Number(version.slice(4, 6));
  // getUTCMonth() is 0-indexed; the moniker's month is 1-indexed.
  return (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
}

export type LinkedInVersionStatus = "current" | "refresh-due" | "sunset";

/**
 * Where `version` sits relative to LinkedIn's support window.
 *
 * - `current` — comfortably inside the window.
 * - `refresh-due` — inside the window, but close enough that the migration
 *   should be scheduled now.
 * - `sunset` — past the documented minimum. Requests are expected to ERROR,
 *   not warn.
 */
export function classifyLinkedInApiVersion(
  version: string,
  now: Date = new Date()
): LinkedInVersionStatus {
  const age = monthsSinceVersion(version, now);
  if (age >= LINKEDIN_VERSION_SUPPORT_MONTHS) return "sunset";
  if (age >= LINKEDIN_VERSION_SUPPORT_MONTHS - LINKEDIN_VERSION_REFRESH_LEAD_MONTHS) {
    return "refresh-due";
  }
  return "current";
}

/**
 * Operator-facing message for a version that needs attention, or `undefined`
 * when it is current. Kept separate from logging so it can be asserted directly.
 */
export function describeLinkedInApiVersionStatus(
  version: string,
  now: Date = new Date()
): string | undefined {
  const status = classifyLinkedInApiVersion(version, now);
  if (status === "current") return undefined;

  const age = monthsSinceVersion(version, now);
  if (status === "sunset") {
    return (
      `LinkedIn-Version ${version} is ${age} months old and past LinkedIn's ` +
      `${LINKEDIN_VERSION_SUPPORT_MONTHS}-month minimum support window. LinkedIn returns an ` +
      `ERROR for a sunset version header, so every LinkedIn API call is expected to fail. ` +
      `Set LINKEDIN_API_VERSION to a supported version and update the pin in ` +
      `src/config/api-version.ts.`
    );
  }
  return (
    `LinkedIn-Version ${version} is ${age} months old and approaches the end of LinkedIn's ` +
    `${LINKEDIN_VERSION_SUPPORT_MONTHS}-month support window. Plan the migration now — a sunset ` +
    `version header returns an error, not a warning.`
  );
}
