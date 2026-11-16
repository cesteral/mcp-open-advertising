// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * {{displayName}} bearer auth strategy (`MCP_AUTH_MODE={{key}}-bearer`).
 *
 * Reads the access token from `Authorization: Bearer <token>` and the account
 * from `X-{{Pascal}}-Account-Id`; both go into the credential fingerprint.
 * Refresh-token headers are not supported yet (`resolveRefreshBranch` returns
 * null); see pinterest-mcp for a strategy that accepts them.
 */

import type { Logger } from "pino";
import { BearerAuthStrategyBase, type BearerAdapterResult } from "@cesteral/shared";
import {
  {{Pascal}}AccessTokenAdapter,
  get{{Pascal}}AccountIdFromHeaders,
  get{{Pascal}}CredentialFingerprint,
  parse{{Pascal}}TokenFromHeaders,
} from "./{{key}}-auth-adapter.js";

export class {{Pascal}}BearerAuthStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "{{key}}-bearer";
  protected readonly platformName = "{{displayName}}";

  constructor(
    private readonly baseUrl: string,
    logger?: Logger
  ) {
    super(logger);
  }

  protected async resolveRefreshBranch(): Promise<BearerAdapterResult | null> {
    return null;
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const token = parse{{Pascal}}TokenFromHeaders(headers);
    const accountId = get{{Pascal}}AccountIdFromHeaders(headers);
    const adapter = new {{Pascal}}AccessTokenAdapter(token, accountId, this.baseUrl);
    await adapter.validate();
    return {
      adapter,
      fingerprint: get{{Pascal}}CredentialFingerprint(token, accountId),
      userId: adapter.userId,
      authFlow: "static-token",
      logContext: { accountId },
    };
  }

  protected getRefreshFingerprint(): string | undefined {
    return undefined;
  }

  protected getTokenFingerprint(headers: Record<string, string | string[] | undefined>): string {
    return get{{Pascal}}CredentialFingerprint(
      parse{{Pascal}}TokenFromHeaders(headers),
      get{{Pascal}}AccountIdFromHeaders(headers)
    );
  }
}
