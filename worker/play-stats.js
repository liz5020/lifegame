// 十、10.13.7.12（2026-10-10）：數據網頁「玩家怎麼玩」分頁——從AI實際用量逐筆明細(10.14.7，最近7天、最多30,000筆)算出的玩家行為分析。
// 只在打開那一頁時算；不另外存任何資料，不碰KV。人生以明細裡的匿名人生代號(雜湊)區分，不含信箱或存檔內容。
// range：today＝今天(台灣日期)開局的人生；7d＝明細裡所有人生(最近7天)。時間分組：today每小時、7d每天。
const HOUR = 3600000;
const ACTIVE_MS = 10 * 60000; // 最後一次呼叫在10分鐘內＝還在玩
const STOP_BUCKETS = [[0, 1, "只有開場"], [2, 2, "第 2 回合"], [3, 4, "第 3～4 回合"], [5, 9, "第 5～9 回合"], [10, 19, "第 10～19 回合"], [20, 1e9, "第 20 回合以上"]];
const tw = (t) => new Date(t + 8 * HOUR).toISOString(); // 台灣時間的ISO字串(只拿來切日期與時段)

export function computePlayStats(rows, now, range, usdToTwd) {
  const rate = usdToTwd || 32;
  const today = tw(now).slice(0, 10);
  const all = (rows || []).filter(r => r && typeof r.t === "number").sort((a, b) => a.t - b.t);
  const first = new Map();
  for (const r of all) if (r.life && !first.has(r.life)) first.set(r.life, r.t);
  const inRange = (t) => range === "7d" || tw(t).slice(0, 10) === today;
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
  // 漏斗：玩到第N回合以上的人生數(N＝2～最多60)；繼續比例：玩到第N回合的人生裡，有玩到第N+1回合的比例(N＝2～15)
  const top = Math.min(60, sorted.length ? sorted[sorted.length - 1] : 0);
  const funnel = [];
  for (let n = 2; n <= top; n++) funnel.push({ turn: n, lives: ids.filter(l => mt(l) >= n).length });
  const continuation = [];
  for (let n = 2; n <= Math.min(15, top - 1); n++) {
    const reach = ids.filter(l => mt(l) >= n), cont = reach.filter(l => mt(l) >= n + 1);
    // 還在玩、而且剛好停在第N回合的人生還沒決定要不要繼續，不算進分母
    const decided = reach.filter(l => mt(l) > n || !active(l));
    if (decided.length) continuation.push({ turn: n, rate: Math.round(cont.length / decided.length * 1000) / 1000, n: decided.length });
  }
  // 離開時停在哪裡：最後10分鐘沒有呼叫的人生
  const left = ids.filter(l => !active(l));
  const stops = STOP_BUCKETS.map(([lo, hi, label]) => ({ label, lives: left.filter(l => mt(l) >= lo && mt(l) <= hi).length }));

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
  const timeline = [...buckets.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1)).map(b => ({
    bucket: b.bucket, new_lives: b.new_lives, turns: b.turns, retries: b.retries,
    retry_rate: b.turns ? Math.round(b.retries / b.turns * 1000) / 1000 : null, twd: r1(b.twd), lives: b.lives.size }));
  const reasons = {};
  for (const r of R) if (r.k === "retry" && r.rr) for (const c of String(r.rr).split("、")) if (c) reasons[c] = (reasons[c] || 0) + 1;
  return {
    ok: true, range: range === "7d" ? "7d" : "today", date: today,
    summary: {
      lives: ids.length, playing_now: ids.filter(active).length,
      reach10: ids.filter(l => mt(l) >= 10).length, reach10_rate: ids.length ? Math.round(ids.filter(l => mt(l) >= 10).length / ids.length * 1000) / 1000 : null,
      median_turns: median, max_turns: sorted.length ? sorted[sorted.length - 1] : null,
      turns, retries, retry_rate: turns ? Math.round(retries / turns * 1000) / 1000 : null,
      twd: r1(twd), twd_per_turn: turns ? r2(twd / turns) : null, twd_per_turn_no_retry: turns ? r2(twdNoRetry / turns) : null
    },
    funnel, continuation, stops, timeline,
    cost_split: Object.entries(byKind).map(([k, v]) => ({ kind: k, calls: v.calls, twd: r1(v.twd) })).sort((a, b) => b.twd - a.twd),
    retry_reasons: Object.entries(reasons).map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n).slice(0, 5)
  };
}
