import { getChain } from "@/lib/chains";
import { englishTranslate, type Translate, type TranslateValues } from "@/lib/i18n/translate";
import type { StarterCategory, StarterChip } from "@/lib/registry/surface-suggestions";

/*
 * The launcher's cards — the shape of DeepBookie components/chat/chatHome/categories.ts.
 * The cards are ours: the registry-anchored starter prompts (v1
 * lib/registry/surface-suggestions.ts — every one a real, credential-free read),
 * Portaldot's "Ask about you" starters (components/app/app-sidebar.tsx:33-48) as
 * the org wallet and a send-to-yourself, the action catalog, and History.
 * A card whose registry prompt has drifted away drops out instead of lying.
 */

export type MotifKind = "priceCurve" | "wallet" | "approve" | "rate" | "stakeBadge" | "vaultStack" | "catalog" | "receipt";

export interface Category {
  id: string;
  title: string;
  /** Rail-card description (fuller). */
  description: string;
  /** Mobile-tile description (terser). */
  mobileDesc: string;
  /** Sent to the chat on tap (absent on link cards). */
  prompt?: string;
  /** Navigates instead of prompting. */
  href?: string;
  familyLabel: string;
  /** Tailwind background class for the family dot. */
  dot: string;
  motif: MotifKind;
}

type Presentation = Pick<Category, "dot" | "motif"> & {
  /** Where its title and descriptions sit under chat.categories. */
  copy: string;
};

/** How each registry integration with a starter prompt is drawn. */
export const INTEGRATION_CARDS: Record<string, Presentation> = {
  chainlink: { copy: "chainlink", dot: "bg-telemetry", motif: "priceCurve" },
  lido: { copy: "lido", dot: "bg-success", motif: "rate" },
  "rocket-pool": { copy: "rocketPool", dot: "bg-success", motif: "stakeBadge" },
  sky: { copy: "sky", dot: "bg-pending", motif: "vaultStack" },
};

export interface LauncherContext {
  suggestions: StarterCategory[];
  networkName: string;
  /** Native token symbol of the selected network; empty when unknown. */
  symbol: string;
  /** The network selected in the header, so a starter it cannot run says which one can. */
  chainId?: string;
}

/*
 * A starter whose action is not deployed on the selected network names one it is
 * deployed on, so a click reads that network instead of failing. The prompt is
 * the person's own words to the assistant and stays English like the rest of
 * them; the network name is the chain's own (decision 42).
 */
export function starterPrompt(chip: StarterChip, chainId: string | undefined): string {
  if (chip.chains === undefined || chainId === undefined || chip.chains.includes(chainId)) {
    return chip.prompt;
  }
  const named = chip.chains.find((id) => getChain(id).name !== `Chain ${id}`) ?? chip.chains[0];
  if (named === undefined) return chip.prompt;
  const on = ` on ${getChain(named).name}`;
  return chip.prompt.endsWith("?") ? `${chip.prompt.slice(0, -1)}${on}?` : `${chip.prompt}${on}`;
}

/** The first chip the selected network can run, else the first one. */
function pickChip(chips: readonly StarterChip[], chainId: string | undefined): StarterChip | undefined {
  if (chainId === undefined) return chips[0];
  return chips.find((chip) => chip.chains === undefined || chip.chains.includes(chainId)) ?? chips[0];
}

export function launcherCategories(
  { suggestions, networkName, symbol, chainId }: LauncherContext,
  t: Translate = englishTranslate,
): Category[] {
  const words = (copy: string, values?: TranslateValues) => ({
    title: t(`chat.categories.${copy}.title`, values),
    description: t(`chat.categories.${copy}.description`, values),
    mobileDesc: t(`chat.categories.${copy}.mobileDesc`, values),
  });

  const fromRegistry = new Map<string, Category>();
  for (const suggestion of suggestions) {
    const presentation = INTEGRATION_CARDS[suggestion.integration];
    const chip = pickChip(suggestion.chips, chainId);
    if (!presentation || !chip) continue;
    fromRegistry.set(suggestion.integration, {
      id: suggestion.integration,
      ...words(presentation.copy),
      dot: presentation.dot,
      motif: presentation.motif,
      familyLabel: suggestion.label,
      prompt: starterPrompt(chip, chainId),
    });
  }

  const amount = symbol ? `0 ${symbol}` : "0";
  const cards: Array<Category | undefined> = [
    fromRegistry.get("chainlink"),
    {
      id: "org-wallet",
      ...words("orgWallet", { network: networkName }),
      prompt: t("chat.categories.orgWallet.prompt", { network: networkName }),
      familyLabel: t("chat.categories.orgWallet.familyLabel"),
      dot: "bg-primary",
      motif: "wallet",
    },
    {
      id: "send-to-self",
      ...words("sendToSelf"),
      prompt: t("chat.categories.sendToSelf.prompt", { amount, network: networkName }),
      familyLabel: t("chat.categories.sendToSelf.familyLabel"),
      dot: "bg-primary",
      motif: "approve",
    },
    fromRegistry.get("lido"),
    fromRegistry.get("rocket-pool"),
    fromRegistry.get("sky"),
    {
      id: "discover",
      ...words("discover"),
      prompt: t("chat.categories.discover.prompt"),
      familyLabel: t("chat.categories.discover.familyLabel"),
      dot: "bg-fg-muted",
      motif: "catalog",
    },
    {
      id: "history",
      ...words("history"),
      href: "/app/history",
      familyLabel: t("chat.categories.history.familyLabel"),
      dot: "bg-fg-muted",
      motif: "receipt",
    },
  ];
  return cards.filter((card): card is Category => card !== undefined);
}
