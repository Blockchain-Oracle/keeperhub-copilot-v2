import type { Messages } from "@/lib/i18n/english";
import type { LocaleCode } from "@/lib/locale";

// Translation keys and their arguments are checked against the English files (decision 41).
declare module "next-intl" {
  interface AppConfig {
    Locale: LocaleCode;
    Messages: Messages;
  }
}
