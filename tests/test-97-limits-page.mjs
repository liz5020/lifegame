// 2026-10-10：後台「攔截門檻」分頁——清單由後端現算（後台設定值生效）、網頁顯示目前值與接近上限提醒（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("97 後台攔截門檻頁");
H.installUpstream(H.makeFakeAnthropic({ usage: () => H.ONE_TWD_USAGE }), H.makeFakeResend());
const worker = (await import("../worker/worker.js")).default;
const T0 = Date.parse("2026-10-10T03:00:00Z");
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false", DAILY_SPEND_CAP: "4000", DAILY_GIFT_CAP: "20", DAILY_NEW_PLAYER_CAP: "135", BETA_PLAYER_CHECKPOINT: "200" });
// 餘額還能撐：用最近24小時的花費速度算小時
env.AI_BALANCE_USD = "10"; env.AI_BALANCE_BASE_USD = "0";
const pl = (t) => JSON.stringify({ player_name: "x", gender: "男", age: 15, turn: t, stats: {}, player_action: "讀書", forceEnding: false });
for (let t = 1; t <= 6; t++) await H.callWorker(env, { path: "/", body: { life_id: "lifel00001", turn_nonce: "lm" + t + "zzzzzzzzzz", messages: [{ role: "user", content: pl(t) }] } });
const rb = await H.callWorker(env, { method: "GET", path: "/stats-summary", headers: { Authorization: "Bearer admin-secret" }, origin: null });
const bal = rb.json.ai_usage.balance;
A.check("餘額估算：有最近24小時花費與還能撐的小時數", bal && bal.last24_usd > 0 && bal.hours_left > 0 && bal.hours_left === Math.round(bal.remaining_usd / (bal.last24_usd / 24) * 10) / 10, bal);
const r = await H.callWorker(env, { method: "GET", path: "/stats-summary", headers: { Authorization: "Bearer admin-secret" }, origin: null });
const L = r.json.limits || [];
const val = (label) => (L.find(x => x.label === label) || {}).value;
A.check("limits 清單有內容、每項都有分組與說明", L.length >= 25 && L.every(x => x.group && x.label && "value" in x && "source" in x), L.length);
A.check("後台可調的值讀目前設定：名額135、檢查點200、每日花費4000、啟程禮20", val("每日新玩家名額") === 135 && val("累計入場檢查點") === 200 && val("每日花費上限") === 4000 && val("每日啟程禮發放上限") === 20, L.slice(0, 5));
A.check("程式固定的值：每日補點5、未綁啟程禮25、每帳號2段人生、重新生成9次", val("每日補點") === 5 && val("未綁信箱的啟程禮") === 25 && val("每個帳號最多人生段數") === 2 && val("同一回合最多重新生成") === 9);
A.check("後台可調的項目都標了設定名稱", L.filter(x => x.source === "後台可調").every(x => x.var));
env.DAILY_SPEND_CAP = "1234";
const r2 = await H.callWorker(env, { method: "GET", path: "/stats-summary", headers: { Authorization: "Bearer admin-secret" }, origin: null });
A.check("改了設定值，清單馬上跟著變（不是另存一份）", r2.json.limits.find(x => x.label === "每日花費上限").value === 1234);
env.DAILY_SPEND_CAP = "4000";

const { JSDOM, VirtualConsole } = await import("jsdom");
const html = (await H.callWorker(env, { method: "GET", path: "/dashboard", origin: null })).text;
const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e && e.message || e)));
const dom = new JSDOM(html, { url: "https://life-game.smile80275.workers.dev/dashboard", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.sessionStorage.setItem("lifegame_dash_token", "admin-secret");
    w.fetch = (p, o) => worker.fetch(new Request("https://life-game.smile80275.workers.dev" + p, { headers: (o && o.headers) || {} }), env, { waitUntil() {} });
  } });
const w = dom.window, $ = id => w.document.getElementById(id);
await new Promise(res => setTimeout(res, 400));
A.check("有「攔截門檻」分頁按鈕，打開前面板隱藏", !!$("tabL") && $("paneL").hidden === true);
$("tabL").click(); await new Promise(res => setTimeout(res, 100));
const text = $("limBody").textContent.replace(/\s/g, "");
A.check("打開後列出分組與目前的值", $("paneL").hidden === false && /新玩家進場/.test(text) && /每日花費上限/.test(text) && /4,000/.test(text) && /DAILY_NEW_PLAYER_CAP/.test(text), text.slice(0, 300));
A.check("沒有項目超過八成時顯示「目前沒有項目超過八成」", /目前沒有項目超過八成/.test(text), text.slice(0, 200));
const ct = $("limCopy") && $("limCopy").value;
A.check("「複製給網頁版」：攔截門檻的整理文字含分組、目前值與設定名稱", !!w.document.querySelector('[data-copy="limCopy"]') && /【新玩家進場】/.test(ct) && /每日新玩家名額：135 位（後台可調 DAILY_NEW_PLAYER_CAP）/.test(ct), ct && ct.slice(0, 300));
A.check("後台首頁「AI 餘額還能撐」用小時顯示（不到48小時）", /AI 餘額還能撐[\s\S]*小時/.test($("report").textContent) && !/AI 餘額還能撐\s*—/.test($("report").textContent), $("report").textContent.replace(/\s+/g, " ").slice(0, 400));
A.check("網頁執行過程沒有程式錯誤", errors.length === 0, errors);
w.close();
process.exit(A.report() ? 0 : 1);
