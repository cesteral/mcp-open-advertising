// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Sandbox routing guard.
 *
 * `TTD_USE_SANDBOX=true` only changes the *defaults* for the REST and GraphQL
 * base URLs. An explicit `TTD_API_BASE_URL` / `TTD_GRAPHQL_URL` still wins, and
 * `.env.example` used to ship `TTD_API_BASE_URL` pinned to production — so a
 * copied env file plus `TTD_USE_SANDBOX=true` sent GraphQL to the sandbox and
 * every REST write to production, where campaigns spend real money.
 *
 * The guard refuses that combination at config parse, so the process never
 * starts with a sandbox flag that is lying about where writes go.
 */

/** TTD's Partner Sandbox host (Foundations §5). */
export const TTD_SANDBOX_HOST = "ext-api.sb.thetradedesk.com";

/**
 * True when `url` names a TTD host that is not a sandbox host — i.e. a
 * `thetradedesk.com` host without an `sb` label. Non-TTD hosts (a local mock,
 * a test proxy) are not production and return false.
 */
export function isTtdProductionUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname !== "thetradedesk.com" && !hostname.endsWith(".thetradedesk.com")) {
    return false;
  }
  return !hostname.split(".").includes("sb");
}

/**
 * The configured endpoints that point at production while sandbox mode is on.
 * Empty when sandbox mode is off or every endpoint is a sandbox/non-TTD host.
 */
export function findProductionEndpointsUnderSandbox(config: {
  ttdUseSandbox: boolean;
  ttdApiBaseUrl: string;
  ttdGraphqlUrl: string;
}): Array<{ setting: "TTD_API_BASE_URL" | "TTD_GRAPHQL_URL"; url: string }> {
  if (!config.ttdUseSandbox) return [];
  const offending: Array<{ setting: "TTD_API_BASE_URL" | "TTD_GRAPHQL_URL"; url: string }> = [];
  if (isTtdProductionUrl(config.ttdApiBaseUrl)) {
    offending.push({ setting: "TTD_API_BASE_URL", url: config.ttdApiBaseUrl });
  }
  if (isTtdProductionUrl(config.ttdGraphqlUrl)) {
    offending.push({ setting: "TTD_GRAPHQL_URL", url: config.ttdGraphqlUrl });
  }
  return offending;
}
