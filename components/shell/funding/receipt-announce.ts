/*
 * Masayume features/funding/credited.ts under our moment. Their first credit to
 * an address earns a one-time welcome; ours is an org's first landed receipt.
 * The write card (and recovery, when an earlier write turns out to have landed)
 * announces a receipt; only the first for an org fires the welcome, guarded by
 * the same per-key localStorage flag so an org is welcomed once.
 */

export const RECEIPT_EVENT = "keeperhub:receipt";

export interface ReceiptDetail {
  opId: string;
  txHash: string | null;
  firstTime: boolean;
}

const WELCOMED_KEY = (orgId: string) => `keeperhub.welcomed.${orgId}`;

export function announceReceipt(orgId: string, opId: string, txHash: string | null): void {
  let firstTime = false;
  try {
    firstTime = !localStorage.getItem(WELCOMED_KEY(orgId));
    if (firstTime) localStorage.setItem(WELCOMED_KEY(orgId), "1");
  } catch {
    // storage refused: the card or toast still says it happened
  }
  window.dispatchEvent(new CustomEvent<ReceiptDetail>(RECEIPT_EVENT, { detail: { opId, txHash, firstTime } }));
}
