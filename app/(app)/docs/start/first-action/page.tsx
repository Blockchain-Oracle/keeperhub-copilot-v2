import type { Metadata } from "next";

import { GuideShot } from "@/components/docs/guide-shot";
import { Code, DocPage, H2, Item, List, Next, Note, P, Step, Steps, UI } from "@/components/docs/prose";

export const metadata: Metadata = { title: "Your first action" };

export default function FirstActionPage() {
  return (
    <DocPage
      eyebrow="Start here"
      title="Your first action"
      lede="Anything that moves value stops and shows you exactly what it is about to do. This walks through one from the sentence to the receipt."
    >
      <Note>
        <p>
          Do the first one on a test network. The copilot starts on <Code>Base Sepolia</Code>, where
          the tokens are not real. Check the network chip in the header before you begin.
        </p>
      </Note>

      <Steps>
        <Step n={1} title="Ask for it in words">
          <P>
            &ldquo;Send 0 ETH to myself on Base Sepolia&rdquo; is a good first one: it goes through
            the whole ceremony and moves nothing. You do not need your own address — the copilot
            knows your organisation&apos;s wallet.
          </P>
        </Step>
        <Step n={2} title="The chat stops and prints a card">
          <P>
            Instead of doing it, the copilot fills in a card: the amount, the recipient, the network,
            the token. Everything it is about to do is on screen, in full, before anything happens.
          </P>
          <P>
            If it is missing something it cannot guess — which token, which network, how much — it
            asks with a small form rather than a sentence, so the answer goes straight into the right
            field.
          </P>
        </Step>
        <Step n={3} title="Change anything you like">
          <P>
            Choose <UI>Edit</UI> and every field is yours: the amount, the recipient, the network,
            the token, and the action&apos;s own settings. What you cannot change is <em>which</em>{" "}
            action it is — a transfer stays a transfer.
          </P>
          <P>Every edit re-runs the check and puts the button back to unarmed. Nothing is authorized by accident.</P>
        </Step>
        <Step n={4} title="Read the check">
          <P>
            KeeperHub tries the action first, without sending it, and tells you what would happen.
            You will see one of:
          </P>
          <List>
            <Item>
              <UI>It would succeed</UI>, usually with the estimated fee. Go ahead.
            </Item>
            <Item>
              <UI>This would not succeed</UI>, with the reason — not enough collateral, no allowance,
              balance too low. Fix it or change the amount; the card stays open.
            </Item>
            <Item>
              <UI>The check could not run.</UI> Not the same thing as a failure. There is a{" "}
              <UI>Try again</UI> button for it.
            </Item>
          </List>
        </Step>
        <Step n={5} title="Authorize">
          <P>
            What runs is what you looked at, field for field. The copilot cannot change the numbers
            between your click and KeeperHub, and it cannot click for you — not from chat, and not
            from voice.
          </P>
        </Step>
        <Step n={6} title="Get the receipt">
          <P>
            The card stays where it is and becomes the receipt: stamped <UI>EXECUTED</UI>, with the
            transaction hash, the block, the status and a link to the explorer. Those are read back
            off the chain, not reported by whatever ran it.
          </P>
          <P>
            If it failed, it is stamped <UI>VOID</UI> with the reason instead. A failure is never
            dressed up as a success.
          </P>
        </Step>
      </Steps>

      <GuideShot
        name="write-card"
        caption="A transfer waiting for its click. Every field on it is editable, and the check has already run."
      />

      <H2>What this protects you from</H2>
      <P>
        The model chooses which action to use and what to put in it, and a model can be wrong. The
        card is where you find out before it matters rather than after. It is also why voice can ask
        for things and preview them but can never confirm them: confirming takes a deliberate click
        on a card you are looking at.
      </P>

      <Next
        links={[
          {
            href: "/docs/use/cards",
            title: "The cards",
            body: "Every kind of card, and every stamp.",
          },
          {
            href: "/docs/use/record",
            title: "History and Activity",
            body: "Where the receipt lives afterwards.",
          },
        ]}
      />
    </DocPage>
  );
}
