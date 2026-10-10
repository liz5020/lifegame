// 2026-09-30新增（十、10.2／10.9.2／10.9.3，第二批：帳號系統、共用錢包、綁定、啟程禮、寄信防濫用）
//
// 【存放方式：Durable Object(SQLite)，不是KV】
// 理由：①帳號、驗證碼、寄信次數、錢包、啟程禮每日份數、排隊都要「多人同時寫入不互相覆蓋」——Durable Object同一個實例一次只處理一件事，
// 讀取→修改→寫入之間不會被別的請求插進來；KV是最後寫入者贏、沒有原子操作，兩個人同時綁定會漏算份數。
// ②10.8封測期間Worker不碰KV(平常0次)；帳號功能放Durable Object，雲端存檔關著時照樣能用，也不會增加KV寫入。
// ③批次1的全站用量計數已經是Durable Object，沿用同一種架構。
// 全站只有一個實例(idFromName("global"))：每天最多幾百次AI呼叫，一個實例綽綽有餘；將來要擴充再依帳號拆分。
//
// 這個類別不繼承DurableObject基底類別，方便在node裡直接測試(tests用假的state.storage)。
// 所有操作都由Worker以 POST {op, ...args, now, date, gift_cap} 呼叫；時間(now、台灣日期date)一律由呼叫端傳進來，
// 這裡不讀系統時鐘，測試才能控制時間(TEST_NOW_MS)。驗證碼本身不會回傳給玩家，只回給Worker寄信。

import { AP_BIND_BONUS, AP_SECOND_LIFE_GIFT, AP_LEGACY_GIFT_MAX, AP_DAILY_REFILL, freshRecord, preCharge, postCharge, spend, refund, taipeiDateString, preChapter, chargeChapter, isValidChapterId } from "./ap.js";

export const CODE_TTL_MS = 10 * 60 * 1000;        // 10.2：驗證碼10分鐘內有效
export const CODE_MAX_TRIES = 5;                  // 10.2：同一組輸錯5次作廢
export const RESEND_GAP_MS = 60 * 1000;           // 10.2.1：同一信箱重寄間隔60秒
export const EMAIL_HOURLY_MAX = 5;                // 10.2.1：同一信箱每小時最多5封
export const IP_HOURLY_MAX = 10;                  // 10.2.1：同一網路位址每小時最多10封
export const DEFAULT_DAILY_VERIFY_EMAIL_CAP = 80; // 10.2.1：全站每日最多寄80封驗證信(環境變數DAILY_VERIFY_EMAIL_CAP)
export const SESSION_TTL_MS = 90 * 24 * 3600 * 1000; // 10.2：登入保持90天，每次使用往後延長
export const MAX_SESSIONS_PER_ACCOUNT = 20;
export const ACCOUNT_LIFE_MAX = 2;                // 10.9.2：綁定信箱可有2段人生
export const ADMIN_LOG_KEEP_MS = 180 * 24 * 3600 * 1000; // 10.13.6：存取紀錄保留180天
export const GIFTS_PER_ACCOUNT = 2;               // 10.9.3：每個信箱最多2份啟程禮
export const GIFT_POINTS = { 1: AP_BIND_BONUS, 2: AP_SECOND_LIFE_GIFT }; // 第1份(綁定)+30點、第2份(開第2段人生)+55點；2026-09-30第三批：第1份由「補到55點」改固定+30
export const CARRY_MAX_TOTAL = 120;               // 綁定／併入時，未綁人生帶過來的點數累計上限(封測期間本機點數玩家改得動，這裡只擋離譜的數字)
const POOL_DAILY_MAX = AP_DAILY_REFILL, POOL_GIFT_MAX = AP_LEGACY_GIFT_MAX;
const EVENTS_MAX = 30;
// 十、10.15（2026-10-04封測名額與候補）
export const DEFAULT_NEW_PLAYER_CAP = 5;          // 10.15.2：每日新玩家名額(DAILY_NEW_PLAYER_CAP，0＝暫停發放)
export const DEFAULT_PLAYER_CHECKPOINT = 50;      // 10.15.3：累計入場檢查點(BETA_PLAYER_CHECKPOINT)
export const WL_HOLD_MS = 72 * 3600 * 1000;       // 10.15.4：位子保留3天(72小時)
export const WL_MAIL_MAX_TRIES = 3;               // 10.15.4：通知信寄送失敗每小時重試，最多3次(含第一次)
export const WL_MAIL_RETRY_GAP_MS = 55 * 60 * 1000; // 排程每小時整點跑一次，留5分鐘誤差
export const WL_ENTRY_GIFT = 25;                  // 10.15.4：入場一次領25點(相當於未綁啟程禮)＋第1份綁定啟程禮30點
export const WL_HOLD_STATUSES = ["allocated", "notified", "send_failed"];
export const CP_NOTICE_MAX_ATTEMPTS = 3, CP_NOTICE_LEASE_MS = 60 * 1000; // 10.15.6：檢查點通知信，防重複與重試比照10.9.3.1a
const HOUR_MS = 3600 * 1000;

export function normalizeEmail(raw) {
  return String(raw == null ? "" : raw).trim().toLowerCase();
}
export function isValidEmail(email) {
  return typeof email === "string" && email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return "";
  return (local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)) + "***@" + domain;
}
async function sha256Hex(str) {
  const buf = new TextEncoder().encode(String(str));
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(nBytes) {
  const a = new Uint8Array(nBytes);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomCode6() { // 拒絕取樣，避免取餘數造成的偏差
  const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= 4294000000);
  return String(a[0] % 1000000).padStart(6, "0");
}
function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function clampInt(v, max) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
}
function clampPool(pool) {
  const p = pool && typeof pool === "object" ? pool : {};
  return clampInt(p.daily, POOL_DAILY_MAX) + clampInt(p.gift, POOL_GIFT_MAX); // 購買點封測期間一律不採信(沒有人買過)
}

// ---- 錢包(沿用ap.js的紀錄形狀：daily永遠0、gift＝一般點數、purchased＝購買點，預扣/退點/重新生成規則沿用preCharge/postCharge) ----
function freshWallet(today) {
  const w = freshRecord(today);
  w.daily = 0; w.gift = 0; w.purchased = 0; w.pres = {};
  return w;
}
export function walletTotal(w) { return (w.daily || 0) + (w.gift || 0) + (w.purchased || 0); }
export function publicWallet(a) {
  const w = a.wallet;
  return { free: (w.daily || 0) + (w.gift || 0), purchased: w.purchased || 0, total: walletTotal(w), refill_cap: AP_DAILY_REFILL * a.lives.length };
}
function pushEvent(a, now, type, n) {
  a.events.push({ t: now, type, n });
  if (a.events.length > EVENTS_MAX) a.events.splice(0, a.events.length - EVENTS_MAX);
}
// 十、10.13.7.1：帳號「曾綁過的人生代號」清單，只增不減(人生結束被移出lives後仍算這個帳號的)；只放人生代號
function noteEverLid(a, lid) {
  if (!Array.isArray(a.everLids)) a.everLids = [];
  if (!a.everLids.includes(lid)) a.everLids.push(lid);
}
function freeSlot(a) {
  for (let s = 0; s < ACCOUNT_LIFE_MAX; s++) if (!a.lives.some(l => l.slot === s)) return s;
  return -1;
}

export class AccountStore {
  constructor(state) {
    this.state = state;
    this.storage = state.storage;
    this._chain = Promise.resolve(); // Durable Object本來就一次只處理一件事；測試用的假環境沒有這個保證，所以這裡自己排隊
  }
  async fetch(request) {
    let body;
    try { body = await request.json(); } catch (e) { return this._json({ ok: false, error: "bad_request" }, 400); }
    const fn = body && OPS[body.op];
    if (!fn) return this._json({ ok: false, error: "unknown_op" }, 400);
    const run = this._chain.then(async () => { this._b = body; await this._ensureLedgerStart(body.now); return fn.call(this, body); });
    this._chain = run.then(() => {}, () => {});
    try { return this._json(await run); }
    catch (e) { return this._json({ ok: false, error: "internal", message: String(e && e.message || e) }, 500); }
  }
  _json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json" } }); }

  // ---------- 儲存 ----------
  async _get(k, dflt) { const v = await this.storage.get(k); return v === undefined || v === null ? dflt : v; }
  async _acct(aid) { return aid ? this._get("a:" + aid, null) : null; }
  async _putAcct(a) { await this.storage.put("a:" + a.aid, a); }
  async _day(date) {
    const d = await this._get("d", null);
    return d && d.date === date ? d : { date, verify: 0, gifts: 0 };
  }
  async _putDay(d) { await this.storage.put("d", d); }

  // ---------- 驗證碼 ----------
  // 通過就立刻作廢(使用一次即失效)；輸錯5次作廢；過期作廢
  async _checkCode(email, code, now) {
    const rec = await this._get("c:" + email, null);
    if (!rec) return { ok: false, error: "no_code" };
    if (now > rec.exp) { await this.storage.delete("c:" + email); return { ok: false, error: "code_expired" }; }
    const h = await sha256Hex(email + "|" + String(code == null ? "" : code).trim());
    if (!safeEq(h, rec.h)) {
      rec.tries += 1;
      if (rec.tries >= CODE_MAX_TRIES) { await this.storage.delete("c:" + email); return { ok: false, error: "code_locked" }; }
      await this.storage.put("c:" + email, rec);
      return { ok: false, error: "wrong_code", tries_left: CODE_MAX_TRIES - rec.tries };
    }
    await this.storage.delete("c:" + email);
    return { ok: true };
  }

  // ---------- 工作階段 ----------
  async _newSession(a, now) {
    const token = randomHex(32);
    const hash = await sha256Hex(token);
    await this.storage.put("s:" + hash, { aid: a.aid, last: now });
    a.sessions.push(hash);
    while (a.sessions.length > MAX_SESSIONS_PER_ACCOUNT) await this.storage.delete("s:" + a.sessions.shift());
    return token;
  }
  // 驗證token，通過時把「最後使用」往後延(每次使用往後90天)。回傳帳號或null
  async _auth(token, now) {
    if (typeof token !== "string" || token.length < 32 || token.length > 200) return null;
    const hash = await sha256Hex(token);
    const s = await this._get("s:" + hash, null);
    if (!s) return null;
    const a = await this._acct(s.aid);
    if (!a) { await this.storage.delete("s:" + hash); return null; }
    if (now - s.last > SESSION_TTL_MS) {
      await this.storage.delete("s:" + hash);
      a.sessions = a.sessions.filter(x => x !== hash); await this._putAcct(a);
      return null;
    }
    s.last = now; await this.storage.put("s:" + hash, s);
    return a;
  }

  // ---------- 每日補點、啟程禮發放與排隊 ----------
  // 每次帳號操作開頭：先處理排隊中的啟程禮(午夜後先補發排隊者)，再把這個帳號的錢包依當天第一次使用補點
  async _tick(a, ctx) {
    const flags = { giftChanged: false };
    if (a && a.wl) await this._entryDay(ctx); // 10.15：候補帳號每次操作順便處理過期與當天分配
    await this._processQueue(ctx, flags);
    if (a) {
      // 排隊補發可能已經改到這個帳號，重新讀一次
      const fresh = await this._acct(a.aid);
      if (fresh) Object.assign(a, fresh);
      this._refill(a, ctx);
      const w = a.wallet;
      if (w.prologueDay !== ctx.date) { w.prologueDay = ctx.date; w.prologueCount = 0; }
      await this._putAcct(a);
    }
    return flags;
  }
  // 10.9.2第4點：當天第一次打開時，把錢包餘額補到「5點×可續寫的人生數」；已達或超過不補，不回溯
  _refill(a, ctx) {
    if (a.refillDate === ctx.date) return 0;
    a.refillDate = ctx.date;
    const cap = AP_DAILY_REFILL * a.lives.length;
    const total = walletTotal(a.wallet);
    if (total >= cap) return 0;
    const add = cap - total;
    a.wallet.gift += add;
    pushEvent(a, ctx.now, "每日補點", add);
    return add;
  }
  _applyGift(a, kind, fromQueue, day, ctx) {
    const w = a.wallet;
    const added = GIFT_POINTS[kind]; // 第1份：綁定+30點；第2份：開第2段人生+55點。一定發出、一定占用當天份數
    a.gifts[kind === 1 ? "g1" : "g2"] = "done";
    if (added > 0) { w.gift += added; day.gifts += 1; pushEvent(a, ctx.now, fromQueue ? "啟程禮補發" : (kind === 1 ? "啟程禮" : "啟程禮（第 2 份）"), added); }
    return added;
  }
  async _processQueue(ctx, flags) {
    const q = await this._get("gq", []);
    if (!q.length) return;
    const day = await this._day(ctx.date);
    let changed = false;
    while (q.length && day.gifts < ctx.gift_cap) {
      const it = q.shift();
      const a = await this._acct(it.aid);
      if (!a) continue;
      this._applyGift(a, it.kind, true, day, ctx);
      await this._putAcct(a);
      changed = true;
    }
    if (changed) { await this.storage.put("gq", q); await this._putDay(day); flags.giftChanged = true; }
  }
  // 綁定／開第2段人生時要發一份：當天沒發滿就直接發，發滿就排隊(依觸發時間先後，隔天午夜後補發)
  async _requestGift(a, kind, ctx, flags) {
    const day = await this._day(ctx.date);
    if (day.gifts < ctx.gift_cap) {
      const added = this._applyGift(a, kind, false, day, ctx);
      await this._putDay(day);
      flags.giftChanged = true;
      return { status: "granted", added, kind };
    }
    a.gifts[kind === 1 ? "g1" : "g2"] = "queued";
    const q = await this._get("gq", []);
    q.push({ aid: a.aid, kind, t: ctx.now });
    await this.storage.put("gq", q);
    flags.giftChanged = true;
    return { status: "queued", added: 0, kind };
  }
  async _giftStats(ctx) {
    const day = await this._day(ctx.date);
    const q = await this._get("gq", []);
    return { issued: day.gifts, queued: q.length, cap: ctx.gift_cap };
  }
  // 回應帳號目前狀態：把待送的事件(補點、啟程禮…)一起送出並從帳號上清掉(只送一次)，最後才存回去
  async _out(a, extra, flags, giftStats) {
    const events = a.events.splice(0, a.events.length);
    await this._putAcct(a);
    const pub = this._public(a);
    if (a.wl) pub.wl = await this._wlView(a);
    return Object.assign({
      ok: true, account: pub, events,
      gift_changed: !!(flags && flags.giftChanged), gift_stats: giftStats || undefined
    }, extra || {});
  }
  _public(a) {
    const done = ["g1", "g2"].filter(k => a.gifts[k] === "done").length;
    const queued = ["g1", "g2"].filter(k => a.gifts[k] === "queued").length;
    return {
      aid: a.aid, email_masked: maskEmail(a.email), recovery_key: a.key, wallet: publicWallet(a),
      lives: a.lives.map(l => ({ lid: l.lid, slot: l.slot })),
      gifts: { claimed: done, queued, max: GIFTS_PER_ACCOUNT },
      consent: a.consent || null // 十、10.13.2：開場同意紀錄{v,at}
    };
  }
  // 把裝置上的未綁人生放進帳號：最多ACCOUNT_LIFE_MAX段(依傳進來的順序)，超過的不收、不刪，留在原本的復原金鑰上。
  // 收進來的人生把剩下的行動點併入錢包(累計有上限)
  _attach(a, list) {
    const accepted = [], overflow = []; let carried = 0;
    const seen = new Set(a.lives.map(l => l.lid));
    for (const it of Array.isArray(list) ? list.slice(0, 6) : []) {
      const lid = it && typeof it.lid === "string" && /^[a-z0-9]{4,40}$/.test(it.lid) ? it.lid : null;
      if (!lid || seen.has(lid)) continue;
      seen.add(lid);
      const slot = freeSlot(a);
      if (slot < 0) { overflow.push(lid); continue; }
      a.lives.push({ lid, slot });
      noteEverLid(a, lid);
      accepted.push({ lid, slot });
      const room = Math.max(0, CARRY_MAX_TOTAL - (a.carried || 0));
      const pts = Math.min(clampPool(it.pool), room);
      a.carried = (a.carried || 0) + pts;
      carried += pts;
    }
    a.wallet.gift += carried;
    return { accepted, overflow, carried };
  }

  // ==================== 操作 ====================
  // 寄驗證碼前先「預約」：檢查各種上限、產生新驗證碼(舊的立刻作廢)。實際寄信由Worker做，寄失敗再呼叫send_code_release退回計數
  async opSendCodeReserve(b) {
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) return { ok: false, error: "invalid_email" };
    const ip = String(b.ip || "unknown").slice(0, 80), now = b.now;
    const hourAgo = now - 3600 * 1000;
    const eTimes = (await this._get("le:" + email, [])).filter(t => t > hourAgo);
    const iTimes = (await this._get("li:" + ip, [])).filter(t => t > hourAgo);
    const last = eTimes.length ? eTimes[eTimes.length - 1] : 0;
    if (last && now - last < RESEND_GAP_MS) return { ok: false, error: "too_soon", retry_after: Math.ceil((RESEND_GAP_MS - (now - last)) / 1000) };
    if (eTimes.length >= EMAIL_HOURLY_MAX || iTimes.length >= IP_HOURLY_MAX) return { ok: false, error: "rate_limited" }; // 不透露是哪一項、也不透露信箱有沒有帳號
    const day = await this._day(b.date);
    const cap = Number(b.verify_cap) > 0 ? Number(b.verify_cap) : DEFAULT_DAILY_VERIFY_EMAIL_CAP;
    if (day.verify >= cap) return { ok: false, error: "daily_cap" };
    const code = randomCode6();
    eTimes.push(now); iTimes.push(now); day.verify += 1;
    await this.storage.put("le:" + email, eTimes);
    await this.storage.put("li:" + ip, iTimes);
    await this._putDay(day);
    await this.storage.put("c:" + email, { h: await sha256Hex(email + "|" + code), exp: now + CODE_TTL_MS, tries: 0, sentAt: now });
    return { ok: true, code, email, next_send_in: RESEND_GAP_MS / 1000, expires_in: CODE_TTL_MS / 1000 };
  }
  // 十、10.16.15(2026-10-08)：IP與寄信次數紀錄寫入後1小時到期。到期後不再計入限制(reserve只算最近一小時)，每小時排程呼叫這裡把已到期的整筆刪掉
  // (最晚在寫入後2小時內清除)；順便清掉過期還沒用掉的驗證碼紀錄(鍵名含信箱)；2026-10-08補：封存包寫入計數(r:)同樣在這裡清
  async opPurgeAbuse(b) {
    const cut = b.now - 3600 * 1000;
    let le = 0, li = 0, c = 0, pr = 0;
    // 封存包寫入計數(r:小時:來源雜湊)：計數只看當下這一小時，小時早於現在的整筆刪掉(沒人再寫入時也不會留超過2小時)
    const curHour = new Date(b.now).toISOString().slice(0, 13);
    for (const [k] of await this.storage.list({ prefix: "r:", end: "r:" + curHour })) { await this.storage.delete(k); pr++; }
    for (const [k, v] of await this.storage.list({ prefix: "le:" })) { const last = Array.isArray(v) && v.length ? v[v.length - 1] : 0; if (last <= cut) { await this.storage.delete(k); le++; } }
    for (const [k, v] of await this.storage.list({ prefix: "li:" })) { const last = Array.isArray(v) && v.length ? v[v.length - 1] : 0; if (last <= cut) { await this.storage.delete(k); li++; } }
    for (const [k, v] of await this.storage.list({ prefix: "c:" })) { if (!v || b.now > v.exp) { await this.storage.delete(k); c++; } }
    return { ok: true, purged: { email_times: le, ip_times: li, codes: c, pack_rate: pr } };
  }
  async opSendCodeRelease(b) {
    const email = normalizeEmail(b.email), ip = String(b.ip || "unknown").slice(0, 80);
    const eTimes = await this._get("le:" + email, []); eTimes.pop(); if (eTimes.length) await this.storage.put("le:" + email, eTimes); else await this.storage.delete("le:" + email);
    const iTimes = await this._get("li:" + ip, []); iTimes.pop(); if (iTimes.length) await this.storage.put("li:" + ip, iTimes); else await this.storage.delete("li:" + ip);
    const day = await this._day(b.date); day.verify = Math.max(0, day.verify - 1); await this._putDay(day);
    await this.storage.delete("c:" + email);
    return { ok: true };
  }

  // 綁定信箱：驗證碼通過後，這個信箱沒有帳號＝建立帳號、這把復原金鑰綁上去、未綁人生帶過來、錢包再+30點(第1份啟程禮)。
  // 這個信箱已經有帳號＝拒絕(驗證碼通過後才告知，避免被拿來探測信箱有沒有玩過)；驗證碼照樣作廢
  async opBind(b) {
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) return { ok: false, error: "invalid_email" };
    const chk = await this._checkCode(email, b.code, b.now);
    if (!chk.ok) return chk;
    if (await this._get("e:" + email, null)) return { ok: false, error: "email_exists" };
    const key = typeof b.key === "string" && b.key.length > 0 && b.key.length <= 100 ? b.key : null;
    const loc = typeof b.loc === "string" && /^[0-9a-f]{64}$/.test(b.loc) ? b.loc : null; // 十、10.8.2：「金鑰→帳號」對照改以門牌為索引(Worker算好傳進來)，不再存金鑰原文
    if (!key || !loc) return { ok: false, error: "bad_key" };
    if (await this._get("kl:" + loc, null)) return { ok: false, error: "key_linked" }; // 一個信箱只能綁一把金鑰，這把金鑰也不能綁兩個信箱
    if (!(await this._get("loc:off", false)) && await this._get("k:" + key, null)) return { ok: false, error: "key_linked" }; // 10.13.6門牌改版保險期：搬遷前的舊對照(以金鑰原文為名)也要擋；清理後移除
    const ctx = this._ctx(b);
    const a = { aid: randomHex(8), email, key, created: b.now, purchased: false, wallet: freshWallet(b.date), refillDate: b.date,
      lives: [], gifts: { g1: "none", g2: "none" }, events: [], sessions: [], carried: 0 };
    const attach = this._attach(a, b.lives);
    const flags = { giftChanged: false };
    await this._processQueue(ctx, flags);
    const gift = await this._requestGift(a, 1, ctx, flags);
    const token = await this._newSession(a, b.now);
    await this._putAcct(a);
    await this.storage.put("e:" + email, a.aid);
    await this.storage.put("kl:" + loc, a.aid);
    return this._out(a, { token, result: { kind: "bind", gift, accepted: attach.accepted, overflow: attach.overflow, carried: attach.carried } }, flags, await this._giftStats(ctx));
  }
  // 用信箱登入：有帳號＝新增這台裝置的登入狀態、裝置上的未綁人生併入(超過2段的留在原金鑰)、剩餘點數併入錢包、不發啟程禮；
  // 沒有帳號＝告知(驗證碼通過才說)，請玩家從遊戲裡的「綁定信箱」建立
  async opLogin(b) {
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) return { ok: false, error: "invalid_email" };
    const chk = await this._checkCode(email, b.code, b.now);
    if (!chk.ok) return chk;
    const aid = await this._get("e:" + email, null);
    const a = aid ? await this._acct(aid) : null;
    if (!a) return { ok: false, error: "no_account" };
    const ctx = this._ctx(b);
    const flags = await this._tick(a, ctx);
    const attach = this._attach(a, b.lives);
    if (attach.carried > 0) pushEvent(a, b.now, "帳號併入", attach.carried);
    const token = await this._newSession(a, b.now);
    return this._out(a, { token, result: { kind: "login", accepted: attach.accepted, overflow: attach.overflow, carried: attach.carried } }, flags, await this._giftStats(ctx));
  }
  async opLogout(b) {
    if (typeof b.token !== "string") return { ok: true };
    const hash = await sha256Hex(b.token);
    const s = await this._get("s:" + hash, null);
    if (s) {
      await this.storage.delete("s:" + hash);
      const a = await this._acct(s.aid);
      if (a) { a.sessions = a.sessions.filter(x => x !== hash); await this._putAcct(a); }
    }
    return { ok: true };
  }
  async opMe(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized" };
    const ctx = this._ctx(b);
    const flags = await this._tick(a, ctx);
    await this._putAcct(a);
    return this._out(a, {}, flags, flags.giftChanged ? await this._giftStats(ctx) : null);
  }
  // 換綁信箱：必須先通過新信箱的驗證碼；新信箱已有帳號就拒絕
  async opChangeEmail(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized" };
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) return { ok: false, error: "invalid_email" };
    const chk = await this._checkCode(email, b.code, b.now);
    if (!chk.ok) return chk;
    if (await this._get("e:" + email, null)) return { ok: false, error: "email_exists" };
    await this.storage.delete("e:" + a.email);
    a.email = email;
    await this.storage.put("e:" + email, a.aid);
    await this._putAcct(a);
    return this._out(a, {}, null, null);
  }
  // 手動把裝置上的人生轉進帳號(帳號有空格時)：不發啟程禮，剩餘點數併入錢包
  async opAttachLives(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized" };
    const ctx = this._ctx(b);
    const flags = await this._tick(a, ctx);
    const attach = this._attach(a, b.lives);
    if (attach.carried > 0) pushEvent(a, b.now, "帳號併入", attach.carried);
    await this._putAcct(a);
    return this._out(a, { result: { kind: "attach", accepted: attach.accepted, overflow: attach.overflow, carried: attach.carried } }, flags, null);
  }
  // 十、10.13.2：開場同意頁的同意紀錄(說明版本號＋同意時間)記在帳號資料上
  async opConsent(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized" };
    if (!Number.isInteger(b.v) || b.v < 1 || b.v > 9999 || !Number.isFinite(b.at) || b.at <= 0) return { ok: false, error: "bad_request" };
    a.consent = { v: b.v, at: Math.floor(b.at) };
    await this._putAcct(a);
    return { ok: true };
  }

  // ---------- 十、10.13.6 管理端：存檔索引、名冊、存取紀錄(只放在Durable Object，不放KV；索引不含復原金鑰原文) ----------
  // 2026-10-04(10.13.6門牌改版)：索引改以「門牌＋格子」為名(y:門牌:格子)，只存資訊與時間，不存金鑰原文也不存加密參照；
  // 舊的x:內部代號索引只留到搬遷清理(legacy_*)，搬遷時讀它的最後存檔時間
  async opSaveIndexPut(b) {
    if (typeof b.loc !== "string" || !/^[0-9a-f]{64}$/.test(b.loc) || !Number.isInteger(b.slot) || b.slot < 0 || b.slot > 2) return { ok: false, error: "bad_request" };
    const k = "y:" + b.loc + ":" + b.slot;
    if (b.only_if_missing && await this._get(k, null)) return { ok: true, existed: true };
    await this.storage.put(k, { info: b.info || {}, at: b.at !== undefined ? b.at : b.now });
    return { ok: true };
  }
  async opSaveIndexList() {
    const m = await this.storage.list({ prefix: "y:" });
    const saves = [];
    for (const [k, v] of m) saves.push({ loc: k.slice(2, 66), slot: Number(k.slice(67)), info: v.info, at: v.at });
    saves.sort((a, b) => (b.at || 0) - (a.at || 0));
    return { ok: true, saves };
  }
  async opSaveIndexGet(b) {
    const v = typeof b.loc === "string" ? await this._get("y:" + b.loc + ":" + b.slot, null) : null;
    return v ? { ok: true, info: v.info, at: v.at } : { ok: false, error: "not_found" };
  }
  async opSaveIndexDel(b) { await this.storage.delete("y:" + b.loc + ":" + b.slot); return { ok: true }; }
  // 搬遷用：舊索引(x:內部代號)只讀它的最後存檔時間
  async opLegacyIndexAt(b) {
    const v = typeof b.code === "string" ? await this._get("x:" + b.code, null) : null;
    return v ? { ok: true, at: v.at } : { ok: false, error: "not_found" };
  }
  // 搬遷用：已綁信箱帳號的金鑰(只給Worker算成門牌，不回給任何人)；「金鑰→帳號」對照補成以門牌為名(不覆蓋)
  async opAcctKeys() {
    const out = [];
    for (const [, a] of await this.storage.list({ prefix: "a:" })) if (a && a.key) out.push({ aid: a.aid, key: a.key });
    return { ok: true, accounts: out };
  }
  async opKlSync(b) {
    let put = 0;
    for (const e of Array.isArray(b.entries) ? b.entries : []) {
      if (!e || !/^[0-9a-f]{64}$/.test(e.loc) || typeof e.aid !== "string") continue;
      if (!(await this._get("kl:" + e.loc, null))) { await this.storage.put("kl:" + e.loc, e.aid); put++; }
    }
    return { ok: true, put };
  }
  async opKlHas(b) { return { ok: true, has: typeof b.loc === "string" && (await this._get("kl:" + b.loc, null)) !== null }; }
  async opLocCounts() {
    const c = async p => (await this.storage.list({ prefix: p })).size;
    return { ok: true, legacy_k: await c("k:"), legacy_x: await c("x:"), kl: await c("kl:"), y: await c("y:"), accounts: await c("a:") };
  }
  // 搬遷與保險期狀態：dry_at(試算時間)、reconciled_at(對帳通過時間＝保險期起點，同時把改讀舊位置次數歸零)、off(保險功能已關)、cleaned(清理完成)、fb(改讀舊位置次數)
  async opLocState() {
    const g = async k => await this._get("loc:" + k, null);
    return { ok: true, dry_at: await g("dry_at"), reconciled_at: await g("reconciled_at"), off: !!(await g("off")), cleaned: !!(await g("cleaned")), fb: Number(await g("fb")) || 0 };
  }
  async opLocSet(b) {
    if (!["dry_at", "reconciled_at", "off", "cleaned"].includes(b.name)) return { ok: false, error: "bad_request" };
    await this.storage.put("loc:" + b.name, b.name === "off" || b.name === "cleaned" ? true : b.now);
    if (b.name === "reconciled_at") await this.storage.put("loc:fb", 0);
    return { ok: true };
  }
  async opLocFbHit() {
    await this.storage.put("loc:fb", (Number(await this._get("loc:fb", 0)) || 0) + 1);
    return { ok: true };
  }
  // 清理步驟二：舊內部代號索引與以金鑰原文為名的舊對照全部刪掉
  async opLocPurgeLegacy() {
    let x = 0, k = 0;
    for (const [n] of await this.storage.list({ prefix: "x:" })) { await this.storage.delete(n); x++; }
    for (const [n] of await this.storage.list({ prefix: "k:" })) { await this.storage.delete(n); k++; }
    return { ok: true, x, k };
  }
  // 10.13.3(2026-10-03補充二)：封存包寫入頻率限制——同一來源位址每小時最多N次(預設60)；計數放這個DO、不放KV(KV是「暫停期間不碰」的對象)；順便清掉過去小時的計數
  async opPackRate(b) {
    const hour = String(b.hour || "").slice(0, 13), limit = Number(b.limit) || 60;
    if (!/^[0-9a-f]{16}$/.test(String(b.ip || "")) || !hour) return { ok: false, error: "bad_request" };
    const k = "r:" + hour + ":" + b.ip;
    const n = Number(await this._get(k, 0)) || 0;
    if (n >= limit) return { ok: true, allowed: false };
    await this.storage.put(k, n + 1);
    for (const [old] of await this.storage.list({ prefix: "r:", end: "r:" + hour })) await this.storage.delete(old);
    return { ok: true, allowed: true };
  }
  async opRoster() {
    const m = await this.storage.list({ prefix: "a:" });
    const accounts = [];
    for (const [, a] of m) {
      accounts.push({
        aid: a.aid, email: a.email, created: a.created, lives: (a.lives || []).map(l => ({ lid: l.lid, slot: l.slot })), ever_lids: a.everLids || [],
        gifts: { claimed: ["g1", "g2"].filter(k => a.gifts && a.gifts[k] === "done").length, queued: ["g1", "g2"].filter(k => a.gifts && a.gifts[k] === "queued").length, max: GIFTS_PER_ACCOUNT },
        purchased: !!a.purchased, consent: a.consent || null,
        wl: a.wl ? { status: a.wl.status, joinedAt: a.wl.joinedAt || null, sentAt: a.wl.sentAt || null } : null
      });
    }
    accounts.sort((x, y) => y.created - x.created);
    return { ok: true, accounts };
  }
  // 存取紀錄：誰、何時、哪份存檔(內部代號＋人生代號)、原因；不記信箱與復原金鑰；保留180天，每次寫入順便清掉過期的
  async opAdminLogAdd(b) {
    const e = b.entry || {};
    const entry = { at: b.now, who: String(e.who || "").slice(0, 40), reason: String(e.reason || "").slice(0, 200), code: String(e.code || ""), lid: e.lid || null, action: ["delete", "roster", "location-migrate-dry", "location-migrate", "location-migrate-result", "location-cleanup", "location-cleanup-result", "location-status"].includes(e.action) ? e.action : "view" };
    await this.storage.put("L:" + String(b.now).padStart(14, "0") + ":" + randomHex(3), entry);
    const old = await this.storage.list({ prefix: "L:", end: "L:" + String(b.now - ADMIN_LOG_KEEP_MS).padStart(14, "0") });
    for (const [k] of old) await this.storage.delete(k);
    return { ok: true };
  }
  async opAdminLogList() {
    const m = await this.storage.list({ prefix: "L:" });
    return { ok: true, log: [...m.values()].reverse() };
  }

  // 開新人生：帳號最多同時2段；帳號第一次開到第2段人生時發第2份啟程禮(發滿就排隊)
  async opLifeAdd(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized" };
    if (typeof b.lid !== "string" || !/^[a-z0-9]{4,40}$/.test(b.lid)) return { ok: false, error: "bad_lid" };
    const ctx = this._ctx(b);
    const flags = await this._tick(a, ctx);
    const have = a.lives.find(l => l.lid === b.lid);
    if (have) return this._out(a, { result: { kind: "life_add", slot: have.slot, existing: true } }, flags, null);
    if (a.lives.length >= ACCOUNT_LIFE_MAX) { await this._putAcct(a); return { ok: false, error: "account_full" }; }
    // 十、10.15.4：候補帳號名下還沒有人生時，只有位子保留中才能開始(入場一次領25＋30點)
    let wlEntry = false;
    if (a.wl && a.lives.length === 0) {
      if (WL_HOLD_STATUSES.includes(a.wl.status)) wlEntry = true;
      else if (a.wl.status === "waiting" || a.wl.status === "expired") { await this._putAcct(a); return { ok: false, error: "wl_not_ready" }; }
    }
    const slot = freeSlot(a);
    a.lives.push({ lid: b.lid, slot });
    noteEverLid(a, b.lid);
    let gift = null, wl_entry = null;
    if (wlEntry) {
      a.wl.status = "entered"; a.wl.enteredAt = b.now;
      await this._whRemove(a.aid);
      a.wallet.gift += WL_ENTRY_GIFT;
      pushEvent(a, b.now, "啟程禮", WL_ENTRY_GIFT);
      gift = await this._requestGift(a, 1, ctx, flags); // 第1份綁定啟程禮30點(發滿時排到隔天，照10.9.3.2)
      wl_entry = { added: WL_ENTRY_GIFT, gift };
    } else if (a.lives.length === ACCOUNT_LIFE_MAX && a.gifts.g2 === "none") gift = await this._requestGift(a, 2, ctx, flags);
    await this._putAcct(a);
    return this._out(a, { result: { kind: "life_add", slot, gift, wl_entry } }, flags, flags.giftChanged ? await this._giftStats(ctx) : null);
  }
  async opLifeRemove(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized" };
    a.lives = a.lives.filter(l => l.lid !== b.lid);
    await this._putAcct(a);
    return this._out(a, {}, null, null);
  }

  // ---- 錢包扣點(照10.3.1～10.3.11：每回合1點、同一回合(turn_nonce)只扣一次、失敗不扣、開場免費) ----
  async opWalletPre(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    if (typeof b.nonce !== "string" || !/^[a-z0-9]{6,40}$/.test(b.nonce)) return { ok: false, error: "bad_nonce", status: 400 };
    const ctx = this._ctx(b);
    const flags = await this._tick(a, ctx);
    // 10.13.7.1(2026-10-10修正)：回合請求帶的是存檔的人生代號(s.lifeId)，帳號名下記的是帳號用人生代號(s.acct.lid)，兩者不同；
    // 用帳號錢包出回合時把前者也記進「曾綁過的人生代號」，數據總覽與名冊回合數才對得上這個帳號
    if (typeof b.life_id === "string" && /^[a-z0-9]{4,40}$/.test(b.life_id)) noteEverLid(a, b.life_id);
    // 十、10.3.12（2026-10-09）：測試用「不扣行動點」——Worker轉來測試帳號名單(secret AP_TEST_ACCOUNTS)，本帳號信箱在名單上才不扣點；
    // 不預扣、不記nonce，wallet_post找不到預扣紀錄就不動錢包
    if (b.ap_test_free === true && Array.isArray(b.test_accounts) && a.email && b.test_accounts.includes(normalizeEmail(a.email))) {
      await this._putAcct(a);
      return this._out(a, { wallet: publicWallet(a), pre: { charged: false, free_prologue: false, repeat: false, test_free: true } }, flags, flags.giftChanged ? await this._giftStats(ctx) : null);
    }
    const pre = preCharge(a.wallet, { nonce: b.nonce, isPrologue: !!b.is_prologue, lifeId: b.life_id, retryOfFailed: b.retry === true });
    if (pre.ok) {
      a.wallet.pres[b.nonce] = pre;
      const ks = Object.keys(a.wallet.pres); if (ks.length > 6) delete a.wallet.pres[ks[0]];
    }
    await this._putAcct(a);
    const out = await this._out(a, { wallet: publicWallet(a), pre: { charged: !!pre.charge, free_prologue: !!pre.freePrologue, repeat: !!pre.repeat } }, flags, flags.giftChanged ? await this._giftStats(ctx) : null);
    if (!pre.ok) { out.ok = false; out.status = pre.status; out.error = pre.error; }
    return out;
  }
  async opWalletPost(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    const pre = a.wallet.pres && a.wallet.pres[b.nonce];
    if (pre) postCharge(a.wallet, pre, !!b.success, b.life_id, b.date);
    await this._putAcct(a);
    return this._out(a, { wallet: publicWallet(a) }, null, null);
  }
  // 一次性扣點(放置回溯5點、回顧這一生5點)：不夠就不扣
  async opWalletSpend(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    const ctx = this._ctx(b);
    const flags = await this._tick(a, ctx);
    const n = clampInt(b.n, 100);
    if (n <= 0) return { ok: false, error: "bad_amount", status: 400 };
    if (walletTotal(a.wallet) < n) return this._out(a, { ok: false, status: 402, error: { type: "insufficient_action_points", message: "行動點不足" }, wallet: publicWallet(a) }, flags, null);
    spend(a.wallet, n);
    // 十、7.4.3.4(2026-10-08)：人生重開丹(tag=keep、10點)留一張退還憑證，指定NPC整個第一階段都沒登場時可以憑它退還一次(伺服器驗證，客戶端不能自己加點)
    if (b.tag === "keep" && n === 10) { a.tickets = a.tickets || {}; a.tickets.keep = (a.tickets.keep || 0) + 1; }
    await this._putAcct(a);
    return this._out(a, { wallet: publicWallet(a) }, flags, null);
  }
  async opWalletRefund(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    if (b.tag !== "keep" || !a.tickets || !(a.tickets.keep > 0)) return { ok: false, error: "no_ticket", status: 409 };
    a.tickets.keep -= 1;
    a.wallet.gift += 10;
    pushEvent(a, b.now, "人生重開丹（退還）", 10);
    await this._putAcct(a);
    return this._out(a, { wallet: publicWallet(a) }, null, null);
  }
  // 十五、15.9：人生之書每章3點。pre＝檢查餘額與每日5次上限並記次數；post＝AI成功後才扣，同一章只扣一次
  async opChapterPre(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    if (!isValidChapterId(b.chapter_id)) return { ok: false, error: "bad_chapter", status: 400 };
    const ctx = this._ctx(b);
    const flags = await this._tick(a, ctx);
    const pre = preChapter(a, a.wallet, b.chapter_id, ctx.date);
    await this._putAcct(a);
    const out = await this._out(a, { wallet: publicWallet(a) }, flags, flags.giftChanged ? await this._giftStats(ctx) : null);
    if (!pre.ok) { out.ok = false; out.status = pre.status; out.error = pre.error; }
    return out;
  }
  async opChapterPost(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    if (!isValidChapterId(b.chapter_id)) return { ok: false, error: "bad_chapter", status: 400 };
    const r = chargeChapter(a, a.wallet, b.chapter_id);
    await this._putAcct(a);
    const out = await this._out(a, { wallet: publicWallet(a) }, null, null);
    if (!r.ok) { out.ok = false; out.status = r.status; out.error = r.error; }
    return out;
  }
  async opWalletCanAfford(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    const ctx = this._ctx(b);
    const flags = await this._tick(a, ctx);
    await this._putAcct(a);
    return this._out(a, { can: walletTotal(a.wallet) >= clampInt(b.n, 100), wallet: publicWallet(a) }, flags, null);
  }
  // 10.9.3.2：帳號有沒有購買紀錄(購買功能上線前永遠是false；沒有任何程式會把它改回false)
  async opIsPurchased(b) {
    const a = await this._auth(b.token, b.now);
    return { ok: true, purchased: !!(a && a.purchased) };
  }
  async opStats(b) {
    const ctx = this._ctx(b);
    const day = await this._day(ctx.date);
    const q = await this._get("gq", []);
    return { ok: true, date: ctx.date, verify_emails: day.verify, gifts_issued: day.gifts, gifts_queued: q.length };
  }
  // 十、10.13.7.3：人生代號清單——每個代號只記第一次／最後一次出現的台灣日期；同一天日期沒變就不寫入；永久保留
  async opLidSeen(b) {
    const lid = b.lid;
    if (typeof lid !== "string" || !/^[a-z0-9]{4,40}$/.test(lid) || !b.date) return { ok: false, error: "bad_lid" };
    await this._ensureLedgerStart(b.now);
    const rec = await this._get("p:" + lid, null);
    if (!rec) await this.storage.put("p:" + lid, { f: b.date, l: b.date });
    else if (rec.l !== b.date) { rec.l = b.date; await this.storage.put("p:" + lid, rec); }
    return { ok: true };
  }
  // 記下數據總覽功能開始運作的時間，用來分辨「上線前就有的帳號(沒有人生代號紀錄也計入)」與「上線後才建立、還沒玩過的帳號(不計)」
  async _ensureLedgerStart(now) {
    if (this._ledgerStart === undefined) this._ledgerStart = await this._get("ledger_start", null);
    if (this._ledgerStart === null && now) { this._ledgerStart = now; await this.storage.put("ledger_start", now); }
    return this._ledgerStart;
  }
  // 十、10.13.7.4／10.13.7.6：玩家人數。每次查詢直接從人生代號清單與帳號資料算出，不另外存加總。
  // b.dates＝要統計「每日新增」的台灣日期清單(近30天)，b.date＝今天，b.week_start＝近7天的第一天
  async opPlayerStats(b) {
    const ledgerStart = await this._ensureLedgerStart(b.now);
    const lids = new Map(); // 人生代號→{f,l}
    for (const [k, v] of await this.storage.list({ prefix: "p:" })) lids.set(k.slice(2), v);
    const owner = new Map(); // 人生代號→帳號
    const players = []; // {start,last,paid}
    for (const [, a] of await this.storage.list({ prefix: "a:" })) {
      const mine = new Set([...(a.everLids || []), ...(a.lives || []).map(l => l.lid)]);
      let start = null, last = null;
      for (const lid of mine) {
        owner.set(lid, a.aid);
        const r = lids.get(lid);
        if (!r) continue;
        if (start === null || r.f < start) start = r.f;
        if (last === null || r.l > last) last = r.l;
      }
      if (start === null) { // 還沒有任何人生代號紀錄：功能上線前就綁好的帳號才算(以帳號建立日期為開始日)，上線後才建立、還沒玩過的不算
        if (ledgerStart !== null && a.created >= ledgerStart) continue;
        start = taipeiDateString(a.created);
      }
      players.push({ start, last, paid: !!a.purchased });
    }
    for (const [lid, r] of lids) if (!owner.has(lid)) players.push({ start: r.f, last: r.l, paid: false }); // 未綁信箱：一個人生代號一位玩家
    const tally = paid => {
      const g = players.filter(p => p.paid === paid);
      return { total: g.length, today: g.filter(p => p.start === b.date).length, last7: g.filter(p => p.start >= b.week_start && p.start <= b.date).length };
    };
    const inRange = d => ({ total: 0, today: 0, last7: 0, add(x) { this.total++; if (x === b.date) this.today++; if (x >= b.week_start && x <= b.date) this.last7++; } });
    const bound = inRange(), started = inRange(); // 10.13.7.11：綁定信箱的帳號(以建立日期)、開啟的人生段數(以人生代號第一次出現日期)
    for (const [, a] of await this.storage.list({ prefix: "a:" })) bound.add(taipeiDateString(a.created));
    for (const [, r] of lids) started.add(r.f);
    const unbound = inRange(); // 10.13.7.11(2026-10-10)：沒綁信箱的人生段數＝從沒綁進任何帳號的人生代號(以第一次出現日期)；之後綁了信箱就改算進帳號，不再算這裡
    for (const [lid, r] of lids) if (!owner.has(lid)) unbound.add(r.f);
    const pick = o => ({ total: o.total, today: o.today, last7: o.last7 });
    const newByDate = {};
    for (const d of Array.isArray(b.dates) ? b.dates : []) newByDate[d] = players.filter(p => p.start === d).length;
    return {
      ok: true, free: tally(false), paid: tally(true),
      active: { today: players.filter(p => p.last === b.date).length, last7: players.filter(p => p.last && p.last >= b.week_start && p.last <= b.date).length },
      new_by_date: newByDate, accounts_bound: pick(bound), lives_started: pick(started), lives_unbound: pick(unbound)
    };
  }
  _ctx(b) {
    const nc = Number(b.new_cap), cp = Number(b.checkpoint);
    return { now: b.now, date: b.date, gift_cap: Number(b.gift_cap) > 0 ? Number(b.gift_cap) : 20,
      new_cap: Number.isFinite(nc) && nc >= 0 && b.new_cap !== undefined && b.new_cap !== null ? Math.floor(nc) : DEFAULT_NEW_PLAYER_CAP,
      checkpoint: Number.isFinite(cp) && cp > 0 ? Math.floor(cp) : DEFAULT_PLAYER_CHECKPOINT };
  }

  // ==================== 十、10.15 封測名額與候補 ====================
  // 狀態都放在這個Durable Object(不放KV)：
  //   en＝今天的名額帳{date, used已用, bonus前一天過期收回加上的名額, frozen當天一開始就已達檢查點(調高檢查點後隔天才恢復)}
  //   cum＝累計入場人數  carry＝待加進下次分配的收回名額  wq＝候補隊伍(帳號代號，依驗證通過先後)  wh＝持有位子的帳號(已分配／已通知／寄送失敗，還沒入場)
  //   ec:門牌＝這把金鑰已經佔過名額(重複呼叫不重複扣)  cpn＝檢查點通知信的寄送狀態
  // 帳號的wl欄：{status: waiting|allocated|notified|send_failed|entered|expired, joinedAt, allocatedAt, allocDate, tries, lastTry, sentAt, exp, enteredAt}
  async _whRemove(aid) { const wh = (await this._get("wh", [])).filter(x => x !== aid); await this.storage.put("wh", wh); }
  // 超過保留期的位子收回：狀態改已過期、累計減1、隔天可分配名額加1(帳號保留)
  async _expireSweep(ctx) {
    const wh = await this._get("wh", []);
    if (!wh.length) return;
    const keep = []; let freed = 0;
    for (const aid of wh) {
      const a = await this._acct(aid);
      if (!a || !a.wl || !WL_HOLD_STATUSES.includes(a.wl.status)) continue;
      if (a.wl.exp && ctx.now > a.wl.exp) { a.wl.status = "expired"; a.wl.expiredAt = ctx.now; await this._putAcct(a); freed++; }
      else keep.push(aid);
    }
    if (keep.length !== wh.length) await this.storage.put("wh", keep);
    if (freed) {
      await this.storage.put("cum", Math.max(0, (await this._get("cum", 0)) - freed));
      await this.storage.put("carry", (await this._get("carry", 0)) + freed);
    }
  }
  // 今天的名額帳；台灣時間每天第一次有人碰到時才做當天的分配(不用等排程，排程只負責寄信)
  async _entryDay(ctx) {
    await this._expireSweep(ctx);
    let en = await this._get("en", null);
    if (en && en.date === ctx.date) return en;
    const cum = await this._get("cum", 0), cap = ctx.new_cap, cp = ctx.checkpoint;
    const frozen = cum >= cp;
    let used = 0, bonus = 0;
    if (cap > 0 && !frozen) {
      const q = await this._get("wq", []), wh = await this._get("wh", []);
      bonus = await this._get("carry", 0);
      const limit = Math.min(cap + bonus, Math.max(0, cp - cum));
      while (used < limit && q.length) {
        const aid = q.shift();
        const a = await this._acct(aid);
        if (!a || !a.wl || a.wl.status !== "waiting") continue;
        a.wl.status = "allocated"; a.wl.allocatedAt = ctx.now; a.wl.allocDate = ctx.date; a.wl.tries = 0; a.wl.lastTry = 0;
        await this._putAcct(a); wh.push(aid); used++;
      }
      await this.storage.put("wq", q); await this.storage.put("wh", wh);
      await this.storage.put("cum", cum + used);
      await this.storage.put("carry", 0);
    }
    en = { date: ctx.date, used, bonus, frozen: frozen || cum + used >= cp }; // 當天一旦碰到檢查點就整天暫停，調高檢查點要等隔天00:00才恢復
    await this.storage.put("en", en);
    return en;
  }
  // 直接來的新玩家現在能不能入場：{open, reason('full'|'checkpoint'), remaining, total}
  async _direct(ctx, en) {
    const cum = await this._get("cum", 0), q = await this._get("wq", []);
    const total = ctx.new_cap + en.bonus, remaining = total - en.used;
    if (cum >= ctx.checkpoint || en.frozen) return { open: false, reason: "checkpoint", remaining: 0, total };
    if (q.length > 0 || remaining <= 0) return { open: false, reason: "full", remaining: Math.max(0, remaining), total };
    return { open: true, reason: null, remaining, total };
  }
  // 檢查點通知信：累計入場達檢查點時交給呼叫端寄一次(每個檢查點數字各一次，防重複與重試比照10.9.3.1a：最多3次、寄送中60秒內不重複交出)
  async _cpDue(ctx) {
    const cum = await this._get("cum", 0);
    if (cum < ctx.checkpoint) return null;
    let n = await this._get("cpn", null);
    if (!n || n.cp !== ctx.checkpoint) n = { cp: ctx.checkpoint, sent: false, attempts: 0, lease: 0 };
    if (n.sent || n.attempts >= CP_NOTICE_MAX_ATTEMPTS || ctx.now < n.lease) return null;
    n.attempts += 1; n.lease = ctx.now + CP_NOTICE_LEASE_MS;
    await this.storage.put("cpn", n);
    return { cum, checkpoint: ctx.checkpoint, queued: (await this._get("wq", [])).length, now: ctx.now };
  }
  async opCpResult(b) {
    const n = await this._get("cpn", null);
    if (n && n.cp === Number(b.checkpoint)) { if (b.ok) n.sent = true; else n.lease = 0; await this.storage.put("cpn", n); }
    return { ok: true };
  }
  // 給前端／管理端的候補狀態：目前排第幾位、位子保留到什麼時候、過期後現在能不能直接入場
  async _wlView(a) {
    const ctx = this._ctx(this._b || {});
    const w = a.wl;
    const out = { status: w.status, exp: w.exp || null, position: null, can_direct: false };
    if (w.status === "waiting") { const q = await this._get("wq", []); const i = q.indexOf(a.aid); out.position = i >= 0 ? i + 1 : null; }
    if (w.status === "expired") { const en = await this._entryDay(ctx); out.can_direct = (await this._direct(ctx, en)).open; }
    if (WL_HOLD_STATUSES.includes(w.status)) out.gift_full = (await this._day(ctx.date)).gifts >= ctx.gift_cap; // 第13則：當天啟程禮已發滿，30點排到隔天
    return out;
  }
  _entryView(ctx, en, d, cum) {
    return { cap: ctx.new_cap, total: d.total, used: en.used, remaining: d.remaining, open: d.open, reason: d.reason, cum, checkpoint: ctx.checkpoint };
  }
  // 開始畫面：現在有沒有名額(不扣名額)
  async opEntryStatus(b) {
    const ctx = this._ctx(b);
    const en = await this._entryDay(ctx), d = await this._direct(ctx, en), cum = await this._get("cum", 0);
    return { ok: true, entry: this._entryView(ctx, en, d, cum), queue: (await this._get("wq", [])).length, notice: await this._cpDue(ctx) };
  }
  // 未綁信箱的25點啟程禮實際要發的那一刻：名額夠就扣1(累計加1)，同一把金鑰(門牌)重複呼叫不重複扣；不夠就拒絕
  async opEntryClaim(b) {
    const ctx = this._ctx(b);
    const loc = typeof b.loc === "string" && /^[0-9a-f]{64}$/.test(b.loc) ? b.loc : null;
    if (!loc) return { ok: false, error: "bad_key" };
    const en = await this._entryDay(ctx);
    if (await this._get("ec:" + loc, null)) {
      const d0 = await this._direct(ctx, en);
      return { ok: true, repeat: true, entry: this._entryView(ctx, en, d0, await this._get("cum", 0)) };
    }
    const d = await this._direct(ctx, en);
    if (!d.open) return { ok: false, error: d.reason === "checkpoint" ? "checkpoint" : "full", entry: this._entryView(ctx, en, d, await this._get("cum", 0)), notice: await this._cpDue(ctx) };
    en.used += 1;
    const cum = (await this._get("cum", 0)) + 1; await this.storage.put("cum", cum);
    if (cum >= ctx.checkpoint) en.frozen = true;
    await this.storage.put("en", en);
    await this.storage.put("ec:" + loc, { at: ctx.now });
    const d2 = await this._direct(ctx, en);
    return { ok: true, entry: this._entryView(ctx, en, d2, cum), notice: await this._cpDue(ctx) };
  }
  // 留信箱候補：驗證碼通過→建立沒有人生的帳號並排入隊伍(10.15.4)。名額還開著就不用候補(not_full)；信箱已有帳號＝email_exists(沿用現有提示)
  async opWlJoin(b) {
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) return { ok: false, error: "invalid_email" };
    const ctx = this._ctx(b);
    const chk = await this._checkCode(email, b.code, b.now);
    if (!chk.ok) return chk;
    if (await this._get("e:" + email, null)) return { ok: false, error: "email_exists" };
    const key = typeof b.key === "string" && b.key.length > 0 && b.key.length <= 100 ? b.key : null;
    const loc = typeof b.loc === "string" && /^[0-9a-f]{64}$/.test(b.loc) ? b.loc : null;
    if (!key || !loc) return { ok: false, error: "bad_key" };
    if (await this._get("kl:" + loc, null)) return { ok: false, error: "key_linked" }; // 同綁定：一個信箱一把金鑰，這把金鑰也不能綁兩個信箱
    if (!(await this._get("loc:off", false)) && await this._get("k:" + key, null)) return { ok: false, error: "key_linked" };
    const en = await this._entryDay(ctx);
    if ((await this._direct(ctx, en)).open) return { ok: false, error: "not_full" };
    const a = { aid: randomHex(8), email, key, created: b.now, purchased: false, wallet: freshWallet(b.date), refillDate: b.date,
      lives: [], gifts: { g1: "none", g2: "none" }, events: [], sessions: [], carried: 0,
      wl: { status: "waiting", joinedAt: b.now } };
    const token = await this._newSession(a, b.now);
    await this._putAcct(a);
    await this.storage.put("e:" + email, a.aid);
    await this.storage.put("kl:" + loc, a.aid);
    const q = await this._get("wq", []); q.push(a.aid); await this.storage.put("wq", q);
    return this._out(a, { token, result: { kind: "waitlist", position: q.length } }, null, null);
  }
  // 已過期的候補玩家：當天還有開放給直接來的名額＝直接入場(佔一個名額)
  async opWlDirect(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    const ctx = this._ctx(b);
    await this._tick(a, ctx);
    if (!a.wl || a.wl.status !== "expired") return { ok: false, error: "bad_request" };
    const en = await this._entryDay(ctx), d = await this._direct(ctx, en);
    if (!d.open) { await this._putAcct(a); return { ok: false, error: d.reason === "checkpoint" ? "checkpoint" : "full" }; }
    en.used += 1;
    const cum2 = (await this._get("cum", 0)) + 1; await this.storage.put("cum", cum2);
    if (cum2 >= ctx.checkpoint) en.frozen = true;
    await this.storage.put("en", en);
    a.wl.status = "notified"; a.wl.sentAt = b.now; a.wl.exp = b.now + WL_HOLD_MS; a.wl.direct = true;
    const wh = await this._get("wh", []); wh.push(a.aid); await this.storage.put("wh", wh);
    return this._out(a, { notice: await this._cpDue(ctx) }, null, null);
  }
  // 已過期的候補玩家按〔重新候補〕：排到隊伍最後，不用重新驗證
  async opWlRequeue(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    const ctx = this._ctx(b);
    await this._tick(a, ctx);
    if (!a.wl || a.wl.status !== "expired") return { ok: false, error: "bad_request" };
    a.wl.status = "waiting"; a.wl.joinedAt = b.now; a.wl.exp = null;
    const q = await this._get("wq", []); q.push(a.aid); await this.storage.put("wq", q);
    return this._out(a, {}, null, null);
  }
  // 排程每小時呼叫：①順便做當天分配與過期 ②找出該寄通知信的人(分配當天台灣時間中午12:00起；失敗每小時重試，最多3次) ③檢查點通知信
  async opWlDue(b) {
    const ctx = this._ctx(b);
    await this._entryDay(ctx);
    const due = [];
    for (const aid of await this._get("wh", [])) {
      const a = await this._acct(aid);
      if (!a || !a.wl || a.wl.status !== "allocated") continue;
      const noon = Date.parse(a.wl.allocDate + "T12:00:00+08:00");
      if (ctx.now < noon) continue;
      if ((a.wl.tries || 0) >= WL_MAIL_MAX_TRIES) continue;
      if (a.wl.tries > 0 && ctx.now - (a.wl.lastTry || 0) < WL_MAIL_RETRY_GAP_MS) continue;
      due.push({ aid, email: a.email, tries: a.wl.tries || 0 });
    }
    return { ok: true, due, notice: await this._cpDue(ctx) };
  }
  // 通知信寄送結果：成功→已通知，保留期從這一刻起算；失敗→記一次，3次都失敗＝寄送失敗，保留期從最後一次嘗試起算
  async opWlMailResult(b) {
    const a = await this._acct(b.aid);
    if (!a || !a.wl || a.wl.status !== "allocated") return { ok: true };
    a.wl.tries = (a.wl.tries || 0) + 1; a.wl.lastTry = b.now;
    if (b.ok) { a.wl.status = "notified"; a.wl.sentAt = b.now; a.wl.exp = b.now + WL_HOLD_MS; }
    else if (a.wl.tries >= WL_MAIL_MAX_TRIES) { a.wl.status = "send_failed"; a.wl.exp = b.now + WL_HOLD_MS; }
    await this._putAcct(a);
    return { ok: true, status: a.wl.status, exp: a.wl.exp || null };
  }
  // 數據網頁的名額卡片(10.15.6)：只有數字
  async opEntryStats(b) {
    const ctx = this._ctx(b);
    const en = await this._entryDay(ctx);
    let notified = 0;
    for (const aid of await this._get("wh", [])) { const a = await this._acct(aid); if (a && a.wl && WL_HOLD_STATUSES.includes(a.wl.status)) notified++; }
    return { ok: true, used: en.used, cap: ctx.new_cap, bonus: en.bonus, cum: await this._get("cum", 0), checkpoint: ctx.checkpoint,
      waiting: (await this._get("wq", [])).length, notified };
  }
}

const OPS = {
  send_code_reserve: AccountStore.prototype.opSendCodeReserve,
  send_code_release: AccountStore.prototype.opSendCodeRelease,
  bind: AccountStore.prototype.opBind,
  login: AccountStore.prototype.opLogin,
  logout: AccountStore.prototype.opLogout,
  me: AccountStore.prototype.opMe,
  change_email: AccountStore.prototype.opChangeEmail,
  attach_lives: AccountStore.prototype.opAttachLives,
  consent: AccountStore.prototype.opConsent,
  save_index_put: AccountStore.prototype.opSaveIndexPut,
  save_index_list: AccountStore.prototype.opSaveIndexList,
  save_index_get: AccountStore.prototype.opSaveIndexGet,
  legacy_index_at: AccountStore.prototype.opLegacyIndexAt,
  acct_keys: AccountStore.prototype.opAcctKeys,
  kl_sync: AccountStore.prototype.opKlSync,
  kl_has: AccountStore.prototype.opKlHas,
  loc_counts: AccountStore.prototype.opLocCounts,
  loc_state: AccountStore.prototype.opLocState,
  loc_set: AccountStore.prototype.opLocSet,
  loc_fb_hit: AccountStore.prototype.opLocFbHit,
  loc_purge_legacy: AccountStore.prototype.opLocPurgeLegacy,
  save_index_del: AccountStore.prototype.opSaveIndexDel,
  pack_rate: AccountStore.prototype.opPackRate,
  roster: AccountStore.prototype.opRoster,
  admin_log_add: AccountStore.prototype.opAdminLogAdd,
  admin_log_list: AccountStore.prototype.opAdminLogList,
  life_add: AccountStore.prototype.opLifeAdd,
  life_remove: AccountStore.prototype.opLifeRemove,
  wallet_pre: AccountStore.prototype.opWalletPre,
  wallet_post: AccountStore.prototype.opWalletPost,
  wallet_spend: AccountStore.prototype.opWalletSpend,
  wallet_refund: AccountStore.prototype.opWalletRefund,
  purge_abuse: AccountStore.prototype.opPurgeAbuse,
  wallet_can_afford: AccountStore.prototype.opWalletCanAfford,
  chapter_pre: AccountStore.prototype.opChapterPre,
  chapter_post: AccountStore.prototype.opChapterPost,
  is_purchased: AccountStore.prototype.opIsPurchased,
  stats: AccountStore.prototype.opStats,
  lid_seen: AccountStore.prototype.opLidSeen,
  player_stats: AccountStore.prototype.opPlayerStats,
  entry_status: AccountStore.prototype.opEntryStatus,
  entry_claim: AccountStore.prototype.opEntryClaim,
  entry_stats: AccountStore.prototype.opEntryStats,
  wl_join: AccountStore.prototype.opWlJoin,
  wl_direct: AccountStore.prototype.opWlDirect,
  wl_requeue: AccountStore.prototype.opWlRequeue,
  wl_due: AccountStore.prototype.opWlDue,
  wl_mail_result: AccountStore.prototype.opWlMailResult,
  cp_result: AccountStore.prototype.opCpResult
};
