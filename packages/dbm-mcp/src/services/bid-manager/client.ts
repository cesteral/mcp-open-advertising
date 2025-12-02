/**
 * Google API Client Factory for Bid Manager API v2
 *
 * Creates authenticated client instances using service account credentials.
 * Supports both file path and base64-encoded JSON credentials.
 */

import { google } from "googleapis";
import { readFileSync } from "fs";
import type { AppConfig } from "../../config/index.js";
import type { Logger } from "pino";

// Bid Manager API OAuth scope
const BIDMANAGER_SCOPE = "https://www.googleapis.com/auth/doubleclickbidmanager";

/**
 * Service account credentials structure
 */
export interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/**
 * Parse service account credentials from config
 *
 * Priority:
 * 1. serviceAccountJson (base64 encoded)
 * 2. serviceAccountFile (path to JSON file)
 * 3. null (ADC - Application Default Credentials)
 */
export function parseServiceAccountCredentials(
  config: AppConfig,
  logger: Logger
): ServiceAccountCredentials | null {
  // Priority 1: Base64 encoded JSON
  if (config.serviceAccountJson) {
    try {
      const decoded = Buffer.from(config.serviceAccountJson, "base64").toString("utf-8");
      const credentials = JSON.parse(decoded) as ServiceAccountCredentials;
      logger.debug({ clientEmail: credentials.client_email }, "Parsed service account from base64");
      return credentials;
    } catch (error) {
      logger.error({ error }, "Failed to parse SERVICE_ACCOUNT_JSON");
      throw new Error("Invalid SERVICE_ACCOUNT_JSON: must be valid base64-encoded JSON");
    }
  }

  // Priority 2: File path
  if (config.serviceAccountFile) {
    try {
      const content = readFileSync(config.serviceAccountFile, "utf-8");
      const credentials = JSON.parse(content) as ServiceAccountCredentials;
      logger.debug(
        { clientEmail: credentials.client_email, file: config.serviceAccountFile },
        "Loaded service account from file"
      );
      return credentials;
    } catch (error) {
      logger.error({ error, file: config.serviceAccountFile }, "Failed to load service account file");
      throw new Error(`Invalid SERVICE_ACCOUNT_FILE: ${config.serviceAccountFile}`);
    }
  }

  // Priority 3: Use Application Default Credentials (ADC)
  logger.info("No service account configured, using Application Default Credentials");
  return null;
}

/**
 * GoogleAuth instance type
 */
export type GoogleAuthClient = InstanceType<typeof google.auth.GoogleAuth>;

/**
 * Create authenticated Google Auth client
 */
export function createGoogleAuth(
  credentials: ServiceAccountCredentials | null,
  logger: Logger
): GoogleAuthClient {
  if (credentials) {
    logger.debug("Creating GoogleAuth with service account credentials");
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
      scopes: [BIDMANAGER_SCOPE],
    });
  }

  // Use ADC (Application Default Credentials)
  logger.debug("Creating GoogleAuth with Application Default Credentials");
  return new google.auth.GoogleAuth({
    scopes: [BIDMANAGER_SCOPE],
  });
}

/**
 * Create Bid Manager API client (v2)
 */
export function createBidManagerClient(auth: ReturnType<typeof createGoogleAuth>) {
  return google.doubleclickbidmanager({
    version: "v2",
    auth,
  });
}

/**
 * BidManagerClient type for dependency injection
 */
export type BidManagerClient = ReturnType<typeof createBidManagerClient>;
