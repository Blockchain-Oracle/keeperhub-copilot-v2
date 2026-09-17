import { useTranslations } from "next-intl";

/*
 * Masayume components/shell/CapabilityPending.tsx + shell.css (`.capability-pending`).
 * The honest state for a route whose capability is not connected yet: it says
 * what the surface will do and what it is waiting on, so a reviewer can tell a
 * pending page from a broken one. Paint is Portaldot's; a side gutter is added
 * because our shell has no page container around it.
 */
export function CapabilityPending({
  eyebrow,
  title,
  children,
  dependency,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  /** The concrete thing this surface is waiting on — a service, data source, or piece of the app. */
  dependency: string;
}) {
  const t = useTranslations("shell.capabilityPending");
  return (
    <section className="mx-auto max-w-[62ch] px-5 py-12">
      <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">{eyebrow}</p>
      <h1 className="mt-3 font-display text-[28px] leading-[1.15] font-bold tracking-[-0.02em] text-foreground">{title}</h1>
      <div className="mt-3 text-[15px] leading-[1.6] text-fg-secondary">{children}</div>
      <p className="mt-5 border-t border-border pt-4 font-mono text-[11px] text-fg-muted">
        {t("waiting", { dependency })}
      </p>
    </section>
  );
}
