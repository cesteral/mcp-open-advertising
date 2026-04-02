// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import {
  AMAZON_DSP_CANONICAL_ENTITY_TYPES,
  AMAZON_DSP_ENTITY_CONTRACT,
  AMAZON_DSP_PUBLIC_ENTITY_TYPES,
  getAmazonDspEntityContract,
  normalizeAmazonDspEntityType,
  type AmazonDspCanonicalEntityType,
  type AmazonDspPublicEntityType,
} from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

/**
 * Amazon DSP Entity Mapping
 *
 * MCP keeps backward-compatible support for the original `order` / `lineItem`
 * names while also accepting the Amazon-style `campaign` / `adGroup` aliases.
 */

export type AmazonDspEntityType = AmazonDspPublicEntityType;
export type CanonicalAmazonDspEntityType = AmazonDspCanonicalEntityType;

export interface AmazonDspEntityConfig {
  /** API path for list (GET with query params) */
  listPath: string;
  /** API path for get single entity */
  getPath: string;
  /** API path for create (POST) */
  createPath: string;
  /** API path for update (PUT) */
  updatePath: string;
  /** Primary ID field name in the response */
  idField: string;
  /** Response array key (e.g., "orders") */
  responseKey: string;
  /** Query param name for parent filter on list (e.g., "advertiserId", "orderId") */
  listFilterParam: string;
  /** Display name */
  displayName: string;
  /** Default fields to return */
  defaultFields: string[];
}

const ENTITY_CONFIGS: Record<AmazonDspCanonicalEntityType, AmazonDspEntityConfig> =
  Object.fromEntries(
    AMAZON_DSP_CANONICAL_ENTITY_TYPES.map((entityType) => {
      const contract = AMAZON_DSP_ENTITY_CONTRACT[entityType];
      return [
        entityType,
        {
          listPath: contract.listPath,
          getPath: contract.getPath,
          createPath: contract.createPath,
          updatePath: contract.updatePath,
          idField: contract.idField,
          responseKey: contract.responseKey,
          listFilterParam: contract.listFilterParam,
          displayName: contract.displayName,
          defaultFields: [contract.idField, contract.listFilterParam, "name", "state"],
        } satisfies AmazonDspEntityConfig,
      ];
    })
  ) as Record<AmazonDspCanonicalEntityType, AmazonDspEntityConfig>;

export function getEntityConfig(entityType: AmazonDspEntityType): AmazonDspEntityConfig {
  return ENTITY_CONFIGS[normalizeAmazonDspEntityType(entityType)];
}

export function getSupportedEntityTypes(): AmazonDspEntityType[] {
  return [...AMAZON_DSP_PUBLIC_ENTITY_TYPES];
}

export function getCanonicalEntityTypes(): AmazonDspCanonicalEntityType[] {
  return [...AMAZON_DSP_CANONICAL_ENTITY_TYPES];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  return getSupportedEntityTypes() as [string, ...string[]];
}

export function getCanonicalEntityType(entityType: AmazonDspEntityType): AmazonDspCanonicalEntityType {
  return normalizeAmazonDspEntityType(entityType);
}

export function getEntityContract(entityType: AmazonDspEntityType) {
  return getAmazonDspEntityContract(entityType);
}

/**
 * Interpolate path template placeholders.
 */
export function interpolatePath(path: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (acc, [key, val]) => acc.replace(`{${key}}`, val),
    path
  );
}
