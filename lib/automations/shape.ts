import type { OutcomeTone } from "@/lib/activity";

/*
 * KeeperHub workflows as the Automations pages show them, free of React and
 * the network so it runs under node tests and in the browser. Shapes follow the
 * KeeperHub fork at 946eeb5c9: workflow rows (lib/db/schema.ts:470-549), the
 * trigger node's config.triggerType (lib/workflow/store.ts:47-58), execution
 * rows (schema.ts:683-832) and get_execution's status payload
 * (lib/mcp/tools.ts:1223-1300). Anything malformed is skipped, never guessed.
 */

export type AutomationStep = {
  id: string;
  label: string;
  actionType: string | null;
  network: string | null;
  enabled: boolean;
};

export type AutomationSummary = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  deactivated: boolean;
  triggerType: string | null;
  stepCount: number;
  networks: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type AutomationDetail = AutomationSummary & { steps: AutomationStep[] };

export type AutomationRun = {
  id: string;
  status: string;
  triggerSource: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  transactionHashes: Array<{ hash: string; network: string | null; nodeName: string | null }>;
  error: string | null;
};

export type AutomationFact = { label: string; value: string };

/** The automation a change acts on, as its card shows it: its name, how it starts, whether it is on, and its steps. */
export type AutomationSubject = {
  id: string;
  name: string;
  triggerType: string | null;
  status: AutomationStatus;
  steps: AutomationStep[];
};

/*
 * What an automation change card shows before Authorize (decisions 19, 21):
 * facts read from KeeperHub, warnings that need a tick, blockers that keep
 * Authorize off, the existing automation it acts on, and for a change what
 * would change.
 */
export type AutomationPreview = {
  facts: AutomationFact[];
  warnings: string[];
  blockers: string[];
  subject?: AutomationSubject;
  changes?: string[];
};

/** A saved, changed, switched, started or deleted automation, as its card's receipt carries it. A run carries the ledger row its card follows. */
export type AutomationReceipt = {
  workflowId: string;
  name: string;
  enabled: boolean;
  triggerType: string | null;
  ledgerId?: string;
  executionId?: string;
  deleted?: boolean;
};

type WorkflowNode = {
  id: string;
  type: string | null;
  label: string | null;
  actionType: string | null;
  config: Record<string, unknown>;
  enabled: boolean;
};

function readNodes(nodes: unknown): WorkflowNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string") return [];
    const data = isRecord(raw.data) ? raw.data : {};
    const config = isRecord(data.config) ? data.config : {};
    return [
      {
        id: raw.id,
        type: str(data.type),
        label: str(data.label),
        actionType: str(data.actionType) ?? str(config.actionType),
        config,
        enabled: data.enabled !== false,
      },
    ];
  });
}

/** The trigger node's type, with KeeperHub's legacy "Scheduled" spelling normalised. */
export function triggerTypeOf(nodes: unknown): string | null {
  const raw = readNodes(nodes).find((node) => node.type === "trigger")?.config.triggerType;
  if (typeof raw !== "string" || raw === "") return null;
  return raw === "Scheduled" ? "Schedule" : raw;
}

/** The action steps in the order the edges run them from the trigger; any step no edge reaches comes last. */
export function orderedSteps(nodes: unknown, edges: unknown): AutomationStep[] {
  const all = readNodes(nodes);
  const actions = all.filter((node) => node.type !== "trigger" && node.type !== "add");
  const byId = new Map(actions.map((node) => [node.id, node]));
  const next = new Map<string, string[]>();
  if (Array.isArray(edges)) {
    for (const edge of edges) {
      if (isRecord(edge) && typeof edge.source === "string" && typeof edge.target === "string") {
        next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target]);
      }
    }
  }
  const ordered: WorkflowNode[] = [];
  const seen = new Set<string>();
  const queue = all.filter((node) => node.type === "trigger").map((node) => node.id);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const target of next.get(id) ?? []) {
      if (seen.has(target)) continue;
      seen.add(target);
      const node = byId.get(target);
      if (node !== undefined) ordered.push(node);
      queue.push(target);
    }
  }
  for (const node of actions) if (!seen.has(node.id)) ordered.push(node);
  return ordered.map((node) => ({
    id: node.id,
    label: node.label ?? node.actionType ?? "Step",
    actionType: node.actionType,
    network: networkOf(node.config),
    enabled: node.enabled,
  }));
}

export function toAutomationDetail(row: unknown): AutomationDetail | null {
  if (!isRecord(row) || typeof row.id !== "string") return null;
  const steps = orderedSteps(row.nodes, row.edges);
  return {
    id: row.id,
    name: str(row.name) ?? "Untitled automation",
    description: str(row.description),
    enabled: row.enabled === true,
    deactivated: str(row.deactivatedAt) !== null,
    triggerType: triggerTypeOf(row.nodes),
    stepCount: steps.length,
    networks: [...new Set(steps.flatMap((step) => (step.network !== null ? [step.network] : [])))],
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
    steps,
  };
}

export function toAutomationSummary(row: unknown): AutomationSummary | null {
  const detail = toAutomationDetail(row);
  if (detail === null) return null;
  const summary: AutomationSummary & { steps?: AutomationStep[] } = { ...detail };
  delete summary.steps;
  return summary;
}

export type AutomationStatus = "live" | "manual" | "off" | "deactivated";

/*
 * KeeperHub's switch only matters for triggers that fire on their own
 * (store.ts:25-39): a manual automation is run on demand whatever `enabled`
 * says, and a deactivated one cannot run at all.
 */
export function automationStatus(automation: Pick<AutomationSummary, "enabled" | "deactivated" | "triggerType">): AutomationStatus {
  if (automation.deactivated) return "deactivated";
  if (automation.triggerType === null || automation.triggerType === "Manual") return "manual";
  return automation.enabled ? "live" : "off";
}

export type AutomationFilter = "all" | "live" | "manual" | "off";
export type AutomationSort = "updated" | "name";

export function filterAutomations<T extends AutomationSummary>(list: readonly T[], filter: AutomationFilter): T[] {
  if (filter === "all") return [...list];
  return list.filter((automation) => {
    const status = automationStatus(automation);
    return filter === "off" ? status === "off" || status === "deactivated" : status === filter;
  });
}

export function sortAutomations<T extends AutomationSummary>(list: readonly T[], sort: AutomationSort): T[] {
  return [...list].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
}

export function toAutomationRun(row: unknown): AutomationRun | null {
  if (!isRecord(row) || typeof row.id !== "string") return null;
  const hashes = Array.isArray(row.transactionHashes) ? row.transactionHashes : [];
  const duration = typeof row.duration === "number" ? row.duration : typeof row.duration === "string" ? Number(row.duration) : NaN;
  return {
    id: row.id,
    status: str(row.status) ?? "unknown",
    triggerSource: str(row.triggerSource),
    startedAt: str(row.startedAt),
    completedAt: str(row.completedAt),
    durationMs: Number.isFinite(duration) ? duration : null,
    transactionHashes: hashes.flatMap((entry) =>
      isRecord(entry) && typeof entry.hash === "string"
        ? [{ hash: entry.hash, network: networkOf(entry), nodeName: str(entry.nodeName) }]
        : [],
    ),
    error: str(row.error),
  };
}

export type RunOutcome = "pending" | "receipt" | "failure";

/** An execution status as a ledger outcome: success lands a receipt; any other terminal status is a failure. */
export function runOutcome(status: string): RunOutcome {
  switch (status) {
    case "success":
      return "receipt";
    case "error":
    case "system_error":
    case "cancelled":
    case "skipped":
    case "phantom":
      return "failure";
    default:
      return "pending";
  }
}

export function runLabel(status: string): { label: string; tone: OutcomeTone } {
  switch (status) {
    case "success":
      return { label: "Executed", tone: "success" };
    case "error":
    case "system_error":
    case "phantom":
      return { label: "Failed", tone: "destructive" };
    case "cancelled":
      return { label: "Cancelled", tone: "muted" };
    case "skipped":
      return { label: "Skipped", tone: "muted" };
    default:
      return { label: "Running", tone: "pending" };
  }
}

/** get_execution's answer: its status, the outcome that status means, and the first transaction hash. */
export function readSettledRun(data: unknown): { outcome: RunOutcome; status: string | null; txHash: string | null } {
  const record = isRecord(data) ? data : {};
  const payload = isRecord(record.status) ? record.status : record;
  const status = str(payload.status);
  const hashes = Array.isArray(payload.transactionHashes) ? payload.transactionHashes : [];
  const first = hashes.find((entry): entry is { hash: string } => isRecord(entry) && typeof entry.hash === "string");
  return { outcome: status === null ? "pending" : runOutcome(status), status, txHash: first?.hash ?? null };
}

function networkOf(config: Record<string, unknown>): string | null {
  const network = str(config.network);
  if (network !== null) return network;
  const chainId = config.chainId;
  return typeof chainId === "number" || (typeof chainId === "string" && chainId !== "") ? String(chainId) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
