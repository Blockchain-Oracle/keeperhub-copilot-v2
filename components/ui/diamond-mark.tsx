/*
 * Portaldot's diamond glyph (components/ui/floating-nav.tsx) — a geometric
 * placeholder until KeeperHub has a mark here. The landing nav, the footer and
 * the app header share it.
 */
export function DiamondMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 2 22 12 12 22 2 12 12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 7 17 12 12 17 7 12 12 7Z" fill="currentColor" />
    </svg>
  );
}
