// 2026-09-27：9/26落差掃描第一節「程式bug」修正回歸測試（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("9/27落差修正");
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => override(p, b) }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "gapfix0927" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;

// 1. 3.4.8/3.4.10 學生判斷改用studentStatus
ev("state.studentStatus='enrolled'; state.occupationCategory=null");
A.check("在學：isStudentPhase=true", ev("isStudentPhase(state)") === true);
ev("state.studentStatus='graduated'; state.occupationCategory=null; state.monthlyIncome=0; state.housing={type:'rent'}; state.chronicConditions=[]");
A.check("畢業未就業：基本開銷不為0(走housing分級)", ev("computeBaseLivingCost(state)") > 0, ev("computeBaseLivingCost(state)"));
ev("state.studentStatus='withdrawn'");
A.check("肄業：isStudentPhase=false", ev("isStudentPhase(state)") === false);
let payload = null;
override = (p) => { payload = p; return {}; };
ev("state.studentStatus='graduated'; state.timeState.stageMode='career'");
await H.playTurn(g);
A.check("畢業未就業：payload is_student=false", payload && payload.is_student === false, payload && payload.is_student);
ev("state.cash=1; state.monthlyExpenses=[]");
override = () => ({ one_time_transaction: [{ label: "買東西", amount: -30 }] });
await H.playTurn(g);
A.check("出社會後消費可讓現金變負(不再當學生擋下)", ev("state.cash") < 0, ev("state.cash"));
override = () => ({});

// 2. 12.6 升遷連續兩次未成立 → 被動轉職候選
ev(`state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.jobLevel=1;
    state.conscientiousness.achievement=0; state.promotionDeclineStreak=0; state.pendingJobSearch=null; state.careerTransferCooldown=0; state.lowHealthStreak=0`);
ev("Math.__r=Math.random; Math.random=()=>0.999"); // rnd(1,100)=100 → 必定失敗
ev("resolvePromotionOffer(state,true)");
A.check("升遷失敗一次：streak=1", ev("state.promotionDeclineStreak") === 1);
ev("resolvePromotionOffer(state,true)");
ev("Math.random=Math.__r");
A.check("升遷失敗兩次：streak=2", ev("state.promotionDeclineStreak") === 2);
ev("checkTransferCandidate(state,false)");
A.check("連續兩次未成立 → 被動轉職候選成立", ev("!!(state.pendingJobSearch && state.pendingJobSearch.passive)"));
ev("state.pendingJobSearch=null; state.promotionDeclineStreak=0; resolvePromotionOffer(state,false)");
A.check("玩家主動拒絕升遷不累加streak", ev("state.promotionDeclineStreak") === 0);

// 3. 12.6 跨類別轉職降一級
ev("Math.__r=Math.random; Math.random=()=>0");
ev("state.jobLevel=2; state.jobSearchStreak=0; resolveJobApplication(state,'勞力/服務類',true,{})");
A.check("跨類別轉職：職級2→1", ev("state.jobLevel") === 1, ev("state.jobLevel"));
ev("state.jobLevel=0; state.careerStatus=CAREER_STATUS.EMPLOYED; resolveJobApplication(state,'受雇專業/白領類',true,{})");
A.check("跨類別轉職：新人維持0(不低於新人)", ev("state.jobLevel") === 0);
ev("Math.random=Math.__r");

// 9. 12.5 拒絕升遷計入自主感
ev("state.milestones=Object.fromEntries(Object.keys(state.milestones).map(k=>[k,'available'])); state.promotionOffersEncountered=0; state.promotionOffersDeclined=0");
const neutral = ev("computeAutonomyRaw(state)");
ev("state.promotionOffersEncountered=3; state.promotionOffersDeclined=1");
A.check("遇過升遷且拒絕過：自主感=100", ev("computeAutonomyRaw(state)") === 100, { neutral, v: ev("computeAutonomyRaw(state)") });
ev("state.promotionOffersDeclined=0");
A.check("遇過升遷都接受：自主感=0(同其他里程碑completed)", ev("computeAutonomyRaw(state)") === 0);

// 6. 9.5.2 拒絕雙主修後不再觸發
ev(`state.studentStatus='enrolled'; state.dualMajorStatus=null; state.dualMajorOfferDeclined=false; state.stats.knowledge=90`);
ev("checkDualMajorCandidate(state)");
A.check("才識≥70：雙主修候選成立", ev("state.dualMajorStatus") === "candidate");
ev("resolveDualMajorOffer(state,'decline'); state.pendingDualMajorOffer=false; checkDualMajorCandidate(state)");
A.check("拒絕後再檢查：不再成立候選", ev("state.dualMajorStatus") === null && ev("!state.pendingDualMajorOffer"));

// 7. 9.5.3 選撐下去後有冷卻
ev(`state.studentStatus='enrolled'; state.leaveStatus='normal'; state.pendingLeaveOffer=null; state.lowCashStreak=5; state.lowHealthStreak=0; state.withdrawalOfferCooldown=0; state.timeState.stageMode='college'`);
ev("Math.__r=Math.random; Math.random=()=>0; checkWithdrawalCandidate(state); Math.random=Math.__r");
A.check("持續低現金：休學候選成立", ev("state.pendingLeaveOffer") === "financial");
ev("state.pendingLeaveOffer=null; resolveWithdrawalOffer(state,'stay'); checkWithdrawalCandidate(state)");
A.check("選撐下去：下一回合不立刻再跳", ev("state.pendingLeaveOffer") === null);
ev("for(let i=0;i<WITHDRAWAL_STREAK_TRIGGER;i++) sweepUniversityState(state); state.lowCashStreak=5; Math.__r=Math.random; Math.random=()=>0; checkWithdrawalCandidate(state); Math.random=Math.__r"); // 9.5.3候選機率60%，固定骰值
A.check("冷卻期滿且仍低值：再次成立", ev("state.pendingLeaveOffer") === "financial");
ev("state.pendingLeaveOffer=null");

// 8. 12.10 延後退休最晚70歲
ev(`state.studentStatus='graduated'; state.timeState.stageMode='career'; state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.monthlyIncome=60; state.retirementStatus='在職'`);
ev("state.age=65; resolveRetirementOffer(state,'delay')");
A.check("65歲延後：維持在職", ev("state.careerStatus") === "employed" || ev("state.careerStatus===CAREER_STATUS.EMPLOYED"));
ev("state.age=70; resolveRetirementOffer(state,'delay')");
A.check("70歲送出delay：改為準時退休", ev("state.careerStatus===CAREER_STATUS.RETIRED"), ev("state.careerStatus"));
ev(`state.careerStatus=CAREER_STATUS.EMPLOYED; state.retirementStatus='在職'; state.monthlyIncome=60; state.age=71; renderRetirementOfferModal({})`);
g.win.document.getElementById("btn-ret-confirm").click();
A.check("71歲彈窗直接按確定：退休(預設不再是delay)", ev("state.careerStatus===CAREER_STATUS.RETIRED"));

// 10. 12.7/12.8.2 年度判定結果送AI
ev(`state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='不穩定/待業類'; state.layoffForeshadowed=false; state.businessStatus=null; state.careerEventLog=null; state.age=40`);
ev("Math.__r=Math.random; Math.random=()=>0");
ev("rollAnnualCareerChecks(state)");
A.check("裁員前兆 → careerEventLog.type=layoff_foreshadow", ev("state.careerEventLog && state.careerEventLog.type") === "layoff_foreshadow");
ev("state.careerEventLog={type:'promotion',accepted:true}; rollAnnualCareerChecks(state)");
A.check("同回合已有彈窗事件：裁員掛在annual、不覆蓋", ev("state.careerEventLog.type") === "promotion" && ev("state.careerEventLog.annual.type") === "layoff");
ev(`state.careerEventLog=null; state.businessStatus='經營中'; state.careerStatus=CAREER_STATUS.BUSINESS; state.businessCapital=100; rollAnnualCareerChecks(state)`);
A.check("創業年度結果 → business_annual含outcome", ev("state.careerEventLog.type") === "business_annual" && ["growth", "flat", "loss"].includes(ev("state.careerEventLog.outcome")));
ev("Math.random=Math.__r; state.businessStatus=null; state.careerEventLog=null");

// 5.2.2 父母好感度起點在區間內
const ranges = ev("JSON.stringify(PARENTING_STYLES.map(p=>({t:p.parentTrait,r:p.affinityRange})))");
let out = 0, total = 0;
for (let i = 0; i < 200; i++) {
  const parents = JSON.parse(ev("JSON.stringify(newRoll(null,{name:'測試',gender:'女'}).characters.filter(c=>c.relation==='父親'||c.relation==='母親').map(c=>({t:c.traits,a:c.affinity})))"));
  for (const p of parents) {
    const st = JSON.parse(ranges).find(x => p.t.startsWith(x.t));
    total++; if (!st || p.a < st.r[0] || p.a > st.r[1]) out++;
  }
}
A.check("200次開局父母好感度全在教養風格區間內", out === 0 && total > 0, { out, total });

// 1.1.3 教養彈窗自訂輸入不默默截斷
ev(`state.characters.push({name:'小安',relation:'女兒',isChild:true,age:6,affinity:60,active:true,traits:'',summary:'',lastTurn:state.turnCount,parentingLog:[]})`);
const nodeKey = ev("Object.keys(PARENTING_GROWTH_NODES)[0]");
ev(`renderParentingNodeModal({childName:'小安', nodeKey:${JSON.stringify(nodeKey)}})`);
const inp = g.win.document.getElementById("parenting-custom-input");
A.check("教養自訂輸入框沒有maxlength", inp && !inp.hasAttribute("maxlength"));
g.win.document.querySelector('.parenting-opt-btn[data-key="custom"]')?.click();
inp.value = "字".repeat(250); inp.dispatchEvent(new g.win.Event("input"));
A.check("超過字數：即時字數顯示250／200", g.win.document.getElementById("parenting-custom-count").textContent === "250／200");
g.win.document.getElementById("btn-parenting-confirm").click();
A.check("超過字數按確定：彈窗留著並提示", !!g.win.document.getElementById("parenting-node-modal") && g.win.document.getElementById("parenting-custom-error").textContent.includes("250"));
g.win.document.getElementById("parenting-node-modal")?.remove();

// 7.4.1 有子女即可傳承，不看AI的succession_available
ev(`state.ending = Object.assign({ successionAvailable:false, lifeSummary:'', epitaph:'' }, state.ending||{}); state.ending.successionAvailable=false; state.phase='ending'`);
let endingHtml = "";
try { endingHtml = ev("renderEnding()"); } catch (e) { endingHtml = "ERR " + e; }
A.check("AI回false但有子女：結局畫面出現傳承選項", endingHtml.includes('data-child="小安"'), endingHtml.slice(0, 120));

// 4.1.1 結婚／離婚第1層提示
ev(`state.phase='playing'; state.ending=null; state.characters.forEach(c=>{ if(c.romanceStatus==='married') c.romanceStatus=null; });
    state.characters.push({name:'阿哲',relation:'戀愛對象',romanceStatus:'stable',age:30,affinity:80,active:true,traits:'',summary:'',lastTurn:state.turnCount,isChild:false});
    state.milestones.marriage_decision='available'`);
override = () => ({ milestone_updates: [{ id: "marriage_decision", status: "completed" }] });
await H.playTurn(g);
A.check("結婚當回合：第1層提示", ev("JSON.stringify(state.log[state.log.length-1].relationshipHints||[])").includes("你和阿哲結婚了"), ev("JSON.stringify(state.log[state.log.length-1].relationshipHints)"));
override = () => ({});
ev("finalizeDivorce(state,'阿哲',null,null)");
await H.playTurn(g);
A.check("離婚後的回合：第1層提示", ev("JSON.stringify(state.log[state.log.length-1].relationshipHints||[])").includes("離婚了"));

// 2.2.2 出社會後時間標籤不提前
ev(`state.studentStatus='graduated'; state.timeState.stageMode='career'; state.age=35; state.timeState.adultTurnsInYear=roundsPerYearForAge(35)-1`);
const adv = JSON.parse(ev("JSON.stringify(advanceStructuredTime('繼續上班'))"));
A.check("每年最後一回合：currentLabel是這一年的標籤", adv.currentLabel === adv.fromLabel && adv.currentLabel !== adv.toLabel, adv);

// 12.13 prompt.js
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt不再叫AI自行決定升遷/創業結果", !prompt.includes("再決定結果"));
A.check("prompt說明layoff_foreshadow/business_annual", prompt.includes("layoff_foreshadow") && prompt.includes("business_annual"));

// 8.9/12.4/12.8.2 興趣類別對應職業類別
ev(`state.stats.knowledge=50; state.stats.network=50; state.conscientiousness.achievement=50; state.studentMajorGroup=null;
    state.studentStatus='graduated'; state.collegeDelayYearsUsed=0; state.age=30; state.careerStatus=CAREER_STATUS.UNEMPLOYED;
    state.interestCandidates=[]`);
const baseHire = ev("computeHireProbability(state,'自由/創作類',{})");
ev("state.interestCandidates=[{category:'藝術創作',status:'active',investment:57}]");
A.check("藝術創作active投入57 → 自由/創作類+5", ev("computeHireProbability(state,'自由/創作類',{})") === baseHire + 5, { baseHire, v: ev("computeHireProbability(state,'自由/創作類',{})") });
A.check("藝術創作不影響受雇專業/白領類", ev("computeHireProbability(state,'受雇專業/白領類',{})") === ev("(state.interestCandidates=[], computeHireProbability(state,'受雇專業/白領類',{}))"));
ev("state.interestCandidates=[{category:'藝術創作',status:'active',investment:100},{category:'社交表演',status:'active',investment:90}]");
A.check("多張卡對應同一類：取最高、上限+10不加總", ev("computeInterestHireBonusPp(state,'自由/創作類')") === 10);
ev("state.interestCandidates=[{category:'藝術創作',status:'candidate',investment:90},{category:'社交表演',status:'dormant',investment:90}]");
A.check("候選/背景興趣不計", ev("computeInterestHireBonusPp(state,'自由/創作類')") === 0);
ev("state.interestCandidates=[{category:'商業交易',status:'active',investment:80},{category:'藝術創作',status:'active',investment:100}]");
A.check("創業相關興趣只看手作/商業：取商業80", ev("topMatchedActiveInterestInvestment(state,'自營/家庭事業類')") === 80);
A.check("不穩定/待業類沒有任何興趣對應", ev("Object.values(INTEREST_OCCUPATION_MATCH).flat().includes('不穩定/待業類')") === false);
// 2026-09-28補：8.9七類逐一對照、刻意不對應的三類、投入度換算點、疊加上限、不影響薪資/職級
const ALL_OCC = ["自由/創作類","自營/家庭事業類","勞力/服務類","受雇專業/白領類","軍公教/警消類","不穩定/待業類","政治人物子女(自身從政)","長期不在身邊類"];
const EXPECT_89 = {
  藝術創作: ["自由/創作類"], 手作工藝: ["自營/家庭事業類","勞力/服務類"], 知識研究: ["受雇專業/白領類","軍公教/警消類"],
  體能競技: ["勞力/服務類","軍公教/警消類"], 科技邏輯: ["受雇專業/白領類","勞力/服務類"],
  社交表演: ["自由/創作類","受雇專業/白領類"], 商業交易: ["自營/家庭事業類","受雇專業/白領類"]
};
A.check("8.9對應表剛好七類", ev("Object.keys(INTEREST_OCCUPATION_MATCH).length") === 7);
for (const [cat, targets] of Object.entries(EXPECT_89)) {
  ev(`state.interestCandidates=[{category:'${cat}',status:'active',investment:100}]`);
  const got = ALL_OCC.filter(o => ev(`computeInterestHireBonusPp(state,${JSON.stringify(o)})`) === 10);
  A.check(`${cat}只對到${targets.join("、")}`, JSON.stringify(got.sort()) === JSON.stringify([...targets].sort()), got);
}
ev("state.interestCandidates=Object.keys(INTEREST_OCCUPATION_MATCH).map(c=>({category:c,status:'active',investment:100}))");
for (const o of ["不穩定/待業類","政治人物子女(自身從政)","長期不在身邊類"])
  A.check(`七類全滿投入：${o}加成恆為0`, ev(`computeInterestHireBonusPp(state,${JSON.stringify(o)})`) === 0);
for (const [inv, want] of [[0,0],[9,0],[10,1],[55,5],[100,10]]) {
  ev(`state.interestCandidates=[{category:'藝術創作',status:'active',investment:${inv}}]`);
  A.check(`投入度${inv} → +${want}`, ev("computeInterestHireBonusPp(state,'自由/創作類')") === want);
}
ev(`state.stats.knowledge=100; state.stats.network=100; state.conscientiousness.achievement=100; state.studentMajorGroup='藝術設計表演';
    state.interestCandidates=[{category:'藝術創作',status:'active',investment:100}]`);
const stackBd = ev("JSON.stringify(hireProbabilityBreakdown(state,'自由/創作類',{creativeBonusPct:10}))");
const stack = JSON.parse(stackBd);
A.check("科系對口＋伏筆＋興趣疊加：三項都在明細", ["科系對口","職涯伏筆","相關興趣投入"].every(l => stack.items.some(x => x.label === l)), stack.items);
A.check("疊加後錄取機率仍≤90", stack.raw > 90 && stack.total === 90, stack);
ev("state.stats.knowledge=60; state.jobLevel=1; state.tenureMonths=24; state.interestCandidates=[]");
const salary0 = ev("computeCareerSalary(state,'自由/創作類')"), pct0 = ev("computeSalaryPercentile(state)");
ev("state.interestCandidates=Object.keys(INTEREST_OCCUPATION_MATCH).map(c=>({category:c,status:'active',investment:100}))");
A.check("興趣投入度不影響薪資落點/薪資", ev("computeSalaryPercentile(state)") === pct0 && ev("computeCareerSalary(state,'自由/創作類')") === salary0);
A.check("興趣投入度不改職級", ev("state.jobLevel") === 1);
ev("state.stats.knowledge=50; state.stats.network=50; state.conscientiousness.achievement=50; state.studentMajorGroup=null; state.jobLevel=0; state.tenureMonths=0");
ev("state.interestCandidates=[]");

// 13.2 健康經營年 → cap+5
ev("state.healthCapBonusEarned=false; state.healthyYearStreak=0; state.age=45");
const cap0 = ev("computeHealthCap(state)");
for (let y = 0; y < 7; y++) ev("state.turnsThisYearForHealth=10; state.healthyTurnsThisYear=3; settleHealthyYear(state)");
A.check("連續7年健康經營：尚未取得", ev("state.healthCapBonusEarned") === false && ev("state.healthyYearStreak") === 7);
ev("state.turnsThisYearForHealth=10; state.healthyTurnsThisYear=1; settleHealthyYear(state)");
A.check("中斷一年(10%)：連續年數歸零", ev("state.healthyYearStreak") === 0);
for (let y = 0; y < 8; y++) ev("state.turnsThisYearForHealth=8; state.healthyTurnsThisYear=2; settleHealthyYear(state)");
A.check("連續8年≥25%：取得cap+5", ev("state.healthCapBonusEarned") === true && ev("computeHealthCap(state)") === cap0 + 5, { cap0, cap: ev("computeHealthCap(state)") });
ev("state.healthCapBonusEarned=false; state.turnsThisYearForHealth=0; state.healthyTurnsThisYear=0; state.timeState.stageMode='career'; state.phase='playing'");
override = () => ({ stat_deltas: { health: 2, network: 0, expression: 0 } });
await H.playTurn(g);
A.check("出社會後健康+的回合會被計入", ev("state.healthyTurnsThisYear") >= 1 && ev("state.turnsThisYearForHealth") >= 1, { h: ev("state.healthyTurnsThisYear"), t: ev("state.turnsThisYearForHealth") });
override = () => ({});

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
