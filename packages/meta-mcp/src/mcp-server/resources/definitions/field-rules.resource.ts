// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `meta-field-rules://{entityType}` — machine-readable validation rules per
 * Meta Ads entity type, exposed for LLM clients so they can discover required
 * fields and enum suggestions before calling create/update tools.
 *
 * Backed by the same tables `meta_validate_entity` consumes
 * (`resources/utils/field-rules.ts`).
 */

import type { TemplatedResourceDefinition } from "@cesteral/shared";
import {
  getEntityTypeEnum,
  getSupportedEntityTypes,
  type MetaEntityType,
} from "../../tools/utils/entity-mapping.js";
import { getFieldRulesForEntity } from "../utils/field-rules.js";

export const fieldRulesResource: TemplatedResourceDefinition = {
  uriTemplate: "meta-field-rules://{entityType}",
  name: "Meta Ads Field Rules",
  description:
    "Required-field rules, enum suggestions, and read-only field list for a Meta Ads entity type. " +
    `Valid {entityType}: ${getEntityTypeEnum().join(", ")}.`,
  mimeType: "application/json",
  resolveContent: (_uri, variables) => {
    const raw = variables.entityType;
    const entityType = (Array.isArray(raw) ? raw[0] : raw) as MetaEntityType | undefined;
    if (!entityType) {
      throw new Error("meta-field-rules: missing {entityType} in URI");
    }
    if (!getSupportedEntityTypes().includes(entityType)) {
      throw new Error(
        `meta-field-rules: unknown entityType "${entityType}". ` +
          `Supported: ${getSupportedEntityTypes().join(", ")}.`
      );
    }
    return JSON.stringify(getFieldRulesForEntity(entityType), null, 2);
  },
  list: async () =>
    getSupportedEntityTypes().map((t) => ({
      uri: `meta-field-rules://${t}`,
      name: `Meta Ads field rules — ${t}`,
      description: `Required + enum + read-only fields for Meta ${t}`,
      mimeType: "application/json",
    })),
};
