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
//   POST /claim-gift        body: {key, slot}(2026-09-25起要帶slot)  新手禮包：每把金鑰一輩子最多領3次，回傳 {granted, claimed, ap}
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
//
// 2026-09-25新增（佇列批次2：行動點改由Worker端檢查，設計文件十、10.3.11，細節見ap.js）：
//   POST / 的body必須帶 {key, slot, turn_nonce, life_id, messages}；Worker先讀KV的行動點餘額，不足回402不呼叫AI
//   POST /claim-gift body改為 {key, slot}：領禮包時同時建立/更新這條人生的伺服器端點數紀錄，回傳ap
//   GET  /ap?key=...&slot=...  讀這條人生的點數(會先做每日補點)，前端進遊戲時同步顯示用
//   POST /archive 會一併刪除這條人生的點數紀錄(禮包點消失)
//
// 2026-09-25新增（佇列批次3：成本遙測，設計文件十、10.5，細節見usage.js）：
//   每次Anthropic回應後把usage(四種token數)記進KV：每把金鑰＋slot＋這一世的累計、每日全站合計(分turn/chapter兩類)
//   GET /usage-summary  需帶管理密碼(Header「Authorization: Bearer <密碼>」或網址?token=<密碼>)
//     ⚠️密碼存在Worker secret「USAGE_ADMIN_TOKEN」：npx wrangler secret put USAGE_ADMIN_TOKEN
//     回傳今日/近7日合計、平均每回合花費、平均每條人生花費、快取命中率；不受來源白名單限制(方便直接用瀏覽器或curl查)
//
// 2026-09-25新增（佇列批次6：人生之書／章節成書，設計文件十五章）：
//   POST / 的body帶 kind:"chapter" 時是章節成書：{kind, key, slot, life_id, chapter_id, messages}
//   system/工具一樣由Worker決定(prompt.js的CHAPTER_SYSTEM_PROMPT/CHAPTER_TOOL)；不扣行動點，
//   但每條人生每玩10回合才累積1章額度(ap.js的preChapter)；用量記為chapter類別
//
// 2026-09-28新增（十五、15.1世代傳承保留上一代的人生之書）：
//   POST /family-book       body: {key, id, book:{owner, chapters:[...]}}  傳承時把上一代寫好的章節另存一筆，存檔裡只記id
//   GET  /family-book?key=...&id=...  讀回來唯讀閱讀
//   另外存是因為一本書約100KB，直接塞進存檔傳個幾代就會撞到MAX_STATE_BYTES(1MB)。人生回顧沒有真正刪除的功能，這些書不刪
//
// 2026-09-29新增（十、10.7雲端存檔瘦身）：
//   /save、/archive 改收壓縮過的存檔 {…, enc:"gzip-b64", z:"…"}(舊格式{state}照收)，大小上限一律以實際上傳的內容(壓縮後)計算；
//   Worker不解壓，原樣存進KV，/load、GET /archive 原樣回傳 {enc, z}，由前端解壓。MAX_STATE_BYTES(1MB)是這裡自訂的上限，
//   不是平台限制(Cloudflare KV單值上限25MiB、Worker請求本體上限100MB)
//   POST /stage-pack        body: {key, id, enc, z}  已結束人生階段的封存包(日記＋人生之書)，只在封存當下上傳一次
//   GET  /stage-pack?key=...&id=...  新裝置第一次打開已封存內容時才下載
// 2026-09-29新增（十、10.8封測期間暫停雲端存檔）：
//   wrangler.toml的[vars] CLOUD_SAVE_ENABLED 不是"true"(版本庫預設"false"，沒設定也算關閉)時，Worker完全不碰KV：
//   存檔類路徑(/claim-gift、/ap、/idle-*、/archive(s)、/stage-pack、/family-book)一律回503 cloud_disabled；
//   10.8.1手動存到雲端：/save(玩家按按鈕才呼叫，寫1次)、/slots與/load(換裝置輸入金鑰時才讀)照常開放；
//   AI代理只驗證payload、呼叫Anthropic、簡轉繁後回傳——不檢查/不扣行動點(點數改存玩家瀏覽器)、不記成本遙測；
//   /usage-summary回503。頻率限制改用Cloudflare內建的Rate Limiting綁定(env.RATE_LIMITER，不經KV)，沒綁定就不限制。
//   雲端程式碼全部保留，重新打開＝CLOUD_SAVE_ENABLED改"true"並重新部署(前端index.html的CLOUD_SAVE_DEFAULT也要一起改)
// 2026-09-28新增（十、10.5平均每條人生花費分兩種）：/archive與「同一個slot換了新life_id」時，把舊的一世標成已結束(usage.js的markLifeEnded)

import { convertAnthropicResponse } from "./s2t.js";
import { TURN_SYSTEM_PROMPT, TURN_RESULT_TOOL, CHAPTER_SYSTEM_PROMPT, CHAPTER_TOOL, IDLE_SUMMARY_SYSTEM_PROMPT, IDLE_SUMMARY_TOOL, LIFE_REVIEW_SYSTEM_PROMPT, LIFE_REVIEW_TOOL } from "./prompt.js";
import {
  AP_NEW_LIFE_GIFT, loadRecord, saveRecord, apKvKey, preCharge, postCharge, publicAP,
  isValidNonce, isValidLifeId, isUsableTurnResponse, taipeiDateString, nowMs,
  addChapterUnit, preChapter, isValidChapterId, isUsableChapterResponse,
  claimIdle, preIdleSummary, isUsableIdleSummaryResponse, chargeIdleRollback,
  canAffordLifeReview, chargeLifeReview, isUsableLifeReviewResponse, markAction
} from "./ap.js";
import { recordUsage, buildUsageSummary, extractUsage, costUSD, safeEqual, markLifeEnded } from "./usage.js";

const MAX_SLOTS = 3;
const MAX_KEY_LENGTH = 100;
const MAX_STATE_BYTES = 1024 * 1024;

const ALLOWED_ORIGINS = [
  "https://lifegamepage.smile80275.workers.dev",
  "https://lifegame-6an.pages.dev" // 2026-09-30起玩家用的Pages網址（連GitHub自動部署）
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

// 十、10.8（2026-09-29）：雲端存檔(KV)開關，只有明確設成"true"才打開
export function cloudEnabled(env) {
  return !!env && String(env.CLOUD_SAVE_ENABLED) === "true";
}
const CLOUD_ONLY_PATHS = ["/save", "/slots", "/load", "/claim-gift", "/ap", "/idle-claim", "/idle-rollback", "/archive", "/archives", "/stage-pack", "/family-book"];
// 十、10.8.1（2026-09-29）：暫停期間仍開放「手動存到雲端」用的三個網址——玩家按一次按鈕才呼叫一次(/save寫1次)，換裝置拿回時才讀(/slots、/load)
const MANUAL_SAVE_PATHS = { "/save": "POST", "/slots": "GET", "/load": "GET" };
// 關閉期間的頻率限制：Cloudflare Rate Limiting綁定(wrangler.toml)，不經KV；沒綁定(測試環境)就放行
async function checkRateLimitNoKV(request, env) {
  if (!env || !env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== "function") return true;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  try { const r = await env.RATE_LIMITER.limit({ key: ip }); return !!(r && r.success); }
  catch (e) { return true; } // 限流服務本身出錯時不擋玩家
}

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
// 十、10.3.12（2026-09-29）：測試鑰匙名單＝secret AP_TEST_KEYS(逗號分隔)；沒設定就沒有任何人有效
function isApTestKey(env, key) {
  if (!env || typeof env.AP_TEST_KEYS !== "string" || !isValidKey(key)) return false;
  return env.AP_TEST_KEYS.split(",").map(k => k.trim()).filter(Boolean).includes(key);
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
function stagePackKvKey(key, id) {
  return "stagepack:" + key + ":" + id;
}
const SAVE_ENCODINGS = ["gzip-b64", "json"];
// 10.7.2（2026-09-29）：從請求取出要存的內容——壓縮格式{enc,z}或舊格式{state}；回傳{error}或{fields, size}
function readSavePayload(body) {
  if (body && typeof body.z === "string") {
    if (!SAVE_ENCODINGS.includes(body.enc)) return { error: "不支援的存檔編碼" };
    return { fields: { enc: body.enc, z: body.z }, size: body.z.length };
  }
  if (body && body.state && typeof body.state === "object") {
    const s = JSON.stringify(body.state);
    return { fields: { state: body.state }, size: s.length };
  }
  return { error: "缺少state" };
}
function familyBookKvKey(key, id) {
  return "familybook:" + key + ":" + id;
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
  const { key, slot, meta } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse(origin, { success: false, error: "slot必須是0~2的整數" }, 400);
  const p = readSavePayload(body);
  if (p.error) return jsonResponse(origin, { success: false, error: p.error }, 400);
  if (p.size > MAX_STATE_BYTES) return jsonResponse(origin, { success: false, error: "存檔內容過大" }, 400);
  const record = JSON.stringify(Object.assign({ meta: meta || {} }, p.fields));
  await env.SAVES.put(kvKey(key, slot), record);
  return jsonResponse(origin, { success: true, size: p.size });
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
  const { key, slot } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  // 10.3.11（2026-09-25）：禮包點直接記進伺服器端這條人生的點數紀錄，所以一定要帶slot
  if (!isValidSlot(slot)) return jsonResponse(origin, { success: false, error: "slot必須是0~2的整數" }, 400);
  const countKey = "giftclaims:" + key;
  const claimed = Number(await env.SAVES.get(countKey)) || 0;
  const granted = claimed < GIFT_CLAIMS_PER_KEY;
  if (granted) await env.SAVES.put(countKey, String(claimed + 1));
  // 有舊紀錄(例如同一格子殘留)就沿用每日池與購買點，不會因為重複呼叫把每日池重新補滿
  const { rec } = await loadRecord(env, key, slot, null);
  if (granted) rec.gift += AP_NEW_LIFE_GIFT;
  await saveRecord(env, key, slot, rec);
  return jsonResponse(origin, { success: true, granted, claimed: granted ? claimed + 1 : claimed, ap: publicAP(rec) });
}

async function handleAPGet(request, env, origin) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const slot = Number(url.searchParams.get("slot"));
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse(origin, { success: false, error: "slot必須是0~2的整數" }, 400);
  const raw = await env.SAVES.get(apKvKey(key, slot));
  if (!raw) return jsonResponse(origin, { success: true, ap: null }); // 還沒有伺服器端紀錄(舊存檔)，第一次呼叫AI時才建立
  const { rec } = await loadRecord(env, key, slot, null);
  await saveRecord(env, key, slot, rec);
  return jsonResponse(origin, { success: true, ap: publicAP(rec) });
}

async function handleArchive(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { success: false, error: "請求內容不是合法JSON" }, 400); }
  const { key, slot, id, meta, purchased } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse(origin, { success: false, error: "slot必須是0~2的整數" }, 400);
  if (!isValidArchiveId(id)) return jsonResponse(origin, { success: false, error: "封存id格式不正確" }, 400);
  const p = readSavePayload(body);
  if (p.error) return jsonResponse(origin, { success: false, error: p.error }, 400);
  const lifeId = body.state ? body.state.lifeId : body.life_id;
  const safeMeta = {
    name: String((meta && meta.name) || "").slice(0, 20),
    age: Number(meta && meta.age) || 0,
    stage: String((meta && meta.stage) || "").slice(0, 20),
    reincarnations: Number(meta && meta.reincarnations) || 0,
    reason: (meta && meta.reason) === "deleted" ? "deleted" : "ended",
    endedAt: Number(meta && meta.endedAt) || Date.now()
  };
  if (p.size > MAX_STATE_BYTES) return jsonResponse(origin, { success: false, error: "存檔內容過大" }, 400);
  const record = JSON.stringify(Object.assign({ meta: safeMeta }, p.fields));
  // KV metadata讓/archives清單不用逐筆讀完整存檔
  await env.SAVES.put(archiveKvKey(key, id), record, { metadata: safeMeta });
  if (isValidLifeId(lifeId)) await markLifeEnded(env, key, slot, lifeId); // 10.5（2026-09-28）
  await env.SAVES.delete(kvKey(key, slot));
  await env.SAVES.delete(apKvKey(key, slot)); // 10.3.11：人生結束，這條人生的點數紀錄一起刪掉(禮包點消失)
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
    return jsonResponse(origin, parsed.z ? { success: true, meta: parsed.meta || {}, enc: parsed.enc, z: parsed.z } : { success: true, meta: parsed.meta || {}, state: parsed.state });
  } catch (e) { return jsonResponse(origin, { success: false, error: "存檔資料損毀" }, 500); }
}

// 十、10.7.3（2026-09-29）：人生階段封存包，Worker不解壓、原樣存取
async function handleStagePackSave(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { success: false, error: "請求內容不是合法JSON" }, 400); }
  const { key, id } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidArchiveId(id)) return jsonResponse(origin, { success: false, error: "封存包id格式不正確" }, 400);
  if (typeof body.z !== "string" || !SAVE_ENCODINGS.includes(body.enc)) return jsonResponse(origin, { success: false, error: "缺少封存包內容" }, 400);
  if (body.z.length > MAX_STATE_BYTES) return jsonResponse(origin, { success: false, error: "封存包內容過大" }, 400);
  await env.SAVES.put(stagePackKvKey(key, id), JSON.stringify({ enc: body.enc, z: body.z }));
  return jsonResponse(origin, { success: true, size: body.z.length });
}
async function handleStagePackLoad(request, env, origin) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const id = url.searchParams.get("id");
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidArchiveId(id)) return jsonResponse(origin, { success: false, error: "封存包id格式不正確" }, 400);
  const raw = await env.SAVES.get(stagePackKvKey(key, id));
  if (!raw) return jsonResponse(origin, { success: false, error: "找不到這個封存包" }, 404);
  try { return jsonResponse(origin, Object.assign({ success: true }, JSON.parse(raw))); }
  catch (e) { return jsonResponse(origin, { success: false, error: "資料損毀" }, 500); }
}

// 十五、15.1（2026-09-28）：世代傳承保留上一代的人生之書(唯讀)
async function handleFamilyBookSave(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { success: false, error: "請求內容不是合法JSON" }, 400); }
  const { key, id, book } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidArchiveId(id)) return jsonResponse(origin, { success: false, error: "書的id格式不正確" }, 400);
  if (!book || typeof book !== "object" || !Array.isArray(book.chapters)) return jsonResponse(origin, { success: false, error: "缺少book.chapters" }, 400);
  const record = JSON.stringify({ owner: String(book.owner || "").slice(0, 20), chapters: book.chapters });
  if (record.length > MAX_STATE_BYTES) return jsonResponse(origin, { success: false, error: "書的內容過大" }, 400);
  await env.SAVES.put(familyBookKvKey(key, id), record);
  return jsonResponse(origin, { success: true });
}
async function handleFamilyBookLoad(request, env, origin) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const id = url.searchParams.get("id");
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidArchiveId(id)) return jsonResponse(origin, { success: false, error: "書的id格式不正確" }, 400);
  const raw = await env.SAVES.get(familyBookKvKey(key, id));
  if (!raw) return jsonResponse(origin, { success: false, error: "找不到這本書" }, 404);
  try { return jsonResponse(origin, Object.assign({ success: true }, JSON.parse(raw))); }
  catch (e) { return jsonResponse(origin, { success: false, error: "資料損毀" }, 500); }
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
    return jsonResponse(origin, parsed.z ? { success: true, meta: parsed.meta || {}, enc: parsed.enc, z: parsed.z } : { success: true, meta: parsed.meta || {}, state: parsed.state });
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

// 十五、章節成書：payload驗證(素材只有每回合摘要與大事，不送完整敘事)
const MAX_CHAPTER_PAYLOAD_CHARS = 60000;
const MAX_CHAPTER_TOKENS = 6000; // 正文約1500-2500中文字，加上low effort的思考預留
export function validateChapterMessages(messages) {
  if (!Array.isArray(messages) || messages.length !== 1) return { ok: false, error: "messages必須剛好1則" };
  const m = messages[0];
  if (!m || typeof m !== "object" || m.role !== "user" || typeof m.content !== "string") return { ok: false, error: "messages[0]格式錯誤" };
  if (Object.keys(m).some(k => k !== "role" && k !== "content")) return { ok: false, error: "messages[0]含有不允許的欄位" };
  const chars = m.content.length;
  if (chars > MAX_CHAPTER_PAYLOAD_CHARS) return { ok: false, error: "請求內容過長", chars };
  let p;
  try { p = JSON.parse(m.content); } catch (e) { return { ok: false, error: "content不是章節素材" }; }
  if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, error: "content不是章節素材" };
  if (typeof p.player_name !== "string" || typeof p.stage_label !== "string" || typeof p.chapter_index !== "number" || typeof p.age_from !== "number" || typeof p.age_to !== "number") return { ok: false, error: "章節素材缺少必要欄位" };
  if (!Array.isArray(p.turn_summaries) || p.turn_summaries.length === 0 || p.turn_summaries.length > 200) return { ok: false, error: "turn_summaries數量不正確" };
  if (p.turn_summaries.some(x => !x || typeof x !== "object" || typeof x.s !== "string" || x.s.length > 400)) return { ok: false, error: "turn_summaries格式錯誤" };
  if (!Array.isArray(p.major_events) || p.major_events.length > 60 || p.major_events.some(x => typeof x !== "string" || x.length > 200)) return { ok: false, error: "major_events格式錯誤" };
  return { ok: true, payload: p, chars };
}
export function buildChapterRequest(messages) {
  return {
    model: ALLOWED_MODEL,
    max_tokens: MAX_CHAPTER_TOKENS,
    output_config: { effort: "low" },
    tools: [CHAPTER_TOOL],
    tool_choice: { type: "tool", name: CHAPTER_TOOL.name },
    system: [{ type: "text", text: CHAPTER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: messages[0].content }]
  };
}

function turnEmotionalTone(data) {
  try {
    const b = data && Array.isArray(data.content) && data.content.find(x => x.type === "tool_use" && x.input);
    return b && typeof b.input.emotional_tone === "string" ? b.input.emotional_tone : null;
  } catch (e) { return null; }
}
// ========== 十、10.6 放置代活（2026-09-27） ==========
// POST /idle-claim {key, slot}：伺服器依最後一次行動日期算完整離線天數×5(最多35)，領過就把最後行動日設成今天
async function handleIdleClaim(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { success: false, error: "請求內容不是合法JSON" }, 400); }
  const { key, slot } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse(origin, { success: false, error: "slot必須是0~2的整數" }, 400);
  const raw = await env.SAVES.get(apKvKey(key, slot));
  if (!raw) return jsonResponse(origin, { success: true, rounds: 0, offlineDays: 0 });
  const { rec, today } = await loadRecord(env, key, slot, null);
  const r = claimIdle(rec, today);
  await saveRecord(env, key, slot, rec);
  return jsonResponse(origin, { success: true, rounds: r.rounds, offlineDays: r.offlineDays, ap: publicAP(rec) });
}
// POST /idle-rollback {key, slot}：扣5點，回傳新餘額
async function handleIdleRollback(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { success: false, error: "請求內容不是合法JSON" }, 400); }
  const { key, slot } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidSlot(slot)) return jsonResponse(origin, { success: false, error: "slot必須是0~2的整數" }, 400);
  const { rec } = await loadRecord(env, key, slot, null);
  const r = chargeIdleRollback(rec);
  await saveRecord(env, key, slot, rec);
  if (!r.ok) return jsonResponse(origin, { success: false, error: r.error, ap: publicAP(rec) }, r.status);
  return jsonResponse(origin, { success: true, ap: publicAP(rec) });
}
const MAX_IDLE_SUMMARY_PAYLOAD_CHARS = 30000;
const MAX_IDLE_SUMMARY_TOKENS = 3000;
export function validateIdleSummaryMessages(messages) {
  if (!Array.isArray(messages) || messages.length !== 1) return { ok: false, error: "messages必須剛好1則" };
  const m = messages[0];
  if (!m || typeof m !== "object" || m.role !== "user" || typeof m.content !== "string") return { ok: false, error: "messages[0]格式錯誤" };
  if (Object.keys(m).some(k => k !== "role" && k !== "content")) return { ok: false, error: "messages[0]含有不允許的欄位" };
  if (m.content.length > MAX_IDLE_SUMMARY_PAYLOAD_CHARS) return { ok: false, error: "請求內容過長" };
  let p;
  try { p = JSON.parse(m.content); } catch (e) { return { ok: false, error: "content不是放置紀錄" }; }
  if (!p || typeof p !== "object" || !Array.isArray(p.idle_rounds) || p.idle_rounds.length === 0 || p.idle_rounds.length > 35) return { ok: false, error: "idle_rounds數量不正確" };
  if (p.idle_rounds.some(x => !x || typeof x !== "object" || typeof x.line !== "string" || x.line.length > 200)) return { ok: false, error: "idle_rounds格式錯誤" };
  if (!Array.isArray(p.key_rounds) || p.key_rounds.length > 5) return { ok: false, error: "key_rounds格式錯誤" };
  return { ok: true, payload: p, chars: m.content.length };
}
async function handleIdleSummary(body, env, origin, ctx) {
  const check = validateIdleSummaryMessages(body.messages);
  if (!check.ok) return jsonResponse(origin, { error: { type: "invalid_request", message: check.error } }, 400);
  const { key, slot, life_id: lifeId } = body;
  if (!isValidKey(key) || !isValidSlot(slot)) return jsonResponse(origin, { error: { type: "invalid_request", message: "AI請求必須附帶金鑰與slot" } }, 400);
  const safeLifeId = isValidLifeId(lifeId) ? lifeId : null;
  const { rec } = await loadRecord(env, key, slot, null);
  const pre = preIdleSummary(rec);
  await saveRecord(env, key, slot, rec);
  if (!pre.ok) return jsonResponse(origin, { error: pre.error }, pre.status);
  let upstream, text, data = null;
  try {
    upstream = await callAnthropic(env, {
      model: ALLOWED_MODEL, max_tokens: MAX_IDLE_SUMMARY_TOKENS, output_config: { effort: "low" },
      tools: [IDLE_SUMMARY_TOOL], tool_choice: { type: "tool", name: IDLE_SUMMARY_TOOL.name },
      system: [{ type: "text", text: IDLE_SUMMARY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: body.messages[0].content }]
    });
    text = await upstream.text();
    if (upstream.ok) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  } catch (err) {
    return jsonResponse(origin, { error: { message: String(err) } }, 502);
  }
  const lifegame = { usable: !!(upstream.ok && data && isUsableIdleSummaryResponse(data)) };
  if (upstream.sysChars) lifegame.sys_chars = upstream.sysChars; // 10.9.4
  if (upstream.ok && data && data.usage) {
    const tokens = extractUsage(data.usage);
    lifegame.usage = Object.assign({}, tokens, { cost_usd: Math.round(costUSD(tokens) * 1e6) / 1e6 });
    const job = recordUsage(env, { key, slot, lifeId: safeLifeId, category: "idle", usage: data.usage, countsAsTurn: false, payloadChars: check.chars, taipeiDate: taipeiDateString(nowMs(env)) });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); else await job;
  }
  if (upstream.ok && data) {
    let out = data;
    try { out = convertAnthropicResponse(data); } catch (e) { /* 轉換失敗就用原文 */ }
    out.lifegame = lifegame;
    return new Response(JSON.stringify(out), { status: upstream.status, headers: corsHeaders(origin) });
  }
  return new Response(text, { status: upstream.status, headers: corsHeaders(origin) });
}

// 十六、16.7.2（2026-09-28）：回顧這一生——人生軌跡＋人生花絮一次產生。餘額不足直接擋；AI產生成功才扣5點
const MAX_LIFE_REVIEW_PAYLOAD_CHARS = 30000;
const MAX_LIFE_REVIEW_TOKENS = 3000;
export function validateLifeReviewMessages(messages) {
  if (!Array.isArray(messages) || messages.length !== 1) return { ok: false, error: "messages必須剛好1則" };
  const m = messages[0];
  if (!m || typeof m !== "object" || m.role !== "user" || typeof m.content !== "string") return { ok: false, error: "messages[0]格式錯誤" };
  if (Object.keys(m).some(k => k !== "role" && k !== "content")) return { ok: false, error: "messages[0]含有不允許的欄位" };
  if (m.content.length > MAX_LIFE_REVIEW_PAYLOAD_CHARS) return { ok: false, error: "請求內容過長" };
  let p;
  try { p = JSON.parse(m.content); } catch (e) { return { ok: false, error: "content不是回顧素材" }; }
  if (!p || typeof p !== "object" || !Array.isArray(p.stages) || p.stages.length === 0 || p.stages.length > 12) return { ok: false, error: "stages數量不正確" };
  if (!Array.isArray(p.tidbits) || p.tidbits.length > 30) return { ok: false, error: "tidbits數量不正確" };
  return { ok: true, payload: p, chars: m.content.length };
}
async function handleLifeReview(body, env, origin, ctx) {
  const check = validateLifeReviewMessages(body.messages);
  if (!check.ok) return jsonResponse(origin, { error: { type: "invalid_request", message: check.error } }, 400);
  const { key, slot, life_id: lifeId } = body;
  if (!isValidKey(key) || !isValidSlot(slot)) return jsonResponse(origin, { error: { type: "invalid_request", message: "AI請求必須附帶金鑰與slot" } }, 400);
  const safeLifeId = isValidLifeId(lifeId) ? lifeId : null;
  const today = taipeiDateString(nowMs(env));
  {
    const { rec } = await loadRecord(env, key, slot, null);
    if (!canAffordLifeReview(rec)) return jsonResponse(origin, { error: { type: "insufficient_action_points", message: "行動點不足" }, lifegame: { ap: publicAP(rec) } }, 402);
  }
  let upstream, text, data = null;
  try {
    upstream = await callAnthropic(env, {
      model: ALLOWED_MODEL, max_tokens: MAX_LIFE_REVIEW_TOKENS, output_config: { effort: "low" },
      tools: [LIFE_REVIEW_TOOL], tool_choice: { type: "tool", name: LIFE_REVIEW_TOOL.name },
      system: [{ type: "text", text: LIFE_REVIEW_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: body.messages[0].content }]
    });
    text = await upstream.text();
    if (upstream.ok) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  } catch (err) {
    return jsonResponse(origin, { error: { message: String(err) } }, 502);
  }
  const usable = !!(upstream.ok && data && isUsableLifeReviewResponse(data));
  // 成功才扣點(重新讀一次紀錄再扣)
  const { rec } = await loadRecord(env, key, slot, null);
  if (usable) { chargeLifeReview(rec); await saveRecord(env, key, slot, rec); }
  const lifegame = { usable, ap: publicAP(rec) };
  if (upstream.sysChars) lifegame.sys_chars = upstream.sysChars; // 10.9.4
  if (upstream.ok && data && data.usage) {
    const tokens = extractUsage(data.usage);
    lifegame.usage = Object.assign({}, tokens, { cost_usd: Math.round(costUSD(tokens) * 1e6) / 1e6 });
    const job = recordUsage(env, { key, slot, lifeId: safeLifeId, category: "review", usage: data.usage, countsAsTurn: false, payloadChars: check.chars, taipeiDate: today });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); else await job;
  }
  if (usable) {
    let out = data;
    try { out = convertAnthropicResponse(data); } catch (e) { /* 轉換失敗就用原文 */ }
    out.lifegame = lifegame;
    return new Response(JSON.stringify(out), { status: 200, headers: corsHeaders(origin) });
  }
  return jsonResponse(origin, { error: { type: "upstream_unusable", message: "回顧生成失敗，沒有扣點" }, lifegame }, upstream.ok ? 502 : upstream.status);
}

async function handleChapter(body, env, origin, ctx) {
  const check = validateChapterMessages(body.messages);
  if (!check.ok) return jsonResponse(origin, { error: { type: "invalid_request", message: check.error } }, 400);
  const { key, slot, life_id: lifeId, chapter_id: chapterId } = body;
  if (!isValidKey(key) || !isValidSlot(slot)) return jsonResponse(origin, { error: { type: "invalid_request", message: "AI請求必須附帶金鑰與slot" } }, 400);
  if (!isValidChapterId(chapterId)) return jsonResponse(origin, { error: { type: "invalid_request", message: "缺少chapter_id" } }, 400);
  const safeLifeId = isValidLifeId(lifeId) ? lifeId : null;
  const { rec } = await loadRecord(env, key, slot, null);
  const pre = preChapter(rec, chapterId);
  await saveRecord(env, key, slot, rec);
  if (!pre.ok) return jsonResponse(origin, { error: pre.error }, pre.status);
  let upstream, text, data = null;
  try {
    upstream = await callAnthropic(env, buildChapterRequest(body.messages));
    text = await upstream.text();
    if (upstream.ok) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  } catch (err) {
    return jsonResponse(origin, { error: { message: String(err) } }, 502);
  }
  const lifegame = { usable: !!(upstream.ok && data && isUsableChapterResponse(data)) };
  if (upstream.sysChars) lifegame.sys_chars = upstream.sysChars; // 10.9.4
  if (upstream.ok && data && data.usage) {
    const tokens = extractUsage(data.usage);
    lifegame.usage = Object.assign({}, tokens, { cost_usd: Math.round(costUSD(tokens) * 1e6) / 1e6 });
    const job = recordUsage(env, { key, slot, lifeId: safeLifeId, category: "chapter", usage: data.usage, countsAsTurn: false, payloadChars: 0, taipeiDate: taipeiDateString(nowMs(env)) });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); else await job;
  }
  if (upstream.ok && data) {
    let out = data;
    try { out = convertAnthropicResponse(data); } catch (e) { /* 轉換失敗就用原文 */ }
    out.lifegame = lifegame;
    return new Response(JSON.stringify(out), { status: upstream.status, headers: corsHeaders(origin) });
  }
  return new Response(text, { status: upstream.status, headers: corsHeaders(origin) });
}

// 10.4：Worker自己組完整的Anthropic請求，前端送來的system/tools/tool_choice/model/max_tokens/output_config一律不採用
// 一、1.2.14（2026-09-29）：精簡名冊變動頻率低，拆成第一個content block並設cache_control，
// 讓「system＋工具＋名冊」這段前綴可以套用提示快取；其餘每回合都會變的payload放在後面
const MAX_ROSTER_LINES = 120, MAX_ROSTER_LINE_CHARS = 120;
export function turnUserContent(content) {
  let payload;
  try { payload = JSON.parse(content); } catch (e) { return content; }
  const roster = payload && payload.character_roster;
  if (!Array.isArray(roster) || !roster.length) return content;
  const lines = roster.filter(x => typeof x === "string").slice(0, MAX_ROSTER_LINES).map(x => x.slice(0, MAX_ROSTER_LINE_CHARS).replace(/\n/g, " "));
  delete payload.character_roster;
  return [
    { type: "text", text: "【名冊】\n" + lines.join("\n"), cache_control: { type: "ephemeral" } },
    { type: "text", text: JSON.stringify(payload) }
  ];
}
export function buildTurnRequest(messages) {
  return {
    model: ALLOWED_MODEL,
    max_tokens: MAX_ALLOWED_TOKENS,
    output_config: { effort: "low" },
    tools: [TURN_RESULT_TOOL],
    tool_choice: { type: "tool", name: TURN_RESULT_TOOL.name },
    system: [{ type: "text", text: TURN_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: turnUserContent(messages[0].content) }]
  };
}

// ---- 十、10.9.3.3（2026-09-30，第一批）全站當天用量計數 ----
// 只記錄、不擋人、不寄信、不跳窗。存在Durable Object(SQLite)的儲存，不是KV，所以不增加每回合KV寫入，
// 雲端存檔關閉(不碰KV)時也照樣計數。每次成功的AI呼叫估計花費EST_COST_PER_CALL_TWD元(約1元，10.9.3.1)。
// 兩個設定值只放Cloudflare後台環境變數(不寫進wrangler.toml，避免部署時蓋掉後台改過的值)：
//   DAILY_SPEND_CAP_TWD(全站每日花費上限，預設500元)、DAILY_GIFT_CAP(啟程禮每日發放上限，預設20份)。第一批只顯示、還不使用
export const EST_COST_PER_CALL_TWD = 1;
export const DEFAULT_DAILY_SPEND_CAP_TWD = 500;
export const DEFAULT_DAILY_GIFT_CAP = 20;
export function readSetting(env, name, fallback) {
  const n = Number(env && env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
// DO類別：一個全站實例，記「哪一天、幾次呼叫」，跨日(台灣日期不同)自動歸零。不繼承DurableObject基底類別，方便在node裡直接測試
export class UsageCounter {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || "";
    let cur = (await this.state.storage.get("day")) || { date, calls: 0 };
    if (cur.date !== date) cur = { date, calls: 0 };
    if (request.method === "POST") { cur.calls += 1; await this.state.storage.put("day", cur); }
    return new Response(JSON.stringify(cur), { headers: { "Content-Type": "application/json" } });
  }
}
function usageCounterStub(env) {
  if (!env || !env.USAGE_COUNTER) return null;
  return env.USAGE_COUNTER.get(env.USAGE_COUNTER.idFromName("global"));
}
async function countAICall(env) {
  try {
    const stub = usageCounterStub(env);
    if (!stub) return;
    await stub.fetch("https://usage.internal/add?date=" + taipeiDateString(nowMs(env)), { method: "POST" });
  } catch (e) { /* 計數失敗絕不能影響回合 */ }
}
async function buildUsageToday(env) {
  const date = taipeiDateString(nowMs(env));
  const out = { date, calls: 0, est_cost_twd: 0, est_cost_per_call_twd: EST_COST_PER_CALL_TWD,
    daily_spend_cap_twd: readSetting(env, "DAILY_SPEND_CAP_TWD", DEFAULT_DAILY_SPEND_CAP_TWD),
    daily_gift_cap: readSetting(env, "DAILY_GIFT_CAP", DEFAULT_DAILY_GIFT_CAP), counter: !!usageCounterStub(env) };
  const stub = usageCounterStub(env);
  if (stub) {
    const r = await stub.fetch("https://usage.internal/get?date=" + date);
    const d = await r.json();
    out.calls = d.calls || 0;
    out.est_cost_twd = out.calls * EST_COST_PER_CALL_TWD;
    out.pct_of_cap = Math.round(out.est_cost_twd / out.daily_spend_cap_twd * 1000) / 10;
  }
  return out;
}
async function handleUsageToday(request, env) {
  const denied = adminDenied(request, env);
  if (denied) return denied;
  return new Response(JSON.stringify(await buildUsageToday(env), null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function callAnthropic(env, upstreamBody) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(upstreamBody)
  });
  if (res.ok) await countAICall(env); // 十、10.9.3.3：全站當天用量計數(只記錄)
  // 十、10.9.4（2026-09-30）：固定規則(system prompt＋工具定義)的字數，給前端逐筆成本紀錄當比例參考(不換算token)
  try {
    const sys = (upstreamBody.system || []).reduce((n, b) => n + String(b.text || "").length, 0);
    res.sysChars = sys + JSON.stringify(upstreamBody.tools || []).length;
  } catch (e) { /* 只是參考數字 */ }
  return res;
}

// 十、10.8（2026-09-29）：雲端存檔關閉時的AI代理——不碰KV：不檢查行動點(改存玩家瀏覽器)、不記成本遙測；
// 仍然只接受遊戲的payload結構、system/工具/模型由Worker決定(10.4)，成功回應照樣簡轉繁。lifegame.usage照樣回傳給測試選單顯示
async function handleAIProxyNoKV(body, env, origin) {
  let check, upstreamBody, isUsable;
  if (body.kind === "chapter") {
    check = validateChapterMessages(body.messages);
    if (check.ok) upstreamBody = buildChapterRequest(body.messages);
    isUsable = isUsableChapterResponse;
  } else if (body.kind === "idle_summary") {
    check = validateIdleSummaryMessages(body.messages);
    if (check.ok) upstreamBody = {
      model: ALLOWED_MODEL, max_tokens: MAX_IDLE_SUMMARY_TOKENS, output_config: { effort: "low" },
      tools: [IDLE_SUMMARY_TOOL], tool_choice: { type: "tool", name: IDLE_SUMMARY_TOOL.name },
      system: [{ type: "text", text: IDLE_SUMMARY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: body.messages[0].content }]
    };
    isUsable = isUsableIdleSummaryResponse;
  } else if (body.kind === "life_review") {
    check = validateLifeReviewMessages(body.messages);
    if (check.ok) upstreamBody = {
      model: ALLOWED_MODEL, max_tokens: MAX_LIFE_REVIEW_TOKENS, output_config: { effort: "low" },
      tools: [LIFE_REVIEW_TOOL], tool_choice: { type: "tool", name: LIFE_REVIEW_TOOL.name },
      system: [{ type: "text", text: LIFE_REVIEW_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: body.messages[0].content }]
    };
    isUsable = isUsableLifeReviewResponse;
  } else {
    check = validateTurnMessages(body.messages);
    if (check.ok) upstreamBody = buildTurnRequest(body.messages);
    isUsable = isUsableTurnResponse;
  }
  if (!check.ok) return jsonResponse(origin, { error: { type: "invalid_request", message: check.error } }, 400);
  let upstream, text, data = null;
  try {
    upstream = await callAnthropic(env, upstreamBody);
    text = await upstream.text();
    if (upstream.ok) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  } catch (err) {
    return jsonResponse(origin, { error: { message: String(err) }, lifegame: { cloud_disabled: true } }, 502);
  }
  const lifegame = { usable: !!(upstream.ok && data && isUsable(data)), cloud_disabled: true };
  if (upstream.sysChars) lifegame.sys_chars = upstream.sysChars; // 10.9.4
  if (upstream.ok && data && data.usage) {
    const tokens = extractUsage(data.usage);
    lifegame.usage = Object.assign({}, tokens, { cost_usd: Math.round(costUSD(tokens) * 1e6) / 1e6 });
  }
  if (upstream.ok && data) {
    let out = data;
    try { out = convertAnthropicResponse(data); } catch (e) { /* 轉換失敗就用原文 */ }
    out.lifegame = lifegame;
    return new Response(JSON.stringify(out), { status: upstream.status, headers: corsHeaders(origin) });
  }
  return new Response(text, { status: upstream.status, headers: corsHeaders(origin) });
}

async function handleAIProxy(request, env, origin, ctx) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { error: { message: "請求內容不是合法JSON" } }, 400); }
  if (!body || typeof body !== "object") return jsonResponse(origin, { error: { message: "請求格式錯誤" } }, 400);
  if (!cloudEnabled(env)) return handleAIProxyNoKV(body, env, origin); // 十、10.8
  if (body.kind === "chapter") return handleChapter(body, env, origin, ctx); // 十五、章節成書
  if (body.kind === "idle_summary") return handleIdleSummary(body, env, origin, ctx); // 十、10.6.4放置摘要（2026-09-27）
  if (body.kind === "life_review") return handleLifeReview(body, env, origin, ctx); // 十六、16.7.2回顧這一生（2026-09-28）

  const check = validateTurnMessages(body.messages);
  if (!check.ok) return jsonResponse(origin, { error: { type: "invalid_request", message: check.error } }, 400);

  // 10.3.11：AI請求必須附帶金鑰與slot，Worker以伺服器端餘額為準
  const { key, slot, turn_nonce: nonce, life_id: lifeId, ap_hint: apHint } = body;
  if (!isValidKey(key) || !isValidSlot(slot)) return jsonResponse(origin, { error: { type: "invalid_request", message: "AI請求必須附帶金鑰與slot" } }, 400);
  if (!isValidNonce(nonce)) return jsonResponse(origin, { error: { type: "invalid_request", message: "缺少turn_nonce" } }, 400);
  const safeLifeId = isValidLifeId(lifeId) ? lifeId : null;
  const isPrologue = !!(check.payload.time_context && check.payload.time_context.is_prologue === true);

  const { rec } = await loadRecord(env, key, slot, apHint);
  // 10.5（2026-09-28）：同一個slot換了新的life_id＝上一世已經結束(世代傳承、轉世丹)，回應送出後把舊的一世標成已結束
  const endedLifeId = (safeLifeId && rec.currentLifeId && rec.currentLifeId !== safeLifeId) ? rec.currentLifeId : null;
  if (safeLifeId) rec.currentLifeId = safeLifeId;
  if (endedLifeId) {
    const endJob = markLifeEnded(env, key, slot, endedLifeId);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(endJob); else await endJob;
  }
  // 十、10.3.12（2026-09-29）：測試用「不扣行動點」——前端開關只是請求，Worker只認secret AP_TEST_KEYS登記的金鑰；
  // 生效時完全不動行動點紀錄(不預扣、不退點、不記nonce)，回合數、章節額度、最後行動日、用量遙測照常
  const apTestFree = body.ap_test_free === true && isApTestKey(env, key);
  const pre = apTestFree ? { ok: true, charge: null, testFree: true } : preCharge(rec, { nonce, isPrologue, lifeId: safeLifeId });
  if (!pre.ok) {
    await saveRecord(env, key, slot, rec);
    return jsonResponse(origin, { error: pre.error, lifegame: { ap: publicAP(rec) } }, pre.status);
  }
  await saveRecord(env, key, slot, rec); // 先扣(預留)再呼叫，避免同時送很多請求都通過餘額檢查

  let upstream, text, data = null;
  try {
    upstream = await callAnthropic(env, buildTurnRequest(body.messages));
    text = await upstream.text();
    if (upstream.ok) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  } catch (err) {
    if (!apTestFree) postCharge(rec, pre, false, safeLifeId);
    await saveRecord(env, key, slot, rec);
    return jsonResponse(origin, { error: { message: String(err) }, lifegame: { ap: publicAP(rec), ap_test_free: apTestFree } }, 502);
  }
  const usable = !!(upstream.ok && data && isUsableTurnResponse(data));
  if (apTestFree) { if (usable) markAction(rec, taipeiDateString(nowMs(env))); }
  else postCharge(rec, pre, usable, safeLifeId, taipeiDateString(nowMs(env)));
  if (usable && (pre.charge || pre.freePrologue || apTestFree)) addChapterUnit(rec); // 十五、每成功一個新回合累積章節額度
  await saveRecord(env, key, slot, rec);
  const lifegame = { ap: publicAP(rec), charged: !!(pre.charge && usable), ap_test_free: apTestFree };
  if (upstream.sysChars) lifegame.sys_chars = upstream.sysChars; // 10.9.4
  // 10.5：成本遙測。只要Anthropic有回應usage(就算內容格式壞掉也已經產生費用)就記；回應送出後才寫，失敗不影響回合
  if (upstream.ok && data && data.usage) {
    const tokens = extractUsage(data.usage);
    lifegame.usage = Object.assign({}, tokens, { cost_usd: Math.round(costUSD(tokens) * 1e6) / 1e6 });
    const job = recordUsage(env, {
      key, slot, lifeId: safeLifeId, category: "turn", usage: data.usage,
      countsAsTurn: usable && !!(pre.charge || pre.freePrologue || apTestFree), payloadChars: check.chars,
      taipeiDate: taipeiDateString(nowMs(env)), lastTone: turnEmotionalTone(data) // 6.5（2026-09-27）
    });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); else await job;
  }

  // 一、1.2.9.14（2026-09-24新增）：成功的回應先把AI輸出裡的簡體字轉成繁體再回傳；解析失敗或錯誤回應原樣轉發
  if (upstream.ok && data) {
    let out = data;
    try { out = convertAnthropicResponse(data); } catch (e) { /* 轉換失敗就用原文 */ }
    out.lifegame = lifegame;
    return new Response(JSON.stringify(out), { status: upstream.status, headers: corsHeaders(origin) });
  }
  return new Response(text, { status: upstream.status, headers: corsHeaders(origin) });
}

// 管理密碼檢查：通過回傳null，沒過回傳要送出的錯誤回應
function adminDenied(request, env) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (!env.USAGE_ADMIN_TOKEN) return new Response(JSON.stringify({ success: false, error: "尚未設定USAGE_ADMIN_TOKEN" }), { status: 503, headers });
  const url = new URL(request.url);
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : (url.searchParams.get("token") || "");
  if (!safeEqual(token, env.USAGE_ADMIN_TOKEN)) return new Response(JSON.stringify({ success: false, error: "密碼錯誤" }), { status: 401, headers });
  return null;
}
async function handleUsageSummary(request, env) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  const denied = adminDenied(request, env);
  if (denied) return denied;
  const summary = await buildUsageSummary(env, taipeiDateString(nowMs(env)));
  return new Response(JSON.stringify(summary, null, 2), { headers });
}

// 每次部署Worker前換成新版本號（要跟index.html的APP_VERSION同一個編號，並在DEPLOY.md記一行；tests/test-54-version.mjs會檢查）
const WORKER_VERSION = "2026.09.30-f";

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const reqUrl = new URL(request.url);
    // 10.5：管理用的用量摘要，靠管理密碼保護，不走來源白名單
    // 10.9.3.3：全站當天用量(呼叫次數、估計花費)，同一組管理密碼；不依賴KV，雲端存檔關閉時也能查
    if (reqUrl.pathname === "/usage-today" && request.method === "GET") return handleUsageToday(request, env);
    if (reqUrl.pathname === "/usage-summary" && request.method === "GET") {
      if (!cloudEnabled(env)) return new Response(JSON.stringify({ success: false, error: "封測期間暫停雲端存檔，成本遙測也暫停(十、10.8)", cloud_disabled: true }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      return handleUsageSummary(request, env);
    }

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

    const url = new URL(request.url);
    // 版本查詢（2026-09-30）：不碰KV，讓玩家與開發者確認線上跑的是哪一版
    if (url.pathname === "/version" && request.method === "GET") return jsonResponse(origin, { success: true, version: WORKER_VERSION });
    // 十、10.8（2026-09-29）：雲端存檔關閉時完全不碰KV——存檔類路徑直接回503，頻率限制改用不經KV的綁定
    if (!cloudEnabled(env)) {
      if (!(await checkRateLimitNoKV(request, env))) return jsonResponse(origin, { success: false, error: "請求太頻繁，請稍後再試" }, 429);
      if (MANUAL_SAVE_PATHS[url.pathname] === request.method) { // 10.8.1手動存到雲端
        if (url.pathname === "/save") return handleSave(request, env, origin);
        if (url.pathname === "/slots") return handleSlots(request, env, origin);
        return handleLoad(request, env, origin);
      }
      if (CLOUD_ONLY_PATHS.includes(url.pathname)) return jsonResponse(origin, { success: false, error: "封測期間暫停雲端存檔", cloud_disabled: true }, 503);
      if (request.method !== "POST") return new Response("Only POST is allowed", { status: 405 });
      return handleAIProxy(request, env, origin, ctx);
    }

    const allowed = await checkRateLimit(request, env);
    if (!allowed) return jsonResponse(origin, { success: false, error: "請求太頻繁，請稍後再試" }, 429);

    if (url.pathname === "/save" && request.method === "POST") return handleSave(request, env, origin);
    if (url.pathname === "/slots" && request.method === "GET") return handleSlots(request, env, origin);
    if (url.pathname === "/load" && request.method === "GET") return handleLoad(request, env, origin);
    if (url.pathname === "/claim-gift" && request.method === "POST") return handleClaimGift(request, env, origin);
    if (url.pathname === "/ap" && request.method === "GET") return handleAPGet(request, env, origin);
    if (url.pathname === "/idle-claim" && request.method === "POST") return handleIdleClaim(request, env, origin); // 10.6（2026-09-27）
    if (url.pathname === "/idle-rollback" && request.method === "POST") return handleIdleRollback(request, env, origin); // 10.6.5（2026-09-27）
    if (url.pathname === "/archive" && request.method === "POST") return handleArchive(request, env, origin);
    if (url.pathname === "/archives" && request.method === "GET") return handleArchives(request, env, origin);
    if (url.pathname === "/archive" && request.method === "GET") return handleArchiveLoad(request, env, origin);
    if (url.pathname === "/stage-pack" && request.method === "POST") return handleStagePackSave(request, env, origin); // 10.7.3（2026-09-29）
    if (url.pathname === "/stage-pack" && request.method === "GET") return handleStagePackLoad(request, env, origin);
    if (url.pathname === "/family-book" && request.method === "POST") return handleFamilyBookSave(request, env, origin); // 15.1（2026-09-28）
    if (url.pathname === "/family-book" && request.method === "GET") return handleFamilyBookLoad(request, env, origin);

    if (request.method !== "POST") return new Response("Only POST is allowed", { status: 405 });
    return handleAIProxy(request, env, origin, ctx);
  }
};
