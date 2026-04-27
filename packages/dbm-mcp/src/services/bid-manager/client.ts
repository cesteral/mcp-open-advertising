// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google API Client Types for Bid Manager API v2
 *
 * Type exports for the Bid Manager API client. The actual client creation
 * is handled by auth-bridge.ts which bridges GoogleAuthAdapter to googleapis.
 */

import { google } from "googleapis";

/**
 * GoogleAuth instance type
 */
export type GoogleAuthClient = InstanceType<typeof google.auth.GoogleAuth>;

/**
 * BidManagerClient type for dependency injection
 */
export type BidManagerClient = ReturnType<typeof google.doubleclickbidmanager>;
