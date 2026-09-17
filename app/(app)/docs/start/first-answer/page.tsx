import type { Metadata } from "next";

import { GuideShot } from "@/components/docs/guide-shot";
import { DocPage, H2, Item, List, Next, Note, P, Step, Steps, UI } from "@/components/docs/prose";
import { registryMeta } from "@/lib/registry";

export const metadata: Metadata = { title: "Ask your first question" };

export default function FirstAnswerPage() {
  return (
    <DocPage
      eyebrow="Start here"
      title="Ask your first question"
      lede="Questions are the free half of the copilot. They answer straight away, they never stop to ask you anything, and they cannot move a thing."
    >
      <Steps>
        <Step n={1} title="Type it the way you would say it">
          <P>
            Open <UI>Chat</UI> and write what you want to know. There is nothing to learn first — no
            contract address, no token symbol you have to get exactly right, no menu to find the
            feature in.
          </P>
          <List>
            <Item>&ldquo;What&apos;s the ETH price on Chainlink right now?&rdquo;</Item>
            <Item>&ldquo;Show me my balances across every chain&rdquo;</Item>
            <Item>&ldquo;What&apos;s the supply APY on Aave for USDC?&rdquo;</Item>
            <Item>&ldquo;What can you actually do on Base?&rdquo;</Item>
          </List>
        </Step>
        <Step n={2} title="Or pick one of the cards">
          <P>
            Before you have typed anything, the chat shows a row of cards you can scroll through.
            Each one is a real question this app can answer. Click one and it goes into the composer
            for you.
          </P>
        </Step>
        <Step n={3} title="Watch it choose">
          <P>
            A line appears saying <UI>Used N tools</UI>. Open it and you can see exactly which of
            KeeperHub&apos;s {registryMeta.actionCount} actions it chose, what it sent and what came
            back. It is there whenever you want to check its working, and folded away when you do not.
          </P>
        </Step>
        <Step n={4} title="Read the card">
          <P>
            The answer arrives as a card, not a paragraph. A price card shows the figure, which feed
            it came from, which network, and when it was published — with the last twelve updates
            drawn beside it.
          </P>
        </Step>
      </Steps>

      <GuideShot
        name="read-card"
        caption="A price question and what comes back. The figure is read off the chain when the card appears."
      />

      <H2>Why questions never stop</H2>
      <P>
        Nothing is at stake in a question. It reads something that is already public, changes
        nothing, and costs nothing, so there is no reason to make you confirm it. That is why the
        copilot answers them without interrupting you — and why anything that is <em>not</em> a
        question behaves completely differently.
      </P>

      <Note>
        <p>
          If an answer looks stale, ask again. A card reads its figure once, when it appears; it is a
          reading from a moment, not a ticker.
        </p>
      </Note>

      <H2>Keep going in the same conversation</H2>
      <P>
        Follow-ups work the way you would expect — &ldquo;and on Arbitrum?&rdquo;, &ldquo;what about
        USDC?&rdquo;. The conversation is saved as you go, so you can close the tab and come back to
        it from <UI>History</UI>.
      </P>

      <Next
        links={[
          {
            href: "/docs/start/first-action",
            title: "Your first action",
            body: "Now the half that stops and asks.",
          },
          {
            href: "/docs/use/cards",
            title: "The cards",
            body: "Every kind of card and what it is telling you.",
          },
        ]}
      />
    </DocPage>
  );
}
