# Translation glossary

**Status: machine-translated by the agent (decision 41), not yet checked by native speakers.** A reviewer fixes a language by editing `messages/<locale>/*.json`; the messages test keeps keys and arguments in step with English. Each translator's open wording questions are in `messages/REVIEW-NOTES.md`.

## Source and shape
- `messages/en/*.json` is the source. Every other locale has the same files, the same keys and the same ICU arguments (`{count}`, `{name}`, `{count, plural, …}`) and tags (`<strong>…</strong>`).
- Plural forms follow each language's CLDR rules: `one`/`other` for most; Japanese, Korean, Chinese, Indonesian and Vietnamese use only `other`; Russian needs `one`, `few`, `many`, `other`.
- Never translate or change: amounts, addresses, hashes, chain ids, times (`09:00 UTC`), keyboard hints (`⌘K`, `esc`, `↵`), code, URLs, token symbols (ETH, USDC), network names (Base Sepolia, Ethereum), action ids (`aave-v3/supply`).

## Names kept in English everywhere
KeeperHub · KeeperHub Copilot · Copilot (as part of the product name) · MCP · Claude · Cursor · Vercel · GitHub · Chainlink · Aave and every protocol name · Turnkey.

## Tone
Calm, precise, plain. Sentence case where the script has case; no exclamation marks; no slang. Address the person politely but not stiffly: Spanish and Portuguese use *tú/você*, French uses *vous*, German uses *du* (as most crypto apps do), Russian uses *вы*, Turkish uses the plain second person, Japanese and Korean use polite endings (です/ます, 요/습니다 for statuses), Hindi uses *आप*, Indonesian uses *Anda*, Vietnamese uses *bạn*.

Uppercase stamps (EXECUTED, SAVED · OFF, LIVE…) stay uppercase in Latin, Cyrillic and Vietnamese scripts; in Japanese, Korean, Chinese and Hindi use the plain word (no case exists).

## Core terms

| English | es | pt-BR | fr | de | id | vi | ko | ja | zh-CN | hi | ru | tr |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| org wallet | billetera de la organización | carteira da organização | portefeuille de l'organisation | Organisations-Wallet | dompet organisasi | ví tổ chức | 조직 지갑 | 組織ウォレット | 组织钱包 | संगठन वॉलेट | кошелёк организации | kuruluş cüzdanı |
| card | tarjeta | cartão | carte | Karte | kartu | thẻ | 카드 | カード | 卡片 | कार्ड | карточка | kart |
| authorize | autorizar | autorizar | autoriser | autorisieren | otorisasi | cho phép | 승인 | 承認 | 授权 | अधिकृत करें | подтвердить | onayla |
| cancel | cancelar | cancelar | annuler | abbrechen | batal | hủy | 취소 | キャンセル | 取消 | रद्द करें | отменить | iptal |
| executed | ejecutado | executado | exécuté | ausgeführt | dijalankan | đã thực hiện | 실행됨 | 実行済み | 已执行 | निष्पादित | выполнено | gerçekleşti |
| receipt | recibo | recibo | reçu | Beleg | tanda terima | biên nhận | 영수증 | 受領書 | 回执 | रसीद | квитанция | makbuz |
| dry run | simulación | simulação | simulation | Testlauf | uji coba | chạy thử | 모의 실행 | 試行 | 模拟运行 | परीक्षण रन | пробный запуск | deneme çalıştırması |
| automation | automatización | automação | automatisation | Automatisierung | otomatisasi | tự động hóa | 자동화 | オートメーション | 自动化 | ऑटोमेशन | автоматизация | otomasyon |
| turn on / turn off | activar / desactivar | ativar / desativar | activer / désactiver | einschalten / ausschalten | aktifkan / nonaktifkan | bật / tắt | 켜기 / 끄기 | オン / オフ | 开启 / 关闭 | चालू करें / बंद करें | включить / выключить | aç / kapat |
| network | red | rede | réseau | Netzwerk | jaringan | mạng | 네트워크 | ネットワーク | 网络 | नेटवर्क | сеть | ağ |
| transaction | transacción | transação | transaction | Transaktion | transaksi | giao dịch | 트랜잭션 | トランザクション | 交易 | लेनदेन | транзакция | işlem |
| Connect KeeperHub | Conectar KeeperHub | Conectar KeeperHub | Connecter KeeperHub | KeeperHub verbinden | Hubungkan KeeperHub | Kết nối KeeperHub | KeeperHub 연결 | KeeperHub に接続 | 连接 KeeperHub | KeeperHub कनेक्ट करें | Подключить KeeperHub | KeeperHub'a bağlan |
| chat | chat | chat | discussion | Chat | obrolan | trò chuyện | 채팅 | チャット | 聊天 | चैट | чат | sohbet |
| activity | actividad | atividade | activité | Aktivität | aktivitas | hoạt động | 활동 | アクティビティ | 动态 | गतिविधि | активность | etkinlik |
| history | historial | histórico | historique | Verlauf | riwayat | lịch sử | 기록 | 履歴 | 历史记录 | इतिहास | история | geçmiş |
| share link / stop sharing | enlace para compartir / dejar de compartir | link de compartilhamento / parar de compartilhar | lien de partage / arrêter le partage | Freigabelink / Freigabe beenden | tautan berbagi / berhenti berbagi | liên kết chia sẻ / ngừng chia sẻ | 공유 링크 / 공유 중지 | 共有リンク / 共有を停止 | 分享链接 / 停止分享 | साझा लिंक / साझा करना बंद करें | ссылка / закрыть доступ | paylaşım bağlantısı / paylaşmayı durdur |
| voice | voz | voz | voix | Sprache | suara | giọng nói | 음성 | 音声 | 语音 | आवाज़ | голос | ses |
| form (details needed) | formulario | formulário | formulaire | Formular | formulir | biểu mẫu | 양식 | フォーム | 表单 | फ़ॉर्म | форма | form |
