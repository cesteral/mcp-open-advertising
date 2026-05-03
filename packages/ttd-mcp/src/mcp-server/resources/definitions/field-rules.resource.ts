// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `ttd-field-rules://{entityType}` — machine-readable validation rules per
 * TTD entity type, exposed for LLM clients so they can discover required
 * fields and enum suggestions before calling create/update tools.
 *
 * Backed by the same tables `ttd_validate_entity` consumes
 * (`resources/utils/field-rules.ts`).
 */

import type { TemplatedResourceDefinition } from "@cesteral/shared";
import {
  getEntityTypeEnum,
  getSupportedEntityTypes,
  type TtdEntityType,
} from "../../tools/utils/entity-mapping.js";
import { getFieldRulesForEntity } from "../utils/field-rules.js";

export const fieldRulesResource: TemplatedResourceDefinition = {
  uriTemplate: "ttd-field-rules://{entityType}",
  name: "TTD Field Rules",
  description:
    "Required-field rules, enum suggestions, and read-only field list for a TTD entity type. " +
    `Valid {entityType}: ${getEntityTypeEnum().join(", ")}.`,
  mimeType: "application/json",
  resolveContent: (_uri, variables) => {
    const raw = variables.entityType;
    const entityType = (Array.isArray(raw) ? raw[0] : raw) as TtdEntityType | undefined;
    if (!entityType) {
      throw new Error("ttd-field-rules: missing {entityType} in URI");
    }
    if (!getSupportedEntityTypes().includes(entityType)) {
      throw new Error(
        `ttd-field-rules: unknown entityType "${entityType}". ` +
          `Supported: ${getSupportedEntityTypes().join(", ")}.`
      );
    }
    return JSON.stringify(getFieldRulesForEntity(entityType), null, 2);
  },
  list: async () =>
    getSupportedEntityTypes().map((t) => ({
      uri: `ttd-field-rules://${t}`,
      name: `TTD field rules — ${t}`,
      description: `Required + enum + read-only fields for TTD ${t}`,
      mimeType: "application/json",
    })),
};
