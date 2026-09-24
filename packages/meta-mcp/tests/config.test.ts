import { describe, it, expect, afterEach } from "vitest";
import { parseConfig } from "../src/config/index.js";

const ENV_KEYS = ["META_API_BASE_URL", "META_API_VERSION"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Meta API version configuration", () => {
  it("META_API_VERSION selects the Graph version when META_API_BASE_URL is unset", () => {
    delete process.env.META_API_BASE_URL;
    process.env.META_API_VERSION = "v26.0";

    const cfg = parseConfig();

    expect(cfg.metaApiBaseUrl).toBe("https://graph.facebook.com/v26.0");
    expect(cfg.metaApiVersion).toBe("v26.0");
  });

  it("an explicit META_API_BASE_URL wins over META_API_VERSION", () => {
    process.env.META_API_BASE_URL = "https://graph.test/v24.0";
    process.env.META_API_VERSION = "v26.0";

    expect(parseConfig().metaApiBaseUrl).toBe("https://graph.test/v24.0");
  });

  it("keeps the pinned default base URL when neither is set", () => {
    delete process.env.META_API_BASE_URL;
    delete process.env.META_API_VERSION;

    expect(parseConfig().metaApiBaseUrl).toMatch(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+$/);
  });

  it("rejects a malformed META_API_VERSION", () => {
    delete process.env.META_API_BASE_URL;
    process.env.META_API_VERSION = "25";

    expect(() => parseConfig()).toThrow();
  });
});
