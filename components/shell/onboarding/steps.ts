import { englishTranslate, type Translate } from "@/lib/i18n/translate";

/*
 * The first-run walkthrough's five screens — Masayume features/onboarding/steps.ts,
 * in its order and with each screen's job: what this is, how it works, the
 * account that signs, where the money sits, and a closing screen that ends on
 * connecting. The prose is ours, because theirs describes a prediction market.
 *
 * Text: messages/en/shell.json (decision 41), through the `t` each takes last,
 * English by default.
 */

export interface TutorialStep {
  readonly title: string;
  readonly description: string;
  /** The closing screen: it ends on Connect and never auto-advances. */
  readonly choice?: true;
}

const STEPS: readonly { key: string; choice?: true }[] = [
  { key: "welcome" },
  { key: "readsRun" },
  { key: "orgWallet" },
  { key: "money" },
  { key: "connect", choice: true },
];

export function tutorialSteps(t: Translate = englishTranslate): readonly TutorialStep[] {
  return STEPS.map(({ key, choice }) => ({
    title: t(`shell.tutorial.steps.${key}.title`),
    description: t(`shell.tutorial.steps.${key}.description`),
    ...(choice ? { choice } : {}),
  }));
}

export function tutorialUi(t: Translate = englishTranslate) {
  return {
    close: t("common.close"),
    skip: t("shell.tutorial.skip"),
    next: t("shell.tutorial.next"),
    done: t("shell.tutorial.done"),
    lastStep: t("shell.tutorial.lastStep"),
    connectTitle: t("shell.tutorial.connectTitle"),
    connectNote: t("shell.tutorial.connectNote"),
    progress: (step: number, total: number) => t("shell.tutorial.progress", { step, total }),
  } as const;
}
