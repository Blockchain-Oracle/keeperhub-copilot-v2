import type { LocaleCode } from "@/lib/locale";

import { englishMessages, MESSAGE_AREAS, type Messages } from "./english";

/*
 * A language's screens: its area files laid over English, so a key a
 * translation lacks shows in English rather than as a bare key. The messages
 * test keeps every language complete; this is only the safety net.
 */
export async function loadMessages(locale: LocaleCode): Promise<Messages> {
  if (locale === "en") return englishMessages;
  const areas = await Promise.all(
    MESSAGE_AREAS.map(async (area) => {
      try {
        const loaded = (await import(`../../messages/${locale}/${area}.json`)) as { default: unknown };
        return [area, loaded.default] as const;
      } catch {
        return [area, {}] as const;
      }
    }),
  );
  return overlay(englishMessages, Object.fromEntries(areas)) as Messages;
}

function overlay(base: unknown, over: unknown): unknown {
  if (!isRecord(base)) return typeof over === typeof base ? over : base;
  const result: Record<string, unknown> = {};
  const extra = isRecord(over) ? over : {};
  for (const [key, value] of Object.entries(base)) {
    result[key] = key in extra ? overlay(value, extra[key]) : value;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
