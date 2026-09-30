// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";

export type CM360EntityType =
  | "campaign"
  | "placement"
  | "ad"
  | "creative"
  | "site"
  | "advertiser"
  | "floodlightActivity"
  | "floodlightConfiguration";

export interface CM360EntityConfig {
  apiCollection: string;
  idField: string;
  supportsDelete: boolean;
  /**
   * `false` when dfareporting v5 has no `{collection}.insert` method, so a POST
   * to the collection cannot create anything. Omitted = insert exists.
   */
  supportsCreate?: false;
}

const ENTITY_CONFIGS: Record<CM360EntityType, CM360EntityConfig> = {
  campaign: {
    apiCollection: "campaigns",
    idField: "id",
    supportsDelete: false,
  },
  placement: {
    apiCollection: "placements",
    idField: "id",
    supportsDelete: false,
  },
  ad: {
    apiCollection: "ads",
    idField: "id",
    supportsDelete: false,
  },
  creative: {
    apiCollection: "creatives",
    idField: "id",
    supportsDelete: false,
  },
  site: {
    apiCollection: "sites",
    idField: "id",
    supportsDelete: false,
  },
  advertiser: {
    apiCollection: "advertisers",
    idField: "id",
    supportsDelete: false,
  },
  floodlightActivity: {
    apiCollection: "floodlightActivities",
    idField: "id",
    supportsDelete: true,
  },
  floodlightConfiguration: {
    apiCollection: "floodlightConfigurations",
    idField: "id",
    supportsDelete: false,
    // v5 Discovery (rev 20260721) `resources.floodlightConfigurations.methods`
    // is { get, list, patch, update } — there is no `insert`.
    supportsCreate: false,
  },
};

/** Whether dfareporting v5 exposes an `insert` for this entity type's collection. */
export function supportsCreate(entityType: string): boolean {
  const config = ENTITY_CONFIGS[entityType as CM360EntityType];
  return Boolean(config) && config.supportsCreate !== false;
}

export function getEntityConfig(entityType: CM360EntityType): CM360EntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new McpError(JsonRpcErrorCode.InvalidParams, `Unknown CM360 entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): CM360EntityType[] {
  return Object.keys(ENTITY_CONFIGS) as CM360EntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

export function getDeletableEntityTypes(): CM360EntityType[] {
  return (Object.entries(ENTITY_CONFIGS) as [CM360EntityType, CM360EntityConfig][])
    .filter(([, config]) => config.supportsDelete)
    .map(([type]) => type);
}

export function getDeletableEntityTypeEnum(): [string, ...string[]] {
  const types = getDeletableEntityTypes();
  return types as [string, ...string[]];
}
