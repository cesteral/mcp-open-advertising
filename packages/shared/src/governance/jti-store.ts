// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Consume-once store for decision-token `jti` claims — the replay-protection
 * primitive. A token's `jti` may be consumed exactly once within its TTL;
 * a second attempt is a replay.
 *
 * `actionHash` binding alone is NOT replay-proof: an attacker can resend the
 * identical signed token with identical args and the binding still matches.
 * Consuming `jti` exactly once is what stops that.
 */
export interface JtiStore {
  /**
   * Atomically record `jti` as consumed. Returns `"fresh"` if this is the
   * first time within `ttlMs`, or `"replayed"` if already consumed.
   */
  consumeOnce(jti: string, ttlMs: number): Promise<"fresh" | "replayed">;
}

/**
 * Single-instance in-memory {@link JtiStore}. Correct for stdio, self-host,
 * single-instance, and CI. On multi-instance Cloud Run it only blocks replays
 * routed to the same instance — use {@link FirestoreJtiStore} when enforcement
 * is enabled on a scaled-out deployment.
 *
 * The clock is injectable for deterministic tests.
 */
export class InMemoryJtiStore implements JtiStore {
  private readonly seen = new Map<string, number>(); // jti -> expiry epoch ms

  constructor(private readonly now: () => number = () => Date.now()) {}

  async consumeOnce(jti: string, ttlMs: number): Promise<"fresh" | "replayed"> {
    const t = this.now();
    const existing = this.seen.get(jti);
    if (existing !== undefined && existing > t) {
      return "replayed";
    }
    this.seen.set(jti, t + ttlMs);
    this.sweep(t);
    return "fresh";
  }

  /** Drop expired entries opportunistically so the map does not grow unbounded. */
  private sweep(t: number): void {
    if (this.seen.size < 1024) return;
    for (const [jti, expiry] of this.seen) {
      if (expiry <= t) this.seen.delete(jti);
    }
  }
}
