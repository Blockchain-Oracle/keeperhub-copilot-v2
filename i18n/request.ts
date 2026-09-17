import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { loadMessages } from "@/lib/i18n/messages";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/locale";

/*
 * next-intl without language prefixes in the address (decisions 41–42): the
 * language is the person's pick (the kh_locale cookie), else their browser's,
 * else English. Times on screen are UTC, as they always were.
 */
export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value, headerStore.get("accept-language"));
  return { locale, messages: await loadMessages(locale), timeZone: "UTC" };
});
