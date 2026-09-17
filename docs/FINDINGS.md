# Copilot v2 — fidelity findings, 2026-09-12

Read-back artifact: https://claude.ai/code/artifact/8ffe8cf5-9536-4f48-8563-35bd40d6f12f

Method: `reference-product-fidelity` skill. Every claim resolves to a path or commit.

## Pinned references (`references/`)

| Repo | Commit | Role |
|---|---|---|
| keeperhub-fork | `946eeb5c9` (2026-09-12) | **Design + platform authority** |
| keeperhub | `6d888da1` (2026-08-28) | stale by 2 weeks; superseded by the fork |
| masayume | `68f7a09` | auth modal / onboarding |
| deepbookie | `0f1013b` | history, archived sessions |
| portaldot-mcp | `86699dc` | landing-page composer |
| midl-ai-frontend | `aac395e` (Feb 2026) | voice UX shape only — API is outdated |
| midl-ai-mcp-server | `7efb9c6` | — |
| stacks-frontend | `ed80e61` | — |
| vechain-terminal-mcp | `eeb64ac` | — |

Working tree studied: `/Users/abu/dev/hackathon/keeperhub-copilot` (the v1 app).

## Root cause of "boring" — three facts

1. **Token-level mismatch.** `keeperhub-copilot/app/globals.css` = warm paper `#e9e9e6` + lime `#c2e84b`.
   KeeperHub = blue-slate `#171f2e` + electric green `#09fd67`. Zero shared values.
2. **Rendering in Arial.** Copilot asks for Founders Grotesk Condensed + Söhne; its own comment admits both
   are "commercial and unlicensed in this repo". KeeperHub uses **Anek Latin** (free, Google Fonts).
3. **No `public/` directory exists.** Zero logos across 34 integrations. KeeperHub ships 25 protocol marks.

KeeperHub carries a portable three-layer token file at `specs/design-system/tokens.css` plus eight component
specs (`protocol-card.md`, `navigation-sidebar.md`, `action-grid.md`, …). Do not eyeball; port it.

## Keep (the engine)

- **442 actions / 34 integrations**, generated from KeeperHub commit `9d510a1`, snapshot-hashed,
  hand-edits rejected by CI regen-diff. `lib/registry/generated/meta.ts`
- **Realtime projection already exists**: `realtimeParameters` baked per action
  (`lib/registry/types.ts:146`); `surfaceRealtimeTools` exported at `lib/registry/surface-tools.ts:221`,
  annotated *"Epic 4 consumes this unchanged"*. **Voice was architected in and never built.**
- **Effect gate**: 292 `read` / 127 `value-moving-write` / 15 `authorization-grant` / 6 `off-chain-send`
  / 2 `quarantined`. `lib/registry/effect-class.ts`
- `components/cards/money-mover.ts`, `lib/execution/` (1,748 L), `lib/ledger/`, `lib/transcript/`
- `app/api/chat/simulate/route.ts` + `lib/registry/simulatability.ts` — **built, never surfaced**

## Voice policy (derived, not invented)

`effectClass !== "read"` → `needsApproval: true`. 292 reads run freely in voice; the 148 effectful
actions return a frozen proposal rendered as a card that a hand approves.

Current API (midl-ai is two versions behind):

| | midl-ai (Feb 2026) | current |
|---|---|---|
| model | `gpt-4o-realtime-preview-2024-12-17` | `gpt-realtime-2.1` |
| token endpoint | `/v1/realtime/sessions` | `/v1/realtime/client_secrets` |
| client | hand-rolled WebRTC | `RealtimeAgent`/`RealtimeSession` from `@openai/agents/realtime` |
| guard | hand-maintained `TRANSACTION_TOOLS` Set | `needsApproval` → `session.approve()` |

One confirm ceremony serves three surfaces: chat card, voice approval, and the MCP permission card already
shipped on `feat/mcp-apps-cards`.

## Add-on slate

**Tier 1 (the demo):** voice mode · automations-from-chat (chat composes a real KeeperHub *workflow*, not a
one-shot tx — the category differentiator) · dry-run inside the confirm card.

**Tier 2 (the missing shell):** landing page with live composer · sign-in modal · `/history` route ·
network switcher (data already in `allowedChainIds`) · KeeperHub nav grammar (32px strip → 280px flyout →
220px drawer) · logo system.

**Tier 3:** multi-language · ⌘K palette over 442 actions · shareable receipts · opening address scan.

### Logo gap — 11 integrations with no mark anywhere
`blockscout` `code` `discord` `math` `sendgrid` `slack` `system` `telegram` `tempo` `web3` `webhook`

`web3` is the generic-EVM one Abu flagged. Five are known brands; six need drawing.
(`wrapped` is covered by KeeperHub's `weth.png`.)

## Decisions — recommendation stated, awaiting Abu

1. **Folder** — build in `keeperhubv2/`. (Session opened in `buidl-ctc`, which is the Proof League archive.)
2. **Fresh shell vs reskin** — recommend fresh Next app in `keeperhubv2/app`, port `lib/` + card layer.
3. **Fidelity line** — KeeperHub tokens + component grammar are law; composition and information design ours.
4. **Scope** — all of Tier 2 + voice + automations-from-chat; dry-run folds in nearly free.

## Open / unverified

- **Licensing**: KeeperHub's protocol marks are third-party brand assets it redistributes. Pointing at them
  ≠ vendoring them into a separately deployed product. Check before copying the directory.
- **Swap execution**: legacy records upstream `/api/execute/swap` as a stub returning "coming soon".
  Not re-verified against the current fork. If still a stub, swap needs an honest unavailable state.
- Legacy docs say ~291 actions; the generated registry says **442**. Registry wins.
- **Voice cost**: Realtime bills per audio minute. Needs a session cap before anything is public.

## KeeperHub read results (2026-09-13, from source, not yet seen live)

- A protocol read (`POST /api/execute/<integration>/<slug>`, `actionType: "read"`) answers
  `{ success, result, addressLink }`: the contract's named outputs under `result`, big numbers as
  strings (fork `app/api/execute/[...slug]/route.ts:197-207`, `plugins/web3/steps/read-contract-core.ts:330-340`).
  MCP `execute_protocol_action` returns that body as JSON text (fork `lib/mcp/tools.ts:2453-2487`), which
  `lib/mcp/wire.ts` parses into `data`.
- Plugin steps return their own fields at the top level: `web3/check-balance` →
  `{ success, balance, balanceWei, address }`; `web3/check-token-balance` →
  `{ success, balance: { balance, balanceRaw, symbol, decimals, name, tokenAddress }, address, addressLink }`
  (registry `outputFields`).
- `network` accepts a numeric chain id string (fork `lib/rpc/network-utils.ts:15-31`).
- Chainlink feed contracts per network are in fork `protocols/chainlink.ts:650-740`; `chainlink/get-round-data`
  reads any feed by `contractAddress` + `_roundId`. Copied into `lib/price-feeds.ts`.
- **Swap:** fork `app/api/execute/swap/route.ts:27` still answers `501 "Coming soon"` (re-verified @ `946eeb5c9`).
  Traced in slice 6.11: nothing calls it but its own tests (`tests/unit/oauth-scope-route-gate.test.ts`,
  `tests/integration/direct-execution-api.test.ts`), and no MCP tool names it. The registry's swaps
  (`uniswap/swap-exact-input|output`, `aerodrome/swap-exact-tokens`, `tempo/dex-swap`) are protocol actions: they run
  through `POST /api/execute/<integration>/<slug>` (`app/api/execute/[...slug]/route.ts`, the protocol registry and
  plugin steps such as `plugins/tempo/steps/dex-swap.ts`). No card change: they get the normal write card.
- **Transfer dry run** (`simulate: true`) answers KeeperHub's `SimulateResult` (fork `lib/execute/simulate.ts:88-159`):
  `{ success, status: "simulated", from, to, value, gasEstimate, simulatedReturnValue, wouldRevert }`, or a failure with
  `revertReason`, `failureKind` and, for a short balance, `code: "insufficient_balance"` with wei figures. The write card
  shows `gasEstimate` and a non-null return value; not yet seen live.
- **Receipt poll argument (fixed in slice 7.0):** KeeperHub's `get_direct_execution_status` declares only
  `execution_id` and builds its path from `args.execution_id` (fork `lib/mcp/tools.ts:1935-1963`). v1's engine
  sent `{ executionId }` in the receipt poll and in recovery, so the status read never succeeded: a sent
  transfer or contract write polled 30 s, then was recorded as a failure ("status could not be confirmed")
  although it may have landed. The tests only checked the tool name. Both calls now send `execution_id`.
- **Workflows (slice 7, from source, not yet seen live):** MCP `list_workflows` / `get_workflow` (mcp:read) return the
  full workflow row (`name`, `description`, `enabled`, `deactivatedAt`, `nodes`, `edges`, ISO `createdAt`/`updatedAt`; fork
  `app/api/workflows/route.ts`, `[workflowId]/route.ts`). The trigger type is the trigger node's `data.config.triggerType`
  ("Scheduled" is a legacy spelling of "Schedule"); `enabled` only gates triggers that fire on their own
  (`lib/workflow/store.ts:25-58`). Recent runs have no MCP tool: `GET /api/workflows/[id]/executions` (OAuth, newest 50;
  rows with `status`, `triggerSource`, `startedAt`, `duration`, `transactionHashes[]`). The workflow dry run
  `POST /api/workflows/[id]/simulate` (OAuth) is advisory: `{ ok, result: { simulatedNodeCount, skippedNodeCount, warnings? } }`,
  never a block (`lib/workflow/run-simulation.ts:57-65`). `execute_workflow` (mcp:write) takes `{ workflowId, input?,
  idempotency_key }` and only confirms the trigger (`{ executionId, status: "running" }`); `get_execution` returns
  `{ status: { status, transactionHashes, … }, logs }` and is the authority on the outcome (`lib/mcp/tools.ts:1184-1300`).
  Terminal statuses: success, error, system_error, skipped, cancelled.
- **Creating automations (slice 8, from source, not yet seen live).** A node is `{ id, type: "trigger"|"action", position?,
  data: { label, description?, type, config: { triggerType|actionType, ...params } } }`; an edge `{ id, source, target, sourceHandle? }`
  (`"true"`/`"false"` on Condition). Action `actionType` is the same `plugin/slug` our registry uses; params sit flat in `config`,
  `network` a chain id string; system actions use spaced names (`Condition`, `For Each`, …). Triggers (fork
  `lib/mcp/workflow-schema-constants.ts:169-303`): Manual; Schedule `scheduleCron` + `scheduleTimezone`; Webhook; Event `network`,
  `contractAddress`, `contractABI`, `eventName`; Block `network`, `blockInterval`; Transfer (Tempo) `network`, `contractAddress`,
  `recipientAddress`, `memo?`. Node shape is not schema-validated: create checks integrations, schedule interval, plan and action config
  (422 `INVALID_ACTION_CONFIG` with `invalidFields`); PATCH also checks template syntax and, when enabling, draft action nodes
  (`UNCONFIGURED_ACTION_NODES`); a bad cron saves but never fires. `create_workflow` with `enabled: true` skips the PATCH-only checks,
  so the copilot always creates switched off. `validate_workflow` (needs a saved id) and `validate_cron` are separate MCP tools.
  Switching on is `update_workflow { enabled }`; KeeperHub's `go-live` route is public listing, not switching on. A live automation's
  steps sign with the org wallet with no further approval, under a daily native cap (0.02 ETH default, `lib/execute/spend-cap-defaults.ts`).
  `execute_workflow` runs a switched-off automation. `ai_generate_workflow` is flag-gated (503 unless `NEXT_PUBLIC_AI_PROMPT_ENABLED`),
  ignores `context`, returns an NDJSON op stream with stale action names: not used. `GET /api/chains/[chainId]/abi?address=` has no
  auth check. A webhook start needs a user `wfb_` webhook key made in KeeperHub settings.
- **Changing, running and deleting automations (slice 8 part B, from source, not yet seen live).** `update_workflow` sends a PATCH
  whose `nodes`/`edges` replace the old ones whole; leaving `enabled` out keeps it on or off. The PATCH rejects unparseable
  `{{…}}` tokens (400 `INVALID_TEMPLATE_SYNTAX`) and sub-60 s schedules (400), refuses to enable a deactivated workflow (409), and
  re-registers the schedule when nodes change or it is enabled; it answers the updated row (fork
  `app/api/workflows/[workflowId]/route.ts:341-452,947-952`). An editor-made workflow names its nodes its own way; the copilot
  renumbers them `trigger`/`step-N` and rewrites `{{@id:…}}` references to match before saving. **Delete:** MCP `delete_workflow`
  cannot pass `force`, and the DELETE route refuses a workflow with any run history (409, `hasExecutions`) unless `?force=true`, which
  soft-deletes the runs and their logs with it (`route.ts:1002-1094`). KeeperHub's own editor asks "Delete Workflow and All Runs" and
  then sends `force=true` (`components/workflow/workflow-toolbar.tsx:1137-1141`, `lib/api-client.ts:708`), so the copilot calls the
  REST route with the session's Bearer and `force=true`, and its card says the run history goes too. A deleted workflow reads back as
  404. `execute_workflow` from chat is keyed by the tool call id, like every chat write.
- **Voice (Realtime), researched 2026-09-13 from OpenAI's docs and the installed `@openai/agents` 0.18.0 source; not yet seen live.**
  `gpt-realtime-2.1` is the SDK default and the guide's model ($32 / $64 per 1M audio tokens in / out; about $0.02 a minute of
  the person talking and $0.08 of the voice talking before re-billed context; third parties measure $0.06–0.11/min). Sessions cap
  at 60 minutes. Keys: `POST /v1/realtime/client_secrets` → `{ value: "ek_…", expires_at }` (10–7200 s, default 600; expiry only
  stops new sessions); the browser WebRTC transport posts SDP to `/v1/realtime/calls` and refuses non-`ek_` keys. On connect the SDK
  sends the browser agent's instructions and tools, so the server must re-check everything. Function tools run where the session
  runs (the browser); `needsApproval` holds the call and `session.approve()` runs the tool in the browser, and `connect()` / `close()`
  wipe pending approvals, so it is not used for cards. While a call is pending the mic stays live and the model may fill the gap;
  `session.mute(true)` silences the mic. The outcome can be added later with `transport.sendEvent({ type: "conversation.item.create",
  item: { type: "message", role: "system", … } })` + `transport.requestResponse()` (`session.sendMessage` is user-only). Transcripts:
  on by default (`gpt-4o-mini-transcribe`); save completed items from `history_updated` (a cut-off reply is truncated server-side).
  No level API: pass our own `mediaStream` / `audioElement` and read them with Web Audio. No output-language setting: language is
  pinned in the instructions. Obsolete: `/v1/realtime/sessions`, `OpenAI-Beta: realtime=v1` (removed 2026-05-12),
  `gpt-4o-realtime-preview*` (shut 2026-05-07), `response.audio_transcript.delta` and other beta event names.
  Our side: a server route can store a voice proposal without the chat model (`app/api/chat/rerun.ts` precedent); the AI SDK only
  collects approvals when the last model message is the tool message (`ai` dist `collectToolApprovals`), and on resume runs approved
  tools before calling the model, so the chat always writes after a card; `z.toJSONSchema` output carries a `$schema` key.
- **Voice spikes (2026-09-13, live against OpenAI, throwaway scripts, nothing sent to KeeperHub).** (a) All 12 `surfaceRealtimeTools`,
  with the `$schema` key dropped, build as agents-js `tool({ parameters, strict: false })` and a `gpt-realtime-2.1` session accepted
  them (no session error). (b) A server-written assistant message with a signed `approval-requested` → `approval-responded`
  `execute_transfer` part and no provider metadata resumed through `streamText` on `openai.responses`: the tool ran, then the model
  wrote one sentence as instructed. (c) Over a text-only realtime session, "send 0 ETH to 0xaaaa… on Base Sepolia" called
  `execute_transfer`; after a `conversation.item.create` system message ("the person authorized … sent and confirmed") plus
  `transport.requestResponse()`, the model replied "The transfer was sent and confirmed on Base Sepolia."
- **Underscore fields:** some protocol actions name a real field with a leading `_` (`lido/wrap`'s `_stETHAmount`).
  v1 hid every `_` parameter as a passthrough; the write card and the edit check now use the action's field list.
- Every protocol-action read through `routeToolCall` writes a ledger `read` row (`lib/execution/index.ts:519-532`);
  `recordRead: false` (slice 6) opts a caller out.
- `reference/yosuku` not read — replaced by masayume for onboarding. Nothing here depends on it.

## What KeeperHub runs directly (2026-09-13, slice 9b, decision 35)
- KeeperHub's execute route runs an action on its own only when it is a registered protocol's contract action (fork `app/api/execute/[...slug]/route.ts:432-458`, `resolveProtocolMeta`). Anything else answers 501 "Direct execution not supported … Use workflow execution instead" (seen live for `web3/check-balance`).
- In our registry that is exactly the entries with a `protocolType`: **394 of 442** run directly. The other **48** run only as automation steps: web3 18, hyperliquid 8, blockscout 5, tempo 4, `safe/get-pending-transactions`, `math/aggregate`, the 5 off-chain sends, `code/run-code` and the 5 system nodes. Before this, `search_actions` listed 42 of them as runnable.
- Copilot rule (`runsDirectly` in `lib/registry`): search marks them not executable with a reroute note, and execution refuses them before any credential check or card. The routes that work instead: `execute_transfer` (sends), `execute_contract_call` with `view` (token balances, contract reads), and `get_org_wallet_balances`.
- The org wallet's holdings come from `GET /api/user/wallet/balances` (OAuth; every enabled EVM chain, native plus tracked and system tokens, per-chain `error` when an RPC fails). Its addresses come from `GET /api/user/wallet` (`walletAddress`, `solanaAddress`).
- Not used: KeeperHub's single-step `POST /api/execute/node`, which could run a web3 step on its own but counts against the plan's execution limit.

## Languages (2026-09-14, research for decisions 38–39)
- **Chat model** (`gpt-5.6`): OpenAI publishes no per-language scores for 5.6. Its GPT-5.2 system card scores a translated MMLU with reasoning on: Spanish .913, Portuguese .910, Indonesian .904, German .903, Chinese .901, Hindi .900, French .899, Japanese .897, Korean .895 (Yoruba .808). Russian, Turkish and Vietnamese aren't measured. https://cdn.openai.com/pdf/3a4153c8-c748-4b71-8e31-aecbde944f8d/oai_5_2_system-card.pdf
- **Voice** (`gpt-realtime-2.1`):
  - OpenAI publishes no language list. The nearest proxy is its live translation model, which speaks Spanish, Portuguese, French, Japanese, Russian, Chinese, German, Korean, Hindi, Indonesian, Vietnamese, Italian and English; Arabic, Turkish and Urdu are input only. https://developers.openai.com/cookbook/examples/voice_solutions/realtime_translation_guide
  - Developer forum reports (Jul–Aug 2026, unconfirmed by OpenAI) say 2.1 drifts into English or a US accent in Spanish, German, French and Portuguese. Test each language on `gpt-realtime-2` vs `2.1` (`OPENAI_REALTIME_MODEL`). https://community.openai.com/t/gpt-realtime-2-1-exhibits-language-drift/1386953
- **Transcription** word error rate on FLEURS, `gpt-4o-mini-transcribe` (Mar 2025): Spanish 2.4%, English 2.9%, Portuguese 3.4%, German 3.5%, Japanese 4.0%, Russian 4.3%, Korean 4.5%, French 4.6%, Indonesian 4.8%, Turkish 5.5%, Vietnamese 5.7%, Chinese 7.7%, Hindi 12.9%, Arabic 14.1%, Bengali 24.5%, Swahili 25.3%, Tamil/Malayalam about 43%. The session's `audio.input.transcription.language` (ISO-639-1) improves accuracy; it only shapes the on-screen transcript, not what the voice model hears. https://openai.com/index/introducing-our-next-generation-audio-models/
- **OpenAI's voice prompting advice:**
  - Control language and accent separately. Avoid "respond in the user's language" and don't infer language from accent.
  - Keep preambles, tool messages and answers in one language.
  - The cookbook's language constraint: "Do not respond in any other language even if the user asks." https://developers.openai.com/api/docs/guides/voice-prompting
  - So the person picks the language and the prompt pins it.
- **Voices:** OpenAI recommends `marin` or `cedar` for quality. Its text-to-speech voices are "optimized for English", and there's no per-language ranking, so judge by ear.
- **Money pitfalls:**
  - es, pt-BR, de, tr, id and vi format `1.234.567,891`; fr and ru group thousands with spaces. `components/cards/money.ts` `parseHumanUnits` strips commas today, so "1,5" becomes 15.
  - `ar-EG`/`fa` default to non-Latin digits (force `numberingSystem: "latn"`).
  - Hindi groups as 12,34,567.
  - Compact notation rounds, so never use it for amounts.
- **Library for the screens (part 2):** next-intl 4.14 (Sep 2026, peer `next ^16`), used without URL prefixes: `i18n/request.ts` reads a cookie, then Accept-Language, then `en`. It has ICU plurals, typed keys and formatting helpers. Rejected:
  - Lingui: its SWC plugin is pinned to Next's SWC version and crashed on Next 16.0.7.
  - Paraglide: Turbopack is "out of scope" for it, and its own docs point Next users to next-intl.
  - Intlayer: young, and not ICU.
  - https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
- **Size of the screens job** (audit): about 1,100–1,300 hand-written UI strings, plus about 1,500 registry strings (action labels, descriptions, field labels), which stay English at first.
  - About 137 physical left/right utilities, so RTL would be a pass over the whole UI.
  - Geist is loaded Latin-only: next/font offers cyrillic and vietnamese subsets, but CJK and Devanagari need extra fonts, including in the `next/og` preview image.
  - English-dependent logic: `isSessionLapse` word checks and the stored `"New conversation"` title sentinel.
  - About 78 test assertions on English copy.
- **Built (part 2, 2026-09-15):**
  - next-intl 4.14.5 without routing: `i18n/request.ts` → `resolveLocale` in `lib/locale.ts`.
  - Messages in `messages/<locale>/<area>.json`, typed from English (`global.d.ts`), with English as the fallback for a missing key (`lib/i18n/messages.ts`).
  - **Fonts:** next/font `Noto_Sans_JP/KR/SC/Devanagari` (preload false) build fine but make `next dev` fail with "Can't resolve '@vercel/turbopack-next/internal/font/google/font'" across their unicode-range slices. Those scripts use system fonts per `:lang` instead (Hiragino/Yu Gothic, Apple SD Gothic Neo/Malgun Gothic, PingFang/YaHei, Kohinoor/Nirmala, then Noto).
  - **Install:** pnpm 10 skipped next-intl's `@swc/core`/`@parcel/watcher` build scripts. They're only needed for its message extractor, which isn't used.
