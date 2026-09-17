import { ImageResponse } from "next/og";

import { KeeperHubMark } from "@/components/ui/keeperhub-mark";

/*
 * The tab icon. The app shipped none until now — /favicon.ico 404'd locally and
 * hosted (docs/PLAN.md 12.4). KeeperHub's bracket with the copilot's flight
 * shard, so the tab is family but not mistakable for KeeperHub's own.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0f0c",
          borderRadius: 7,
        }}
      >
        <KeeperHubMark height={22} fill="#00ff4f" />
      </div>
    ),
    size,
  );
}
