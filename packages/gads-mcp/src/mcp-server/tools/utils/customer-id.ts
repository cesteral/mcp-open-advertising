// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * The one `customerId` input every gads tool takes (gads #17). Google Ads
 * puts the customer id in the URL path (`customers/{customerId}/…`) and in
 * GAQL resource names; the UI's dashed form (`123-456-7890`) is refused here
 * instead of reaching the path. Digits only, as v25 Discovery's
 * `customerId` path parameters and resource-name patterns use it.
 */
export const CustomerIdSchema = z
  .string()
  .regex(/^\d+$/, "Customer ID must contain only digits (no dashes)")
  .describe("Google Ads customer ID (no dashes)");
