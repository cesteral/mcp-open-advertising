// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Rest.li protocol 2.0.0 query-string encoding.
 *
 * Every request this server sends carries `X-Restli-Protocol-Version: 2.0.0`,
 * so every query string has to be written in Rest.li 2.0 syntax. The 1.0 syntax
 * (`accounts[0]=…`, `dateRange.start.year=…`) is a different wire format, not an
 * alternative spelling that a 2.0 server also accepts.
 *
 * The rules below are ported from LinkedIn's own official client libraries —
 * not re-derived — so they can be checked line for line:
 *
 * - linkedin-developers/linkedin-api-js-client `lib/utils/encoder.ts`
 *   (`encode`/`paramEncode`/`encodePrimitive`) and `lib/utils/constants.ts`
 *   (`LIST_PREFIX = 'List('`, `OBJ_PREFIX = '('`); its test vectors in
 *   `tests/utils/encoder.test.ts` are reproduced in this package's tests.
 * - linkedin-developers/linkedin-api-python-client
 *   `linkedin_api/clients/restli/utils/encoder.py` and its tests, e.g.
 *   `{"k2": "urn:li:app:123"}` → `(k2:urn%3Ali%3Aapp%3A123)`.
 * - linkedin/rest.li wiki "Rest.li 2.0 Proposed Changes": the 1.0 form
 *   `param.aList[0]=foo&param.aList[1]=bar` becomes `param=(aList:List(foo,bar))`.
 *
 * In short:
 * - an array is `List(a,b,c)`;
 * - a record is `(key:value,key:value)`;
 * - a primitive (and every key) is `encodeURIComponent`-encoded, and the Rest.li
 *   reserved characters `, ( ) ' :` inside it are percent-escaped too — so a URN
 *   is `urn%3Ali%3AsponsoredAccount%3A123` while the structural `List(`, `(`,
 *   `:` and `,` around it stay literal;
 * - the empty string is `''`. (WHATWG `fetch` re-encodes `'` in a query string to
 *   `%27`, so an empty-string value does not survive the trip; nothing here
 *   sends one.)
 *
 * `URLSearchParams` cannot express this: it percent-encodes the structural
 * characters, and re-encodes a pre-encoded URN's `%` (`%3A` → `%253A`).
 *
 * `fields` is the one exception, and both official clients special-case it
 * (`encodeQueryParamsForGetRequests`): LinkedIn still reads the projection in
 * the 1.0 comma-separated form, `fields=id,name`, not `fields=List(id,name)`.
 */

/** A value that can be sent as (part of) a Rest.li 2.0 query parameter. */
export type RestliQueryValue =
  | string
  | number
  | boolean
  | null
  | readonly RestliQueryValue[]
  | { readonly [key: string]: RestliQueryValue | undefined };

/** Query parameters for a Rest.li 2.0 request; `undefined` entries are dropped. */
export type RestliQueryParams = Readonly<Record<string, RestliQueryValue | undefined>>;

const RESTLI_RESERVED = /[,()':]/g;

function percentEscape(char: string): string {
  return `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
}

/** Encode a primitive (or a key) — URI-encoded, plus Rest.li's reserved characters. */
export function encodeRestliPrimitive(value: string | number | boolean | null): string {
  if (value === "") return "''";
  return encodeURIComponent(String(value)).replace(RESTLI_RESERVED, percentEscape);
}

/** Encode any Rest.li value: `List(...)`, `(k:v,...)`, or an escaped primitive. */
export function encodeRestliValue(value: RestliQueryValue): string {
  if (Array.isArray(value)) {
    return `List(${value.map((item: RestliQueryValue) => encodeRestliValue(item)).join(",")})`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as { readonly [key: string]: RestliQueryValue | undefined };
    const pairs = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .map((key) => `${encodeRestliPrimitive(key)}:${encodeRestliValue(record[key]!)}`);
    return `(${pairs.join(",")})`;
  }
  return encodeRestliPrimitive(value as string | number | boolean | null);
}

/**
 * Encode the `fields` projection in the comma-separated form LinkedIn reads.
 *
 * The official clients append it raw. Each name is still URI-encoded here so a
 * caller-supplied metric can never inject `&`/`=` into the query string; for the
 * plain identifiers LinkedIn uses that is byte-identical to the raw form.
 */
function encodeFieldsProjection(fields: RestliQueryValue): string {
  const list = Array.isArray(fields) ? fields.map(String) : String(fields).split(",");
  return list
    .map((field) => field.trim())
    .filter((field) => field.length > 0)
    .map((field) => encodeURIComponent(field))
    .join(",");
}

/**
 * Serialize query parameters as a Rest.li 2.0 query string (no leading `?`).
 * Parameter order is preserved; `fields`, when present, is written last.
 */
export function encodeRestliQuery(params: RestliQueryParams): string {
  const parts: string[] = [];
  let fields: RestliQueryValue | undefined;
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value === undefined) continue;
    if (key === "fields") {
      fields = value;
      continue;
    }
    parts.push(`${encodeRestliPrimitive(key)}=${encodeRestliValue(value)}`);
  }
  if (fields !== undefined && fields !== null) {
    parts.push(`fields=${encodeFieldsProjection(fields)}`);
  }
  return parts.join("&");
}
