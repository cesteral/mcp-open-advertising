// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { afterEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import { {{Pascal}}ReportingService } from "../src/services/{{key}}/{{key}}-reporting-service.js";

// A report file is fetched from a URL the platform returns, so every hop must
// stay on the allowed hosts: a redirect off them is refused before it is
// requested, as are a non-https URL and an off-host one.
const service = () =>
  new {{Pascal}}ReportingService(
    { consume: async () => undefined } as never,
    {} as never,
    pino({ level: "silent" }),
    "{{baseUrl}}"
  );
const allowed = `https://${new URL("{{baseUrl}}").hostname}/files/report.csv`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("{{key}} report download guard", () => {
  it("downloads from an allowed host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("a,b\n1,2\n", { status: 200 }))
    );
    const out = await service().downloadReport(allowed, 10, undefined);
    expect(out).toMatchObject({ headers: ["a", "b"], totalRows: 1 });
  });

  it("refuses an allowed URL that redirects to a forbidden host", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://attacker.example/steal" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(service().downloadReport(allowed, 10, undefined)).rejects.toThrow();
    // The redirect target was never requested.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a non-https URL and an off-host URL without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      service().downloadReport(allowed.replace("https:", "http:"), 10, undefined)
    ).rejects.toThrow();
    await expect(
      service().downloadReport("https://attacker.example/x.csv", 10, undefined)
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
