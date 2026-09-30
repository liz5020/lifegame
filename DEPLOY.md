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
- Worker的來源白名單`ALLOWED_ORIGINS`（`worker/worker.js`）目前有：`lifegamepage.smile80275.workers.dev`（舊）、`lifegame-6an.pages.dev`（現行）。以後換網址或綁自訂網域，要先把新網址加進白名單。
- `index.html`的分享連結（`og:url`、`og:image`、`SHARE_URL`）已換成新網址（2026.09.30-b）。
- 非`master`分支的預覽建置用Settings→Builds的Preview command＝`npx wrangler versions upload`（2026-09-30由原本已淘汰的`npx wrangler preview`改過來）。
- **推上去後確認線上版本**：`GET https://life-game.smile80275.workers.dev/version`回傳的`version`要等於這次的`WORKER_VERSION`；網頁看`https://lifegame-6an.pages.dev/`的`APP_VERSION`。
- **推上去後用`gh`查建置狀態(2026-09-30起，本機已裝`gh`並登入)**：`gh api repos/liz5020/lifegame/commits/<commit>/check-runs --jq '.check_runs[] | {name, status, conclusion, title: .output.title}'`，會列出「Workers Builds: life-game」(Worker)與「Cloudflare Pages」(網頁)各自的狀態(`in_progress`＝還在建、`success`／`failure`)，失敗時`.output.summary`有原因與後台日誌連結。Worker建置比網頁慢，推完等到兩邊都`success`再查`/version`，別看到舊版就以為失敗。`gh`裝在`~/.local/bin/gh`(沒有Homebrew，直接下載官方執行檔)，登入用`gh auth login`(網頁授權)。
- **建置卡在「Initializing build environment」、5分鐘後「Build failed to initialize and was timed out」**：Cloudflare建置環境沒開起來，跟程式無關（2026-09-30的2026.09.30-d碰過一次）。到後台life-game的建置紀錄按Retry build重跑即可；重跑仍失敗再改用本機`cd worker && npx wrangler deploy`（要先問使用者）。

## 紀錄（最新在上）

| 日期 | 頁面版本 | Worker版本 | commit | 上傳內容 | 備註 |
|---|---|---|---|---|---|
| 2026-09-30 | 2026.09.30-f（隨`master`自動部署） | 2026.09.30-f（隨`master`自動部署） | 見git log | index.html、worker | 撰稿人系統訊息第一批(10.12)；Worker新增全站當天用量計數(Durable Object `USAGE_COUNTER`，`/usage-today`)，wrangler.toml多了DO綁定與migrations |
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

