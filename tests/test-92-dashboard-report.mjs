// 2026-10-10：十、10.13.7.14 數據網頁改成報告式版面——/stats-play 新增昨天與新數字、每小時瀏覽、/stats-daily、加寬的 /daily.csv、/hourly.csv、
// 每小時排程彙整(明細刪掉後數字留下、每小時資料留90天)、名額表新數字、網頁版面（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("數據網頁報告式版面(10.13.7.14)");
const fakeAI = H.makeFakeAnthropic({ usage: () => H.ONE_TWD_USAGE });
H.installUpstream(fakeAI, H.makeFakeResend());
const worker = (await import("../worker/worker.js")).default;

const T0 = Date.parse("2026-10-10T03:00:00Z"); // 台灣 10/10 11:00
const DAY = 86400000, MIN = 60000;
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false", DAILY_GIFT_CAP: "50", DAILY_NEW_PLAYER_CAP: "7", BETA_PLAYER_CHECKPOINT: "40" });
const setNow = ms => { env.TEST_NOW_MS = String(T0 + ms); };
const post = (path, body, headers, origin) => H.callWorker(env, { path, body, headers, origin });
const get = (path) => H.callWorker(env, { method: "GET", path, headers: { Authorization: "Bearer admin-secret" }, origin: null });
const tick = async () => { const w = []; await worker.scheduled({ cron: "0 * * * *" }, env, { waitUntil: p => w.push(p) }); await Promise.all(w); };
const payload = (turn, extra) => JSON.stringify(Object.assign({ player_name: "x", gender: "男", age: 15, turn, stats: {}, player_action: "讀書", forceEnding: false }, extra || {}));
let n = 0;
const play = (lid, turn) => post("/", { life_id: lid, turn_nonce: "rp" + (++n) + "zzzzzzzzz", messages: [{ role: "user", content: payload(turn, turn === 1 ? { time_context: { is_prologue: true } } : {}) }] });

// ---- 瀏覽人次依小時記 ----
await post("/pv"); await post("/pv");
setNow(70 * MIN); await post("/pv"); // 台灣 12:10
let r = await get("/stats-play?range=today");
A.check("/stats-play今天：每小時瀏覽人次(11:00兩次、12:00一次)與合計", r.status === 200 && r.json.pageviews["11:00"] === 2 && r.json.pageviews["12:00"] === 1 && r.json.pageviews_total === 3, r.json.pageviews);

// ---- 兩段人生：甲玩到第4回合，乙只有開場 ----
for (let t = 1; t <= 4; t++) { setNow(70 * MIN + t * MIN); await play("lifea00001", t); }
setNow(80 * MIN); await play("lifeb00001", 1);
r = await get("/stats-play?range=today");
const m = r.json.summary;
A.check("/stats-play今天：開局2條、到第3回合1條、每條人生平均花費、快取比例、等待秒數欄位都有", m.lives === 2 && m.reach3 === 1 && m.twd_per_life > 0 && m.cache && "read" in m.cache && "wait_turn_s" in m && "session_median_min" in m && m.revisit === null, m);
A.check("/stats-play今天：附前一天比較(昨天0條)", r.json.prev && r.json.prev.date === "2026-10-09" && r.json.prev.lives === 0, r.json.prev);
r = await get("/stats-play?range=yesterday");
A.check("/stats-play昨天：range＝yesterday、日期10/09、0條", r.status === 200 && r.json.range === "yesterday" && r.json.date === "2026-10-09" && r.json.summary.lives === 0, r.json.range);

// ---- 名額表新數字 ----
let s = (await get("/stats-summary")).json;
A.check("/stats-summary名額：後台設定值、今天新增候補、通知後入場數字都有", s.entry && s.entry.daily_cap_setting === 7 && typeof s.entry.wl_new_today === "number" && typeof s.entry.mailed === "number" && typeof s.entry.entered_after_mail === "number" && typeof s.entry.notified_over_day === "number", s.entry);

// ---- 每日總表、每小時總表 ----
r = await get("/stats-daily");
let today = r.json.rows.find(x => x.date === "2026-10-10");
A.check("/stats-daily：今天開局2、到第3回合1、重寫0、名額欄位在排程前是空的", r.status === 200 && today && today.lives === 2 && today.reach3 === 1 && today.retries === 0 && today.quota_used === null, today);
r = await get("/daily.csv");
let head = r.text.replace(/^﻿/, "").split("\n")[0];
A.check("/daily.csv表頭：原本六欄在前，接著開局人生…估計AI餘額，最後各種呼叫次數", /^日期,瀏覽人次,新增玩家,回合數,花費_元,AI花費_美元,開局人生,玩到第3回合,玩到第10回合,玩到第20回合,重寫次數,重寫比例,AI平均等待_秒,名額已用,名額,候補排隊,候補新增,綁信箱新增,估計AI餘額_美元,呼叫次數_一般回合/.test(head), head);
A.check("/hourly.csv：沒密碼401", (await H.callWorker(env, { method: "GET", path: "/hourly.csv", origin: null })).status === 401);
r = await get("/hourly.csv");
let lines = r.text.replace(/^﻿/, "").trim().split("\n");
A.check("/hourly.csv：表頭、11:00瀏覽2、12:00瀏覽1且新開局2", lines[0] === "時段_台灣時間,瀏覽人次,新開局人生,一般回合,重寫,花費_元,AI花費_美元" && lines.some(l => l.startsWith("2026-10-10 11:00,2,")) && lines.some(l => l.startsWith("2026-10-10 12:00,1,2,")), lines);

// ---- 每小時排程：記名額快照；明細過期後數字還在 ----
await tick();
today = (await get("/stats-daily")).json.rows.find(x => x.date === "2026-10-10");
A.check("排程後：今天的名額已用與名額有快照", today.quota_used !== null && today.quota_cap === 7 && today.waiting === 0, today);
setNow(9 * DAY); await play("lifec00001", 1); // 9天後：新的明細寫入時清掉超過7天的舊明細
const rows = (await get("/stats-daily")).json.rows;
const d10 = rows.find(x => x.date === "2026-10-10");
A.check("明細刪掉以後，10/10 的開局人生、到第3回合仍在(來自排程存下的數字)", d10 && d10.lives === 2 && d10.reach3 === 1, d10);
A.check("10/10 沒有被算成9天後才開局", (await get("/stats-play?range=today")).json.summary.lives === 1);
lines = (await get("/hourly.csv")).text.split("\n");
A.check("每小時總表：明細刪掉以後，10/10 12:00 的新開局仍在", lines.some(l => l.startsWith("2026-10-10 12:00,1,2,")), lines.slice(0, 4));
setNow(92 * DAY); await tick();
lines = (await get("/hourly.csv")).text.split("\n");
A.check("每小時總表保留90天：92天後10/10的資料刪掉", !lines.some(l => l.startsWith("2026-10-10")), lines.slice(0, 4));
A.check("每日總表永久保留：92天後10/10仍在", (await get("/stats-daily")).json.rows.some(x => x.date === "2026-10-10" && x.lives === 2));

// ---- 純函式：一次遊玩、隔天回來、重寫原因白話 ----
{
  const { computePlayStats } = await import("../worker/play-stats.js");
  const N = Date.parse("2026-10-10T05:00:00Z");
  const rs = [];
  const at = (t, k, turn, life, extra) => rs.push(Object.assign({ t, k, turn, life, usd: 0.01, in: 10, cw: 10, cr: 80, ms: 10000 }, extra || {}));
  at(N - DAY - 60 * MIN, "opening", 1, "y1"); at(N - DAY - 59 * MIN, "turn", 2, "y1"); at(N - DAY - 58 * MIN, "turn", 3, "y1");
  at(N - DAY - 10 * MIN, "turn", 4, "y1"); // 隔48分鐘＝第二次遊玩
  at(N - 30 * MIN, "turn", 5, "y1"); // 今天又回來
  at(N - DAY - 50 * MIN, "opening", 1, "y2"); at(N - DAY - 49 * MIN, "retry", 1, "y2", { rr: "過短", ms: 20000 });
  const y = computePlayStats(rs, N, "yesterday", 32);
  A.check("昨天：2條人生、1條隔天又回來", y.summary.lives === 2 && y.summary.revisit.lives === 1 && y.summary.revisit.of === 2, y.summary);
  A.check("一次遊玩：y1有三段(2分、0分、0分)、y2一段(1分)；兩回合間隔中位數60秒", y.summary.session_median_min === 0.5 && y.summary.turn_gap_median_s === 60, y.summary);
  A.check("等待：一般回合10秒、重寫20秒；重寫原因附白話", y.summary.wait_turn_s === 10 && y.summary.wait_retry_s === 20 && y.retry_reasons[0].label === "正文少於40字", y.retry_reasons);
}

// ---- 網頁 ----
r = await H.callWorker(env, { method: "GET", path: "/dashboard", origin: null });
const html = r.text;
A.check("網頁：分頁報表／長期趨勢／名冊，最上方名額與人流", html.includes(">報表<") && html.includes("長期趨勢") && html.includes(">名冊<") && html.indexOf("名額與人流（即時）") < html.indexOf('id="range"'));
A.check("網頁：時間範圍今天／昨天／近7天／近30天，需要注意、白話、數字怎麼算", ["今天", "昨天", "近 7 天", "近 30 天"].every(w => html.includes(">" + w + "<")) && html.includes("需要注意") && html.includes("白話：") && html.includes("數字怎麼算"));
A.check("網頁：三個下載檔案(每日、每小時、逐筆)與資料來源", ["/daily.csv", "/hourly.csv", "/usage-detail.csv", "/stats-daily", "/stats-play?range="].every(w => html.includes(w)));
A.check("網頁：調整名額的說明指到兩個後台設定值", html.includes("DAILY_NEW_PLAYER_CAP") && html.includes("BETA_PLAYER_CHECKPOINT"));
A.check("網頁：重點數字兩排三格", (html.match(/tiles c3/g) || []).length >= 2);

// ---- 網頁實際跑一次(jsdom，fetch導到同一個Worker)：每個時間範圍、長期趨勢都畫得出來、沒有程式錯誤 ----
{
  const { JSDOM, VirtualConsole } = await import("jsdom");
  const errors = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e && e.message || e)));
  setNow(92 * DAY + 2 * 3600000); await play("lifed00001", 1); await play("lifed00001", 2);
  const dom = new JSDOM(html, { url: "https://life-game.smile80275.workers.dev/dashboard", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.sessionStorage.setItem("lifegame_dash_token", "admin-secret");
      w.fetch = async (p, o) => { const res = await worker.fetch(new Request("https://life-game.smile80275.workers.dev" + p, { headers: (o && o.headers) || {} }), env, { waitUntil() {} }); return res; };
    } });
  const w = dom.window, $ = id => w.document.getElementById(id);
  const settle = () => new Promise(r => setTimeout(r, 300));
  await settle();
  A.check("網頁跑起來：登入後顯示報表、結論句有開局數字、名額表有今日名額", !$("app").hidden && /條人生開局/.test($("take").textContent) && /今日名額/.test($("quotaBody").textContent), $("take").textContent);
  for (const r of ["yesterday", "7d", "30d", "today"]) {
    w.document.querySelector('#range button[data-r="' + r + '"]').click(); await settle();
    A.check("網頁切到「" + r + "」：標題、重點數字、漏斗、花費、玩家都有畫出來", $("kpi").querySelectorAll(".tile").length === 6 && $("report").querySelector("#secFunnel") && $("report").querySelector("#secCost") && $("report").querySelector("#secPlayers") && !/undefined|NaN/.test($("report").textContent + $("kpi").textContent), $("title").textContent);
  }
  $("tabT").click(); await settle();
  A.check("長期趨勢：有折線圖與每日總表", !!$("trendSvg") && $("dailyTable").querySelectorAll("tr").length > 1);
  w.document.querySelector('#trendPick button[data-k="retry_rate"]').click(); await settle();
  A.check("長期趨勢切重寫比例：照樣畫得出來", !!$("trendSvg"));
  A.check("網頁執行過程沒有程式錯誤", errors.length === 0, errors);
  w.close();
}
process.exit(A.report() ? 0 : 1);
