import type { Logger } from "pino";
import { BearerAuthStrategyBase, type BearerAdapterResult } from "@cesteral/shared";
import { SupabaseAuthAdapter } from "./supabase-auth-adapter.js";
import { mcpConfig } from "../config/index.js";

export class SupabaseBearerAuthStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "supabase-bearer";
  protected readonly platformName = "Supabase";

  constructor(logger?: Logger) {
    super(logger);
  }

  protected async resolveRefreshBranch(
    _headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    return null; // No refresh token flow for Supabase
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const authHeader = this.extractHeader(headers, "authorization");
    if (!authHeader) {
      throw new Error("Missing required Authorization header");
    }
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      throw new Error("Authorization header must use Bearer scheme");
    }
    const token = match[1];

    // Validate the token against the configured Supabase project
    const supabaseUrl = mcpConfig.supabaseUrl;
    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL not configured on server");
    }

    const adapter = new SupabaseAuthAdapter(supabaseUrl, token);
    await adapter.validate();

    return {
      adapter,
      fingerprint: SupabaseAuthAdapter.getFingerprint(supabaseUrl, token),
      userId: "supabase-service",
      authFlow: "service-role-key",
      logContext: {},
    };
  }

  protected getRefreshFingerprint(
    _headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    return undefined;
  }

  protected getTokenFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string {
    const authHeader = this.extractHeader(headers, "authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1] ?? "";
    return SupabaseAuthAdapter.getFingerprint(mcpConfig.supabaseUrl ?? "", token);
  }

  private extractHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    return value;
  }
}
