import type { Metadata } from "next";

import { GuideShot } from "@/components/docs/guide-shot";
import { DocPage, H2, Item, List, Next, Note, P, UI } from "@/components/docs/prose";

export const metadata: Metadata = { title: "History and Activity" };

export default function RecordPage() {
  return (
    <DocPage
      eyebrow="Using it"
      title="History and Activity"
      lede="Two different records, kept apart on purpose. One is what was said; the other is what was done."
    >
      <H2>History is the conversations</H2>
      <P>
        Every chat you have had, with its cards exactly as they were. Open one and it either continues
        or opens read-only:
      </P>
      <List>
        <Item>Used in the last half hour — it opens live and you carry on.</Item>
        <Item>
          Older than that — it opens read-only, with a <UI>New chat</UI> button. A chat you leave open
          and idle for half an hour also goes read-only.
        </Item>
      </List>
      <P>
        Read-only means the cards are still there and still readable, but nothing on them can be
        clicked. A proposal nobody answered says so rather than sitting there looking live.
      </P>
      <P>You can rename a conversation, or delete it, from the switcher at the top of the chat.</P>

      <H2>Activity is what actually ran</H2>
      <P>
        Activity is the ledger. Every execution is written there as a fact of its own, separate from
        the conversation it came from — which is the whole point:
      </P>

      <Note>
        <p>
          <UI>Deleting a conversation never deletes the evidence.</UI> The chat goes; the record of
          what ran stays.
        </p>
      </Note>

      <P>
        It is one list with pills across the top — <UI>Actions</UI>, <UI>Reads</UI>, <UI>All</UI> —
        starting on Actions, because that is what you usually came to check. Each row carries the
        action, the network, the outcome, the amount, the transaction and the time.
      </P>

      <GuideShot
        name="activity"
        caption="Activity on the Actions pill, one row per execution."
      />

      <H2>Sharing one receipt</H2>
      <P>
        An executed action can be shared as a link. Open its receipt and choose share. The link shows
        the action, the network, the result, the amount, the recipient, the transaction and the time —
        and nothing else. Never the conversation, never your organisation.
      </P>
      <List>
        <Item>Anyone with the link can open it without signing in.</Item>
        <Item>Search engines are told not to index it.</Item>
        <Item>
          <UI>Stop sharing</UI> turns that link off for good. Sharing again makes a new one.
        </Item>
        <Item>Only an executed action with a transaction can be shared.</Item>
      </List>

      <H2>Amounts, addresses and times</H2>
      <P>
        Anywhere a number matters it is set in a mono typeface with aligned digits, so two rows can be
        compared down the column. Times are UTC. Addresses and hashes are shortened on screen and copy
        in full.
      </P>

      <Next
        links={[
          {
            href: "/docs/use/cards",
            title: "The cards",
            body: "What each stamp in Activity came from.",
          },
          {
            href: "/docs/how/architecture",
            title: "How it connects",
            body: "Why the ledger is separate from the transcript.",
          },
        ]}
      />
    </DocPage>
  );
}
