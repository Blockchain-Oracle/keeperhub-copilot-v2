import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { englishMessages, MESSAGE_AREAS } from "@/lib/i18n/english";
import { LOCALES, type LocaleCode } from "@/lib/locale";

/*
 * The screens in every language (decision 41). Each language must carry
 * exactly the English keys, every message must still format, keep the same
 * arguments and tags, and keep the names that are never translated.
 */

const ROOT = join(process.cwd(), "messages");
const TRANSLATED = LOCALES.filter((locale) => locale.code !== "en");
const PROTECTED = ["KeeperHub", "⌘K"];

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") out.set(path, value);
    else for (const [inner, text] of flatten(value, path)) out.set(inner, text);
  }
  return out;
}

const SELECTORS = /(?:zero|one|two|few|many|other|=\d+)\s*$/;

/** The ICU arguments a message uses: identifiers opening a `{…}` that is not a plural option body. */
function argumentsOf(message: string): Set<string> {
  const names = new Set<string>();
  const pattern = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g;
  for (const match of message.matchAll(pattern)) {
    if (!SELECTORS.test(message.slice(0, match.index))) names.add(match[1]);
  }
  return names;
}

function tagsOf(message: string): string[] {
  return [...new Set([...message.matchAll(/<([A-Za-z][A-Za-z0-9]*)>/g)].map((match) => match[1]))].sort();
}

function load(locale: LocaleCode): Tree {
  return Object.fromEntries(
    MESSAGE_AREAS.map((area) => {
      const file = join(ROOT, locale, `${area}.json`);
      return [area, existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Tree) : {}];
    }),
  );
}

const english = flatten(englishMessages as unknown as Tree);

function formats(locale: LocaleCode, tree: Tree, key: string, message: string): void {
  const t = createTranslator({
    locale,
    messages: tree as never,
    onError: (error) => {
      throw error;
    },
  });
  const values: Record<string, unknown> = {};
  for (const name of argumentsOf(message)) values[name] = 2;
  for (const tag of tagsOf(message)) values[tag] = (chunks: string) => chunks;
  (t.markup as unknown as (key: string, values: Record<string, unknown>) => string)(key, values);
}

describe("the English messages", () => {
  it("exist for every area and all format", () => {
    for (const area of MESSAGE_AREAS) expect(existsSync(join(ROOT, "en", `${area}.json`)), area).toBe(true);
    for (const [key, message] of english) expect(() => formats("en", englishMessages as unknown as Tree, key, message), key).not.toThrow();
  });
});

describe.each(TRANSLATED.map((locale) => [locale.code] as const))("the %s messages", (code) => {
  const tree = load(code);
  const translated = flatten(tree);

  it("have every area file", () => {
    for (const area of MESSAGE_AREAS) expect(existsSync(join(ROOT, code, `${area}.json`)), `${code}/${area}.json`).toBe(true);
  });

  it("carry exactly the English keys, none empty", () => {
    expect([...translated.keys()].filter((key) => !english.has(key)), "keys English doesn't have").toEqual([]);
    expect([...english.keys()].filter((key) => !translated.has(key)), "English keys missing").toEqual([]);
    expect([...translated].filter(([, value]) => value.trim() === "").map(([key]) => key)).toEqual([]);
  });

  it("keep each message's arguments and tags, and still format", () => {
    for (const [key, source] of english) {
      const message = translated.get(key);
      if (message === undefined) continue;
      expect([...argumentsOf(message)].sort(), `${code} ${key} arguments`).toEqual([...argumentsOf(source)].sort());
      expect(tagsOf(message), `${code} ${key} tags`).toEqual(tagsOf(source));
      expect(() => formats(code, tree, key, message), `${code} ${key}`).not.toThrow();
    }
  });

  it("never translate the names that stay English", () => {
    for (const [key, source] of english) {
      const message = translated.get(key);
      if (message === undefined) continue;
      for (const term of PROTECTED) {
        if (source.includes(term)) expect(message, `${code} ${key} keeps ${term}`).toContain(term);
      }
    }
  });
});
