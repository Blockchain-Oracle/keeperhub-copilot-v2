import type { Metadata } from "next";

import { GuideShot } from "@/components/docs/guide-shot";
import { Code, DocPage, H2, Item, List, Next, Note, P, UI } from "@/components/docs/prose";
import { LOCALES } from "@/lib/locale";

export const metadata: Metadata = { title: "Your language" };

export default function LanguagePage() {
  return (
    <DocPage
      eyebrow="Using it"
      title="Your language"
      lede={`The whole app speaks ${LOCALES.length} languages — the screens, the chat, the cards and the voice. You pick one; it is never guessed from how you sound.`}
    >
      <H2>Picking one</H2>
      <P>
        Open the account menu in the top right and choose your language, or press{" "}
        <Code>⌘K</Code> and start typing its name. Each one is written in its own script, so you can
        find yours without reading English first.
      </P>

      <div className="flex flex-wrap gap-1.5">
        {LOCALES.map((locale) => (
          <span
            key={locale.code}
            lang={locale.code}
            className="rounded-full border border-card-bezel bg-surface-2/50 px-3 py-1 text-[13px] text-fg-secondary"
          >
            {locale.native}
          </span>
        ))}
      </div>

      <P>
        Until you pick one, the app follows your browser. Once you have picked, that is what it uses
        everywhere and on every device you sign in from.
      </P>

      <GuideShot name="language" caption="The language picker, each language in its own script." />

      <H2>What changes</H2>
      <P>
        Everything you touch: the landing page, sign-in, the menus, the chat, every card, the voice
        bar, History, Activity, Automations, shared receipts, the notifications and the page titles.
        The copilot also replies and speaks in your language.
      </P>

      <H2>What stays in English</H2>
      <P>Three kinds of thing, each for a reason.</P>
      <List>
        <Item>
          <UI>KeeperHub&apos;s own action names.</UI> They are the platform&apos;s identifiers, and
          translating them would mean the name in front of you is not the name in the registry.
        </Item>
        <Item>
          <UI>Contract argument names and Solidity types</UI> — <Code>asset (address)</Code>,{" "}
          <Code>amount (uint256)</Code>. These are the contract&apos;s own words.
        </Item>
        <Item>
          <UI>These documentation pages.</UI>
        </Item>
      </List>
      <P>
        Messages written by KeeperHub itself also arrive in English, because the same text is what the
        model reads and what is saved in the conversation. Where the copilot recognises the kind of
        problem, it says it in your language instead.
      </P>

      <H2>Numbers do not change</H2>
      <Note tone="warn">
        <p>
          Amounts, addresses, hashes, chain ids and times keep Latin digits and a dot for the decimal
          point in every language. An amount typed with a comma — <Code>0,5</Code> — is refused with a
          note to use a dot. It is never quietly read as <Code>5</Code>.
        </p>
      </Note>

      <H2>A note on the translations</H2>
      <P>
        Every language is complete and consistent — the app checks that automatically — but none has
        been reviewed by a native speaker yet. If something reads oddly in yours, it is worth saying
        so.
      </P>

      <Next
        links={[
          {
            href: "/docs/use/voice",
            title: "Talking to it",
            body: "Speaking and hearing your own language.",
          },
          {
            href: "/docs/use/getting-around",
            title: "Getting around",
            body: "Search, networks and sound.",
          },
        ]}
      />
    </DocPage>
  );
}
