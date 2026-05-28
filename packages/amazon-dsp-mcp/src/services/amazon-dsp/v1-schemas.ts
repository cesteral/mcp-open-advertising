// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Stable local re-exports of the v1 Zod schemas needed by the service and
 * tools.
 *
 * The generator (scripts/generate-schemas.ts) annotates every emitted schema
 * as `z.ZodTypeAny` so TypeScript does not try to infer the full type at the
 * declaration site (deeply-nested forecast/spend schemas otherwise trip
 * TS7056 under composite/declaration emission). Here we reconstitute the
 * precise types by casting each schema to `z.ZodType<components[...]>`
 * against the interfaces emitted by openapi-typescript.
 *
 * IMPORTANT: the `as z.ZodType<X>` casts only recover the TypeScript
 * inference. Runtime validation behavior is unchanged — it still comes from
 * the original generated Zod schema (`.parse(...)` still runs the same
 * checks). Treat the casts as type-system bookkeeping, not as a way to
 * relax or strengthen runtime validation.
 *
 * Spec quirk worth knowing: `ErrorsIndex.index` is declared `minimum: 0,
 * maximum: 0` in the Amazon spec, while `DSPCommitmentMultiStatusSuccess.index`
 * allows 0..999. That means the generated `DSPCommitmentMultiStatusResponseSchema`
 * will reject any per-item error entry with `index > 0`, even though the
 * retrieve endpoint accepts up to 1000 IDs. If live API responses show
 * `error[].index > 0`, the fix is a small override here (e.g. replace the
 * ErrorsIndex schema with one allowing 0..1000) or in the post-processor.
 *
 * If the generator's emitted names ever change, only this shim needs to be
 * updated — consumers (service, tools, tests) never reach into the generated
 * module directly.
 */

import { z } from "zod";
import {
  DSPCommitment,
  DSPCommitmentCreate,
  DSPCommitmentUpdate,
  DSPCommitmentSuccessResponse,
  DSPRetrieveCommitmentRequest,
  DSPCreateCommitmentRequest,
  DSPUpdateCommitmentRequest,
  DSPCommitmentMultiStatusSuccess,
  DSPCommitmentMultiStatusResponse,
  DSPRetrieveCampaignForecastRequest,
  DSPCampaignForecastMultiStatusResponse,
  DSPRetrieveCommitmentSpendRequest,
  DSPCommitmentSpendMultiStatusResponse,
  ErrorsIndex,
} from "../../generated/v1/zod.js";
import type { components } from "../../generated/v1/types.js";

type Schemas = components["schemas"];

export type DSPCommitmentT = Schemas["DSPCommitment"];
export type DSPCommitmentCreateT = Schemas["DSPCommitmentCreate"];
export type DSPCommitmentUpdateT = Schemas["DSPCommitmentUpdate"];
export type DSPCommitmentSuccessResponseT = Schemas["DSPCommitmentSuccessResponse"];
export type DSPRetrieveCommitmentRequestT = Schemas["DSPRetrieveCommitmentRequest"];
export type DSPCreateCommitmentRequestT = Schemas["DSPCreateCommitmentRequest"];
export type DSPUpdateCommitmentRequestT = Schemas["DSPUpdateCommitmentRequest"];
export type DSPCommitmentMultiStatusSuccessT = Schemas["DSPCommitmentMultiStatusSuccess"];
export type DSPCommitmentMultiStatusResponseT = Schemas["DSPCommitmentMultiStatusResponse"];
export type DSPRetrieveCampaignForecastRequestT = Schemas["DSPRetrieveCampaignForecastRequest"];
export type DSPCampaignForecastMultiStatusResponseT =
  Schemas["DSPCampaignForecastMultiStatusResponse"];
export type DSPRetrieveCommitmentSpendRequestT = Schemas["DSPRetrieveCommitmentSpendRequest"];
export type DSPCommitmentSpendMultiStatusResponseT =
  Schemas["DSPCommitmentSpendMultiStatusResponse"];
export type ErrorsIndexT = Schemas["ErrorsIndex"];

export const DSPCommitmentSchema = DSPCommitment as z.ZodType<DSPCommitmentT>;
export const DSPCommitmentCreateSchema = DSPCommitmentCreate as z.ZodType<DSPCommitmentCreateT>;
export const DSPCommitmentUpdateSchema = DSPCommitmentUpdate as z.ZodType<DSPCommitmentUpdateT>;
export const DSPCommitmentSuccessResponseSchema =
  DSPCommitmentSuccessResponse as z.ZodType<DSPCommitmentSuccessResponseT>;
export const DSPRetrieveCommitmentRequestSchema =
  DSPRetrieveCommitmentRequest as z.ZodType<DSPRetrieveCommitmentRequestT>;
export const DSPCreateCommitmentRequestSchema =
  DSPCreateCommitmentRequest as z.ZodType<DSPCreateCommitmentRequestT>;
export const DSPUpdateCommitmentRequestSchema =
  DSPUpdateCommitmentRequest as z.ZodType<DSPUpdateCommitmentRequestT>;
export const DSPCommitmentMultiStatusSuccessSchema =
  DSPCommitmentMultiStatusSuccess as z.ZodType<DSPCommitmentMultiStatusSuccessT>;
export const DSPCommitmentMultiStatusResponseSchema =
  DSPCommitmentMultiStatusResponse as z.ZodType<DSPCommitmentMultiStatusResponseT>;
export const DSPRetrieveCampaignForecastRequestSchema =
  DSPRetrieveCampaignForecastRequest as z.ZodType<DSPRetrieveCampaignForecastRequestT>;
export const DSPCampaignForecastMultiStatusResponseSchema =
  DSPCampaignForecastMultiStatusResponse as z.ZodType<DSPCampaignForecastMultiStatusResponseT>;
export const DSPRetrieveCommitmentSpendRequestSchema =
  DSPRetrieveCommitmentSpendRequest as z.ZodType<DSPRetrieveCommitmentSpendRequestT>;
export const DSPCommitmentSpendMultiStatusResponseSchema =
  DSPCommitmentSpendMultiStatusResponse as z.ZodType<DSPCommitmentSpendMultiStatusResponseT>;
export const ErrorsIndexSchema = ErrorsIndex as z.ZodType<ErrorsIndexT>;
