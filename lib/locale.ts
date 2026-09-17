/*
 * The language the copilot answers in (decisions 38–40). The person picks it
 * in the account menu or the ⌘K palette; it lives in a cookie so the chat and
 * voice routes read the same choice, like the network (lib/network.ts). English
 * until someone picks: in part 1 only the replies change, the screens stay
 * English, so the browser's language is not used yet.
 *
 * OpenAI's voice guidance (FINDINGS "Languages"): pin the language in the
 * prompt and never infer it from accent. `speech` is the ISO-639-1 code the
 * realtime transcription takes.
 */

export const LOCALES = [
  { code: "en", english: "English", native: "English", speech: "en" },
  { code: "es", english: "Spanish", native: "Español", speech: "es" },
  { code: "pt-BR", english: "Portuguese (Brazil)", native: "Português (Brasil)", speech: "pt" },
  { code: "fr", english: "French", native: "Français", speech: "fr" },
  { code: "de", english: "German", native: "Deutsch", speech: "de" },
  { code: "id", english: "Indonesian", native: "Bahasa Indonesia", speech: "id" },
  { code: "vi", english: "Vietnamese", native: "Tiếng Việt", speech: "vi" },
  { code: "ko", english: "Korean", native: "한국어", speech: "ko" },
  { code: "ja", english: "Japanese", native: "日本語", speech: "ja" },
  { code: "zh-CN", english: "Chinese (Simplified)", native: "简体中文", speech: "zh" },
  { code: "hi", english: "Hindi", native: "हिन्दी", speech: "hi" },
  { code: "ru", english: "Russian", native: "Русский", speech: "ru" },
  { code: "tr", english: "Turkish", native: "Türkçe", speech: "tr" },
] as const;

export type Locale = (typeof LOCALES)[number];
export type LocaleCode = Locale["code"];

export const LOCALE_COOKIE_NAME = "kh_locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const DEFAULT_LOCALE: LocaleCode = "en";

/** A known language, English for anything else. */
export function getLocale(code: string | null | undefined): Locale {
  return LOCALES.find((locale) => locale.code === code) ?? LOCALES[0];
}

export function parseLocaleCookie(value: string | null | undefined): LocaleCode {
  return getLocale(value).code;
}

/** The language cookie's raw value from a Cookie header, or null when the person never picked. */
export function readLocaleCookieValue(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === LOCALE_COOKIE_NAME) return part.slice(eq + 1).trim();
  }
  return null;
}

/** For route handlers that have the raw request rather than next/headers. */
export function readLocaleFromCookieHeader(header: string | null): LocaleCode {
  return parseLocaleCookie(readLocaleCookieValue(header));
}

/*
 * The supported language a browser asks for (its Accept-Language header), best
 * first, or null. A regional tag falls back to its language: pt-PT → pt-BR,
 * zh-TW → zh-CN, fr-CA → fr.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): LocaleCode | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag !== "" && entry.tag !== "*" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of ranked) {
    const exact = LOCALES.find((locale) => locale.code.toLowerCase() === tag);
    if (exact !== undefined) return exact.code;
    const base = tag.split("-")[0];
    const sameLanguage = LOCALES.find((locale) => locale.code.toLowerCase().split("-")[0] === base);
    if (sameLanguage !== undefined) return sameLanguage.code;
  }
  return null;
}

/*
 * The language for a request (decision 42): the person's pick, else their
 * browser's language, else English. The screens, the chat and voice all use it,
 * so what someone reads and what they hear always agree.
 */
export function resolveLocale(picked: string | null | undefined, acceptLanguage: string | null | undefined): LocaleCode {
  const chosen = LOCALES.find((locale) => locale.code === picked);
  return chosen?.code ?? negotiateLocale(acceptLanguage) ?? DEFAULT_LOCALE;
}

export function serializeLocaleCookie(code: string): string {
  return `${LOCALE_COOKIE_NAME}=${parseLocaleCookie(code)}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/** "Spanish (Español)", or just "English". */
export function languageName(code: string): string {
  const locale = getLocale(code);
  return locale.english === locale.native ? locale.english : `${locale.english} (${locale.native})`;
}

/*
 * The reply rules the chat and voice prompts share. The values the cards and
 * tools depend on never change language or format: an amount keeps its dot,
 * an address stays an address.
 */
export function languageRules(code: string): string[] {
  const locale = getLocale(code);
  return [
    `Reply only in ${languageName(code)}, whatever language the person writes or speaks in.`,
    "Never translate or reformat these: amounts (digits with a dot for decimals, such as 0.5), addresses, transaction hashes, token symbols, network names and action ids.",
    "Tool arguments stay exactly as each tool expects.",
    `Anything you write into a form card (its title, field labels and reason) is in ${locale.english}.`,
  ];
}
