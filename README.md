<p align="center">
  <a href="https://keeperhub-copilot-v2.vercel.app">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Blockchain-Oracle/keeperhub-copilot-v2/main/docs/assets/brand/copilot-banner-dark.png" />
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Blockchain-Oracle/keeperhub-copilot-v2/main/docs/assets/brand/copilot-banner-light.png" />
      <img src="https://raw.githubusercontent.com/Blockchain-Oracle/keeperhub-copilot-v2/main/docs/assets/brand/copilot-banner-dark.png" width="960" alt="KeeperHub Copilot — everything KeeperHub does, just ask. 442 actions, 34 integrations, 24 networks, 13 languages." />
    </picture>
  </a>
</p>

<h1 align="center">KeeperHub Copilot</h1>
<p align="center">Everything KeeperHub does. Just ask.</p>

<p align="center">
  <a href="https://youtu.be/SKPaus_YVHI"><b>▶ Watch the demo</b></a>
  &nbsp;·&nbsp;
  <a href="https://keeperhub-copilot-v2.vercel.app"><b>Open the app</b></a>
  &nbsp;·&nbsp;
  <a href="https://keeperhub-copilot-v2.vercel.app/docs"><b>Documentation</b></a>
  &nbsp;·&nbsp;
  <a href="https://keeperhub-copilot-v2.vercel.app/docs/start/first-action"><b>Your first action</b></a>
  &nbsp;·&nbsp;
  <a href="https://keeperhub-copilot-v2.vercel.app/docs/how/architecture"><b>Architecture</b></a>
  &nbsp;·&nbsp;
  <a href="https://keeperhub-copilot-v2.vercel.app/docs/actions"><b>Every action</b></a>
</p>

---

<p align="center">
  <a href="https://keeperhub-copilot-v2.vercel.app/app">
    <img src="https://raw.githubusercontent.com/Blockchain-Oracle/keeperhub-copilot-v2/main/docs/assets/brand/copilot-app-home.png" width="960" alt="The KeeperHub Copilot app: KeeperHub online on 24 networks, 'What should KeeperHub do for you?', and a fan of cards to start from — Prices, Your org wallet, Send to yourself with its Approve and Cancel, Liquid staking and Rocket Pool — above the Ask KeeperHub box." />
  </a>
</p>

**KeeperHub** automates anything onchain — it reads prices and balances, moves tokens, drives lending
and staking protocols, and keeps workflows running on a schedule, a contract event or a payment. It
signs with your organisation's own non-custodial wallet and handles gas, nonces, ordering and retries.

**KeeperHub Copilot is how a person uses it without learning any of that.** You say what you want in
your own words. It resolves which of KeeperHub's **442 actions** across **34 integrations** you meant,
fills the action in, shows you every field before anything happens, has KeeperHub dry-run it, and only
then — on your click — asks KeeperHub to execute. The receipt is read back off the chain.

There is no browser wallet. You sign in with KeeperHub over OAuth; the organisation's Turnkey wallet
signs.

## Watch it work

<p align="center">
  <a href="https://youtu.be/SKPaus_YVHI">
    <img src="https://raw.githubusercontent.com/Blockchain-Oracle/keeperhub-copilot-v2/main/docs/assets/brand/copilot-demo-cover.jpg" width="720" alt="Play the KeeperHub Copilot demo on YouTube. Just ask. Check the card. Watch it land." />
  </a>
</p>

<p align="center">
  <a href="https://youtu.be/SKPaus_YVHI"><b>▶ Watch the demo on YouTube · 4:51</b></a>
</p>

Under five minutes, all on the hosted app: signing in with KeeperHub, then a transfer that stops on a
card — dry-run first, amount and address edited, then authorized — and the same transfer showing up in
KeeperHub's own dashboard. After that, an automation from one sentence ("tell me when gas drops below
20 gwei") switched on and listed among KeeperHub's workflows, and the whole app switched into Japanese.
Last, a voice session that sets up a transfer but still waits for your click — and then answers in French.

## "KeeperHub already has an MCP"

It does, and this is built on it. Every read and write here goes through KeeperHub's own MCP server.
The difference is who gets to use it.

KeeperHub's MCP is for developers who already live in an AI client. You create a `kh_` API key, wire
it into Claude Code or Cursor, and what comes back is JSON — the server answers every tool call as
`{ type: "text", text: JSON.stringify(data, null, 2) }`
([`lib/mcp/tools.ts`](https://github.com/KeeperHub/keeperhub/blob/staging/lib/mcp/tools.ts) in
KeeperHub's repo). The one AI feature inside KeeperHub's own app generates edits to the workflow
canvas; it does not answer questions or run actions. And there is no language but English.

KeeperHub Copilot is KeeperHub for everyone else.

| | KeeperHub MCP | KeeperHub Copilot |
| --- | --- | --- |
| **Who it is for** | Developers with an AI client and an API key | Anyone with a KeeperHub account |
| **Getting started** | Create a `kh_` key, configure Claude Code or Cursor | Open a browser, sign in with KeeperHub |
| **What an answer looks like** | Pretty-printed JSON | A card — a price with its feed and history, a balance, a receipt |
| **Before value moves** | Whatever your client happens to ask | Every field shown and editable, KeeperHub's dry run, the button re-arms on any edit |
| **After value moves** | An execution id | The receipt read back off the chain, `EXECUTED` or `VOID`, an explorer link, a permanent ledger |
| **Languages** | English | 13 — the screens, the answers and the voice |
| **Voice** | — | A full voice session that can propose but never authorize |
| **Automations** | Tool calls, or AI-generated canvas edits | One sentence in chat, saved off, switched on with a click |

## What it does

| | |
| --- | --- |
| **Ask in plain language** | Questions answer immediately and move nothing. 13 languages, picked by you, never guessed from your accent. |
| **Every write stops on a card** | Amount, recipient, network, token and the action's own parameters — all filled in, all editable. An edit re-runs the check and re-arms the button. |
| **KeeperHub checks it first** | A dry run before anything is signed. A predicted revert is shown as "this would not succeed", with the reason, and the card stays open. |
| **A receipt, not an acknowledgement** | `EXECUTED` requires a transaction hash and a status read back off the chain. A failure is stamped `VOID` and never dressed up. |
| **Voice** | The same copilot out loud, with the same cards. It can read, propose and preview — it can never authorize. That takes a click. |
| **Automations from a sentence** | All six KeeperHub trigger types. Saved switched **off**; a second, separate click starts it. |
| **A record that outlives the chat** | Executions are written to a ledger separate from the transcript, so deleting a conversation never deletes the evidence. |
| **Shareable receipts** | Public onchain facts only — never the chat, never the org. Revocable for good. |

## Documentation

The full guide is in the app. It is written for people using it, not for developers.

| What you want | Page |
| --- | --- |
| What this even is | [What this is](https://keeperhub-copilot-v2.vercel.app/docs) |
| Sign in and fund the wallet | [Connect KeeperHub](https://keeperhub-copilot-v2.vercel.app/docs/start/connect) |
| Ask something that costs nothing | [Ask your first question](https://keeperhub-copilot-v2.vercel.app/docs/start/first-answer) |
| Move value, end to end | [Your first action](https://keeperhub-copilot-v2.vercel.app/docs/start/first-action) |
| Read any card and every stamp | [The cards](https://keeperhub-copilot-v2.vercel.app/docs/use/cards) |
| Talk to it | [Talking to it](https://keeperhub-copilot-v2.vercel.app/docs/use/voice) |
| Build something that keeps running | [Automations](https://keeperhub-copilot-v2.vercel.app/docs/use/automations) |
| Find what ran, and share a receipt | [History and Activity](https://keeperhub-copilot-v2.vercel.app/docs/use/record) |
| Use it in your language | [Your language](https://keeperhub-copilot-v2.vercel.app/docs/use/language) |
| How it connects to KeeperHub | [Architecture](https://keeperhub-copilot-v2.vercel.app/docs/how/architecture) |
| Point your own client at KeeperHub | [MCP setup](https://keeperhub-copilot-v2.vercel.app/docs/builders/mcp) |
| Run your own copy | [Run it yourself](https://keeperhub-copilot-v2.vercel.app/docs/builders/self-host) |
| A word you do not know | [Glossary](https://keeperhub-copilot-v2.vercel.app/docs/help/glossary) · [When it looks wrong](https://keeperhub-copilot-v2.vercel.app/docs/help/troubleshooting) |

## How the parts connect

<p align="center">
  <a href="https://keeperhub-copilot-v2.vercel.app/docs/how/architecture">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Blockchain-Oracle/keeperhub-copilot-v2/main/docs/assets/brand/copilot-architecture-dark.png" />
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Blockchain-Oracle/keeperhub-copilot-v2/main/docs/assets/brand/copilot-architecture-light.png" />
      <img src="https://raw.githubusercontent.com/Blockchain-Oracle/keeperhub-copilot-v2/main/docs/assets/brand/copilot-architecture-dark.png" width="960" alt="You ask in the browser. The chat picks an action and every call goes through one door. A question goes straight through to KeeperHub. Anything that moves value stops as a card and waits for your click. Once you authorize, KeeperHub runs it, the org wallet signs it and it lands on the chain. The receipt is read back off the chain and kept in the ledger." />
    </picture>
  </a>
</p>

- **One door.** Every tool the model can call goes through a single function, `routeToolCall` in
  [`lib/execution/index.ts`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/lib/execution/index.ts). Not most of them — all of them. The AI SDK has
  no path to KeeperHub around it. The door resolves the action, gates it by effect, validates the
  arguments against the action's own schema, calls KeeperHub, and maps whatever comes back.
- **Reads pass, writes stop.** The effect classification comes from KeeperHub's registry, not from a
  hand-maintained list. Anything the classifier cannot place is quarantined and refuses to run.
- **Arguments freeze when the card renders.** What executes is what you approved, field for field.
  Editing re-runs the dry run and re-arms the button, so an edit cannot slip past the look you took.
- **Nothing throws.** A refusal, a rate limit and a failure all return as structured output the model
  can explain, so the conversation continues instead of dying.

## How this uses KeeperHub

Every surface, what it is used for, and where to read the code.

| KeeperHub surface | Used for | Code |
| --- | --- | --- |
| **MCP server** (streamable HTTP, JSON-RPC) | Every read and every write. A hand-rolled client — deliberately **not** `@ai-sdk/mcp`, whose `.tools()` would auto-execute around the gate. | [`lib/mcp/index.ts`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/lib/mcp/index.ts) · [`lib/mcp/wire.ts`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/lib/mcp/wire.ts) |
| **Action registry** | All 442 tools are generated from KeeperHub's own registry and pinned to snapshot `sha256:a53bf5a5…` (source commit `9d510a1`). CI rejects hand edits. | [`lib/registry/`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/tree/main/lib/registry) · [`scripts/generate-registry.ts`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/scripts/generate-registry.ts) |
| **Dry run / simulate** | The check on every write card before it can be authorized. | [`app/api/chat/simulate`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/tree/main/app/api/chat/simulate) · [`components/cards/write-card-parts.tsx`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/components/cards/write-card-parts.tsx) |
| **Execution + receipt poll** | A protocol write returns `202 {executionId, status}` and settles out of band, so the app polls for the terminal state and its transaction hash rather than trusting the ack. | [`lib/execution/index.ts`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/lib/execution/index.ts) |
| **Agent-authored workflows** | Automations composed from a sentence, across all six trigger types, saved off and started by a second click. | [`lib/automations/`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/tree/main/lib/automations) · [`components/cards/automation-card.tsx`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/components/cards/automation-card.tsx) |
| **Audit trail** | This app's own ledger, written as durable facts separate from the transcript. | [`lib/ledger/`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/tree/main/lib/ledger) · [`components/pages/activity.tsx`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/tree/main/components/pages) |
| **OAuth sign-in** | KeeperHub is the identity provider; the org's Turnkey wallet signs. No key is held here. | [`lib/session/`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/tree/main/lib/session) · [`app/api/auth`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/tree/main/app/api/auth) |
| **Org wallet + holdings** | The assistant knows the org's EVM and Solana addresses and reads its holdings, so it never asks you for your own address. | [`lib/wallet/`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/tree/main/lib/wallet) · [`lib/holdings.ts`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/lib/holdings.ts) |

## Execution evidence

Real contract calls composed in the chat, authorized on a card, and executed through KeeperHub.
Both were verified on chain by reading the receipt back — not by trusting the acknowledgement — and
both ran with KeeperHub's sponsored gas.

Network: **Ethereum Sepolia (11155111)**. This is testnet; see [What is unfinished](#what-is-unfinished).

| What ran | Transaction | Block | KeeperHub execution |
| --- | --- | --- | --- |
| `deposit()` on WETH9 — wrapping 0.01 ETH | [`0xe00f4897…29d6bc`](https://sepolia.etherscan.io/tx/0xe00f48977c50cd3a7b8bc10f2b06379ff3ca025e5136add0159818ea0829d6bc) | 11721925 | `8pl4ybwwgn9tanlst7ern` |
| `approve(spender, amount)` — 0.01 WETH to the Aave v3 pool | [`0xbdc610fc…69a9ad`](https://sepolia.etherscan.io/tx/0xbdc610fc1f7d562dfca47856a8003dec39fa164e77f805a43a7e774a3a69a9ad) | 11721932 | `pjcexb9xhmlge7o2u50kc` |

<details>
<summary>What the ledger stored for the first one</summary>

```json
{
  "status": "completed",
  "network": "11155111",
  "executionId": "8pl4ybwwgn9tanlst7ern",
  "sponsored": true,
  "gasUsedUnits": "73925",
  "receipts": [
    {
      "hash": "0xe00f48977c50cd3a7b8bc10f2b06379ff3ca025e5136add0159818ea0829d6bc",
      "chainId": 11155111,
      "blockNumber": 11721925,
      "receiptStatus": "success",
      "verified": true,
      "verifiedAt": "2026-09-17T06:15:52.568Z"
    }
  ]
}
```

`verified: true` is the point. The app polls KeeperHub for the terminal state and reads the receipt
off the chain; a card only reaches `EXECUTED` once that has come back. See
[`lib/execution/index.ts`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/lib/execution/index.ts).
</details>

## Running it yourself

```bash
pnpm install
cp .env.example .env.local   # then fill it in
pnpm dev
```

The eight settings are documented on [Run it yourself](https://keeperhub-copilot-v2.vercel.app/docs/builders/self-host).
The copilot signs in with KeeperHub, so it needs only its own settings — the sign-in client is
registered against one exact callback address, so a copy running elsewhere needs its own.

```bash
pnpm typecheck && pnpm lint && pnpm test   # 975 tests in 83 files
pnpm build
```

**Stack.** Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind v4 (CSS-first) · Base UI ·
Vercel AI SDK with OpenAI · OpenAI Realtime for voice · Drizzle + Postgres · next-intl (13 locales) ·
Vitest.

## What is unfinished

Candidly, because a README that only lists wins is not much use to anyone picking this up.

- **The nine documentation screen captures are not taken.** Each renders a "capture pending"
  placeholder rather than a broken image. The pages read without them.
- **The 12 translations are machine-produced** and complete — key parity, ICU arguments and rich-text
  tags are enforced by [`tests/i18n/messages.test.ts`](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/tests/i18n/messages.test.ts) — but **none has
  been reviewed by a native speaker**.
- **The sign-in screen still says "Insert your credentials"**, which is wrong: nothing is inserted,
  you click one button. Rewording it touches all 13 locales.
- **Interface sound is new and lightly exercised.** Cues fire on the write ceremony, the form card and
  voice; reads are deliberately silent.
- **Mainnet is untested at scale.** Development and the walkthroughs run on **Base Sepolia**. Real
  protocol writes have been executed through KeeperHub on the hosted app (Aave v3 supply/borrow,
  WETH deposit, ERC-20 approve), but this has not been run in volume against mainnet.
- **No automated end-to-end browser test.** The suite is unit and integration; the walk is manual.

## Licence

MIT. See [LICENSE](https://github.com/Blockchain-Oracle/keeperhub-copilot-v2/blob/main/LICENSE).
