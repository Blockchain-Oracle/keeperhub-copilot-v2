import type { Metadata } from "next";

import { Code, DocPage, DocTable, H2, Item, List, Next, Note, P, UI } from "@/components/docs/prose";

export const metadata: Metadata = { title: "When it looks wrong" };

export default function TroubleshootingPage() {
  return (
    <DocPage
      eyebrow="Need a hand?"
      title="When it looks wrong"
      lede="What each message means and what to do about it. Most of them are the app stopping on purpose rather than something breaking."
    >
      <H2>On a card</H2>
      <DocTable
        head={["What you see", "What to do"]}
        rows={[
          [
            "This would not succeed",
            <>
              KeeperHub tried it and it would revert. The reason is on the card — usually not enough
              of something, or a missing allowance. Fix that and the card is still there; the amount
              is editable.
            </>,
          ],
          [
            "The check could not run",
            <>
              Not a failure — the preview itself did not come back. Use <UI>Try again</UI>. It re-runs
              the check without you retyping anything.
            </>,
          ],
          [
            "CHECK INPUTS",
            <>
              KeeperHub refused an argument. Open <UI>Edit</UI>: the field it objected to is named.
              Leaving an optional field blank is fine — blanks are dropped rather than sent empty.
            </>,
          ],
          [
            "NEEDS ACCESS",
            <>Your session does not carry the permission for this. Sign in again from the card.</>,
          ],
          [
            "RECONNECT",
            <>Your session ended. The card has a button to reconnect, and you come back to it.</>,
          ],
          [
            "PAUSED",
            <>You have gone too fast for a moment. Wait a few seconds and ask again.</>,
          ],
          [
            "NOT AVAILABLE",
            <>
              This action does not run from chat — some only work as automation steps. Ask for it as
              an automation instead.
            </>,
          ],
          [
            "NO RECEIPT",
            <>
              You authorized it, but its outcome never reached this app. Do not assume either way:
              check Activity, and the explorer, before trying it again.
            </>,
          ],
        ]}
      />

      <Note tone="warn">
        <p>
          If a transaction&apos;s outcome is unknown, look it up on the explorer before retrying.
          Sending the same thing twice because the first looked stuck is the expensive mistake.
        </p>
      </Note>

      <H2>Amounts</H2>
      <List>
        <Item>
          Use a dot, not a comma. <Code>0.5</Code>, never <Code>0,5</Code> — a comma is refused rather
          than being read as something else.
        </Item>
        <Item>
          Some raw contract calls take an amount in the token&apos;s smallest unit, not in whole
          tokens. The card names the argument and its type when that is the case.
        </Item>
      </List>

      <H2>It answered about the wrong network</H2>
      <P>
        Check the chip in the header — that is the network it works on. Either switch it, or say the
        network in your question.
      </P>

      <H2>It says it cannot do something you think it can</H2>
      <P>
        Ask it what it can do, or open <UI>Every action</UI>. If an action exists but not on your
        current network, say the network that has it. If the copilot tells you a write would fail
        because of a position you do not hold — no collateral, no allowance — that is it checking
        before proposing rather than being unhelpful.
      </P>

      <H2>Voice will not authorize</H2>
      <P>
        That is not a fault. Voice can look things up and propose them; confirming takes a click on
        the card. See <UI>Talking to it</UI>.
      </P>

      <H2>A conversation will not let me type</H2>
      <P>
        It has gone read-only — anything unused for half an hour does. Everything in it is still
        readable. Start a new chat and carry on.
      </P>

      <Next
        links={[
          {
            href: "/docs/use/cards",
            title: "The cards",
            body: "Every stamp and what it means.",
          },
          {
            href: "/docs/help/glossary",
            title: "Glossary",
            body: "Any word here, in plain terms.",
          },
        ]}
      />
    </DocPage>
  );
}
