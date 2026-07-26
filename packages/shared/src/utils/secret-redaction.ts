/**
 * Shared secret-redaction primitives.
 *
 * Why this module exists (sweep 2026-07-25, 02-F5/F6/F7). Two copies of "strip
 * secrets from a string" had drifted apart:
 *
 *  - `http-request-recorder.ts` carried the maintained one. It handles JSON
 *    (`"key":"value"`) AND form-urlencoded / query (`key=value`) shapes, tolerates
 *    optional quotes, and spells `developer[_-]?token` both ways — because the
 *    OAuth2 token-exchange and refresh bodies are `x-www-form-urlencoded`, which
 *    a `":"`-anchored pattern misses entirely. It also has `redactUrl`.
 *  - `mcp-errors.ts` carried a second, weaker set: JSON-quoted keys only, no
 *    `=` form, no hyphen spelling, no URL handling.
 *
 * Measured against the four shapes these actually see, the weak set caught one
 * of four — it missed `?access_token=…` in a URL, `client_secret=…&…` in a form
 * body, and `"developer-token"` in JSON.
 *
 * Worse, `sanitizeErrorData` applied even the weak set only to `data` values,
 * while `errorMessage` — which routinely carries the same bytes, because upstream
 * clients build messages by interpolating the failing URL or response body — was
 * written to the interaction log verbatim.
 *
 * One implementation now, imported by both. Keeping the strong patterns means the
 * error path gets the recorder's coverage rather than the recorder losing any.
 */

/**
 * The first pattern covers both JSON (`"key":"value"`) and form-urlencoded /
 * query (`key=value`) shapes. Optional quotes are tolerated on both key and
 * value; the value runs until the next quote, comma, ampersand, or whitespace.
 */
const BODY_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [
    /("?(?:access_token|refresh_token|client_secret|api_secret|developer[_-]?token|password|assertion|id_token)"?\s*[:=]\s*"?)[^"&,\s]+/gi,
    "$1[REDACTED]",
  ],
  [/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]"],
];

/** Strip secret-bearing fields from a request/response body or error string. */
export function redactSecretsInString(text: string): string {
  let out = text;
  for (const [pattern, replacement] of BODY_SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Query-param names whose values are stripped from recorded URLs. Matches by
 * substring, case-insensitive — narrower than the header patterns to avoid
 * redacting benign params (a header-style "key" pattern would clobber
 * `?key=primary`).
 */
const SENSITIVE_URL_PARAM_PATTERNS = [
  "token",
  "secret",
  "password",
  "credential",
  "signature",
  "authorization",
  "api_key",
  "apikey",
  "api-key",
];

function isSensitiveUrlParam(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_URL_PARAM_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Strip values of known-sensitive query parameters from a URL string. Used
 * before persisting URLs to the upstream-request log so credentials accidentally
 * placed in query strings (e.g. Meta Graph API `access_token=…`) don't leak.
 *
 * Unparseable inputs are returned unchanged.
 */
export function redactUrl(url: string): string {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  let mutated = false;
  for (const [name] of [...parsed.searchParams.entries()]) {
    if (isSensitiveUrlParam(name)) {
      parsed.searchParams.set(name, "[REDACTED]");
      mutated = true;
    }
  }
  return mutated ? parsed.toString() : url;
}

/** Matches an http(s) URL embedded anywhere in free text. */
const EMBEDDED_URL = /https?:\/\/[^\s"'<>)\]}]+/gi;

/**
 * Redact a free-text string that may EMBED a URL — an error message, typically.
 *
 * `redactSecretsInString` alone covers a bare `access_token=…` pair, but a URL
 * can carry a credential under a param name the body patterns do not enumerate
 * (`?sig=`, `?apikey=`), and `redactUrl` covers those by substring. Running both
 * gives an error message the union rather than whichever one happened to be
 * applied. URLs are rewritten first so the body patterns see the already-
 * redacted form and cannot re-match inside it.
 */
export function redactSecretsInText(text: string): string {
  return redactSecretsInString(text.replace(EMBEDDED_URL, (url) => redactUrl(url)));
}
