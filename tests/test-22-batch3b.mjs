// 2026-09-27：第三節第二批（4.2.2父母退休、4.3.1擴充里程碑、13.7.2喪偶、7.6.3離婚後正向節點）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("第三節第二批");
let override = () => ({});
let lastBody = "";
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => { lastBody = JSON.stringify(p); return override(p, b); } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "batch3b001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const doc = g.win.document;
const flat = () => lastBody.replace(/\\"/g, '"');

// 舊存檔補里程碑
ev("delete state.milestones.widowed; delete state.milestones.divorce; ensureMilestoneDefs(state)");
A.check("舊存檔補上新里程碑", ev("state.milestones.widowed") === "available" && ev("state.milestones.divorce") === "available");
A.check("新里程碑都是auto(AI不能回報)", ev("['divorce','child_left_home','retirement','major_illness_diagnosed','became_caregiver','parent_death','widowed','parent_retirement'].every(id=>MILESTONE_DEFS.find(d=>d.id===id).auto)"));

// 4.2.2 父母退休
ev(`state.characters = state.characters.filter(c=>c.origin!=='父母，從出生起' && c.origin!=='隔代教養，從出生起');
    state.characters.push({name:'老爸',relation:'父親',gender:'男',origin:'父母，從出生起',age:64,occupation:'受雇專業人員',healthStage:1,affinity:60,active:true,traits:'',summary:'',lastTurn:0},
      {name:'老媽',relation:'母親',gender:'女',origin:'父母，從出生起',age:66,occupation:'自營業者',healthStage:1,affinity:60,active:true,traits:'',summary:'',lastTurn:0});
    state.milestones.parent_retirement='available'; state.pendingFamilyBusinessOffer=null; state.careerStatus=CAREER_STATUS.EMPLOYED`);
ev("checkParentRetirements(state)");
A.check("64歲受雇的爸爸還沒退休", !ev("state.characters.find(c=>c.name==='老爸').retired"));
A.check("自營業者媽媽66歲還沒退休(晚5年)", !ev("state.characters.find(c=>c.name==='老媽').retired"));
ev("state.characters.find(c=>c.name==='老爸').age=65; checkParentRetirements(state)");
A.check("爸爸65歲退休、里程碑完成", ev("state.characters.find(c=>c.name==='老爸').retired") === true && ev("state.milestones.parent_retirement") === "completed");
ev("state.characters.find(c=>c.name==='老媽').age=70; checkParentRetirements(state)");
A.check("自營業者退休：觸發接手家業", !!ev("state.pendingFamilyBusinessOffer") && ev("state.pendingFamilyBusinessOffer.parentName") === "老媽");
ev("state.pendingFamilyBusinessOffer=null");
const n = ev("state.parentRetirementEventLog.length");
ev("state.parentRetirementEventLog=null; checkParentRetirements(state)");
A.check("每位只判定一次", n === 1 && ev("state.parentRetirementEventLog") === null);

// 4.3.1 hooks
ev("state.milestones.became_caregiver='available'; state.pendingEldercareDecision=null; resolveEldercareDecision(state,'老爸','self')");
A.check("自己擔任主要照顧者 → became_caregiver", ev("state.milestones.became_caregiver") === "completed");
ev("state.milestones.parent_death='available'; finalizeParentDeath(state,'老爸')");
A.check("父母過世 → parent_death", ev("state.milestones.parent_death") === "completed");
ev("state.milestones.retirement='available'; state.age=65; state.retirementStatus='在職'; resolveRetirementOffer(state,'on_time')");
A.check("退休 → retirement", ev("state.milestones.retirement") === "completed");
ev("state.majorIllness={stage:'diagnosed',turnsInStage:0}; state.milestones.major_illness_diagnosed='available'; advanceMajorIllness(state); state.majorIllness=null; state.pendingRetirementOffer=null");
A.check("重大疾病確診 → major_illness_diagnosed", ev("state.milestones.major_illness_diagnosed") === "completed");
ev(`state.characters.push({name:'阿寶',relation:'兒子',gender:'男',isChild:true,age:19,affinity:60,active:true,cohabiting:true,traits:'',summary:'',lastTurn:0,parentingLog:[]}); resolveParentingGrowthNode(state,'阿寶','leaving_home','open_door','')`);
A.check("子女成年離家 → child_left_home", ev("state.milestones.child_left_home") === "completed");
const ch0 = ev("state.chronicle.length");
await H.playTurn(g);
A.check("新里程碑自動進履歷(退休/照顧/離家)、確診與父母過世不重複", (() => { const c = JSON.parse(ev(`JSON.stringify(state.chronicle.slice(${ch0}))`)); return c.some(x => x.includes("退休了")) && c.some(x => x.includes("照顧年邁")) && c.some(x => x.includes("離家")) && !c.some(x => x.includes("重大疾病確診")); })(), ev(`JSON.stringify(state.chronicle.slice(${ch0}))`));

// 13.7.2 喪偶
ev(`state.characters.push({name:'阿芬',relation:'配偶',gender:'女',romanceStatus:'married',cohabiting:true,affinity:70,active:true,traits:'',summary:'',lastTurn:0,age:39});
    state.spouseIncome=30; state.milestones.widowed='available'`);
ev("Math.__r=Math.random; Math.random=()=>0");
A.check("配偶39歲：不判定", ev("rollSpouseAnnualDeath(state)") === null);
ev("state.characters.find(c=>c.name==='阿芬').age=70");
A.check("配偶70歲擲中：過世", ev("rollSpouseAnnualDeath(state)") === "阿芬");
ev("Math.random=Math.__r");
A.check("喪偶：卡片標記、收入歸零、里程碑、履歷", ev("state.characters.find(c=>c.name==='阿芬').deceased") && ev("state.characters.find(c=>c.name==='阿芬').romanceStatus") === "widowed" && ev("state.spouseIncome") === 0 && ev("state.milestones.widowed") === "completed" && ev("state.chronicle.slice(-1)[0]").includes("阿芬走了"));
A.check("關係標籤：已故的配偶", ev("relationshipStatusLabel(state.characters.find(c=>c.name==='阿芬'))") === "已故的配偶");
ev("window.__tones=[]; const __ah2=applyHappiness; applyHappiness=(s,t)=>{ window.__tones.push(t); return __ah2(s,t); }");
override = () => ({ emotional_tone: "warm" });
await H.playTurn(g);
A.check("喪偶那回合：payload告訴AI、幸福感以heavy計", /spouse_death_event_now[^}]*阿芬/.test(flat()) && ev("window.__tones.slice(-1)[0]") === "heavy");
A.check("用過就清掉", ev("state.spouseDeathEventLog") === null);
override = () => ({});
ev("state.characters.push({name:'老李',relation:'配偶',gender:'男',romanceStatus:'married',cohabiting:true,affinity:70,active:true,traits:'',summary:'',lastTurn:0}); state.age=50");
ev("Math.__r=Math.random; Math.random=()=>0.99; rollSpouseAnnualDeath(state); Math.random=Math.__r");
A.check("沒有年齡的舊配偶卡：補上玩家年齡", ev("state.characters.find(c=>c.name==='老李').age") === 50);
ev("state.characters=state.characters.filter(c=>c.name!=='老李')");

// 7.6.3 離婚後正向節點
ev(`state.characters.push({name:'阿偉',relation:'配偶',gender:'男',romanceStatus:'married',cohabiting:true,affinity:40,active:true,traits:'',summary:'',lastTurn:state.turnCount});
    state.milestones.divorce='available'; finalizeDivorce(state,'阿偉',null,null)`);
A.check("離婚 → divorce里程碑、排定正向節點", ev("state.milestones.divorce") === "completed" && ev("state.divorceRecoveryNodeAtTurn") === ev("state.turnCount") + 8);
ev("state.divorceRecoveryNodeAtTurn = state.turnCount");
doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove());
await g.ev(`takeTurn("繼續過日子", AP_COST_PER_TURN)`); // 不用自動點擊，才看得到彈窗
A.check("時間到：跳「一個人的生活」彈窗", !!doc.getElementById("divorce-recovery-modal"), [...doc.querySelectorAll(".modal-backdrop")].map(x => x.id));
doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove());
ev("state.milestones=Object.fromEntries(Object.keys(state.milestones).map(k=>[k,'available'])); state.promotionOffersEncountered=0; state.autonomyExtraChosen=0");
const a0 = ev("computeAutonomyRaw(state)");
ev("resolveDivorceRecovery(state,'reclaim_life')");
A.check("重新安排生活：自主感上升", ev("computeAutonomyRaw(state)") > a0 || (a0 === ev("AUTONOMY_NEUTRAL_DEFAULT") && ev("computeAutonomyRaw(state)") === 100), { a0, a1: ev("computeAutonomyRaw(state)") });
ev("state.interestCandidates=[{category:'藝術創作',status:'active',investment:30}]; resolveDivorceRecovery(state,'pursue_passion')");
A.check("投入想做的事：正式興趣投入度+10", ev("state.interestCandidates[0].investment") === 40);
const net0 = ev("state.stats.network");
ev("resolveDivorceRecovery(state,'reconnect')");
A.check("重新聯絡朋友：人脈上升", ev("state.stats.network") > net0);

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：AI只回報3個里程碑、父母退休改系統判定", prompt.includes("只有這3個需要你回報") && prompt.includes("parent_retirement(父母退休)自2026-09-27起改由系統"));
A.check("prompt：喪偶/父母退休/離婚後節點說明", prompt.includes("spouse_death_event_now") && prompt.includes("divorce_recovery_event_now"));

// mock長程
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "batch3bm01" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
for (let i = 0; i < 700; i++) { await H.playTurn(gm); if (gm.ev("state.phase") !== "playing") break; }
A.check("mock長程(最多700回合)正常", gm.errors.length === 0 && gm.ev("state.turnCount") > 300, { t: gm.ev("state.turnCount"), age: gm.ev("state.age"), err: gm.errors.map(String).slice(0, 2) });

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
