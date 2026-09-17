import { getVoiceConfig } from "@/lib/config";
import { getLocale, readLocaleCookieValue, resolveLocale } from "@/lib/locale";
import { readNetworkFromCookieHeader } from "@/lib/network";
import { surfaceRealtimeTools, type SurfaceRealtimeTool } from "@/lib/registry/surface-tools";
import { orgWallet } from "@/lib/session/org-wallet";
import { voiceInstructions } from "@/lib/voice/instructions";

import { errorResponse, gateSession } from "../../automations/_shared/gate";
import { liveConversation, logLine, readJson } from "../_shared/voice";

/*
 * Starting voice in a conversation (slice 9). The browser never holds our
 * OpenAI key: this mints a short-lived realtime key (POST
 * /v1/realtime/client_secrets, FINDINGS "Voice") for a live conversation of
 * this org, and hands back what the browser's session needs: the model, the
 * voice rules with the selected network, the twelve tools (the same Zod source
 * as chat) and the session length (decision 29). The browser sends instructions
 * and tools itself on connect, so nothing here is trusted later: every tool call
 * comes back through /api/voice/tool.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
// Long enough to connect; the key's expiry only stops new sessions starting.
const KEY_SECONDS = 120;
const MINT_TIMEOUT_MS = 15_000;

export type VoiceSessionResponse = {
  value: string;
  expiresAt: number | null;
  model: string;
  voice: string | null;
  instructions: string;
  tools: SurfaceRealtimeTool[];
  sessionSeconds: number;
  /** The picked language's ISO-639-1 code, so the on-screen transcript hears it (decisions 38–40). */
  transcriptionLanguage: string;
};

export async function POST(request: Request): Promise<Response> {
  const gate = await gateSession("voice_session_error");
  if (!gate.ok) return gate.response;
  const { session, requestId } = gate;
  const body = await readJson(request);
  const live = await liveConversation(session, body.conversationId, requestId);
  if (!live.ok) return live.response;

  let config;
  try {
    config = getVoiceConfig();
  } catch (error) {
    console.error(logLine("voice_config_error", { requestId, orgId: session.orgId, error }));
    return errorResponse(500, "server_error", "Voice is not configured yet.");
  }

  const wallet = await orgWallet(session).catch(() => null);
  const cookie = request.headers.get("cookie");
  const locale = getLocale(resolveLocale(readLocaleCookieValue(cookie), request.headers.get("accept-language")));
  const instructions = voiceInstructions(readNetworkFromCookieHeader(cookie), wallet, locale.code);
  let minted: { value?: unknown; expires_at?: unknown };
  try {
    const response = await fetch(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: KEY_SECONDS },
        session: {
          type: "realtime",
          model: config.realtimeModel,
          instructions,
          ...(config.realtimeVoice !== null ? { audio: { output: { voice: config.realtimeVoice } } } : {}),
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(logLine("voice_key_refused", { requestId, orgId: session.orgId, status: response.status }));
      return errorResponse(502, "upstream_error", "Voice couldn't start just now. Try again in a moment.");
    }
    minted = (await response.json()) as { value?: unknown; expires_at?: unknown };
  } catch (error) {
    console.error(logLine("voice_key_failed", { requestId, orgId: session.orgId, error }));
    return errorResponse(502, "upstream_error", "Voice couldn't start just now. Try again in a moment.");
  }
  if (typeof minted.value !== "string" || minted.value === "") {
    console.error(logLine("voice_key_missing", { requestId, orgId: session.orgId }));
    return errorResponse(502, "upstream_error", "Voice couldn't start just now. Try again in a moment.");
  }

  const payload: VoiceSessionResponse = {
    value: minted.value,
    expiresAt: typeof minted.expires_at === "number" ? minted.expires_at : null,
    model: config.realtimeModel,
    voice: config.realtimeVoice,
    instructions,
    tools: surfaceRealtimeTools,
    sessionSeconds: config.sessionSeconds,
    transcriptionLanguage: locale.speech,
  };
  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
