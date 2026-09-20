// 這段程式碼是要貼到 Cloudflare Worker 的線上編輯器裡，不是自己執行的檔案。
// 步驟：Cloudflare Dashboard → Workers & Pages → 你的Worker → Edit code
// 把裡面原本的內容全部刪掉，貼上這一整份，然後 Deploy。
//
// 記得另外去 Settings → Variables and Secrets，新增一筆 Secret：
//   名稱：ANTHROPIC_API_KEY
//   值：你在 console.anthropic.com 建立的那組金鑰
// 金鑰只會存在這裡（伺服器端），不會被寫進遊戲網頁裡讓別人看到。
//
// 2026-09-19新增（十、存檔與帳號系統 10.1 封測階段純金鑰模式）：
// 新增 KV 綁定，用來存跨裝置存檔。部署前還需要一個額外步驟：
//   Cloudflare Dashboard → Workers & Pages → 你的Worker → Settings → Bindings → Add binding
//   類型選 KV Namespace，Variable name 填 SAVES（要跟下面程式碼裡的 env.SAVES 對上）
//   如果還沒有KV namespace，同一個畫面可以直接建立一個新的（例如命名 life-game-saves）
//
// 新增的三支API（原本的AI代理行為完全不變，繼續吃POST到根目錄"/"的請求）：
//   POST /save              body: {key, slot(0-2), meta:{name,age,stage,updatedAt}, state:{...}}
//   GET  /slots?key=...     回傳這組金鑰底下3個slot的meta摘要（不含完整state，給選擇畫面用）
//   GET  /load?key=...&slot=0~2   回傳指定slot的完整state

const MAX_SLOTS = 3;
const MAX_KEY_LENGTH = 100;
const MAX_STATE_BYTES = 1024 * 1024; // 1MB，正常存檔遠小於這個數字，純防呆避免異常大的payload

function corsHeaders(extra) {
  return Object.assign({
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  }, extra || {});
}
function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: corsHeaders() });
}
function isValidKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LENGTH;
}
function isValidSlot(slot) {
  return Number.isInteger(slot) && slot >= 0 && slot < MAX_SLOTS;
}
function kvKey(key, slot) {
  return "save:" + key + ":" + slot;
}

async function handleSave(request, env) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse({ success: false, error: "請求內容不是合法JSON" }, 400); }

  const { key, slot, meta, state } = body || {};
  if (!isValidKey(key)) return jsonResponse({ success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse({ success: false, error: "slot必須是0~2的整數" }, 400);
  if (!state || typeof state !== "object") return jsonResponse({ success: false, error: "缺少state" }, 400);

  const record = JSON.stringify({ meta: meta || {}, state });
  if (record.length > MAX_STATE_BYTES) return jsonResponse({ success: false, error: "存檔內容過大" }, 400);

  await env.SAVES.put(kvKey(key, slot), record);
  return jsonResponse({ success: true });
}

async function handleSlots(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!isValidKey(key)) return jsonResponse({ success: false, error: "金鑰格式不正確" }, 400);

  const slots = [];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const raw = await env.SAVES.get(kvKey(key, slot));
    if (!raw) { slots.push(null); continue; }
    try {
      const parsed = JSON.parse(raw);
      slots.push({ slot, meta: parsed.meta || {} });
    } catch (e) {
      slots.push(null); // 資料壞掉視同空slot，不讓整個請求失敗
    }
  }
  return jsonResponse({ success: true, slots });
}

async function handleLoad(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const slot = Number(url.searchParams.get("slot"));
  if (!isValidKey(key)) return jsonResponse({ success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse({ success: false, error: "slot必須是0~2的整數" }, 400);

  const raw = await env.SAVES.get(kvKey(key, slot));
  if (!raw) return jsonResponse({ success: false, error: "這個slot沒有存檔" }, 404);
  try {
    const parsed = JSON.parse(raw);
    return jsonResponse({ success: true, meta: parsed.meta || {}, state: parsed.state });
  } catch (e) {
    return jsonResponse({ success: false, error: "存檔資料損毀" }, 500);
  }
}

async function handleAIProxy(request, env) {
  try {
    const body = await request.text();

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body
    });

    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: corsHeaders()
    });
  } catch (err) {
    return jsonResponse({ error: { message: String(err) } }, 500);
  }
}

export default {
  async fetch(request, env) {
    // 瀏覽器送出正式請求前，會先送一個 OPTIONS 探路請求，這裡直接放行
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders({
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        })
      });
    }

    const url = new URL(request.url);

    // 2026-09-19新增：存檔相關的三支API，路徑判斷優先於原本的AI代理行為
    if (url.pathname === "/save" && request.method === "POST") {
      return handleSave(request, env);
    }
    if (url.pathname === "/slots" && request.method === "GET") {
      return handleSlots(request, env);
    }
    if (url.pathname === "/load" && request.method === "GET") {
      return handleLoad(request, env);
    }

    // 原本既有行為完全不變：任何其他POST請求（實際上就是根目錄"/"）都當作AI代理
    if (request.method !== "POST") {
      return new Response("Only POST is allowed", { status: 405 });
    }
    return handleAIProxy(request, env);
  }
};
