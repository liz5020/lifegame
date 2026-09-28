// 2026-09-28：十六、16.7.2.5 命運的骰子紀錄 fateRolls（全程USE_MOCK，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("十六 命運的骰子紀錄");
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "fatekey01" });
const ev = g.ev;
ev("MOCK_AI_DELAY_MS = 0");
await H.startNewLife(g, { name: "林以晴" });
const rolls = () => JSON.parse(ev("JSON.stringify(state.fateRolls||[])"));
const withRandom = (v, code) => ev(`(()=>{ const o=Math.random; Math.random=()=>${v}; try{ return (${code}); } finally{ Math.random=o; } })()`);

// 1. 四類接線
ev("state.studentStatus='graduated'; state.timeState.stageMode='career'; state.fateRolls=[]; state.age=32; state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='勞力/服務類'; state.tenureMonths=0; state.layoffForeshadowed=false");
withRandom(0.99, "rollAnnualLayoffCheck(state)");
let r = rolls().pop();
A.check("裁員：沒被裁算成功，成功機率＝1−裁員機率(勞力/服務類4%)", r && r.category === "layoff" && r.success === true && r.probability === 0.96 && r.resultText === "這一年沒有被裁員" && r.isOpenCheck === false, r);
withRandom(0.0, "rollAnnualLayoffCheck(state)");
r = rolls().pop();
A.check("裁員：第一次命中只是前兆，還沒被裁仍算成功", r.success === true && ev("state.layoffForeshadowed") === true);
withRandom(0.0, "rollAnnualLayoffCheck(state)");
r = rolls().pop();
A.check("裁員：真的被裁算失敗", r.success === false && r.resultText === "被裁員了" && ev("state.careerStatus") === ev("CAREER_STATUS.UNEMPLOYED"));
A.check("每筆欄位齊全(round/age/stage/category/event/probability/success/resultText/isOpenCheck)", ["round", "age", "stage", "category", "event", "probability", "success", "resultText", "isOpenCheck"].every(k => k in r) && r.age === 32 && r.stage === "30-39", r);

ev("state.fateRolls=[]; state.businessStatus='經營中'; state.businessCapital=100; state.jobLevel=1");
const biz = JSON.parse(ev("JSON.stringify(rollAnnualBusinessCheck(state))"));
r = rolls().pop();
A.check("年度營運：沒虧損算成功，成功機率＝(成長＋持平)", r.category === "business" && r.probability === Math.round(Math.min(biz.probPct + 20, 100) * 10) / 1000 && r.success === (biz.outcome !== "loss"), { r, biz });

ev("state.fateRolls=[]; state.majorIllness={stage:'treatment', turnsInStage:10, treatmentTargetTurns:3, type:'中風'}");
ev("advanceMajorIllness(state)");
r = rolls().pop();
A.check("重大疾病治療：康復算成功，機率0.4，事件帶病名", r.category === "illness_treatment" && r.probability === 0.4 && /中風/.test(r.event) && ["治療後康復", "帶著病繼續生活", "病情惡化"].includes(r.resultText) && r.success === (r.resultText === "治療後康復"), r);

ev("state.fateRolls=[]; state.pregnancy=null; state.characters.push({name:'伴侶甲',relation:'伴侶',romanceStatus:'stable',active:true,affinity:80,gender:'男'})");
ev("state.age=30; applyFertilityTurn(state, '我們想生小孩')");
r = rolls().pop();
A.check("生育嘗試：記錄機率與成敗", r && r.category === "fertility" && r.probability > 0 && r.probability < 1 && ["懷孕了", "這次沒有懷上"].includes(r.resultText), r);
ev("state.fateRolls=[]; applyFertilityTurn(state, '今天去上班')");
A.check("沒有嘗試就不記", rolls().length === 0);

// 2. 保留規則
const mk = (stage, p, i) => `{round:${i}, age:40, stage:'${stage}', category:'business', event:'e${i}', probability:${p}, success:true, resultText:'', isOpenCheck:false}`;
ev(`state.fateRolls=[${[0.5, 0.45, 0.2, 0.9].map((p, i) => mk("40-49", p, i)).join(",")}]; state.age=45; state.careerStatus=null`);
ev("recordFateRoll(state,'business','新的一筆',0.05,true,'x',false)");
let fr = rolls();
A.check("同一階段第5筆：刪掉同階段最不意外的(機率0.5那筆)", fr.length === 4 && !fr.some(x => x.event === "e0") && fr.some(x => x.event === "新的一筆"), fr.map(x => x.event));
ev(`state.fateRolls=[${[0.45, 0.55, 0.1, 0.9].map((p, i) => mk("40-49", p, i)).join(",")}]`);
ev("recordFateRoll(state,'business','x2',0.1,true,'x',false)");
fr = rolls();
A.check("意外程度相同時刪較舊的那筆", !fr.some(x => x.event === "e0") && fr.some(x => x.event === "e1"), fr.map(x => x.event));
const stages = ["student", "23-29", "30-39", "40-49", "50-59"];
ev(`state.fateRolls=[${stages.flatMap((st, si) => [0.1, 0.2, 0.8, 0.9].map((p, i) => mk(st, p, si * 10 + i))).join(",")}]`); // 20筆
ev("state.age=62; recordFateRoll(state,'business','六十幾歲',0.02,true,'x',false)");
fr = rolls();
A.check("該階段未滿但總數已達20：在全部紀錄中刪最不意外的", fr.length === 20 && fr.some(x => x.event === "六十幾歲") && fr.filter(x => x.probability === 0.2 || x.probability === 0.8).length === 9, fr.length);

// 3. 花絮層
const elig = (p, s, cat) => ev(`isFateTidbitEligible({probability:${p}, success:${s}, category:'${cat}'})`);
A.check("花絮層：≤30%且成功、≥70%且失敗才可寫", elig(0.3, true, "business") && elig(0.7, false, "business") && !elig(0.31, true, "business") && !elig(0.69, false, "business") && !elig(0.2, false, "business") && !elig(0.9, true, "business"));
A.check("生育嘗試只有成功的能寫成花絮", elig(0.2, true, "fertility") && !elig(0.9, false, "fertility"));
ev(`state.fateRolls=[${[[0.25, true], [0.05, true], [0.95, false], [0.5, true], [0.28, true]].map(([p, s2], i) => `{round:${i},age:40,stage:'40-49',category:'business',event:'t${i}',probability:${p},success:${s2},resultText:'',isOpenCheck:false}`).join(",")}]`);
const cands = JSON.parse(ev("JSON.stringify(fateTidbitCandidates(state,3).map(r=>r.event))"));
A.check("花絮挑最意外的3筆(只從以小搏大的紀錄裡)", JSON.stringify(cands) === JSON.stringify(["t1", "t2", "t0"]), cands);
A.check("隱藏判定的機率寫成文字、明牌檢定寫數字", ev("fateProbabilityWords({probability:0.23,isOpenCheck:false})") === "機會不大" && ev("fateProbabilityWords({probability:0.23,isOpenCheck:true})") === "只有23%的機會" && !/\d/.test(ev("fateProbabilityWords({probability:0.93,isOpenCheck:false})")));

// 4. 悔棋與新人生
ev("state.fateRolls=[]");
await H.playTurn(g);
ev("recordFateRoll(state,'business','悔棋前',0.1,true,'x',false)");
ev("restoreUndo()");
A.check("悔棋：紀錄跟著回到上一回合", !rolls().some(x => x.event === "悔棋前"));
A.check("新的一世從空紀錄開始", ev("(newRoll(null,{name:'新',gender:'女'}).fateRolls||[]).length") === 0);

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
