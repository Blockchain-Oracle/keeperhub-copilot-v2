import type { Metadata } from "next";

import { GuideShot } from "@/components/docs/guide-shot";
import { DocPage, DocTable, H2, Item, List, Next, Note, P, Step, Steps, UI } from "@/components/docs/prose";

export const metadata: Metadata = { title: "Automations" };

export default function AutomationsPage() {
  return (
    <DocPage
      eyebrow="Using it"
      title="Automations"
      lede="An automation is something KeeperHub keeps doing after you describe it once. You build one by saying it, and it does not start until you switch it on."
    >
      <H2>Describing one</H2>
      <Steps>
        <Step n={1} title="Say what should happen, and when">
          <P>
            &ldquo;Tell me when gas drops below 20 gwei&rdquo;. &ldquo;Every morning, check the USDC
            balance and let me know&rdquo;. &ldquo;When this contract emits Transfer, send me a
            message&rdquo;. The <em>when</em> is the important half — it becomes the trigger.
          </P>
        </Step>
        <Step n={2} title="Read the proposal card">
          <P>
            The copilot shows the whole workflow before it exists: the trigger, then each step in
            order. Steps run one after another, and a condition step only carries on when it is true.
          </P>
        </Step>
        <Step n={3} title="Save it — switched off">
          <P>
            Your first click saves it <UI>off</UI>. Nothing is running. The card then shows
            KeeperHub&apos;s own check of the workflow and a preview of what it would do.
          </P>
        </Step>
        <Step n={4} title="Turn it on">
          <P>
            A second, separate click starts it. Two clicks, because saving something and letting it
            loose are different decisions.
          </P>
        </Step>
      </Steps>

      <GuideShot
        name="automation-card"
        caption="An automation proposed from a sentence, saved but not yet running."
      />

      <H2>The six ways one can start</H2>
      <P>These are KeeperHub&apos;s own triggers. The copilot can build any of them.</P>

      <DocTable
        head={["Trigger", "When it runs"]}
        rows={[
          ["On demand", "Only when you say so."],
          ["On a schedule", "Every hour, every morning, the first of the month."],
          ["Every N blocks", "Counted on the chain itself, not on a clock."],
          ["On a contract event", "A log fires and the steps run."],
          ["On a webhook", "Anything that can make a request can start it."],
          ["On a payment", "Money arrives and the workflow picks it up."],
        ]}
      />

      <H2>Living with them</H2>
      <P>
        Everything you can do on the <UI>Automations</UI> page you can also do by asking in chat.
      </P>
      <List>
        <Item>
          <UI>List and describe</UI> — no click needed, it is only reading.
        </Item>
        <Item>
          <UI>Run now</UI> — stops on a card first, because running one moves things.
        </Item>
        <Item>
          <UI>Turn on or off</UI>, <UI>edit</UI>, <UI>delete</UI> — each one a card and a click.
        </Item>
      </List>
      <P>
        An edit card lists <UI>what changes</UI> before you agree to it, so you are never comparing
        two versions in your head.
      </P>

      <Note tone="warn">
        <p>
          Deleting an automation takes its run history with it, exactly as deleting one on KeeperHub
          does. Your Activity here keeps its own line saying the automation was deleted, and that
          stays.
        </p>
      </Note>

      <H2>Steps that only exist here</H2>
      <P>
        Some of KeeperHub&apos;s actions only run inside a workflow. They are all available as
        automation steps. When you ask for one of those in chat directly, the copilot routes around it
        rather than failing — it uses the equivalent it can run there and then.
      </P>

      <Next
        links={[
          {
            href: "/docs/actions",
            title: "Every action",
            body: "What can go in a step, across every integration.",
          },
          {
            href: "/docs/use/record",
            title: "History and Activity",
            body: "Where the runs show up.",
          },
        ]}
      />
    </DocPage>
  );
}
