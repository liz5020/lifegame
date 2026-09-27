// 2026-09-27：七、7.6.2 婚姻危機三段式（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("7.6.2 婚姻危機三段式");
let payloads = [];
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => { payloads.push(JSON.stringify(p)); return {}; } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "mcrisis001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const doc = g.win.document;

ev(`state.characters.push({name:'阿偉',relation:'配偶',gender:'男',romanceStatus:'married',cohabiting:true,affinity:60,active:true,traits:'',summary:'',lastTurn:state.turnCount});
    state.marriageCrisisCooldownUntilTurn=0; state.marriageCrisisArc=null; state.pendingMarriageCrisis=null; state.justLostJob=true`);
ev("sweepMarriageCrisisCandidate(state)");
A.check("觸發：先進入浮現，不直接跳彈窗", ev("state.marriageCrisisArc && state.marriageCrisisArc.stage") === "surfacing" && !ev("state.pendingMarriageCrisis") && ev("state.marriageCrisisArc.reason") === "job_loss");
payloads = [];
await H.playTurn(g);
const p1 = payloads.join("").replace(/\\"/g, '"');
A.check("下一回合送AI：stage=surfacing", /marriage_crisis_arc[^}]*surfacing/.test(p1));
A.check("浮現回合結束 → 進入攤牌、仍沒彈窗", ev("state.marriageCrisisArc && state.marriageCrisisArc.stage") === "confrontation" && !doc.getElementById("marriage-crisis-modal"));
payloads = [];
g.win.__noAutoClick = true;
await g.ev(`takeTurn("繼續過日子", AP_COST_PER_TURN)`);
const p2 = payloads.join("").replace(/\\"/g, '"');
A.check("再下一回合送AI：stage=confrontation", /marriage_crisis_arc[^}]*confrontation/.test(p2));
A.check("攤牌回合結束 → 跳岔路彈窗", !!doc.getElementById("marriage-crisis-modal") && ev("state.marriageCrisisArc") === null);
doc.querySelector('.mc-btn[data-key="repair"]').click();
doc.getElementById("btn-mc-confirm").click();
A.check("選修復：設冷卻、危機結束", ev("state.marriageCrisisCooldownUntilTurn") > ev("state.turnCount") && !ev("state.marriageCrisisArc"));

// 進行中不重複觸發
ev("state.marriageCrisisCooldownUntilTurn=0; state.marriageCrisisArc={spouseName:'阿偉',stage:'surfacing',reason:'long_distance'}; state.justLostJob=true");
ev("sweepMarriageCrisisCandidate(state)");
A.check("進行中又遇高壓事件：不重開，照常往下走", ev("state.marriageCrisisArc.stage") === "confrontation" && ev("state.marriageCrisisArc.reason") === "long_distance");
// 配偶關係中途結束
ev("state.characters.find(c=>c.name==='阿偉').romanceStatus='divorced'; sweepMarriageCrisisCandidate(state)");
A.check("配偶關係結束：危機收掉", ev("state.marriageCrisisArc") === null && !ev("state.pendingMarriageCrisis"));

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：說明浮現/攤牌寫法", prompt.includes("marriage_crisis_arc") && prompt.includes("confrontation（攤牌）"));
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
