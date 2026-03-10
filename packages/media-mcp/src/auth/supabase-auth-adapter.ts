import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

export interface SupabaseAuthAdapterInterface {
  getClient(): ReturnType<typeof createClient>;
  validate(): Promise<void>;
  readonly supabaseUrl: string;
}

export class SupabaseAuthAdapter implements SupabaseAuthAdapterInterface {
  private client: ReturnType<typeof createClient>;
  private validated = false;

  constructor(
    readonly supabaseUrl: string,
    private readonly serviceRoleKey: string
  ) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  getClient(): ReturnType<typeof createClient> {
    return this.client;
  }

  getServiceRoleKey(): string {
    return this.serviceRoleKey;
  }

  async validate(): Promise<void> {
    if (this.validated) return;

    const { error } = await this.client.storage.listBuckets();
    if (error) {
      throw new Error(`Supabase auth validation failed: ${error.message}`);
    }
    this.validated = true;
  }

  static getFingerprint(supabaseUrl: string, serviceRoleKey: string): string {
    return createHash("sha256")
      .update(`${supabaseUrl}:${serviceRoleKey}`)
      .digest("hex")
      .substring(0, 32);
  }
}
