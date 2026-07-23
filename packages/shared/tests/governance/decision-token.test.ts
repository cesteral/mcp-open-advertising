// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi } from "vitest";
import * as jose from "jose";
import { hashActionInput } from "@cesteral/contract-hash";
import { verifyDecisionToken, InMemoryJtiStore } from "../../src/index.js";
import type { JtiStore } from "../../src/index.js";

const CURRENT = "secret-current-aaaaaaaaaaaaaaaaaaaaaaaa";
const PREVIOUS = "secret-previous-bbbbbbbbbbbbbbbbbbbbbbb";
const enc = new TextEncoder();

const CONTRACT_ID = "meta.update_entity.v1";
const DEFINITION_HASH = "d".repeat(64);
const ACTION_ARGS = { entityId: "1", status: "PAUSED" };
const ACTION_HASH = hashActionInput(ACTION_ARGS);

const expected = {
  contractId: CONTRACT_ID,
  definitionHash: DEFINITION_HASH,
  actionHash: ACTION_HASH,
};

function basePayload(): Record<string, unknown> {
  return {
    iss: "cesteral-intelligence",
    aud: "mcp-open-advertising",
    sub: "tenant-1",
    contractId: CONTRACT_ID,
    definitionHash: DEFINITION_HASH,
    actionHash: ACTION_HASH,
    jti: `jti-${CONTRACT_ID}-fixed`,
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

async function sign(
  payload: Record<string, unknown>,
  opts: { secret?: string; alg?: string; kid?: string } = {}
): Promise<string> {
  const header: Record<string, unknown> = { alg: opts.alg ?? "HS256" };
  if (opts.kid) header.kid = opts.kid;
  // jose SignJWT manages exp/iat via setters, but we want raw control to test
  // missing/malformed claims, so we sign the payload object as-is.
  return new jose.SignJWT(payload)
    .setProtectedHeader(header as jose.JWTHeaderParameters)
    .sign(enc.encode(opts.secret ?? CURRENT));
}

function verify(
  token: string | undefined,
  over: Partial<Parameters<typeof verifyDecisionToken>[0]> = {},
  jtiStore: JtiStore = new InMemoryJtiStore()
) {
  return verifyDecisionToken({
    token,
    secrets: { current: CURRENT, previous: PREVIOUS },
    expected,
    jtiStore,
    jtiTtlMs: 60_000,
    ...over,
  });
}

describe("verifyDecisionToken", () => {
  it("accepts a fully valid token", async () => {
    const v = await verify(await sign(basePayload()));
    expect(v.ok).toBe(true);
    expect(v.reasonCode).toBe("OK");
    expect(v.claims?.sub).toBe("tenant-1");
    expect(v.claims?.jti).toBeDefined();
  });

  it("MISSING_TOKEN when no token", async () => {
    const v = await verify(undefined);
    expect(v.reasonCode).toBe("MISSING_TOKEN");
  });

  it("MALFORMED_TOKEN when not three segments", async () => {
    const v = await verify("not-a-jwt");
    expect(v.reasonCode).toBe("MALFORMED_TOKEN");
  });

  it("UNSUPPORTED_ALG for non-HS256", async () => {
    const v = await verify(await sign(basePayload(), { alg: "HS384" }));
    expect(v.reasonCode).toBe("UNSUPPORTED_ALG");
  });

  it("UNSUPPORTED_ALG for alg:none", async () => {
    const h = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const p = Buffer.from(JSON.stringify(basePayload())).toString("base64url");
    const v = await verify(`${h}.${p}.`);
    expect(v.reasonCode).toBe("UNSUPPORTED_ALG");
  });

  it("INVALID_SIGNATURE for wrong secret", async () => {
    const v = await verify(await sign(basePayload(), { secret: "totally-wrong-secret" }));
    expect(v.reasonCode).toBe("INVALID_SIGNATURE");
  });

  it("accepts a token signed with the PREVIOUS secret (rotation, no kid)", async () => {
    const v = await verify(await sign(basePayload(), { secret: PREVIOUS }));
    expect(v.reasonCode).toBe("OK");
  });

  describe("kid selection", () => {
    it("kid=current signed with current → OK", async () => {
      const v = await verify(await sign(basePayload(), { kid: "current", secret: CURRENT }));
      expect(v.reasonCode).toBe("OK");
    });
    it("kid=previous signed with previous → OK", async () => {
      const v = await verify(await sign(basePayload(), { kid: "previous", secret: PREVIOUS }));
      expect(v.reasonCode).toBe("OK");
    });
    it("unknown kid → INVALID_SIGNATURE", async () => {
      const v = await verify(await sign(basePayload(), { kid: "rotated-out", secret: CURRENT }));
      expect(v.reasonCode).toBe("INVALID_SIGNATURE");
    });
    it("kid=current but signed with previous → INVALID_SIGNATURE (no fallback)", async () => {
      const v = await verify(await sign(basePayload(), { kid: "current", secret: PREVIOUS }));
      expect(v.reasonCode).toBe("INVALID_SIGNATURE");
    });
  });

  describe("required claims", () => {
    for (const claim of [
      "jti",
      "exp",
      "iat",
      "sub",
      "contractId",
      "definitionHash",
      "actionHash",
    ]) {
      it(`MISSING_CLAIM when ${claim} absent`, async () => {
        const p = basePayload();
        delete p[claim];
        const spy = { consumeOnce: vi.fn(async () => "fresh" as const) };
        const v = await verify(await sign(p), {}, spy);
        expect(v.reasonCode).toBe("MISSING_CLAIM");
        expect(v.detail).toBe(claim);
        expect(spy.consumeOnce).not.toHaveBeenCalled();
      });
    }

    it("MALFORMED_TOKEN when exp is non-numeric", async () => {
      const p = { ...basePayload(), exp: "soon" };
      const v = await verify(await sign(p));
      expect(v.reasonCode).toBe("MALFORMED_TOKEN");
    });

    it("MALFORMED_TOKEN when jti is empty string", async () => {
      const p = { ...basePayload(), jti: "" };
      const v = await verify(await sign(p));
      expect(v.reasonCode).toBe("MALFORMED_TOKEN");
    });
  });

  it("EXPIRED when exp is in the past", async () => {
    const p = { ...basePayload(), exp: Math.floor(Date.now() / 1000) - 3600 };
    const v = await verify(await sign(p));
    expect(v.reasonCode).toBe("EXPIRED");
  });

  it("WRONG_ISSUER", async () => {
    const v = await verify(await sign({ ...basePayload(), iss: "evil" }));
    expect(v.reasonCode).toBe("WRONG_ISSUER");
  });

  it("WRONG_AUDIENCE", async () => {
    const v = await verify(await sign({ ...basePayload(), aud: "someone-else" }));
    expect(v.reasonCode).toBe("WRONG_AUDIENCE");
  });

  it("CONTRACT_MISMATCH", async () => {
    const v = await verify(await sign({ ...basePayload(), contractId: "meta.delete_entity.v1" }));
    expect(v.reasonCode).toBe("CONTRACT_MISMATCH");
  });

  it("DEFINITION_HASH_MISMATCH", async () => {
    const v = await verify(await sign({ ...basePayload(), definitionHash: "e".repeat(64) }));
    expect(v.reasonCode).toBe("DEFINITION_HASH_MISMATCH");
  });

  it("ACTION_HASH_MISMATCH", async () => {
    const v = await verify(await sign({ ...basePayload(), actionHash: hashActionInput({ x: 9 }) }));
    expect(v.reasonCode).toBe("ACTION_HASH_MISMATCH");
  });

  it("REPLAYED_JTI on a second consume of the same token", async () => {
    const store = new InMemoryJtiStore();
    const token = await sign(basePayload());
    expect((await verify(token, {}, store)).reasonCode).toBe("OK");
    expect((await verify(token, {}, store)).reasonCode).toBe("REPLAYED_JTI");
  });

  it("JTI_STORE_ERROR (not a throw) when the store rejects — caller decides warn vs enforce", async () => {
    // FirestoreJtiStore propagates non-ALREADY_EXISTS errors (UNAVAILABLE etc.).
    // verifyDecisionToken must surface that as a verdict, never let it escape —
    // otherwise a warn-mode verification silently hard-blocks a legitimate write.
    const store: JtiStore = {
      consumeOnce: vi.fn(async () => {
        const err = new Error("UNAVAILABLE") as Error & { code: number };
        err.code = 14;
        throw err;
      }),
    };
    const v = await verify(await sign(basePayload()), {}, store);
    expect(v.ok).toBe(false);
    expect(v.reasonCode).toBe("JTI_STORE_ERROR");
    expect(v.detail).toContain("UNAVAILABLE");
    // The store WAS reached (this is the last step), so the jti attempt happened.
    expect(store.consumeOnce).toHaveBeenCalledOnce();
  });

  it("does not reach the jti store (no error) when an earlier binding check fails", async () => {
    const store: JtiStore = {
      consumeOnce: vi.fn(async () => {
        throw new Error("should not be called");
      }),
    };
    const v = await verify(await sign({ ...basePayload(), actionHash: "wrong" }), {}, store);
    expect(v.reasonCode).toBe("ACTION_HASH_MISMATCH");
    expect(store.consumeOnce).not.toHaveBeenCalled();
  });

  it("does not consume jti when a binding check fails", async () => {
    const spy = { consumeOnce: vi.fn(async () => "fresh" as const) };
    const v = await verify(await sign({ ...basePayload(), actionHash: "wrong" }), {}, spy);
    expect(v.reasonCode).toBe("ACTION_HASH_MISMATCH");
    expect(spy.consumeOnce).not.toHaveBeenCalled();
  });

  it("custom arg key ordering still hashes consistently (reordered args accepted)", async () => {
    // governance hashed {entityId, status}; client sends {status, entityId}
    const reordered = hashActionInput({ status: "PAUSED", entityId: "1" });
    expect(reordered).toBe(ACTION_HASH);
    const v = await verify(await sign(basePayload()));
    expect(v.reasonCode).toBe("OK");
  });

  describe("secret hardening", () => {
    it("SECRET_UNCONFIGURED when no secret is set (empty current, no previous)", async () => {
      const v = await verify(await sign(basePayload()), { secrets: { current: "" } });
      expect(v.reasonCode).toBe("SECRET_UNCONFIGURED");
    });

    it("fails closed (never accepts) when the server secret is empty", async () => {
      // A perfectly valid token signed with the real secret must STILL be
      // rejected if the server has no secret configured — never silently
      // accepted via an empty-string key.
      const validToken = await sign(basePayload(), { secret: CURRENT });
      const v = await verify(validToken, { secrets: { current: "  " } });
      expect(v.ok).toBe(false);
      expect(v.reasonCode).toBe("SECRET_UNCONFIGURED");
    });
  });

  describe("unresolved definition hash", () => {
    it("verifies all other bindings and reports definitionHashVerified:false", async () => {
      const v = await verify(await sign(basePayload()), {
        expected: { contractId: CONTRACT_ID, actionHash: ACTION_HASH }, // no definitionHash
      });
      expect(v.reasonCode).toBe("OK");
      expect(v.definitionHashVerified).toBe(false);
    });

    it("still catches a bad actionHash when definition hash is unresolved", async () => {
      const v = await verify(await sign({ ...basePayload(), actionHash: "wrong" }), {
        expected: { contractId: CONTRACT_ID, actionHash: ACTION_HASH },
      });
      expect(v.reasonCode).toBe("ACTION_HASH_MISMATCH");
    });

    it("reports definitionHashVerified:true when the hash is checked", async () => {
      const v = await verify(await sign(basePayload()));
      expect(v.definitionHashVerified).toBe(true);
    });
  });

  it("replay TTL covers the token lifetime even when jtiTtlMs is short", async () => {
    const clock = { ms: 1_000_000_000 };
    const store = new InMemoryJtiStore(() => clock.ms);
    const now = () => clock.ms;
    // exp ~1h out; jtiTtlMs deliberately tiny.
    const exp = Math.floor(clock.ms / 1000) + 3600;
    const token = await sign({ ...basePayload(), exp });

    const first = await verify(token, { jtiTtlMs: 1, now }, store);
    expect(first.reasonCode).toBe("OK");

    // Advance well past jtiTtlMs but while the token is still valid.
    clock.ms += 60_000;
    const replay = await verify(token, { jtiTtlMs: 1, now }, store);
    expect(replay.reasonCode).toBe("REPLAYED_JTI");
  });
});
