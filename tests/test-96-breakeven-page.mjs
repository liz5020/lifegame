// 2026-10-10：後台新增「回本估算」分頁（純前端算術，數字來自後台資料；全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("96 後台回本估算頁");
const fakeAI = H.makeFakeAnthropic({ usage: () => H.ONE_TWD_USAGE });
H.installUpstream(fakeAI, H.makeFakeResend());
const worker = (await import("../worker/worker.js")).default;
const T0 = Date.parse("2026-10-10T03:00:00Z");
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false", AI_BALANCE_USD: "15.92", AI_BALANCE_BASE_USD: "0" });
const payload = (turn) => JSON.stringify({ player_name: "x", gender: "男", age: 15, turn, stats: {}, player_action: "讀書", forceEnding: false });
let n = 0;
for (const lid of ["lifec00001", "lifec00002"]) for (let t = 1; t <= 4; t++) await H.callWorker(env, { path: "/", body: { life_id: lid, turn_nonce: "be" + (++n) + "zzzzzzzzz", messages: [{ role: "user", content: payload(t) }] } });

const { JSDOM, VirtualConsole } = await import("jsdom");
const html = (await H.callWorker(env, { method: "GET", path: "/dashboard", origin: null })).text;
const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e && e.message || e)));
const dom = new JSDOM(html, { url: "https://life-game.smile80275.workers.dev/dashboard", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.sessionStorage.setItem("lifegame_dash_token", "admin-secret");
    w.fetch = (p, o) => worker.fetch(new Request("https://life-game.smile80275.workers.dev" + p, { headers: (o && o.headers) || {} }), env, { waitUntil() {} });
  } });
const w = dom.window, $ = id => w.document.getElementById(id);
const settle = () => new Promise(res => setTimeout(res, 400));
await settle();
A.check("有「回本估算」分頁按鈕，打開前面板是隱藏的", !!$("tabC") && $("paneC").hidden === true);
$("tabC").click(); await settle();
A.check("打開後顯示輸入區、三個結果卡片與複製區", $("paneC").hidden === false && !!$("c_newP") && $("calcOut").querySelectorAll(".card").length === 4, $("calcOut").textContent.slice(0, 120));
A.check("餘額從後台設定帶入（15.92）", $("c_bal").value === "15.92" || Number($("c_bal").value) > 0, $("c_bal").value);
const set = (id, v) => { $("c_" + id).value = String(v); $("c_" + id).dispatchEvent(new w.Event("input", { bubbles: true })); };
set("newP", 60); set("turnsNew", 10); set("costTurn", 1); set("exist", 100); set("retRate", 50); set("turnsRet", 5); set("buffer", 20); set("bal", 10); set("buyRate", 2); set("pack", 2);
const out = $("calcOut").textContent.replace(/\s/g, "");
// 回合 = 60×10 + 100×0.5×5 = 850；花費 850 元；加20% = 1020；1020/32 = 31.9 美元；減餘額10 = 21.9
A.check("明天回合數 850、花費 NT$850、加緩衝 NT$1,020", /850回合/.test(out) && /NT\$850/.test(out) && /NT\$1,020/.test(out), out.slice(0, 300));
A.check("建議再儲值 US$21.9", /US\$21\.9/.test(out), out.slice(0, 400));
// 長篇每點實收 999×0.97/1300 = 0.745；成本1.0 → 每點虧 0.255 → 一包 -331
A.check("成本1.0：長篇每點實收0.75、一包虧331、標示賣越多虧越多", /0\.75/.test(out) && /-331/.test(out) && /賣越多虧越多/.test(out), out.slice(300, 900));
set("costTurn", 0.5);
const out2 = $("calcOut").textContent.replace(/\s/g, "");
// 成本0.5：長篇 (0.745-0.5)×1300 = +319，不再顯示賣越多虧越多（有累計花費時顯示要賣幾包）
A.check("成本降到0.5：長篇一包賺319，不再寫賣越多虧越多", /\+319/.test(out2) && !/賣越多虧越多/.test(out2), out2);
$("c_t10").click(); await settle();
A.check("按「成本設 1.0」：欄位變成1", $("c_costTurn").value === "1", $("c_costTurn").value);
const ct = $("calcCopy") && $("calcCopy").value;
A.check("「複製給網頁版」：有按鈕與整理好的文字，含假設、結果、點數包盈虧、規則", !!w.document.querySelector('[data-copy="calcCopy"]') && /一、我填的假設/.test(ct) && /二、算出來的結果/.test(ct) && /三、點數包盈虧/.test(ct) && /10\.9\.6/.test(ct), ct && ct.slice(0, 300));
A.check("複製文字的數字跟畫面一致（成本1.0時長篇虧331）", /長篇 999 元／1300 點.*虧 331 元/.test(ct), ct);
A.check("網頁執行過程沒有程式錯誤", errors.length === 0, errors);
w.close();
process.exit(A.report() ? 0 : 1);
