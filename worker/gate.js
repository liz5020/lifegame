// 2026-09-30（十、10.9.3.1～10.9.3.3，第二批）全站每日花費上限、用量計數、管理通知信
//
// 【花費計數存放方式：Durable Object(SQLite)，不是KV】
// 理由：計數要「多人同時呼叫也不漏算」——KV是先讀再寫、最後寫入者贏，兩個請求同時進來會少算一次；Durable Object同一個實例一次只處理一件事，
// 加1是原子的。而且不增加每回合KV寫入(10.9.3.4、10.8)，雲端存檔關閉(Worker不碰KV)時也照樣計數。批次1已經用同一種架構。
//
// 花費＝每次成功的AI呼叫以固定估價AI_CALL_COST_ESTIMATE(初始1元)計入當天全站合計，台灣時間午夜歸零；所有種類的呼叫都計(開場、放置摘要、章節都不例外)。
// 碰到上限(DAILY_SPEND_CAP，初始500元)後，暫停「從未購買過」帳號的新AI呼叫，進行中的不中斷；當天調高上限就立刻解除(每次呼叫都用當下的設定值判斷)。
// 設定值只放Cloudflare後台環境變數(不寫進wrangler.toml，避免部署時蓋掉後台改過的值)。

import { sendMail, noticeMail } from "./mail.js";
import { nowMs, taipeiDateString } from "./ap.js";

export const DEFAULT_DAILY_SPEND_CAP = 500;
export const DEFAULT_DAILY_GIFT_CAP = 20;
export const DEFAULT_AI_CALL_COST_ESTIMATE = 1;
export const GIFT_NOTICE_AT = 15;          // 10.9.3.2：當天發到15份寄一封
export const NOTICE_MAX_ATTEMPTS = 3;      // 10.9.3.1：同一封信每日最多嘗試3次
export const NOTICE_LEASE_MS = 60 * 1000;  // 寄送中的保留時間，避免同時進來的幾個請求各寄一封

export function readSetting(env, name, fallback) {
  const n = Number(env && env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
// 批次1曾用DAILY_SPEND_CAP_TWD這個名字；新名稱DAILY_SPEND_CAP優先，舊名字後台若還留著照樣認得
export function spendCap(env) { return readSetting(env, "DAILY_SPEND_CAP", readSetting(env, "DAILY_SPEND_CAP_TWD", DEFAULT_DAILY_SPEND_CAP)); }
export function giftCap(env) { return readSetting(env, "DAILY_GIFT_CAP", DEFAULT_DAILY_GIFT_CAP); }
export function callCostEstimate(env) { return readSetting(env, "AI_CALL_COST_ESTIMATE", DEFAULT_AI_CALL_COST_ESTIMATE); }

function freshDay(date) { return { date, calls: 0, spent: 0, gifts: 0, queued: 0, notices: {} }; }

// 全站當天用量：一個實例，記「哪一天、幾次呼叫、花了多少、啟程禮發了幾份」和四種通知的寄送狀態，跨日(台灣日期不同)自動歸零。
// 不繼承DurableObject基底類別，方便在node裡直接測試
export class UsageCounter {
  constructor(state) { this.state = state; this._chain = Promise.resolve(); }
  async fetch(request) {
    const run = this._chain.then(() => this._handle(request));
    this._chain = run.then(() => {}, () => {});
    return run;
  }
  async _handle(request) {
    const url = new URL(request.url);
    const p = url.searchParams;
    const date = p.get("date") || "";
    const op = url.pathname.replace(/^\/+/, "") || "get";
    const now = Number(p.get("now")) || 0;
    const cap = Number(p.get("cap")) > 0 ? Number(p.get("cap")) : DEFAULT_DAILY_SPEND_CAP;
    const gcap = Number(p.get("gift_cap")) > 0 ? Number(p.get("gift_cap")) : DEFAULT_DAILY_GIFT_CAP;
    // 十、10.13.7.5：瀏覽人次——只記每日總數(永久保留)與開始計數日，不記任何個別訪客資料；跟花費計數分開存
    if (op === "pv" && request.method === "POST") {
      const k = "pv:" + date;
      await this.state.storage.put(k, ((await this.state.storage.get(k)) || 0) + 1);
      if (!(await this.state.storage.get("pv_since"))) await this.state.storage.put("pv_since", date);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (op === "pvstats" && request.method === "GET") {
      const days = {};
      for (const [k, v] of await this.state.storage.list({ prefix: "pv:" })) days[k.slice(3)] = v;
      return new Response(JSON.stringify({ ok: true, since: (await this.state.storage.get("pv_since")) || null, days }), { headers: { "Content-Type": "application/json" } });
    }
    let cur = (await this.state.storage.get("day")) || freshDay(date);
    if (cur.date !== date) cur = freshDay(date);
    if (cur.spent === undefined) { cur.spent = cur.calls || 0; cur.gifts = cur.gifts || 0; cur.queued = cur.queued || 0; cur.notices = cur.notices || {}; } // 批次1的舊資料(只有calls)
    let dirty = false;
    if (op === "add" && request.method === "POST") {
      cur.calls += 1;
      const cost = Number(p.get("cost"));
      cur.spent += Number.isFinite(cost) && cost >= 0 ? cost : 1;
      dirty = true;
    } else if (op === "gifts" && request.method === "POST") {
      cur.gifts = Math.max(0, Number(p.get("issued")) || 0);
      cur.queued = Math.max(0, Number(p.get("queued")) || 0);
      dirty = true;
    } else if (op === "notice" && request.method === "POST") {
      const n = cur.notices[p.get("kind")];
      if (n && p.get("ok") === "1") { n.sent = true; dirty = true; }
      else if (n) { n.lease = 0; dirty = true; } // 寄失敗：下一次AI呼叫可以再試(次數已在交出時計入)
    }
    const out = Object.assign({}, cur, { capped: cur.spent >= cap, due: [] });
    // 到了門檻、還沒寄成功、次數沒用完、沒有別的請求正在寄：交給呼叫端寄，並記一次嘗試
    if (op === "add" || op === "gate" || op === "gifts") {
      const rules = [["spend80", cur.spent >= 0.8 * cap], ["spend100", cur.spent >= cap], ["gift15", cur.gifts >= GIFT_NOTICE_AT], ["giftFull", cur.gifts >= gcap]];
      for (const [kind, hit] of rules) {
        if (!hit) continue;
        const n = cur.notices[kind] || (cur.notices[kind] = { sent: false, attempts: 0, lease: 0 });
        if (n.sent || n.attempts >= NOTICE_MAX_ATTEMPTS || now < n.lease) continue;
        n.attempts += 1; n.lease = now + NOTICE_LEASE_MS; dirty = true;
        out.due.push({ kind, info: { spent: cur.spent, cap, gifts: cur.gifts, queued: cur.queued, giftCap: gcap, now } });
      }
    }
    if (dirty) await this.state.storage.put("day", cur);
    return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
  }
}

export function usageCounterStub(env) {
  if (!env || !env.USAGE_COUNTER) return null;
  return env.USAGE_COUNTER.get(env.USAGE_COUNTER.idFromName("global"));
}
export async function usageCall(env, op, params, method) {
  const stub = usageCounterStub(env);
  if (!stub) return null;
  const now = nowMs(env);
  const q = new URLSearchParams(Object.assign({ date: taipeiDateString(now), now: String(now), cap: String(spendCap(env)), gift_cap: String(giftCap(env)) }, params || {}));
  const r = await stub.fetch("https://usage.internal/" + op + "?" + q.toString(), { method: method || "POST" });
  return r.json();
}
export function accountStore(env) {
  if (!env || !env.ACCOUNTS) return null;
  return env.ACCOUNTS.get(env.ACCOUNTS.idFromName("global"));
}
// 呼叫帳號Durable Object。時間與台灣日期一律在這裡決定(測試用TEST_NOW_MS)
export async function accountsCall(env, payload) {
  const stub = accountStore(env);
  if (!stub) return { ok: false, error: "accounts_unavailable", status: 503 };
  const now = nowMs(env);
  const full = Object.assign({ now, date: taipeiDateString(now), gift_cap: giftCap(env), verify_cap: readSetting(env, "DAILY_VERIFY_EMAIL_CAP", 80) }, payload);
  const res = await stub.fetch("https://accounts.internal/op", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(full) });
  return res.json();
}
export function bearerToken(request) {
  const a = request.headers.get("Authorization") || "";
  return a.startsWith("Bearer ") ? a.slice(7).trim() : "";
}

// 寄管理通知信；寄完把結果回報給計數器(成功才記「已通知」)。沒有ctx.waitUntil就直接等
export function flushNotices(env, ctx, due) {
  if (!due || !due.length) return null;
  const job = (async () => {
    for (const d of due) {
      let ok = false;
      try {
        if (env.ADMIN_NOTIFY_EMAIL) ok = (await sendMail(env, Object.assign({ to: env.ADMIN_NOTIFY_EMAIL }, noticeMail(d.kind, d.info)))).ok;
        else console.warn("尚未設定ADMIN_NOTIFY_EMAIL，管理通知信沒寄出：" + d.kind);
      } catch (e) { ok = false; }
      try { await usageCall(env, "notice", { kind: d.kind, ok: ok ? "1" : "0" }); } catch (e) { /* 回報失敗不影響 */ }
    }
  })();
  if (ctx && typeof ctx.waitUntil === "function") { ctx.waitUntil(job); return null; }
  return job;
}

// 每次成功的AI呼叫記一筆估價；達80%／上限時通知。計數失敗絕不能影響回合
export async function countAICall(env, ctx) {
  try {
    if (!usageCounterStub(env)) return;
    const r = await usageCall(env, "add", { cost: String(callCostEstimate(env)) });
    const j = flushNotices(env, ctx, r && r.due);
    if (j) await j;
  } catch (e) { /* 只是紀錄 */ }
}
// 啟程禮份數異動(帳號DO回報)→同步到計數器，達15份／發滿時通知
export async function syncGiftStats(env, ctx, stats) {
  try {
    if (!stats || !usageCounterStub(env)) return;
    const r = await usageCall(env, "gifts", { issued: String(stats.issued), queued: String(stats.queued) });
    const j = flushNotices(env, ctx, r && r.due);
    if (j) await j;
  } catch (e) { /* 只是通知用的鏡像，權威計數在帳號DO */ }
}
export async function isPurchasedAccount(env, token) {
  try {
    const r = await accountsCall(env, { op: "is_purchased", token });
    return !!(r && r.purchased);
  } catch (e) { return false; }
}
// AI呼叫前的閘門：碰到上限時，「從未購買過」的帳號暫停(未登入＝未綁信箱＝一律視為從未購買過)。
// 計數服務出錯時放行(不能因為計數壞了擋玩家)。回傳{blocked}
export async function spendGate(request, env, ctx) {
  try {
    if (!usageCounterStub(env)) return { blocked: false };
    const g = await usageCall(env, "gate");
    const j = flushNotices(env, ctx, g && g.due); // 上一次沒寄成功的通知在這裡重試(每封每天最多3次)
    if (j) await j;
    if (!g || !g.capped) return { blocked: false };
    const token = bearerToken(request);
    if (token && await isPurchasedAccount(env, token)) return { blocked: false };
    return { blocked: true };
  } catch (e) { return { blocked: false }; }
}
