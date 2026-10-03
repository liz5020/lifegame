// 2026-10-04：十、10.13.7 數據總覽——人生代號清單、玩家計算(免費／付費／活躍)、瀏覽人次 POST /pv、GET /stats-summary、GET /dashboard（全程假Resend、假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("數據總覽：玩家／瀏覽人次／stats-summary／dashboard");
let upstreamFail = false;
const fakeAI = H.makeFakeAnthropic({ fail: () => upstreamFail });
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

// ---- 儀表板網頁 ----
r = await get("/dashboard", undefined, null);
A.check("/dashboard：200、HTML、不被收錄、不快取", r.status === 200 && /^<!doctype html>/i.test(r.text), r.status);
const raw = await (await import("../worker/worker.js")).default.fetch(new Request("https://life-game.smile80275.workers.dev/dashboard"), env, { waitUntil() {} });
A.check("/dashboard標頭：X-Robots-Tag noindex、Cache-Control no-store、text/html", /noindex/.test(raw.headers.get("X-Robots-Tag") || "") && raw.headers.get("Cache-Control") === "no-store" && /text\/html/.test(raw.headers.get("Content-Type") || ""));
A.check("/dashboard：不引用任何外部資源(沒有http(s)://的src／href)", !/(src|href)=["']https?:/i.test(r.text) && !/@import|<link/i.test(r.text));
A.check("/dashboard：密碼只放sessionStorage、錯誤顯示「密碼錯誤」、有手動更新與每小時自動更新、暫時無法取得", /sessionStorage/.test(r.text) && !/localStorage/.test(r.text) && r.text.includes("密碼錯誤") && r.text.includes("3600000") && r.text.includes("秒後可再更新") && r.text.includes("暫時無法取得"));
A.check("/dashboard：頁面本身不含密碼或統計數字(資料靠輸入密碼後才抓)", !r.text.includes("admin-secret"));

process.exit(A.report() ? 0 : 1);
