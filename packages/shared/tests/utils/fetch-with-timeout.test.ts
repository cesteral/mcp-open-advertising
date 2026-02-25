import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout } from "../../src/utils/fetch-with-timeout.js";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses sanitizer in timeout error message when provided", async () => {
    // Mock fetch to respect the abort signal (simulates timeout)
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new DOMException("The operation was aborted", "AbortError");
            reject(err);
          });
        }
      });
    });

    const sanitizer = (url: string) =>
      url.replace(/access_token=[^&]+/, "access_token=***");

    const url = "https://graph.facebook.com/v21.0/me?access_token=SECRET123";

    await expect(
      fetchWithTimeout(url, 50, undefined, undefined, sanitizer)
    ).rejects.toThrow("access_token=***");
  });

  it("raw token not present in sanitized timeout error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }
      });
    });

    const sanitizer = (url: string) =>
      url.replace(/access_token=[^&]+/, "access_token=***");

    const url = "https://graph.facebook.com/v21.0/me?access_token=SECRET123";

    try {
      await fetchWithTimeout(url, 50, undefined, undefined, sanitizer);
    } catch (error) {
      expect((error as Error).message).not.toContain("SECRET123");
    }
  });

  it("shows raw URL in timeout error when no sanitizer provided (backward compat)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }
      });
    });

    const url = "https://example.com/api?key=visible";

    await expect(fetchWithTimeout(url, 50)).rejects.toThrow(
      "Request timeout after 50ms: https://example.com/api?key=visible"
    );
  });

  it("returns response on successful fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 })
    );

    const response = await fetchWithTimeout("https://example.com", 5000);
    expect(response.status).toBe(200);
  });
});
