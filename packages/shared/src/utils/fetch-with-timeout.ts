// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Fetch with timeout support
 * Prevents hanging requests by enforcing a maximum duration
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  context?: { requestId?: string },
  options?: RequestInit,
  sanitizeUrlForErrors?: (url: string) => string
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...options?.headers,
        // Add request ID for tracing if context is provided
        ...(context?.requestId && { "X-Request-ID": context.requestId }),
      },
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const displayUrl = sanitizeUrlForErrors ? sanitizeUrlForErrors(url) : url;
      throw new Error(`Request timeout after ${timeoutMs}ms: ${displayUrl}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}