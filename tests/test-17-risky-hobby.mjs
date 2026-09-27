// 2026-09-27：七、7.1.1 極限運動等高風險行為的輸入（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("7.1.1 高風險行為");
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => override(p, b) }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "riskyhob01" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;

ev("state.riskyLifestyle=false; state.riskyHobbyScore=0");
A.check("沒有危險職業也沒習慣：加成0", ev("riskyAnnualBonus(state)") === 0);
override = () => ({ risky_activity: true });
await H.playTurn(g);
A.check("玩一次：還不算習慣", ev("state.riskyHobbyScore") === 1 && ev("riskyAnnualBonus(state)") === 0);
await H.playTurn(g);
A.check("玩兩次：算習慣，加2個百分點", ev("riskyHobbyActive(state)") === true && Math.abs(ev("riskyAnnualBonus(state)") - 0.02) < 1e-9);
ev("state.riskyLifestyle=true");
A.check("危險職業＋極限運動：各自相加＝4個百分點", Math.abs(ev("riskyAnnualBonus(state)") - 0.04) < 1e-9);
override = () => ({});
ev("rollAnnualHealthChecks(state)");
A.check("滿一年退一分：不再算習慣", ev("state.riskyHobbyScore") === 1 && ev("riskyHobbyActive(state)") === false);
// 死亡機率確實吃到加成
ev("state.riskyLifestyle=false; state.age=45; state.stats.health=80");
const p0 = ev("(state.riskyHobbyScore=0, computeDeathProbability(state))");
if (p0 !== null) {
  const p1 = ev("(state.riskyHobbyScore=3, computeDeathProbability(state))");
  A.check("年度死亡機率含極限運動加成", Math.abs((p1 - p0) - 0.02) < 1e-9, { p0, p1 });
}
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：risky_activity schema與說明", prompt.includes("risky_activity: { type: \"boolean\"") && prompt.includes("【高風險行為 risky_activity"));
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
