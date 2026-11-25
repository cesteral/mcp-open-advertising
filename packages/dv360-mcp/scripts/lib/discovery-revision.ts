/**
 * Discovery revision pin.
 *
 * The generated schemas in `src/generated/schemas/` come from a Google
 * Discovery document that Google edits in place: the same URL serves a new
 * document whenever the API changes, and only the document's `revision` field
 * says which one you got. Nothing in the generated files recorded it, so
 * nobody could say which revision the committed schemas were built from, or
 * whether a regeneration would change them.
 *
 * `discovery-revision.json`, written next to the generated files by every
 * regeneration, is that record. It is a statement about the committed output
 * ("these schemas were generated from this revision"), not a request to fetch
 * one: Discovery serves only its current document, so there is nothing to
 * fetch an older revision from.
 */

import type { DiscoveryDocument } from "./types.js";

export const REVISION_PIN_FILE = "discovery-revision.json";

export interface DiscoveryRevisionPin {
  /** Discovery document name, e.g. `displayvideo`. */
  api: string;
  /** API version the schemas target, e.g. `v4`. */
  version: string;
  /** Discovery document revision the generated schemas were built from. */
  revision: string;
}

export function buildRevisionPin(doc: DiscoveryDocument): DiscoveryRevisionPin {
  return { api: doc.name, version: doc.version, revision: doc.revision };
}

/** Stable serialization, so regenerating from the same revision is a byte-for-byte no-op. */
export function serializeRevisionPin(pin: DiscoveryRevisionPin): string {
  return `${JSON.stringify(pin, null, 2)}\n`;
}
