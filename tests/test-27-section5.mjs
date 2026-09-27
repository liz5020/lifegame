// 2026-09-27：第五節拍板後的程式改動（3.4.11扶養費、12.13職涯收入、7.3.2生育、13.6原生家庭房產、6.2 prompt）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("第五節拍板");
let override = () => ({});
let lastBody = "";
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => { lastBody = JSON.stringify(p); return override(p, b); } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "section5a1" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const flat = () => lastBody.replace(/\\"/g, '"');

// 3.4.11
A.check("子女20歲(大學)仍算生活費", ev("childSupportAmount(20)") === ev("CHILD_SUPPORT_AMOUNT.school") && ev("childSupportAmount(20)") > 0);
A.check("23歲不再算", ev("childSupportAmount(23)") === 0);

// 12.13
ev("state.studentStatus='graduated'; state.timeState.stageMode='career'; state.careerStatus=CAREER_STATUS.EMPLOYED; state.monthlyIncome=50; state.cash=100; state.reviewFlags=[]");
override = () => ({ one_time_transaction: [{ label: "年終獎金", amount: 40 }, { label: "紅包", amount: 5 }] });
const c0 = ev("state.cash");
await H.playTurn(g);
A.check("AI回報年終獎金不入帳、紅包照常", ev("state.reviewFlags.some(f=>f.kind==='career_income_blocked')") && ev("state.lastSettlement ? state.cash - state.lastSettlement.net : state.cash") === c0 + 5, { cash: ev("state.cash"), c0, net: ev("state.lastSettlement && state.lastSettlement.net") });
override = () => ({});

// 7.3.2 生育
ev("state.characters=state.characters.filter(c=>!c.romanceStatus && !c.isChild); state.pregnancy=null; state.fertilityAttempts=0; state.age=28; state.stats.health=80");
ev("applyFertilityTurn(state,'我們想生小孩')");
A.check("沒有伴侶：不嘗試", ev("state.fertilityEventLog") === null && !ev("state.pregnancy"));
ev("state.characters.push({name:'阿偉',relation:'配偶',gender:'男',romanceStatus:'married',cohabiting:true,affinity:70,active:true,traits:'',summary:'',lastTurn:0,age:30})");
A.check("28歲健康80：成功率＝0.35×0.92", Math.abs(ev("computeFertilityProbability(state)") - 0.35 * 0.92) < 1e-9);
ev("Math.__r=Math.random; Math.random=()=>0.99; applyFertilityTurn(state,'我們想生小孩'); Math.random=Math.__r");
A.check("沒懷上：記嘗試次數", ev("state.fertilityEventLog.success") === false && ev("state.fertilityAttempts") === 1);
ev("Math.__r=Math.random; Math.random=()=>0; applyFertilityTurn(state,'我們想生小孩'); Math.random=Math.__r");
A.check("懷上：約270天後出生", !!ev("state.pregnancy") && ev("state.pregnancy.dueDay") === ev("state.timeState.cal.lastRoundEnd") + 270);
const kids0 = ev("state.characters.filter(c=>c.isChild).length");
override = () => ({ new_characters: [{ name: "偷生的", relation: "兒子", gender: "男", is_child: true, initial_affinity: 60 }] });
await H.playTurn(g, "過日子");
A.check("還沒到預產期：AI回報的子女卡不採用", ev("state.characters.filter(c=>c.isChild).length") === kids0 && !ev("state.characters.some(c=>c.name==='偷生的')"));
ev("state.pregnancy.dueDay = state.timeState.cal.lastRoundEnd"); // 下一回合到期
override = () => ({ new_characters: [{ name: "林小安", relation: "女兒", gender: "女", is_child: true, initial_affinity: 60 }] });
await H.playTurn(g, "過日子");
A.check("出生那回合：payload告訴AI、AI建的子女卡採用", /fertility_event_now[^}]*birth/.test(flat()) && ev("state.characters.some(c=>c.name==='林小安' && c.isChild)") && ev("state.milestones.first_child") === "completed");
ev("state.pregnancy={dueDay: state.timeState.cal.lastRoundEnd}");
override = () => ({});
await H.playTurn(g, "過日子");
A.check("出生但AI沒建卡：程式補一張", ev("state.characters.filter(c=>c.isChild).length") === kids0 + 2);
ev("state.cash=0; state.monthlyIncome=0; applyFertilityTurn(state,'想領養一個孩子')");
A.check("財務不夠：領養不成立", ev("state.fertilityEventLog.type") === "adoption" && ev("state.fertilityEventLog.success") === false && !ev("state.birthNow"));
ev("state.cash=999999; state.monthlyIncome=500; applyFertilityTurn(state,'想領養一個孩子')");
A.check("財務夠：領養成立", ev("state.birthNow && state.birthNow.method") === "adoption");
ev("state.birthNow=null");

// 13.6 原生家庭房產
ev(`state.characters=state.characters.filter(c=>c.origin!=='父母，從出生起' && c.origin!=='隔代教養，從出生起' && c.origin!=='手足，從出生起');
    state.characters.push({name:'老爸',relation:'父親',gender:'男',origin:'父母，從出生起',age:80,healthStage:2,affinity:60,active:true,traits:'',summary:'',lastTurn:0},
      {name:'老媽',relation:'母親',gender:'女',origin:'父母，從出生起',age:78,healthStage:1,affinity:60,active:true,traits:'',summary:'',lastTurn:0},
      {name:'小弟',relation:'弟弟',gender:'男',origin:'手足，從出生起',affinity:60,active:true,traits:'',summary:'',lastTurn:0});
    state.familyHomeValue=6000; state.familyHomeInherited=false; state.propertyValue=0`);
ev("finalizeParentDeath(state,'老爸')");
A.check("第一位家長過世：還不繼承房子", ev("state.propertyValue") === 0 && ev("state.parentDeathEventLog.home_share") === null);
ev("finalizeParentDeath(state,'老媽')");
A.check("兩位都過世：和1位手足平分(3000)", ev("state.propertyValue") === 3000 && ev("state.parentDeathEventLog.home_share") === 3000 && ev("state.chronicle.slice(-1)[0]").includes("繼承了家裡的房子"));
ev("delete state.familyHomeValue; state.family='富裕'; state.familyMonthlyIncome=200; Math.__r=Math.random; Math.random=()=>0; ensureFamilyHome(state); Math.random=Math.__r");
A.check("富裕家庭擲到有房：價值＝月收入×120", ev("state.familyHomeValue") === 24000);

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：破格只看breakthrough_event_now", prompt.includes("「性格破格時刻」一律由系統判定"));
A.check("prompt：生育由系統判定、職涯收入不回報、房產繼承", prompt.includes("fertility_event_now") && prompt.includes("職涯收入一律由系統計算") && prompt.includes("home_share"));
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
