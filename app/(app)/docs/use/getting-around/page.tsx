import type { Metadata } from "next";

import { GuideShot } from "@/components/docs/guide-shot";
import { Code, DocPage, H2, Item, List, Next, Note, P, UI } from "@/components/docs/prose";
import { registryMeta } from "@/lib/registry";

export const metadata: Metadata = { title: "Getting around" };

export default function GettingAroundPage() {
  return (
    <DocPage
      eyebrow="Using it"
      title="Getting around"
      lede="The header, the search box and the few settings worth knowing about."
    >
      <H2>Search, from anywhere</H2>
      <P>
        Press <Code>⌘K</Code>, or <Code>Ctrl+K</Code>, anywhere in the app. There is a button for it
        in the header too. One box searches three things at once:
      </P>
      <List>
        <Item>
          <UI>Pages</UI> — it opens them.
        </Item>
        <Item>
          <UI>Networks</UI> — it switches to one, there and then.
        </Item>
        <Item>
          <UI>Actions</UI> — all {registryMeta.actionCount} of them. Choosing one asks the copilot
          about it using that action&apos;s own example, and the copilot then asks you for whatever it
          still needs.
        </Item>
      </List>
      <P>Your language is in there as well.</P>

      <GuideShot name="palette" caption="One box over pages, networks and every action." />

      <H2>The network chip</H2>
      <P>
        The chip in the header is the network the copilot works on. Changing it changes what your next
        question is about — a price, a balance, a transfer all follow it.
      </P>
      <Note>
        <p>
          It starts on <Code>Base Sepolia</Code>, a test network, so a first attempt cannot cost real
          money.
        </p>
      </Note>
      <P>
        Not every action exists on every network. If you pick a starter card the current network
        cannot run, the copilot names one that can rather than hiding the card — these are questions,
        so asking them where they exist costs nothing.
      </P>

      <H2>The composer</H2>
      <P>
        The box you type in opens out as you write and settles again when it is empty. The{" "}
        <UI>plus</UI> menu beside it holds the network list and a way into the action catalogue. The
        round button at the end is one button with two jobs: it sends when you have typed something,
        and starts voice when you have not.
      </P>

      <H2>Sound</H2>
      <P>
        The copilot makes a small sound at the moments that matter: a card arriving and waiting, a
        form asking for something, your click to authorize, and how it ended. Questions are silent —
        they cost nothing and nothing is at stake, so nothing interrupts you.
      </P>
      <P>
        Turn it off from <UI>Sound</UI> in the account menu. Your choice is remembered in that browser.
      </P>

      <H2>On a phone</H2>
      <P>
        The main destinations sit in a floating bar at the bottom, with <UI>More</UI> opening the rest
        in a drawer. Dialogs slide up from the bottom instead of appearing in the middle.
      </P>

      <Next
        links={[
          {
            href: "/docs/actions",
            title: "Every action",
            body: `All ${registryMeta.actionCount}, and what each one touches.`,
          },
          {
            href: "/docs/help/glossary",
            title: "Glossary",
            body: "Any word on these pages, in plain terms.",
          },
        ]}
      />
    </DocPage>
  );
}
