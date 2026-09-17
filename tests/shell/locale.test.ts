import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  getLocale,
  languageName,
  languageRules,
  LOCALE_COOKIE_NAME,
  LOCALES,
  negotiateLocale,
  parseLocaleCookie,
  readLocaleCookieValue,
  readLocaleFromCookieHeader,
  resolveLocale,
  serializeLocaleCookie,
} from "@/lib/locale";

/* The picked language (decisions 38–40). */

describe("the languages", () => {
  it("are the thirteen Abu picked, each with a transcription code", () => {
    expect(LOCALES.map((locale) => locale.code)).toEqual([
      "en", "es", "pt-BR", "fr", "de", "id", "vi", "ko", "ja", "zh-CN", "hi", "ru", "tr",
    ]);
    for (const locale of LOCALES) expect(locale.speech, locale.code).toMatch(/^[a-z]{2}$/);
    expect(getLocale("pt-BR").speech).toBe("pt");
    expect(getLocale("zh-CN").speech).toBe("zh");
  });
});

describe("the language cookie", () => {
  it("is English until someone picks, and English for anything unknown", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(parseLocaleCookie(undefined)).toBe("en");
    expect(parseLocaleCookie("xx")).toBe("en");
    expect(parseLocaleCookie("ES")).toBe("en");
    expect(readLocaleFromCookieHeader(null)).toBe("en");
  });

  it("reads the pick from a header carrying other cookies", () => {
    expect(readLocaleFromCookieHeader(`kh_network=84532; ${LOCALE_COOKIE_NAME}=ja; kh_session=abc`)).toBe("ja");
    expect(readLocaleFromCookieHeader(`${LOCALE_COOKIE_NAME}=pt-BR`)).toBe("pt-BR");
  });

  it("round-trips through the cookie it writes", () => {
    const cookie = serializeLocaleCookie("hi");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(readLocaleFromCookieHeader(cookie.split(";")[0])).toBe("hi");
    expect(serializeLocaleCookie("nonsense").startsWith(`${LOCALE_COOKIE_NAME}=en;`)).toBe(true);
  });
});

describe("the language for a request (decision 42)", () => {
  it("matches the browser's language, best first, falling back from a region to its language", () => {
    expect(negotiateLocale("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
    expect(negotiateLocale("pt-PT,pt;q=0.9")).toBe("pt-BR");
    expect(negotiateLocale("zh-TW")).toBe("zh-CN");
    expect(negotiateLocale("fr-CA")).toBe("fr");
    expect(negotiateLocale("en;q=0.2, ja;q=0.9")).toBe("ja");
    expect(negotiateLocale("sv, nb;q=0.8")).toBeNull();
    expect(negotiateLocale("*")).toBeNull();
    expect(negotiateLocale("de;q=0")).toBeNull();
    expect(negotiateLocale(null)).toBeNull();
  });

  it("uses the person's pick, else their browser's language, else English", () => {
    expect(resolveLocale("ko", "es-ES")).toBe("ko");
    expect(resolveLocale(undefined, "es-ES")).toBe("es");
    expect(resolveLocale("nonsense", "hi-IN")).toBe("hi");
    expect(resolveLocale(null, "sv")).toBe("en");
    expect(resolveLocale(null, null)).toBe("en");
  });

  it("reads the raw pick from a Cookie header, or nothing when there is none", () => {
    expect(readLocaleCookieValue(`kh_network=1; ${LOCALE_COOKIE_NAME}=tr`)).toBe("tr");
    expect(readLocaleCookieValue("kh_network=1")).toBeNull();
    expect(readLocaleCookieValue(null)).toBeNull();
  });
});

describe("the reply rules", () => {
  it("pin the language and keep the values cards depend on untouched", () => {
    const rules = languageRules("es").join("\n");
    expect(rules).toContain("Reply only in Spanish (Español)");
    expect(rules).toContain("a dot for decimals");
    expect(rules).toContain("addresses");
    expect(rules).toContain("form card");
    expect(languageName("en")).toBe("English");
    expect(languageRules("en")[0]).toContain("Reply only in English,");
  });
});
