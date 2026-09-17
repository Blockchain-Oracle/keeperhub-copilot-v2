import { createAvatar } from "@dicebear/core";
import * as identicon from "@dicebear/identicon";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/*
 * Portaldot components/cards/identicon.tsx — same props, same halo. The drawing
 * is DiceBear's identicon style instead of @polkadot/react-identicon (EVM
 * addresses, not SS58), rendered inline from the library the way Masayume's
 * features/strategies/AgentPortrait.tsx does, with the same bounded cache.
 */

const DRAWN_CAP = 512;
const drawn = new Map<string, string>();

function draw(address: string): string {
  const seed = address.toLowerCase();
  const cached = drawn.get(seed);
  if (cached !== undefined) return cached;
  const svg = createAvatar(identicon, { seed }).toString();
  if (drawn.size >= DRAWN_CAP) drawn.clear();
  drawn.set(seed, svg);
  return svg;
}

export interface IdenticonProps {
  /** 0x address. Empty string renders a blank disc. */
  address: string;
  size?: number;
  /** Violet halo behind the mark — the brand glow Portaldot uses on the wallet pill. */
  halo?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Identicon({ address, size = 24, halo, ariaLabel, className }: IdenticonProps) {
  const t = useTranslations("shell.identicon");
  return (
    <span
      role="img"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary",
        halo && "shadow-[var(--halo-neon)]",
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={ariaLabel ?? (address ? t("label", { address }) : t("noAccount"))}
    >
      {address ? (
        <span
          aria-hidden
          className="size-[70%] [&>svg]:size-full"
          dangerouslySetInnerHTML={{ __html: draw(address) }}
        />
      ) : null}
    </span>
  );
}
