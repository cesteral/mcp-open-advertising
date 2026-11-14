import type { IncomingMessage, ServerResponse } from "node:http";

/** The slice of `http.Server` the tracker needs; also satisfied by the node-server `serve()` result. */
export interface RequestEmitter {
  on(event: "request", listener: (req: IncomingMessage, res: ServerResponse) => void): unknown;
}

/**
 * Counts HTTP requests that have been received but whose response has not yet
 * finished, so a SIGTERM handler can wait for them before it tears sessions
 * down.
 *
 * Cloud Run sends SIGTERM on every scale-in and rolling deploy. Closing the
 * session transports at once severs a running tool call, and for a write that
 * has already reached the platform the client sees a dropped connection and
 * retries; the retry arrives with a fresh decision token, so jti replay
 * protection cannot recognise it as the same write.
 *
 * Attach before the server starts accepting traffic or requests received earlier
 * are not counted.
 */
export interface InFlightTracker {
  /** Requests currently being served. */
  readonly count: () => number;
  /**
   * Resolves once no request is in flight, or after `timeoutMs`, whichever comes
   * first. Resolves `true` when drained and `false` on timeout.
   */
  readonly drain: (timeoutMs: number) => Promise<boolean>;
}

export function trackInFlightRequests(server: RequestEmitter): InFlightTracker {
  let active = 0;
  let waiters: Array<() => void> = [];

  const settle = (): void => {
    if (active > 0) return;
    const ready = waiters;
    waiters = [];
    for (const resolve of ready) resolve();
  };

  server.on("request", (_req, res) => {
    active++;
    let done = false;
    // `close` fires on normal completion and on client abort, so a request whose
    // caller hung up cannot hold shutdown for the full timeout.
    const finish = (): void => {
      if (done) return;
      done = true;
      active--;
      settle();
    };
    res.once("close", finish);
    res.once("finish", finish);
  });

  return {
    count: () => active,
    drain: (timeoutMs) =>
      new Promise<boolean>((resolve) => {
        if (active === 0) {
          resolve(true);
          return;
        }
        const timer = setTimeout(() => {
          waiters = waiters.filter((w) => w !== onDrained);
          resolve(false);
        }, timeoutMs);
        const onDrained = (): void => {
          clearTimeout(timer);
          resolve(true);
        };
        waiters.push(onDrained);
      }),
  };
}
