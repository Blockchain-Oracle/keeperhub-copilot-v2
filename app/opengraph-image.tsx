import { ImageResponse } from "next/og";

import { KeeperHubMark } from "@/components/ui/keeperhub-mark";

/*
 * What a link to the copilot unfurls into. The app had no root OG card at all —
 * only the shared-receipt one. Rendered on the server, so the colours are the
 * literal values of the tokens in app/globals.css; keep the two in step.
 */
export const alt = "KeeperHub Copilot — everything KeeperHub does, just ask";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GROUND = "#0a0f0c";
const CARD = "#121a16";
const BORDER = "#26332c";
const INK = "#f2f7f4";
const MUTED = "#69736d";
const NEON = "#00ff4f";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: GROUND,
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <KeeperHubMark height={40} fill={NEON} />
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: INK }}>
            KEEPERHUB COPILOT
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 76, lineHeight: 1.05, letterSpacing: -2 }}>
            Everything KeeperHub does.
          </div>
          <div style={{ display: "flex", fontSize: 76, lineHeight: 1.05, letterSpacing: -2, color: NEON }}>
            Just ask.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "20px 28px",
            border: `2px solid ${BORDER}`,
            background: CARD,
            borderRadius: 16,
            fontSize: 24,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: NEON }} />
          442 actions · 34 integrations · 24 networks
        </div>
      </div>
    ),
    size,
  );
}
