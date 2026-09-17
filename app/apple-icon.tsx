import { ImageResponse } from "next/og";

import { KeeperHubMark } from "@/components/ui/keeperhub-mark";

/* The home-screen icon. Apple squares it off itself, so no rounding here. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        }}
      >
        <KeeperHubMark height={104} fill="#00ff4f" />
      </div>
    ),
    size,
  );
}
