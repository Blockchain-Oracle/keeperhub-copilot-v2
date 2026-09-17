import Link from "next/link";
import { getTranslations } from "next-intl/server";

/* A shared receipt link that was turned off, or never existed (decision 37). */
export default async function SharedReceiptNotFound() {
  const t = await getTranslations("pages.sharedReceipt");
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="font-mono text-[10px] tracking-[0.22em] text-fg-muted uppercase">{t("kicker")}</p>
      <p className="mt-2 text-[17px] font-semibold text-foreground">{t("notFound.title")}</p>
      <p className="mt-2 text-sm text-fg-muted">{t("notFound.body")}</p>
      <Link
        href="/"
        className="mt-5 inline-flex items-center rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {t("tryCopilot")}
      </Link>
    </div>
  );
}
