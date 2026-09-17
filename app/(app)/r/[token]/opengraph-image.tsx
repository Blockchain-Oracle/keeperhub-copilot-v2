import { ImageResponse } from "next/og";

import { KeeperHubMark } from "@/components/ui/keeperhub-mark";
import { readSharedReceipt } from "@/lib/data/shares";
import { sharedReceiptTitle, sharedReceiptView } from "@/lib/shares";

/*
 * The preview a shared receipt link unfurls into on X or Slack (decision 37):
 * the app's ground and card, the success stamp, the action, where it ran and
 * the start and end of its transaction. A link that is off shows only that.
 *
 * Rendered on the server, so it cannot read the CSS variables. These are the
 * literal values of the tokens in app/globals.css — keep the two in step.
 */
export const alt = "A receipt shared from KeeperHub Copilot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GROUND = "#0a0f0c"; // --background
const CARD = "#121a16"; // --card
const BORDER = "#26332c"; // --border
const INK = "#f2f7f4"; // --foreground
const MUTED = "#69736d"; // --fg-muted
const NEON = "#00ff4f"; // --neon, KeeperHub's mark green
const SUCCESS = "#3af77e"; // --success

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
          background: GROUND,
          color: INK,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, letterSpacing: 6, color: INK }}>
          <KeeperHubMark height={34} fill={NEON} />
          KEEPERHUB COPILOT
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            padding: 48,
            borderRadius: 28,
            border: `2px solid ${BORDER}`,
            background: CARD,
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
