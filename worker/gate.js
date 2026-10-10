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
export const DEFAULT_SPEND_ESTIMATE_MIN_CALLS = 100; // 十、10.9.3.1a補充二(2026-10-08)：近7天呼叫次數少於這個數字時，預估改用固定估價
export const USD_TO_TWD = 32;                         // 設計文件現有匯率(1美元約32元)
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
// 十、10.15：每日新玩家名額(0＝手動暫停發放，所以可以是0)與累計入場檢查點，只放Cloudflare後台
export function newPlayerCap(env) {
  const raw = env && env.DAILY_NEW_PLAYER_CAP;
  if (raw === undefined || raw === null || String(raw).trim() === "") return 5;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5;
}
export function playerCheckpoint(env) { return readSetting(env, "BETA_PLAYER_CHECKPOINT", 50); }
export function callCostEstimate(env) { return readSetting(env, "AI_CALL_COST_ESTIMATE", DEFAULT_AI_CALL_COST_ESTIMATE); }
export function spendEstimateMinCalls(env) { return readSetting(env, "SPEND_ESTIMATE_MIN_CALLS", DEFAULT_SPEND_ESTIMATE_MIN_CALLS); }

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
  async _markUsageSince(date) {
    if (!(await this.state.storage.get("us_since"))) await this.state.storage.put("us_since", date);
  }
  async _handle(request) {
    const url = new URL(request.url);
    const p = url.searchParams;
    const date = p.get("date") || "";
    const op = url.pathname.replace(/^\/+/, "") || "get";
    const now = Number(p.get("now")) || 0;
    const cap = Number(p.get("cap")) > 0 ? Number(p.get("cap")) : DEFAULT_DAILY_SPEND_CAP;
    const gcap = Number(p.get("gift_cap")) > 0 ? Number(p.get("gift_cap")) : DEFAULT_DAILY_GIFT_CAP;
    const estFallback = Number(p.get("est_fallback")) > 0 ? Number(p.get("est_fallback")) : DEFAULT_AI_CALL_COST_ESTIMATE;
    const minCalls = Number(p.get("min_calls")) > 0 ? Number(p.get("min_calls")) : DEFAULT_SPEND_ESTIMATE_MIN_CALLS;
    // 十、10.13.7.5：瀏覽人次——只記每日總數(永久保留)與開始計數日，不記任何個別訪客資料；跟花費計數分開存
    if (op === "pv" && request.method === "POST") {
      const k = "pv:" + date;
      await this.state.storage.put(k, ((await this.state.storage.get(k)) || 0) + 1);
      if (!(await this.state.storage.get("pv_since"))) await this.state.storage.put("pv_since", date);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    // 十、10.13.7.11：全站每日回合數(tn:)與每日耗費估價(co:)，永久保留；起算日us_since＝第一筆紀錄的日期
    if (op === "turn" && request.method === "POST") {
      const k = "tn:" + date;
      await this.state.storage.put(k, ((await this.state.storage.get(k)) || 0) + 1);
      await this._markUsageSince(date);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    // 十、10.14.7（2026-10-04）：AI實際用量——每日依呼叫類型加總(ua:日期，永久保留)＋逐筆明細(ud:，最近7天、最多5,000筆)
    if (op === "detail" && request.method === "POST") return this._json(await this._recordDetail(p, date, now));
    if (op === "udays" && request.method === "GET") {
      const out = { ok: true, since: (await this.state.storage.get("ua_since")) || null, days: {} };
      for (const [k, v] of await this.state.storage.list({ prefix: "ua:" })) out.days[k.slice(3)] = v;
      return this._json(out);
    }
    if (op === "uquality" && request.method === "GET") return this._json(Object.assign({ ok: true }, (await this.state.storage.get("uq:" + date)) || { regens: 0, reasons: {}, notes: {} })); // 10.14.7.1
    if (op === "urows" && request.method === "GET") {
      const rows = [];
      for (const [, v] of await this.state.storage.list({ prefix: "ud:" })) rows.push(v);
      return this._json({ ok: true, rows });
    }
    if (op === "pvstats" && request.method === "GET") {
      const out = { ok: true, since: (await this.state.storage.get("pv_since")) || null, us_since: (await this.state.storage.get("us_since")) || null, days: {}, turns: {}, cost: {} };
      for (const [k, v] of await this.state.storage.list({ prefix: "pv:" })) out.days[k.slice(3)] = v;
      for (const [k, v] of await this.state.storage.list({ prefix: "tn:" })) out.turns[k.slice(3)] = v;
      for (const [k, v] of await this.state.storage.list({ prefix: "co:" })) out.cost[k.slice(3)] = v;
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    }
    let cur = (await this.state.storage.get("day")) || freshDay(date);
    if (cur.date !== date) cur = freshDay(date);
    if (cur.spent === undefined) { cur.spent = cur.calls || 0; cur.gifts = cur.gifts || 0; cur.queued = cur.queued || 0; cur.notices = cur.notices || {}; } // 批次1的舊資料(只有calls)
    let dirty = false;
    if (op === "add" && request.method === "POST") {
      cur.calls += 1;
      const fail = p.get("fail"); // 2026-10-09：AI呼叫失敗的錯誤類型(狀態碼／network)，每天分類計次，只有數字不含內容
      if (fail) { cur.fails = cur.fails || {}; cur.fails[fail] = (cur.fails[fail] || 0) + 1; }
      const cost = Number(p.get("cost"));
      const c = p.has("cost") && Number.isFinite(cost) && cost >= 0 ? cost : (await this._estimate(date, estFallback, minCalls)).twd; // 沒有回報用量(失敗呼叫)：照預估計入
      cur.spent += c;
      dirty = true;
      await this.state.storage.put("co:" + date, Math.round((((await this.state.storage.get("co:" + date)) || 0) + c) * 1e6) / 1e6); // 10.13.7.11：每日耗費累計(永久保留)
      await this._markUsageSince(date);
    } else if (op === "gifts" && request.method === "POST") {
      cur.gifts = Math.max(0, Number(p.get("issued")) || 0);
      cur.queued = Math.max(0, Number(p.get("queued")) || 0);
      dirty = true;
    } else if (op === "notice" && request.method === "POST") {
      const n = cur.notices[p.get("kind")];
      if (n && p.get("ok") === "1") { n.sent = true; dirty = true; }
      else if (n) { n.lease = 0; dirty = true; } // 寄失敗：下一次AI呼叫可以再試(次數已在交出時計入)
    }
    // 十、10.9.3.1a補充二：每次呼叫前判斷「當日實際花費＋這次預估」是否達上限；預估＝近7天每次呼叫的實際平均花費，近7天呼叫少於min_calls次時用固定估價
    const est = await this._estimate(date, estFallback, minCalls);
    const out = Object.assign({}, cur, { capped: cur.spent + est.twd >= cap, estimate_twd: est.twd, estimate_source: est.source, recent_calls: est.calls, due: [] });
    // 到了門檻、還沒寄成功、次數沒用完、沒有別的請求正在寄：交給呼叫端寄，並記一次嘗試
    if (op === "add" || op === "gate" || op === "gifts") {
      const rules = [["spend80", cur.spent >= 0.8 * cap], ["spend100", out.capped], ["gift15", cur.gifts >= GIFT_NOTICE_AT], ["giftFull", cur.gifts >= gcap]];
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

// 近7天(含今天)的實際平均花費：ua:日期 的各類型加總(calls、usd)。回傳{twd, source:"actual"|"fixed", calls}
UsageCounter.prototype._estimate = async function (date, fallback, minCalls) {
  const from = new Date(Date.parse(date + "T00:00:00Z") - 6 * 86400000).toISOString().slice(0, 10);
  let calls = 0, usd = 0;
  if (typeof this.state.storage.list !== "function") return { twd: fallback, source: "fixed", calls: 0 };
  for (const [k, kinds] of await this.state.storage.list({ prefix: "ua:" })) {
    const d = k.slice(3);
    if (d < from || d > date) continue;
    for (const b of Object.values(kinds || {})) { calls += b.calls || 0; usd += b.usd || 0; }
  }
  if (calls < minCalls || calls === 0) return { twd: fallback, source: "fixed", calls };
  return { twd: Math.round(usd / calls * USD_TO_TWD * 1e4) / 1e4, source: "actual", calls };
};
UsageCounter.prototype._json = function (o) { return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } }); };
UsageCounter.prototype._recordDetail = async function (p, date, now) {
  const st = this.state.storage;
  const n = (k) => { const v = Number(p.get(k)); return Number.isFinite(v) && v >= 0 ? v : 0; };
  const nonce = p.get("nonce") || "";
  let kind = USAGE_KINDS.includes(p.get("kind")) ? p.get("kind") : "turn";
  if (kind === "turn" || kind === "opening") {
    // 同一個turn_nonce第二次以後＝失敗重試／重新生成(與玩家本機紀錄10.9.4同一個判斷)；只看最近的明細就夠，同一回合的重試都在幾十秒內
    if (nonce) for (const [, v] of await st.list({ prefix: "ud:", reverse: true, limit: 50 })) if (v.n === nonce) { kind = "retry"; break; }
  }
  const row = { t: now, k: kind, turn: p.get("turn") ? n("turn") : null, life: p.get("life") || null, n: nonce || null,
    in: n("in"), cw: n("cw"), cr: n("cr"), out: n("out"), usd: Math.round(n("usd") * 1e6) / 1e6, ms: p.get("ms") ? n("ms") : null };
  // 十、10.14.7.1（2026-10-10）：重寫原因只記在重寫那一筆；上回合紀錄只記在回合的第一筆(重試帶到的不重複算)；每天依代碼計次(uq:日期，跟著明細保留7天)
  const rr = (p.get("rr") || "").slice(0, 80), pn = kind === "retry" ? "" : (p.get("pn") || "").slice(0, 80), end = (p.get("end") || "").slice(0, 40);
  if (rr) row.rr = rr;
  if (pn) row.pn = pn;
  if (end) row.end = end;
  if (rr || pn) {
    const qk = "uq:" + date, qa = (await st.get(qk)) || { regens: 0, reasons: {}, notes: {} };
    if (rr) { qa.regens += 1; for (const c of rr.split("、")) if (c) qa.reasons[c] = (qa.reasons[c] || 0) + 1; }
    if (pn) for (const c of pn.split("、")) if (c) qa.notes[c] = (qa.notes[c] || 0) + 1;
    await st.put(qk, qa);
    for (const [k] of await st.list({ prefix: "uq:", end: "uq:" + taipeiDateString(now - USAGE_DETAIL_KEEP_MS) })) await st.delete(k);
  }
  const agg = (await st.get("ua:" + date)) || {};
  const b = agg[kind] || (agg[kind] = { calls: 0, in: 0, cw: 0, cr: 0, out: 0, usd: 0 });
  b.calls += 1; b.in += row.in; b.cw += row.cw; b.cr += row.cr; b.out += row.out; b.usd = Math.round((b.usd + row.usd) * 1e6) / 1e6;
  await st.put("ua:" + date, agg);
  if (!(await st.get("ua_since"))) await st.put("ua_since", date);
  this._seq = ((this._seq || 0) + 1) % 1e6; // 同一毫秒的多筆依寫入順序排(只在這個實例內遞增，重啟後從頭算也不影響排序)
  await st.put("ud:" + String(now).padStart(15, "0") + ":" + String(this._seq).padStart(6, "0"), row);
  // 清掉超過7天、或超過5,000筆的最舊明細(每次最多清50筆，平常每次只會清0～1筆)
  let count = ((await st.get("ud_count")) || 0) + 1;
  for (const [k, v] of await st.list({ prefix: "ud:", limit: 50 })) {
    if (count <= USAGE_DETAIL_MAX_ROWS && v.t >= now - USAGE_DETAIL_KEEP_MS) break;
    await st.delete(k); count -= 1;
  }
  await st.put("ud_count", count);
  return { ok: true, kind };
};
export const USAGE_KINDS = ["turn", "opening", "retry", "idle", "chapter", "review"];
export const USAGE_DETAIL_MAX_ROWS = 5000;
export const USAGE_DETAIL_KEEP_MS = 7 * 86400000;
async function shortHash(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("lifegame-usage:" + s));
  return Array.from(new Uint8Array(d).slice(0, 4)).map(x => x.toString(16).padStart(2, "0")).join("");
}
// 每次AI回應後記實際用量(10.14.7)。meta：{kind, lifeId, nonce, turn, prologue}；usage：Anthropic回傳的usage與算好的美元。記錄失敗絕不能影響回合
export async function recordAIUsage(env, meta, tokens, usd) {
  try {
    if (!usageCounterStub(env) || !tokens) return;
    const m = meta || {};
    const kind = m.kind === "turn" && m.prologue ? "opening" : (USAGE_KINDS.includes(m.kind) ? m.kind : "turn");
    const params = { kind, in: String(tokens.input || 0), cw: String(tokens.cache_write || 0), cr: String(tokens.cache_read || 0), out: String(tokens.output || 0), usd: String(usd || 0) };
    if (typeof m.turn === "number" && Number.isFinite(m.turn)) params.turn = String(Math.max(0, Math.floor(m.turn)));
    if (m.lifeId) params.life = await shortHash("life:" + m.lifeId);
    if (m.nonce) params.nonce = await shortHash("nonce:" + m.nonce);
    if (typeof m.ms === "number" && Number.isFinite(m.ms)) params.ms = String(Math.max(0, Math.round(m.ms))); // 十、10.17.2：耗時(毫秒)
    // 十、10.14.7.1（2026-10-10）：重寫原因、上回合紀錄、結束原因(只有代碼；呼叫端已清過字元與長度)
    if (m.rr) params.rr = String(m.rr).slice(0, 80);
    if (m.pn) params.pn = String(m.pn).slice(0, 80);
    if (m.end) params.end = String(m.end).slice(0, 40);
    await usageCall(env, "detail", params);
  } catch (e) { /* 只是紀錄 */ }
}

export function usageCounterStub(env) {
  if (!env || !env.USAGE_COUNTER) return null;
  return env.USAGE_COUNTER.get(env.USAGE_COUNTER.idFromName("global"));
}
export async function usageCall(env, op, params, method) {
  const stub = usageCounterStub(env);
  if (!stub) return null;
  const now = nowMs(env);
  const q = new URLSearchParams(Object.assign({ date: taipeiDateString(now), now: String(now), cap: String(spendCap(env)), gift_cap: String(giftCap(env)), est_fallback: String(callCostEstimate(env)), min_calls: String(spendEstimateMinCalls(env)) }, params || {}));
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
  const full = Object.assign({ now, date: taipeiDateString(now), gift_cap: giftCap(env), new_cap: newPlayerCap(env), checkpoint: playerCheckpoint(env), verify_cap: readSetting(env, "DAILY_VERIFY_EMAIL_CAP", 80) }, payload);
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

// 每次AI呼叫記一筆花費；達80%／上限時通知。計數失敗絕不能影響回合。
// 十、10.9.3.1a補充二(2026-10-08)：伺服器有回報用量的呼叫記實際花費(台幣)；沒有回報用量的(失敗呼叫、連線失敗)照這次預估計入(預估由計數器算：近7天平均，資料不足用固定估價)
export async function countAICall(env, ctx, actualTwd, fail) {
  try {
    if (!usageCounterStub(env)) return;
    const hasActual = Number.isFinite(actualTwd) && actualTwd >= 0;
    const params = hasActual ? { cost: String(actualTwd) } : {};
    if (fail) params.fail = String(fail).replace(/[^A-Za-z0-9_:.-]/g, "").slice(0, 40); // 失敗類型(例：529:overloaded_error、network)
    const r = await usageCall(env, "add", params);
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
