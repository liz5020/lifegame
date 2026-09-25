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
npx wrangler deploy
```

## 之後每次更新

```bash
cd worker && npx wrangler deploy
```

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

## 查詢用量

瀏覽器打開 `https://life-game.smile80275.workers.dev/usage-summary?token=你的管理密碼`，或：

```bash
curl -H "Authorization: Bearer 你的管理密碼" https://life-game.smile80275.workers.dev/usage-summary
```
