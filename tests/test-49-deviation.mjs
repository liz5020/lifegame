// 2026-09-30：玩家選擇一定先執行，偶爾偏離(一、1.2.17)（全程假上游，不打真實API）
import path from "path";
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("選擇偏離");
let lastPayload = null;
const fake = H.makeFakeAnthropic({ turnOverride: (p) => { lastPayload = p; return {}; } });
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "dev0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = "ap:dev0000001:0"; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
const roll = (over) => ev(`(()=>{ const o = ${JSON.stringify(over)}; state.lastDeviated = !!o.last; state.pendingConfession = o.conf || null; return rollChoiceDeviation(state, { prologue:!!o.prologue, fromChoice:o.choice!==false, whitelist:!!o.wl }); })()`);

ev("window.__rnd = Math.random; Math.random = ()=>0.1");
A.check("1.2.17 點選項、無例外、擲到15%以內：偏離", roll({}) === true);
ev("Math.random = ()=>0.2");
A.check("1.2.17 擲到15%以外：不偏離", roll({}) === false);
ev("Math.random = ()=>0.0");
A.check("1.2.17 前一回合已偏離：不擲", roll({ last: true }) === false);
A.check("1.2.17 玩家自由輸入的回合：不擲", roll({ choice: false }) === false);
A.check("1.2.17 高張力白名單節點：不擲", roll({ wl: true }) === false);
A.check("1.2.17 本回合是回應告白：不擲", roll({ conf: { name: "雅涵" } }) === false);
A.check("1.2.17 開場：不擲", roll({ prologue: true }) === false);
ev("Math.random = window.__rnd");
A.check("1.2.17 機率參數15%", ev("CHOICE_DEVIATION_PROB") === 0.15);

// 整回合：擲中就把「偏離」放進提示；下一回合不再偏離；反悔狀態包含lastDeviated
ev("state.timeState.segmentIndex=YEAR_SEGMENTS.findIndex(x=>x.key==='期中準備期'); state.timeState.turnsInSegment=1"); // 避開開學典禮等固定事件
ev("Math.random = ()=>0.05; state.lastDeviated=false; state.pendingConfession=null");
await H.playTurn(g, (js("state.choices") || ["嗯"])[0]);
A.check("整回合：擲中偏離→提示帶choice_deviation_now＝true，回合結束記下lastDeviated", lastPayload.choice_deviation_now === true && ev("state.lastDeviated") === true, { p: lastPayload.choice_deviation_now, last: ev("state.lastDeviated"), choices: js("state.choices"), pro: ev("!!state.timeState.prologue"), plan: js("state.scenePlanDbg||null") });
await H.playTurn(g, (js("state.choices") || ["嗯"])[0]);
A.check("整回合：連續兩回合不偏離(即使又擲到15%以內)", lastPayload.choice_deviation_now === undefined && ev("state.lastDeviated") === false);
ev("Math.random = window.__rnd");
await H.playTurn(g, "我自己寫的行動");
A.check("整回合：自由輸入不偏離", lastPayload.choice_deviation_now === undefined);

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：選擇一定先執行、choice_deviation_now規則", ["choice_deviation_now", "先照著寫出來", "偏離預期"].every(k => prompt.includes(k)));
A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
