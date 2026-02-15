import type { RequestContext } from "../internal/request-context.js";

/**
 * Fetch with timeout support
 * Prevents hanging requests by enforcing a maximum duration
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  context?: RequestContext,
  options?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...options?.headers,
        ...(context?.requestId && { "X-Request-ID": context.requestId }),
      },
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
