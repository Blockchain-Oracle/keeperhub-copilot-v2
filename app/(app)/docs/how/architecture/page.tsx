import type { Metadata } from "next";

import { ArchitectureDiagram } from "@/components/docs/architecture-diagram";
import { Code, DocPage, DocTable, H2, Item, List, Next, Note, P, UI } from "@/components/docs/prose";
import { integrations, registryMeta } from "@/lib/registry";

export const metadata: Metadata = { title: "How it connects" };

const INTEGRATIONS = Object.keys(integrations).length;

export default function ArchitecturePage() {
  return (
    <DocPage
      eyebrow="Under the hood"
      title="How it connects"
      lede="What actually happens between the sentence you type and the transaction on the chain — and which part is responsible for what."
    >
      <ArchitectureDiagram />

      <H2>The parts</H2>
      <DocTable
        head={["Part", "What it is responsible for"]}
        rows={[
          [
            "This app",
            "Understanding what you asked for, choosing an action, filling it in, and showing it to you. It holds no keys and signs nothing.",
          ],
          [
            "KeeperHub",
            "Actually running the action: gas, ordering, retries, and the connections to each protocol.",
          ],
          [
            "Your org wallet",
            "Signing. It lives in a secure enclave on KeeperHub's side, not in your browser and not here.",
          ],
          [
            "The chain",
            "The only thing that decides whether something happened.",
          ],
          [
            "The ledger",
            "This app's own record of what ran, kept apart from the conversation it came from.",
          ],
        ]}
      />

      <H2>Where the {registryMeta.actionCount} actions come from</H2>
      <P>
        They are not written by hand. They are generated from KeeperHub&apos;s own registry — the same
        list the platform uses — across {INTEGRATIONS} integrations, and pinned to a snapshot so the
        set the copilot offers is a known, fixed set rather than whatever happened to be there.
      </P>
      <P>
        Each action is classified by what it does with value. That classification comes from the
        registry too, not from a list someone maintains here. Anything the classifier cannot place is
        quarantined and refuses to run at all, rather than being guessed at.
      </P>

      <H2>One door</H2>
      <P>
        Every tool the model can call goes through a single function in this app. Not most of them —
        all of them. The model has no way to reach KeeperHub around it.
      </P>
      <P>That door does the same five things every time:</P>
      <List>
        <Item>
          <UI>Resolve</UI> — which action is this, really?
        </Item>
        <Item>
          <UI>Gate</UI> — is this a question, or does it move value? A question passes straight
          through. Anything else stops and becomes a card.
        </Item>
        <Item>
          <UI>Validate</UI> — do the arguments match the action&apos;s own schema? Including after you
          have edited them.
        </Item>
        <Item>
          <UI>Call</UI> — hand it to KeeperHub.
        </Item>
        <Item>
          <UI>Map</UI> — turn whatever came back into something a card can show and the model can
          explain.
        </Item>
      </List>
      <P>
        Nothing in there throws. A refusal, a rate limit and a failure all come back as an ordinary
        answer the model can read, so the conversation carries on and tells you what happened instead
        of dying.
      </P>

      <H2>What freezes when</H2>
      <Note>
        <p>
          The arguments freeze the moment the card renders. What executes is what you approved, field
          for field — not whatever the model says next. Editing a field re-runs the check and re-arms
          the button, so an edit can never slip past the look you took.
        </p>
      </Note>

      <H2>How it talks to KeeperHub</H2>
      <P>
        Over KeeperHub&apos;s MCP endpoint, with your session&apos;s access token. The client that
        does it is deliberately small and deliberately ignorant: it knows how to make the call and
        nothing else — not your session, not the database, not the ledger. It refuses redirects, so a
        redirect can never walk a request somewhere else, and it does not retry by default. The one
        retry it will do is a question that timed out, when the server itself said how long to wait.
      </P>

      <H2>Why a receipt is not an acknowledgement</H2>
      <P>
        A protocol action does not finish when KeeperHub accepts it. KeeperHub answers to say it has
        the job, and settles it afterwards. So the copilot waits and reads the outcome back: a
        transaction hash and a status from the chain, or a failure with its reason.
      </P>
      <P>
        This is why a card stamped <UI>EXECUTED</UI> always carries a hash and an explorer link. If it
        cannot show you those, it does not claim success.
      </P>

      <H2>Signing in</H2>
      <P>
        Sign-in is KeeperHub&apos;s own, over OAuth. This app never sees your password. What it gets
        is a session bound to your account and your organisation, which is what the one door presents
        when it calls. <Code>Disconnect</Code> ends that session here and nothing else.
      </P>

      <Next
        links={[
          {
            href: "/docs/actions",
            title: "Every action",
            body: "The generated catalogue itself.",
          },
          {
            href: "/docs/builders/mcp",
            title: "MCP setup",
            body: "Pointing your own client at the same registry.",
          },
        ]}
      />
    </DocPage>
  );
}
