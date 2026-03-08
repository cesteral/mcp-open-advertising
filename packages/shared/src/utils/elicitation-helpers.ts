/**
 * elicitation-helpers — shared MCP elicitation patterns.
 *
 * Provides helpers for user-confirmation flows via MCP elicitInput().
 */

/** Minimal duck-typed interface for sdkContext — avoids importing from MCP SDK. */
interface ElicitContext {
  elicitInput?: (opts: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Elicit user confirmation before archiving entities.
 *
 * Returns `true` if the user confirmed, `false` if they declined or if
 * elicitation is not supported (sdkContext.elicitInput is absent).
 *
 * When elicitation is absent (e.g., stdio transport), defaults to `true`
 * so that non-interactive sessions are not blocked.
 */
export async function elicitArchiveConfirmation(
  count: number,
  entityLabel: string,
  sdkContext?: ElicitContext
): Promise<boolean> {
  // No elicitation available (e.g. stdio mode) — allow the operation to proceed.
  if (!sdkContext?.elicitInput) return true;

  const result = (await sdkContext.elicitInput({
    message: `You are about to archive ${count} ${entityLabel}(s). This action is irreversible — archived entities cannot be reactivated. Proceed?`,
    requestedSchema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          title: "Confirm archive",
          description: `Archive ${count} ${entityLabel}(s) permanently`,
          default: false,
        },
      },
    },
  })) as { action: string; content?: Record<string, unknown> };

  return result.action === "accept" && result.content?.confirm === true;
}
