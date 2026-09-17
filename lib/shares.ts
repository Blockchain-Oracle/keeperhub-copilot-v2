import { activityIntegration, activityLabel, activityNetwork } from "@/lib/activity";
import { getChain } from "@/lib/chains";

/*
 * Shareable receipts (decision 37, Abu 2026-09-14). A link shows only public
 * facts: what ran, where, that it executed, its transaction and when, plus a
 * transfer's amount, token and recipient. This whitelist is the one place that
 * decides; the public page and its preview image draw nothing else. Free of the
 * database and React so the tests hold the line.
 */

type LedgerFacts = {
  opId: string;
  state: string;
  txHash: string | null;
  confirmedInputs: Record<string, unknown> | null;
  receipt: Record<string, unknown> | null;
  updatedAt: Date;
};

export type SharedReceiptView = {
  /** The action id, so the page can name it in the visitor's language (activityLabel). */
  opId: string;
  label: string;
  integration: string;
  network: string | null;
  txHash: string;
  verified: boolean | null;
  blockNumber: string | null;
  /** When it executed (ISO). */
  executedAt: string;
  transfer: { amount: string; tokenAddress: string | null; to: string } | null;
};

/** Only something that executed on-chain can be shared. */
export function isShareable(row: Pick<LedgerFacts, "state" | "txHash">): boolean {
  return row.state === "receipt" && typeof row.txHash === "string" && row.txHash !== "";
}

export function sharedReceiptView(row: LedgerFacts): SharedReceiptView | null {
  if (!isShareable(row) || row.txHash === null) return null;
  const inputs = row.confirmedInputs ?? {};
  const first = firstReceipt(row.receipt);
  return {
    opId: row.opId,
    label: activityLabel(row.opId),
    integration: activityIntegration(row.opId),
    network: activityNetwork(inputs) ?? stringOf(first?.chainId) ?? stringOf(row.receipt?.chainId),
    txHash: row.txHash,
    verified: typeof first?.verified === "boolean" ? first.verified : null,
    blockNumber: stringOf(first?.blockNumber) ?? stringOf(row.receipt?.blockNumber),
    executedAt: row.updatedAt.toISOString(),
    transfer: row.opId === "execute_transfer" ? transferOf(inputs) : null,
  };
}

/** The shared page's title and preview line: "Send on Base Sepolia". */
export function sharedReceiptTitle(view: SharedReceiptView): string {
  return view.network === null ? view.label : `${view.label} on ${getChain(view.network).name}`;
}

function transferOf(inputs: Record<string, unknown>): SharedReceiptView["transfer"] {
  const amount = inputs.amount;
  const to = inputs.to_address;
  if (typeof amount !== "string" || typeof to !== "string") return null;
  const token = inputs.token_address;
  return { amount, to, tokenAddress: typeof token === "string" && token !== "" ? token : null };
}

function firstReceipt(receipt: Record<string, unknown> | null): Record<string, unknown> | null {
  const list = receipt?.receipts;
  if (!Array.isArray(list) || list.length === 0) return null;
  const first: unknown = list[0];
  return first !== null && typeof first === "object" ? (first as Record<string, unknown>) : null;
}

function stringOf(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
