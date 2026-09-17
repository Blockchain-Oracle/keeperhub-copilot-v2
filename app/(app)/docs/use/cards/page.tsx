import type { Metadata } from "next";

import { GuideShot } from "@/components/docs/guide-shot";
import { DocPage, DocTable, H2, Next, Note, P, UI } from "@/components/docs/prose";

export const metadata: Metadata = { title: "The cards" };

export default function CardsPage() {
  return (
    <DocPage
      eyebrow="Using it"
      title="The cards"
      lede="Every answer arrives as a card rather than a paragraph. They all share a frame, so once you can read one you can read all of them."
    >
      <H2>The frame</H2>
      <P>
        Along the top of every card is a small line in a mono typeface: on the left a coloured dot and
        what ran, on the right when it was issued, in UTC. Under that is a perforated rule, and under
        that the card&apos;s own contents. Some cards also carry a stamp.
      </P>
      <P>The dot tells you the kind of card at a glance, before you have read a word of it.</P>

      <DocTable
        head={["Dot", "What it means"]}
        rows={[
          ["Cyan", "A reading. Something was looked up. Nothing moved."],
          ["Amber", "Waiting. It needs something from you, or it is still running."],
          ["Green", "Done, and confirmed on the chain."],
          ["Red", "It failed. The card says why."],
        ]}
      />

      <H2>The kinds</H2>
      <P>
        <UI>A read card</UI> is an answer: a price, your balances, what a contract returned, the
        actions matching something you asked about. It appears, it is finished, and it moves nothing.
        Some of them let you change a field and run the same lookup again.
      </P>
      <P>
        <UI>A write card</UI> is a proposal. Every field is filled in and editable, the check has
        already run, and it is waiting for your click. Until you click, nothing has happened. See{" "}
        <UI>Your first action</UI> for the walkthrough.
      </P>
      <P>
        <UI>A form card</UI> appears when the copilot needs a detail it has no way to guess — a
        recipient, an amount, a network, a choice between two things. It asks with fields rather than
        a sentence, so your answer lands in the right place. Once answered it stays in the
        conversation as a small record of what you said.
      </P>
      <P>
        <UI>An automation card</UI> is a workflow: its trigger, its steps in order, and a switch.
        These are covered on their own page.
      </P>
      <P>
        <UI>A problem card</UI> is the honest one. It comes in two flavours, and the difference
        matters.
      </P>

      <GuideShot
        name="cards-overview"
        caption="A conversation with several kinds of card in it."
      />

      <H2>Stamps</H2>
      <P>A stamp is the card&apos;s final word. If a card has one, it is finished.</P>

      <DocTable
        head={["Stamp", "What happened"]}
        rows={[
          ["EXECUTED", "It ran and the chain confirmed it. The hash and block are on the card."],
          ["VOID", "It failed. The reason is on the card, and nothing moved."],
          ["CANCELLED", "You chose Cancel. It was never sent."],
          ["NEVER AUTHORIZED", "The conversation moved on without you clicking. Nothing happened."],
          ["NO RECEIPT", "You authorized it, but its receipt never reached this app. Check Activity or the explorer before assuming either way."],
        ]}
      />

      <H2>A problem is not always a failure</H2>
      <P>
        A red card with <UI>VOID</UI> means it was attempted and failed. An amber card with{" "}
        <UI>NOT AVAILABLE</UI>, <UI>PAUSED</UI>, <UI>NEEDS ACCESS</UI>, <UI>RECONNECT</UI> or{" "}
        <UI>CHECK INPUTS</UI> means it never got that far — the copilot stopped at a boundary instead.
        Those carry no stamp, because nothing was attempted.
      </P>

      <Note>
        <p>
          A tool saying it worked is not the same as it having worked. A card only reaches{" "}
          <UI>EXECUTED</UI> once the transaction has been read back off the chain.
        </p>
      </Note>

      <H2>Where they go afterwards</H2>
      <P>
        Cards stay in their conversation, so opening it again from History shows exactly what you saw.
        Anything that actually ran is also written to Activity as a record of its own — deleting the
        conversation never deletes that.
      </P>

      <Next
        links={[
          {
            href: "/docs/use/record",
            title: "History and Activity",
            body: "The two records, and why they are separate.",
          },
          {
            href: "/docs/help/troubleshooting",
            title: "When it looks wrong",
            body: "What each problem card is asking you to do.",
          },
        ]}
      />
    </DocPage>
  );
}
