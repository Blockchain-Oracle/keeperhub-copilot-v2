import { ExternalLink } from "lucide-react";

/* Portaldot components/tools.tsx — ExplorerLink, verbatim. */

export function ExplorerLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.18em] text-telemetry transition-colors hover:text-foreground"
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  );
}
