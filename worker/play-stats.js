// 十、10.13.7.12（2026-10-10）：數據網頁「玩家怎麼玩」分頁——從AI實際用量逐筆明細(10.14.7，最近7天、最多30,000筆)算出的玩家行為分析。
// 只在打開那一頁時算；不另外存任何資料，不碰KV。人生以明細裡的匿名人生代號(雜湊)區分，不含信箱或存檔內容。
// range：today＝今天(台灣日期)開局的人生；yesterday＝昨天開局的人生(10.13.7.14)；7d＝明細裡所有人生(最近7天)。時間分組：today／yesterday每小時、7d每天。
const HOUR = 3600000;
const ACTIVE_MS = 10 * 60000; // 最後一次呼叫在10分鐘內＝還在玩
// 離開時停在哪：前面細一點(只有開場、第2、3～4、5～9)，第10回合起每10回合一格，100回合以上併成一格；後面沒有人的格子不顯示(computePlayStats裡截掉)
const STOP_BUCKETS = [[0, 1, "只有開場"], [2, 2, "第 2 回合"], [3, 4, "第 3～4 回合"], [5, 9, "第 5～9 回合"]]
  .concat(Array.from({ length: 9 }, (_, i) => [10 + i * 10, 19 + i * 10, "第 " + (10 + i * 10) + "～" + (19 + i * 10) + " 回合"]))
  .concat([[100, 1e9, "第 100 回合以上"]]);
const SESSION_GAP_MS = 30 * 60000; // 10.13.7.14：「一次遊玩」＝中間沒有停超過30分鐘的一段
const tw = (t) => new Date(t + 8 * HOUR).toISOString(); // 台灣時間的ISO字串(只拿來切日期與時段)
const dayBefore = (d) => new Date(Date.parse(d + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
const medianOf = (arr) => { const a = arr.slice().sort((x, y) => x - y); if (!a.length) return null; return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
const meanOf = (arr) => arr.length ? arr.reduce((t, x) => t + x, 0) / arr.length : null;
// 10.13.7.14：重寫原因(第1類代碼，一、1.2.9.18.1)的白話說法；明細與下載檔仍是代碼
export const REGEN_REASON_LABELS = { "空白": "正文空白", "少一段": "少了一段(行動結果或新場景)", "過短": "正文少於40字", "欄位名稱": "正文出現資料欄位名稱",
  "節日": "節日放錯日子", "日期": "新場景日期不在範圍內", "花費": "剛決定的花費沒寫到", "興趣": "指定的興趣沒寫到", "約定": "到期的約定沒交代" };
// 重寫原因歸類(2026-10-10)：依序比對，第一個符合的類別；樣本少時關鍵字之後再調
export const REGEN_CATS = [["日期、星期、節日寫錯", /除夕|星期|節|日期|time_context|這段時間/], ["該寫的事沒寫到", /決定|沒有寫進|約定|到期|買了|付了|花費|興趣|交代|要寫出/], ["寫得不完整", /沒寫完|結尾|太短|過短|偏短|空白|少一段|少了|不完整/], ["格式、用詞不合", /欄位|標點|引號|冒號|舞台|格式/]];
export function classifyRegen(text) { for (const [name, re] of REGEN_CATS) if (re.test(text)) return name; return "其他"; }
// 每段人生第一次出現的時間(明細只留7天，7天前開局的人生會被當成明細裡第一筆那天開局)
function firstSeen(all) { const first = new Map(); for (const r of all) if (r.life && !first.has(r.life)) first.set(r.life, r.t); return first; }
function maxTurns(rows) { const m = new Map(); for (const r of rows) if (r.life && r.k === "turn" && typeof r.turn === "number") m.set(r.life, Math.max(m.get(r.life) || 0, r.turn)); return m; }

export function computePlayStats(rows, now, range, usdToTwd) {
  const rate = usdToTwd || 32;
  const today = tw(now).slice(0, 10);
  const all = (rows || []).filter(r => r && typeof r.t === "number").sort((a, b) => a.t - b.t);
  range = range === "7d" || range === "yesterday" ? range : "today";
  const first = firstSeen(all);
  const day = range === "yesterday" ? dayBefore(today) : today;
  const inRange = (t) => range === "7d" || tw(t).slice(0, 10) === day;
  const lives = new Set([...first].filter(([, t]) => inRange(t)).map(([l]) => l));
  const R = all.filter(r => r.life && lives.has(r.life));
  const bucketOf = (t) => range === "7d" ? tw(t).slice(5, 10).replace("-", "/") : tw(t).slice(11, 13) + ":00";

  // 每段人生：最後玩到的回合(一般回合裡最大的回合編號)、最後一次呼叫時間
  const maxTurn = new Map(), last = new Map();
  for (const r of R) {
    last.set(r.life, r.t);
    if (r.k === "turn" && typeof r.turn === "number") maxTurn.set(r.life, Math.max(maxTurn.get(r.life) || 0, r.turn));
  }
  const mt = (l) => maxTurn.get(l) || 0;
  const active = (l) => now - last.get(l) <= ACTIVE_MS;
  const ids = [...lives];
  const sorted = ids.map(mt).sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;

  // 回合編號照遊戲畫面：開場是第1回合，玩家第一次送出行動是第2回合
  // 漏斗：玩到第N回合以上的人生數(N＝2～最多60)；繼續比例：玩到第N回合的人生裡，有玩到第N+1回合的比例(N＝2～59，頁面用捲動視窗顯示)
  const top = Math.min(60, sorted.length ? sorted[sorted.length - 1] : 0);
  const funnel = [];
  for (let n = 2; n <= top; n++) funnel.push({ turn: n, lives: ids.filter(l => mt(l) >= n).length });
  const continuation = [];
  for (let n = 2; n <= Math.min(59, top - 1); n++) {
    const reach = ids.filter(l => mt(l) >= n), cont = reach.filter(l => mt(l) >= n + 1);
    // 還在玩、而且剛好停在第N回合的人生還沒決定要不要繼續，不算進分母
    const decided = reach.filter(l => mt(l) > n || !active(l));
    if (decided.length) continuation.push({ turn: n, rate: Math.round(cont.length / decided.length * 1000) / 1000, n: decided.length });
  }
  // 離開時停在哪裡：最後10分鐘沒有呼叫的人生
  const left = ids.filter(l => !active(l));
  let stops = STOP_BUCKETS.map(([lo, hi, label]) => ({ label, lives: left.filter(l => mt(l) >= lo && mt(l) <= hi).length }));
  let lastFull = stops.length - 1; while (lastFull > 3 && !stops[lastFull].lives) lastFull--; // 前4格固定顯示(網頁的白話說明要讀前兩格)，後面沒有人的格子截掉
  stops = stops.slice(0, lastFull + 1);

  // 10.13.7.14：跟前一段比(今天比昨天、昨天比前天；近7天不比)
  let prev = null;
  if (range !== "7d") {
    const pd = dayBefore(day), pLives = [...first].filter(([, t]) => tw(t).slice(0, 10) === pd).map(([l]) => l);
    const pm = maxTurns(all.filter(r => r.life && pLives.includes(r.life)));
    const p10 = pLives.filter(l => (pm.get(l) || 0) >= 10).length;
    prev = { date: pd, lives: pLives.length, reach10_rate: pLives.length ? Math.round(p10 / pLives.length * 1000) / 1000 : null };
  }
  // 10.13.7.14：玩多久、等多久、有沒有回來
  const byLife = new Map();
  for (const r of R) { if (!byLife.has(r.life)) byLife.set(r.life, []); byLife.get(r.life).push(r); }
  const sessions = [], gaps = [], waitTurn = [], waitOpen = [], waitRetry = [];
  let revisit = 0, revisitBase = 0;
  for (const [l, rs] of byLife) {
    let s0 = rs[0].t, prevT = rs[0].t, prevTurnT = null;
    for (const r of rs) {
      if (r.t - prevT > SESSION_GAP_MS) { sessions.push(prevT - s0); s0 = r.t; prevTurnT = null; }
      if (r.k === "turn") { if (prevTurnT !== null) gaps.push(r.t - prevTurnT); prevTurnT = r.t; }
      prevT = r.t;
      if (typeof r.ms === "number") (r.k === "turn" ? waitTurn : r.k === "opening" ? waitOpen : r.k === "retry" ? waitRetry : []).push(r.ms);
    }
    sessions.push(prevT - s0);
    // 隔天又回來玩：開局那天(台灣日期)以後還有呼叫；今天開局的人生還算不出來
    const d0 = tw(first.get(l)).slice(0, 10);
    if (d0 < today) { revisitBase++; if (rs.some(r => tw(r.t).slice(0, 10) > d0)) revisit++; }
  }
  const sec1 = (ms) => ms == null ? null : Math.round(ms / 100) / 10;
  const reached = (n) => ids.filter(l => mt(l) >= n);
  // 依時段：新開局、一般回合、重寫、花費、有呼叫的人生數
  const buckets = new Map();
  const B = (k) => { if (!buckets.has(k)) buckets.set(k, { bucket: k, new_lives: 0, turns: 0, retries: 0, twd: 0, lives: new Set() }); return buckets.get(k); };
  for (const l of ids) B(bucketOf(first.get(l))).new_lives++;
  const byKind = {};
  let turns = 0, retries = 0, twd = 0, twdNoRetry = 0;
  for (const r of R) {
    const b = B(bucketOf(r.t)), c = (Number(r.usd) || 0) * rate;
    b.twd += c; b.lives.add(r.life); twd += c;
    if (r.k === "turn") { b.turns++; turns++; }
    if (r.k === "retry") { b.retries++; retries++; } else twdNoRetry += c;
    byKind[r.k] = byKind[r.k] || { calls: 0, twd: 0 };
    byKind[r.k].calls++; byKind[r.k].twd += c;
  }
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
  // 自由書寫比例(2026-10-10起才有標記)：一般回合的第一筆帶fi＝f(自己寫)或c(點選項)；沒標記的舊資料不算進分母
  let freeN = 0, choiceN = 0; const freeLives = new Set(), markedLives = new Set();
  for (const r of R) if (r.k === "turn" && (r.fi === "f" || r.fi === "c")) { markedLives.add(r.life); if (r.fi === "f") { freeN++; freeLives.add(r.life); } else choiceN++; }
  const markedN = freeN + choiceN;
  const timeline = [...buckets.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1)).map(b => ({
    bucket: b.bucket, new_lives: b.new_lives, turns: b.turns, retries: b.retries,
    retry_rate: b.turns ? Math.round(b.retries / b.turns * 1000) / 1000 : null, twd: r1(b.twd), lives: b.lives.size }));
  const reasons = {};
  for (const r of R) if (r.k === "retry" && r.rr) for (const c of String(r.rr).split("、")) if (c) reasons[c] = (reasons[c] || 0) + 1;
  // 重寫原因分類：一筆重寫只算一類(依序比對整句)，原因是AI自己寫的整句話，不再用「、」切碎
  const catCount = {}, catEx = {};
  for (const r of R) if (r.k === "retry" && r.rr) { const c = classifyRegen(String(r.rr)), t = String(r.rr).slice(0, 60); catCount[c] = (catCount[c] || 0) + 1; ((catEx[c] = catEx[c] || {})[t] = (catEx[c][t] || 0) + 1); }
  const retry_cats = Object.entries(catCount).map(([cat, n]) => ({ cat, n, examples: Object.entries(catEx[cat]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, k]) => ({ t, n: k })) })).sort((a, b) => b.n - a.n).slice(0, 5);
  // 每條人生平均花費、玩到第10回合的人生平均花費、AI讀進去的內容(快取讀取／快取寫入／沒用快取)
  const lifeCost = new Map();
  for (const r of R) lifeCost.set(r.life, (lifeCost.get(r.life) || 0) + (Number(r.usd) || 0) * rate);
  const r10 = reached(10), cost10 = r10.reduce((t, l) => t + (lifeCost.get(l) || 0), 0);
  let tin = 0, tcw = 0, tcr = 0;
  for (const r of R) { tin += Number(r.in) || 0; tcw += Number(r.cw) || 0; tcr += Number(r.cr) || 0; }
  const tall = tin + tcw + tcr, share = (x) => tall ? Math.round(x / tall * 1000) / 1000 : null;
  return {
    ok: true, range, date: day, prev,
    summary: {
      lives: ids.length, playing_now: ids.filter(active).length,
      reach10: ids.filter(l => mt(l) >= 10).length, reach10_rate: ids.length ? Math.round(ids.filter(l => mt(l) >= 10).length / ids.length * 1000) / 1000 : null,
      median_turns: median, max_turns: sorted.length ? sorted[sorted.length - 1] : null,
      turns, retries, retry_rate: turns ? Math.round(retries / turns * 1000) / 1000 : null,
      twd: r1(twd), twd_per_turn: turns ? r2(twd / turns) : null, twd_per_turn_no_retry: turns ? r2(twdNoRetry / turns) : null,
      reach3: reached(3).length, reach20: reached(20).length,
      free_input: { free: freeN, choice: choiceN, rate: markedN ? Math.round(freeN / markedN * 1000) / 1000 : null, lives_marked: markedLives.size, lives_free: freeLives.size,
        lives_free_rate: markedLives.size ? Math.round(freeLives.size / markedLives.size * 1000) / 1000 : null },
      twd_per_life: ids.length ? r2(twd / ids.length) : null, twd_per_reach10_life: r10.length ? r2(cost10 / r10.length) : null,
      cache: { read: share(tcr), write: share(tcw), plain: share(tin) },
      session_median_min: sessions.length ? r1(medianOf(sessions) / 60000) : null, session_mean_min: sessions.length ? r1(meanOf(sessions) / 60000) : null,
      turn_gap_median_s: gaps.length ? Math.round(medianOf(gaps) / 1000) : null,
      wait_turn_s: sec1(meanOf(waitTurn)), wait_opening_s: sec1(meanOf(waitOpen)), wait_retry_s: sec1(meanOf(waitRetry)),
      revisit: range === "today" ? null : { lives: revisit, of: revisitBase }
    },
    funnel, continuation, stops, timeline,
    cost_split: Object.entries(byKind).map(([k, v]) => ({ kind: k, calls: v.calls, twd: r1(v.twd) })).sort((a, b) => b.twd - a.twd),
    retry_cats,
    retry_reasons: Object.entries(reasons).map(([code, n]) => ({ code, label: REGEN_REASON_LABELS[code] || code, n })).sort((a, b) => b.n - a.n).slice(0, 5)
  };
}

// 十、10.13.7.14：每日總表的新欄位(從明細算，明細只留7天)——依開局那天(台灣日期)：開局人生數、玩到第3／10／20回合的人生數；依呼叫那天：一般回合平均AI等待秒數
export function dailyExtrasFromRows(rows) {
  const all = (rows || []).filter(r => r && typeof r.t === "number").sort((a, b) => a.t - b.t);
  const first = firstSeen(all), mt = maxTurns(all), out = {};
  const D = (d) => out[d] || (out[d] = { lives: 0, reach3: 0, reach10: 0, reach20: 0, wait_ms: 0, wait_n: 0 });
  for (const [l, t] of first) {
    const o = D(tw(t).slice(0, 10)), m = mt.get(l) || 0;
    o.lives++; if (m >= 3) o.reach3++; if (m >= 10) o.reach10++; if (m >= 20) o.reach20++;
  }
  for (const r of all) if (r.k === "turn" && typeof r.ms === "number") { const o = D(tw(r.t).slice(0, 10)); o.wait_ms += r.ms; o.wait_n++; }
  for (const o of Object.values(out)) { o.wait_s = o.wait_n ? Math.round(o.wait_ms / o.wait_n / 100) / 10 : null; delete o.wait_ms; delete o.wait_n; }
  return out;
}
// 十、10.13.7.14：每小時總表(從明細算)——鍵為台灣時間「YYYY-MM-DD HH」：新開局人生、一般回合、重寫、AI花費(美元)
export function hourlyFromRows(rows) {
  const all = (rows || []).filter(r => r && typeof r.t === "number").sort((a, b) => a.t - b.t);
  const out = {}, H = (t) => { const k = tw(t).slice(0, 13).replace("T", " "); return out[k] || (out[k] = { new_lives: 0, turns: 0, retries: 0, usd: 0 }); };
  for (const [, t] of firstSeen(all)) H(t).new_lives++;
  for (const r of all) { const h = H(r.t); if (r.k === "turn") h.turns++; if (r.k === "retry") h.retries++; h.usd += Number(r.usd) || 0; }
  for (const h of Object.values(out)) h.usd = Math.round(h.usd * 1e4) / 1e4;
  return out;
}
