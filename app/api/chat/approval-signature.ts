import "server-only";

/*
 * Re-sign a confirm-ceremony approval for an EDITED quote (Story 2.5, Task 4,
 * surfaced-decision 1 / D14). AC3 lets a person edit the amount in the card before
 * confirming; the AI SDK's approval signature binds the tool call's INPUT (an HMAC
 * over it, fail-closed on mismatch), so the edited quote needs a FRESH signature
 * that the SDK verifies over the edited input on resume — the guarantee that "the
 * quote a person confirms is the quote that executes" (EXPERIENCE.md:140).
 *
 * This reproduces the AI SDK's signing scheme VERIFIED against the installed
 * `ai@7.0.59` dist (`src/generate-text/tool-approval-signature.ts` +
 * `src/util/canonical-hash.ts`): the signature is
 *   base64url( HMAC-SHA256( secret,
 *     JSON.stringify(["ai-sdk-tool-approval-v1", approvalId, toolCallId, toolName,
 *                     base64url(SHA-256(canonicalJSON(input)))]) ) )
 * where canonicalJSON sorts object keys. Pinned to the `ai-sdk-tool-approval-v1`
 * scheme (ai@7.0.x). A future SDK that changes the scheme fails CLOSED — the edited
 * confirm simply will not execute (never a wrong execution) — and the known-answer
 * test (tests/chat/approval-signature.test.ts) flags the drift immediately.
 *
 * The server only ever re-signs an edited input that (a) matches a real pending
 * approval-requested proposal in the TRUSTED stored transcript and (b) is a
 * same-op amount edit (route.ts validates both before calling this), so re-signing
 * is no more powerful than the person proposing a fresh transfer.
 */
import { canonicalJSON } from "@/lib/canonical-json";

export { canonicalJSON };

const encoder = new TextEncoder();

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashCanonical(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalJSON(value)));
  return toBase64url(new Uint8Array(digest));
}

/**
 * Produce a fresh AI-SDK-compatible approval signature over `input`. Used only for
 * a validated, same-op edited quote at Confirm (route.ts). Never logs the secret.
 */
export async function signToolApproval(params: {
  secret: string;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(params.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const inputDigest = await hashCanonical(params.input);
  const payload = encoder.encode(
    JSON.stringify([
      "ai-sdk-tool-approval-v1",
      params.approvalId,
      params.toolCallId,
      params.toolName,
      inputDigest,
    ]),
  );
  const signature = await crypto.subtle.sign("HMAC", key, payload);
  return toBase64url(new Uint8Array(signature));
}
