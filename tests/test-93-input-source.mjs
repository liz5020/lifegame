// 2026-10-10：日記每則記下「點選項／自由輸入」(inputSource)，統計自由書寫比例用；管理端可讀文字也帶標記（全程示範模式，不打真實API）
import * as H from "./harness.mjs";
import { buildReadable } from "../worker/save-admin.js";
const A = H.makeAsserter("93 日記的輸入來源標記");
const env = H.makeEnv();
const g = await H.loadGame({ useMock: true, env, key: "insrc01" });
g.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(g);
g.ev("state.ap.gift=100000");
const turn = async (t) => { await g.ev(`takeTurn(${JSON.stringify(t)}, AP_COST_PER_TURN)`); };

// 第一回合：點畫面上現有的選項
const opt = g.ev("(state.choices||[])[0]");
await turn(opt);
let last = g.ev("state.log[state.log.length-1]");
A.check("點選項的回合：inputSource＝choice", last.action === opt && last.inputSource === "choice", { a: last.action, s: last.inputSource });
// 第二回合：自己寫一句不在選項裡的話
await turn("我今天想一個人去河堤走走，順便把這幾天的事情想清楚");
last = g.ev("state.log[state.log.length-1]");
A.check("自己輸入的回合：inputSource＝free", last.inputSource === "free", { s: last.inputSource });
// 開場回合沒有行動，不標記
const first = g.ev("state.log.find(e=>!e.error)");
A.check("開場回合（沒有行動）不帶標記", first && first.action == null && first.inputSource === undefined, { a: first && first.action, s: first && first.inputSource });
// 管理端可讀文字
const st = g.ev("JSON.parse(JSON.stringify(state))");
const text = await buildReadable(st, "lid", Date.now(), async () => null);
A.check("管理端文字：自由輸入的行動後面帶〔自由輸入〕", /〔玩家的選擇〕我今天想一個人去河堤走走[^\n]*〔自由輸入〕/.test(text));
A.check("管理端文字：點選項的行動後面帶〔選項〕", text.includes("〔玩家的選擇〕" + opt + "〔選項〕"));
process.exit(A.report() ? 0 : 1);
