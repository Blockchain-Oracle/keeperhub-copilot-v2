import { getChain } from "@/lib/chains";
import { DEFAULT_LOCALE, getLocale, languageRules } from "@/lib/locale";
import { walletPromptLine, type OrgWallet } from "@/lib/session/org-wallet-prompt";

import { VOICE_POLICY_PROMPT } from "./policy";

/*
 * The voice session's instructions: the voice rules (lib/voice/policy.ts) and,
 * like the chat's instructionsFor (app/api/chat/route.ts), the network the app
 * header has selected, the person's org wallet (decision 34), so "my wallet"
 * never needs saying aloud, and the language they picked (decisions 38–40).
 * The language section follows OpenAI's voice prompting guide: pin it, keep
 * every spoken line in it, and never switch because of an accent or a name.
 */
export function voiceInstructions(chainId: string, wallet: OrgWallet | null = null, locale: string = DEFAULT_LOCALE): string {
  const chain = getChain(chainId);
  const language = getLocale(locale).english;
  return [
    VOICE_POLICY_PROMPT,
    "",
    "# Network",
    `- The network selected in the app header is ${chain.name} (chain id ${chain.id}). When a request does not name a network, use this one.`,
    "",
    "# Org wallet",
    `- ${walletPromptLine(wallet)}`,
    "",
    "# Language",
    ...languageRules(locale).map((rule) => `- ${rule}`),
    `- Keep short lines such as "Checking that now", what you say around tools and every answer in ${language}.`,
    `- Do not switch language because of the person's accent, a name, or a few words in another language. If they ask for another language, tell them in ${language} that they can change it in the account menu.`,
    "- Say amounts as numbers, and keep token symbols and network names as they are.",
  ].join("\n");
}
