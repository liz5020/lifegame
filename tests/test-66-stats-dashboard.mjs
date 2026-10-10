// 2026-10-04：十、10.13.7 數據總覽——人生代號清單、玩家計算(免費／付費／活躍)、瀏覽人次 POST /pv、GET /stats-summary、GET /dashboard（全程假Resend、假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("數據總覽：玩家／瀏覽人次／stats-summary／dashboard");
let upstreamFail = false;
let usageNow = H.ONE_TWD_USAGE; // 2026-10-08(10.9.3.1a補充二)：花費改記實際花費，假用量剛好1元
const fakeAI = H.makeFakeAnthropic({ fail: () => upstreamFail, usage: () => usageNow });
const resend = H.makeFakeResend();
H.installUpstream(fakeAI, resend);

const T0 = Date.parse("2026-10-04T03:00:00Z"); // 台灣 10/04 11:00
const DAY = 24 * 3600 * 1000, MIN = 60 * 1000;
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false", DAILY_GIFT_CAP: "50" });
let clock = 0;
const setNow = ms => { clock = ms; env.TEST_NOW_MS = String(T0 + ms); };
const post = (path, body, headers, origin) => H.callWorker(env, { path, body, headers, origin });
const get = (path, headers, origin) => H.callWorker(env, { method: "GET", path, headers, origin });
const auth = t => ({ Authorization: "Bearer " + t });
const ADMIN = auth("admin-secret");
const stats = async () => (await get("/stats-summary", ADMIN, null)).json;
const turnPayload = (extra) => JSON.stringify(Object.assign({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false }, extra || {}));
let n = 0;
const unboundTurn = (lid, extra) => post("/", { life_id: lid, turn_nonce: "nn" + (++n) + "zzzzzzzzz", messages: [{ role: "user", content: turnPayload(extra) }] });
const walletTurn = (token, lid) => post("/", { wallet: true, life_id: lid, turn_nonce: "wn" + (++n) + "zzzzzzzzz", messages: [{ role: "user", content: turnPayload() }] }, auth(token));
let ipn = 0, lastSent = {};
async function bind(email, key, lives) {
  const k = email.toLowerCase();
  if (lastSent[k] !== undefined && clock - lastSent[k] < 61000) setNow(lastSent[k] + 61000);
  lastSent[k] = clock;
  const s = await post("/account/send-code", { email }, { "CF-Connecting-IP": "10.9." + (++ipn) + ".1" });
  if (s.status !== 200) throw new Error("寄驗證碼失敗 " + JSON.stringify(s));
  return post("/account/bind", { email, code: resend.lastCode(k), key, lives });
}

// ---- 一開始：什麼都沒有 ----
let s = await stats();
A.check("無密碼的 /stats-summary 回401，密碼錯也是", (await get("/stats-summary", undefined, null)).status === 401 && (await get("/stats-summary", auth("nope"), null)).status === 401);
A.check("一開始：玩家、活躍、瀏覽人次都是0，daily空", s.players.free.total === 0 && s.players.paid.total === 0 && s.active.today === 0 && s.pageviews.total === 0 && s.pageviews.since === null && s.daily.length === 0, s);
A.check("回應含 generated_at、不快取", !!s.generated_at && (await get("/stats-summary", ADMIN, null)).text.length > 0);

// ---- 瀏覽人次 ----
let r = await post("/pv");
A.check("/pv：遊戲網站來源回200", r.status === 200 && r.json.success === true, r);
await post("/pv"); await post("/pv");
r = await post("/pv", undefined, undefined, "https://evil.example.com");
A.check("/pv：非白名單來源回403、不計數", r.status === 403, r);
r = await get("/pv");
A.check("/pv：GET不接受(不是POST)", r.status !== 200);
s = await stats();
A.check("瀏覽人次：今天3、近7天3、累計3，開始計數日＝2026-10-04", s.pageviews.today === 3 && s.pageviews.last7 === 3 && s.pageviews.total === 3 && s.pageviews.since === "2026-10-04", s.pageviews);
A.check("daily：只列開始計數日起，今天瀏覽3", s.daily.length === 1 && s.daily[0].date === "2026-10-04" && s.daily[0].pageviews === 3 && s.daily[0].new_players === 0, s.daily);

// ---- 玩家：未綁信箱，一個人生代號一位玩家，判斷依據是「玩過一回合」 ----
r = await unboundTurn("lifetrial1", { time_context: { is_prologue: true } });
A.check("開場回合成功回應", r.status === 200, r.status);
s = await stats();
A.check("開場不算玩過：玩家仍是0", s.players.free.total === 0 && s.active.today === 0, s.players);
upstreamFail = true;
r = await unboundTurn("lifetrial1");
upstreamFail = false;
s = await stats();
A.check("AI失敗的回合不算：玩家仍是0", r.status !== 200 && s.players.free.total === 0, s.players);
r = await unboundTurn("lifetrial1");
r = await unboundTurn("lifetrial1");
s = await stats();
A.check("玩過一回合：免費玩家1、今天新增1、近7天1、活躍今天1；同一人生多回合不重複", s.players.free.total === 1 && s.players.free.today === 1 && s.players.free.last7 === 1 && s.active.today === 1 && s.active.last7 === 1, s);
A.check("付費玩家固定0", s.players.paid.total === 0 && s.players.paid.today === 0);
r = await unboundTurn("lifeother1");
s = await stats();
A.check("另一個未綁人生代號＝另一位玩家", s.players.free.total === 2, s.players);
A.check("daily：今天新增玩家2", s.daily[0].new_players === 2, s.daily);

// ---- 清單只放日期，不放金鑰或存檔位置 ----
const pRec = env.ACCOUNTS._store.get("p:lifetrial1");
A.check("人生代號清單：只有第一次／最後一次出現日期", JSON.stringify(pRec) === JSON.stringify({ f: "2026-10-04", l: "2026-10-04" }), pRec);
const dump = JSON.stringify([...env.ACCOUNTS._store.entries()].filter(([k]) => k.startsWith("p:"))) + JSON.stringify(s);
A.check("清單與 /stats-summary 沒有金鑰或加密參照", !/KEY-|ref|enc/i.test(dump), dump.slice(0, 200));

// ---- 隔天：先未綁試玩、之後綁信箱，算在試玩那天，不重複 ----
setNow(DAY);
r = await bind("one@example.com", "KEY-ONE", [{ lid: "lifetrial1", pool: { daily: 5, gift: 0 } }]);
const tOne = r.json.token;
A.check("綁定成功", r.status === 200 && !!tOne, r.json);
s = await stats();
A.check("綁定後：玩家總數不變(試玩的人生代號不再各算一位)、綁定當天不重複新增", s.players.free.total === 2 && s.players.free.today === 0 && s.players.free.last7 === 2, s.players);
r = await walletTurn(tOne, "lifetrial1");
A.check("帳號人生出一回合成功", r.status === 200, r.status);
s = await stats();
A.check("綁定後繼續玩：仍是同一位玩家(總數2)、活躍今天1(只有帳號那位)、近7天活躍2", s.players.free.total === 2 && s.active.today === 1 && s.active.last7 === 2, s);
const newbind = await bind("two@example.com", "KEY-TWO", [{ lid: "lifenew001", pool: { daily: 5, gift: 0 } }]);
s = await stats();
A.check("上線後才綁、還沒玩過一回合的帳號：不算玩家", s.players.free.total === 2, s.players);
r = await walletTurn(newbind.json.token, "lifenew001");
s = await stats();
A.check("玩過一回合才算：總數3、今天新增1", s.players.free.total === 3 && s.players.free.today === 1, s.players);

// ---- 曾綁過的人生代號：人生結束被移出帳號後，不會被誤算成未綁信箱玩家 ----
r = await post("/account/lives", { op: "remove", lid: "lifenew001" }, auth(newbind.json.token));
const acctNow = [...env.ACCOUNTS._store.values()].find(v => v && v.email === "two@example.com");
s = await stats();
A.check("人生代號被移出帳號後(lives清單真的空了)，玩家數仍是3", r.status === 200 && acctNow.lives.length === 0 && s.players.free.total === 3, { status: r.status, lives: acctNow.lives, players: s.players });
const everLids = [...env.ACCOUNTS._store.values()].filter(v => v && v.email === "two@example.com")[0];
A.check("帳號「曾綁過的人生代號」清單有 lifenew001，只放人生代號", everLids && everLids.everLids.includes("lifenew001") && everLids.everLids.every(x => /^[a-z0-9]+$/.test(x)), everLids && everLids.everLids);

// ---- 付費玩家：purchased=true ----
for (const [k, v] of env.ACCOUNTS._store) if (v && v.email === "one@example.com") { v.purchased = true; env.ACCOUNTS._store.set(k, v); }
s = await stats();
A.check("購買標記為true的帳號算付費玩家，免費玩家扣掉", s.players.paid.total === 1 && s.players.free.total === 2, s.players);

// ---- 10.13.7.11 花費、回合、綁定與人生段數 ----
// 到這裡：第1天(10/04)成功回合3(lifetrial1×2、lifeother1)，第2天(10/05)帳號回合2；AI呼叫共7次(含1次失敗、1次開場)，估價每次1元
const callsTotal = fakeAI.calls.length;
s = await stats();
const u = s.usage;
A.check("總回合數：只算成功且非開場的回合——累計5、今天2、近7天5", u.turns.total === 5 && u.turns.today === 2 && u.turns.last7 === 5, u.turns);
A.check("總耗費：所有AI呼叫(含開場與失敗的)都計入(成功的記實際花費、失敗的照預估)——累計＝呼叫次數、今天2", u.cost.total === callsTotal && u.cost.today === 2 && u.cost.last7 === callsTotal, { cost: u.cost, callsTotal });
A.check("花費與回合分開記：改估價設定值只影響花費(另立環境驗證見下)", u.turns.total !== u.cost.total);
A.check("平均每位玩家花費：今天2÷活躍2＝1、累計7÷玩家3≈2.33", u.avg_cost_per_player.today === 1 && u.avg_cost_per_player.total === Math.round(callsTotal / 3 * 100) / 100, u.avg_cost_per_player);
A.check("平均每位玩家回合數：今天2÷2＝1、近7天5÷活躍3≈1.67、累計5÷3≈1.67", u.avg_turns_per_player.today === 1 && u.avg_turns_per_player.last7 === 1.67 && u.avg_turns_per_player.total === 1.67, u.avg_turns_per_player);
A.check("每回合平均花費：今天2÷2＝1、累計7÷5＝1.4", u.avg_cost_per_turn.today === 1 && u.avg_cost_per_turn.total === Math.round(callsTotal / 5 * 100) / 100, u.avg_cost_per_turn);
A.check("起算日＝第一筆花費紀錄的日期", u.since === "2026-10-04", u.since);
A.check("綁定信箱人數：累計2、今天2(綁定當天)、近7天2", s.accounts_bound.total === 2 && s.accounts_bound.today === 2 && s.accounts_bound.last7 === 2, s.accounts_bound);
A.check("開啟人生段數：累計3(trial1、other1、new001)、今天1(new001)、近7天3；開場不算", s.lives_started.total === 3 && s.lives_started.today === 1 && s.lives_started.last7 === 3, s.lives_started);
A.check("沒綁信箱的人生段數：累計1(other1；trial1綁了、new001曾綁過都不算)、今天0、近7天1", s.lives_unbound && s.lives_unbound.total === 1 && s.lives_unbound.today === 0 && s.lives_unbound.last7 === 1, s.lives_unbound);
A.check("daily每筆有turns與cost：第1天3回合、第2天2回合", s.daily.find(d => d.date === "2026-10-04").turns === 3 && s.daily.find(d => d.date === "2026-10-05").turns === 2 && s.daily.find(d => d.date === "2026-10-05").cost === 2, s.daily);
usageNow = { ...H.ONE_TWD_USAGE, output_tokens: 9375 }; // 剛好3元
const envP = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false" });
await H.callWorker(envP, { path: "/", body: { life_id: "lifeprice1", turn_nonce: "pp1zzzzzzzzzz", messages: [{ role: "user", content: turnPayload() }] } });
r = await H.callWorker(envP, { method: "GET", path: "/stats-summary", headers: ADMIN, origin: null });
usageNow = H.ONE_TWD_USAGE;
A.check("每次呼叫實際花費3元：花費變3、回合仍是1；平均每回合3", r.json.usage.cost.total === 3 && r.json.usage.turns.total === 1 && r.json.usage.avg_cost_per_turn.total === 3, r.json.usage);
const envZ = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false" });
r = await H.callWorker(envZ, { method: "GET", path: "/stats-summary", headers: ADMIN, origin: null });
A.check("沒有任何玩家與回合：平均全是null(畫面顯示「—」)，不是0", r.json.usage.avg_cost_per_player.total === null && r.json.usage.avg_turns_per_player.today === null && r.json.usage.avg_cost_per_turn.last7 === null && r.json.usage.since === null, r.json.usage);
const keyDump = JSON.stringify([...env.ACCOUNTS._store.entries()].filter(([k]) => k.startsWith("p:")));
A.check("人生代號清單仍只有兩個日期(10.13.7.3不變)，沒有累計花費或回合", /^\[(\["p:[a-z0-9]+",\{"f":"[\d-]+","l":"[\d-]+"\}\],?)+\]$/.test(keyDump), keyDump);

// ---- 上線前就綁好、尚無人生代號紀錄的帳號：以建立日期計入 ----
const oldAid = "oldacct0001";
const env2 = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false" });
env2.ACCOUNTS._store.set("ledger_start", T0 - 1000);
env2.ACCOUNTS._store.set("a:" + oldAid, { aid: oldAid, email: "old@example.com", key: "KEY-OLD", created: T0 - 5 * DAY, purchased: false, lives: [{ lid: "lifeold001", slot: 0 }], gifts: { g1: "done", g2: "none" }, events: [], sessions: [], wallet: {} });
env2.ACCOUNTS._store.set("a:newacct001", { aid: "newacct001", email: "new@example.com", key: "KEY-NEW", created: T0 + 1000, purchased: false, lives: [], gifts: { g1: "none", g2: "none" }, events: [], sessions: [], wallet: {} });
r = await H.callWorker(env2, { method: "GET", path: "/stats-summary", headers: ADMIN, origin: null });
A.check("上線前的老帳號(沒有人生代號紀錄)：以帳號建立日期為開始日，算免費玩家1位(近7天新增也算)", r.json.players.free.total === 1 && r.json.players.free.last7 === 1 && r.json.players.free.today === 0, r.json.players);
A.check("老帳號沒玩過：不算活躍", r.json.active.today === 0 && r.json.active.last7 === 0, r.json.active);

// ---- 近7天邊界、daily ----
const env3 = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false" });
const mk = (lid, f, l) => env3.ACCOUNTS._store.set("p:" + lid, { f, l });
mk("lifeday00x", "2026-10-04", "2026-10-04"); mk("lifeday06x", "2026-09-28", "2026-09-28"); mk("lifeday07x", "2026-09-27", "2026-09-27");
r = await H.callWorker(env3, { method: "GET", path: "/stats-summary", headers: ADMIN, origin: null });
A.check("近7天含今天共7個台灣日期：9/28算、9/27不算；累計3", r.json.players.free.last7 === 2 && r.json.players.free.total === 3 && r.json.active.last7 === 2, r.json);

// ---- 2026-10-10：實際遊戲裡回合帶的人生代號(s.lifeId)跟帳號用人生代號(s.acct.lid)不同 ----
const env4 = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false", SAVE_ADMIN_TOKEN: "save-pw" });
const p4 = (path, body, headers) => H.callWorker(env4, { path, body, headers });
for (let i = 0; i < 2; i++) await p4("/", { life_id: "savelife01", turn_nonce: "rs" + i + "zzzzzzzzz", messages: [{ role: "user", content: turnPayload() }] });
await p4("/account/send-code", { email: "real@example.com" }, { "CF-Connecting-IP": "10.8.8.1" });
r = await p4("/account/bind", { email: "real@example.com", code: resend.lastCode("real@example.com"), key: "KEY-REAL", lives: [{ lid: "lacct00001", pool: { daily: 5, gift: 0 } }] });
const tReal = r.json.token;
let s4 = (await H.callWorker(env4, { method: "GET", path: "/stats-summary", headers: ADMIN, origin: null })).json;
A.check("剛綁好、還沒用帳號出回合：帳號還不知道存檔的人生代號savelife01，沒綁信箱的人生段數暫時算1", s4.lives_unbound.total === 1, s4.lives_unbound);
for (let i = 0; i < 3; i++) await p4("/", { wallet: true, life_id: "savelife01", turn_nonce: "rw" + i + "zzzzzzzzz", messages: [{ role: "user", content: turnPayload() }] }, auth(tReal));
s4 = (await H.callWorker(env4, { method: "GET", path: "/stats-summary", headers: ADMIN, origin: null })).json;
A.check("用帳號錢包出過回合後，存檔人生代號記進帳號：玩家1位、沒綁信箱的人生段數0", s4.players.free.total === 1 && s4.lives_unbound.total === 0, { p: s4.players, u: s4.lives_unbound });
r = await H.callWorker(env4, { method: "GET", path: "/admin/dashboard-roster", headers: auth("save-pw"), origin: null });
A.check("名冊回合數：還沒存過雲端＝0", r.status === 200 && r.json.accounts[0].turns === 0, r.json);
const RK = "ABCD-1234-ABCD-1234-ABCD";
await p4("/save", { key: RK, slot: 0, meta: { name: "甲", age: 16, stage: "高中", lid: "lacct00001", turns: 4 }, state: { a: 1 } });
await p4("/save", { key: RK, slot: 0, meta: { name: "甲", age: 16, stage: "高中", lid: "lacct00001", turns: 5 }, state: { a: 1 } });
await p4("/save", { key: RK, slot: 1, meta: { name: "乙", age: 15, stage: "高中", turns: 99 }, state: { a: 1 } });
r = await H.callWorker(env4, { method: "GET", path: "/admin/dashboard-roster", headers: auth("save-pw"), origin: null });
A.check("名冊回合數＝帳號名下人生最後一次雲端存檔附的回合數(5)；沒綁帳號的存檔(99)不算", r.status === 200 && r.json.accounts[0].turns === 5, r.json);

// ---- 10.13.7.12（2026-10-10）：「玩家怎麼玩」——GET /stats-play 從逐筆明細現算 ----
A.check("/stats-play：沒密碼401", (await get("/stats-play", undefined, null)).status === 401);
r = await get("/stats-play?range=7d", ADMIN, null);
const pl = r.json;
A.check("/stats-play：近7天有人生、漏斗從第2回合起、停在哪裡分組、花費結構有一般回合", r.status === 200 && pl.range === "7d" && pl.summary.lives >= 1 && Array.isArray(pl.funnel) && (pl.funnel.length === 0 || pl.funnel[0].turn === 2) && pl.stops[0].label === "只有開場" && pl.cost_split.some(x => x.kind === "turn"), pl);
A.check("/stats-play：今天範圍只算今天開局的人生(≤近7天)；沒有信箱或原始人生代號", (await get("/stats-play", ADMIN, null)).json.summary.lives <= pl.summary.lives && !/@|lifetrial1|lifeother1/.test(JSON.stringify(pl)));
{
  const { computePlayStats } = await import("../worker/play-stats.js");
  const N = Date.parse("2026-10-10T05:00:00Z"), M = 60000; // 台灣13:00
  const rows = [];
  const life = (id, startMin, turns, retries) => { rows.push({ t: N - startMin * M, k: "opening", turn: 1, life: id, usd: 0.01 }); for (let i = 2; i <= turns; i++) rows.push({ t: N - startMin * M + i * M, k: "turn", turn: i, life: id, usd: 0.03 }); for (let j = 0; j < retries; j++) rows.push({ t: N - startMin * M + 30000, k: "retry", turn: 2, life: id, usd: 0.03, rr: "空白", rk: "重寫" }); };
  life("aa", 120, 12, 1); life("bb", 90, 1, 0); life("cc", 60, 3, 0); life("dd", 12, 6, 0); // dd最後一回合在6分鐘前＝還在玩
  rows.push({ t: N - 3 * 86400000, k: "opening", turn: 1, life: "old", usd: 0.01 });
  const o = computePlayStats(rows, N, "today", 32), w = computePlayStats(rows, N, "7d", 32);
  A.check("computePlayStats：今天4條、近7天5條；玩到第10回合1條；還在玩1條", o.summary.lives === 4 && w.summary.lives === 5 && o.summary.reach10 === 1 && o.summary.playing_now === 1, o.summary);
  A.check("computePlayStats：停在哪裡只算離開的3條(只有開場1、第3～4回合1、第10～19回合1)", o.stops.find(x => x.label === "只有開場").lives === 1 && o.stops.find(x => x.label === "第 3～4 回合").lives === 1 && o.stops.find(x => x.label === "第 10～19 回合").lives === 1 && o.stops.reduce((a, x) => a + x.lives, 0) === 3, o.stops);
  A.check("computePlayStats：繼續比例第6回合不算還在玩的dd(停在第6回合)", o.continuation.find(x => x.turn === 6).n === 1, o.continuation);
  A.check("computePlayStats：重寫1次÷一般回合18次(11＋0＋2＋5)、重寫原因、每回合花費", o.summary.retries === 1 && o.summary.turns === 18 && o.rewrite.all.reasons[0].code === "空白" && o.summary.twd_per_turn > o.summary.twd_per_turn_no_retry, o.summary);
}

// ---- 10.13.7.13（2026-10-10）：GET /daily.csv 每日總表(從第一天起) ----
A.check("/daily.csv：沒密碼401", (await get("/daily.csv", undefined, null)).status === 401);
r = await get("/daily.csv", ADMIN, null);
{
  const lines = r.text.replace(/^\uFEFF/, "").trim().split("\n");
  const d1 = lines.find(l => l.startsWith("2026-10-04,")), d2 = lines.find(l => l.startsWith("2026-10-05,"));
  // 2026-10-10：依欄位名稱找位置，不寫死欄位順序(之前每次加欄都要改這裡)；第一欄是日期，下面用日期找列
  const cols = lines[0].split(","), col = (name) => cols.indexOf(name);
  A.check("/daily.csv：表頭有日期、瀏覽人次、新增玩家、回合數、花費、各種呼叫次數", cols[0] === "日期" && ["瀏覽人次", "新增玩家", "回合數", "花費_元", "AI花費_美元", "呼叫次數_一般回合"].every(n => col(n) > 0), lines[0]);
  const v = (line, name) => line && line.split(",")[col(name)];
  A.check("/daily.csv：10/04 瀏覽3、新增2、回合3；10/05 回合2", v(d1, "瀏覽人次") === "3" && v(d1, "新增玩家") === "2" && v(d1, "回合數") === "3" && v(d2, "回合數") === "2", [d1, d2]);
}
{
  const raw2 = await (await import("../worker/worker.js")).default.fetch(new Request("https://life-game.smile80275.workers.dev/daily.csv", { headers: ADMIN }), env, { waitUntil() {} });
  const bytes = new Uint8Array(await raw2.arrayBuffer()), cd = raw2.headers.get("Content-Disposition") || "";
  A.check("/daily.csv：UTF-8 BOM開頭(Excel開中文不亂碼)、下載檔名「每日總表_日期」", bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF && decodeURIComponent(cd.split("''")[1] || "").startsWith("每日總表_"), cd);
}

// ---- 儀表板網頁 ----
r = await get("/dashboard", undefined, null);
A.check("/dashboard：200、HTML、不被收錄、不快取", r.status === 200 && /^<!doctype html>/i.test(r.text), r.status);
const raw = await (await import("../worker/worker.js")).default.fetch(new Request("https://life-game.smile80275.workers.dev/dashboard"), env, { waitUntil() {} });
A.check("/dashboard標頭：X-Robots-Tag noindex、Cache-Control no-store、text/html", /noindex/.test(raw.headers.get("X-Robots-Tag") || "") && raw.headers.get("Cache-Control") === "no-store" && /text\/html/.test(raw.headers.get("Content-Type") || ""));
A.check("/dashboard：不引用任何外部資源(沒有http(s)://的src／href)", !/(src|href)=["']https?:/i.test(r.text) && !/@import|<link/i.test(r.text));
A.check("/dashboard：密碼只放sessionStorage、錯誤顯示「密碼錯誤」、有手動更新與每小時自動更新、暫時無法取得", /sessionStorage/.test(r.text) && !/localStorage/.test(r.text) && r.text.includes("密碼錯誤") && r.text.includes("3600000") && r.text.includes("秒後可再更新") && r.text.includes("暫時無法取得") && r.text.includes("AI 花費") && r.text.includes("每回合平均") && r.text.includes("開啟人生段數") && r.text.includes("名額與人流") && r.text.includes("/stats-play") && r.text.includes("下載全部資料") && r.text.includes("/daily.csv") && r.text.includes("<th>回合數</th>"));
A.check("/dashboard：頁面本身不含密碼或統計數字(資料靠輸入密碼後才抓)", !r.text.includes("admin-secret"));

process.exit(A.report() ? 0 : 1);
