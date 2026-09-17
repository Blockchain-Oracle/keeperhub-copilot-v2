# Notes for native reviewers

Written by the translation agents on 2026-09-15 (decision 41). Each language passed `tests/i18n/messages.test.ts` (same keys, arguments and tags as English). These are the wording choices each agent was unsure about. A reviewer edits `messages/<locale>/*.json` and reruns the test.

## Spanish (`es`)

I wrote all 10 Spanish files in `messages/es/`, and the Spanish test passes: `pnpm exec vitest run tests/i18n/messages.test.ts -t "the es messages"` gave 4 passed, 45 skipped. A separate check found the same keys in the same order as English, no empty values and no exclamation marks. I didn't edit any other file.

- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/common.json`
- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/errors.json`
- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/metadata.json`
- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/landing.json`
- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/shell.json`
- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/chat.json`
- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/cards.json`
- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/automations.json`
- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/voice.json`
- `/Users/abu/dev/hackathon/keeperhubv2/messages/es/pages.json`

**Wording for a native reviewer:**
- **"Org wallet":** in sentences I used the glossary's "billetera de la organización". The full phrase is too long for stamps and tight labels, so there I shortened it to "BILLETERA DE LA ORG." or "billetera de la org.". That covers `cards.balance/holdings.orgWallet`, `cards.write.transfer.orgWallet`, `shell.connect.noOrgWallet` and `chat.motifs.noOrgWallet`.
- **"Spender" / "allowance":** I used "Gastador" and "Permiso de gasto", so "Approve a spender" became "Aprobar un gastador". The reviewer may prefer another term, such as "dirección autorizada".
- **Automation states:** these stamps use feminine forms because they describe the automation ("GUARDADA", "EJECUTADA"). Write cards and the Activity page use masculine forms ("EJECUTADO").
- **On, off, live and deactivated:** these need four different words. I used LIVE = "ACTIVA", ON/OFF stamps = "ACTIVADA"/"DESACTIVADA", off as a status = "inactiva" and deactivated = "inhabilitada". "SAVED · OFF" became "GUARDADA · INACTIVA".
- **"Supply" prompt:** I used "Deposita 50 USDC en Aave…". Aave's own Spanish interface says "Suministrar".
- **Other terms to check:**
  - "trigger": "Disparador"
  - "On demand": "Bajo demanda"
  - "FAIL LOUDLY": "FALLOS VISIBLES"
  - "A receipt. Not an ack.": "Un recibo. No un simple acuse."
  - "SPEC": "FICHA"
  - "RAW": "EN BRUTO"
  - "The gate is derived.": "El control se deriva."
  - "Send 0 ETH to myself": "Envía 0 ETH a mi propia billetera…"
- **Rewordings with no plural in the English:** `pages.history.card.executed` became "Ejecutadas: {count}", `checkedSkipped` ends with "{skipped} sin verificar", and `moneyMover.summary` is "Enviaste {amount} a {address}." These phrasings read correctly for any number.
- **Loanwords kept:** Mainnet, Testnet, on-chain, staking, swaps, feeds de precios, Docs and Shell. The network pill's group headers say "Redes principales" and "Redes de prueba" instead.
- **Search keywords:** `palette.languageKeywords` has the English words as well as the Spanish ones, so searching in either language finds it.

## Portuguese (Brazil) (`pt-BR`)

I wrote all 10 Portuguese (Brazil) files and the test passes: 4 passed, 45 skipped (those are the other languages).

**Files written** in `/Users/abu/dev/hackathon/keeperhubv2/messages/pt-BR/`: `common.json`, `errors.json`, `metadata.json`, `landing.json`, `shell.json`, `chat.json`, `cards.json`, `automations.json`, `voice.json`, `pages.json`. Keys and their order match English exactly. There are no ASCII apostrophes or exclamation marks, and I didn't touch any other file.

**Wording a native reviewer should check:**
- **Reads and writes:** I used "Leituras" and "Escritas" throughout, so the slogan is "Leituras fluem. Escritas param e perguntam." "Escritas" may feel stiff to some crypto users.
- **Spender:** I used "Gastador", as in "Aprovar um gastador". Allowance is "Permissão", and the unlimited warning says "permissão ilimitada". Some wallets say "limite de gastos" instead.
- **Supply prompt:** "Forneça 50 USDC ao Aave, mas antes me diga o APY". "Deposite" might sound more natural to users.
- **Short org wallet labels:** "Carteira da organização" is the full form. I shortened it to "CARTEIRA DA ORG" in card stamps, "Sem carteira da org" in the header pill, and "carteira da org" in the transfer diagram and sign-in footer, to keep them short.
- **Gender of status words:**
  - Automation states are feminine: "ATIVA", "INATIVA", "SALVA · INATIVA", "EXCLUÍDA", "EXECUTADA".
  - Transaction cards and Activity outcomes use the masculine default: "EXECUTADO", "CANCELADO", "NÃO ENVIADO".
  - The same idea can therefore appear in both forms in chat.
- **Off, deactivated, turned off:** "off" is "inativa", "turned off" is "desativada", and "deactivated in KeeperHub" is "desabilitada". However, the error message "switched off in KeeperHub" came out as "desativada".
- **Where I changed the sentence shape:**
  - The history card says "Executadas: {count}", so that 1 doesn't read "1 executadas".
  - The dry-run message now reads "…; não foi possível verificar {skipped}."
  - "Sent {amount} to {address}." became "Envio de {amount} para {address}."
- **Landing tags:** "FALHA VISÍVEL" (fail loudly), "A trava é derivada." (the gate is derived), "Um recibo. Não um ok.", "LIVRO-RAZÃO" (ledger), "ESPEC" (spec). "REGISTRO" is used for registry.
- **Networks in sentences** use "em {network}", because "na" or "no" depends on each network's name. The fixed prompt still says "na Base".
- **Search:** the empty-results hint suggests "atividade" instead of "activity". The page search matches the translated page name, and the page address still contains "activity". I also added "língua language languages" to the language search words so English terms still work.

## French (`fr`)

Wrote all 10 French files and the test passes: `vitest run tests/i18n/messages.test.ts -t "the fr messages"` gave 4 passed, 45 skipped (other locales), on the first run.

Files are in /Users/abu/dev/hackathon/keeperhubv2/messages/fr/: common.json, errors.json, metadata.json, landing.json, shell.json, chat.json, cards.json, automations.json, voice.json, pages.json. Keys match English in the same order.

Choices a native reviewer should know about:
- **Spacing:** all apostrophes are typographic (’), and there are no straight quotes or exclamation marks. A non-breaking space goes before `:` `;` `?` and inside « ».
- **Plurals where English has none:**
  - `pages.history.card.executed` is now "{count, plural, one {# exécutée} other {# exécutées}}" so the word agrees with the number.
  - `automations.runDialog.checkedSkipped` now puts `{skipped}` in a plural for the same reason.
  - `view.trigger.block` says "À chaque bloc" for one and "Tous les {every} blocs" otherwise.
- **Status words and stamps:** they use the masculine form as a neutral default (EXÉCUTÉ, ANNULÉ, ENREGISTRÉ). A reviewer may prefer the feminine on automation cards, since automatisation, action and exécution are all feminine. The accents stay on capitals.
- **"Run now":** I shortened it to "Exécuter", and the sentences that mention the button use the same word.

Wording I was unsure about:
- **Landing slogan** ("Reads flow. Writes stop and ask."): "Les lectures s’enchaînent. Les écritures s’arrêtent et vous consultent."
- **spender:** "Dépensier" (MetaMask style).
- **allowance:** "Montant autorisé".
- **VOID stamp:** "SANS EFFET".
- **Chainlink round:** kept as "ROUND {round}".
- **NON-CUSTODIAL:** kept as is. "NON DÉPOSITAIRE" is the alternative.
- **Other stamps:** LEDGER → "GRAND LIVRE", FAIL LOUDLY → "ÉCHEC EXPLICITE", SPEC → "SPÉC", CEREMONY → "CÉRÉMONIE".
- **Revert:** `wouldRevert` is "La transaction serait annulée (revert)."
- **Voice words:**
  - The marker on spoken messages (`said`) is "à l’oral".
  - The "Speaking" label is "Répond".
- **Automation states:** "ACTIF / INACTIF" for live and off, which keeps "DÉSACTIVÉ" for an automation KeeperHub itself switched off.
- **listing payment:** "paiement de mise en vente". The meaning is unclear from the source.
- **Long labels:** the glossary term "Portefeuille de l’organisation" runs about twice the English length in a few titles. I shortened the header pill to "Pas de portefeuille" and the stamps to "PORTEFEUILLE ORGANISATION".
- **Search hint:** it now suggests « activité », because the page names searched in the palette are translated.

## German (`de`)

I wrote all 10 German (du) files, and the de messages test passes: 4 tests passed, the other 45 skipped by the "the de messages" filter.

**Files written** (every file has the same keys in the same order as English; I checked with a script):
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/common.json
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/errors.json
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/metadata.json
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/landing.json
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/shell.json
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/chat.json
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/cards.json
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/automations.json
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/voice.json
- /Users/abu/dev/hackathon/keeperhubv2/messages/de/pages.json

**Wording for a native reviewer to check:**
- **Length of "org wallet":** I used the glossary term "Organisations-Wallet" everywhere. It runs long in short labels, for example "Keine Organisations-Wallet" (English "No org wallet") and the stamp "ORGANISATIONS-WALLET". "Org-Wallet" would be the shorter choice.
- **"Sprache" means both voice and language:** where both appear in one sentence I used "Sprachfunktion" for voice, as in "App, Chat und Sprachfunktion nutzen diese Sprache." Elsewhere voice stays "Sprache", and the session-ended toasts use "Sprachsitzung beendet" and "Sprachverbindung getrennt".
- **Spender and allowance:** the German word "Spender" means donor, so I used "Berechtigte Adresse" for spender and "Freigabebetrag" for allowance. "Approve a spender" became "Ausgaben freigeben".
- **"Read" and "reads":** I used "Abfrage" / "Abfragen" throughout. The landing slogan is "Lesen läuft. Schreiben hält an und fragt."
- **Stamps:** SENDING is "SENDET", CANCELLING is "BRICHT AB" and AUTHORIZING is "AUTORISIERUNG", all chosen to stay short. AWAITING AUTHORIZATION became "WARTET AUF AUTORISIERUNG".
- **Loose renderings:**
  - "A receipt. Not an ack." is "Ein Beleg. Kein bloßes OK."
  - "The gate is derived." is "Die Schranke wird abgeleitet."
  - "Insert your credentials." is "Zeig deine Zugangsdaten."
  - "SPEC" is "SPEZ"
  - "NON-CUSTODIAL" is left in English.
- **Block trigger:** in automations.view.trigger.block the one form is "Jeden Block" and does not repeat {every}. The code always passes count equal to every, so nothing is lost.
- **Add-funds eyebrow:** in shell.addFunds.eyebrow the select values stay lowercase ("testnet", "mainnet"). The test treats `{testnet}` as an argument name, so capitalising it would fail the test.
- **Search hint:** the palette hint suggests "aktivität" instead of "activity". Page titles are translated, so it should still find the page.
- **Hero prompt:** "Supply 50 USDC to Aave…" became "Zahl 50 USDC bei Aave ein und nenn mir vorher die APY".

## Indonesian (`id`)

I wrote all 10 Indonesian (Anda) files. The test passes: 4 of 4 "the id messages" checks, run with `pnpm exec vitest run tests/i18n/messages.test.ts -t "the id messages"`.

**Files** (all in `/Users/abu/dev/hackathon/keeperhubv2/messages/id/`):
- common.json
- errors.json
- metadata.json
- landing.json
- shell.json
- chat.json
- cards.json
- automations.json
- voice.json
- pages.json

A separate script confirmed every file has the English keys in the same order. There are no exclamation marks or straight apostrophes. Plurals use only `other`. I didn't edit any other file.

**Wording a native reviewer should check:**
- **"read / write":** "aksi baca / aksi tulis". The slogan became "Aksi baca langsung jalan. Aksi tulis *berhenti dan bertanya*." It's clear but a bit long, and a shorter version may read better.
- **"moves value":** "memindahkan dana" everywhere. "Value-moving write" became "Aksi tulis pemindah dana".
- **Spender / allowance:** "Penerima izin" and "Batas izin". "Approve a spender" became "Setujui penerima izin". Crypto users may prefer the English words kept as they are.
- **"run" as a noun:** "eksekusi", as in "Eksekusi terbaru" and "Riwayat eksekusi". "Executed" stays "dijalankan", as the glossary says.
- **"On demand":** "Manual" on short labels, badges and filters, because "Sesuai permintaan" is too long.
- **LIVE vs ON stamps:** both are "AKTIF", and OFF is "NONAKTIF". "Deactivated" is "DINONAKTIFKAN", so it looks close to OFF.
- **Long stamps:** "TANPA TANDA TERIMA" (NO RECEIPT), "MENUNGGU OTORISASI" (AWAITING AUTHORIZATION) and "TAK DIOTORISASI" (NEVER AUTHORIZED). The first may be too wide.
- **Past-tense tool log titles:** Indonesian has no past tense, so these use present-tense verbs, e.g. "Mencari aksi untuk “{query}”" and "Mengusulkan otomatisasi “{name}”".
- **"Acknowledge the warning":** "Akui peringatan", which sounds slightly stiff.
- **Voice controls:** "Mute" / "Unmute" became "Bisukan" / "Bunyikan".
- **Landing tags:** "FAIL LOUDLY" became "GAGAL TERBUKA", "LEDGER" became "CATATAN", "CEREMONY" became "ALUR" and "SPEC" became "SPEK".
- **Hero prompt:** "Supply 50 USDC to Aave" became "Setor 50 USDC ke Aave…" ("setor" means deposit).
- **Tutorial "pill":** I rewrote it as "Tombol saldo di bagian atas" (the balance button at the top) instead of a literal "pil".
- **Unit abbreviations:** durations keep "s" and "m", the same as English, rather than the Indonesian "dtk" and "mnt".
- **"Docs":** "Dokumentasi" is much longer than the English, but no short form reads naturally.
- **Search hint:** it suggests "aktivitas", which still matches because the search also looks at page names. The language search words are "bahasa language languages", so both the Indonesian and English words work.

## Vietnamese (`vi`)

I wrote all 10 Vietnamese files in `/Users/abu/dev/hackathon/keeperhubv2/messages/vi/`, and the Vietnamese test passes: `pnpm exec vitest run tests/i18n/messages.test.ts -t "the vi messages"` ran 4 tests and all passed.

**Files:** `common.json`, `errors.json`, `metadata.json`, `landing.json`, `shell.json`, `chat.json`, `cards.json`, `automations.json`, `voice.json`, `pages.json`. Every file has the same keys in the same order as English; I checked that with a script as well as the test.

**Choices applied throughout:**
- **Plurals:** every plural uses only `other`.
- **Glossary terms:**
  - authorize → "cho phép"
  - dry run → "chạy thử"
  - receipt → "biên nhận"
  - automation → "tự động hóa"
  - org wallet → "ví tổ chức"
- **Stamps:** stay uppercase ("ĐÃ THỰC HIỆN", "CHỜ CHO PHÉP").
- **"Check your connection":** always "kết nối internet", so it isn't confused with "mạng", which means a blockchain network.
- **Kept in English, as Vietnamese crypto users say them:** on-chain, testnet/mainnet, token, staking, vault, explorer, snapshot, revert.

**Wording a native reviewer should check:**
- **"Authorize" as "cho phép":** "Đang cho phép…" and "ĐANG CHO PHÉP" read a little stiff. "Xác nhận" may sound more natural, but the glossary says "cho phép". "Approve" is "Phê duyệt", which keeps it separate from "authorize".
- **Automation "LIVE":** "HOẠT ĐỘNG" is also the name of the Activity page. The landing footer "LIVE" is "TRỰC TUYẾN". "Trigger" is "Trình kích hoạt".
- **"Reads flow. Writes stop and ask.":** "Đọc thì chạy ngay. Ghi thì dừng lại và hỏi." Using "đọc/ghi" for reads/writes may feel too technical for marketing copy.
- **Credentials:** short labels say "Cần xác thực", full sentences say "Cần thông tin xác thực". The sign-in title "Insert your credentials" became "Nhập thông tin đăng nhập", which drops the identity-card image.
- **Spender and allowance:** "Bên chi tiêu" and "Hạn mức". Many Vietnamese wallets keep "spender" and "allowance" in English.
- **Search hint:** `palette.noResultsHint` suggests "hoạt động" in place of "activity". That only helps if search matches translated page names.
- **Durations:** I used "{seconds} giây" and "{minutes} phút {seconds} giây", which are longer than English "s" and "m" and may not fit tight spots.
- **Row and seal labels:** `sharedReceipt.rows.executed` is "Thực hiện lúc", assuming the row shows a time. The receipt "ISSUED" stamp is "ĐÃ CẤP".
- **Other landing tags:** "WHAT IT DOES" is "CHỨC NĂNG", "CEREMONY · STEP" is "QUY TRÌNH · BƯỚC", and "NON-CUSTODIAL" is "KHÔNG LƯU KÝ".

## Korean (`ko`)

I wrote all 10 Korean files, and the test passes: `pnpm exec vitest run tests/i18n/messages.test.ts -t "the ko messages"` gave 4 passed, 45 skipped. Keys are in the same order as English. There are no ASCII apostrophes or exclamation marks, and plurals use only `other`.

**Files** (in `/Users/abu/dev/hackathon/keeperhubv2/messages/ko/`): common.json, errors.json, metadata.json, landing.json, shell.json, chat.json, cards.json, automations.json, voice.json, pages.json

**One fix after the first run:** in `shell.addFunds.eyebrow` I had first translated the options inside `{network, select, testnet {…} other {…}}`. The test counts the literal word `testnet` there as an argument, so that option has to stay English. I changed both options back to `testnet {testnet} other {mainnet}`, which matches the other finished locales. The label now reads "자금 추가 · testnet" instead of 테스트넷. The only way to show Korean there is to change the test.

**Wording a native reviewer should check:**
- **Read / write:** I used 읽기 / 쓰기 everywhere (the Reads filter, "292 READS / 148 WRITES", "Reads flow. Writes stop and ask." → "읽기는 바로 실행되고, 쓰기는 멈추고 묻습니다"). 조회 might sound more natural to users.
- **Copilot:** I kept "Copilot" (with 이/은/을) even where English says "the copilot" in lowercase, rather than switching to 코파일럿.
- **Stamps:** LIVE → 가동 중; ON DEMAND / manual → 수동 실행; VOID → 무효; "Paid, failed" → 지불됨, 실패. I'm least sure about what "Paid, failed" means.
- **Token terms:** Spender → 지출자, allowance → 허용량, revert → 리버트, Sky savings vault → 저축 볼트.
- **Particles next to variables:** I reworded to avoid 을/를 after values that change. For example "Send {amount} {unit}" → "{address}에 {amount} 보냈습니다", addFunds → "…으로 {symbol} 입금하세요", sendToSelf → "{network}에서 내 조직 지갑에서 같은 지갑으로 {amount} 보내 주세요", language switched → "답변 언어: {language}".
- **Status lines vs stamps:** card status lines use polite endings ("승인을 기다리고 있습니다"), while stamps and pills use short noun forms (실행됨, 취소됨). Please check that the mix looks right side by side.
- **Guessed from the code:** `chat.messageList.said` → 음성 입력 (a marker on spoken messages), `palette.signs` / `capability.signs` → 서명 필요, `sharedReceipt.rows.executed` → 실행 시각 (the value is a date).
- **Search hint:** the search box matches page names in the current language, so the hint uses 활동 instead of "activity": "“aave”, “sepolia”, “활동”을 입력해 보세요".
- **Other choices:** in `landing.statusTicker.connecting` I kept the brand in lowercase as the source has it ("keeperhub에 연결 중"). "Insert your credentials." → "<em>자격 증명</em>을 넣어 주세요." "Every destination has one home." → "각 메뉴는 한곳에만 있습니다."

## Japanese (`ja`)

All 10 Japanese message files are written, and the Japanese test passes (4 passed, 45 skipped because they belong to other languages).

**Files written** (in `/Users/abu/dev/hackathon/keeperhubv2/messages/ja/`): common.json, errors.json, metadata.json, landing.json, shell.json, chat.json, cards.json, automations.json, voice.json, pages.json. Each one has the English keys in the same order, which I checked with a script.

**Wording a native reviewer should check:**
- **Testnet/mainnet label (`shell.addFunds.eyebrow`):** it has to stay `入金 · {network, select, testnet {testnet} other {mainnet}}`, so it shows Latin "testnet"/"mainnet" instead of テストネット/メインネット. The test reads the literal branch text `{testnet}` as an argument, so a Japanese word there fails it. Other languages will hit the same problem. The real fix is a small change to the test.
- **Glossary terms that may feel stiff:** I used 受領書 for "receipt" and 試行 for "dry run" everywhere, as the glossary says. In crypto apps, レシート and ドライラン/シミュレーション are probably more common.
- **"allowance":** I used 使用上限額 (MetaMask's Japanese wording) rather than 承認額, to avoid a clash with 承認 for "authorize".
- **"the copilot":** I kept it as "Copilot" in Latin everywhere rather than コパイロット, to match the product name.
- **Landing tags and headlines:** EFFECT → 作用, FAIL LOUDLY → 失敗を隠さない, CEREMONY → 承認フロー, "A receipt. Not an ack." → 単なる応答ではなく、受領書。, "The gate is derived." → ゲートはレジストリから導出。 These are loose renderings.
- **Short labels:**
  - `palette.signs` / `capability.signs` → 要署名
  - `palette.here` → 現在地
  - `messageList.said` (the "spoken, not typed" marker) → 音声
  - `stub.meta` RAW → 生データ
- **Search hint (`palette.noResultsHint`):** I suggest 「アクティビティ」 instead of "activity". Page search matches the translated title and also the page URL, so both still find the page.
- **Uppercase stamps:** they are plain words (実行済み, 稼働中, 保存済み · オフ). The ticker's lowercase "keeperhub に接続中" is kept as in the English source.
- **Spacing:** I put a half-width space between Latin words or numbers and Japanese text (KeeperHub に, # 件, 10 分), following the glossary's "KeeperHub に接続". Some reviewers prefer no space.

## Chinese (Simplified) (`zh-CN`)

I translated all 10 files into Simplified Chinese (zh-CN), and the zh-CN test passes (4 passed, the other languages skipped).

**Files written** (in /Users/abu/dev/hackathon/keeperhubv2/messages/zh-CN/):
- common.json
- errors.json
- metadata.json
- landing.json
- shell.json
- chat.json
- cards.json
- automations.json
- voice.json
- pages.json

Every file has the same keys in the same order as English, and the counts match file by file. Plural messages use only `other`. There are no ASCII apostrophes, exclamation marks or escaped characters.

**One test failure I worked around rather than fixed:**
- **"Add funds" eyebrow** (`shell.addFunds.eyebrow`): my first version, `testnet {测试网} other {主网}`, failed. The test wrongly treats the literal word "testnet" in that branch as an argument, so any translation of it fails. I kept `testnet {testnet} other {mainnet}`, as ja, ko, vi and the others did, so Chinese users see "充值 · TESTNET". The ru file translates this branch, so it probably fails the same check. The real fix is in the test, which I didn't touch.

**Choices made:**
- **Addressing the user:** I used 你 rather than the more formal 您, to match the du/tú choice in other languages.
- **The product:** "your copilot" stays as "Copilot" (向 Copilot 提问), not 助手.
- **Moving value:** "moves value" is 转移资产 throughout.
- **The recurring tagline:** "Reads flow. Writes stop and ask." became 读取直接放行，写入停下询问.

**Wording a native speaker should check:**
- **LIVE (automations):** 生效中. I avoided 运行中 because that already means RUNNING. On the landing footer, LIVE is 在线.
- **Spender:** 授权对象, and "Approve a spender" is 批准授权对象. 被授权方 or 支出方 are alternatives.
- **Paid, failed:** 已付费，失败 (gas was paid but the action failed).
- **Listing payment:** 上架付费.
- **FAIL LOUDLY:** 显式失败. "A receipt. Not an ack." became 是回执，而不是应答.
- **The gate is derived:** 确认关卡由推导而来.
- **Hero title:** 用<em>自然语言</em>操作链上<stop>。</stop>.
- **Voice marker on messages** (`said`): 语音.
- **"here" in search:** 当前.
- **Search hint:** "activity" became 动态, because the search matches the translated page names.
- **Status ticker** (`connecting`): I kept the lowercase "keeperhub" from the English (正在连接 keeperhub).
- **Keyboard hint:** "press enter" is 按 enter.
- **Terminal tab:** "Shell" stays in English.
- **Run dialog** (`runDialog.dryRunReason`): 你授权的就是… sits after the {reason} text with a space before it, assuming the reason may arrive in English.

## Hindi (`hi`)

All 10 Hindi files are written and the check passes: `pnpm exec vitest run tests/i18n/messages.test.ts -t "the hi messages"` ran 4 tests, all passed. Keys match English in the same order in every file.

Files are in `/Users/abu/dev/hackathon/keeperhubv2/messages/hi/`: common.json, errors.json, metadata.json, landing.json, shell.json, chat.json, cards.json, automations.json, voice.json, pages.json.

**One fix during the run:** the first test run failed on `shell.addFunds.eyebrow`. I had translated the two options inside `{network, select, testnet {…} other {…}}` into Hindi. The test reads those two option texts as argument names, so they have to stay the English words "testnet" and "mainnet". That is how every other locale has them too, so this label shows those two words in English.

**Wording a native reviewer should check:**
- **Read / write:** I wrote these as "रीड" and "राइट" everywhere, e.g. "रीड तुरंत चलते हैं। राइट रुककर पूछते हैं।" "राइट" can be read as "right". The alternative is "पढ़ने/लिखने वाली कार्रवाई", which is clearer but much longer.
- **"Moves value":** in sentences it is "मूल्य स्थानांतरित करने वाली", which is accurate but formal. Short labels use "मूल्य-हस्तांतरण राइट", and the step pill uses "मूल्य भेजता है". Other options are "फंड भेजने वाली" or "पैसा भेजने वाली".
- **Authorization as a noun:** statuses like "AWAITING AUTHORIZATION" use "प्राधिकरण का इंतज़ार". The verb follows the glossary: "अधिकृत करें".
- **Hero title full stop:** I put the Hindi full stop inside the tag, "<stop>।</stop>". If the design expects a dot there, it may need to go back to ".".
- **Loanwords I transliterated:** स्पेंडर, अलाउंस, आर्ग्युमेंट, क्वारंटीन, नॉन-कस्टोडियल, एमिट, वेबहुक. The shell tab label is "शेल" and the landing tag for "SPEC" is "स्पेक".
- **Left in English:** the time units ("{seconds}s", "{ms} ms"), "Cron", the `enter` key hint and "Tx".
- **Search hint:** "“aave”, “sepolia” या “गतिविधि” आज़माएँ". Page titles are translated and search matches them, so I used the Hindi page name instead of "activity". The language search keywords include both "language languages" and "भाषा भाषाएँ".
- **Launcher prompts:** these use polite request forms, e.g. "Base पर alice.eth को 10 USDC भेजिए". The reviewer may prefer the "-ें" forms or something more casual.
- **Acknowledgement lines avoid gendered verbs:** "मुझे पता है कि…" and "मैंने चेतावनियाँ पढ़ ली हैं।"
- **Uppercase stamps** use the plain Hindi word, as the glossary says, e.g. EXECUTED → "निष्पादित" and VOID → "अमान्य".

## Russian (`ru`)

I translated all 10 files into Russian and the ru test passes (4 passed, 45 skipped because they belong to other languages).

**Files written** in `/Users/abu/dev/hackathon/keeperhubv2/messages/ru/`: `common.json`, `errors.json`, `metadata.json`, `landing.json`, `shell.json`, `chat.json`, `cards.json`, `automations.json`, `voice.json`, `pages.json`. Keys and their order match English exactly, and no file outside that folder was touched.

**Test fix:** the first run failed on one message, the "Add funds · testnet/mainnet" heading (`shell.addFunds.eyebrow`). The test reads the English `{testnet}` branch text as an argument name. I had written "тестовая сеть / основная сеть" there, and the test only accepts the literal `{testnet}`. So those two words stay in English, the same as in every other language.

**Wording a native reviewer should check:**
- **Talking to the assistant:** the launcher and hero prompts use вы, as instructed ("Покажите мои балансы…", "Отправьте 10 USDC на alice.eth в Base", "Что вы умеете делать с Aave V3?"). Russian users often address assistants with ты ("Покажи…"), which may sound more natural.
- **"Reads flow. Writes stop and ask":** rendered as "Чтение — сразу. Запись — <em>только с вашего согласия</em>." This is a loose rewrite, and the same line is reused in the footer tagline and the "how it works" subtitle.
- **Crypto terms:** "spender" is "Расходующий адрес", "allowance" is "Лимит расходов", and "Approve a spender" is "Разрешение на расход". A community term like "спендер" may suit better.
- **"Credential":** "Нужны учётные данные" is long for uppercase stamps ("НУЖНЫ УЧЁТНЫЕ ДАННЫЕ").
- **"LIVE":** automation stamps use "АКТИВНА" (feminine, to agree with "автоматизация"), and the landing footer uses "ОНЛАЙН".
- **Loose picks:** "SPEC" became "ДЕТАЛИ", "CEREMONY" became "ПРОЦЕДУРА", "RAW" became "ИСХОДНИК", "FAIL LOUDLY" became "ЯВНЫЕ ОШИБКИ", and "A receipt. Not an ack." became "Квитанция, а не просто «принято»."
- **Plural grammar:**
  - `writeRecovery.pending` adds a separate case for exactly 1, so it reads "Предыдущее действие…" and 21 still gets a number.
  - `sessionDropdown.titleTooLong` uses a plural so the noun agrees with the number ("символа/символов").
  - The price card's update count and the "max decimals" message are sent as text, not numbers, so I wrote them as "label: {value}" to avoid a plural.
- **"Said" mark on voice messages:** translated as "голосом", because it labels words that were spoken rather than typed.
- **Search hints:** the "no results" hint suggests «активность», and the language search words include both English and Russian ("язык языки language languages"). Whether «активность» actually finds the page depends on the palette matching translated page names.
- **Minor choices:** "Discard" is "Сбросить", "Run now" is "Запустить сейчас" (quoted the same way in the explanations), "memo" is "Мемо", and "workflows" is "Сценарии". "Copilot" is kept as a name wherever English says "the copilot".

## Turkish (`tr`)

I wrote all 10 Turkish files, and the check passes: `pnpm exec vitest run tests/i18n/messages.test.ts -t "the tr messages"` shows 4 passed, 0 failed.

**Files written** (in `/Users/abu/dev/hackathon/keeperhubv2/messages/tr/`): `common.json`, `errors.json`, `metadata.json`, `landing.json`, `shell.json`, `chat.json`, `cards.json`, `automations.json`, `voice.json`, `pages.json`. Keys and their order match English exactly (checked with a script). There are no plain `'` apostrophes and no exclamation marks. Uppercase stamps use Turkish casing (İ/I).

**Test result:** the first run had one failure, in `shell.addFunds.eyebrow`. The check requires the testnet choice in that text to say exactly `testnet`. I had written "test ağı" and "ana ağ", so I changed them to `testnet` and `mainnet`, the same as the other languages. Every run after that passed.

**Wording for a native reviewer:**
- **Case endings on names:** I used a curly ’ before endings: KeeperHub’a / ’da / ’ın / ’ı, Copilot’un / ’a, Base Sepolia’da, Aave’ye, APY’yi, gwei’nin, URL’si, ABI’si. Where the ending was unclear I rewrote the sentence, for example "{network} ağında" and "Lido’dan okunan, stake edilmiş ETH değeri".
- **"action" vs "transaction":** the glossary uses "işlem" for transaction, so action is "eylem" everywhere. A reviewer may prefer "aksiyon".
- **ISSUED vs EDITED:** EDITED is "DÜZENLENDİ". I made ISSUED "VERİLDİ" so the two stamps don't look alike, even though "DÜZENLENDİ" is the usual word for issuing a receipt.
- **Crypto terms to check:** reads/writes are "okumalar/yazmalar", NON-CUSTODIAL is "GÖZETİMSİZ", spender/allowance are "Harcayıcı / Harcama izni", and ERC-20 approve is "İzin ver" (authorize stays "Onayla"). "The transaction would revert" is "İşlem revert olur", and a Chainlink round is "TUR {round}".
- **Words that mean two things:** "Bağlantı" is both a link and an internet connection. Only `share.offline` says "İnternet bağlantını", to avoid confusion. "Add funds" is "Bakiye ekle", and the header pill is called a "rozet".
- **Dry run:** the glossary term "deneme çalıştırması" is long. On progress labels and buttons I shortened it to "Deneme yapılıyor…", "Deneme başarısız" and "Bu değerlerle dene".
- **Titles with a name:** these use a colon so the name needs no ending: "Çalıştır: {name}", "Sil: {name}", "Aç: {name}", "Çağır: {name}". Also "created <time></time>" became "<time></time> oluşturuldu", assuming the time shows as something like "3 gün önce".
- **Other choices:** CEREMONY is "SÜREÇ", SPEC is "TEKNİK", the Shell tab is "Kabuk", and the language-switch toast is "Yanıt dili artık {language}". The search hint suggests "etkinlik" instead of "activity", because page names are searched in the translated language.
- **Still long:** Turkish runs longer than the 1.3x aim on some stamps, such as KAYDEDİLİYOR (SAVING) and KAYDEDİLDİ · KAPALI (SAVED · OFF). Worth a look on narrow cards.
