// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `msads-field-rules://{entityType}` — machine-readable validation rules per
 * Microsoft Ads entity type, exposed for LLM clients so they can discover
 * required enum values before calling create/update tools.
 *
 * Backed by the same tables `msads_validate_entity` consumes
 * (`resources/utils/field-rules.ts`).
 */

import type { TemplatedResourceDefinition } from "@cesteral/shared";
import {
  getEntityTypeEnum,
  getSupportedEntityTypes,
  type MsAdsEntityType,
} from "../../tools/utils/entity-mapping.js";
import { getFieldRulesForEntity } from "../utils/field-rules.js";

export const fieldRulesResource: TemplatedResourceDefinition = {
  uriTemplate: "msads-field-rules://{entityType}",
  name: "Microsoft Ads Field Rules",
  description:
    "Enum field rules per Microsoft Ads entity type. " +
    `Valid {entityType}: ${getEntityTypeEnum().join(", ")}.`,
  mimeType: "application/json",
  resolveContent: (_uri, variables) => {
    const raw = variables.entityType;
    const entityType = (Array.isArray(raw) ? raw[0] : raw) as MsAdsEntityType | undefined;
    if (!entityType) {
      throw new Error("msads-field-rules: missing {entityType} in URI");
    }
    if (!getSupportedEntityTypes().includes(entityType)) {
      throw new Error(
        `msads-field-rules: unknown entityType "${entityType}". ` +
          `Supported: ${getSupportedEntityTypes().join(", ")}.`
      );
    }
    return JSON.stringify(getFieldRulesForEntity(entityType), null, 2);
  },
  list: async () =>
    getSupportedEntityTypes().map((t) => ({
      uri: `msads-field-rules://${t}`,
      name: `Microsoft Ads field rules — ${t}`,
      description: `Enum field rules for Microsoft Ads ${t}`,
      mimeType: "application/json",
    })),
};
