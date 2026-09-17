import { createTranslator } from "next-intl";

import { englishMessages } from "./english";

/*
 * How pure copy modules translate (decision 41). Card, activity, voice and
 * chat rules are plain functions tested in node; each takes a `Translate` as
 * its last argument, English by default, so its tests keep reading English and
 * a component hands in the person's language (useTranslate). Keys are full
 * paths from the messages root, e.g. "cards.write.meta.executed".
 */

export type TranslateValues = Record<string, string | number | Date>;
export type Translate = (key: string, values?: TranslateValues) => string;

const english = createTranslator({ locale: "en", messages: englishMessages });

export const englishTranslate: Translate = (key, values) => english(key as never, values as never);
