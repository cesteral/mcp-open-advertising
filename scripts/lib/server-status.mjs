// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// A server's lifecycle status (registry `status`), separate from its type and
// its governance. An `experimental` server is built, tested and conformance-run
// in CI like any other, but never published or deployed: publish, Cloud Build,
// deploy.sh, smoke-test.sh and Terraform read only `deployableServers()`.
// `pnpm promote:server` makes it `stable`.
//
// Plain node, no dependencies: scripts/fleet.mjs imports it before
// `pnpm install` in Cloud Build.

export const SERVER_STATUSES = ["experimental", "stable"];

/** Whether the server is published and deployed. */
export function isDeployable(server) {
  return server.status === "stable";
}

/** The servers publish and deploy cover, in registry order. */
export function deployableServers(registry) {
  return registry.servers.filter(isDeployable);
}

/** A line per server whose `status` is missing or unknown. */
export function checkStatuses(registry) {
  return registry.servers
    .filter((s) => !SERVER_STATUSES.includes(s.status))
    .map(
      (s) =>
        `${s.package}: registry \`status\` must be one of ${SERVER_STATUSES.join(", ")} (got ${JSON.stringify(s.status)})`
    );
}
