// 2026-10-08 十、10.15 封測名額與候補（前端）：開始畫面名額顯示、第9／10／11／12／13則訊息、留信箱候補流程、啟程禮實際發出時才扣名額、
// 名額被搶走時顯示滿額訊息、輪到時登入開始人生領55點（jsdom＋真的worker.js＋假上游＋假Resend，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.15 前端：名額與候補");
const resend = H.makeFakeResend(); H.installUpstream(H.makeFakeAnthropic(), resend);
const worker = await H.loadWorker();
const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const TW0 = Date.parse("2026-10-10T00:00:00+08:00"), T0 = TW0 + 11 * HOUR; // 台灣10/10上午11:00起算；at(ms)＝距台灣10/10 00:00的時間
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false", DAILY_NEW_PLAYER_CAP: "1" });
const at = ms => { env.TEST_NOW_MS = String(TW0 + ms); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return v; await wait(15); } return false; }
const flag = { lifegame_entry_quota: "yes" };
const dev = async (extra) => H.loadGame({ useMock: true, env, key: null, cloud: false, storage: Object.assign({}, flag, extra || {}) });
const txt = (g, sel) => (g.win.document.querySelector(sel)?.textContent || "").replace(/\s+/g, "");
const tick = async () => { const w = []; await worker.scheduled({ cron: "0 * * * *" }, env, { waitUntil: p => w.push(p) }); await Promise.all(w); };
// 走完留信箱候補／登入的信箱流程
async function emailFlow(g, mode, email) {
  const doc = g.win.document;
  g.ev(`openAccountFlow(${JSON.stringify(mode)})`);
  doc.getElementById("acct-email").value = email;
  doc.getElementById("btn-acct-send").click();
  await until(() => doc.getElementById("acct-code"));
  doc.getElementById("acct-code").value = resend.lastCode(email);
  doc.getElementById("btn-acct-verify").click();
  await until(() => !doc.getElementById("account-modal"));
  await wait(60);
}
// 在新裝置上開一段新人生(跑到 startLife)：回傳game
async function beginLife(g) {
  g.ev(`state = newRoll(null, {name:"林小晴", gender:"女"}); state.spendingHabit="普通"; state.mealArrangement="家裡煮"; if(!localStorage.getItem(RECOVERY_KEY_STORAGE_NAME)){ localStorage.setItem(RECOVERY_KEY_STORAGE_NAME, generateRecoveryKey()); }`);
  await g.ev("startLife()");
  await H.waitIdle(g, 20);
}

// ---- 1. 新玩家開始畫面：有名額 ----
const g1 = await dev();
const d1 = g1.win.document;
await until(() => d1.getElementById("home-entry")?.textContent);
A.check("開始畫面：有名額時顯示「今日封測名額　剩 1／1」", d1.getElementById("home-entry").textContent === "今日封測名額　剩 1／1", d1.getElementById("home-entry").textContent);
// 第1位：開始新人生通過檢查，進到取名畫面；啟程禮實際發出時才扣名額
d1.getElementById("btn-home-new").click();
await until(() => g1.ev("state.phase") === "identity");
A.check("名額夠：按開始一段人生→進入取名畫面（沒有滿額訊息）", g1.ev("state.phase") === "identity" && !d1.getElementById("entry-full-modal"));
let st = (await H.callWorker(env, { method: "GET", path: "/entry/status" })).json;
A.check("只是按了開始、還沒領啟程禮：不扣名額", st.open === true && st.remaining === 1, st);
await beginLife(g1);
st = (await H.callWorker(env, { method: "GET", path: "/entry/status" })).json;
A.check("啟程禮實際發出（人生正式開始）才扣名額：25點、名額剩0", g1.ev("state.phase") === "playing" && g1.ev("state.ap.gift") === 25 && st.open === false && st.remaining === 0, [g1.ev("state.phase"), st]);

// ---- 2. 第2位：名額已滿，看到第9則 ----
const g2 = await dev();
const d2 = g2.win.document;
await until(() => d2.getElementById("home-entry")?.textContent);
A.check("開始畫面：名額用完顯示「今日名額已滿，可留信箱候補」", d2.getElementById("home-entry").textContent === "今日名額已滿，可留信箱候補", d2.getElementById("home-entry").textContent);
d2.getElementById("btn-home-new").click();
await until(() => d2.getElementById("entry-full-modal"));
const t9 = txt(g2, "#entry-full-modal");
A.check("第9則文字：稿紙發完、留下信箱輪到時寄信、保留 3 天、信箱用途", t9.includes("撰稿人今天準備的稿紙已經發完了。") && t9.includes("留下信箱，輪到你時會寄信通知，位子會為你保留3天。") && t9.includes("信箱只用來通知名額、保存進度和找回帳號。"), t9);
A.check("第9則按鈕：〔留下信箱候補〕〔先不用〕，下方有「已經有帳號？用信箱登入」與隱私說明", d2.getElementById("btn-entry-join").textContent === "留下信箱候補" && d2.getElementById("btn-entry-skip").textContent === "先不用" && d2.getElementById("link-entry-login").textContent === "已經有帳號？用信箱登入" && !!d2.querySelector("#entry-full-modal .privacy-link"));
A.check("沒進到取名畫面、沒有領啟程禮", g2.ev("state.phase") !== "identity");
d2.getElementById("btn-entry-skip").click();
A.check("〔先不用〕關閉訊息", !d2.getElementById("entry-full-modal"));
d2.getElementById("btn-home-new").click();
await until(() => d2.getElementById("entry-full-modal"));
d2.getElementById("btn-entry-join").click();
A.check("〔留下信箱候補〕→信箱流程（標題「留下信箱候補」，寫明信箱用途）", txt(g2, "#account-modal h3") === "留下信箱候補" && txt(g2, "#account-modal").includes("信箱只用來通知名額、保存進度和找回帳號。"));
d2.getElementById("acct-email").value = "wait1@example.com";
d2.getElementById("btn-acct-send").click();
await until(() => d2.getElementById("acct-code"));
d2.getElementById("acct-code").value = resend.lastCode("wait1@example.com");
d2.getElementById("btn-acct-verify").click();
await until(() => d2.getElementById("entry-joined-modal"));
const t11 = txt(g2, "#entry-joined-modal");
A.check("第11則：撰稿人把你記在候補名單上了、目前排在第 1 位、輪到時會寄信", t11.includes("撰稿人把你記在候補名單上了。") && t11.includes("你目前排在第1位，輪到時會寄信到你的信箱。") && d2.getElementById("btn-entry-joined-ok").textContent === "好的", t11);
d2.getElementById("btn-entry-joined-ok").click();
await until(() => /候補名單/.test(d2.getElementById("home-entry")?.textContent || ""));
A.check("開始畫面改顯示候補順位", /目前排在第 1 位/.test(d2.getElementById("home-entry").textContent), d2.getElementById("home-entry").textContent);
d2.getElementById("btn-home-new").click();
await until(() => d2.getElementById("entry-waiting-modal"));
A.check("排隊中再打開並按開始：短提示「撰稿人提醒你，你還在候補名單上，目前排在第 1 位。」，不能開始", txt(g2, "#entry-waiting-modal").includes("撰稿人提醒你，你還在候補名單上，目前排在第1位。") && g2.ev("state.phase") !== "identity");
d2.getElementById("btn-entry-waiting-ok").click();

// ---- 3. 名額在玩家填角色時被別人用完：實際發啟程禮前再確認 ----
const envCap = env.DAILY_NEW_PLAYER_CAP; env.DAILY_NEW_PLAYER_CAP = "2"; // 讓第3位的開始畫面看得到名額
at(DAY + 10 * 60 * 1000); // 隔天00:10：候補第1位(wait1)被分配掉1個，剩下1個給直接來的
const g3 = await dev();
const d3 = g3.win.document;
await until(() => d3.getElementById("home-entry")?.textContent);
d3.getElementById("btn-home-new").click();
await until(() => g3.ev("state.phase") === "identity");
A.check("隔天：候補優先分配後，還剩的名額給直接來的新玩家（第3位通過檢查）", g3.ev("state.phase") === "identity" && !d3.getElementById("entry-full-modal"));
// 在第3位填角色的時候，名額被另一位搶走
const g4 = await dev();
await beginLife(g4);
A.check("(另一位搶走最後的名額並開始人生)", g4.ev("state.phase") === "playing");
await beginLife(g3);
A.check("名額被用完：開始時看到第9則，人生沒有開始、沒有領啟程禮", !!d3.getElementById("entry-full-modal") && g3.ev("state.phase") !== "playing" && g3.ev("state.ap.gift") !== 25 && g3.ev("state.name") === "林小晴", [g3.ev("state.phase"), g3.ev("state.ap.gift")]);
A.check("已填的角色設定保留（姓名、生活方式還在）", g3.ev("state.spendingHabit") === "普通");
env.DAILY_NEW_PLAYER_CAP = envCap;

// ---- 4. 輪到了：中午寄信→登入→第13則→開始人生領55點 ----
at(DAY + 12 * HOUR); await tick();
const mail = resend.notices().find(m => m.to === "wait1@example.com");
A.check("中午12:00寄出候補通知信", !!mail && mail.subject === "人生草稿：輪到你了");
d2.getElementById("btn-home-new").click();
await until(() => d2.getElementById("entry-ready-modal"));
const t13 = txt(g2, "#entry-ready-modal");
A.check("第13則：位子準備好了、啟程禮 55 點已經放進錢包、按鈕〔開始人生〕", t13.includes("撰稿人為你留的位子準備好了。") && t13.includes("啟程禮55點已經放進錢包。") && d2.getElementById("btn-entry-ready-start").textContent === "開始人生", t13);
d2.getElementById("btn-entry-ready-start").click();
await until(() => g2.ev("state.phase") === "identity");
A.check("按〔開始人生〕→進取名畫面（不再重複檢查名額）", g2.ev("state.phase") === "identity");
await beginLife(g2);
A.check("入場開始人生：帳號人生、錢包55點（25＋30）", g2.ev("state.phase") === "playing" && !!g2.ev("state.acct") && g2.ev("acct.wallet.total") === 55 && g2.ev("acct.wl.status") === "entered", [g2.ev("state.phase"), g2.ev("acct && acct.wallet.total")]);

// ---- 5. 位子過期：第12則 ----
const g5 = await dev();
const d5 = g5.win.document;
env.DAILY_NEW_PLAYER_CAP = "1";
await until(() => d5.getElementById("home-entry")?.textContent);
d5.getElementById("btn-home-new").click();
await until(() => d5.getElementById("entry-full-modal"));
d5.getElementById("btn-entry-join").click();
d5.getElementById("acct-email").value = "wait2@example.com";
d5.getElementById("btn-acct-send").click();
await until(() => d5.getElementById("acct-code"));
d5.getElementById("acct-code").value = resend.lastCode("wait2@example.com");
d5.getElementById("btn-acct-verify").click();
await until(() => d5.getElementById("entry-joined-modal"));
d5.getElementById("btn-entry-joined-ok").click();
at(2 * DAY + 12 * HOUR); await tick(); // wait2被分配並寄信
at(2 * DAY + 12 * HOUR + 73 * HOUR); // 過了72小時沒入場
d5.getElementById("btn-home-new").click();
await until(() => d5.getElementById("entry-expired-modal"));
const t12 = txt(g5, "#entry-expired-modal");
A.check("第12則：位子已經過期了、可以重新候補（當天名額已被用掉時按鈕是〔重新候補〕）", t12.includes("撰稿人為你保留的位子已經過期了。") && (t12.includes("還想玩的話，可以重新候補。") || t12.includes("今天還有名額，可以直接開始。")), t12);
const goBtn = d5.getElementById("btn-entry-expired-go").textContent;
A.check("按鈕與第二行一致（有名額＝〔開始人生〕＋『今天還有名額』；沒名額＝〔重新候補〕）", (goBtn === "開始人生") === t12.includes("今天還有名額，可以直接開始。"), goBtn);
if (goBtn === "重新候補") {
  d5.getElementById("btn-entry-expired-go").click();
  await until(() => d5.getElementById("entry-waiting-modal"));
  A.check("重新候補：排到隊尾、不用重新驗證（看到排隊短提示）", /目前排在第\d+位/.test(txt(g5, "#entry-waiting-modal")));
} else {
  d5.getElementById("btn-entry-expired-go").click();
  await until(() => g5.ev("state.phase") === "identity");
  A.check("有名額：〔開始人生〕直接入場，進取名畫面", g5.ev("state.phase") === "identity");
}

// ---- 6. 示範模式／沒開旗標：完全不檢查 ----
const g6 = await H.loadGame({ useMock: true, env, key: null, cloud: false });
await wait(50);
A.check("示範模式（沒開旗標）：開始畫面不顯示名額、按開始直接進取名畫面", g6.win.document.getElementById("home-entry").textContent === "" && (g6.win.document.getElementById("btn-home-new").click(), await until(() => g6.ev("state.phase") === "identity")));
A.check("頁面沒有跳出任何錯誤", g1.errors.length + g2.errors.length + g3.errors.length === 0, [...g1.errors, ...g2.errors, ...g3.errors].map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
