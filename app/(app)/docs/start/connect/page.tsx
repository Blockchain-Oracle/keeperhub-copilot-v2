import type { Metadata } from "next";

import { GuideShot } from "@/components/docs/guide-shot";
import { Code, DocPage, H2, Item, List, Next, Note, P, Step, Steps, UI } from "@/components/docs/prose";

export const metadata: Metadata = { title: "Connect KeeperHub" };

export default function ConnectPage() {
  return (
    <DocPage
      eyebrow="Start here"
      title="Connect KeeperHub"
      lede="You sign in with your KeeperHub account, not a browser wallet. Nothing to install, and nothing to paste."
    >
      <Steps>
        <Step n={1} title="Open the app and choose Connect KeeperHub">
          <P>
            The button is in the top right on a computer, and on the identity card in the middle of
            the screen before you have signed in. Either one takes you to KeeperHub.
          </P>
        </Step>
        <Step n={2} title="Approve it on KeeperHub's page">
          <P>
            You land on KeeperHub&apos;s own sign-in, on their domain. You sign in there — this app
            never sees your password — and KeeperHub asks whether to let the copilot act for your
            organisation. Approve, and you come straight back.
          </P>
        </Step>
        <Step n={3} title="You arrive back where you were">
          <P>
            If you typed something before signing in, it is still there and is sent for you. If you
            came from a link, you land on that page.
          </P>
        </Step>
      </Steps>

      <GuideShot
        name="sign-in"
        caption="The identity card before you connect. Nothing on this screen can move anything."
      />

      <H2>What signs things</H2>
      <P>
        Your organisation has a wallet on KeeperHub, held in a secure enclave. That wallet is what
        signs — the copilot never holds a key, and neither does your browser. It has an address on
        EVM networks and one on Solana, and the copilot already knows both, so it never asks you for
        your own address.
      </P>
      <P>
        You can see it at any time from the account menu in the top right, along with what it holds
        on each network.
      </P>

      <Note>
        <p>
          There is no <UI>connect wallet</UI> step and no browser extension. If a page ever asks you
          to paste a private key or a seed phrase, it is not this app.
        </p>
      </Note>

      <H2>Putting something in it</H2>
      <P>
        A brand-new organisation wallet is empty, and an action that moves value needs something to
        move and a little of the network&apos;s own token for the fee. Open the account menu and
        choose <UI>Add funds</UI>: it shows the wallet&apos;s address and a QR code for the network
        you are on.
      </P>
      <List>
        <Item>
          The network you send to has to match the one selected in the header. Sending on the wrong
          network puts the funds somewhere the copilot is not looking.
        </Item>
        <Item>
          On a test network, use that network&apos;s faucet to get its token. The copilot starts on{" "}
          <Code>Base Sepolia</Code>, which is a test network, so nothing you do there is real money.
        </Item>
      </List>

      <H2>Signing out</H2>
      <P>
        <UI>Disconnect</UI> is at the bottom of the account menu. It ends this app&apos;s session.
        Your KeeperHub account, your organisation and its wallet are untouched, and so is everything
        in Activity.
      </P>

      <Next
        links={[
          {
            href: "/docs/start/first-answer",
            title: "Ask your first question",
            body: "Costs nothing and moves nothing.",
          },
          {
            href: "/docs/use/getting-around",
            title: "Getting around",
            body: "The network picker, search and sound.",
          },
        ]}
      />
    </DocPage>
  );
}
