import { ImageResponse } from "next/og";

import { readSharedReceipt } from "@/lib/data/shares";
import { sharedReceiptTitle, sharedReceiptView } from "@/lib/shares";

/*
 * The preview a shared receipt link unfurls into on X or Slack (decision 37):
 * Portaldot's dark ground and card, the success stamp, the action, where it ran
 * and the start and end of its transaction. A link that is off shows only that.
 */
export const alt = "A receipt shared from KeeperHub Copilot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#f3f1f8";
const MUTED = "#8e8a9c";
const VIOLET = "#8f6bff";
const SUCCESS = "#3fd8b8";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await readSharedReceipt(token).catch(() => null);
  const view = row === null ? null : sharedReceiptView(row);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "#0b0a10",
          color: INK,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, letterSpacing: 6, color: INK }}>
          <div style={{ width: 22, height: 22, background: VIOLET, transform: "rotate(45deg)", borderRadius: 4 }} />
          KEEPERHUB COPILOT
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            padding: 48,
            borderRadius: 28,
            border: "2px solid #2a2735",
            background: "#14121c",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: MUTED }}>SHARED RECEIPT</div>
            <div
              style={{
                display: "flex",
                padding: "8px 20px",
                borderRadius: 10,
                border: `3px solid ${view === null ? MUTED : SUCCESS}`,
                color: view === null ? MUTED : SUCCESS,
                fontSize: 24,
                letterSpacing: 4,
              }}
            >
              {view === null ? "NOT SHARED" : "EXECUTED"}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 60, fontWeight: 700, lineHeight: 1.1 }}>
            {view === null ? "This receipt isn't shared" : sharedReceiptTitle(view)}
          </div>
          {view !== null && (
            <div style={{ display: "flex", fontSize: 30, color: MUTED, fontFamily: "monospace" }}>
              {view.transfer !== null ? `${view.transfer.amount} · ` : ""}tx {view.txHash.slice(0, 10)}…{view.txHash.slice(-8)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", fontSize: 22, color: MUTED }}>Only public on-chain facts. Never the chat.</div>
      </div>
    ),
    size,
  );
}
