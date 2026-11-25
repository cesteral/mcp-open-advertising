import { describe, it, expect } from "vitest";

import { classifyDrift, readPin } from "../check/check-dv360-codegen-drift.mjs";

/**
 * The drift check regenerates the dv360 schemas from Google's live Discovery
 * document. These tests pin how it reads the result: the revision pin is what
 * separates "Google moved the API" from "the committed files were never
 * generated from the revision they claim", and Google bumping the revision for
 * a doc-only edit must not read as drift.
 */

const DIR = "packages/dv360-mcp/src/generated/schemas";
const ZOD = `${DIR}/zod.ts`;
const TYPES = `${DIR}/types.ts`;
const PIN = `${DIR}/discovery-revision.json`;

const pin = (revision) => ({ api: "displayvideo", version: "v4", revision });

describe("classifyDrift", () => {
  it("reports nothing when regeneration changed no file", () => {
    const v = classifyDrift({
      changedFiles: [],
      committedPin: pin("20261117"),
      livePin: pin("20261117"),
    });
    expect(v.kind).toBe("none");
  });

  it("treats a revision bump with identical schemas as not drift", () => {
    const v = classifyDrift({
      changedFiles: [PIN],
      committedPin: pin("20261117"),
      livePin: pin("20261201"),
    });
    expect(v).toMatchObject({ kind: "revision-only", from: "20261117", to: "20261201" });
  });

  it("reports drift when the revision moved and the schemas changed", () => {
    const v = classifyDrift({
      changedFiles: [ZOD, PIN],
      committedPin: pin("20261117"),
      livePin: pin("20261201"),
    });
    expect(v).toMatchObject({ kind: "drift", sameRevision: false, schemaFiles: [ZOD] });
  });

  it("flags schemas that differ at the SAME revision as never generated from it", () => {
    const v = classifyDrift({
      changedFiles: [ZOD, TYPES],
      committedPin: pin("20261117"),
      livePin: pin("20261117"),
    });
    expect(v).toMatchObject({ kind: "drift", sameRevision: true, schemaFiles: [ZOD, TYPES] });
  });

  it("still reports schema drift when no pin was ever committed", () => {
    const v = classifyDrift({
      changedFiles: [ZOD, PIN],
      committedPin: null,
      livePin: pin("20261117"),
    });
    expect(v).toMatchObject({ kind: "drift", sameRevision: false, from: null });
  });

  it("asks for the pin to be committed when schemas match but there is no pin", () => {
    const v = classifyDrift({
      changedFiles: [PIN],
      committedPin: null,
      livePin: pin("20261117"),
    });
    expect(v).toMatchObject({ kind: "revision-only", from: null, to: "20261117" });
  });
});

describe("readPin", () => {
  it("reads a well-formed pin", () => {
    expect(readPin(JSON.stringify(pin("20261117")))).toEqual(pin("20261117"));
  });

  it.each([
    ["not json"],
    ["{}"],
    [JSON.stringify({ revision: "" })],
    [JSON.stringify({ revision: 20261117 })],
  ])("returns null for %s", (text) => {
    expect(readPin(text)).toBeNull();
  });
});
