import automations from "@/messages/en/automations.json";
import cards from "@/messages/en/cards.json";
import chat from "@/messages/en/chat.json";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import landing from "@/messages/en/landing.json";
import metadata from "@/messages/en/metadata.json";
import pages from "@/messages/en/pages.json";
import shell from "@/messages/en/shell.json";
import voice from "@/messages/en/voice.json";

/*
 * The English screens (decision 41), the source every other language is
 * translated from and falls back to. One file per area of the app under
 * messages/<locale>/, so each area's text lives beside the others without one
 * enormous file. The shape of these files is the type every translation key is
 * checked against (global.d.ts).
 */

export const MESSAGE_AREAS = [
  "common",
  "errors",
  "metadata",
  "landing",
  "shell",
  "chat",
  "cards",
  "automations",
  "voice",
  "pages",
] as const;
export type MessageArea = (typeof MESSAGE_AREAS)[number];

export const englishMessages = { common, errors, metadata, landing, shell, chat, cards, automations, voice, pages };

export type Messages = typeof englishMessages;
