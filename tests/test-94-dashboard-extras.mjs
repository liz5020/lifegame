// 2026-10-10：後台新增——自由書寫比例（前端帶input_source→Worker記進明細→/stats-play算比例→網頁顯示）、離開時停在第幾回合每10回合一格、
// 今天每小時瀏覽「前」的合計平均分攤成估計柱、重寫區塊可捲動、名冊上方摘要（全程假上游，不打真實API）
import * as H from "./harness.mjs";
import { computePlayStats } from "../worker/play-stats.js";
const A = H.makeAsserter("94 後台新增：自由書寫比例等");
const fakeAI = H.makeFakeAnthropic({ usage: () => H.ONE_TWD_USAGE });
H.installUpstream(fakeAI, H.makeFakeResend());
const worker = (await import("../worker/worker.js")).default;
const T0 = Date.parse("2026-10-10T03:00:00Z");
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false", DAILY_GIFT_CAP: "50", DAILY_NEW_PLAYER_CAP: "7", BETA_PLAYER_CHECKPOINT: "40" });
const get = (path) => H.callWorker(env, { method: "GET", path, headers: { Authorization: "Bearer admin-secret" }, origin: null });
const payload = (turn, extra) => JSON.stringify(Object.assign({ player_name: "x", gender: "男", age: 15, turn, stats: {}, player_action: "讀書", forceEnding: false }, extra || {}));
let n = 0;
const play = (lid, turn, src) => H.callWorker(env, { path: "/", body: Object.assign({ life_id: lid, turn_nonce: "ex" + (++n) + "zzzzzzzzz", messages: [{ role: "user", content: payload(turn, turn === 1 ? { time_context: { is_prologue: true } } : {}) }] }, src ? { input_source: src } : {}) });

// ---- Worker：只收 free／choice 兩個值，開場與重試不重複算 ----
await play("lifex00001", 1);                 // 開場
await play("lifex00001", 2, "free");
await play("lifex00001", 3, "choice");
await play("lifex00002", 1);
await play("lifex00002", 2, "choice");
await play("lifex00002", 3, "<script>");     // 亂填：不算
let r = await get("/stats-play?range=today");
const f = r.json.summary.free_input;
A.check("自由書寫：自己寫1、點選項2，比例33.3%（重寫的那次不重複算）", f && f.free === 1 && f.choice === 2 && Math.abs(f.rate - 0.333) < 0.001, f);
A.check("自由書寫：有記錄的人生2條、其中1條自己寫過", f && f.lives_marked === 2 && f.lives_free === 1 && f.lives_free_rate === 0.5, f);
const csv = (await get("/usage-detail.csv")).text;
A.check("明細不外露玩家寫的內容（只有f／c旗標，沒有player_action文字）", !csv.includes("讀書"));

// 一次重寫（同回合編號第二次，帶重寫原因），讓網頁的重寫區塊有內容
await H.callWorker(env, { path: "/", body: { life_id: "lifex00002", turn_nonce: "exretryzzzzz1", messages: [{ role: "user", content: payload(4) }] } });
await H.callWorker(env, { path: "/", body: { life_id: "lifex00002", turn_nonce: "exretryzzzzz1", regen_reason: "過短", messages: [{ role: "user", content: payload(4) }] } });

// ---- play-stats：離開時停在第幾回合，每10回合一格 ----
const base = Date.parse("2026-10-10T01:00:00Z"), mk = (life, maxTurn) => Array.from({ length: maxTurn }, (_, i) => ({ t: base + i * 1000, k: i === 0 ? "opening" : "turn", turn: i + 1, life, usd: 0 }));
const rows = [].concat(mk("a", 1), mk("b", 2), mk("c", 17), mk("d", 34), mk("e", 123));
const ps = computePlayStats(rows, base + 3 * 3600000, "today", 32);
const lab = ps.stops.map(s => s.label);
A.check("離開時停在：前4格固定、之後每10回合一格、100以上併成一格", lab[0] === "只有開場" && lab[1] === "第 2 回合" && lab.includes("第 10～19 回合") && lab.includes("第 30～39 回合") && lab[lab.length - 1] === "第 100 回合以上", lab);
const at = (l) => ps.stops.find(s => s.label === l).lives;
A.check("離開時停在：17回合那條落在10～19、34回合落在30～39、123回合落在100以上", at("第 10～19 回合") === 1 && at("第 30～39 回合") === 1 && at("第 100 回合以上") === 1);
A.check("離開時停在：沒有人的尾端格子不顯示（最多只到100以上）", ps.stops.length <= 14 && ps.stops.reduce((t, s) => t + s.lives, 0) === 5);
const small = computePlayStats(mk("z", 3), base + 3 * 3600000, "today", 32);
A.check("只有少數回合時，前4格仍在、後面空格截掉", small.stops.length === 4 && small.stops[2].lives === 1, small.stops.map(s => s.label));

// ---- 網頁 ----
const { JSDOM, VirtualConsole } = await import("jsdom");
const html = (await H.callWorker(env, { method: "GET", path: "/dashboard", origin: null })).text;
const errors = [];
const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e && e.message || e)));
const roster = { success: true, accounts: [
  { email: "a@x", bound_at: 1, lives: 1, turns: 40, last_save: 1, wl_status: "已入場", joined_at: 1, notified_at: 1 },
  { email: "b@x", bound_at: 1, lives: 1, turns: 20, last_save: 1, wl_status: "排隊中", joined_at: 1, notified_at: null },
  { email: "c@x", bound_at: 1, lives: 1, turns: 0, last_save: 1, wl_status: "", joined_at: null, notified_at: null }] };
const dom = new JSDOM(html, { url: "https://life-game.smile80275.workers.dev/dashboard", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.sessionStorage.setItem("lifegame_dash_token", "admin-secret");
    w.fetch = async (p, o) => {
      if (p === "/admin/dashboard-roster") return new Response(JSON.stringify(roster), { headers: { "Content-Type": "application/json" } });
      const res = await worker.fetch(new Request("https://life-game.smile80275.workers.dev" + p, { headers: (o && o.headers) || {} }), env, { waitUntil() {} });
      if (p.startsWith("/stats-play?range=today")) { // 模擬「每小時紀錄10點才開始、整天合計40次」
        const j = await res.json(); j.pageviews = { "10:00": 4, "11:00": 6 }; j.pageviews_total = 40;
        return new Response(JSON.stringify(j), { headers: { "Content-Type": "application/json" } });
      }
      return res;
    };
  } });
const w = dom.window, $ = id => w.document.getElementById(id);
const settle = () => new Promise(res => setTimeout(res, 300));
await settle();
const qb = $("quotaBody");
A.check("每小時瀏覽：「前」的合計平均分攤到前面10個小時，畫成淺色估計柱並有說明", qb.querySelectorAll('rect[fill-opacity="0.4"]').length === 10 && /平均分攤到前面 10 個小時/.test(qb.textContent) && !/最左邊「前」/.test(qb.textContent), qb.textContent.slice(0, 300));
A.check("自己寫的比例區塊：顯示百分比與人生數", /自己寫的比例/.test($("report").textContent) && /33/.test($("secFree").textContent) && /自己寫 1、點選項 2/.test($("secFree").textContent), $("secFree") && $("secFree").textContent);
A.check("重寫區塊的表格都在可捲動容器裡", ($("secRetry").querySelectorAll(".scroll.tall").length >= 1) && $("secDrop").querySelectorAll(".scroll.tall").length >= 1);
w.document.querySelector('#range button[data-r="30d"]').click(); await settle();
A.check("近30天：自己寫的比例只提示看不到逐筆明細", /逐筆明細只留 7 天/.test($("secFree").textContent));
$("tabN").click(); await settle();
const rb = $("rosterBody").textContent;
A.check("名冊摘要：綁信箱3位、有玩過2位、平均30回合（只算有玩過的）、中位數30", /綁信箱的玩家3位/.test(rb.replace(/\s/g, "")) && /平均玩幾回合30回合/.test(rb.replace(/\s/g, "")) && /回合數中位數30回合/.test(rb.replace(/\s/g, "")), rb.slice(0, 400));
A.check("名冊摘要：候補各狀態人數（排隊中1、已入場1）", /排隊中 1/.test(rb) && /已入場 1/.test(rb) && /有留信箱候補2位/.test(rb.replace(/\s/g, "")));
A.check("網頁執行過程沒有程式錯誤", errors.length === 0, errors);
w.close();
process.exit(A.report() ? 0 : 1);
