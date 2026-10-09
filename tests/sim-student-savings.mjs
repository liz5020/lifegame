// 2026-10-09：十七、17.3.6／三、3.4.10 驗收模擬——學生期（15～22歲，約378回合）副業全力跑，三種家境的22歲存款（mock模式，不打真實API）
// 條件（定案 17.3.6.8，2026-10-09驗收重跑）：兩種玩法——全力副業（期中、期末考當回合選「讀書」，其餘回合都選「工作：副業」）、
// 全力打工（期中、期末考當回合選「讀書」，其餘回合都選「工作：打工」）；花費提議每次隨機50%接受（另跑全部接受、全部拒絕只回報）；
// 副業從「正式經營・熟練」(投入50)開始，之後投入度、等級照遊戲實際規則累積，不手動指定。
// 用法：node sim-student-savings.mjs [每組跑幾次，預設3] [輸出的檔案，可省略] [玩法 gig／part／both，預設both]
import fs from "fs";
import * as H from "./harness.mjs";
const RUNS = Number(process.argv[2] || 3);
const OUT = process.argv[3] && process.argv[3] !== "-" ? process.argv[3] : null;
const PLAYS = (process.argv[4] || "both") === "both" ? [["全力副業", "gig"], ["全力打工", "part"]] : [[process.argv[4] === "part" ? "全力打工" : "全力副業", process.argv[4]]];
const TIERS = ["清寒", "小康", "富裕"];
const MODES = [["主要條件(隨機50%接受)", 0.5], ["全部接受", 1], ["全部拒絕", 0]];
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "simstu0001" });
const ev = g.ev;
ev("MOCK_CHAPTER_DELAY_MS = 1; MOCK_AI_DELAY_MS = 0");
const doc = g.win.document;
const results = [];
for (const [playName, play] of PLAYS) for (const tier of TIERS) for (const [modeName, acceptP] of MODES) {
  const runsHere = acceptP === 0.5 ? RUNS : Math.max(1, Math.ceil(RUNS / 2));
  for (let run = 0; run < runsHere; run++) {
    g.ev(`state = newRoll(null, {name:"模擬", gender:"女"});
      state.family=${JSON.stringify(tier)}; state.monthlyIncome=STUDENT_ALLOWANCE_UNITS[${JSON.stringify(tier)}]; state.cash=state.monthlyIncome;
      state.spendingHabit="普通花費"; state.mealArrangement="自己打理"; state.mealCareEligibleAtStart=true; state.idleEnabled=false;`);
    await g.ev("startLife()"); H.clickModals(g.win);
    // 先跑完開場，再把副業卡放上去
    ev("ensureAP(state).daily=99");
    await H.playTurn(g);
    // 全力副業：放上正式經營・熟練的副業卡；全力打工：不放副業卡，「工作」重心就是打工
    if (play === "gig") ev(`state.interestCandidates=[{id:'hc',category:'手作工藝',item:'飾品',status:'active',investment:50,sideBusinessStatus:'formal',lastEngagedRound:state.turnCount}]; state.focus='work'; state.focusWorkId='hc';`);
    else ev(`state.interestCandidates=[]; state.focus='work'; state.focusWorkId=null;`);
    const byAge = {}; let turns = 0, accepted = 0, offered = 0, spent = 0, orders = 0, income = 0;
    byAge[ev("state.age")] = ev("state.cash");
    while (ev("state.phase") === "playing" && ev("isStudentPhase(state)") && ev("state.age") < 22 && turns < 800) {
      const exam = ev(`(()=>{ const s=state; const idx=((s.timeState.yearInStage-1)*YEAR_SEGMENTS.length + s.timeState.segmentIndex)%YEAR_SEGMENTS.length; const seg=YEAR_SEGMENTS[idx]; return !!seg.isExam && (s.timeState.turnsInSegment||0)+1 >= seg.budget; })()`);
      ev(`ensureAP(state).daily=99; state.focus=${exam ? "'study'" : "'work'"}; state.focusWorkId=${play === "gig" ? "'hc'" : "null"};`);
      const text = ev("(state.choices&&state.choices[0])||'繼續過日子'");
      g.win.__sxManual = true;
      const pr = g.ev(`takeTurn(${JSON.stringify(text)}, AP_COST_PER_TURN)`); turns++;
      for (let w = 0; ; w++) { // 回合進行中若跳出花費彈窗(先選完再寫)，在這裡決定；回合寫完就結束等待
        await new Promise(r => setTimeout(r, 1));
        const sx = doc.getElementById("student-expense-modal");
        if (sx) {
          offered++;
          const yes = Math.random() < acceptP;
          const before = ev("state.cash");
          doc.getElementById(yes ? "btn-sx-yes" : "btn-sx-no").click();
          if (yes) { accepted++; spent += before - ev("state.cash"); }
          break;
        }
        if (ev("turnsInFlight") === 0) break;
      }
      await pr;
      H.clickModals(g.win);
      byAge[ev("state.age")] = ev("state.cash");
    }
    const card = play === "gig" ? ev("JSON.stringify(state.interestCandidates.find(c=>c.id==='hc')||null)") : null;
    const partIncome = ev("(state.sideIncomeLog||[]).length");
    const c = card ? JSON.parse(card) : null;
    results.push({ play: playName, tier, mode: modeName, run, finalAge: ev("state.age"), finalCash: ev("state.cash"), byAge, turns, offered, accepted, spent, gigIncome: c ? c.gigIncome || 0 : null, invest: c ? Math.round(c.investment) : null });
    console.error(`${playName}／${tier}／${modeName} #${run + 1}：${ev("state.age")}歲存款 ${ev("state.cash")}（${turns}回合，花費提議${offered}／花了${accepted}，副業累計收入 ${c ? c.gigIncome : "-"}）`);
  }
}
const mean = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : "-";
const lines = [];
for (const [playName] of PLAYS) for (const tier of TIERS) for (const [modeName] of MODES) {
  const rs = results.filter(r => r.play === playName && r.tier === tier && r.mode === modeName);
  if (!rs.length) continue;
  lines.push({ play: playName, tier, mode: modeName, n: rs.length, cash22: mean(rs.map(r => r.finalCash)), min: Math.min(...rs.map(r => r.finalCash)), max: Math.max(...rs.map(r => r.finalCash)),
    offered: mean(rs.map(r => r.offered)), accepted: mean(rs.map(r => r.accepted)), spent: mean(rs.map(r => r.spent)), gig: mean(rs.map(r => r.gigIncome || 0)), turns: mean(rs.map(r => r.turns)),
    byAge: Object.fromEntries([15, 16, 17, 18, 19, 20, 21, 22].map(a => [a, mean(rs.map(r => r.byAge[a]).filter(v => v != null))])) });
}
const fmt = (l) => `| ${l.play} | ${l.tier} | ${l.mode} | ${l.n} | ${l.cash22}（${l.min}～${l.max}） | ${l.turns} | ${l.offered}／${l.accepted} | ${l.spent} | ${l.gig} |`;
let md = "| 玩法 | 家境 | 條件 | 跑幾次 | 22歲存款（平均，最小～最大） | 平均回合 | 花費提議／花了 | 花費總額 | 副業累計收入(全力打工為0) |\n|---|---|---|---|---|---|---|---|---|\n" + lines.map(fmt).join("\n");
md += "\n\n逐年存款（各組平均）：\n\n| 玩法 | 家境 | 條件 | 15歲 | 16歲 | 17歲 | 18歲 | 19歲 | 20歲 | 21歲 | 22歲 |\n|---|---|---|---|---|---|---|---|---|---|---|\n" +
  lines.map(l => `| ${l.play} | ${l.tier} | ${l.mode} | ${[15, 16, 17, 18, 19, 20, 21, 22].map(a => l.byAge[a]).join(" | ")} |`).join("\n");
console.log(md);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ lines, results }, null, 1));
if (g.errors.length) console.log("jsdom錯誤：", g.errors.map(String).slice(0, 3));
process.exit(0);
