import type { Metadata } from "next";

import { DocPage, DocTable, H2, Next, P } from "@/components/docs/prose";

export const metadata: Metadata = { title: "Glossary" };

export default function GlossaryPage() {
  return (
    <DocPage
      eyebrow="Need a hand?"
      title="Glossary"
      lede="Every word these pages use, in plain terms. No prior knowledge assumed."
    >
      <H2>Things in this app</H2>
      <DocTable
        head={["Word", "What it means"]}
        rows={[
          ["Action", "One thing KeeperHub can do — read a price, send a token, supply to a lending pool. The copilot picks one for you."],
          ["Card", "How an answer arrives. Not a payment card."],
          ["The check", "KeeperHub trying an action without sending it, so you find out beforehand whether it would work. Also called a dry run."],
          ["Receipt", "Proof an action happened, read back off the chain: a transaction hash, a block and a status."],
          ["Stamp", "The word across a finished card — EXECUTED, VOID, CANCELLED."],
          ["Ledger", "This app's own record of what ran, kept apart from the conversation. You see it as Activity."],
          ["Automation", "Something KeeperHub keeps doing after you describe it once."],
          ["Trigger", "What starts an automation: a schedule, a contract event, a webhook, a payment."],
          ["Step", "One action inside an automation. Steps run in order."],
          ["Integration", "A protocol or service KeeperHub can work with — Aave, Uniswap, Chainlink and so on."],
        ]}
      />

      <H2>Things on the chain</H2>
      <DocTable
        head={["Word", "What it means"]}
        rows={[
          ["Onchain", "Recorded on a public blockchain, where anyone can check it and nobody can quietly change it."],
          ["Network / chain", "One blockchain. Ethereum and Base are different networks; the same address can hold different things on each."],
          ["Testnet", "A practice network. The tokens are not worth anything. Base Sepolia is one."],
          ["Gas", "The fee for doing something on a network, paid in that network's own token. Measured in gwei."],
          ["Transaction hash", "The unique id of something that happened on a chain. You can paste it into an explorer."],
          ["Block", "A batch of transactions. Being in a block is what makes something final."],
          ["Explorer", "A public website for looking up any transaction or address on a network."],
          ["Token", "Something of value on a network. USDC and ETH are tokens."],
          ["Wallet", "An address that holds tokens and can sign. Yours belongs to your organisation and lives on KeeperHub."],
          ["Allowance", "Permission you give a contract to spend a token on your behalf, up to a limit. Some actions need one first."],
          ["Contract", "A program living at an address on a chain. Protocols are built out of them."],
          ["Revert", "A transaction failing and undoing itself. Nothing moves, but the fee is still spent."],
          ["Oracle / feed", "Where a price comes from. Chainlink is one."],
          ["APY", "What a deposit earns over a year, as a percentage, if the rate held."],
        ]}
      />

      <H2>Words about this app&apos;s plumbing</H2>
      <P>You will not need these to use it, but they turn up in the architecture page.</P>
      <DocTable
        head={["Word", "What it means"]}
        rows={[
          ["MCP", "A standard way for an AI client to reach a set of tools. KeeperHub runs one, and so can you."],
          ["Registry", "KeeperHub's own list of every action it can do. The copilot's actions are generated from it."],
          ["Snapshot", "A pinned copy of that list, so the set of actions on offer is fixed and known."],
          ["OAuth", "Signing in with another service without giving this one your password."],
          ["Secure enclave", "Hardware that holds a key and will sign with it but never hand it over. Where your organisation's wallet lives."],
        ]}
      />

      <Next
        links={[
          {
            href: "/docs/help/troubleshooting",
            title: "When it looks wrong",
            body: "What each message is asking you to do.",
          },
          {
            href: "/docs/how/architecture",
            title: "How it connects",
            body: "Where these words fit together.",
          },
        ]}
      />
    </DocPage>
  );
}
