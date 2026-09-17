import "server-only";

/*
 * insufficient_scope detection (AC 4), built now for 1.4+ to consume. On this
 * platform an under-scoped write tool call returns a SUCCESSFUL JSON-RPC
 * response with isError:true whose content[0].text is JSON carrying
 * error === "insufficient_scope". Checking isError alone is NOT sufficient —
 * other tool errors share it — so we parse the text and match on `error`.
 * [Source: references/keeperhub lib/mcp/tools.ts:30-57]
 */
export type InsufficientScope = {
  requiredScope: string;
  grantedScope: string;
  /** Relative path (e.g. /settings/mcp/reauthorize?…); prefix issuer if linked. */
  upgradeUrl: string;
  hint: string;
};

export function parseInsufficientScope(result: unknown): InsufficientScope | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const envelope = result as { isError?: unknown; content?: unknown };
  if (envelope.isError !== true || !Array.isArray(envelope.content)) {
    return null;
  }
  const first = envelope.content[0] as { text?: unknown } | undefined;
  if (typeof first?.text !== "string") {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(first.text);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  if (body.error !== "insufficient_scope") {
    return null;
  }

  const asString = (value: unknown): string =>
    typeof value === "string" ? value : "";
  return {
    requiredScope: asString(body.required_scope),
    grantedScope: asString(body.granted_scope),
    upgradeUrl: asString(body.upgrade_url),
    hint: asString(body.hint),
  };
}
