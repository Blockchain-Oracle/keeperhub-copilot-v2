/*
 * The chat/voice tool surface (Story 1.4, ratified D1; execute_transfer added
 * 2.5 D25; the automation tools in slice 8, decisions 19–21). The model gets a
 * handful of typed tools — never the 442-op registry
 * as 442 tools (a schema union that size wrecks tool selection and context). One
 * Zod definition per tool is the single source (AD-3) for BOTH projections:
 *   - chat: { name, description, inputSchema }  → wrapped by the AI SDK's tool()
 *   - Realtime: { type:"function", name, description, parameters }  (Epic 4)
 * `parameters` is z.toJSONSchema(inputSchema) — the same Zod source, so chat and
 * voice can never diverge.
 *
 * `search_actions` is OURS: it executes locally against the vendored registry
 * (zero network, zero rate budget) because KeeperHub's own discovery serves the
 * lossy projection AD-3 forbids as a schema source. The other four mirror
 * KeeperHub's execution verbs and route through lib/execution — the SDK never
 * calls KeeperHub directly (AD-4). Renderer selection keys on the opId in
 * part.input.actionType verbatim (no decode). execute_transfer is the simulating
 * value-mover: a native/ERC-20 transfer proposed via the SIMULATING transfer path
 * (AC3 needs simulate; execute_protocol_action web3/transfer-* cannot — D25).
 */
import { z } from "zod";

import { automationDefinitionSchema } from "../automations/build.ts";
import { requestInputSchema } from "../chat/input-request.ts";

import { integrations, listOperationEntries, runsDirectly } from "./index.ts";
import type { EffectClass, FieldSpec, OperationEntry } from "./index.ts";

export const SURFACE_TOOL_NAMES = [
  "search_actions",
  "execute_protocol_action",
  "execute_contract_call",
  "execute_transfer",
  "get_wallet_integration",
  "list_automations",
  "get_automation",
  "create_automation",
  "set_automation_enabled",
  "update_automation",
  "run_automation",
  "delete_automation",
  "get_org_wallet_balances",
  "request_input",
] as const;

export type SurfaceToolName = (typeof SURFACE_TOOL_NAMES)[number];

// --- Input schemas (one Zod def per tool; the single source) -----------------

const searchActionsInput = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Free-text search over the action id, label, description, and integration (e.g. 'eth price', 'aave balance').",
    ),
  integration: z
    .string()
    .optional()
    .describe(
      "Restrict to one integration by key or name (e.g. 'chronicle', 'aave-v3').",
    ),
  effect: z
    .string()
    .optional()
    .describe(
      "Restrict by effect class, e.g. 'read'. Only read actions are executable in this release.",
    ),
});

const executeProtocolActionInput = z.object({
  actionType: z
    .string()
    .describe(
      "The exact action id from search_actions, in 'protocol/action-slug' form (e.g. 'chronicle/eth-usd-read').",
    ),
  params: z
    .record(z.string(), z.unknown())
    .describe(
      "Parameters as key/value pairs, matching the action's field spec from search_actions.",
    ),
  // Card data, NOT a wire parameter (lib/execution strips it before the call).
  // The renderer turns these into switchable pills so the user can correct an
  // ambiguous read in place instead of re-prompting (Story 1.6).
  alternatives: z
    .array(
      z.object({
        actionType: z.string(),
        label: z.string().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional()
    .describe(
      "When a request is genuinely ambiguous between real alternatives (which token, which chain, which route, possibly different actions), run the best interpretation AND list the alternatives you considered here, each with its actionType and prefilled params. Never silently pick one without declaring the others. Omit when there is no real ambiguity.",
    ),
});

const executeContractCallInput = z.object({
  contract_address: z.string().describe("The contract address (0x...)."),
  chain_id: z
    .string()
    .describe("The chain id as a string (e.g. '1' for Ethereum mainnet)."),
  function_name: z
    .string()
    .describe("The Solidity function name (e.g. 'balanceOf')."),
  function_args: z
    .string()
    .optional()
    .describe(
      "A JSON array of arguments encoded as a string (e.g. '[\"0x...\"]').",
    ),
  abi: z
    .string()
    .optional()
    .describe(
      "The contract ABI as a JSON string. Auto-fetched for verified contracts if omitted.",
    ),
  // The tx-path fields (Story 2.3): only meaningful on a state-changing call, and
  // only ever broadcast AFTER the on-screen confirm. Match KeeperHub's
  // execute_contract_call (tools.ts:1287-1294) — all decimal strings, never floats.
  value: z
    .string()
    .optional()
    .describe(
      "For payable functions only: the native value to send, as a decimal string in ether units (e.g. '0.1').",
    ),
  gas_limit_multiplier: z
    .string()
    .optional()
    .describe("Gas limit multiplier as a decimal string (e.g. '1.5' for a 50% buffer)."),
  priority_fee_gwei: z
    .string()
    .optional()
    .describe(
      "Explicit maxPriorityFeePerGas in gwei as a decimal string (e.g. '2'). Omit unless the network requires a tip above the default floor.",
    ),
  // Not a KeeperHub field: the model DECLARES the function's mutability so the
  // gate resolves read-vs-write (resolveMixedEffect). Stripped before the wire
  // call. A view/pure call runs as a read; a nonpayable/payable call runs the
  // confirm ceremony (simulate preview, then confirm, then broadcast) — Story 2.3.
  stateMutability: z
    .enum(["view", "pure", "nonpayable", "payable"])
    .describe(
      "The function's Solidity state mutability. 'view' and 'pure' are reads and run immediately; 'nonpayable' and 'payable' change state and run with an on-screen confirmation step.",
    ),
});

// The simulating value-mover (2.5 D25). Params mirror KeeperHub's execute_transfer
// (references/keeperhub/lib/mcp/tools.ts:1223-1241) — all decimal STRINGS, never
// floats (AD-11). The `amount` is HUMAN units on the wire (KeeperHub parses it
// server-side); the card DISPLAYS decimals-aware and confirms the exact instruction.
const executeTransferInput = z.object({
  chain_id: z
    .string()
    .describe(
      "The chain id as a string (e.g. '1' for Ethereum mainnet, '11155111' for Sepolia).",
    ),
  to_address: z
    .string()
    .describe("The recipient address (0x... on EVM, base58 on Solana)."),
  amount: z
    .string()
    .describe(
      "The amount to send, in HUMAN units as a decimal string (e.g. '0.1'), never a float. Native units (ETH, SOL) for a native transfer; the token's own units for a token transfer.",
    ),
  token_address: z
    .string()
    .optional()
    .describe(
      "The ERC-20 / SPL token contract address. Omit for a native currency transfer (ETH, SOL).",
    ),
});

const getWalletIntegrationInput = z.object({
  integrationId: z.string().describe("The wallet integration id to read."),
});

// Automations from chat (decisions 19–21). The create shape lives beside its
// translation into KeeperHub's workflow graph (lib/automations/build.ts).
const listAutomationsInput = z.object({});

const getAutomationInput = z.object({
  workflowId: z.string().describe("The automation id from list_automations."),
});

const setAutomationEnabledInput = z.object({
  workflowId: z.string().describe("The automation id from list_automations."),
  enabled: z.boolean().describe("true to turn it on, false to turn it off."),
});

// A change is the whole automation as it should be, in the create shape, plus which one.
const updateAutomationInput = automationDefinitionSchema.extend({
  workflowId: z.string().describe("The automation id from list_automations."),
});

const runAutomationInput = z.object({
  workflowId: z.string().describe("The automation id from list_automations."),
});

const deleteAutomationInput = z.object({
  workflowId: z.string().describe("The automation id from list_automations."),
});

// The org wallet's holdings (decision 34).
const getOrgWalletBalancesInput = z.object({
  network: z
    .string()
    .optional()
    .describe("Chain id as a string, e.g. '11155111'. Leave out to list every network the wallet holds something on."),
});

export type SearchActionsInput = z.infer<typeof searchActionsInput>;

// --- Descriptions (teach the discovery-first loop) ---------------------------

const DESCRIPTIONS: Record<SurfaceToolName, string> = {
  search_actions:
    "Discover what KeeperHub can do. Searches the full action catalog locally (no network) by keyword, integration, or effect, and returns matching actions with their exact ids, effect class, and parameter specs. Always call this first to find the exact action id and its required parameters before executing.",
  execute_protocol_action:
    "Execute a KeeperHub protocol action by its exact id from search_actions, passing parameters that match its field spec. Use it to read protocol data (prices, positions, rates) and to propose a protocol write such as a supply, stake, swap or approval. A read runs immediately; a write is shown to the person as a card they confirm on screen before anything happens. Only actions search_actions marks executable run here: for a plain transfer use execute_transfer, and for the org wallet's holdings use get_org_wallet_balances.",
  execute_contract_call:
    "Call a smart contract function directly. Declare the function's stateMutability: a view or pure call is a read and runs immediately; a nonpayable or payable call changes state and is shown to the person to confirm on screen before it runs. Prefer a protocol action from search_actions when one already covers the need.",
  execute_transfer:
    "Send a native currency or ERC-20 token transfer. Pass the chain id, recipient address, and amount in human units, plus the token address for a token transfer (omit it for a native transfer). It simulates first, then is shown to the person as a card they confirm on screen before anything moves. Use this for a plain transfer, because unlike a transfer protocol action it can simulate.",
  get_wallet_integration:
    "Read the details of a wallet integration by its id.",
  list_automations:
    "List this organisation's KeeperHub automations: each one's id, name, how it starts, whether it is live, on demand or off, and its step count. Runs immediately.",
  get_automation:
    "Describe one automation by its id: how it starts, its steps in order, whether it is on, and its recent runs. Runs immediately.",
  create_automation:
    "Propose a new KeeperHub automation: how it starts and a straight line of steps. Look up each step's action id and fields with search_actions first. A condition step continues only when its check is true. Use an earlier step's output as {{@step-N:Label.field}}, where Label is that step's label. The proposal is shown to the person as a card; authorizing saves it switched off, and the card then offers to turn it on after KeeperHub checks it. Never say it is saved, on or running unless a tool result says so.",
  set_automation_enabled:
    "Propose turning an existing automation on or off. Only automations that start on a schedule, every N blocks, on a contract event, on a webhook or on a Tempo payment can be turned on; on demand ones run only when started. Shown to the person as a card with KeeperHub's check and dry run before anything changes.",
  update_automation:
    "Propose changing an existing automation. Read it with get_automation first, then pass its workflowId with the whole automation as it should be afterwards, in the same shape as create_automation, unchanged parts included. Only automations whose steps run in a straight line can be changed here. Shown to the person as a card listing what changes; it keeps its on or off state. Never say it changed unless a tool result says so.",
  run_automation:
    "Propose running an automation once, now, by its id. Shown to the person as a card with KeeperHub's dry run; authorizing starts the run, and every step then runs without stopping again. A run is started, not finished: its card follows it to the result, so never say it succeeded unless a tool result says so.",
  delete_automation:
    "Propose deleting an automation by its id. Shown to the person as a card; authorizing deletes it from KeeperHub together with its run history, and it cannot be undone.",
  get_org_wallet_balances:
    "Read what this organisation's KeeperHub org wallet holds: its native balance and tokens on one network (pass the chain id), or on every network where it holds something (leave network out). Runs immediately. Use it whenever the person asks about their wallet, balance or holdings; you never need to ask for the wallet's address.",
  request_input:
    "Ask the person for details you don't have as a form on their screen: a recipient address, an amount, a network, a token, a choice or short text. Put every missing detail in one form, with a prefill when you have a good guess. The result is their answer: { values } by field key, or { cancelled: true } when they closed it. Never ask for an address in words, and never ask for the org wallet's address: you already know it.",
};

// --- Projections (chat + Realtime, from the same Zod source) ------------------

type SurfaceInputSchema =
  | typeof searchActionsInput
  | typeof executeProtocolActionInput
  | typeof executeContractCallInput
  | typeof executeTransferInput
  | typeof getWalletIntegrationInput
  | typeof listAutomationsInput
  | typeof getAutomationInput
  | typeof automationDefinitionSchema
  | typeof setAutomationEnabledInput
  | typeof updateAutomationInput
  | typeof runAutomationInput
  | typeof deleteAutomationInput
  | typeof getOrgWalletBalancesInput
  | typeof requestInputSchema;

export const INPUT_SCHEMAS: Record<SurfaceToolName, SurfaceInputSchema> = {
  search_actions: searchActionsInput,
  execute_protocol_action: executeProtocolActionInput,
  execute_contract_call: executeContractCallInput,
  execute_transfer: executeTransferInput,
  get_wallet_integration: getWalletIntegrationInput,
  list_automations: listAutomationsInput,
  get_automation: getAutomationInput,
  create_automation: automationDefinitionSchema,
  set_automation_enabled: setAutomationEnabledInput,
  update_automation: updateAutomationInput,
  run_automation: runAutomationInput,
  delete_automation: deleteAutomationInput,
  get_org_wallet_balances: getOrgWalletBalancesInput,
  request_input: requestInputSchema,
};

export type SurfaceChatTool = {
  name: SurfaceToolName;
  description: string;
  inputSchema: SurfaceInputSchema;
};

export type SurfaceRealtimeTool = {
  type: "function";
  name: SurfaceToolName;
  description: string;
  parameters: Record<string, unknown>;
};

/** The chat projection: name + description + the Zod input schema. The route
 *  wraps each with the AI SDK's tool(), adding the execute delegate. */
export const surfaceChatTools: SurfaceChatTool[] = SURFACE_TOOL_NAMES.map(
  (name) => ({ name, description: DESCRIPTIONS[name], inputSchema: INPUT_SCHEMAS[name] }),
);

/** The OpenAI Realtime projection (Epic 4 consumes this unchanged). parameters
 *  is derived from the SAME Zod schema as the chat inputSchema (single source). */
export const surfaceRealtimeTools: SurfaceRealtimeTool[] = SURFACE_TOOL_NAMES.map(
  (name) => ({
    type: "function",
    name,
    description: DESCRIPTIONS[name],
    parameters: withoutSchemaKeyword(z.toJSONSchema(INPUT_SCHEMAS[name]) as Record<string, unknown>),
  }),
);

/* z.toJSONSchema stamps a `$schema` URI; a function tool's parameters are the schema body alone. */
function withoutSchemaKeyword(schema: Record<string, unknown>): Record<string, unknown> {
  const body = { ...schema };
  delete body.$schema;
  return body;
}

// --- search_actions executor (pure, local) -----------------------------------

export const SEARCH_ACTIONS_RESULT_CAP = 12;
const OPTIONS_CAP = 8;

export type FieldSummary = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  /** Enum option values, capped; present only for select-like fields. */
  options?: string[];
  /** Count of enum options beyond the cap — honest, not a silent truncation. */
  moreOptions?: number;
  example?: string;
};

export type SearchActionMatch = {
  opId: string;
  label: string;
  description: string;
  /** Human integration label (falls back to the key). */
  integration: string;
  effectClass: EffectClass;
  /** True only for read actions in this release; false carries a note. */
  executable: boolean;
  needsCredential: boolean;
  requiredFields: FieldSummary[];
  optionalFields: FieldSummary[];
  note?: string;
};

export type SearchActionsResult = {
  matches: SearchActionMatch[];
  totalMatched: number;
  returned: number;
  /** Count beyond the cap — an honest "N more" rather than a silent truncation. */
  more?: number;
  query: SearchActionsInput;
};

// Reads run immediately; the four write classes run through the on-screen confirm
// ceremony (Story 2.3). Only the paid-listing path (x402) is still deferred, to
// Epic 6 — so listing-payment is the one class not runnable from chat here.
// mixed-effect is the aggregate placeholder and never reaches a concrete op.
const CEREMONY_DEFERRED_CLASSES: ReadonlySet<EffectClass> = new Set([
  "listing-payment",
  "mixed-effect",
]);
const NON_EXECUTABLE_NOTE =
  "This action is not available to run from chat in this release.";
// Decision 35: KeeperHub runs every non-protocol plugin step only inside an automation.
export const AUTOMATION_ONLY_NOTE =
  "KeeperHub runs this only as a step inside an automation, not on its own. For a plain transfer use execute_transfer; for an ERC-20 balance or any contract read use execute_contract_call with stateMutability view; for the org wallet's holdings use get_org_wallet_balances; or use it as a step in create_automation.";

/**
 * Local discovery over the vendored registry. Deterministic: same input →
 * same output (stable entry order + a total sort). Never surfaces a system
 * primitive or quarantined op — they carry no executable affordance.
 */
export function searchActions(input: SearchActionsInput): SearchActionsResult {
  const tokens = tokenize(input.query);
  const integrationFilter = input.integration?.trim().toLowerCase();
  const effectFilter = input.effect?.trim().toLowerCase();

  const scored: Array<{ entry: OperationEntry; score: number }> = [];
  for (const entry of listOperationEntries()) {
    // Workflow-node primitives and quarantined ops are not chat-executable ops.
    if (entry.kind === "system" || entry.effectClass === "quarantined") {
      continue;
    }
    if (
      integrationFilter !== undefined &&
      integrationFilter !== "" &&
      !matchesIntegration(entry, integrationFilter)
    ) {
      continue;
    }
    if (
      effectFilter !== undefined &&
      effectFilter !== "" &&
      entry.effectClass.toLowerCase() !== effectFilter
    ) {
      continue;
    }
    if (tokens.length > 0) {
      const haystack =
        `${entry.opId} ${entry.label} ${entry.description} ${entry.integration}`.toLowerCase();
      if (!tokens.every((token) => haystack.includes(token))) {
        continue;
      }
    }
    scored.push({ entry, score: relevance(entry, tokens) });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Number(isExecutable(b.entry)) - Number(isExecutable(a.entry)) ||
      a.entry.opId.localeCompare(b.entry.opId),
  );

  const totalMatched = scored.length;
  const matches = scored
    .slice(0, SEARCH_ACTIONS_RESULT_CAP)
    .map(({ entry }) => toMatch(entry));
  const more =
    totalMatched > matches.length ? totalMatched - matches.length : undefined;

  return {
    matches,
    totalMatched,
    returned: matches.length,
    more,
    query: {
      query: input.query,
      integration: input.integration,
      effect: input.effect,
    },
  };
}

function isExecutable(entry: OperationEntry): boolean {
  // System + quarantined are already excluded before scoring. Reads and the four
  // write classes run — writes through the confirm ceremony (Story 2.3); only the
  // paid-listing path stays deferred (Epic 6) — and only actions KeeperHub runs
  // on their own (decision 35).
  return !CEREMONY_DEFERRED_CLASSES.has(entry.effectClass) && runsDirectly(entry);
}

function toMatch(entry: OperationEntry): SearchActionMatch {
  const executable = isExecutable(entry);
  const note = executable ? undefined : runsDirectly(entry) ? NON_EXECUTABLE_NOTE : AUTOMATION_ONLY_NOTE;
  return {
    opId: entry.opId,
    label: entry.label,
    description: entry.description,
    integration: integrations[entry.integration]?.label ?? entry.integration,
    effectClass: entry.effectClass,
    executable,
    needsCredential: entry.needsCredential,
    requiredFields: entry.fields.filter((f) => f.required).map(summarizeField),
    optionalFields: entry.fields.filter((f) => !f.required).map(summarizeField),
    note,
  };
}

function summarizeField(field: FieldSpec): FieldSummary {
  const allOptions = field.options;
  const options = allOptions?.slice(0, OPTIONS_CAP).map((o) => o.value);
  const moreOptions =
    allOptions !== undefined && allOptions.length > OPTIONS_CAP
      ? allOptions.length - OPTIONS_CAP
      : undefined;
  const example = field.example ?? field.placeholder ?? field.defaultValue;
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    ...(options !== undefined && options.length > 0 ? { options } : {}),
    ...(moreOptions !== undefined ? { moreOptions } : {}),
    ...(example !== undefined ? { example } : {}),
  };
}

function tokenize(query: string | undefined): string[] {
  return (query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function relevance(entry: OperationEntry, tokens: string[]): number {
  if (tokens.length === 0) {
    return 0;
  }
  const hay = `${entry.opId} ${entry.label}`.toLowerCase();
  return tokens.reduce((count, token) => count + (hay.includes(token) ? 1 : 0), 0);
}

function matchesIntegration(entry: OperationEntry, filter: string): boolean {
  const key = entry.integration.toLowerCase();
  const label = (integrations[entry.integration]?.label ?? "").toLowerCase();
  return key.includes(filter) || label.includes(filter);
}
