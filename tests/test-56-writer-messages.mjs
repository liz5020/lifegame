// 2026-09-30：十、10.12 撰稿人訊息(第一批：第1、5、6、8則；第二批起點數用完跳窗未綁信箱改第2則、已綁信箱第1則)＋10.9.3.3全站用量計數(只記錄)＋10.12.6連線失敗不扣點（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("撰稿人訊息與用量計數");
let failing = false;
const fake = H.makeFakeAnthropic({ fail: () => failing, usage: () => H.ONE_TWD_USAGE });
H.installUpstream(fake);

// ---- Worker：假的Durable Object(記憶體)，驗證計數、跨日歸零、只有成功呼叫才算、管理密碼保護、設定值預設與覆寫 ----
const { UsageCounter } = await import("../worker/worker.js");
function fakeDO() {
  const store = new Map(); const st = { storage: { get: async k => store.get(k), put: async (k, v) => { store.set(k, v); } } };
  const inst = new UsageCounter(st);
  return { idFromName: n => n, get: () => ({ fetch: (u, init) => inst.fetch(new Request(u, init)) }) };
}
let nowMs = Date.parse("2026-09-30T03:00:00Z");
const env = H.makeEnv({ USAGE_COUNTER: fakeDO(), TEST_NOW_MS: String(nowMs) });
const payload = JSON.stringify({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false });
let seq = 0;
const turn = (key) => H.callWorker(env, { body: { key, slot: 0, turn_nonce: "w" + (++seq) + "xxxxxxx", life_id: "lifew" + key, messages: [{ role: "user", content: payload }] } });
await H.callWorker(env, { path: "/claim-gift", body: { key: "wa", slot: 0 } });
const today = () => H.callWorker(env, { method: "GET", path: "/usage-today", origin: null, headers: { Authorization: "Bearer admin-secret" } });
let r = await today();
A.check("用量：一開始0次、預設上限500元／20份", r.json.calls === 0 && r.json.daily_spend_cap_twd === 500 && r.json.daily_gift_cap === 20 && r.json.counter === true, r.json);
await turn("wa"); await turn("wa");
r = await today();
A.check("用量：2次成功呼叫＝2次、估計2元", r.json.calls === 2 && r.json.est_cost_twd === 2 && r.json.date === "2026-09-30", r.json);
failing = true; await turn("wa"); failing = false;
r = await today();
A.check("用量：Anthropic失敗的呼叫也計入(2026-10-02定案A3，共3次、3元)", r.json.calls === 3 && r.json.est_cost_twd === 3, r.json);
A.check("用量：沒帶管理密碼→401", (await H.callWorker(env, { method: "GET", path: "/usage-today", origin: null })).status === 401);
env.DAILY_SPEND_CAP_TWD = "300"; env.DAILY_GIFT_CAP = "10";
r = await today();
A.check("設定值：後台環境變數蓋過預設，並顯示百分比", r.json.daily_spend_cap_twd === 300 && r.json.daily_gift_cap === 10 && r.json.pct_of_cap === 1, r.json);
env.TEST_NOW_MS = String(Date.parse("2026-09-30T16:30:00Z")); // 台灣10/1 00:30
r = await today();
A.check("用量：台灣時間午夜歸零", r.json.date === "2026-10-01" && r.json.calls === 0, r.json);
const envNoDO = H.makeEnv({});
await H.callWorker(envNoDO, { path: "/claim-gift", body: { key: "wb", slot: 0 } });
const r2 = await H.callWorker(envNoDO, { body: { key: "wb", slot: 0, turn_nonce: "wbnonce0001", life_id: "lifewwb", messages: [{ role: "user", content: payload }] } });
A.check("沒有綁定計數器時，回合照常(計數失敗不影響遊戲)", r2.status === 200, r2.status);
const wr = JSON.stringify(await import("node:fs").then(f => f.readFileSync(new URL("../worker/wrangler.toml", import.meta.url), "utf8")));
A.check("wrangler.toml沒有寫兩個設定值(只放後台)", !/DAILY_SPEND_CAP_TWD\s*=|DAILY_GIFT_CAP\s*=/.test(JSON.parse(wr)));

// ---- 前端 ----
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "wri0000001" });
const ev = g.ev, doc = g.win.document;
await H.startNewLife(g);
await H.playTurn(g, "嗯");

// 第2則(未綁信箱，第二批起)：點數用完，多一段綁定說明；已綁信箱看第1則
ev("renderAPExhaustedModal()");
const m = doc.getElementById("ap-exhausted-modal");
const mt = m.textContent.replace(/\s+/g, "");
A.check("第2則：未綁信箱→文字＝點數用完／明天再領5點／綁定信箱可再領30點啟程禮、多開一段人生、換手機找得回進度／信箱只用來保存進度和找回帳號", mt.includes("撰稿人提醒你，今天的行動點用完了。") && mt.includes("明天打開遊戲會再領到5點。") && mt.includes("綁定信箱可以再領30點啟程禮，還能多開一段人生，換手機也找得回進度。") && mt.includes("信箱只用來保存進度和找回帳號。"), mt);
A.check("第2則：按鈕〔綁定信箱〕〔明天再來〕", m.querySelector("#btn-ap-exhausted-bind")?.textContent === "綁定信箱" && m.querySelector("#btn-ap-exhausted-ok")?.textContent === "明天再來");
m.querySelector("#btn-ap-exhausted-bind").click();
A.check("第2則：按〔綁定信箱〕→關掉提示、進綁定說明頁", !doc.getElementById("ap-exhausted-modal") && /綁定信箱/.test(doc.getElementById("account-modal")?.textContent || "") && /信箱只用來保存進度和找回帳號/.test(doc.getElementById("account-modal")?.textContent || ""));
ev("closeAccountFlow()");
ev("renderAPExhaustedModal()"); doc.getElementById("btn-ap-exhausted-ok").click();
A.check("第2則：按〔明天再來〕→關掉提示", !doc.getElementById("ap-exhausted-modal"));
ev("acct = { aid:'aaaa', email_masked:'ab***@x.com', recovery_key:'K', wallet:{ free:0, purchased:0, total:0, refill_cap:5 }, lives:[], gifts:{ claimed:1, queued:0, max:2 } }");
ev("renderAPExhaustedModal()");
const m1 = doc.getElementById("ap-exhausted-modal");
const m1t = m1.textContent.replace(/\s+/g, "");
A.check("第1則：已綁信箱→文字＝撰稿人提醒你，今天的行動點用完了／明天打開遊戲會再領到 5 點，到時再接著寫", m1t.includes("撰稿人提醒你，今天的行動點用完了。") && m1t.includes("明天打開遊戲會再領到5點，到時再接著寫。"), m1t);
A.check("第1則：按鈕〔打開錢包〕〔好的〕，沒有綁定信箱說明", m1.querySelector("#btn-ap-exhausted-wallet")?.textContent === "打開錢包" && m1.querySelector("#btn-ap-exhausted-ok")?.textContent === "好的" && !/綁定|啟程禮/.test(m1t));
m1.querySelector("#btn-ap-exhausted-wallet").click();
A.check("第1則：按〔打開錢包〕→關掉提示、打開錢包", !doc.getElementById("ap-exhausted-modal") && !!doc.getElementById("wallet-modal"));
doc.getElementById("wallet-modal")?.remove();
ev("acct = null");
ev("state.ap.daily = 0; state.ap.gift = 0; state.ap.purchased = 0; render()");
const out = doc.querySelector(".ap-out");
A.check("畫面底部的用完提示是撰稿人文字", !!out && /撰稿人提醒你，今天的行動點用完了。明天打開遊戲會再領到 5 點/.test(out.textContent), out && out.textContent);
ev("state.ap.daily = AP_DAILY_REFILL; render()");

// 第5則：存檔失敗
ev("showSaveFailToast()");
const t5 = doc.getElementById("sync-toast");
A.check("第5則：文字＋〔再試一次〕", /撰稿人剛剛沒能把這一頁收好。/.test(t5.textContent) && /請確認網路連線後再試一次，已經寫下的內容不會消失。/.test(t5.textContent) && t5.querySelector("#btn-save-retry")?.textContent === "再試一次");
t5.querySelector("#btn-save-retry").click();
A.check("第5則：按〔再試一次〕→小條收起", !doc.getElementById("sync-toast"));

// 第6則＋10.12.6：連線失敗、不扣點
const apBefore = ev("totalAP(state)");
failing = true;
await H.playTurn(g, "再來一回");
failing = false;
const errEntry = ev("state.log[state.log.length-1]");
A.check("第6則：錯誤那則日記文字＝撰稿人一時沒接上線，這一回合還沒扣點", /撰稿人一時沒接上線，這一回合還沒扣點。請稍等一下再送出一次。/.test(errEntry.text) && errEntry.error === true, errEntry);
ev("render()");
const err = doc.querySelector(".narrator-error");
A.check("第6則：畫面顯示同一段文字，按鈕〔再試一次〕(10.17.2)", !!err && /撰稿人一時沒接上線，這一回合還沒扣點/.test(err.textContent) && doc.getElementById("btn-retry-turn")?.textContent === "再試一次", err && err.textContent);
A.check("10.12.6：連線失敗不扣點(前後餘額相同)", ev("totalAP(state)") === apBefore, [apBefore, ev("totalAP(state)")]);

// 第8則：每日補點提示，只有實際補到點才出現
doc.getElementById("refill-toast")?.remove();
ev("state.ap.daily = 2; state.ap.lastRefillDate = '2000-01-01'; refillDailyIfNeeded(state)");
const t8 = doc.getElementById("refill-toast");
A.check("第8則：實際有補點→出現「撰稿人已經幫你備好今天的行動點了。」", !!t8 && t8.textContent === "撰稿人已經幫你備好今天的行動點了。");
t8?.remove();
ev("state.ap.daily = AP_DAILY_REFILL; state.ap.lastRefillDate = '2000-01-01'; refillDailyIfNeeded(state)");
A.check("第8則：餘額已達上限、沒有補點→不出現", !doc.getElementById("refill-toast"));
A.check("10.10.6：程式裡沒有「啟程點剩5點以下」提醒", !/剩.{0,4}5.{0,3}點.{0,6}(提醒|提示)/.test(ev("String(renderAPExhaustedModal)")));
const realErrors = g.errors.filter(e => !/fake upstream error/.test(String(e)));
A.check("頁面沒有非預期的腳本錯誤", realErrors.length === 0, realErrors.slice(0, 2).map(String));
process.exit(A.report() ? 0 : 1);
