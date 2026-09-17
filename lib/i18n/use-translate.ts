"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import type { Translate } from "./translate";

/*
 * The person's language as a `Translate` for the pure copy modules (decision
 * 41), and a way to show a server error in it: a known error code is
 * translated, anything else (KeeperHub's own words) keeps the server's message.
 */
export function useTranslate(): Translate {
  const t = useTranslations();
  return useCallback<Translate>((key, values) => t(key as never, values as never), [t]);
}

export function useErrorMessage(): (code: string | undefined, fallback: string) => string {
  const t = useTranslations("errors");
  return useCallback(
    (code, fallback) => (code !== undefined && t.has(code as never) ? t(code as never) : fallback),
    [t],
  );
}
