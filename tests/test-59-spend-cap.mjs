// 2026-09-30：十、10.9.3.1／10.9.3.2 全站每日花費上限擋人、管理通知信（80%、上限；啟程禮15份、發滿）、從未購買過的判斷（全程假Resend、假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("花費上限與管理通知信");
let upstreamFail = false;
const fakeAI = H.makeFakeAnthropic({ fail: () => upstreamFail });
const resend = H.makeFakeResend();
H.installUpstream(fakeAI, resend);

const T0 = Date.parse("2026-09-30T03:00:00Z");
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0) });
const MIN = 60 * 1000, DAY = 24 * 60 * MIN;
const setNow = ms => { env.TEST_NOW_MS = String(T0 + ms); };
const post = (path, body, headers) => H.callWorker(env, { path, body, headers });
const get = (path, headers) => H.callWorker(env, { method: "GET", path, headers });
const auth = t => ({ Authorization: "Bearer " + t });
const payload = (extra) => JSON.stringify(Object.assign({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false }, extra || {}));
let seq = 0;
const anonTurn = (extra) => post("/", { key: "capkey" + (++seq), slot: 0, turn_nonce: "cap" + seq + "xxxxxxx", life_id: "lifecap" + seq, messages: [{ role: "user", content: payload(extra) }] });
const walletTurn = (token, extra) => post("/", { wallet: true, turn_nonce: "wal" + (++seq) + "xxxxxx", life_id: "lifewal" + seq, messages: [{ role: "user", content: payload(extra) }] }, auth(token));
const today = () => get("/usage-today", { Authorization: "Bearer admin-secret" }).then(r => r.json);
let ipn = 0;
async function bind(email, key) {
  await post("/account/send-code", { email }, { "CF-Connecting-IP": "10.8." + (++ipn) + ".1" });
  return (await post("/account/bind", { email, code: resend.lastCode(email), key, lives: [{ lid: "life" + key.toLowerCase().replace(/[^a-z0-9]/g, ""), pool: { daily: 5, gift: 20 } }] })).json;
}
const notice = (sub) => resend.notices().filter(x => x.subject.includes(sub));

// ================= 上限暫調為1 =================
env.DAILY_SPEND_CAP = "1";
let t = await today();
A.check("上限設定值：DAILY_SPEND_CAP=1 生效、預設估價1元", t.daily_spend_cap_twd === 1 && t.est_cost_per_call_twd === 1 && t.est_cost_twd === 0, t);
const acct = await bind("cap@example.com", "CAPKEY");
const tok = acct.token, walletBefore = acct.account.wallet.total;
let r = await anonTurn();
A.check("碰到上限前：第1次AI呼叫照常(這次呼叫本身讓花費到達1元)", r.status === 200, r.status);
t = await today();
A.check("花費計數：1次成功呼叫＝1元、已達上限、暫停從未購買過的帳號", t.calls === 1 && t.est_cost_twd === 1 && t.paused_for_never_purchased === true, t);
const callsAtCap = fakeAI.calls.length;
r = await anonTurn();
A.check("碰到上限後：未綁信箱(從未購買過)的回合→503 daily_cap_reached，沒有呼叫Anthropic", r.status === 503 && r.json.error.type === "daily_cap_reached" && r.json.lifegame.daily_cap === true && fakeAI.calls.length === callsAtCap, r);
r = await walletTurn(tok);
A.check("碰到上限後：已綁信箱但從未購買過的帳號→同樣暫停，且錢包沒有扣點", r.status === 503 && r.json.error.type === "daily_cap_reached" && (await get("/account/me", auth(tok))).json.account.wallet.total === walletBefore, r);
r = await anonTurn({ time_context: { is_prologue: true } });
A.check("碰到上限後：開場回合也被擋(不分是否扣點)", r.status === 503, r.status);
const otherKinds = [
  { kind: "chapter", messages: [{ role: "user", content: JSON.stringify({ player_name: "x", stage_label: "高中", chapter_index: 1, age_from: 15, age_to: 18, turn_summaries: [{ s: "a" }], major_events: [] }) }], key: "capkeyc", slot: 0, life_id: "lifecapc", chapter_id: "chap0001" },
  { kind: "idle_summary", messages: [{ role: "user", content: JSON.stringify({ idle_rounds: [{ line: "a" }], key_rounds: [] }) }], key: "capkeyc", slot: 0, life_id: "lifecapc" },
  { kind: "life_review", messages: [{ role: "user", content: JSON.stringify({ stages: [{ stage: "a" }], tidbits: [] }) }], key: "capkeyc", slot: 0, life_id: "lifecapc" }
];
for (const b of otherKinds) { const x = await post("/", b); A.check("碰到上限後：" + b.kind + "也被暫停(不扣點的免費呼叫一律算)", x.status === 503 && x.json.error.type === "daily_cap_reached", x.status); }
A.check("(被擋的呼叫沒有寄出任何Anthropic請求)", fakeAI.calls.length === callsAtCap);
r = await get("/gate");
A.check("GET /gate：未登入→paused", r.json.success && r.json.paused === true, r.json);
r = await get("/gate", auth(tok));
A.check("GET /gate：已綁信箱但從未購買過→paused", r.json.paused === true, r.json);
r = await get("/account/me", auth(tok));
A.check("暫停只擋AI呼叫：登入、錢包、帳號照常可用", r.status === 200 && r.json.account.wallet.total === walletBefore);
r = await post("/account/send-code", { email: "still-works@example.com" });
A.check("暫停只擋AI呼叫：寄驗證碼照常", r.status === 200);

// ---- 通知信 ----
const n80 = notice("已達上限的 80%"), n100 = notice("已碰到上限");
A.check("通知信：達80%與碰到上限各寄一封(cap=1兩個門檻同時到)，寄給ADMIN_NOTIFY_EMAIL", n80.length === 1 && n100.length === 1 && n80[0].to === "admin@example.com" && n100[0].to === "admin@example.com", resend.notices().map(x => x.subject));
A.check("通知信：80%主旨「人生草稿：今日花費已達上限的 80%」，內文有估計花費、上限、台灣時間、狀態", n80[0].subject === "人生草稿：今日花費已達上限的 80%" && /今日估計花費：1 元/.test(n80[0].text) && /目前上限：1 元/.test(n80[0].text) && /2026\/09\/30 11:00（台灣時間）/.test(n80[0].text) && /已達上限的 80%/.test(n80[0].text), n80[0].text);
A.check("通知信：碰到上限主旨「人生草稿：今日花費已碰到上限」，多一句暫停說明", n100[0].subject === "人生草稿：今日花費已碰到上限" && n100[0].text.includes("已暫停從未購買過的帳號的 AI 呼叫，台灣時間午夜自動恢復。"), n100[0].text);
const noticeCount = resend.notices().length;
await anonTurn(); await anonTurn(); await get("/gate");
A.check("每個門檻每日只寄一次：之後再被擋、再查都不重寄", resend.notices().length === noticeCount);

// ---- 有購買紀錄的帳號不受影響 ----
const accId = [...env.ACCOUNTS._store.keys()].filter(k => k.startsWith("a:")).find(k => env.ACCOUNTS._store.get(k).email === "cap@example.com");
const rec = env.ACCOUNTS._store.get(accId); rec.purchased = true; env.ACCOUNTS._store.set(accId, rec);
r = await walletTurn(tok);
A.check("有購買紀錄的帳號：碰到上限後仍可呼叫AI(照常扣點)", r.status === 200 && r.json.lifegame.wallet.total === walletBefore - 1, r.json.lifegame);
r = await get("/gate", auth(tok));
A.check("GET /gate：有購買紀錄→不暫停", r.json.paused === false);
A.check("(有購買紀錄的呼叫也照樣計入花費，不分是否購買)", (await today()).est_cost_twd === 2);
rec.purchased = false; env.ACCOUNTS._store.set(accId, rec);

// ---- 當天調高上限→立刻解除；通知標記不因調整上限重置 ----
env.DAILY_SPEND_CAP = "500";
r = await anonTurn();
A.check("當天把上限調高(高於目前花費)→暫停立刻解除", r.status === 200, r.status);
A.check("調整上限不重置「已通知」標記：沒有再寄", resend.notices().length === noticeCount);
env.DAILY_SPEND_CAP = "3";
r = await anonTurn();
A.check("又把上限調低到低於目前花費→再度暫停", r.status === 503, r.status);
// 午夜歸零
setNow(DAY);
env.DAILY_SPEND_CAP = "1";
t = await today();
A.check("台灣時間午夜：花費計數歸零、暫停自動解除", t.date === "2026-10-01" && t.est_cost_twd === 0 && (await anonTurn()).status === 200);
A.check("午夜歸零後通知標記也歸零：當天再碰到上限再寄一輪(各一封)", notice("已達上限的 80%").length === 2 && notice("已碰到上限").length === 2, resend.notices().map(x => x.subject));

// ---- 失敗的呼叫也計入(2026-10-02定案A3)；80%門檻依當下上限自動計算 ----
setNow(2 * DAY);
env.DAILY_SPEND_CAP = "10";
upstreamFail = true; await anonTurn(); await anonTurn(); upstreamFail = false;
A.check("Anthropic失敗的呼叫也計入花費(2次＝2元)", (await today()).est_cost_twd === 2);
const base80 = notice("已達上限的 80%").length;
for (let i = 0; i < 5; i++) await anonTurn();
A.check("cap=10、花費7元(失敗2＋成功5)：還沒到80%，不寄信", notice("已達上限的 80%").length === base80 && (await today()).pct_of_cap === 70);
await anonTurn();
A.check("花費8元＝上限10元的80%→寄80%通知(依當下設定的上限自動計算)", notice("已達上限的 80%").length === base80 + 1 && notice("已碰到上限").length === 2, resend.notices().map(x => x.subject));
await anonTurn(); await anonTurn();
A.check("花費到10元→再寄上限通知", notice("已碰到上限").length === 3);
r = await anonTurn();
A.check("cap=10、花費10元：下一次被擋", r.status === 503);

// ---- 每次估價可調 ----
setNow(3 * DAY);
env.DAILY_SPEND_CAP = "100"; env.AI_CALL_COST_ESTIMATE = "2.5";
await anonTurn(); await anonTurn();
t = await today();
A.check("AI_CALL_COST_ESTIMATE=2.5：2次呼叫＝5元", t.est_cost_twd === 5 && t.est_cost_per_call_twd === 2.5, t);
delete env.AI_CALL_COST_ESTIMATE;

// ---- 寄信失敗：下一次AI呼叫重試，同一封每日最多3次 ----
setNow(4 * DAY);
env.DAILY_SPEND_CAP = "2";
const mailsBefore = resend.notices().length;
resend.failNext(99); // 管理通知信全部寄失敗
await anonTurn(); await anonTurn(); // 到達上限(第2次讓80%與上限同時到達；第1次1元＝50%)
await anonTurn(); // 被擋，但閘門會重試
await anonTurn(); await anonTurn();
t = await today();
A.check("寄信失敗：沒有記成已通知、同一封每日最多嘗試3次(80%與上限各3次)", t.notices.spend80.sent === false && t.notices.spend80.attempts === 3 && t.notices.spend100.attempts === 3 && resend.notices().length === mailsBefore, t.notices);
resend.failNext(0);
await anonTurn();
t = await today();
A.check("嘗試3次用完就不再試(當天不會無限重試)", t.notices.spend80.attempts === 3 && resend.notices().length === mailsBefore);
setNow(5 * DAY);
env.DAILY_SPEND_CAP = "2";
resend.failNext(2); // 第一次嘗試(80%與上限兩封)都失敗，之後恢復
await anonTurn(); await anonTurn();
await anonTurn(); // 被擋的這次會重試
t = await today();
A.check("寄信失敗後於下一次AI呼叫重試，成功才記「已通知」", t.notices.spend80.sent === true && t.notices.spend100.sent === true, t.notices);

// ================= 啟程禮通知：15份、發滿 =================
setNow(6 * DAY);
env.DAILY_SPEND_CAP = "500"; env.DAILY_GIFT_CAP = "17";
const g15Before = notice("已發 15 份").length, fullBefore = notice("已發滿").length;
for (let i = 0; i < 14; i++) await bind("gift" + i + "@example.com", "GIFTKEY" + i);
A.check("啟程禮發到14份：還沒通知", notice("已發 15 份").length === g15Before);
await bind("gift14@example.com", "GIFTKEY14");
const g15 = notice("已發 15 份");
A.check("啟程禮發到15份：寄一封「人生草稿：今日啟程禮已發 15 份」，內文有已發份數、目前上限、排隊人數、台灣時間", g15.length === g15Before + 1 && g15[g15.length - 1].to === "admin@example.com" && /今日已發份數：15 份/.test(g15[g15.length - 1].text) && /目前上限：17 份/.test(g15[g15.length - 1].text) && /排隊人數：0 人/.test(g15[g15.length - 1].text) && /台灣時間/.test(g15[g15.length - 1].text), g15.map(x => x.text));
await bind("gift15@example.com", "GIFTKEY15");
A.check("發到16份：不再寄15份那封", notice("已發 15 份").length === g15Before + 1);
await bind("gift16@example.com", "GIFTKEY16");
const full = notice("已發滿");
A.check("發滿17份：寄「人生草稿：今日啟程禮已發滿」", full.length === fullBefore + 1 && /今日已發份數：17 份/.test(full[full.length - 1].text), full.map(x => x.text));
await bind("gift17@example.com", "GIFTKEY17");
A.check("發滿後又有人綁定(排隊)：不重寄，但排隊人數已計入", notice("已發滿").length === fullBefore + 1 && (await today()).gifts.queued === 1, await today());
setNow(7 * DAY + 5 * MIN);
await get("/gate");
r = await bind("gift18@example.com", "GIFTKEY18");
A.check("隔天：計數與通知標記歸零，排隊者補發後才輪到新綁定", r.result.gift.status === "granted", r.result);
A.check("啟程禮發放上限與每日花費上限是兩個獨立的設定值", (await today()).daily_gift_cap === 17);
delete env.DAILY_GIFT_CAP;
const ctxErrs = [];
process.exit(A.report() ? 0 : 1);
