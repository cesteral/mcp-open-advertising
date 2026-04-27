// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  TtdDirectTokenAuthAdapter,
  parseTtdDirectTokenFromHeaders,
  getTtdDirectTokenFingerprint,
} from "./ttd-auth-adapter.js";

export class TtdTokenAuthStrategy implements AuthStrategy {
  constructor(private readonly logger?: Logger) {}

  async verify(headers: Record<string, string | string[] | undefined>): Promise<AuthResult> {
    const credentials = parseTtdDirectTokenFromHeaders(headers);
    const adapter = new TtdDirectTokenAuthAdapter(credentials.token);
    await adapter.validate();

    this.logger?.debug("TTD direct API token accepted");

    return {
      authInfo: {
        clientId: "ttd-direct-token",
        authType: "ttd-token",
      },
      platformAuthAdapter: adapter,
      credentialFingerprint: getTtdDirectTokenFingerprint(credentials),
    };
  }

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    const credentials = parseTtdDirectTokenFromHeaders(headers);
    return getTtdDirectTokenFingerprint(credentials);
  }
}
