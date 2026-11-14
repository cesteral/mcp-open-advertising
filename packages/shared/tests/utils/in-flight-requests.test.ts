import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { trackInFlightRequests } from "../../src/utils/transport/in-flight-requests.js";

const open: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of open.splice(0)) await close();
});

async function start(handler: Parameters<typeof createServer>[1]) {
  const server = createServer(handler);
  const tracker = trackInFlightRequests(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  open.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      })
  );
  const port = (server.address() as AddressInfo).port;
  const get = () =>
    new Promise<string>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, agent: false }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body));
      });
      req.on("error", reject);
      req.end();
    });
  return { tracker, get };
}

describe("trackInFlightRequests", () => {
  it("resolves immediately when nothing is in flight", async () => {
    const { tracker } = await start((_req, res) => res.end("ok"));
    expect(tracker.count()).toBe(0);
    expect(await tracker.drain(1000)).toBe(true);
  });

  it("waits for a running request to finish before draining", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { tracker, get } = await start(async (_req, res) => {
      await gate;
      res.end("done");
    });

    const pending = get();
    while (tracker.count() === 0) await new Promise((r) => setTimeout(r, 5));

    let drained = false;
    const drain = tracker.drain(5000).then((v) => ((drained = true), v));
    await new Promise((r) => setTimeout(r, 30));
    expect(drained).toBe(false);

    release();
    expect(await drain).toBe(true);
    expect(await pending).toBe("done");
    expect(tracker.count()).toBe(0);
  });

  it("gives up at the deadline when a request never finishes", async () => {
    const { tracker, get } = await start(() => {
      /* never responds */
    });
    get().catch(() => undefined);
    while (tracker.count() === 0) await new Promise((r) => setTimeout(r, 5));

    const started = Date.now();
    expect(await tracker.drain(80)).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
  });
});
