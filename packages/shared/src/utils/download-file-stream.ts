// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { fetchWithTimeout } from "./fetch-with-timeout.js";
import type { RequestContext } from "./request-context.js";
import type { Readable } from "node:stream";

/**
 * Fetch a URL and return a Node `Readable` stream of the response body so
 * callers can process the CSV in chunks (tee-split for spill, progressive
 * parsing, size-capped buffering) instead of materializing the entire body
 * in memory via `await response.text()`.
 *
 * Returned object mirrors the subset of `Response` fields existing call
 * sites inspect (`ok`, `status`, `statusText`, `headers`) plus a Node
 * `Readable` instead of a Web `ReadableStream`. Callers that still want
 * the full text body should use `fetchWithTimeout` + `response.text()`.
 */
export interface StreamedDownload {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers | { get: (name: string) => string | null };
  /** Node Readable stream of the response body. Undefined when `ok: false`. */
  body?: Readable;
}

export async function downloadFileStream(
  url: string,
  timeoutMs: number,
  context?: RequestContext,
  init?: RequestInit,
): Promise<StreamedDownload> {
  const response = await fetchWithTimeout(url, timeoutMs, context, init);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    };
  }

  const webBody = response.body;
  if (!webBody) {
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    };
  }

  // Convert Web ReadableStream → Node Readable. `Readable.fromWeb` has been
  // stable on Node since v17+; we type it defensively because the Node types
  // declare it as returning `Readable`.
  const { Readable } = await import("node:stream");
  type FromWebFn = (ws: ReadableStream) => Readable;
  const fromWeb = (Readable as unknown as { fromWeb: FromWebFn }).fromWeb;
  const body = fromWeb(webBody as unknown as ReadableStream);

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    body,
  };
}
