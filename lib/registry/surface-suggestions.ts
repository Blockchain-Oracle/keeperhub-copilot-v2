/*
 * Starter suggestions — the new-conversation discovery surface (Story 1.7, D6).
 *
 * The "surface" family projects the ONE generated registry (AD-3) for two
 * different audiences: surface-tools.ts projects it for the MODEL (the four
 * chat/voice tools); this module projects it for the new-conversation UI (the
 * categorized starter chips a first-time user clicks to learn what KeeperHub
 * can do without knowing any tool or action names — FR9).
 *
 * Categories are NOT hand-labelled: each is derived from the registry's own
 * integration groupings (`integrations[entry.integration].label`), so AC 1
 * ("categories derived from the registry's integration groupings") is true
 * structurally, not just visually. The prompts are CURATED — a real prompt that
 * names a real, credential-free read — but every one is anchored to an opId and
 * validated against the live registry at derive time, so a chip can never drift
 * into fiction: a regen that removes, quarantines, re-classes, or
 * credential-gates a curated op DROPS the chip (loudly, NFR2) and fails the
 * drift guard in tests/registry/surface-suggestions.test.ts. The model
 * re-discovers the action from the prompt at click time, so the opId never
 * crosses the server→client boundary — only the prompt text does.
 *
 * Curation law (D6 §2): every chip is a credential-free READ that cards WITHOUT
 * user-specific input. The set below is permissionless mainnet reads whose only
 * required field is the network (a generic chain the model supplies) — no
 * address, coin, or bound credential. Copy law (EXPERIENCE.md:64-66): sentence
 * case, no em-dashes, no exclamation marks, names a real action, no filler.
 */
import {
  getOperationEntry,
  integrations,
  resolveOperation,
} from "./index.ts";

/** One clickable prompt. The client payload carries the prompt text ONLY — the
 *  model re-discovers the action, so the opId stays server-side. */
export type StarterChip = { prompt: string };

/** A registry-integration group of chips. `label` is the registry-sourced
 *  integration label (never a hardcoded category string). Serializable — it
 *  crosses the server→client boundary as a prop. */
export type StarterCategory = {
  integration: string;
  label: string;
  chips: StarterChip[];
};

/** A curated prompt paired with the real read op it names (the drift anchor). */
type StarterPrompt = { prompt: string; opId: string };

/*
 * The curated set. Ordered: category order follows first appearance here, and
 * chip order within a category follows this list. Every op is a permissionless
 * mainnet read (only a network field, which the model defaults) — so a click
 * cards on the happy path with no credential and no user-specific input.
 *
 * Chosen over the Chronicle oracle reads (also valid reads) because Chronicle's
 * feeds require the caller to be whitelisted ("kissed"), which can revert the
 * read — a poor first impression for a starter chip. Chainlink feeds and the
 * staking/vault reads below are open public reads. (D6 authorizes dev to
 * finalize the exact set against the guaranteed-card criterion; the drift guard
 * enforces every entry stays a real credential-free read.)
 */
export const STARTER_PROMPTS: ReadonlyArray<StarterPrompt> = [
  // Chainlink — price feeds.
  {
    prompt: "What's the latest ETH/USD price on Chainlink?",
    opId: "chainlink/eth-usd-latest-round-data",
  },
  {
    prompt: "What's the latest BTC/USD price on Chainlink?",
    opId: "chainlink/btc-usd-latest-round-data",
  },
  // Lido — liquid staking.
  {
    prompt: "What's one wstETH worth in stETH right now?",
    opId: "lido/steth-per-token",
  },
  {
    prompt: "How much wstETH is in circulation?",
    opId: "lido/get-wsteth-total-supply",
  },
  // Rocket Pool — liquid staking.
  {
    prompt: "What's the current rETH to ETH exchange rate?",
    opId: "rocket-pool/get-exchange-rate",
  },
  {
    prompt: "How much rETH is in circulation?",
    opId: "rocket-pool/total-supply",
  },
  // Sky — savings vault.
  {
    prompt: "How much is deposited in the Sky savings vault?",
    opId: "sky/vault-total-assets",
  },
  {
    prompt: "How many Sky vault shares are outstanding?",
    opId: "sky/vault-total-supply",
  },
];

/**
 * Why a curated prompt was dropped from the surface (NFR2 honesty). A dropped
 * chip is logged with its opId + reason and never renders — never a silent
 * catch.
 */
function validationFailure(opId: string): string | undefined {
  const resolved = resolveOperation(opId);
  if (resolved.status !== "ok") {
    // absent / fingerprint-drift / quarantined-class — the registry already
    // withholds any executable affordance; the chip must go too.
    return resolved.reason;
  }
  const entry = resolved.entry;
  // The exact read predicate surface-tools.ts uses (effectClass === "read",
  // surface-tools.ts:288-291) — writes/ceremony are Epic 2, not chat-executable
  // reads. One definition of "executable read", not a second.
  if (entry.effectClass !== "read") {
    return `non-read:${entry.effectClass}`;
  }
  // A credential-gated read may not card for a new user with no bound
  // credential — exclude so every click cards on the happy path (FR5: reads are
  // never gated, but a gated read still needs a bound credential to succeed).
  if (entry.needsCredential) {
    return "needs-credential";
  }
  // The five workflow-node primitives are never chat-executable.
  if (entry.kind === "system") {
    return "system-primitive";
  }
  return undefined;
}

/**
 * Derive the categorized starter suggestions from the curated prompts, purely.
 *
 * For each curated entry: validate against the live registry; drop-with-honest-
 * log any that fails (NFR2); group survivors by `entry.integration` (the plugin
 * slug — never split from the opId); label each group via the `integrations`
 * map (registry-sourced); preserve first-appearance category order and curated
 * chip order. Returns a serializable payload (no functions, no undefined, no
 * opId) ready to cross the server→client boundary.
 *
 * `prompts` defaults to STARTER_PROMPTS; the parameter exists only so the drop
 * path is testable against the immutable registry (a shipped call site passes
 * nothing).
 */
export function starterSuggestions(
  prompts: ReadonlyArray<StarterPrompt> = STARTER_PROMPTS,
): StarterCategory[] {
  // Insertion order === first-appearance order, so the Map preserves the
  // deterministic category order without a separate sort.
  const byIntegration = new Map<string, StarterCategory>();

  for (const { prompt, opId } of prompts) {
    const reason = validationFailure(opId);
    if (reason !== undefined) {
      console.error(
        JSON.stringify({ event: "starter_suggestion_dropped", opId, reason }),
      );
      continue;
    }

    // Validated ok above, so the entry is present.
    const entry = getOperationEntry(opId)!;
    let category = byIntegration.get(entry.integration);
    if (category === undefined) {
      category = {
        integration: entry.integration,
        // Registry-sourced label — this is what makes categories "derive from
        // the registry's integration groupings" literally (AC 1). Falls back to
        // the key only if the integrations map is ever missing an entry.
        label: integrations[entry.integration]?.label ?? entry.integration,
        chips: [],
      };
      byIntegration.set(entry.integration, category);
    }
    category.chips.push({ prompt });
  }

  return [...byIntegration.values()];
}

/**
 * The memoized suggestions, computed once at module load. The registry is
 * immutable at runtime, so this never needs recomputing per request — the
 * server components import this constant and pass it straight into Conversation.
 */
export const STARTER_SUGGESTIONS: StarterCategory[] = starterSuggestions();
