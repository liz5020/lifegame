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

import { AP_BIND_BONUS, AP_SECOND_LIFE_GIFT, AP_LEGACY_GIFT_MAX, AP_DAILY_REFILL, freshRecord, preCharge, postCharge, spend, refund } from "./ap.js";

export const CODE_TTL_MS = 10 * 60 * 1000;        // 10.2：驗證碼10分鐘內有效
export const CODE_MAX_TRIES = 5;                  // 10.2：同一組輸錯5次作廢
export const RESEND_GAP_MS = 60 * 1000;           // 10.2.1：同一信箱重寄間隔60秒
export const EMAIL_HOURLY_MAX = 5;                // 10.2.1：同一信箱每小時最多5封
export const IP_HOURLY_MAX = 10;                  // 10.2.1：同一網路位址每小時最多10封
export const DEFAULT_DAILY_VERIFY_EMAIL_CAP = 80; // 10.2.1：全站每日最多寄80封驗證信(環境變數DAILY_VERIFY_EMAIL_CAP)
export const SESSION_TTL_MS = 90 * 24 * 3600 * 1000; // 10.2：登入保持90天，每次使用往後延長
export const MAX_SESSIONS_PER_ACCOUNT = 20;
export const ACCOUNT_LIFE_MAX = 2;                // 10.9.2：綁定信箱可有2段人生
export const GIFTS_PER_ACCOUNT = 2;               // 10.9.3：每個信箱最多2份啟程禮
export const GIFT_POINTS = { 1: AP_BIND_BONUS, 2: AP_SECOND_LIFE_GIFT }; // 第1份(綁定)+30點、第2份(開第2段人生)+55點；2026-09-30第三批：第1份由「補到55點」改固定+30
export const CARRY_MAX_TOTAL = 120;               // 綁定／併入時，未綁人生帶過來的點數累計上限(封測期間本機點數玩家改得動，這裡只擋離譜的數字)
const POOL_DAILY_MAX = AP_DAILY_REFILL, POOL_GIFT_MAX = AP_LEGACY_GIFT_MAX;
const EVENTS_MAX = 30;

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
    const run = this._chain.then(() => fn.call(this, body));
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
    return Object.assign({
      ok: true, account: this._public(a), events,
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
  async opSendCodeRelease(b) {
    const email = normalizeEmail(b.email), ip = String(b.ip || "unknown").slice(0, 80);
    const eTimes = await this._get("le:" + email, []); eTimes.pop(); await this.storage.put("le:" + email, eTimes);
    const iTimes = await this._get("li:" + ip, []); iTimes.pop(); await this.storage.put("li:" + ip, iTimes);
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
    if (!key) return { ok: false, error: "bad_key" };
    if (await this._get("k:" + key, null)) return { ok: false, error: "key_linked" }; // 一個信箱只能綁一把金鑰，這把金鑰也不能綁兩個信箱
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
    await this.storage.put("k:" + key, a.aid);
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
    const slot = freeSlot(a);
    a.lives.push({ lid: b.lid, slot });
    let gift = null;
    if (a.lives.length === ACCOUNT_LIFE_MAX && a.gifts.g2 === "none") gift = await this._requestGift(a, 2, ctx, flags);
    await this._putAcct(a);
    return this._out(a, { result: { kind: "life_add", slot, gift } }, flags, flags.giftChanged ? await this._giftStats(ctx) : null);
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
    const pre = preCharge(a.wallet, { nonce: b.nonce, isPrologue: !!b.is_prologue, lifeId: b.life_id });
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
    const n = clampInt(b.n, 50);
    if (n <= 0) return { ok: false, error: "bad_amount", status: 400 };
    if (walletTotal(a.wallet) < n) return this._out(a, { ok: false, status: 402, error: { type: "insufficient_action_points", message: "行動點不足" }, wallet: publicWallet(a) }, flags, null);
    spend(a.wallet, n);
    await this._putAcct(a);
    return this._out(a, { wallet: publicWallet(a) }, flags, null);
  }
  async opWalletCanAfford(b) {
    const a = await this._auth(b.token, b.now);
    if (!a) return { ok: false, error: "unauthorized", status: 401 };
    const ctx = this._ctx(b);
    const flags = await this._tick(a, ctx);
    await this._putAcct(a);
    return this._out(a, { can: walletTotal(a.wallet) >= clampInt(b.n, 50), wallet: publicWallet(a) }, flags, null);
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
  _ctx(b) { return { now: b.now, date: b.date, gift_cap: Number(b.gift_cap) > 0 ? Number(b.gift_cap) : 20 }; }
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
  life_add: AccountStore.prototype.opLifeAdd,
  life_remove: AccountStore.prototype.opLifeRemove,
  wallet_pre: AccountStore.prototype.opWalletPre,
  wallet_post: AccountStore.prototype.opWalletPost,
  wallet_spend: AccountStore.prototype.opWalletSpend,
  wallet_can_afford: AccountStore.prototype.opWalletCanAfford,
  is_purchased: AccountStore.prototype.opIsPurchased,
  stats: AccountStore.prototype.opStats
};
