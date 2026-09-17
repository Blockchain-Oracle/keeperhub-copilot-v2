# Decisions and status

Short, current, and rewritten as things change. Read this first after a cleared session, then
`PLAN.md` for the live checklist. Evidence lives in `FINDINGS.md` and `../references/_notes/`.
August's retired planning lives in `../legacy/`.

## Decided

| # | Decision | When |
|---|---|---|
| 1 | Only the Copilot is built. The fork/bounty work is parked in `references/keeperhub-fork` (5 commits, never pushed). | 2026-09-12 |
| 2 | Specs, notes and references stay **outside** anything that gets pushed (`references/`, `legacy/` are gitignored). | 2026-09-12 |
| 3 | No spec files. Plan mode, decide, build, keep this file and `PLAN.md` current. | 2026-09-12 |
| 4 | Keep v1's engine, rebuild the shell. `lib/` here is v1's `lib/` unchanged; v1's routes and card logic get ported, its look does not. | 2026-09-12 |
| 5 | **Paint = Portaldot, verbatim.** Violet action colour, cyan telemetry, Portaldot neutrals at hue 282, radius 0.875rem, Geist + Geist Mono + Neue Montreal, grain/perforation/watermark. Supersedes the KeeperHub-green layer and the 21st-hero blue. | 2026-09-12 |
| 6 | **Reference per surface** (strict fidelity): Portaldot = colours, landing, chat page layout, card frame, docs. Masayume = navigation, sign-in modal, onboarding, menus, modals, drawers, toasts, account menu. DeepBookie = card contents and states, charts, history, launcher, extra pages. 21st `heygaia/tool-calls-section` = tool timeline. 21st ChatGPT prompt input = composer. OpenAI Apps SDK UI = where UI appears (inline / fullscreen / picture-in-picture). KeeperHub = what the platform can do. | 2026-09-12 |
| 7 | Add-ons in scope: dry-run in the write card, automations from chat, voice (never confirms), ⌘K palette, share-a-receipt, replies in the user's language. Later, not dropped: counterparty card, provenance mark, diff card. | 2026-09-12 |
| 8 | **"Connect KeeperHub", not "connect wallet".** An outside app signs the user in with KeeperHub OAuth; the org's Turnkey wallet signs. No browser wallet exists in this product. | 2026-09-12 |
| 9 | **v2 starts fresh**: its own empty database (`keeperhub_v2`) and its own KeeperHub sign-in app for `localhost:3001`. v1's database, sign-in app and chats are left alone; only the OpenAI key is shared. | 2026-09-12 |
| 10 | **Old conversations: continue if recent.** Used in the last 30 minutes → opens live. Older → read-only with New chat. An open chat idle 30 minutes turns read-only. (DeepBookie's 30-minute rule applied to reopening too; v1 let any conversation continue.) | 2026-09-13 |
| 11 | **Write cards: edit everything but the action.** Amount, recipient, network, token and the action's own parameters are editable; which action or contract it is stays fixed. Every edit re-runs the dry run and needs the click again. The chat route re-validates the edited input against the tool's schema before re-signing (v1 accepted amount edits only). | 2026-09-13 |
| 12 | **Lookups get a card only when the list is the answer.** A `search_actions` call followed by a read or write stays inside the "Used N tools" line. | 2026-09-13 |
| 13 | **Price chart = recent real Chainlink updates.** The card reads the last 12 rounds once when it appears (not a poll). These lookups are not recorded in the ledger. | 2026-09-13 |
| 14 | **Integration icons = KeeperHub's own logo files** (23 of 34 integrations; letter discs for the rest). Abu accepts the unchecked licensing. | 2026-09-13 |
| 15 | **Docs pages live inside the app's header** (Masayume shell), not the landing's floating nav. | 2026-09-13 |
| 16 | **History opens the conversation itself** (`/app/c/[id]`); the 30-minute rule decides live or read-only. No separate replay view. | 2026-09-13 |
| 17 | **Activity is one list with Actions / Reads / All pills**, starting on Actions. | 2026-09-13 |
| 18 | **Automations: list, details and Run now**, and Run now stops on a confirm card first (creating automations from chat stays slice 8). | 2026-09-13 |
| 19 | **Automations from chat: save off, then Turn on.** The first click saves the automation switched off; the same card then shows KeeperHub's own check and dry run, and a second click (Turn on) starts it. | 2026-09-13 |
| 20 | **The chat can build every start KeeperHub has:** on demand, schedule, every N blocks, contract event, webhook, Tempo payment received. Steps run in a straight line; a condition step continues only when true. | 2026-09-13 |
| 21 | **Chat powers over automations:** list and describe (no click), run now, turn on/off, edit, delete (each a card and a click). | 2026-09-13 |
| 22 | **Landing install box:** the Copilot and Vercel tabs show the settings the copilot really reads. | 2026-09-13 |
| 23 | **The copilot does whatever KeeperHub can do.** Deleting an automation from chat works like KeeperHub's own delete: the automation and its run list go. KeeperHub hides them rather than erasing them, and the copilot's Activity keeps its own record ("Automation deleted") for good. | 2026-09-13 |
| 24 | **Languages come last, after research.** Once everything else is finished: research libraries and OpenAI's language support, then pick languages. The person can speak their language to voice, hear it back, and see the cards in it. | 2026-09-13 |
| 25 | **Small calls Abu leaves to the agent:** whether relative times ("3h ago") use the mono font. The generated account avatars stay. Dialogs on phones slide up from the bottom. Disconnect is red. | 2026-09-13 |
| 27 | **Voice lives in the chat.** The composer's voice button starts it; cards and what both sides said land in that conversation. *(The floating side button was rejected by Abu the same day; see 31.)* | 2026-09-13 |
| 31 | **Composer and voice redesign (Abu, 2026-09-13).** The floating side orb and the old composer are out. References, as inspiration to do better, not copy: 21st `jahed/ai-chat-input` (a pill that springs open as you type and settles when empty, one morphing action button), `jahed/ai-prompt-box` (voice takes over the box itself, dark rounded plate), `botsnew354/ia-siri-chat` (glow, pulse, live waveform). Voice should feel like ChatGPT's: glowing, in place. It is a live conversation with the copilot, not dictation. Code in `references/_notes/21st/21st-{17355,2321,3014}-*`. | 2026-09-13 |
| 28 | **After a voice card:** voice says the result out loud, and the chat writes one short sentence under the card. | 2026-09-13 |
| 29 | **Ten-minute voice sessions.** Voice says a short goodbye and ends; the mic starts a new one. | 2026-09-13 |
| 30 | **Mic muted while a card waits.** It comes back on after authorize or cancel. | 2026-09-13 |
| 32 | **Form cards in chat and voice.** When the assistant needs a detail it doesn't have (a recipient address, an amount, a network, a token, a choice), it pops up a form card (tool `request_input`) instead of asking in words. | 2026-09-13 |
| 33 | **In voice the form pops up above the glowing voice bar**, with a "Use my org wallet" shortcut; the mic mutes while it is open. Once answered it becomes a small record card in the chat and voice carries on. | 2026-09-13 |
| 34 | **The assistant knows the org wallet** (its EVM and Solana addresses) and reads its holdings the way KeeperHub's own wallet page does, so it never asks for the org wallet's address. (Agent, from decision 23's parity rule.) | 2026-09-13 |
| 35 | **Actions KeeperHub runs only inside automations** (every non-protocol plugin action: web3, hyperliquid, blockscout, tempo, the off-chain sends…) stay available as automation steps; chat and voice route around them (a transfer, a contract read, the wallet's holdings) instead of failing. (Agent, parity.) | 2026-09-13 |
| 36 | **⌘K palette: pages, networks, actions.** ⌘K / Ctrl+K anywhere in the app (and a header button) opens one search box. A page opens it, a network switches in place, and an action asks the chat about it with its example prompt; the assistant then asks for missing details with a form card. DeepBookie's docs search for the behaviour, our dialog and paint. (Agent, from decision 7.) | 2026-09-14 |
| 37 | **Shareable receipts: public facts, can be turned off (Abu).** Only an executed action with a transaction can be shared. The link shows the action, network, result, amount, recipient, transaction link and time; never the chat, the org or anything else. Anyone with the link can open it without signing in, search engines are told not to index it, and Stop sharing turns it off for good (sharing again makes a new link). | 2026-09-14 |
| 38 | **Launch languages (Abu):** English plus Spanish, Portuguese (Brazil), French, German, Indonesian, Vietnamese, Korean, Japanese, Chinese (Simplified), Hindi, Russian and Turkish. Left out for now: right-to-left languages (Arabic, Urdu, Persian: layout rework, weaker speech) and languages OpenAI's speech handles poorly (Bengali, Tamil, Swahili, Yoruba, Hausa, Pidgin). Research in `FINDINGS.md` "Languages". | 2026-09-14 |
| 39 | **Languages roll out in two parts (Abu):** first a language picker and chat and voice replying in the chosen language; then the screens (buttons, cards, pages) translated. KeeperHub's action names and descriptions stay English at first. The person picks their language; the app never guesses it from their accent. | 2026-09-14 |
| 40 | **Picking a language (agent, part 1):** English until the person picks one; the browser's language is not used until part 2, when the screens change too. The picker is in the account menu and the ⌘K palette. Switching during a voice session applies from the next session. Amounts typed with a comma ("0,5") are refused with "use a dot", never silently read as 5. | 2026-09-14 |
| 41 | **Screens in 13 languages (Abu):** the agent translates all 12 languages, marked "not yet checked by native speakers" for review later. Everything a person touches is translated (landing, sign-in, menus, chat, cards, voice bar, History, Activity, Automations, shared receipts, toasts, page titles); the docs pages stay English. All 12 languages go in together. | 2026-09-15 |
| 42 | **What stays untranslated (agent):** text written by the server and the platform (route and tool messages, KeeperHub's own errors) stays English, since it also feeds the model and is saved in chats; the screens translate known error codes. Amounts, addresses, hashes, chain ids and UTC times keep Latin digits and a dot in every language. The share preview image stays English. From part 2 the browser's language picks the screens and the replies until the person picks one (supersedes decision 40's "English until picked"). | 2026-09-15 |
| 26 | **Voice waits for the card.** Voice looks things up and puts cards on screen like the chat. When a card needs a click, voice says it is waiting and stops; once the person authorizes or cancels on the card, voice carries on from there. Voice never authorizes anything itself. | 2026-09-13 |
| 43 | **Hosted as its own Vercel project `keeperhub-copilot-v2`** at https://keeperhub-copilot-v2.vercel.app, deployed by CLI from the repo root (no git yet). v1's project `keeperhub-copilot` and its address stay as they were (decision 9). The hosted app uses the same `keeperhub_v2` database as local and a second KeeperHub sign-in client for its own address. (Agent; whether v1's old address should later point at v2 is Abu's call.) | 2026-09-15 |

## Consequences of decisions 5–8 (stated so none are silent)

- Masayume's top header replaces Portaldot's in-app sidebar; Portaldot's prompt starters move into
  the empty-chat launcher.
- Dark only — Portaldot has no light palette, so no theme toggle.
- Failures use Portaldot's destructive tone and VOID stamp. The earlier "never red" line came from
  the retired August specs, not a reference.
- Two Portaldot bugs are not copied: cancelled transfer shown as PAID; "FINALIZED" shown at
  in-block. DeepBookie's cancelled state is used.

## Product rules (Abu's)

Reads run freely. Every write stops as a card and needs a click. Voice can read, propose and
preview, never confirm. Write-card fields are pre-filled and editable; an edit re-arms approval.
Amounts, addresses and hashes are mono and tabular.

## Open — needs Abu

- [x] Which languages: after everything else, with research first (decision 24).
- [x] Relative timestamps mono or not: the agent's call (decision 25).
- [x] DiceBear identicon style: OK (decision 25).
- [ ] Seven chain/token marks svgl lacks (Base, Arbitrum, Optimism, Gnosis, Avalanche, Tempo, USDC) show as coloured letter discs — OK, or source real marks (KeeperHub ships some; licensing unchecked)?
- [x] Dialog on phones: bottom sheet, as built (decision 25).
- [x] Docs pages header: inside the app's header (decision 15).
- [x] Slice 3 look check on `/app` — Abu, 2026-09-12: "looking good, let's continue". Strip lines, menu descriptions, the phone pill's four and the Base Sepolia default stay as built.
- [ ] Slice 4 look check (`/app` signed out, `/dev/onboarding`): the tutorial's five screens, the sign-in modal, the identity card, the first-receipt welcome and the recovery toasts are all the agent's wording.
- [ ] **Later, to discuss:** test money for new users. Abu, 2026-09-13: Sepolia test ETH is hard to get; rather than (or as well as) faucet links, the app could send a new org wallet a small test amount from a funded key of ours. Add funds stays address + QR until then.
- [x] Account menu Disconnect: red (decision 25). Done 2026-09-13.
- [ ] Slice 5 look check (`/app` signed in, after restarting `pnpm dev`): the launcher's eight cards and their wording, the greeting, the composer's plus-menu and network chip, and the archive bar are the agent's choices.
- [x] Slice 6 part A look check. Abu, 2026-09-13: "its works and its cool stuff lets continue". Built wording kept.
- [x] Slice 6 part B look check. Abu, 2026-09-13: "its works and its cool stuff lets continue". Built wording kept.
- [x] Landing Install section: Copilot and Vercel tabs get the real setup (decision 22, slice 8 part B).
- [ ] Slice 7 look check (signed in, desktop + ~390px): History cards, Activity table and pills, the docs pages, the Automations board, an automation's detail and the Run now card. Copy and the On demand status name are the agent's choices.
- [ ] Slice 8 part A look check (signed in, desktop + ~390px): the automation proposal card, the KeeperHub check block, Turn on on a saved automation, and the list and describe cards. Every line of card copy, the SAVED · OFF / LIVE labels and the "moves value" pill are the agent's choices. *(Abu, 2026-09-13: "let keep building" before trying it; folded into the part B walk.)*
- [ ] Slice 8 part B look check (signed in, desktop + ~390px): the change card's "What changes" list, the run card following a run to EXECUTED / VOID, the delete card, Turn on / Turn off on an automation's page, Activity's automation names and outcome words, the board's "Create one in chat", and the landing's Copilot and Vercel tabs. Card copy, the SAVED / EXECUTED / VOID / DELETED stamps, the outcome words (Saved, On, Off, Deleted, Running) and the reworded install subtitle are the agent's choices.
- [x] Deleting from chat takes the run history too, as KeeperHub's own delete does (decision 23). Built that way.
- [ ] Slice 9 look check (signed in, desktop + ~390px): the voice button (ring, pulse, bubble, Mute / End), the composer's mic and "Voice is on" hint, the SAID mark, and how voice sounds and phrases things. Every voice line and label is the agent's wording.
- [x] **Starters vs the selected network** (slice 13.5, agent): a starter the selected network cannot run names a network it can ("…on Ethereum?") rather than being hidden — all eight cards stay, and these are reads, so nothing moves. Abu can still choose hiding or switching the header network instead.
- [ ] **The revamp** (slice 14, Abu 2026-09-17): rework the colours and add interface sounds. Parked until slice 13's fixes are done; supersedes decision 5 if it goes ahead.
- [ ] **Hosted walk** (slice 12): sign in on https://keeperhub-copilot-v2.vercel.app — the first proof of the hosted sign-in round trip — then the usual walk. Later: point v1's address `keeperhub-copilot.vercel.app` at v2, or keep both?
- [ ] The app ships no favicon (blank tab icon locally and hosted). Portaldot's mark, or KeeperHub's?
## Next

See `PLAN.md`.
