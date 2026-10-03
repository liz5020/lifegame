// 十、10.8.2（2026-10-04定案）：存放位置改用復原金鑰的單向雜湊「門牌」。
//
//   門牌 ＝ HMAC-SHA256(SAVE_LOCATION_SECRET, 統一格式後的金鑰)，完整64碼十六進位。
//   統一格式 ＝ 轉大寫、去掉所有空白與連字號(伺服器端做，前端仍只trim)。
//   KV名稱裡原本放金鑰原文的地方一律改放門牌(save:門牌:格子、stagepack:門牌:編號…)；金鑰原文不再出現在任何KV名稱。
//
// 做法：Worker入口(worker.js的fetch)在請求進來時把body／網址裡的key換成門牌，後面所有處理函式(存檔、行動點、用量…)
// 拿到的key已經是門牌，名稱組法完全不用改。搬遷保險期(10.13.6)：讀不到時，用請求原本帶的金鑰組出舊名稱再讀一次(withLocation)，
// 每次改讀都計數；寫入一律寫門牌位置。清理完成後把保險功能關掉(DO旗標off)，之後再把這個檔案裡的保險程式整段移除。
import { accountStore, accountsCall } from "./gate.js";

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

export const isLoc = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
// 位置密鑰必須設好才能算門牌：空值、太短(正常是`openssl rand -hex 32`的64字元)一律視為沒設，存檔類請求回503，不會用壞掉的密鑰默默算出一堆算不回來的位置
export function locationSecretOk(env) {
  return !!env && typeof env.SAVE_LOCATION_SECRET === "string" && env.SAVE_LOCATION_SECRET.length >= 32;
}
export function normalizeKey(key) {
  return String(key == null ? "" : key).toUpperCase().replace(/[\s-]+/g, "");
}

const keyCache = new Map(); // 位置密鑰 → 已匯入的HMAC金鑰(同一個isolate內重複使用)
async function hmacKey(secret) {
  let k = keyCache.get(secret);
  if (!k) { k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); keyCache.set(secret, k); }
  return k;
}
// 回傳門牌；金鑰統一格式後是空字串、或位置密鑰沒設好時回傳null
export async function locationId(env, key) {
  const n = normalizeKey(key);
  if (!n || !locationSecretOk(env)) return null;
  return hex(await crypto.subtle.sign("HMAC", await hmacKey(env.SAVE_LOCATION_SECRET), enc.encode(n)));
}

// ---------- 搬遷保險期：讀不到門牌位置時改讀舊位置(以金鑰原文為名)，並計數 ----------
const offCache = new WeakSet(); // 保險功能已關閉的env(關了就不可能再打開，所以可以記起來)
export async function fallbackEnabled(env) {
  if (!accountStore(env)) return true; // 沒有帳號資料庫(測試環境)：保險功能照常
  if (offCache.has(env)) return false;
  try {
    const r = await accountsCall(env, { op: "loc_state" });
    if (r && r.ok && r.off) { offCache.add(env); return false; }
  } catch (e) { /* 查不到狀態就當作還開著：寧可多讀一次舊位置，不能讓玩家讀不到存檔 */ }
  return true;
}
async function countFallback(env) {
  try { if (accountStore(env)) await accountsCall(env, { op: "loc_fb_hit" }); } catch (e) { console.warn("改讀舊位置計數失敗：" + (e && e.message || e)); }
}

// 包一層KV：名稱裡含這把金鑰的門牌時，讀不到就改讀舊名稱(把門牌換回金鑰原文)；刪除兩邊都刪；寫入只寫門牌位置
export function withLocation(env, loc, rawKey) {
  const real = env.SAVES;
  if (!real || rawKey === loc) return env;
  const oldName = (name) => name.replace(loc, () => rawKey);
  const proxy = {
    async get(name, ...rest) {
      const v = await real.get(name, ...rest);
      if (v !== null && v !== undefined) return v;
      if (!String(name).includes(loc) || !(await fallbackEnabled(env))) return v;
      const o = await real.get(oldName(name), ...rest);
      if (o !== null && o !== undefined) await countFallback(env);
      return o;
    },
    put: (name, value, opts) => real.put(name, value, opts),
    async delete(name) {
      await real.delete(name);
      if (String(name).includes(loc) && await fallbackEnabled(env)) await real.delete(oldName(name));
    },
    // 列出以門牌為前綴的名稱時，把舊名稱的結果也併進來(名稱換回門牌寫法)
    async list(opts = {}) {
      const page = await real.list(opts);
      if (!opts.prefix || !String(opts.prefix).includes(loc) || opts.cursor || !(await fallbackEnabled(env))) return page;
      const keys = [...(page.keys || [])];
      const seen = new Set(keys.map(k => k.name));
      let cursor;
      do {
        const old = await real.list({ prefix: oldName(opts.prefix), cursor });
        for (const k of old.keys || []) { const n = k.name.replace(rawKey, () => loc); if (!seen.has(n)) { seen.add(n); keys.push({ name: n, metadata: k.metadata }); } }
        cursor = old.list_complete ? undefined : old.cursor;
      } while (cursor);
      return { keys, list_complete: true };
    }
  };
  return Object.assign({}, env, { SAVES: proxy });
}

// ---------- 請求入口：把key換成門牌 ----------
// 回傳 { request, env }(已換好)或 { response }(要直接回給玩家的錯誤)。沒帶key的請求原樣放行。
export async function relocateRequest(request, env, url, makeError) {
  let key, body = null, text = null;
  if (request.method === "GET") key = url.searchParams.get("key");
  else if (request.method === "POST") {
    text = await request.text();
    try { body = JSON.parse(text); } catch (e) { body = null; }
    key = body && typeof body === "object" && !Array.isArray(body) ? body.key : undefined;
  }
  // 換掉內容後原本的Content-Length就不對了，丟掉讓執行環境自己算
  const headers = new Headers(request.headers); headers.delete("content-length");
  const rebuild = (u, init) => new Request(u, Object.assign({ headers }, init));
  if (typeof key !== "string" || key.length === 0 || key.length > 100) {
    // 沒帶key或長度不合：不換，交給後面的處理函式照原樣回400
    return { request: text !== null ? rebuild(request.url, { method: request.method, body: text }) : request, env };
  }
  if (!locationSecretOk(env)) return { response: makeError(503, "位置密鑰尚未設定或格式不正確，存檔暫時無法使用") };
  const loc = await locationId(env, key);
  if (!loc) return { response: makeError(400, "金鑰格式不正確") };
  const env2 = withLocation(env, loc, key);
  if (request.method === "GET") {
    const u2 = new URL(request.url); u2.searchParams.set("key", loc);
    return { request: rebuild(u2.toString(), { method: "GET" }), env: env2 };
  }
  body.key = loc;
  return { request: rebuild(request.url, { method: "POST", body: JSON.stringify(body) }), env: env2 };
}

// ---------- 搬遷用：舊名稱怎麼拆 ----------
// 每一類KV資料的名稱前綴，以及從名稱拆出「金鑰」與「門牌之後的部分(tail)」的方式。新名稱＝prefix＋門牌＋tail。
export const LOCATION_CLASSES = [
  { id: "save", label: "主存檔", prefix: "save:", split: lastColonSplit(1) },
  { id: "stagepack", label: "封存包", prefix: "stagepack:", split: lastColonSplit(1) },
  { id: "archive", label: "人生回顧", prefix: "archive:", split: lastColonSplit(1) },
  { id: "familybook", label: "傳承之書", prefix: "familybook:", split: lastColonSplit(1) },
  { id: "ap", label: "行動點紀錄", prefix: "ap:", split: lastColonSplit(1) },
  { id: "giftclaims", label: "領禮紀錄", prefix: "giftclaims:", split: noTail },
  { id: "wallet", label: "錢包餘額", prefix: "wallet:", split: noTail },
  { id: "usage", label: "用量紀錄", prefix: "usage:life:", split: lastColonSplit(2) }
];
function noTail(body) { return body ? { key: body, tail: "" } : null; }
// 金鑰在最前面，後面固定有n段以冒號分隔的部分(格子、編號、人生代號…)
function lastColonSplit(n) {
  return (body) => {
    let idx = body.length;
    for (let i = 0; i < n; i++) { idx = body.lastIndexOf(":", idx - 1); if (idx <= 0) return null; }
    return { key: body.slice(0, idx), tail: body.slice(idx) };
  };
}
export function splitName(cls, name) {
  if (!name.startsWith(cls.prefix)) return null;
  return cls.split(name.slice(cls.prefix.length));
}
// 舊名稱＝金鑰原文不是門牌格式的那些
export function isLegacyName(cls, name) {
  const p = splitName(cls, name);
  return !!p && !isLoc(p.key);
}
