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
