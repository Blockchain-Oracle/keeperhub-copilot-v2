import type { Metadata } from "next";

import { GuideShot } from "@/components/docs/guide-shot";
import { DocPage, H2, Item, List, Next, Note, P, Step, Steps, UI } from "@/components/docs/prose";

export const metadata: Metadata = { title: "Talking to it" };

export default function VoicePage() {
  return (
    <DocPage
      eyebrow="Using it"
      title="Talking to it"
      lede="Voice is the same copilot with the same cards, held as a conversation instead of typing. It can look things up and propose things. It can never authorize one."
    >
      <Steps>
        <Step n={1} title="Start it from the composer">
          <P>
            The round button at the end of the composer starts a voice session. Your browser asks for
            the microphone the first time. The composer is replaced by a voice bar with a glowing orb,
            live bars that follow your voice, and a countdown.
          </P>
        </Step>
        <Step n={2} title="Just talk">
          <P>
            Ask the way you would ask a person. It answers out loud and, when the answer is something
            you should see, puts the same card on screen that the chat would have.
          </P>
        </Step>
        <Step n={3} title="When something needs your click">
          <P>
            If you ask for something that moves value, the card appears and{" "}
            <UI>voice says it is waiting and stops</UI>. Your microphone mutes itself while the card
            is open, so nothing you say while reading can be taken as an instruction.
          </P>
          <P>
            Authorize or cancel on the card, and voice picks up from there — it says what happened out
            loud, and a short line appears under the card in the conversation.
          </P>
        </Step>
        <Step n={4} title="End it, or let it end">
          <P>
            <UI>Mute</UI> stops it hearing you without ending the session; <UI>End</UI> closes it. A
            session also ends itself after about ten minutes with a short goodbye — tap the microphone
            to start a new one.
          </P>
        </Step>
      </Steps>

      <GuideShot
        name="voice"
        caption="The voice bar in place of the composer, with a card waiting above it."
      />

      <H2>What it will not do</H2>
      <Note tone="warn">
        <p>
          Voice cannot authorize anything. Not on request, not by agreeing, not by repeating it back.
          Anything that moves value takes a deliberate click on a card you can see.
        </p>
      </Note>
      <P>
        That is on purpose. Speech is easy to mishear, easy to overhear and easy to do by accident.
        The click is the part that has to be unambiguous.
      </P>

      <H2>When it needs a detail</H2>
      <P>
        If the copilot is missing something, a small form rises above the voice bar instead of it
        asking you to spell an address out loud. There is a shortcut on it for your own organisation
        wallet. Your microphone mutes while it is open, and voice carries on once you have answered.
      </P>

      <H2>Reading it back afterwards</H2>
      <P>
        Everything said on both sides lands in the conversation, and messages that came from speech
        are marked <UI>SAID</UI>. Open the conversation later from History and you can read a voice
        session the same way you read a typed one.
      </P>

      <H2>Speaking your own language</H2>
      <List>
        <Item>Pick your language in the account menu and voice replies in it.</Item>
        <Item>
          The copilot never guesses your language from your accent — it uses the one you picked.
        </Item>
        <Item>Changing it during a session takes effect from the next session.</Item>
      </List>

      <Next
        links={[
          {
            href: "/docs/use/language",
            title: "Your language",
            body: "The thirteen, and what stays English.",
          },
          {
            href: "/docs/use/cards",
            title: "The cards",
            body: "The same cards voice puts on screen.",
          },
        ]}
      />
    </DocPage>
  );
}
