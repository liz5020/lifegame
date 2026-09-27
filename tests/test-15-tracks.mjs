// 2026-09-27：三、3.2.4 課業/興趣兩條軌跡顯示＋只算考前準備期（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("3.2.4 課業與興趣軌跡");
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => override(p, b) }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "tracks0001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const doc = g.win.document;
const segIdx = (key) => ev(`YEAR_SEGMENTS.findIndex(x=>x.key===${JSON.stringify(key)})`);

// 開學初：讀書/興趣不計
ev(`state.timeState.stageMode='highschool'; state.timeState.prologue=false; state.timeState.segmentIndex=${segIdx("開學初")}; state.timeState.turnsInSegment=0; state.studyCountThisTerm=0; state.interestCountThisTerm=0`);
override = () => ({ interest_event: { category: "藝術創作", reaction: "positive" } });
await H.playTurn(g, "回家讀書");
A.check("開學初讀書、興趣都不計", ev("state.studyCountThisTerm") === 0 && ev("state.interestCountThisTerm") === 0, { s: ev("state.studyCountThisTerm"), i: ev("state.interestCountThisTerm") });
// 期中準備期：計
ev(`state.timeState.segmentIndex=${segIdx("期中準備期")}; state.timeState.turnsInSegment=0`);
await H.playTurn(g, "回家讀書");
A.check("期中準備期讀書、興趣都計", ev("state.studyCountThisTerm") === 1 && ev("state.interestCountThisTerm") === 1, { s: ev("state.studyCountThisTerm"), i: ev("state.interestCountThisTerm") });
override = () => ({});

// 期末考分數含興趣拖累
ev("state.stats.knowledge=50");
const noDrag = JSON.parse(ev("JSON.stringify(rollFinalExamCheck(50,2,0))"));
const withDrag = JSON.parse(ev("JSON.stringify(rollFinalExamCheck(50,2,3))"));
A.check("期末考基準：才識50＋讀書2×3−興趣3×2×1＝50", noDrag.base === 56 && withDrag.base === 50, { noDrag: noDrag.base, withDrag: withDrag.base });
A.check("轉系呼叫(不傳興趣)維持原算法", JSON.parse(ev("JSON.stringify(rollFinalExamCheck(50,2))")).base === 56);

// 考試紀錄與畫面顯示
ev(`state.timeState.segmentIndex=${segIdx("期中考")}; state.timeState.turnsInSegment=0; state.studyCountThisTerm=2; state.interestCountThisTerm=0; state.examHistory=[]`);
await H.playTurn(g);
A.check("期中考後記一筆課業成績", ev("state.examHistory.length") === 1 && ev("state.examHistory[0].type") === "期中考" && ev("state.examHistory[0].score") === 56, ev("JSON.stringify(state.examHistory)"));
ev("state.interestCandidates=[{category:'藝術創作',status:'active',investment:55},{category:'體能競技',status:'dormant',investment:20},{category:'知識研究',status:'candidate',investment:5}]");
ev("render()");
const txt = doc.querySelector(".ledger.tracks") ? doc.querySelector(".ledger.tracks").textContent : "";
A.check("畫面顯示課業軌跡", txt.includes("上次期中考56分"), txt);
A.check("畫面顯示興趣軌跡(文字級距、不含候選)", txt.includes("藝術創作（漸入佳境）") && txt.includes("體能競技（淡了）") && !txt.includes("知識研究"), txt);
A.check("興趣不裸露投入度數字", !txt.includes("55"));

// 出社會後不顯示課業
ev("state.studentStatus='graduated'; state.timeState.stageMode='career'; render()");
const txt2 = doc.querySelector(".ledger.tracks") ? doc.querySelector(".ledger.tracks").textContent : "";
A.check("出社會後只顯示興趣", !txt2.includes("課業") && txt2.includes("藝術創作"));

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
