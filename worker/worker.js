// 【2026-09-24起改用wrangler部署，不再貼到Cloudflare線上編輯器】
// 原因：一、1.2.9.14簡轉繁要用到OpenCC(約1.1MB)，線上編輯器貼不進去。部署步驟見worker/README.md：
//   cd worker && npm install && npx wrangler login && npx wrangler deploy
// API金鑰用 `npx wrangler secret put ANTHROPIC_API_KEY` 存放(Cloudflare端加密保存)，絕對不要寫進程式碼或wrangler.toml
//
// 需要KV綁定（跨裝置存檔功能用）：
//   Cloudflare Dashboard → Workers & Pages → 你的Worker → Settings → Bindings → Add binding
//   類型選 KV Namespace，Variable name 填 SAVES（要跟下面程式碼裡的 env.SAVES 對上）
//   如果還沒有KV namespace，同一個畫面可以直接建立一個新的（例如命名 life-game-saves）
//
// 三支存檔API（原本的AI代理行為完全不變，繼續吃POST到根目錄"/"的請求）：
//   POST /save              body: {key, slot(0-2), meta:{name,age,stage,updatedAt}, state:{...}}
//   GET  /slots?key=...     回傳這組金鑰底下3個slot的meta摘要（不含完整state，給選擇畫面用）
//   GET  /load?key=...&slot=0~2   回傳指定slot的完整state
//
// 2026-09-22新增（費用與安全稽核）：
//   1. 來源白名單：只接受ALLOWED_ORIGINS清單裡的網域，其他一律403
//      ⚠️部署前務必把下面ALLOWED_ORIGINS換成你實際的Cloudflare Pages網址，不然遊戲會打不通
//   2. AI代理鎖死model/max_tokens：不管前端送什麼，一律強制改成安全值
//   3. 簡單頻率限制：同一IP每小時請求次數上限，用SAVES這個KV存計數
//
// 2026-09-23新增（設計文件十、10.3行動點經濟）：
//   POST /claim-gift        body: {key}  新手禮包：每把金鑰一輩子最多領3次，回傳 {granted, claimed}
//   POST /archive           body: {key, slot, id, meta, purchased, state}
//                           人生結束（闔卷/刪除）：存進人生回顧、清掉原slot空出格子、購買點加進金鑰錢包
//   GET  /archives?key=...  人生回顧清單（只有meta）
//   GET  /archive?key=...&id=...  單一段已結束人生的完整state（唯讀）
//   GET  /slots 回傳值多一個 wallet 欄位（金鑰錢包點數）
//   ⚠️購買點目前信任前端送來的數字——封測未開放購買所以永遠是0；開放付費前要改成以伺服器端(D1)紀錄為準
//
// 2026-09-25新增（佇列批次1：鎖住AI代理，設計文件十、10.4）：
//   AI代理(POST /)不再轉送前端送來的system/tools/tool_choice/model等任何欄位。Worker只取messages，
//   驗證結構後自己組出完整請求：system＝prompt.js的TURN_SYSTEM_PROMPT(含cache_control)、強制submit_turn_result工具。
//   ⚠️system prompt的唯一來源是worker/prompt.js，改prompt後必須重新部署Worker

import { convertAnthropicResponse } from "./s2t.js";
import { TURN_SYSTEM_PROMPT, TURN_RESULT_TOOL } from "./prompt.js";

const MAX_SLOTS = 3;
const MAX_KEY_LENGTH = 100;
const MAX_STATE_BYTES = 1024 * 1024;

const ALLOWED_ORIGINS = [
  "https://lifegamepage.smile80275.workers.dev"
  // , "http://localhost:8765" // 需要本機測試時再打開這行
];
const ALLOWED_MODEL = "claude-sonnet-5";
const MAX_ALLOWED_TOKENS = 3000;
// 10.4（2026-09-25）：單次回合請求的payload字數上限。實測mock整條人生(1394回合，15～88歲)：一般回合最長6,277字、
// 結局回合(送完整人生履歷)13,435字。真實AI的敘事比mock長很多(recent_turns_full會帶3回合完整原文)，保守估計一般回合
// 約1.5萬字、結局回合約2.5萬字，上限抓40,000字留餘裕。真實遊玩的實際最大值會記在遙測(max_payload_chars)，之後可依實測下修
const MAX_TURN_PAYLOAD_CHARS = 40000;
const MAX_PLAYER_ACTION_CHARS = 300; // 前端自由輸入上限200字(10.3.2)，開場/系統產生的行動文字另留餘裕
// buildUserMessage()一定會送的欄位，少任何一個就不是遊戲送的請求
const REQUIRED_TURN_PAYLOAD_FIELDS = { player_name: "string", gender: "string", age: "number", turn: "number", stats: "object", player_action: "string", forceEnding: "boolean" };
// 2026-09-23：30→200。每回合要打2次(AI＋存檔)，30次只夠玩約15回合/小時，新手禮包55點很快就會撞牆；
// 共用Wi-Fi的多位玩家也共享同一個IP額度。200仍足以擋惡意狂打，開放付費前改以伺服器端行動點餘額擋AI呼叫
const RATE_LIMIT_PER_HOUR = 200;
const GIFT_CLAIMS_PER_KEY = 3;
const MAX_ARCHIVE_ID_LENGTH = 40;

function isAllowedOrigin(origin) {
  return typeof origin === "string" && ALLOWED_ORIGINS.includes(origin);
}
function corsHeaders(origin, extra) {
  return Object.assign({
    "Access-Control-Allow-Origin": origin || "",
    "Content-Type": "application/json"
  }, extra || {});
}
function jsonResponse(origin, obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: corsHeaders(origin) });
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
function archiveKvKey(key, id) {
  return "archive:" + key + ":" + id;
}
function isValidArchiveId(id) {
  return typeof id === "string" && /^[a-z0-9]+$/.test(id) && id.length <= MAX_ARCHIVE_ID_LENGTH;
}

async function checkRateLimit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const hourBucket = new Date().toISOString().slice(0, 13);
  const rlKey = "ratelimit:" + ip + ":" + hourBucket;
  const current = Number(await env.SAVES.get(rlKey)) || 0;
  if (current >= RATE_LIMIT_PER_HOUR) return false;
  await env.SAVES.put(rlKey, String(current + 1), { expirationTtl: 3600 });
  return true;
}

async function handleSave(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { success: false, error: "請求內容不是合法JSON" }, 400); }
  const { key, slot, meta, state } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse(origin, { success: false, error: "slot必須是0~2的整數" }, 400);
  if (!state || typeof state !== "object") return jsonResponse(origin, { success: false, error: "缺少state" }, 400);
  const record = JSON.stringify({ meta: meta || {}, state });
  if (record.length > MAX_STATE_BYTES) return jsonResponse(origin, { success: false, error: "存檔內容過大" }, 400);
  await env.SAVES.put(kvKey(key, slot), record);
  return jsonResponse(origin, { success: true });
}

async function handleSlots(request, env, origin) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  const slots = [];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const raw = await env.SAVES.get(kvKey(key, slot));
    if (!raw) { slots.push(null); continue; }
    try {
      const parsed = JSON.parse(raw);
      slots.push({ slot, meta: parsed.meta || {} });
    } catch (e) { slots.push(null); }
  }
  const wallet = Number(await env.SAVES.get("wallet:" + key)) || 0;
  return jsonResponse(origin, { success: true, slots, wallet });
}

async function handleClaimGift(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { success: false, error: "請求內容不是合法JSON" }, 400); }
  const { key } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  const countKey = "giftclaims:" + key;
  const claimed = Number(await env.SAVES.get(countKey)) || 0;
  if (claimed >= GIFT_CLAIMS_PER_KEY) return jsonResponse(origin, { success: true, granted: false, claimed });
  await env.SAVES.put(countKey, String(claimed + 1));
  return jsonResponse(origin, { success: true, granted: true, claimed: claimed + 1 });
}

async function handleArchive(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { success: false, error: "請求內容不是合法JSON" }, 400); }
  const { key, slot, id, meta, purchased, state } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse(origin, { success: false, error: "slot必須是0~2的整數" }, 400);
  if (!isValidArchiveId(id)) return jsonResponse(origin, { success: false, error: "封存id格式不正確" }, 400);
  if (!state || typeof state !== "object") return jsonResponse(origin, { success: false, error: "缺少state" }, 400);
  const safeMeta = {
    name: String((meta && meta.name) || "").slice(0, 20),
    age: Number(meta && meta.age) || 0,
    stage: String((meta && meta.stage) || "").slice(0, 20),
    reincarnations: Number(meta && meta.reincarnations) || 0,
    reason: (meta && meta.reason) === "deleted" ? "deleted" : "ended",
    endedAt: Number(meta && meta.endedAt) || Date.now()
  };
  const record = JSON.stringify({ meta: safeMeta, state });
  if (record.length > MAX_STATE_BYTES) return jsonResponse(origin, { success: false, error: "存檔內容過大" }, 400);
  // KV metadata讓/archives清單不用逐筆讀完整存檔
  await env.SAVES.put(archiveKvKey(key, id), record, { metadata: safeMeta });
  await env.SAVES.delete(kvKey(key, slot));
  const add = Math.max(0, Math.floor(Number(purchased) || 0));
  if (add > 0) {
    const walletKey = "wallet:" + key;
    const current = Number(await env.SAVES.get(walletKey)) || 0;
    await env.SAVES.put(walletKey, String(current + add));
  }
  return jsonResponse(origin, { success: true });
}

async function handleArchives(request, env, origin) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  const prefix = "archive:" + key + ":";
  const archives = [];
  let cursor;
  do {
    const page = await env.SAVES.list({ prefix, cursor });
    page.keys.forEach(k => archives.push({ id: k.name.slice(prefix.length), meta: k.metadata || {} }));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return jsonResponse(origin, { success: true, archives });
}

async function handleArchiveLoad(request, env, origin) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const id = url.searchParams.get("id");
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidArchiveId(id)) return jsonResponse(origin, { success: false, error: "封存id格式不正確" }, 400);
  const raw = await env.SAVES.get(archiveKvKey(key, id));
  if (!raw) return jsonResponse(origin, { success: false, error: "找不到這段人生" }, 404);
  try {
    const parsed = JSON.parse(raw);
    return jsonResponse(origin, { success: true, meta: parsed.meta || {}, state: parsed.state });
  } catch (e) { return jsonResponse(origin, { success: false, error: "存檔資料損毀" }, 500); }
}

async function handleLoad(request, env, origin) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const slot = Number(url.searchParams.get("slot"));
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse(origin, { success: false, error: "slot必須是0~2的整數" }, 400);
  const raw = await env.SAVES.get(kvKey(key, slot));
  if (!raw) return jsonResponse(origin, { success: false, error: "這個slot沒有存檔" }, 404);
  try {
    const parsed = JSON.parse(raw);
    return jsonResponse(origin, { success: true, meta: parsed.meta || {}, state: parsed.state });
  } catch (e) { return jsonResponse(origin, { success: false, error: "存檔資料損毀" }, 500); }
}

// 10.4（2026-09-25）：只接受遊戲實際會送的結構——messages剛好1則、role為user、content是字串且能解析成
// buildUserMessage()產生的payload物件。回傳{ok, error, payload, chars}
export function validateTurnMessages(messages) {
  if (!Array.isArray(messages) || messages.length !== 1) return { ok: false, error: "messages必須剛好1則" };
  const m = messages[0];
  if (!m || typeof m !== "object" || m.role !== "user") return { ok: false, error: "messages[0]必須是user訊息" };
  if (Object.keys(m).some(k => k !== "role" && k !== "content")) return { ok: false, error: "messages[0]含有不允許的欄位" };
  if (typeof m.content !== "string") return { ok: false, error: "content必須是字串" };
  const chars = m.content.length;
  if (chars > MAX_TURN_PAYLOAD_CHARS) return { ok: false, error: "請求內容過長", chars };
  let payload;
  try { payload = JSON.parse(m.content); } catch (e) { return { ok: false, error: "content不是遊戲payload" }; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, error: "content不是遊戲payload" };
  for (const [k, t] of Object.entries(REQUIRED_TURN_PAYLOAD_FIELDS)) {
    const v = payload[k];
    if (t === "object" ? (!v || typeof v !== "object") : typeof v !== t) return { ok: false, error: "payload缺少或格式錯誤：" + k };
  }
  if (Array.from(payload.player_action).length > MAX_PLAYER_ACTION_CHARS) return { ok: false, error: "player_action過長" };
  return { ok: true, payload, chars };
}

// 10.4：Worker自己組完整的Anthropic請求，前端送來的system/tools/tool_choice/model/max_tokens/output_config一律不採用
export function buildTurnRequest(messages) {
  return {
    model: ALLOWED_MODEL,
    max_tokens: MAX_ALLOWED_TOKENS,
    output_config: { effort: "low" },
    tools: [TURN_RESULT_TOOL],
    tool_choice: { type: "tool", name: TURN_RESULT_TOOL.name },
    system: [{ type: "text", text: TURN_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: messages[0].content }]
  };
}

async function callAnthropic(env, upstreamBody) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(upstreamBody)
  });
}

async function handleAIProxy(request, env, origin) {
  try {
    let body;
    try { body = await request.json(); }
    catch (e) { return jsonResponse(origin, { error: { message: "請求內容不是合法JSON" } }, 400); }
    if (!body || typeof body !== "object") return jsonResponse(origin, { error: { message: "請求格式錯誤" } }, 400);

    const check = validateTurnMessages(body.messages);
    if (!check.ok) return jsonResponse(origin, { error: { type: "invalid_request", message: check.error } }, 400);

    const upstream = await callAnthropic(env, buildTurnRequest(body.messages));
    const text = await upstream.text();
    // 一、1.2.9.14（2026-09-24新增）：成功的回應先把AI輸出裡的簡體字轉成繁體再回傳；解析失敗或錯誤回應原樣轉發
    if (upstream.ok) {
      try {
        const data = convertAnthropicResponse(JSON.parse(text));
        return new Response(JSON.stringify(data), { status: upstream.status, headers: corsHeaders(origin) });
      } catch (e) { /* 不是合法JSON就原樣轉發，由前端既有的錯誤處理接手 */ }
    }
    return new Response(text, { status: upstream.status, headers: corsHeaders(origin) });
  } catch (err) {
    return jsonResponse(origin, { error: { message: String(err) } }, 500);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        headers: corsHeaders(origin, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        })
      });
    }

    if (!isAllowedOrigin(origin)) {
      return new Response(JSON.stringify({ success: false, error: "來源不被允許" }), {
        status: 403, headers: { "Content-Type": "application/json" }
      });
    }

    const allowed = await checkRateLimit(request, env);
    if (!allowed) return jsonResponse(origin, { success: false, error: "請求太頻繁，請稍後再試" }, 429);

    const url = new URL(request.url);
    if (url.pathname === "/save" && request.method === "POST") return handleSave(request, env, origin);
    if (url.pathname === "/slots" && request.method === "GET") return handleSlots(request, env, origin);
    if (url.pathname === "/load" && request.method === "GET") return handleLoad(request, env, origin);
    if (url.pathname === "/claim-gift" && request.method === "POST") return handleClaimGift(request, env, origin);
    if (url.pathname === "/archive" && request.method === "POST") return handleArchive(request, env, origin);
    if (url.pathname === "/archives" && request.method === "GET") return handleArchives(request, env, origin);
    if (url.pathname === "/archive" && request.method === "GET") return handleArchiveLoad(request, env, origin);

    if (request.method !== "POST") return new Response("Only POST is allowed", { status: 405 });
    return handleAIProxy(request, env, origin);
  }
};
