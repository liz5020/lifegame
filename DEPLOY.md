# 部署紀錄

> 記錄「每個版本實際上傳到線上是什麼時候」，用來回答「現在線上是哪一版」。
> 線上怎麼查：遊戲首頁最下面、選單→更新紀錄視窗最上面都會顯示頁面版本號；更新紀錄視窗在正式模式下還會顯示伺服器（Worker）版本號，也可以直接開 `https://life-game.smile80275.workers.dev/version`（要從遊戲頁面發出的請求才會通過來源檢查）。
> 版本號格式：`YYYY.MM.DD-字母`（當天第幾次，a、b、c…）。頁面與Worker共用同一個編號體系，Worker沒改時編號可以落後，但兩邊的編號都要記在下面。

## 每次上傳／部署的步驟

1. 從GitHub拿最新的檔案（不要用舊的下載檔）。
2. 確認`index.html`的`APP_VERSION`、`RELEASE_NOTES`最前面一筆（玩家看得懂的更新說明）已更新；`worker/`有改就把`worker/worker.js`的`WORKER_VERSION`換成同一個編號。
3. `cd tests && node run-all.mjs 54`（版本檢查）通過。
4. 上傳頁面：把改動合併進`master`就好，Cloudflare Pages會自動部署（見下方「Pages自動部署」）；Worker有改：合併進`master`後Cloudflare也會自動部署（見下方「Worker自動部署」），不用再手動`wrangler deploy`。
5. 在下面加一行（最新的放最上面）。

## Pages自動部署（2026-09-30起）

- Cloudflare Pages專案`lifegame`連到GitHub `liz5020/lifegame`，正式分支`master`；玩家用的網址已改指向這個專案。
- 設定：Framework preset＝None、Build command＝`sh build-pages.sh`、Build output directory＝`dist`。
- `build-pages.sh`只把`index.html`、`og.png`、`lunar.min.js`複製進`dist/`，所以設計文件、測試、`worker/`不會被公開。以後若網站多了要公開的檔案（例如新圖片），記得改`build-pages.sh`。
- 注意：Build output directory的`dist`後面**不能有空白**（手機貼上容易帶入），否則建置會失敗，log顯示`Output directory "dist " not found`。
- 只有合併進`master`才會更新正式網站；其他分支不會上線。
- 舊的手動上傳Pages專案先保留備用，不再更新。

## Worker自動部署（2026-09-30起）

- Worker `life-game`在Cloudflare後台Settings→Builds連到GitHub `liz5020/lifegame`，分支`master`，Path（Root directory）＝`worker`，Deploy command＝`npx wrangler deploy`，Build command留空。
- 合併進`master`就會自動部署（目前沒設監看路徑，只改網頁時Worker也會重部署一次，內容相同、不影響）。
- `ANTHROPIC_API_KEY`等secret存在Worker上，自動部署不會動到；`worker/wrangler.toml`的設定（KV、`CLOUD_SAVE_ENABLED`）以repo為準。
- Worker的來源白名單`ALLOWED_ORIGINS`（`worker/worker.js`）目前有：`lifegamepage.smile80275.workers.dev`（舊）、`lifegame-6an.pages.dev`（Pages原網址，照常可玩）、`draftmylife.com`（2026-10-04起正式網域）。以後換網址或綁自訂網域，要先把新網址加進白名單。
- `index.html`的分享連結（`og:url`、`og:image`、`SHARE_URL`）2026.10.04-j起是`draftmylife.com`；正式網址判斷`OFFICIAL_HOSTS`同時包含`draftmylife.com`與`lifegame-6an.pages.dev`。
- 非`master`分支的預覽建置用Settings→Builds的Preview command＝`npx wrangler versions upload`（2026-09-30由原本已淘汰的`npx wrangler preview`改過來）。
- **推上去後確認線上版本**：用瀏覽器網址列直接打開`https://life-game.smile80275.workers.dev/version`(2026-10-01起可以，之前要帶Origin標頭才查得到)，回傳的`version`要等於這次的`WORKER_VERSION`；網頁看`https://draftmylife.com/`(或`https://lifegame-6an.pages.dev/`)的`APP_VERSION`。
- **推上去後用`gh`查建置狀態(2026-09-30起，本機已裝`gh`並登入)**：`gh api repos/liz5020/lifegame/commits/<commit>/check-runs --jq '.check_runs[] | {name, status, conclusion, title: .output.title}'`，會列出「Workers Builds: life-game」(Worker)與「Cloudflare Pages」(網頁)各自的狀態(`in_progress`＝還在建、`success`／`failure`)，失敗時`.output.summary`有原因與後台日誌連結。Worker建置比網頁慢，推完等到兩邊都`success`再查`/version`，別看到舊版就以為失敗。`gh`裝在`~/.local/bin/gh`(沒有Homebrew，直接下載官方執行檔)，登入用`gh auth login`(網頁授權)。
- **建置卡在「Initializing build environment」、5分鐘後「Build failed to initialize and was timed out」**：Cloudflare建置環境沒開起來，跟程式無關（2026-09-30的2026.09.30-d碰過一次）。到後台life-game的建置紀錄按Retry build重跑即可；重跑仍失敗再改用本機`cd worker && npx wrangler deploy`（要先問使用者）。

## 紀錄（最新在上）

| 日期 | 頁面版本 | Worker版本 | commit | 上傳內容 | 備註 |
|---|---|---|---|---|---|
| 2026-10-08 | 2026.10.08-c（**尚未上線**：本機完成，推送前先問使用者——動到`worker/`的花費計算與prompt） | 2026.10.08-c（同左） | — | index.html、worker(gate.js、worker.js、ap.js、account.js、mail.js、prompt.js) | 付費周邊(十、10.3.13)：反悔5次＋超過每次1點、人生重開丹10點、回顧這一生60點＋程式試看花絮、全站花費改用實際花費(10.9.3.1a補充二) |
| 2026-10-08 | 2026.10.08-b（隨`master`自動部署，已用`/version`、頁面(兩個網址)與check-runs確認線上網頁與Worker都是此版；Worker新增每小時排程`0 * * * *`，排程實際執行尚未觀察） | 2026.10.08-b（同左） | `54b9b19` | index.html、worker(account.js、account-routes.js、entry.js、mail.js、gate.js、save-admin.js、dashboard.js、worker.js、wrangler.toml) | 封測名額與候補(十、10.15，2026-10-04定案) |
| 2026-10-08 | 2026.10.08-a（隨`master`自動部署，已用`/version`、頁面(兩個網址)與check-runs確認線上網頁與Worker都是此版） | 2026.10.08-a（同左） | `ac02aad` | index.html、worker(prompt.js、worker.js) | 訂單現況以訂單簿為準(八、8.13.1，2026-10-08)；近況維持3回合原文；第三輪驗證條件②通過、條件①判定為舊存檔問題(10.14.8補充第八節) |
| 2026-10-05 | 2026.10.05-b（**沒有上線**：10.14.8補充第二輪比對未通過，2026-10-08改回3回合原文，併入2026.10.08-a） | — | `43b2676` | — | 近況縮減(10.14.8補充) |
| 2026-10-05 | 2026.10.05-a（隨`master`自動部署，已用`/version`、頁面(兩個網址)與check-runs確認線上網頁與Worker都是此版） | 2026.10.05-a（同左） | `750c4e7`、`060fb1b` | index.html、worker(prompt.js、worker.js) | 每回合費用再降(10.14.8)：空值欄位不送、刪重複、C類摘要40字 |
| 2026-10-05 | 2026.10.04-p（隨`master`自動部署，已用`/version`、頁面(兩個網址)與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-p（同左，Worker內容沒改、只換版本號） | `bf25172` | index.html、worker.js(只換版本號) | 出社會後的重心：技術判斷改定案，副業進度給旁白只用整數格 |
| 2026-10-04 | 2026.10.04-o（隨`master`自動部署，已用`/version`、頁面(兩個網址)與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-o（同左） | `6094f1e` | index.html、worker(prompt.js、worker.js只換版本號) | 出社會後的重心(二、2.6.7＋補充定案)、60歲起排序前三 |
| 2026-10-04 | 2026.10.04-n（隨`master`自動部署，已用`/version`、頁面(兩個網址)與check-runs確認線上網頁與Worker都是此版；`/usage-detail.csv`回200、`/dashboard`有新區塊） | 2026.10.04-n（同左） | `e1d44d3` | index.html(只換版本號與更新說明)、worker(gate.js、worker.js、dashboard.js) | 伺服器端AI實際用量紀錄(10.14.7)：每日加總、逐筆明細、CSV下載、數據總覽區塊 |
| 2026-10-04 | 2026.10.04-m（隨`master`自動部署，已用`/version`、頁面(兩個網址)與check-runs確認線上網頁與Worker都是此版；部署後後台估價3元、上限300元仍保留） | 2026.10.04-m（同左） | `ad760f9` | index.html(只換版本號與更新說明)、worker(prompt.js、turnUserContent) | 快取區塊改為少變資料→名冊→本回合資料，人物卡不進快取(10.14.3補充) |
| 2026-10-04 | 2026.10.04-l（隨`master`自動部署，已用`/version`、頁面(兩個網址)與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-l（同左） | `ae6ce79` | index.html、worker(prompt.js、turnUserContent) | AI費用控制目標一(10.14)：少變資料與人物卡移進快取、規則與工具定義去重複、開場offset省略不再重生成 |
| 2026-10-04 | 2026.10.04-k（隨`master`自動部署，已用`/version`、頁面(兩個網址)與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-k（同左，只換版本號） | `81fdc88` | index.html、worker(只換版本號) | 回合進行中擋下切換／刪除人生、存到雲端、帳號綁定登入登出與轉入(test-43修正時發現的漏洞) |
| 2026-10-04 | 2026.10.04-j（隨`master`自動部署，已用`/version`、頁面與check-runs確認線上網頁與Worker都是此版；Worker對draftmylife.com回200） | 2026.10.04-j（同左） | `4154f63` | index.html、worker | 正式網域draftmylife.com：Worker來源白名單加入、算正式網址(預設真AI)、分享連結與og圖改用新網域；舊網址lifegame-6an.pages.dev照常可玩 |
| 2026-10-04 | 2026.10.04-i（隨`master`自動部署，已用`/version`、頁面與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-i（同左，只換版本號） | `1f0c055` | index.html、worker(只換版本號) | 遊玩說明：玩法與圖例新增「一回合怎麼玩」、第一次開局說明跳窗、重心按鈕列小標題(十六、16.18.1／16.18.2、二、2.6.3) |
| 2026-10-04 | 2026.10.04-h（隨`master`自動部署，已用`/version`、頁面與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-h（同左） | `771065b` | index.html(只改註解、版本號與更新說明)、worker(只換版本號) | 首頁年齡確認那段程式註解更新為現況(常見問題已無年齡題) |
| 2026-10-04 | 2026.10.04-g（隨`master`自動部署，已用`/version`、頁面與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-g（同左） | `5a9abf6` | index.html、worker(只換版本號) | 首頁常見問題刪除「適合幾歲的人？」(十六、16.10.6，A15)；說明檔與設計文件一致性修正(純文件) |
| 2026-10-04 | 2026.10.04-d（隨`master`自動部署，已用`/version`、頁面與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-d（同左） | `742a373` | index.html(只換版本號與更新說明)、worker | 10.8.2存放位置改用門牌：所有KV名稱不含金鑰原文、搬遷保險期、`/admin/location-migrate`／`location-cleanup`／`location-status`；部署後先試算(`dry_run`)給使用者確認筆數再正式搬遷。**搬遷紀錄(2026-10-04)**：試算21筆(存檔7、回顧4、行動點4、領禮2、用量4)、無衝突；使用者確認後正式搬遷，第一次執行複製成功但KV清單有延遲(剛寫入的新名稱一分鐘內列不出來)，對帳未通過；等清單同步後第二次執行，**對帳通過(2026-10-03T18:47:45Z＝台灣10/04 02:47)**，保險期到2026-10-10T18:47:45Z(台灣10/11 02:47)；保險期內改讀舊位置0次。清理(`/admin/location-cleanup`)要到保險期滿且改讀次數為0才能做 |
| 2026-10-04 | 2026.10.04-f（隨`master`自動部署，已用`/version`、頁面與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-f（同左） | `e6165c1` | index.html、worker(只換版本號) | 雲端存檔狀態列改放在標題月份後面 |
| 2026-10-04 | 2026.10.04-e（隨`master`自動部署，已用`/version`、頁面與check-runs確認線上網頁與Worker都是此版） | 2026.10.04-e（同左） | `fd34b86` | index.html、worker(只換版本號) | 10.13.3雲端自動存檔改為每10分鐘(回合有推進)，新增頂部「雲端存檔：X分鐘前」狀態列(點一下＝手動存到雲端) |
| 2026-10-04 | 2026.10.04-c（隨`master`自動部署，已用`/version`與頁面確認線上是此版） | 2026.10.04-c（同左） | `30e4cb5` | index.html(只換版本號與更新說明)、worker | 10.13.7.11：花費／回合／綁定信箱／開啟人生段數統計與儀表板第二排卡片 |
| 2026-10-04 | 2026.10.04-b（隨`master`自動部署，已用`/version`、頁面與`/dashboard`確認線上是此版） | 2026.10.04-b（同左） | `0ab28da` | index.html(只換版本號與更新說明)、worker | 數據網頁「立即更新」按鈕停用期間顯示倒數秒數(10.13.7.8，規則不變) |
| 2026-10-04 | 2026.10.04-a（隨`master`自動部署，已用`/version`與頁面確認線上網頁與Worker都是此版） | 2026.10.04-a（同左） | `42e6fe2` | index.html（頁面載入送`/pv`、版本號與更新說明）、worker（`/pv`、`/stats-summary`、`/dashboard`、人生代號清單） | 十、10.13.7數據總覽：玩家（免費／付費／活躍）、瀏覽人次、數據網頁。部署後盤點（10.13.7.10）：存檔總數 6、索引筆數 1、已綁信箱人數 1（2026-10-04；`SAVE_ADMIN_TOKEN`當天已重設，新密碼只存在使用者電腦、不進對話）。`/dashboard`真瀏覽器畫面、瀏覽人次增加、花費與回合累加已由使用者於2026-10-04確認；線上瀏覽人次累計含1次部署後的curl測試 |
| 2026-10-03 | 2026.10.03-b（隨`master`自動部署，使用者確認線上網頁與Worker都是此版；-a沒有上線過） | 2026.10.03-b（同左） | `b90a002` | index.html(只換版本號與更新說明)、worker | 10.13.3／10.13.6／10.12.5定案落實：封存包每階段只寫1次；管理端名冊(必填who／reason、只列信箱／lid／綁定日期／最後存檔)、存檔列表(只列lid與最後存檔)、查看結果依階段整理成可讀文字；封存包寫入頻率限制(每來源每小時60次)與每日排程清理孤兒封存包(`wrangler.toml`新增`[triggers] crons`，部署後到Cloudflare後台確認排程出現)；Worker有改要部署；兩個secret(`SAVE_ADMIN_TOKEN`、`SAVE_INDEX_SECRET`)已設定 |
| 2026-10-02 | 2026.10.02-a（隨`master`自動部署，使用者確認線上網頁與Worker都是此版） | 2026.10.02-a（同左） | `deed0a5`（合併PR 14） | index.html、worker | 10.2.3.1衝突整理定案：失敗的AI呼叫也計入每日花費、示範模式綁定不上傳存檔(玩家看不出差異) |
| 2026-10-01 | 2026.10.01-c（隨`master`自動部署，使用者確認線上網頁與Worker都是此版） | 2026.10.01-c（同左） | `e8f2886`（合併PR 12） | index.html、worker | Worker `/version`改成直接用瀏覽器網址列也查得到(沒有Origin標頭時放行；有Origin但不在白名單仍擋)；網頁只換版本號與更新說明 |
| 2026-10-01 | 2026.10.01-b（隨`master`自動部署；已被上一行-c取代，線上直接是-c） | 2026.10.01-b（同左） | `6034a2b`（合併PR 11） | index.html、worker | 10.13.3自動存檔(每10回合＋人生結束)、取消進站年齡確認視窗；10.13.6管理端(`/admin/*`、存檔索引)；Worker有改(暫停期間開放`/stage-pack`、新增`save-admin.js`)要部署，並先設兩個secret：`SAVE_ADMIN_TOKEN`、`SAVE_INDEX_SECRET`(見設定說明) |
| 2026-10-01 | 2026.10.01-a（尚未上傳，合併進`master`後自動部署） | 2026.10.01-a（尚未部署） | 待填 | index.html、worker | 10.13.2開場同意頁、隱私說明連結、同意紀錄隨存檔與帳號(`/account/consent`)；Worker有改(account.js／account-routes.js)要部署 |
| 2026-09-30 | 2026.09.30-h（隨`master`自動部署） | 2026.09.30-h（隨`master`自動部署） | 見git log | index.html、worker | 第三批：未綁信箱啟程禮改25點(只領1次、同時1段)、綁定再+30(取代補到55)、正式網址(lifegame-6an.pages.dev)預設真AI、其他網址仍預設示範；封測直接開放 |
| 2026-09-30 | 2026.09.30-h（第二批，與上一行一起上線） | 2026.09.30-h（同左） | 見git log | index.html、worker | 帳號系統第二批(10.2／10.9.2／10.9.3)：信箱驗證碼登入、綁定／併入／換綁、共用錢包、啟程禮每日上限與排隊、全站每日花費上限擋人＋管理通知信、撰稿人第2/3/4/7則；Worker新增Durable Object `ACCOUNTS`(migration v2)、寄信(Resend)；**上線前要先照「設定說明_帳號與寄信.md」設好Resend與後台變數** |
| 2026-09-30 | 2026.09.30-i（綁定信箱入口更直覺，隨`master`自動部署） | 2026.09.30-i（同左） | 見git log |
| 2026-09-30 | 2026.09.30-f（隨`master`自動部署） | 2026.09.30-f（隨`master`自動部署） | 見git log | index.html、worker | 撰稿人系統訊息第一批(10.12)；Worker新增全站當天用量計數(Durable Object `USAGE_COUNTER`，`/usage-today`)，wrangler.toml多了DO綁定與migrations |
| 2026-09-30 | 2026.09.30-g（隨`master`自動部署） | 2026.09.30-g（隨`master`自動部署） | 見git log | index.html、worker(只換版本號) | 修正「拿回雲端進度」畫面的「回首頁」按鈕沒反應 |
| 2026-09-30 | 2026.09.30-e（隨`master`自動部署） | 2026.09.30-e（隨`master`自動部署，只換版本號） | 見git log | index.html、worker | 錢包「啟程禮」欄改看這台裝置有沒有領過(10.10.3.1)；Worker只換版本號 |
| 2026-09-30 | 2026.09.30-d（隨`master`自動部署） | 2026.09.30-d（隨`master`自動部署） | 見git log | index.html、worker | 人物詳細頁顯示職業／就學(四、4.9)；Worker只更新單價查詢日期(`PRICE_CHECKED_ON`，單價不變) |
| 2026-09-30 | 2026.09.30-c（隨`master`自動部署） | 2026.09.30-c（隨`master`自動部署，只換版本號） | 見git log | index.html、worker | 點數錢包（含啟程禮改名）與玩家回報機制(10.10.3／10.11)；Worker只換版本號、邏輯沒動（版本檢查要求頁面與Worker一致） |
| 2026-09-30 | 2026.09.30-b（隨`master`自動部署） | 2026.09.30-b（隨`master`自動部署） | 見git log | index.html、worker | 分享連結與分享圖網址換成lifegame-6an.pages.dev；Worker只換版本號 |
| 2026-09-30 | 2026.09.30-a（Pages已連GitHub自動部署；隨`master`上線） | 2026.09.30-a（已部署，Version ID 31a856fe） | 見git log | worker | Worker已部署（含版本標記、10.9.4成本量測、10.10行動點錢包、prompt層修正）；index.html待上傳；玩家網址改為`lifegame-6an.pages.dev`，Worker來源白名單已加入並由自動部署上線、實測新網址可呼叫AI（使用者確認） |

## 全站用量計數與兩個可調設定值（2026-09-30，十、10.9.3.3）

- 第一次自動部署含Durable Object migrations(`[[migrations]] tag="v1"`)；部署後到後台life-game的Bindings確認有`USAGE_COUNTER`。
- 兩個設定值只放Cloudflare後台：life-game→Settings→Variables and Secrets→新增純文字變數`DAILY_SPEND_CAP_TWD`(全站每日花費上限，沒設預設500)、`DAILY_GIFT_CAP`(啟程禮每日發放上限，沒設預設20)；改完存檔就生效，**不要寫進`wrangler.toml`**(`keep_vars=true`才不會被部署蓋掉)。第一批只顯示、還沒拿來擋人。
- 查當天累計：`GET https://life-game.smile80275.workers.dev/usage-today`，帶`Authorization: Bearer <USAGE_ADMIN_TOKEN>`(或`?token=`)，回傳日期、呼叫次數、估計花費(每次成功呼叫估1元)、上限與比例。台灣時間午夜歸零。
- 2026-09-30查到：`GET /usage-today`回「尚未設定USAGE_ADMIN_TOKEN」＝Worker上還沒設管理密碼(`/usage-summary`同樣用這個)。要查用量前先在`worker/`資料夾跑`npx wrangler secret put USAGE_ADMIN_TOKEN`設一組密碼(由使用者自己輸入，我不經手)。

## 帳號系統與寄信設定（2026-09-30第二批，十、10.2）

- 第二批新增帳號資料庫（Durable Object `ACCOUNTS`，`wrangler.toml`的migration `v2`），第一次自動部署時會自動建立；部署後到後台life-game的Bindings確認有`ACCOUNTS`與`USAGE_COUNTER`。
- **上線前要先設定寄信與後台變數**：照根目錄`設定說明_帳號與寄信.md`做（Resend帳號與網域、DNS記錄貼進Cloudflare、只能寄信的金鑰存成secret `RESEND_API_KEY`、後台變數`ADMIN_NOTIFY_EMAIL`／`DAILY_SPEND_CAP`／`DAILY_GIFT_CAP`／`DAILY_VERIFY_EMAIL_CAP`／`AI_CALL_COST_ESTIMATE`）。沒設好之前，遊戲裡按「寄送驗證碼」會顯示「現在寄不出驗證碼」，其他功能不受影響。
- 確認方式：`GET /version`要是`2026.09.30-i`；`GET /usage-today?token=管理密碼`看`mail.resend_key_set`與`mail.admin_email_set`都是`true`，並看得到今天估計花費、啟程禮份數、通知狀態、今日驗證信數。
- 這些設定值只放Cloudflare後台，**不要寫進`wrangler.toml`**（`keep_vars=true`才不會被部署蓋掉）；改花費上限或啟程禮上限不用重新部署，存檔就生效。

## 開放封測前檢查清單（2026-09-30第三批）

正式網址`lifegame-6an.pages.dev`從2026.09.30-h起**預設用真AI**（其他網址仍是示範模式），所以玩家一進來每個回合都是真的AI呼叫、會花錢。上線前確認：

1. `設定說明_帳號與寄信.md`第1～5步都做完（Resend、DNS、`RESEND_API_KEY`、後台變數），驗證信寄得出去、`/usage-today`看得到`mail`設定齊全。
2. Anthropic後台的每月花費上限已設定（最後一道保險）；`DAILY_SPEND_CAP`（每日花費上限，預設500元）確認是你要的數字，並知道碰到上限時管理通知信會寄到`ADMIN_NOTIFY_EMAIL`。
3. `公告草稿_已知狀況.md`依實際情況修改後再發（封測期間進度只存本機；換裝置要綁信箱、或手動「存到雲端」）。
4. 自己用正式網址玩兩三回合，確認頁面沒有「示範模式」標籤、點數是25點、綁定信箱後多30點。想切回示範：`?dev=1`測試選單→切回模擬模式。
5. 雲端存檔（10.8）維持暫停，不是封測的前置條件。

