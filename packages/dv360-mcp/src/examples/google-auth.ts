import { google, Auth, oauth2_v2 } from "googleapis";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager"; // Import Secret Manager client

// Define the necessary scopes for DV360 API access
const SCOPES = ["https://www.googleapis.com/auth/display-video"];

// Service account auth client (used for dev/testing OR for accessing Secret Manager itself)
let serviceAccountAuth: Auth.GoogleAuth | null = null;
// OAuth2 client (used for token validation if needed, and potentially refresh logic later)
let oauth2Client: Auth.OAuth2Client | null = null;

// Add caching for token validation results to reduce API calls
const tokenCache = new Map<
  string,
  {
    info: oauth2_v2.Schema$Tokeninfo;
    expires: number;
  }
>();

// Add a flag to track initialization attempts to avoid redundant error messages
let serviceAccountInitAttempted = false;

// Helper function to fetch credentials from Secret Manager
async function getCredentialsFromSecretManager(): Promise<any> {
  const secretName = process.env.SERVICE_ACCOUNT_SECRET_ID;
  if (!secretName) {
    throw new Error("SERVICE_ACCOUNT_SECRET_ID environment variable is not set.");
  }

  console.log(`Fetching credentials from Secret Manager: ${secretName}`);
  const client = new SecretManagerServiceClient();

  try {
    const [version] = await client.accessSecretVersion({
      name: secretName,
    });

    const payload = version.payload?.data?.toString();
    if (!payload) {
      throw new Error(`Secret payload is empty for ${secretName}`);
    }

    console.log("Successfully fetched credentials from Secret Manager.");
    return JSON.parse(payload);
  } catch (error) {
    console.error(`Failed to access secret version ${secretName}:`, error);
    throw error; // Re-throw the error to be caught by initializeAuth
  }
}

export async function initializeServiceAccountAuth(): Promise<Auth.GoogleAuth> {
  if (serviceAccountAuth) {
    // Return cached instance if already initialized
    return serviceAccountAuth;
  }

  // Prevent repeated failed attempts within the same process lifetime
  if (serviceAccountInitAttempted) {
    throw new Error("Service Account Auth (ADC) initialization previously failed");
  }
  serviceAccountInitAttempted = true; // Mark that we are attempting initialization

  // This function should only be called in non-production environments
  // as per the logic in getDv360AuthClient. Add a check just in case.
  if (process.env.NODE_ENV === "production") {
    console.error("CRITICAL: initializeServiceAccountAuth should not be called in production!");
    throw new Error("Authentication misconfiguration: Trying to use SA init in production.");
  }

  console.log("Initializing Service Account Auth via Application Default Credentials (ADC)...");

  try {
    // Initialize GoogleAuth without explicit credentials.
    // It will automatically find and use ADC (which should be configured for impersonation).
    const auth = new google.auth.GoogleAuth({
      // REMOVED: No 'credentials' field needed when using ADC
      scopes: SCOPES, // Still specify the required scopes
    });

    // Attempt to get an authenticated client to immediately verify ADC setup and permissions.
    // This will throw an error if ADC isn't configured or impersonation fails.
    await auth.getClient();

    console.log("Service Account Auth (ADC) initialized successfully.");
    serviceAccountAuth = auth; // Cache the successfully initialized auth object
    return serviceAccountAuth;
  } catch (error) {
    console.error("Failed to initialize Service Account Auth via ADC:", error);
    // Provide guidance specific to ADC impersonation issues
    console.error(
      "Ensure ADC is configured correctly (run `gcloud auth application-default login --impersonate-service-account=TARGET_SA_EMAIL`)" +
        " and your user has the 'Service Account Token Creator' role on the target SA."
    );
    // Re-throw the error to indicate failure
    throw error;
  }
}

// --- OAuth Client Initialization (primarily for production token handling) ---
// You'll need your OAuth Client ID and Secret, potentially from env vars or secrets
function getOAuth2Client(): Auth.OAuth2Client {
  if (oauth2Client) {
    return oauth2Client;
  }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  // --- Enhanced Check ---
  const isProduction = process.env.NODE_ENV === "production";
  if (!clientId || !clientSecret || !redirectUri) {
    const message = "OAuth Client ID, Secret, or Redirect URI is missing in environment variables.";
    if (isProduction) {
      console.error(`CRITICAL: ${message} Required for production.`);
      // Throw an error in production to prevent startup with invalid config
      throw new Error(`Server configuration error: ${message}`);
    } else {
      // Warning is acceptable in development if OAuth isn't being used
      console.warn(`WARNING: ${message} OAuth features may not work.`);
    }
  }
  // --- End Enhanced Check ---

  // Initialize only if config is present (or if not in production)
  oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  console.log("OAuth2Client initialized.");
  return oauth2Client;
}

// --- Get DV360 Client (Handles switching logic) ---

/**
 * Gets an authenticated DV360 API client.
 * In production, requires a valid `accessToken` obtained via OAuth.
 * In development/testing, uses the service account credentials from Secret Manager.
 * @param accessToken Optional OAuth access token (required in production).
 */
export async function getDv360AuthClient(
  accessToken?: string
): Promise<Auth.OAuth2Client | Auth.GoogleAuth> {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    if (!accessToken) {
      throw new Error("Access token is required in production environment.");
    }
    console.log("Getting OAuth2 client for DV360.");
    const client = getOAuth2Client();
    client.setCredentials({ access_token: accessToken });
    // Return the configured OAuth2 client
    return client;
  } else {
    // Development/Testing: Use Service Account
    console.log("Getting Service Account client for DV360.");
    const auth = await initializeServiceAccountAuth();
    // Return the initialized Service Account auth object
    return auth;
  }
}

// Optimize token validation with caching
export async function validateAccessToken(
  accessToken: string
): Promise<oauth2_v2.Schema$Tokeninfo> {
  // Check cache first
  const cached = tokenCache.get(accessToken);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return cached.info;
  }

  try {
    const oauth2Api = google.oauth2("v2");
    const tokenInfo = await oauth2Api.tokeninfo({ access_token: accessToken });

    if (!tokenInfo.data || !tokenInfo.data.expires_in) {
      throw new Error("Token has expired or is invalid");
    }

    const expiryTime =
      typeof tokenInfo.data.expires_in === "string"
        ? parseInt(tokenInfo.data.expires_in, 10)
        : Number(tokenInfo.data.expires_in);

    if (expiryTime <= 0) {
      throw new Error("Token has expired or is invalid");
    }

    // Audience check (unchanged)
    const expectedAudience = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (process.env.NODE_ENV === "production") {
      if (!expectedAudience) {
        console.error("CRITICAL: GOOGLE_OAUTH_CLIENT_ID is not set. Cannot verify token audience.");
        throw new Error("Server configuration error prevents token validation.");
      }
      const tokenAudience = tokenInfo.data.audience || (tokenInfo.data as any).aud;
      if (tokenAudience !== expectedAudience) {
        console.warn(
          `Token audience mismatch. Expected: ${expectedAudience}, Got: ${tokenAudience}`
        );
        throw new Error("Token audience mismatch.");
      }
    }

    // Cache the result (for 90% of the token's remaining lifetime)
    const cacheTime = now + expiryTime * 900; // 90% of expiry time in ms
    tokenCache.set(accessToken, {
      info: tokenInfo.data,
      expires: cacheTime,
    });

    console.log(`Token validated successfully for user: ${tokenInfo.data.email}`);
    return tokenInfo.data;
  } catch (error: any) {
    // Error handling (unchanged)
    console.error("Access token validation failed:", error.message);
    if (
      error.message.includes("audience mismatch") ||
      error.message.includes("Token has expired")
    ) {
      throw new Error(`Invalid access token: ${error.message}`);
    } else if (error.message.includes("Server configuration error")) {
      throw error;
    }
    throw new Error("Invalid access token.");
  }
}

// In your type declarations file or at the top of the appropriate file
declare global {
  namespace Express {
    interface Request {
      userAccessToken?: string;
    }
  }
}
