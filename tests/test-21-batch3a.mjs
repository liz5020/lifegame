// 2026-09-27：第三節第一批（3.4.2打工、3.2.3邏輯、3.6風格滑動、8.4興趣代價、9.4延畢、13.3.5疾病類型）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("第三節第一批");
let override = () => ({});
let lastBody = "";
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => { lastBody = JSON.stringify(p); return override(p, b); } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "batch3a001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const flat = () => lastBody.replace(/\\"/g, '"');

// 3.4.2 打工(2026-09-28起學生時期由「打工」重心觸發，見二、2.6.4；文字偵測只留給待業、半退休等非學生時期)
ev("state.careerStatus=null; state.milestones.first_part_time_job='available'; state.focus='work'");
const c0 = ev("state.cash");
await H.playTurn(g, "放學後去超商打工");
ev("state.focus='rest'");
const pt = JSON.parse(ev("JSON.stringify(state.partTimeEventLog)"));
// 2026-09-29 八、8.11（A4）：學生時期打工改成每次固定2份(1份＝每回合平均零用錢)，取代時薪×時數
A.check("打工：固定1份、收入入帳(2026-10-09由2份改1份)", pt && pt.shares === 1 && pt.earning === Math.max(1, Math.round(1 * ev("incomeShareUnit(state)"))), pt);
A.check("第一次打工里程碑由程式完成", ev("state.milestones.first_part_time_job") === "completed");
A.check("payload告訴AI打工收入", /part_time_event_now[^}]*earning/.test(flat()));
A.check("非學生時期(沒傳重心)：文字偵測照舊", ev("applyPartTimeWork(state,'去打工',{daysAdvanced:7}), !!state.partTimeEventLog"));
ev("applyPartTimeWork(state,'去當家教',{daysAdvanced:14})");
const tutor = JSON.parse(ev("JSON.stringify(state.partTimeEventLog)"));
A.check("家教：時薪0.3~0.5、小數一位、兩週24小時", tutor.hourly >= 0.3 && tutor.hourly <= 0.5 && Math.round(tutor.hourly * 10) === tutor.hourly * 10 && tutor.hours === 24, tutor);
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; applyPartTimeWork(state,'下班去打工',{daysAdvanced:7})");
A.check("有正職：不算打工收入", ev("state.partTimeEventLog") === null);
ev("state.careerStatus=null");

// 3.2.3 邏輯
ev("state.logicAbility=40");
ev("applyLogicGrowth(state,'參加辯論社練習',null)");
A.check("辯論社：邏輯+1.5×遞減", Math.abs(ev("state.logicAbility") - (40 + 1.5 * 0.6)) < 1e-9, ev("state.logicAbility"));
ev("applyLogicGrowth(state,'出去散步',{category:'科技邏輯',reaction:'positive'})");
A.check("科技邏輯興趣正向投入也會成長", ev("state.logicAbility") > 40.9);
const l1 = ev("state.logicAbility");
ev("applyLogicGrowth(state,'出去散步',{category:'藝術創作',reaction:'positive'})");
A.check("無關行動不成長", ev("state.logicAbility") === l1);

// 3.6 風格滑動
ev("state.personalityStyle='陽光開朗型'; state.styleSignals={}");
for (let i = 0; i < 7; i++) ev("applyPersonalityStyleSignal(state,'高冷神秘型')");
A.check("7次還不換", ev("state.personalityStyle") === "陽光開朗型");
ev("applyPersonalityStyleSignal(state,'高冷神秘型')");
A.check("累積8次且領先≥4：換成高冷神秘型、寫進履歷", ev("state.personalityStyle") === "高冷神秘型" && ev("state.chronicle.slice(-1)[0]").includes("高冷神秘"));
ev("state.personalityStyle='陽光開朗型'; state.styleSignals={'陽光開朗型':6}");
for (let i = 0; i < 9; i++) ev("applyPersonalityStyleSignal(state,'幽默風趣型')");
A.check("目前風格也常被展現時要領先4才換(9對6不換)", ev("state.personalityStyle") === "陽光開朗型");
ev("applyPersonalityStyleSignal(state,'幽默風趣型')");
A.check("10對6：換", ev("state.personalityStyle") === "幽默風趣型");
ev("applyPersonalityStyleSignal(state,'不存在的風格')");
A.check("enum外不理會", ev("state.personalityStyle") === "幽默風趣型");

// 8.4 興趣代價
ev("state.cash=10; state.studentStatus='enrolled'; state.stats.health=80");
ev("Math.__r=Math.random; Math.random=()=>0; applyInterestCost(state,{category:'體能競技',reaction:'positive'}); Math.random=Math.__r");
A.check("體能競技：扣器材費1、機率小傷扣3", ev("state.cash") === 9 && ev("state.stats.health") === 77 && ev("state.interestCostNow.kind") === "小傷");
ev("state.cash=0; applyInterestCost(state,{category:'手作工藝',reaction:'positive'})");
A.check("學生存款不足：不扣材料費", ev("state.cash") === 0);
ev("state.cash=10; applyInterestCost(state,{category:'知識研究',reaction:'positive'})");
A.check("知識研究：沒有負面代價", ev("state.cash") === 10 && ev("state.interestCostNow") === null);
ev("applyInterestCost(state,{category:'藝術創作',reaction:'negative'})");
A.check("負向反應(不想投入)：不扣", ev("state.cash") === 10);

// 9.4 延畢
ev(`state.timeState.stageMode='college'; state.studentStatus='enrolled'; state.age=20; state.collegeYearsRequired=4; state.timeState.yearInStage=2;
    state.collegeDelayYearsUsed=0; state.halfYearCarry=0; state.lowCashStreak=0; state.timeState.segmentIndex=SEMESTER_PHASES.length-1; state.universityEventLog=null`);
A.check("期末考沒過但沒有興趣拖累/財務壓力：不延畢", ev("checkNonLeaveGraduationDelay(state,{passed:false},1)") === false);
A.check("期末考過了：不延畢", ev("checkNonLeaveGraduationDelay(state,{passed:true},5)") === false);
const end0 = ev("state.timeState.cal.lastRoundEnd");
A.check("沒過＋興趣3次：延畢", ev("checkNonLeaveGraduationDelay(state,{passed:false},3)") === true);
A.check("回到這學期開頭、延畢+0.5、記半年、告訴AI", ev("state.timeState.segmentIndex") === 0 && ev("state.collegeDelayYearsUsed") === 0.5 && ev("state.halfYearCarry") === 1 && ev("state.universityEventLog.type") === "graduation_delayed");
// 二、2.7（2026-09-29）：真實日曆——從考完之後第一個真實學期開學日重新開始(中間的寒暑假照樣過去、沒有回合)
A.check("行事曆接續不倒退：從之後第一個真實學期開學日重跑", ev("schoolAnchor(state.timeState.cal,0,0)") > end0 && ev("calSemesterInfo(calFirstSemesterOnOrAfter(" + (end0 + 1) + ")).start") === ev("schoolAnchor(state.timeState.cal,0,0)"), { anchor: ev("schoolAnchor(state.timeState.cal,0,0)"), end0 });
ev("state.collegeDelayYearsUsed=COLLEGE_DELAY_CAP");
A.check("延畢額度用完：不延畢", ev("checkNonLeaveGraduationDelay(state,{passed:false},5)") === false);

// 13.3.5 疾病類型
ev("state.majorIllnessTypeByBand={'40-49':['癌症','心血管疾病'],'60-69':['中風']}");
const types = new Set();
for (let i = 0; i < 300; i++) types.add(ev("rollMajorIllnessType(state,'50-59')"));
A.check("50-59歲：不抽相鄰年齡帶得過的癌症/心血管/中風", !types.has("癌症") && !types.has("心血管疾病") && !types.has("中風") && types.size === 2, [...types]);
ev("state.majorIllnessTypeByBand={}");
A.check("沒有紀錄：五種都可能", (() => { const s = new Set(); for (let i = 0; i < 500; i++) s.add(ev("rollMajorIllnessType(state,'50-59')")); return s.size === 5; })());

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：打工/風格/延畢說明與style_signal schema", prompt.includes("part_time_event_now") && prompt.includes("style_signal: {") && prompt.includes("graduation_delayed"));

// mock長程
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "batch3am01" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
for (let i = 0; i < 400; i++) { await H.playTurn(gm); if (gm.ev("state.phase") !== "playing") break; }
A.check("mock連續400回合正常", gm.errors.length === 0 && gm.ev("state.turnCount") > 300, { t: gm.ev("state.turnCount"), err: gm.errors.map(String).slice(0, 2) });

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
