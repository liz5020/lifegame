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
// 2026-09-30新增（十、10.2／10.9.2／10.9.3，第二批：帳號系統、寄信、共用錢包、綁定、啟程禮、花費上限擋人）：
//   account.js：帳號Durable Object(ACCOUNTS)——信箱驗證碼登入(6位數、10分鐘、5次作廢)、登入90天、綁定／登入併入／換綁、共用錢包、
//     啟程禮(每信箱2份、每日發放上限與隔天補發排隊)；account-routes.js：/account/*與/gate的HTTP路由；mail.js：Resend寄信；
//     gate.js：全站每日花費計數(UsageCounter)、上限閘門與管理通知信。全部不碰KV，雲端存檔關閉時照樣能用。
//   AI代理(POST /)：先過花費上限閘門(碰到上限暫停「從未購買過」帳號的所有AI呼叫，回503 daily_cap_reached)；body帶wallet:true且有登入token時走帳號錢包扣點。
//   設定名稱(Cloudflare後台，不寫進wrangler.toml)：secret RESEND_API_KEY；變數ADMIN_NOTIFY_EMAIL、DAILY_SPEND_CAP、DAILY_GIFT_CAP、DAILY_VERIFY_EMAIL_CAP、AI_CALL_COST_ESTIMATE。步驟見「設定說明_帳號與寄信.md」
// 2026-09-28新增（十、10.5平均每條人生花費分兩種）：/archive與「同一個slot換了新life_id」時，把舊的一世標成已結束(usage.js的markLifeEnded)

import { convertAnthropicResponse } from "./s2t.js";
import { TURN_SYSTEM_PROMPT, TURN_RESULT_TOOL, CHAPTER_SYSTEM_PROMPT, CHAPTER_TOOL, IDLE_SUMMARY_SYSTEM_PROMPT, IDLE_SUMMARY_TOOL, LIFE_REVIEW_SYSTEM_PROMPT, LIFE_REVIEW_TOOL } from "./prompt.js";
import {
  AP_UNBOUND_GIFT, loadRecord, saveRecord, apKvKey, preCharge, postCharge, publicAP,
  isValidNonce, isValidLifeId, isUsableTurnResponse, taipeiDateString, nowMs,
  addChapterUnit, preChapter, isValidChapterId, isUsableChapterResponse,
  claimIdle, preIdleSummary, isUsableIdleSummaryResponse, chargeIdleRollback,
  canAffordLifeReview, chargeLifeReview, isUsableLifeReviewResponse, markAction, LIFE_REVIEW_COST
} from "./ap.js";
import { recordUsage, buildUsageSummary, extractUsage, costUSD, safeEqual, markLifeEnded } from "./usage.js";
import { corsHeaders, jsonResponse } from "./http.js";
import {
  UsageCounter, readSetting, spendCap, giftCap, callCostEstimate, USD_TO_TWD, usageCall, usageCounterStub, accountsCall, accountStore,
  bearerToken, countAICall, recordAIUsage, spendGate, syncGiftStats, DEFAULT_DAILY_SPEND_CAP, DEFAULT_DAILY_GIFT_CAP
} from "./gate.js";
import { AccountStore } from "./account.js";
import { handleAccountRoute, isAccountPath } from "./account-routes.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import { runWaitlistTick } from "./entry.js";
import { handleSaveAdmin, isAdminPath, indexSaveRecord } from "./save-admin.js";
import { relocateRequest, locationId, locationSecretOk, isLoc } from "./location.js";

// Durable Object類別一定要從Worker主檔匯出(wrangler.toml的binding用類別名稱找)
export { UsageCounter, AccountStore };

const MAX_SLOTS = 3;
const MAX_KEY_LENGTH = 100;
const MAX_STATE_BYTES = 1024 * 1024;

const ALLOWED_ORIGINS = [
  "https://lifegamepage.smile80275.workers.dev",
  "https://lifegame-6an.pages.dev", // 2026-09-30起玩家用的Pages網址（連GitHub自動部署）
  "https://draftmylife.com" // 2026-10-04起正式網域（同一個Pages專案）
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
const GIFT_CLAIMS_PER_KEY = 1; // 2026-09-30第三批：未綁信箱每把金鑰只領1次25點
const MAX_ARCHIVE_ID_LENGTH = 40;

// 十、10.8（2026-09-29）：雲端存檔(KV)開關，只有明確設成"true"才打開
export function cloudEnabled(env) {
  return !!env && String(env.CLOUD_SAVE_ENABLED) === "true";
}
const CLOUD_ONLY_PATHS = ["/save", "/slots", "/load", "/claim-gift", "/ap", "/idle-claim", "/idle-rollback", "/archive", "/archives", "/stage-pack", "/family-book"];
// 十、10.8.1（2026-09-29）：暫停期間仍開放「手動存到雲端」用的三個網址——玩家按一次按鈕才呼叫一次(/save寫1次)，換裝置拿回時才讀(/slots、/load)
// 十、10.13.3（2026-10-01）：自動存檔(每10回合與人生結束)也走這三個網址；已結束階段的封存包(/stage-pack，每個階段只寫1次)一併開放，長壽人生的存檔才不會超過大小上限
const MANUAL_SAVE_PATHS = { "/save": ["POST"], "/slots": ["GET"], "/load": ["GET"], "/stage-pack": ["POST", "GET"] };
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
function isValidKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LENGTH;
}
// 十、10.3.12（2026-09-29）：測試鑰匙名單＝secret AP_TEST_KEYS(逗號分隔)；沒設定就沒有任何人有效
// 十、10.8.2（2026-10-04定案）：名單改為只存門牌(64碼十六進位)；這裡收到的key已經是請求入口換好的門牌，直接比對
function isApTestKey(env, key) {
  if (!env || typeof env.AP_TEST_KEYS !== "string" || !isLoc(key)) return false;
  return env.AP_TEST_KEYS.split(",").map(k => k.trim().toLowerCase()).filter(Boolean).includes(key);
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
  try { await indexSaveRecord(env, key, slot, meta, p.size); } catch (e) { console.warn("存檔索引更新失敗(不影響存檔)", e); } // 十、10.13.6：索引在存檔寫入時自動補建
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
  if (granted) rec.gift += AP_UNBOUND_GIFT;
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
export const DEFAULT_STAGE_PACK_RATE_PER_HOUR = 60;
export const DEFAULT_STAGE_PACK_ORPHAN_DAYS = 7;
async function ipTag(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("packrate|" + ip));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function stagePackRateOk(request, env) {
  if (!accountStore(env)) return true;
  try {
    const now = nowMs(env);
    const r = await accountsCall(env, { op: "pack_rate", ip: await ipTag(request), hour: new Date(now).toISOString().slice(0, 13), limit: readSetting(env, "STAGE_PACK_RATE_PER_HOUR", DEFAULT_STAGE_PACK_RATE_PER_HOUR) });
    return !(r && r.ok && r.allowed === false);
  } catch (e) { return true; } // 計數服務出錯時不擋玩家
}
// 10.13.3(2026-10-03補充二)：孤兒封存包清理——封存包寫入後STAGE_PACK_ORPHAN_DAYS天(預設7)這把金鑰仍沒有主存檔就刪除；每日排程呼叫，回傳本次刪掉的數量並寫進執行紀錄。
// 舊封存包沒有at：第一次看到時補記現在的時間(從這天起算7天)。刪除後該階段視為尚未寫入，玩家下次存檔可再傳1次
export async function cleanupOrphanStagePacks(env) {
  const now = nowMs(env), maxAge = readSetting(env, "STAGE_PACK_ORPHAN_DAYS", DEFAULT_STAGE_PACK_ORPHAN_DAYS) * 86400000;
  const hasMain = new Map(); let deleted = 0, checked = 0, cursor;
  do {
    const page = await env.SAVES.list({ prefix: "stagepack:", cursor });
    for (const k of page.keys || []) {
      checked++;
      const raw = await env.SAVES.get(k.name);
      if (raw === null) continue;
      let rec; try { rec = JSON.parse(raw); } catch (e) { continue; }
      if (!Number.isFinite(rec.at)) { rec.at = now; await env.SAVES.put(k.name, JSON.stringify(rec)); continue; }
      if (now - rec.at < maxAge) continue;
      // 10.8.2：封存包名稱裡是門牌；搬遷前的舊名稱裡是金鑰原文(算出門牌，兩種位置的主存檔都看)
      const who = k.name.slice("stagepack:".length, k.name.lastIndexOf(":"));
      const legacyKey = isLoc(who) ? null : who;
      const loc = legacyKey === null ? who : await locationId(env, legacyKey);
      if (!loc) continue; // 位置密鑰沒設好：寧可不清，也不要誤刪
      if (!hasMain.has(who)) {
        let any = false;
        for (let slot = 0; slot < MAX_SLOTS && !any; slot++) {
          any = (await env.SAVES.get(kvKey(loc, slot))) !== null || (legacyKey !== null && (await env.SAVES.get(kvKey(legacyKey, slot))) !== null);
        }
        hasMain.set(who, any);
      }
      if (!hasMain.get(who)) { await env.SAVES.delete(k.name); deleted++; }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  console.log("孤兒封存包清理：檢查" + checked + "個，刪除" + deleted + "個");
  return { checked, deleted };
}
async function handleStagePackSave(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { success: false, error: "請求內容不是合法JSON" }, 400); }
  const { key, id } = body || {};
  if (!isValidKey(key)) return jsonResponse(origin, { success: false, error: "金鑰格式不正確" }, 400);
  if (!isValidArchiveId(id)) return jsonResponse(origin, { success: false, error: "封存包id格式不正確" }, 400);
  if (typeof body.z !== "string" || !SAVE_ENCODINGS.includes(body.enc)) return jsonResponse(origin, { success: false, error: "缺少封存包內容" }, 400);
  if (body.z.length > MAX_STATE_BYTES) return jsonResponse(origin, { success: false, error: "封存包內容過大" }, 400);
  // 10.13.3(2026-10-03定案＋補充二)：①每個階段只寫1次——已經有這個封存包就不再寫(回成功，讓前端把它標成已上傳)
  const kv = stagePackKvKey(key, id);
  if (await env.SAVES.get(kv) !== null) return jsonResponse(origin, { success: true, size: body.z.length, existed: true });
  // ②同一個來源位址每小時最多STAGE_PACK_RATE_PER_HOUR次(預設60)；超過拒絕，玩家端視同存檔失敗。計數在帳號Durable Object，不放KV；沒有DO(測試)就放行
  if (!(await stagePackRateOk(request, env))) return jsonResponse(origin, { success: false, error: "封存包寫入太頻繁，請稍後再試" }, 429);
  // ③寫入時記時間(at)，每日清理孤兒封存包用
  await env.SAVES.put(kv, JSON.stringify({ enc: body.enc, z: body.z, at: nowMs(env) }));
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
    }, ctx, { kind: "idle", lifeId: safeLifeId }); // 10.14.7
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
    }, ctx, { kind: "review", lifeId: safeLifeId }); // 10.14.7
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
    upstream = await callAnthropic(env, buildChapterRequest(body.messages), ctx, { kind: "chapter", lifeId: safeLifeId }); // 10.14.7
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
// 十、10.14.3（2026-10-04）：很少變又很大的欄位也放進提示快取；欄位內容一字不變，只是換位置、分段送。
// 快取區塊由前往後排「變動由少到多」：少變資料→名冊→本回合資料，前面的區塊變動會讓它自己與後面全部重算。
// 這份清單由示範模式量過每個欄位的字數與變動次數挑出(見QA手冊34.21)；新增欄位只要「大而且幾乎不變」才放進來，常變的欄位放進來反而讓整段快取一直失效。
// （2026-10-04使用者拍板，依上線後真實紀錄調整：後期人物卡active_characters幾乎每回合都變，放進快取只是多付1.25倍寫入費，移回本回合資料；
//  名冊後期也常變，改排在少變資料後面，名冊變動時少變資料不必跟著重寫）
export const STABLE_PAYLOAD_KEYS = ["milestone_status", "milestone_skip_reason", "character_appearance", "family_structure", "family_background",
  "key_event", "is_politician_child_hidden_flag", "stat_delta_limits", "intimacy_mode", "chronicle_recent",
  "home_purchase_min_down_payment_pct", "player_pronoun"]; // 10.14.8.4（2026-10-05）：兩個固定不變的值也放進來
function pickPayloadKeys(payload, keys) {
  const out = {};
  for (const k of keys) if (k in payload) { out[k] = payload[k]; delete payload[k]; }
  return Object.keys(out).length ? out : null;
}
export function turnUserContent(content) {
  let payload;
  try { payload = JSON.parse(content); } catch (e) { return content; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return content;
  const roster = payload.character_roster;
  const hasRoster = Array.isArray(roster) && roster.length > 0;
  const hasStable = STABLE_PAYLOAD_KEYS.some(k => k in payload);
  if (!hasRoster && !hasStable) return content;
  const blocks = [];
  const stable = pickPayloadKeys(payload, STABLE_PAYLOAD_KEYS);
  if (stable) blocks.push({ type: "text", text: "【少變資料】\n" + JSON.stringify(stable), cache_control: { type: "ephemeral" } });
  if (hasRoster) {
    const lines = roster.filter(x => typeof x === "string").slice(0, MAX_ROSTER_LINES).map(x => x.slice(0, MAX_ROSTER_LINE_CHARS).replace(/\n/g, " "));
    delete payload.character_roster;
    blocks.push({ type: "text", text: "【名冊】\n" + lines.join("\n"), cache_control: { type: "ephemeral" } });
  }
  blocks.push({ type: "text", text: JSON.stringify(payload) });
  return blocks;
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

// ---- 十、10.9.3.3／10.9.3.1 全站當天用量計數與花費上限：實作在gate.js(UsageCounter Durable Object)，這裡只查看 ----
export const EST_COST_PER_CALL_TWD = 1;
export const DEFAULT_DAILY_SPEND_CAP_TWD = DEFAULT_DAILY_SPEND_CAP;
export { DEFAULT_DAILY_GIFT_CAP, readSetting };
async function buildUsageToday(env) {
  const now = nowMs(env), date = taipeiDateString(now);
  const cap = spendCap(env);
  const out = { date, calls: 0, est_cost_twd: 0, est_cost_per_call_twd: callCostEstimate(env), estimate_source: "fixed",
    daily_spend_cap_twd: cap, daily_gift_cap: giftCap(env), counter: !!usageCounterStub(env) };
  if (out.counter) {
    const d = await usageCall(env, "get", {}, "GET");
    out.calls = d.calls || 0;
    out.est_cost_twd = Math.round((d.spent || 0) * 100) / 100;
    out.pct_of_cap = Math.round(out.est_cost_twd / cap * 1000) / 10;
    out.paused_for_never_purchased = !!d.capped; // 10.9.3.1：「當日花費＋這次預估」達上限＝暫停從未購買過的帳號(10.9.3.1a補充二)
    if (d.estimate_twd !== undefined) { out.est_cost_per_call_twd = d.estimate_twd; out.estimate_source = d.estimate_source; out.recent_7d_calls = d.recent_calls; }
    out.gifts = { issued: d.gifts || 0, queued: d.queued || 0, cap: out.daily_gift_cap };
    out.notices = {};
    for (const [k, v] of Object.entries(d.notices || {})) out.notices[k] = { sent: !!v.sent, attempts: v.attempts || 0 };
  }
  if (accountStore(env)) {
    try { const st = await accountsCall(env, { op: "stats" }); out.verify_emails_today = st.verify_emails; out.verify_email_cap = readSetting(env, "DAILY_VERIFY_EMAIL_CAP", 80); out.gifts_queued_accounts = st.gifts_queued; } catch (e) { /* 只是看數字 */ }
  }
  out.mail = { resend_key_set: !!env.RESEND_API_KEY, admin_email_set: !!env.ADMIN_NOTIFY_EMAIL };
  return out;
}
async function handleUsageToday(request, env) {
  const denied = adminDenied(request, env, true);
  if (denied) return denied;
  return new Response(JSON.stringify(await buildUsageToday(env), null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

// 十、10.14.7（2026-10-04）：meta有值時，回應成功後在背景把Anthropic回報的實際用量記進用量計數器(不影響回應速度與內容)
async function callAnthropic(env, upstreamBody, ctx, meta) {
  let res;
  const startedAt = Date.now(); // 十、10.17.2：Worker呼叫Anthropic到收到回應的耗時(毫秒)，記進逐筆紀錄
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(upstreamBody)
    });
  } catch (e) {
    await countAICall(env, ctx); // 連線失敗也算一次呼叫(2026-10-02定案A3：每日花費上限是內部成本帳，所有呼叫含失敗的都計入)；沒有回報用量，照預估計入(10.9.3.1a補充二)；玩家端照舊不扣點、不算回合
    throw e;
  }
  const elapsedMs = Date.now() - startedAt;
  // 十、10.9.3.1／10.9.3.3／10.9.3.1a補充二(2026-10-08)：每次AI呼叫記一筆花費——有回報用量的記實際花費(美元×匯率)，沒有的(失敗呼叫)照預估；達80%／上限時寄管理通知信
  let usage = null;
  if (res.ok) { try { const d = await res.clone().json(); if (d && d.usage) usage = extractUsage(d.usage); } catch (e) { usage = null; } }
  await countAICall(env, ctx, usage ? costUSD(usage) * USD_TO_TWD : undefined);
  if (meta && usage) {
    const job = recordAIUsage(env, Object.assign({}, meta, { ms: elapsedMs }), usage, costUSD(usage)).catch(() => {});
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); else await job;
  }
  // 十、10.9.4（2026-09-30）：固定規則(system prompt＋工具定義)的字數，給前端逐筆成本紀錄當比例參考(不換算token)
  try {
    const sys = (upstreamBody.system || []).reduce((n, b) => n + String(b.text || "").length, 0);
    res.sysChars = sys + JSON.stringify(upstreamBody.tools || []).length;
  } catch (e) { /* 只是參考數字 */ }
  return res;
}

// 十、10.8（2026-09-29）：雲端存檔關閉時的AI代理——不碰KV：不檢查行動點(改存玩家瀏覽器)、不記成本遙測；
// 仍然只接受遊戲的payload結構、system/工具/模型由Worker決定(10.4)，成功回應照樣簡轉繁。lifegame.usage照樣回傳給測試選單顯示
// 十、10.9.2（2026-09-30，第二批）：wallet={token}時是「帳號共用錢包」的請求——回合先預扣1點(同一turn_nonce只扣一次、開場免費、失敗退點，規則同10.3.11)，
// 回顧這一生成功才扣5點；錢包在帳號Durable Object裡，同樣不碰KV。回應的lifegame.wallet是最新的錢包狀態
async function handleAIProxyNoKV(body, env, origin, ctx, wallet) {
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

  const isTurn = !body.kind;
  const safeLifeId = isValidLifeId(body.life_id) ? body.life_id : undefined;
  let walletInfo = null, walletEvents = [], walletPre = null;
  const acctCall = async (payload) => { // 帳號DO呼叫；啟程禮份數有變(排隊補發)就順便同步給計數器
    const r = await accountsCall(env, Object.assign({ token: wallet.token }, payload));
    if (r && r.gift_changed && r.gift_stats) { const j = syncGiftStats(env, ctx, r.gift_stats); if (j && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(j); }
    if (r && r.wallet) walletInfo = r.wallet;
    if (r && r.events && r.events.length) walletEvents = walletEvents.concat(r.events);
    return r;
  };
  const walletFail = (r) => {
    const err = r && r.error && typeof r.error === "object" ? r.error : { type: String((r && r.error) || "error"), message: "帳號驗證失敗" };
    return jsonResponse(origin, { error: err, lifegame: { wallet: walletInfo, wallet_events: walletEvents } }, (r && r.status) || 401);
  };
  if (wallet && isTurn) {
    if (!isValidNonce(body.turn_nonce)) return jsonResponse(origin, { error: { type: "invalid_request", message: "缺少turn_nonce" } }, 400);
    const isPrologue = !!(check.payload.time_context && check.payload.time_context.is_prologue === true);
    const r = await acctCall({ op: "wallet_pre", nonce: body.turn_nonce, life_id: safeLifeId, is_prologue: isPrologue, retry: body.retry === true });
    if (!r.ok) return walletFail(r);
    walletPre = r.pre;
  } else if (wallet && body.kind === "life_review") {
    const r = await acctCall({ op: "wallet_can_afford", n: LIFE_REVIEW_COST });
    if (!r.ok) return walletFail(r);
    if (!r.can) return jsonResponse(origin, { error: { type: "insufficient_action_points", message: "行動點不足" }, lifegame: { wallet: walletInfo, wallet_events: walletEvents } }, 402);
  }

  let upstream, text, data = null;
  try {
    upstream = await callAnthropic(env, upstreamBody, ctx, { kind: ({ chapter: "chapter", idle_summary: "idle", life_review: "review" })[body.kind] || "turn", lifeId: safeLifeId, nonce: isTurn ? body.turn_nonce : null, turn: isTurn ? check.payload.turn : null, prologue: isTurn && !!(check.payload.time_context && check.payload.time_context.is_prologue === true) }); // 10.14.7
    text = await upstream.text();
    if (upstream.ok) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  } catch (err) {
    if (wallet && isTurn) await acctCall({ op: "wallet_post", nonce: body.turn_nonce, life_id: safeLifeId, success: false });
    return jsonResponse(origin, { error: { message: String(err) }, lifegame: { cloud_disabled: true, wallet: walletInfo, wallet_events: walletEvents } }, 502);
  }
  const usable = !!(upstream.ok && data && isUsable(data));
  if (usable && isTurn && !(check.payload.time_context && check.payload.time_context.is_prologue === true)) recordLidSeen(env, ctx, safeLifeId); // 10.13.7.3
  if (wallet && isTurn) await acctCall({ op: "wallet_post", nonce: body.turn_nonce, life_id: safeLifeId, success: usable });
  else if (wallet && body.kind === "life_review" && usable) await acctCall({ op: "wallet_spend", n: LIFE_REVIEW_COST });
  const lifegame = { usable, cloud_disabled: true };
  if (wallet) { lifegame.wallet = walletInfo; lifegame.wallet_events = walletEvents; lifegame.charged = !!(walletPre && walletPre.charged && usable); }
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
  if (wallet) { // 上游出錯也把最新錢包狀態帶回去，前端才能把畫面上的點數校正成伺服器端的數字
    let errBody;
    try { errBody = JSON.parse(text); } catch (e) { errBody = null; }
    if (!errBody || typeof errBody !== "object") errBody = { error: { message: String(text).slice(0, 200) } };
    errBody.lifegame = lifegame;
    return new Response(JSON.stringify(errBody), { status: upstream.status, headers: corsHeaders(origin) });
  }
  return new Response(text, { status: upstream.status, headers: corsHeaders(origin) });
}

async function handleAIProxy(request, env, origin, ctx) {
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse(origin, { error: { message: "請求內容不是合法JSON" } }, 400); }
  if (!body || typeof body !== "object") return jsonResponse(origin, { error: { message: "請求格式錯誤" } }, 400);
  // 十、10.9.3.1（2026-09-30，第二批）：全站每日花費碰到上限時，暫停「從未購買過」帳號的所有AI呼叫(含開場、放置摘要、章節)——
  // 在扣點之前就擋下，所以這次不扣點、不算回合；有購買紀錄的帳號不受影響。計數服務出錯時放行
  const gate = await spendGate(request, env, ctx);
  if (gate.blocked) return jsonResponse(origin, { error: { type: "daily_cap_reached", message: "今天的故事額度已用完，台灣時間午夜後恢復" }, lifegame: { daily_cap: true } }, 503);
  // 十、10.9.2：帶著登入token且明說用帳號錢包的請求(雲端存檔開或關都一樣)走錢包路徑
  const walletToken = bearerToken(request);
  if (body.wallet === true && walletToken && accountStore(env)) return handleAIProxyNoKV(body, env, origin, ctx, { token: walletToken });
  if (!cloudEnabled(env)) return handleAIProxyNoKV(body, env, origin, ctx, null); // 十、10.8
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
  const pre = apTestFree ? { ok: true, charge: null, testFree: true } : preCharge(rec, { nonce, isPrologue, lifeId: safeLifeId, retryOfFailed: body.retry === true });
  if (!pre.ok) {
    await saveRecord(env, key, slot, rec);
    return jsonResponse(origin, { error: pre.error, lifegame: { ap: publicAP(rec) } }, pre.status);
  }
  await saveRecord(env, key, slot, rec); // 先扣(預留)再呼叫，避免同時送很多請求都通過餘額檢查

  let upstream, text, data = null;
  try {
    upstream = await callAnthropic(env, buildTurnRequest(body.messages), ctx, { kind: "turn", lifeId: safeLifeId, nonce, turn: check.payload.turn, prologue: isPrologue }); // 10.14.7
    text = await upstream.text();
    if (upstream.ok) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  } catch (err) {
    if (!apTestFree) postCharge(rec, pre, false, safeLifeId);
    await saveRecord(env, key, slot, rec);
    return jsonResponse(origin, { error: { message: String(err) }, lifegame: { ap: publicAP(rec), ap_test_free: apTestFree } }, 502);
  }
  const usable = !!(upstream.ok && data && isUsableTurnResponse(data));
  if (usable && !isPrologue) recordLidSeen(env, ctx, safeLifeId); // 10.13.7.3
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
function adminDenied(request, env, allowSave) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  // 十、10.15.6：數據網頁用的端點也接受存檔管理密碼(SAVE_ADMIN_TOKEN)，登入後可以多看名冊分頁；allowSave為false的端點仍只認USAGE_ADMIN_TOKEN
  if (allowSave && env.SAVE_ADMIN_TOKEN) {
    const a = request.headers.get("Authorization") || "";
    if (a.startsWith("Bearer ") && safeEqual(a.slice(7), env.SAVE_ADMIN_TOKEN)) return null;
  }
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

// 十、10.13.7.3：玩家送出回合且AI成功回應(開場不算)→更新該人生代號的最後出現日期。失敗只寫警告，不影響回合；有ctx就在回應送出後才寫
// 10.13.7.11：同時把全站當天回合數加1(不帶人生代號、不記個人)
function recordLidSeen(env, ctx, lid) {
  const jobs = [];
  if (lid && accountStore(env)) jobs.push(accountsCall(env, { op: "lid_seen", lid }).catch(e => console.warn("人生代號清單記錄失敗：" + (e && e.message || e))));
  if (usageCounterStub(env)) jobs.push(usageCall(env, "turn").catch(e => console.warn("回合數記錄失敗：" + (e && e.message || e))));
  if (jobs.length && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(Promise.all(jobs));
}
// 十、10.13.7.8：GET /stats-summary——玩家與瀏覽人次的加總數字。資料來自帳號資料庫與用量計數器，不碰KV
async function handleStatsSummary(request, env) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  const denied = adminDenied(request, env, true);
  if (denied) return denied;
  const now = nowMs(env), today = taipeiDateString(now);
  const dayAgo = n => taipeiDateString(now - n * 86400000);
  const week_start = dayAgo(6);
  const dates = []; for (let i = 29; i >= 0; i--) dates.push(dayAgo(i));
  const ps = await accountsCall(env, { op: "player_stats", dates, week_start });
  if (!ps || !ps.ok) return new Response(JSON.stringify({ success: false, error: "帳號資料庫暫時無法使用" }), { status: 503, headers });
  const pv = usageCounterStub(env) ? await usageCall(env, "pvstats", {}, "GET") : { since: null, days: {} };
  const days = pv.days || {};
  let total = 0, last7 = 0;
  for (const [d, n] of Object.entries(days)) { total += n; if (d >= week_start && d <= today) last7 += n; }
  const since = pv.since || null;
  const r2 = x => Math.round(x * 100) / 100;
  const sumRange = m => { let t = 0, w = 0; for (const [d, v] of Object.entries(m || {})) { t += v; if (d >= week_start && d <= today) w += v; } return { today: r2((m || {})[today] || 0), last7: r2(w), total: r2(t) }; };
  const turns = sumRange(pv.turns), cost = sumRange(pv.cost);
  const per = (num, den) => (den > 0 ? r2(num / den) : null); // 分母為0＝沒有平均可言(顯示「—」)
  const allPlayers = ps.free.total + ps.paid.total;
  const usage = {
    since: pv.us_since || null, unit: "元(實際花費；沒有回報用量的呼叫照預估)", turns, cost,
    avg_cost_per_player: { today: per(cost.today, ps.active.today), last7: per(cost.last7, ps.active.last7), total: per(cost.total, allPlayers) },
    avg_turns_per_player: { today: per(turns.today, ps.active.today), last7: per(turns.last7, ps.active.last7), total: per(turns.total, allPlayers) },
    avg_cost_per_turn: { today: per(cost.today, turns.today), last7: per(cost.last7, turns.last7), total: per(cost.total, turns.total) }
  };
  const daily = dates.filter(d => since && d >= since).map(d => ({ date: d, pageviews: days[d] || 0, new_players: ps.new_by_date[d] || 0, turns: (pv.turns || {})[d] || 0, cost: r2((pv.cost || {})[d] || 0) }));
  const out = {
    generated_at: new Date(now).toISOString(),
    players: { free: ps.free, paid: ps.paid },
    active: ps.active,
    pageviews: { today: days[today] || 0, last7, total, since },
    usage, accounts_bound: ps.accounts_bound, lives_started: ps.lives_started,
    ai_usage: await buildAIUsageSummary(env, { today, week_start, turns: pv.turns || {} }),
    entry: await buildEntrySummary(env), // 十、10.15.6：名額卡片(只有數字，不含信箱或人生代號)
    daily
  };
  return new Response(JSON.stringify(out, null, 2), { headers });
}

async function buildEntrySummary(env) {
  try {
    const e = await accountsCall(env, { op: "entry_stats" });
    if (!e || !e.ok) return null;
    return { used: e.used, cap: e.cap + e.bonus, cum: e.cum, checkpoint: e.checkpoint, waiting: e.waiting, notified: e.notified };
  } catch (err) { return null; }
}
// 十、10.14.7（2026-10-04）：伺服器記的AI實際用量(Anthropic回報的token數，依單價算出的美元)
export const AI_USAGE_KIND_LABELS = { turn: "一般回合", opening: "開場", retry: "失敗重試／重新生成", idle: "放置摘要", chapter: "人生之書章節", review: "回顧這一生" };
async function buildAIUsageSummary(env, { today, week_start, turns }) {
  if (!usageCounterStub(env)) return null;
  const u = await usageCall(env, "udays", {}, "GET");
  const empty = () => ({ calls: 0, input: 0, cache_write: 0, cache_read: 0, output: 0, usd: 0, by_kind: {} });
  const range = { today: empty(), last7: empty(), total: empty() };
  for (const [d, kinds] of Object.entries(u.days || {})) {
    const targets = [range.total];
    if (d >= week_start && d <= today) targets.push(range.last7);
    if (d === today) targets.push(range.today);
    for (const [k, b] of Object.entries(kinds || {})) for (const r of targets) {
      r.calls += b.calls; r.input += b.in; r.cache_write += b.cw; r.cache_read += b.cr; r.output += b.out; r.usd += b.usd;
      r.by_kind[k] = (r.by_kind[k] || 0) + b.calls;
    }
  }
  const turnsIn = (from, to) => Object.entries(turns).reduce((t, [d, n]) => t + (d >= from && d <= to ? n : 0), 0);
  const den = { today: turns[today] || 0, last7: turnsIn(week_start, today), total: turnsIn(u.since || "0000", today) };
  for (const [key, r] of Object.entries(range)) {
    r.usd = Math.round(r.usd * 1e4) / 1e4;
    r.turns = den[key];
    r.usd_per_turn = den[key] > 0 ? Math.round(r.usd / den[key] * 1e4) / 1e4 : null; // 所有呼叫(含開場、重試、章節)的花費攤進每一回合(10.9.5)
    const inAll = r.input + r.cache_write + r.cache_read;
    r.cache_read_pct = inAll > 0 ? Math.round(r.cache_read / inAll * 1000) / 10 : null;
  }
  return Object.assign({ since: u.since || null, unit: "US$(Anthropic回報的實際用量，依單價計算)", kind_labels: AI_USAGE_KIND_LABELS }, range);
}
// GET /usage-detail.csv：逐筆明細(最近7天、最多5,000筆)，欄位比照遊戲裡的逐筆呼叫紀錄，另加匿名人生代號與距同一段人生上一次呼叫的分鐘數
async function handleUsageDetailCsv(request, env) {
  const denied = adminDenied(request, env, true);
  if (denied) return denied;
  const rows = usageCounterStub(env) ? ((await usageCall(env, "urows", {}, "GET")).rows || []) : [];
  rows.sort((a, b) => a.t - b.t);
  const lastByLife = {};
  const tw = (t) => new Date(t + 8 * 3600000).toISOString().replace("T", " ").slice(0, 19);
  const lines = ["time_taipei,turn,kind,life,gap_min,input_tokens,cache_write_tokens,cache_read_tokens,output_tokens,cost_usd,elapsed_ms"];
  for (const r of rows) {
    const gap = r.life && lastByLife[r.life] ? Math.round((r.t - lastByLife[r.life]) / 6000) / 10 : "";
    if (r.life) lastByLife[r.life] = r.t;
    lines.push([tw(r.t), r.turn == null ? "" : r.turn, AI_USAGE_KIND_LABELS[r.k] || r.k, r.life || "", gap, r.in, r.cw, r.cr, r.out, r.usd, r.ms == null ? "" : r.ms].join(","));
  }
  const name = "AI用量明細_" + tw(nowMs(env)).replace(/[- :]/g, "").slice(0, 12) + ".csv";
  return new Response("\uFEFF" + lines.join("\n") + "\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
    "Content-Disposition": "attachment; filename=\"usage-detail.csv\"; filename*=UTF-8''" + encodeURIComponent(name) } });
}

// 每次部署Worker前換成新版本號（要跟index.html的APP_VERSION同一個編號，並在DEPLOY.md記一行；tests/test-54-version.mjs會檢查）
const WORKER_VERSION = "2026.10.09-i";

export default {
  // 每日排程(wrangler.toml的[triggers])：清理孤兒封存包；雲端存檔暫停期間也要跑(封存包寫入暫停期間仍開放)
  async scheduled(event, env, ctx) {
    // 兩個排程：每天一次(台灣03:00)清理孤兒封存包；每小時整點寄候補通知信與檢查點通知信(十、10.15)。依event.cron分開，測試沒帶cron時兩個都跑
    const cron = event && event.cron;
    if (!cron || cron === "0 19 * * *") ctx.waitUntil(cleanupOrphanStagePacks(env));
    if (!cron || cron === "0 * * * *") ctx.waitUntil(runWaitlistTick(env, ctx).catch(e => console.warn("候補排程失敗：" + (e && e.message || e))));
  },
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const reqUrl = new URL(request.url);
    // 10.5：管理用的用量摘要，靠管理密碼保護，不走來源白名單
    // 10.9.3.3：全站當天用量(呼叫次數、估計花費)，同一組管理密碼；不依賴KV，雲端存檔關閉時也能查
    if (reqUrl.pathname === "/usage-today" && request.method === "GET") return handleUsageToday(request, env);
    // 十、10.13.7.8：數據總覽——/stats-summary(USAGE_ADMIN_TOKEN，不碰KV)與/dashboard(網頁，不被搜尋引擎收錄、不快取、不走來源白名單)
    if (reqUrl.pathname === "/stats-summary" && request.method === "GET") return handleStatsSummary(request, env);
    if (reqUrl.pathname === "/usage-detail.csv" && request.method === "GET") return handleUsageDetailCsv(request, env); // 10.14.7
    if (reqUrl.pathname === "/dashboard" && request.method === "GET") {
      return new Response(DASHBOARD_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
    }
    // 十、10.13.6：管理端(存檔查看、名冊、存取紀錄)，獨立密碼SAVE_ADMIN_TOKEN，不走來源白名單
    if (isAdminPath(reqUrl.pathname)) return handleSaveAdmin(request, env, reqUrl, { kvKey, safeEqual, stagePackKey: stagePackKvKey });
    if (reqUrl.pathname === "/usage-summary" && request.method === "GET") {
      if (!cloudEnabled(env)) return new Response(JSON.stringify({ success: false, error: "封測期間暫停雲端存檔，成本遙測也暫停(十、10.8)", cloud_disabled: true }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      return handleUsageSummary(request, env);
    }

    // 版本查詢(2026-10-01)：直接用瀏覽器網址列打開時沒有Origin標頭，要查得到；只回版本號、不碰KV。有Origin但不在白名單的請求，仍照下面的來源檢查擋掉
    if (reqUrl.pathname === "/version" && request.method === "GET" && !origin) return jsonResponse(null, { success: true, version: WORKER_VERSION });

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        headers: corsHeaders(origin, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization" // 十、10.2：帳號登入的token放在Authorization標頭
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
    // 十、10.13.7.5：瀏覽人次——遊戲頁面每載入一次送一次，不帶內容、不記任何訪客資料；套用不經KV的頻率限制；失敗不影響遊戲
    if (url.pathname === "/pv" && request.method === "POST") {
      if (!(await checkRateLimitNoKV(request, env))) return jsonResponse(origin, { success: false, error: "請求太頻繁，請稍後再試" }, 429);
      try { if (usageCounterStub(env)) await usageCall(env, "pv"); } catch (e) { console.warn("瀏覽人次記錄失敗：" + (e && e.message || e)); }
      return jsonResponse(origin, { success: true });
    }
    // 十、10.8.2（2026-10-04）：請求帶的金鑰在這裡換成門牌，後面的處理函式拿到的key都是門牌；搬遷保險期讀不到時改讀舊位置(withLocation)
    // 帳號路由自己處理(綁定時帶原本的金鑰進來算門牌)，不經過這裡
    let req = request, e = env;
    if (!isAccountPath(url.pathname)) {
      const rel = await relocateRequest(request, env, url, (status, msg) => jsonResponse(origin, { success: false, error: msg }, status));
      if (rel.response) return rel.response;
      req = rel.request; e = rel.env;
    }
    return routeRequest(req, e, ctx, origin, url);
  }
};

// 路由本體(原fetch在來源檢查之後的部分)：此時request／env裡的金鑰已經是門牌
async function routeRequest(request, env, ctx, origin, url) {
  {
    // 十、10.2（2026-09-30，第二批）：帳號路由——資料在Durable Object，不碰KV；頻率限制一律用不經KV的Cloudflare Rate Limiting，雲端存檔開或關都一樣
    if (isAccountPath(url.pathname)) {
      if (!(await checkRateLimitNoKV(request, env))) return jsonResponse(origin, { success: false, error: "請求太頻繁，請稍後再試" }, 429);
      const r = await handleAccountRoute(request, env, origin, ctx, url);
      if (r) return r;
    }
    // 十、10.8（2026-09-29）：雲端存檔關閉時完全不碰KV——存檔類路徑直接回503，頻率限制改用不經KV的綁定
    if (!cloudEnabled(env)) {
      if (!(await checkRateLimitNoKV(request, env))) return jsonResponse(origin, { success: false, error: "請求太頻繁，請稍後再試" }, 429);
      if ((MANUAL_SAVE_PATHS[url.pathname] || []).includes(request.method)) { // 10.8.1手動存到雲端、10.13.3自動存檔
        if (url.pathname === "/save") return handleSave(request, env, origin);
        if (url.pathname === "/slots") return handleSlots(request, env, origin);
        if (url.pathname === "/stage-pack") return request.method === "POST" ? handleStagePackSave(request, env, origin) : handleStagePackLoad(request, env, origin);
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
}
