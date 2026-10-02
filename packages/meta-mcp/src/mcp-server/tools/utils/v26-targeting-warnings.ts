// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Text-only warnings for the three Marketing API v26.0 changes that
 * third-party sources report apply to every API version from 2026-10-27
 * (#229, platform-facts `meta.v26_changes_apply_to_all_versions`):
 *
 * 1. `targeting.instagram_positions` containing `"explore"` errors.
 * 2. `targeting.messenger_positions` containing `"story"` is silently dropped.
 * 3. An ad set in a Housing, Employment or Financial (credit) special ad
 *    category must set `targeting.targeting_automation.advantage_audience`
 *    explicitly.
 *
 * None of this is confirmed by Meta's published specs, so the decision (#229)
 * is to WARN, never refuse: the targeting is still sent unchanged.
 *
 * The warnings are TEXT ONLY. They never enter a structured result: not
 * `validationErrors` (a governance consumer may treat any entry there as
 * blocking), and not a new output field (that would move the tool's
 * `definitionHash`). A tool's logic computes them, because only the logic has
 * the reads (the duplicate's source ad set, the parent campaign's categories),
 * and hands them to its response formatter through {@link attachMetaV26Warnings}:
 * a WeakMap keyed by the result object, which the shared tool-handler factory
 * passes to the formatter unchanged (`tool.logic` → `tool.responseFormatter(result, input)`).
 * A WeakMap entry is invisible to `structuredContent`, output validation and
 * JSON, and is collected with the result.
 */

/** The platform-facts ledger entry these warnings rest on. */
export const META_V26_FACT_ID = "meta.v26_changes_apply_to_all_versions";

/** The date third-party sources give for the change (the fact's `value`). */
export const META_V26_EFFECTIVE_DATE = "2026-10-27";

export const META_V26_WARNING_CODES = {
  instagramExplore: "META_V26_INSTAGRAM_EXPLORE",
  messengerStory: "META_V26_MESSENGER_STORY",
  advantageAudience: "META_V26_ADVANTAGE_AUDIENCE",
  advantageAudienceUnchecked: "META_V26_ADVANTAGE_AUDIENCE_UNCHECKED",
} as const;

export type MetaV26WarningCode =
  (typeof META_V26_WARNING_CODES)[keyof typeof META_V26_WARNING_CODES];

export interface MetaV26Warning {
  code: MetaV26WarningCode;
  /** Dotted input path the warning attaches to (or `entityId` for a copy). */
  field: string;
  message: string;
}

/**
 * Special ad categories the reported advantage_audience requirement covers:
 * Housing, Employment, and Financial Products and Services (CREDIT is the
 * older name Meta's codegen enum still lists beside FINANCIAL_PRODUCTS_SERVICES).
 */
export const META_V26_HEC_F_CATEGORIES: readonly string[] = [
  "HOUSING",
  "EMPLOYMENT",
  "FINANCIAL_PRODUCTS_SERVICES",
  "CREDIT",
];

/**
 * What is known about the ad set's parent campaign's special ad categories:
 * - `string[]`: read from the campaign;
 * - `{ unknown: reason }`: not known (no read on this path, no campaign id,
 *   or the read failed). Check 3 then says only that it was not checked.
 */
export type SpecialAdCategoriesKnowledge = readonly string[] | { unknown: string };

/** Meta accepts `targeting` as an object or a JSON-encoded string. */
export function parseTargeting(raw: unknown): Record<string, unknown> | undefined {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function positionsInclude(targeting: Record<string, unknown>, key: string, value: string): boolean {
  const positions = targeting[key];
  return Array.isArray(positions) && positions.some((p) => p === value);
}

function hasExplicitAdvantageAudience(targeting: Record<string, unknown>): boolean {
  const automation = parseTargeting(targeting.targeting_automation);
  return automation !== undefined && automation.advantage_audience != null;
}

/** The parent campaign's `special_ad_categories`, read off a campaign record. */
export function specialAdCategoriesOf(campaign: unknown): readonly string[] | undefined {
  if (!campaign || typeof campaign !== "object") return undefined;
  const cats = (campaign as Record<string, unknown>).special_ad_categories;
  return Array.isArray(cats) ? cats.filter((c): c is string => typeof c === "string") : undefined;
}

/**
 * True when check 3 needs the parent campaign's categories to decide: the
 * targeting is being sent and does not set advantage_audience explicitly.
 * Callers use this to make the campaign read only when it can matter.
 */
export function needsSpecialAdCategories(rawTargeting: unknown): boolean {
  const targeting = parseTargeting(rawTargeting);
  return targeting !== undefined && !hasExplicitAdvantageAudience(targeting);
}

export interface MetaV26WarningOptions {
  /**
   * Dotted input path of the `targeting` being sent (e.g. `data.targeting`,
   * `items.3.targeting`); each warning's `field` hangs off it. `null` when the
   * targeting is not in the input (a duplicate copies the source's), in which
   * case every warning's `field` is `fallbackField`.
   */
  targetingPath: string | null;
  /** Input field to attach warnings to when `targetingPath` is null. */
  fallbackField?: string;
  /** Where the targeting comes from, for the message, e.g. `in data.targeting`. */
  location: string;
  /**
   * The parent campaign's special ad categories, or why they are unknown.
   * Omit when the payload is not an ad set's targeting (check 3 is skipped).
   */
  specialAdCategories?: SpecialAdCategoriesKnowledge;
}

/**
 * The v26 warnings for one ad-set `targeting` payload. Returns `[]` when the
 * targeting is absent or unparseable. Pure.
 */
export function metaV26TargetingWarnings(
  rawTargeting: unknown,
  opts: MetaV26WarningOptions
): MetaV26Warning[] {
  const targeting = parseTargeting(rawTargeting);
  if (!targeting) return [];
  const warnings: MetaV26Warning[] = [];
  const fieldFor = (suffix: string): string =>
    opts.targetingPath !== null
      ? `${opts.targetingPath}.${suffix}`
      : (opts.fallbackField ?? "targeting");

  if (positionsInclude(targeting, "instagram_positions", "explore")) {
    warnings.push({
      code: META_V26_WARNING_CODES.instagramExplore,
      field: fieldFor("instagram_positions"),
      message:
        `targeting.instagram_positions ${opts.location} includes "explore" (the Instagram Explore ` +
        `feed; "explore_home" is a separate placement). Meta reportedly rejects it with an error.`,
    });
  }

  if (positionsInclude(targeting, "messenger_positions", "story")) {
    warnings.push({
      code: META_V26_WARNING_CODES.messengerStory,
      field: fieldFor("messenger_positions"),
      message:
        `targeting.messenger_positions ${opts.location} includes "story" (Messenger Stories). ` +
        `Meta reportedly accepts it but silently drops the placement, narrowing delivery without notice.`,
    });
  }

  const known = opts.specialAdCategories;
  if (known !== undefined && !hasExplicitAdvantageAudience(targeting)) {
    const subject = `targeting.targeting_automation.advantage_audience ${opts.location} is not set explicitly`;
    const field = fieldFor("targeting_automation.advantage_audience");
    if ("unknown" in known) {
      warnings.push({
        code: META_V26_WARNING_CODES.advantageAudienceUnchecked,
        field,
        message:
          `${subject}, and the parent campaign's special ad categories were not checked ` +
          `(${known.unknown}). If its special_ad_categories includes any of ` +
          `${META_V26_HEC_F_CATEGORIES.join(", ")}, Meta reportedly requires advantage_audience ` +
          `to be set explicitly (1 or 0).`,
      });
    } else {
      const hecf = known.filter((c) => META_V26_HEC_F_CATEGORIES.includes(c));
      if (hecf.length > 0) {
        warnings.push({
          code: META_V26_WARNING_CODES.advantageAudience,
          field,
          message:
            `${subject}, and the parent campaign's special_ad_categories includes ` +
            `${hecf.join(", ")}. Meta reportedly requires advantage_audience to be set explicitly ` +
            `(1 or 0) for an ad set in a Housing, Employment or Financial special ad category.`,
        });
      }
    }
  }

  return warnings;
}

/**
 * The v26 warnings for a create payload (single or bulk item). No I/O: a
 * create makes no read, so for an ad set check 3 says the parent campaign's
 * categories were not checked. `dataPath` is the payload's input path
 * (`data`, `items.3`).
 */
export function metaV26CreateWarnings(
  entityType: string | undefined,
  data: Record<string, unknown> | undefined,
  dataPath: string
): MetaV26Warning[] {
  if (!data || typeof data !== "object") return [];
  const campaign =
    typeof data.campaign_id === "string" ? `campaign ${data.campaign_id}` : "its campaign";
  return metaV26TargetingWarnings(data.targeting, {
    targetingPath: `${dataPath}.targeting`,
    location: `in ${dataPath}.targeting`,
    ...(entityType === "adSet"
      ? { specialAdCategories: { unknown: `a create makes no read, so ${campaign} was not read` } }
      : {}),
  });
}

/**
 * The v26 warnings for an update payload (single or bulk item) on a path that
 * does not read the ad set's campaign: every execute, and the bulk update dry
 * run. For an ad set or an untyped update, check 3 says it was not checked.
 */
export function metaV26UpdateWarnings(
  entityType: string | undefined,
  data: Record<string, unknown> | undefined,
  dataPath: string
): MetaV26Warning[] {
  if (!data || typeof data !== "object") return [];
  return metaV26TargetingWarnings(data.targeting, {
    targetingPath: `${dataPath}.targeting`,
    location: `in ${dataPath}.targeting`,
    ...(entityType === "adSet" || entityType === undefined
      ? { specialAdCategories: { unknown: "this path does not read the ad set's campaign" } }
      : {}),
  });
}

// ─── Logic → formatter hand-off (no schema field) ──────────────────────────

const ATTACHED = new WeakMap<object, readonly MetaV26Warning[]>();

/** Record `warnings` for `result`'s response text. Returns `result` unchanged. */
export function attachMetaV26Warnings<T extends object>(
  result: T,
  warnings: readonly MetaV26Warning[]
): T {
  if (warnings.length > 0) ATTACHED.set(result, warnings);
  return result;
}

/** The warnings the tool logic attached to `result` (`[]` when none). */
export function metaV26WarningsOf(result: object): readonly MetaV26Warning[] {
  return ATTACHED.get(result) ?? [];
}

/**
 * The response-text block (empty string when there are no warnings). It names
 * the fact id and the reported date, says the change is unconfirmed by Meta,
 * and that nothing was blocked or changed.
 */
export function formatMetaV26Warnings(warnings: readonly MetaV26Warning[]): string {
  if (warnings.length === 0) return "";
  return (
    `\n\nWarnings (non-blocking, unconfirmed by Meta): third-party sources report these ` +
    `Marketing API v26.0 changes apply to every API version from ${META_V26_EFFECTIVE_DATE}; ` +
    `Meta's published API specs do not confirm them. The targeting is sent unchanged. ` +
    `See platform-facts ${META_V26_FACT_ID} (#229).\n` +
    warnings.map((w) => `  - [${w.code}] ${w.field}: ${w.message}`).join("\n")
  );
}
