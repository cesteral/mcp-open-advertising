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

/** Minimal structural subset of `@google-cloud/firestore` used by the store. */
export interface FirestoreLike {
  collection(name: string): {
    doc(id: string): {
      create(data: Record<string, unknown>): Promise<unknown>;
    };
  };
}

/** gRPC ALREADY_EXISTS status code raised by Firestore `create()` on a duplicate. */
const FIRESTORE_ALREADY_EXISTS = 6;

/**
 * Distributed {@link JtiStore} backed by Firestore. Replay protection is
 * correct across Cloud Run instances: `doc(jti).create()` is an atomic
 * create-if-absent, so a second consume of the same `jti` rejects with
 * ALREADY_EXISTS → `"replayed"`. Any other error propagates — we never swallow
 * an upstream failure into a silent `"fresh"`.
 *
 * TTL: the `expiresAt` field is written for a Firestore TTL policy to reclaim
 * (provisioned in Terraform). The policy is the storage-cost control, not the
 * correctness mechanism — correctness is the atomic create.
 */
export class FirestoreJtiStore implements JtiStore {
  constructor(
    private readonly db: FirestoreLike,
    private readonly collectionName = "governance_jti",
    private readonly now: () => number = () => Date.now()
  ) {}

  async consumeOnce(jti: string, ttlMs: number): Promise<"fresh" | "replayed"> {
    try {
      await this.db
        .collection(this.collectionName)
        .doc(jti)
        .create({ expiresAt: new Date(this.now() + ttlMs).toISOString() });
      return "fresh";
    } catch (error: unknown) {
      if ((error as { code?: number } | null)?.code === FIRESTORE_ALREADY_EXISTS) {
        return "replayed";
      }
      throw error;
    }
  }
}

async function defaultFirestoreFactory(): Promise<FirestoreLike> {
  // Dynamic import so `@google-cloud/firestore` stays an optional peer dep —
  // stdio / in-memory deployments never load the SDK. Same pattern as
  // report-spill.ts (@google-cloud/storage).
  const moduleName = "@google-cloud/firestore";
  const mod = (await import(moduleName)) as { Firestore: new () => FirestoreLike };
  return new mod.Firestore();
}

/**
 * Choose the {@link JtiStore} implementation from configuration.
 *
 * - `GOVERNANCE_JTI_STORE=firestore` → {@link FirestoreJtiStore} (hosted,
 *   scale-out-safe). The Firestore client is loaded via dynamic import unless a
 *   `firestoreFactory` is injected (tests).
 * - otherwise → {@link InMemoryJtiStore}. If `enforcementEnabled` is true, this
 *   is logged as a WARNING because in-memory replay protection does not hold
 *   across multiple Cloud Run instances.
 */
export async function selectJtiStore(opts: {
  env: Record<string, string | undefined>;
  enforcementEnabled?: boolean;
  logger?: { warn: (obj: unknown, msg?: string) => void };
  firestoreFactory?: () => Promise<FirestoreLike>;
}): Promise<JtiStore> {
  const { env, enforcementEnabled = false, logger, firestoreFactory } = opts;

  if (env.GOVERNANCE_JTI_STORE === "firestore") {
    const db = await (firestoreFactory ?? defaultFirestoreFactory)();
    return new FirestoreJtiStore(db, env.GOVERNANCE_JTI_COLLECTION || undefined);
  }

  if (enforcementEnabled) {
    logger?.warn(
      { component: "governance", jtiStore: "in-memory" },
      "Decision-token enforcement is enabled with an in-memory jti store — replay " +
        "protection does not hold across multiple instances. Set GOVERNANCE_JTI_STORE=firestore."
    );
  }
  return new InMemoryJtiStore();
}
