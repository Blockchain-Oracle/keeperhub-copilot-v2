"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { MotifKind } from "./categories";

/*
 * DeepBookie components/chat/chatHome/tileIcons.tsx — the 30px tinted glyph on a
 * mobile tile. Same paths, keyed by our motifs; tints are Portaldot tokens.
 */
export function TileIcon({ kind }: { kind: MotifKind }) {
  const { tone, path } = ICONS[kind];
  return (
    <span className={cn("flex size-[30px] flex-none items-center justify-center rounded-[9px]", tone)}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {path}
      </svg>
    </span>
  );
}

const ICONS: Record<MotifKind, { tone: string; path: ReactNode }> = {
  priceCurve: {
    tone: "bg-telemetry-soft text-telemetry",
    path: (
      <>
        <path d="M3 16l5-6 4 3 6-8" />
        <path d="M14 5h4v4" />
      </>
    ),
  },
  wallet: {
    tone: "bg-accent-soft text-primary",
    path: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2.5" />
        <path d="M16 12.5h2" />
      </>
    ),
  },
  approve: {
    tone: "bg-accent-soft text-primary",
    path: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3.5" />
        <path d="M8.5 12l2.5 2.5 5-5" />
      </>
    ),
  },
  rate: {
    tone: "bg-telemetry-soft text-telemetry",
    path: (
      <>
        <path d="M16 3l4 4-4 4" />
        <path d="M20 7H5" />
        <path d="M8 21l-4-4 4-4" />
        <path d="M4 17h15" />
      </>
    ),
  },
  stakeBadge: {
    tone: "bg-success/12 text-success",
    path: <path d="M12 3l5.5 9-5.5 9-5.5-9z" fill="currentColor" stroke="none" />,
  },
  vaultStack: {
    tone: "bg-pending/12 text-pending",
    path: (
      <>
        <ellipse cx="12" cy="6.5" rx="7" ry="3" />
        <path d="M5 6.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        <path d="M5 12.5v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" />
      </>
    ),
  },
  catalog: {
    tone: "bg-surface-2 text-fg-secondary",
    path: (
      <g fill="currentColor" stroke="none">
        <rect x="3" y="5.5" width="13" height="3" rx="1.5" />
        <rect x="3" y="10.5" width="18" height="3" rx="1.5" />
        <rect x="3" y="15.5" width="9" height="3" rx="1.5" />
      </g>
    ),
  },
  receipt: {
    tone: "bg-surface-2 text-fg-secondary",
    path: (
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3 8.5" />
        <path d="M3 4v4.5h4.5" />
        <path d="M12 8v4.2l3 1.8" />
      </>
    ),
  },
};
