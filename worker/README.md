# life-game Worker 部署說明

2026-09-24 起改用 wrangler 3 部署（相容本機 Node 18；wrangler 4 需要 Node 22）（一、1.2.9.14 簡轉繁需要 OpenCC，檔案約 1.1MB，線上編輯器貼不進去）。
壓縮後約 450KB，低於 Cloudflare Workers 免費方案壓縮後 3MB 的上限。

## 第一次設定

```bash
cd worker
npm install
npx wrangler login                      # 開瀏覽器登入 Cloudflare
npx wrangler kv namespace list          # 找到目前這個 Worker 用的 KV（例如 life-game-saves），複製 id
```

把 id 填進 `wrangler.toml` 的 `REPLACE_WITH_KV_NAMESPACE_ID`，然後：

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # 貼上 console.anthropic.com 的金鑰（Cloudflare 端加密保存，不進程式碼）
npx wrangler secret put USAGE_ADMIN_TOKEN   # 2026-09-25新增：查 /usage-summary 用的管理密碼，自己設一組長一點的隨機字串
npx wrangler secret put SAVE_ADMIN_TOKEN    # 2026-10-01新增(10.13.6管理端)：看存檔／名冊／存取紀錄的管理密碼，跟USAGE_ADMIN_TOKEN不同，另設一組長一點的隨機字串
npx wrangler secret put SAVE_INDEX_SECRET   # 2026-10-01新增：存檔內部代號的伺服器密鑰，隨機長字串，設好後不要再換(換了舊索引就解不開，要等存檔下次寫入才補建)
npx wrangler deploy
```

## 之後每次更新

```bash
cd worker && npx wrangler deploy
```

## 封測期間暫停雲端存檔（十、10.8，2026-09-29起）

`wrangler.toml`的`CLOUD_SAVE_ENABLED = "false"`時Worker平常不碰KV(不檢查行動點、不記用量，`/usage-summary`也暫停)；只開放10.8.1手動存到雲端用的`POST /save`、`GET /slots`、`GET /load`，其他存檔類網址回503，
頻率限制改用Cloudflare內建Rate Limiting(`RATE_LIMITER`綁定，同一IP每60秒30次)。改這個開關要**同時**改`index.html`的`CLOUD_SAVE_DEFAULT`，
並且Worker重新部署、index.html重新上傳。重新打開前先完成QA手冊34.12的KV用量修正。

## 本機測試簡轉繁

```bash
npm run test:s2t
```

`big5-chars.js` 是用 `npm run build:big5` 產生的 Big5 字集，一般不需要重跑。

## 檔案說明（2026-09-25起）

- `worker.js`：路由與AI代理
- `prompt.js`：**遊戲system prompt與submit_turn_result工具的唯一來源**，改完要重新部署
- `ap.js`：伺服器端行動點（十、10.3.11）
- `usage.js`：成本遙測與單價常數（十、10.5）
- `account.js`（2026-09-30第二批）：帳號Durable Object `AccountStore`——信箱驗證碼登入、綁定／登入併入／換綁、共用錢包、啟程禮每日上限與排隊
- `account-routes.js`：`/account/*`與`/gate`的HTTP路由；`gate.js`：全站每日花費計數、上限閘門、管理通知信(`UsageCounter` Durable Object)；`mail.js`：Resend寄信與信件內容；`http.js`：回應小工具
- 帳號與寄信的設定（Resend、DNS、secret、後台變數）：見repo根目錄「設定說明_帳號與寄信.md」

## 查詢用量

瀏覽器打開 `https://life-game.smile80275.workers.dev/usage-summary?token=你的管理密碼`，或：

```bash
curl -H "Authorization: Bearer 你的管理密碼" https://life-game.smile80275.workers.dev/usage-summary
```

`per_life`（2026-09-28起）分兩組：`all`＝全部人生（含還在玩的，會被拉低），`ended`＝已結束的人生（闔卷、刪除，或同一個格子已經換到下一世）。定價參考以`ended`為準；改版前就結束的人生沒有標記，會算在`all`裡
