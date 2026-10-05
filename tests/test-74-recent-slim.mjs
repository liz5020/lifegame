// 十、10.14.8補充(2026-10-05)近況縮減：最近3回合只有上一回合送原文，前第2、3回合送turn_summary；
// 沒有摘要的回合送原文；退路(2回合原文＋1回合摘要)。全程假上游，不打真實API
import * as H from "./harness.mjs";
import { TURN_SYSTEM_PROMPT } from "../worker/prompt.js";
const A = H.makeAsserter("近況縮減(10.14.8補充)");

const fake = H.makeFakeAnthropic({ turnOverride: () => ({ turn_summary: "這回合的摘要" + Math.random().toString(36).slice(2, 8) + "，比原文短很多" }) });
H.installUpstream(fake);
const env = H.makeEnv({ AP_TEST_KEYS: H.loc("recentkey") });
const g = await H.loadGame({ useMock: false, env, key: "recentkey", dev: true });
g.win.localStorage.setItem("lifegame_ap_test_free", "yes");
await H.startNewLife(g);
const turnBodies = () => fake.calls.filter(c => c.tool_choice && c.tool_choice.name === "submit_turn_result");
const lastPayload = () => H.turnPayloadFromBody(turnBodies().slice(-1)[0]);
const logs = () => g.ev("state.log.map(e=>({text:e.text, sum:e.turnSummary||''}))");

A.check("預設RECENT_FULL_TEXT_TURNS＝1(定案)、近況範圍仍是3回合＋6則摘要", g.ev("RECENT_FULL_TEXT_TURNS") === 1 && g.ev("RECENT_CONTEXT_TURNS") === 3 && g.ev("RECENT_SUMMARY_TURNS") === 6);

// 人生剛開始：有幾回合送幾回合
let L = logs();
await H.playTurn(g, "讀書");
let p = lastPayload();
A.check("34.24#19 只有1則日記時：只送那一則原文、沒有摘要", L.length === 1 && JSON.stringify(p.recent_turns_full) === JSON.stringify([L[0].text]) && !(p.recent_turns_summary && p.recent_turns_summary.length), { n: L.length, p: [p.recent_turns_full, p.recent_turns_summary] });
L = logs();
await H.playTurn(g, "讀書");
p = lastPayload();
A.check("34.24#19 有2則日記時：上一則原文＋前一則摘要", L.length === 2 && JSON.stringify(p.recent_turns_full) === JSON.stringify([L[1].text]) && JSON.stringify(p.recent_turns_summary) === JSON.stringify([L[0].sum || L[0].text]), { n: L.length });

for (let i = 0; i < 4; i++) await H.playTurn(g, "讀書");
L = logs();
await H.playTurn(g, "讀書");
p = lastPayload();
const n = L.length;
A.check("34.24#18 第N回合：N-1為原文", JSON.stringify(p.recent_turns_full) === JSON.stringify([L[n - 1].text]));
A.check("34.24#18 第N回合：N-2、N-3為turn_summary(摘要清單最後兩則，依時間順序)", JSON.stringify(p.recent_turns_summary.slice(-2)) === JSON.stringify([L[n - 3].sum, L[n - 2].sum]) && !!L[n - 3].sum && L[n - 3].sum !== L[n - 3].text);
A.check("10.14.8補充 更早的摘要範圍不變(最多6＋2則)", p.recent_turns_summary.length === Math.min(8, n - 1), { len: p.recent_turns_summary.length, n });

// 沒有turn_summary的回合送原文
g.ev("state.log[state.log.length-2].turnSummary=''");
L = logs();
await H.playTurn(g, "讀書");
p = lastPayload();
const m = L.length;
A.check("34.24#20 某回合沒有turn_summary：該回合改送原文", p.recent_turns_summary.slice(-1)[0] === L[m - 2].text && p.recent_turns_summary.slice(-2)[0] === L[m - 3].sum);

// 退路
g.ev("RECENT_FULL_TEXT_TURNS = 2");
L = logs();
await H.playTurn(g, "讀書");
p = lastPayload();
const k = L.length;
A.check("34.24#21 退路：N-1、N-2為原文，N-3為摘要", JSON.stringify(p.recent_turns_full) === JSON.stringify([L[k - 2].text, L[k - 1].text]) && p.recent_turns_summary.slice(-1)[0] === (L[k - 3].sum || L[k - 3].text));
g.ev("RECENT_FULL_TEXT_TURNS = 1");

// turn_summary不限40字
const longSum = "很長的本回合摘要".repeat(10); // 80字
const H2 = H.makeFakeAnthropic({ turnOverride: () => ({ turn_summary: longSum }) });
H.installUpstream(H2);
await H.playTurn(g, "讀書");
A.check("34.24#22 turn_summary不受40字截斷(存進日記的是完整80字)", g.ev("state.log[state.log.length-1].turnSummary") === longSum);

A.check("規則說明已改：recent_turns_full只給上一回合原文", /recent_turns_full只會給你上一回合的完整原文/.test(TURN_SYSTEM_PROMPT) && !/recent_turns_full（最近3回合）/.test(TURN_SYSTEM_PROMPT) && !/最近3回合的完整原文/.test(TURN_SYSTEM_PROMPT));
A.check("沒有錯誤", g.errors.length === 0, g.errors);
A.report();
g.win.close();
process.exit(0);
