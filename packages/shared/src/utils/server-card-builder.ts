// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Builds the {@link ServerCardExtras} block for a transport from registry.json
 * data. Registry is the single source of truth for title, runtime description,
 * platform, supported auth modes, and documentation URL — transports normally
 * pass nothing beyond the package name.
 */

import type { ServerCardExtras } from "./mcp-http-transport-factory.js";
import { REGISTRY_DATA, type RegistryServerEntry } from "./registry-data.generated.js";

export interface ServerCardOverrides {
  /** Override the registry-derived runtime description. Rarely needed. */
  description?: string;
  /** Override the registry-derived platform name. Rarely needed. */
  platform?: string;
  /** Override the registry-derived documentation URL. Rarely needed. */
  documentationUrl?: string;
  /** Override the registry-derived title. Rarely needed. */
  title?: string;
  vendor?: string;
  capabilities?: ServerCardExtras["capabilities"];
}

export function getRegistryEntry(packageName: string): RegistryServerEntry {
  const entry = REGISTRY_DATA.servers.find((s) => s.package === packageName);
  if (!entry) {
    throw new Error(
      `Registry lookup failed: package "${packageName}" not found in registry.json. ` +
        `Add it to registry.json or run \`pnpm sync:registry-data\`.`
    );
  }
  return entry;
}

export function buildServerCardExtras(
  packageName: string,
  overrides: ServerCardOverrides = {}
): ServerCardExtras {
  const entry = getRegistryEntry(packageName);
  return {
    title: overrides.title ?? entry.title,
    description: overrides.description ?? entry.runtime_description,
    platform: overrides.platform ?? entry.platform,
    supportedAuthModes: [...entry.auth.modes],
    documentationUrl: overrides.documentationUrl ?? entry.documentation_url,
    ...(overrides.vendor ? { vendor: overrides.vendor } : {}),
    ...(overrides.capabilities ? { capabilities: overrides.capabilities } : {}),
  };
}
