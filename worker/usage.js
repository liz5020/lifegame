// 2026-09-25新增（佇列批次3：每回合token用量紀錄／成本遙測，設計文件十、10.5）
// 目的：算出「一條人生平均花多少錢」，作為行動點定價依據。
// KV只存token數，花費在讀取時才用下面的單價換算——之後改價只要改這裡的常數，舊資料會自動用新單價重算。
// 紀錄失敗絕對不能影響回合本身：recordUsage()整段try/catch吞掉錯誤，並透過ctx.waitUntil在回應送出後才寫

// 【單價】Claude Sonnet 5，美元／每百萬token。查詢日期：2026-09-25，來源：Anthropic官網定價頁
// https://platform.claude.com/docs/en/about-claude/pricing （Input $2、5分鐘快取寫入$2.5、快取讀取$0.2、Output $10）
// 我們的prompt caching用的是預設5分鐘快取(cache_control: ephemeral)，所以快取寫入用5分鐘的價格
export const PRICE_CHECKED_ON = "2026-09-25";
export const PRICE_MODEL = "claude-sonnet-5";
export const PRICE_PER_MTOK_USD = {
  input: 2.0,
  cache_write: 2.5,
  cache_read: 0.2,
  output: 10.0
};

export const USAGE_CATEGORIES = ["turn", "chapter"];

function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }

// 從Anthropic回應的usage抽出四種token數
export function extractUsage(u) {
  u = u || {};
  return {
    input: num(u.input_tokens),
    cache_write: num(u.cache_creation_input_tokens),
    cache_read: num(u.cache_read_input_tokens),
    output: num(u.output_tokens)
  };
}
export function costUSD(t) {
  const p = PRICE_PER_MTOK_USD;
  return (num(t.input) * p.input + num(t.cache_write) * p.cache_write + num(t.cache_read) * p.cache_read + num(t.output) * p.output) / 1e6;
}
export function cacheHitRate(t) {
  const all = num(t.input) + num(t.cache_write) + num(t.cache_read);
  return all > 0 ? num(t.cache_read) / all : 0;
}
function emptyBucket() { return { calls: 0, turns: 0, input: 0, cache_write: 0, cache_read: 0, output: 0 }; }
function addTo(bucket, t, countsAsTurn) {
  bucket.calls += 1;
  if (countsAsTurn) bucket.turns += 1;
  bucket.input += t.input; bucket.cache_write += t.cache_write; bucket.cache_read += t.cache_read; bucket.output += t.output;
}
function emptyRecord() { const r = {}; USAGE_CATEGORIES.forEach(c => r[c] = emptyBucket()); r.max_payload_chars = 0; return r; }
function normalize(rec) {
  const r = Object.assign(emptyRecord(), rec || {});
  USAGE_CATEGORIES.forEach(c => { r[c] = Object.assign(emptyBucket(), r[c] || {}); });
  return r;
}

export function lifeUsageKey(key, slot, lifeId) { return "usage:life:" + key + ":" + slot + ":" + (lifeId || "unknown"); }
export function dayUsageKey(taipeiDate) { return "usage:day:" + taipeiDate; }

// category: "turn"或"chapter"；countsAsTurn: 這次呼叫是不是一個新回合(重試/重新生成不算)；payloadChars: 請求字數
export async function recordUsage(env, { key, slot, lifeId, category, usage, countsAsTurn, payloadChars, taipeiDate }) {
  try {
    if (!USAGE_CATEGORIES.includes(category)) return;
    const t = extractUsage(usage);
    // (a) 每把金鑰＋slot＋這一世的累計
    const lk = lifeUsageKey(key, slot, lifeId);
    const life = normalize(JSON.parse((await env.SAVES.get(lk)) || "null"));
    addTo(life[category], t, countsAsTurn);
    life.max_payload_chars = Math.max(life.max_payload_chars, num(payloadChars));
    life.updated = taipeiDate;
    // metadata讓/usage-summary用list一次讀完，不用逐筆get(KV metadata上限1024 bytes，只放數字)
    const meta = {
      t: life.turn.turns, c: life.turn.calls, i: life.turn.input, w: life.turn.cache_write, r: life.turn.cache_read, o: life.turn.output,
      ci: life.chapter.input, cw: life.chapter.cache_write, cr: life.chapter.cache_read, co: life.chapter.output, cc: life.chapter.calls
    };
    await env.SAVES.put(lk, JSON.stringify(life), { metadata: meta });
    // (b) 每日全站合計(台灣日期)
    const dk = dayUsageKey(taipeiDate);
    const day = normalize(JSON.parse((await env.SAVES.get(dk)) || "null"));
    addTo(day[category], t, countsAsTurn);
    day.max_payload_chars = Math.max(day.max_payload_chars, num(payloadChars));
    await env.SAVES.put(dk, JSON.stringify(day));
  } catch (e) {
    // 遙測失敗不影響遊戲
    try { console.warn("usage record failed", String(e)); } catch (_) {}
  }
}

function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }
function describe(b) {
  const cost = costUSD(b);
  return {
    calls: b.calls, turns: b.turns,
    tokens: { input: b.input, cache_write: b.cache_write, cache_read: b.cache_read, output: b.output },
    cost_usd: round(cost, 4),
    avg_cost_per_turn_usd: b.turns > 0 ? round(cost / b.turns, 5) : null,
    cache_hit_rate: round(cacheHitRate(b), 4)
  };
}
function sumBuckets(list) {
  const out = emptyBucket();
  list.forEach(b => { for (const k of Object.keys(out)) out[k] += num(b[k]); });
  return out;
}
function addDays(dateStr, delta) {
  const d = new Date(dateStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10);
}

export async function buildUsageSummary(env, todayTaipei) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(todayTaipei, -i);
    days.push({ date, rec: normalize(JSON.parse((await env.SAVES.get(dayUsageKey(date))) || "null")) });
  }
  const today = days[0].rec;
  const perCategory = (recs) => {
    const o = {};
    USAGE_CATEGORIES.forEach(c => { o[c] = describe(sumBuckets(recs.map(r => r[c]))); });
    const all = sumBuckets(recs.map(r => sumBuckets(USAGE_CATEGORIES.map(c => r[c]))));
    all.turns = sumBuckets(recs.map(r => r.turn)).turns; // 「每回合」只算一般回合數
    o.all = describe(all);
    return o;
  };
  // 每條人生(全期間)：用list的metadata加總
  const lives = [];
  let cursor;
  do {
    const page = await env.SAVES.list({ prefix: "usage:life:", cursor });
    page.keys.forEach(k => lives.push(k.metadata || {}));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const played = lives.filter(m => num(m.t) > 0);
  const lifeCost = (m) => costUSD({ input: m.i, cache_write: m.w, cache_read: m.r, output: m.o }) + costUSD({ input: m.ci, cache_write: m.cw, cache_read: m.cr, output: m.co });
  const totalLifeCost = played.reduce((s, m) => s + lifeCost(m), 0);
  const totalLifeTurns = played.reduce((s, m) => s + num(m.t), 0);
  return {
    success: true,
    price: { model: PRICE_MODEL, checked_on: PRICE_CHECKED_ON, per_mtok_usd: PRICE_PER_MTOK_USD },
    today: Object.assign({ date: days[0].date, max_payload_chars: today.max_payload_chars }, perCategory([today])),
    last_7_days: Object.assign({ from: days[6].date, to: days[0].date, max_payload_chars: Math.max(...days.map(d => d.rec.max_payload_chars)) }, perCategory(days.map(d => d.rec))),
    per_life: {
      lives_counted: played.length,
      note: "全期間、每條人生(含還在進行中的)的累計；含章節成書的花費。進行中的人生會拉低平均，等封存的人生變多後再看比較準",
      avg_turns_per_life: played.length ? round(totalLifeTurns / played.length, 1) : null,
      avg_cost_per_life_usd: played.length ? round(totalLifeCost / played.length, 4) : null,
      avg_cost_per_turn_usd: totalLifeTurns ? round(totalLifeCost / totalLifeTurns, 5) : null
    }
  };
}

// 定時比對管理密碼(避免逐字比對洩漏長度以外的資訊)
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
