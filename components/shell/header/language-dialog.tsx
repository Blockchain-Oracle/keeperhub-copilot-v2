"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogEyebrow,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LOCALES } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { useLocale, useSwitchLanguage } from "../locale-context";

/*
 * Choosing the language the copilot answers in (decisions 38–40). Our dialog
 * (Masayume's modal grammar: eyebrow, title, description, a scrolling body; a
 * bottom sheet on phones) holding a list of the languages, each in its own
 * script with the English name beside it, the current one checked.
 */
export function LanguageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { locale } = useLocale();
  const switchLanguage = useSwitchLanguage();
  const t = useTranslations("shell.language");
  const tc = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogEyebrow>{tc("language")}</DialogEyebrow>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-7">
          <div role="radiogroup" aria-label={tc("language")} className="grid gap-1">
            {LOCALES.map((option) => {
              const selected = option.code === locale;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    onOpenChange(false);
                    switchLanguage(option.code);
                  }}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                    selected ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0 truncate">
                    <span lang={option.code} className="text-[14px] font-semibold text-foreground">
                      {option.native}
                    </span>
                    {option.english !== option.native && (
                      <span className="ml-2 text-[12px] text-fg-muted">{option.english}</span>
                    )}
                  </span>
                  {selected && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
