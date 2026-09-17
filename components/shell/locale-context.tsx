"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { toast } from "@/components/ui/toast";
import { getLocale, serializeLocaleCookie, type LocaleCode } from "@/lib/locale";

/*
 * The picked language (decisions 38–40), shared by the account menu's language
 * dialog and the ⌘K palette. A copy of network-context.tsx: the server layout
 * seeds it from the cookie, and picking writes the cookie the chat and voice
 * routes read.
 */

type LocaleContextValue = {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ initialLocale, children }: { initialLocale: LocaleCode; children: ReactNode }) {
  const router = useRouter();
  const [locale, setSelected] = useState(initialLocale);

  // The screens are rendered in the language on the server (decision 41), so a pick refreshes them.
  const setLocale = useCallback(
    (next: LocaleCode) => {
      document.cookie = serializeLocaleCookie(next);
      setSelected(next);
      router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

/** Pick a language and say what changes: the next chat message, and the next voice session. */
export function useSwitchLanguage(): (code: LocaleCode) => void {
  const { locale, setLocale } = useLocale();
  const t = useTranslations("shell.language");
  return useCallback(
    (code: LocaleCode) => {
      if (code === locale) return;
      setLocale(code);
      toast.add({
        title: t("switched", { language: getLocale(code).native }),
        description: t("switchedDescription"),
      });
    },
    [locale, setLocale, t],
  );
}
