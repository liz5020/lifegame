// 2026-10-08 十、10.9.3.1a補充二：全站每日花費改用「實際花費」加總；每次呼叫前判斷「當日花費＋這次預估」是否達上限，
// 預估＝近7天每次呼叫的實際平均花費，近7天呼叫少於SPEND_ESTIMATE_MIN_CALLS(初始100)次時用固定估價（全程假上游，不打真實API）
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("花費上限：實際花費與預估");
let usage = { ...H.ONE_TWD_USAGE, output_tokens: 6250 }; // 剛好2元
let fail = false;
H.installUpstream(H.makeFakeAnthropic({ usage: () => usage, fail: () => fail }));
const T0 = Date.parse("2026-10-08T03:00:00Z"), DAY = 86400000;
const mk = (extra) => H.makeAccountEnv(Object.assign({ TEST_NOW_MS: String(T0) }, extra || {}));
const payload = JSON.stringify({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false });
let seq = 0;
const turn = (env) => H.callWorker(env, { body: { key: "k" + (++seq), slot: 0, turn_nonce: "n" + seq + "xxxxxxxx", life_id: "life" + seq, messages: [{ role: "user", content: payload }] } });
const today = (env) => H.callWorker(env, { method: "GET", path: "/usage-today", origin: null, headers: { Authorization: "Bearer admin-secret" } }).then(r => r.json);

// 1. 成功的呼叫記實際花費（2元），不是固定估價
let env = await mk({ DAILY_SPEND_CAP: "500" });
await turn(env); await turn(env);
let t = await today(env);
A.check("成功的呼叫記實際花費：2次×2元＝4元（不是固定估價）", t.calls === 2 && t.est_cost_twd === 4, t);
A.check("近7天只有2次、少於100次：預估用固定估價（1元）", t.estimate_source === "fixed" && t.est_cost_per_call_twd === 1 && t.recent_7d_calls === 2, t);

// 2. 近7天呼叫次數夠多：預估用實際平均
env = await mk({ DAILY_SPEND_CAP: "11.5", SPEND_ESTIMATE_MIN_CALLS: "5" });
for (let i = 0; i < 5; i++) await turn(env);
t = await today(env);
A.check("5次×2元＝10元；近7天達5次→預估改用實際平均（2元）", t.est_cost_twd === 10 && t.estimate_source === "actual" && t.est_cost_per_call_twd === 2 && t.recent_7d_calls === 5, t);
A.check("花費10＋預估2＝12 ≥ 上限11.5 → 暫停從未購買過的帳號（還沒花到上限就擋）", t.paused_for_never_purchased === true, t);
let r = await turn(env);
A.check("下一次呼叫被擋：503 daily_cap_reached", r.status === 503 && r.json.error.type === "daily_cap_reached", r.status);
env = await mk({ DAILY_SPEND_CAP: "11.5" }); // 沒有調整門檻（預設100次）
for (let i = 0; i < 5; i++) await turn(env);
t = await today(env);
A.check("同樣花10元：近7天不到100次→預估用固定1元，10＋1＝11 < 11.5 → 還沒暫停", t.estimate_source === "fixed" && t.paused_for_never_purchased === false, t);
r = await turn(env);
A.check("所以這次呼叫放行", r.status === 200, r.status);

// 3. 預估只看近7天
env = await mk({ DAILY_SPEND_CAP: "500", SPEND_ESTIMATE_MIN_CALLS: "3" });
for (let i = 0; i < 3; i++) await turn(env);
env.TEST_NOW_MS = String(T0 + 3 * DAY); t = await today(env);
A.check("3天後（仍在7天內）：預估用實際平均", t.estimate_source === "actual" && t.est_cost_per_call_twd === 2, t);
env.TEST_NOW_MS = String(T0 + 8 * DAY); t = await today(env);
A.check("8天後：舊資料超過7天不算，近7天呼叫次數少於門檻→改回固定估價", t.estimate_source === "fixed" && t.recent_7d_calls === 0, t);

// 4. 失敗的呼叫（伺服器沒回報用量）照這次預估計入
env = await mk({ DAILY_SPEND_CAP: "500", SPEND_ESTIMATE_MIN_CALLS: "3" });
for (let i = 0; i < 3; i++) await turn(env);   // 實際平均2元
fail = true; await turn(env); fail = false;
t = await today(env);
A.check("失敗呼叫照預估計入：3次成功6元＋1次失敗按近7天平均2元＝8元", t.calls === 4 && t.est_cost_twd === 8, t);

// 5. 設定值放後台、不寫進wrangler.toml；通知信的金額取兩位小數
const toml = fs.readFileSync(new URL("../worker/wrangler.toml", import.meta.url), "utf8");
A.check("SPEND_ESTIMATE_MIN_CALLS 只放Cloudflare後台，沒有寫進wrangler.toml的設定值", !/^\s*SPEND_ESTIMATE_MIN_CALLS\s*=/m.test(toml));
const { noticeMail } = await import("../worker/mail.js");
A.check("通知信金額不會出現一長串小數", /今日估計花費：10\.33 元/.test(noticeMail("spend80", { spent: 10.3333333, cap: 12, now: T0 }).text), noticeMail("spend80", { spent: 10.3333333, cap: 12, now: T0 }).text);
process.exit(A.report() ? 0 : 1);
