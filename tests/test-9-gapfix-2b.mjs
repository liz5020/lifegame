// 2026-09-27：9/26落差掃描第二節2B批——使用者同意Claude建議的15項（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("9/27落差修正2B");
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => override(p, b) }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "gapfix2b01" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const doc = g.win.document;
const fixRandom = (v) => ev(`Math.__r=Math.__r||Math.random; Math.random=()=>${v}`);
const restoreRandom = () => ev("if(Math.__r) Math.random=Math.__r");

// 1. 3.2.2 階段改8段
ev("state.studentStatus='graduated'; state.age=35; state.knowledgeMilestoneCountByStage={}; state.knowledgeMilestoneUsedIds=[]");
ev("rollKnowledgeRawValue('milestone','m1',state); rollKnowledgeRawValue('milestone','m2',state)");
ev("state.age=45");
const v45 = ev("rollKnowledgeRawValue('milestone','m3',state)");
A.check("35歲用完2次後，45歲(另一段)仍可給milestone(10~15)", v45 >= 10 && v45 <= 15, v45);

// 2. 12.5 持續達標＋無負面事件
ev(`state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.jobLevel=0; state.tenureMonths=999;
    state.promotionCooldown=0; state.pendingPromotionOffer=null; state.pendingJobSearch=null; state.promotionDeclineStreak=0;
    state.conscientiousness.selfDiscipline=60; state.conscientiousness.responsibility=60; resetLevelPeriod(state)`);
ev("checkPromotionCandidate(state)");
A.check("一直達標：升遷候選成立", ev("!!state.pendingPromotionOffer"));
ev("state.pendingPromotionOffer=null; resetLevelPeriod(state); state.conscientiousness.selfDiscipline=40; trackLevelPeriod(state); state.conscientiousness.selfDiscipline=60; checkPromotionCandidate(state)");
A.check("期間曾跌破50(現在已回升)：不成立", !ev("state.pendingPromotionOffer"));
ev("resetLevelPeriod(state); state.levelNegativeEvent=false");
fixRandom(0.999);
ev("resolveJobApplication(state,'勞力/服務類',true,{})");
restoreRandom();
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.pendingJobSearch=null; checkPromotionCandidate(state)");
A.check("申請轉職被拒後：這個職級不成立", ev("state.levelNegativeEvent") === true && !ev("state.pendingPromotionOffer"));
ev("state.jobLevel=0; state.tenureMonths=0"); fixRandom(0);
ev("state.pendingPromotionOffer=null; state.promotionCooldown=0; resolvePromotionOffer(state,true)"); restoreRandom();
A.check("升遷成功：職級期間重新起算", ev("state.levelNegativeEvent") === false);

// 3. 4.3 active
ev(`state.milestones.marriage_decision='available'; state.characters=state.characters.filter(c=>c.name!=='小芸');
    state.characters.push({name:'小芸',relation:'戀愛對象',romanceStatus:'stable',cohabiting:true,affinity:80,active:true,traits:'',summary:'',lastTurn:state.turnCount})`);
ev("refreshMilestoneLocks(state)");
A.check("同居未婚：marriage_decision＝active", ev("state.milestones.marriage_decision") === "active");
ev("state.characters.find(c=>c.name==='小芸').cohabiting=false; refreshMilestoneLocks(state)");
A.check("不再同居：回到available", ev("state.milestones.marriage_decision") === "available");
ev("state.characters=state.characters.filter(c=>c.name!=='小芸')");

// 4. 5.2.4 照顧者型解除
ev("state.peerPositionSpecial='照顧者型'; state.peerPositionAtSpecial=null; state.peerPosition=50");
override = () => ({ peer_position_shift: 0 });
await H.playTurn(g);
A.check("取得當時數值被記下、標籤仍在", ev("state.peerPositionAtSpecial") === 50 && ev("state.peerPositionSpecial") === "照顧者型");
ev("state.peerPosition=75");
await H.playTurn(g);
A.check("偏離超過20：解除照顧者型，改依數值", ev("state.peerPositionSpecial") === null && ev("peerPositionLabel(state.peerPosition,state.peerPositionSpecial)") !== "照顧者型");
override = () => ({});

// 5. 12.6 第二次以後轉職進履歷
ev("state.milestones.first_job_change='completed'; state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.jobSearchStreak=0");
const c0 = ev("state.chronicle.length"); fixRandom(0);
ev("resolveJobApplication(state,'勞力/服務類',true,{})"); restoreRandom();
A.check("第二次轉職寫進履歷", ev(`state.chronicle.slice(${c0}).some(x=>x.includes('轉職到勞力/服務'))`), ev("JSON.stringify(state.chronicle.slice(-2))"));

// 6. 7.6.3 非主要照顧者選項
ev(`state.characters.push({name:'阿樂',relation:'兒子',isChild:true,age:1,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[],custody:'non_primary'})`);
const opts = JSON.parse(ev("JSON.stringify(parentingNodeOptionsFor(state.characters.find(c=>c.name==='阿樂'), PARENTING_GROWTH_NODES.infant).map(o=>o.id))"));
A.check("非主要照顧者：拿掉每天陪伴、補探視/電話/金錢", !opts.includes("heavy_involve") && !opts.includes("share_equally") && opts.includes("np_visit") && opts.includes("np_money"), opts);
ev("renderParentingNodeModal({childName:'阿樂', nodeKey:'infant'})");
A.check("彈窗顯示非主要照顧者選項", !!doc.querySelector('.parenting-opt-btn[data-key="np_call"]'));
doc.querySelector('.parenting-opt-btn[data-key="np_call"]').click();
doc.getElementById("btn-parenting-confirm").click();
A.check("選探視類選項會記進教養紀錄", ev("state.characters.find(c=>c.name==='阿樂').parentingLog.slice(-1)[0].choice_id") === "np_call");
A.check("主要照顧者維持原選項", JSON.parse(ev("JSON.stringify(parentingNodeOptionsFor({custody:'primary'}, PARENTING_GROWTH_NODES.infant).map(o=>o.id))")).includes("heavy_involve"));

// 7. 9.5.1 轉系候選機率＋結果用2.4考試算法
ev("state.timeState.stageMode='college'; state.studentStatus='enrolled'; state.age=19; state.collegeDelayYearsUsed=0; state.transferCooldown=0; state.pendingTransferOffer=false; state.stats.knowledge=50; state.conscientiousness.selfDiscipline=50");
ev("state.examBelowExpectationStreak=TRANSFER_EXAM_STREAK_TRIGGER"); fixRandom(0.99);
ev("updateTransferCandidateOnExam(state,0)"); restoreRandom();
A.check("擲骰沒過(50%)：不成立但log記機率", !ev("state.pendingTransferOffer") && ev("state.lastExamPerformanceLog.candidateProbPct") === 50);
const tkey = ev("MAJOR_CATEGORIES ? MAJOR_CATEGORIES[0].key : null");
ev("state.stats.knowledge=100; state.studyCountThisTerm=10");
const tr = JSON.parse(ev(`JSON.stringify(resolveTransferOffer(state,'apply',${JSON.stringify(tkey)}))`));
A.check("轉系結果用考試分數判定(才識100＋讀書10次必過60)", tr.examCheck && tr.examCheck.base === 100 && tr.success === true, tr);

// 8. 9.5.3 財務健康度＋機率
ev("state.leaveStatus='normal'; state.pendingLeaveOffer=null; state.withdrawalOfferCooldown=0; state.lowHealthStreak=0; state.lowCashStreak=0; state.familySavings=0; state.familyMonthlyIncome=0; state.cash=999");
fixRandom(0.99); ev("for(let i=0;i<WITHDRAWAL_STREAK_TRIGGER;i++) sweepUniversityState(state)"); restoreRandom(); // sweep內部也會擲候選骰，固定為不成立
A.check("家庭財務健康度<20連續4回合：streak達門檻(即使手上有現金)", ev("state.lowCashStreak") >= 4, ev("state.lowCashStreak"));
fixRandom(0.99); ev("checkWithdrawalCandidate(state)"); restoreRandom();
A.check("擲骰沒過(60%)：不成立", ev("state.pendingLeaveOffer") === null);
fixRandom(0); ev("checkWithdrawalCandidate(state)"); restoreRandom();
A.check("擲骰過：成立", ev("state.pendingLeaveOffer") === "financial");
ev("state.pendingLeaveOffer=null; state.timeState.stageMode='career'; state.studentStatus='graduated'");

// 9. 12.8.2 創業健康代價／依規模扣虧損
ev(`state.businessStatus='經營中'; state.careerStatus=CAREER_STATUS.BUSINESS; state.businessCapital=1000; state.jobLevel=2; state.cash=5000; state.stats.health=80; state.conscientiousness.achievement=50; state.consecutiveLossYears=0`);
fixRandom(0.999); ev("rollAnnualBusinessCheck(state)"); restoreRandom();
A.check("虧損：扣1000×(10%＋2×5%)=200", ev("state.cash") === 4800, ev("state.cash"));
ev("state.jobLevel=0; state.stats.health=80"); fixRandom(0); ev("rollAnnualBusinessCheck(state)"); restoreRandom();
A.check("成長年：健康扣3(成就50)", ev("state.stats.health") === 77, ev("state.stats.health"));
ev("state.businessStatus=null; state.careerStatus=CAREER_STATUS.EMPLOYED");

// 10. 12.8.1 副業持續24回合升級
ev(`state.pendingBusinessLaunch=null; state.interestCandidates=[{category:'手作工藝',status:'active',investment:50,sideBusinessStatus:'formal',sideBusinessSince:state.turnCount-10}]`);
ev("checkSideBusinessUpgrade(state)");
A.check("正式副業10回合：還不升級", !ev("state.pendingBusinessLaunch"));
ev("state.interestCandidates[0].sideBusinessSince=state.turnCount-24; checkSideBusinessUpgrade(state)");
A.check("滿24回合：創業候選", ev("state.pendingBusinessLaunch && state.pendingBusinessLaunch.source") === "side_business");
ev("state.pendingBusinessLaunch=null; checkSideBusinessUpgrade(state)");
A.check("每張卡只升級一次", !ev("state.pendingBusinessLaunch"));
ev("state.interestCandidates=[]");

// 11. 12.10 退休
ev(`state.careerStatus=CAREER_STATUS.EMPLOYED; state.retirementStatus='在職'; state.pendingRetirementOffer=null; state.majorIllness=null; state.stats.health=80; state.age=56`);
ev("checkRetirementCandidate(state)");
A.check("56歲：跳退休彈窗", ev("!!state.pendingRetirementOffer && !state.pendingRetirementOffer.forced"));
ev("state.pendingRetirementOffer=null; state.cash=0; state.monthlyIncome=0");
A.check("財務健康度不足：不能提早退休", ev("canRetireEarly(state)") === false);
ev("resolveRetirementOffer(state,'early')");
A.check("送出early被擋下：仍在職", ev("state.careerStatus===CAREER_STATUS.EMPLOYED"));
ev("state.majorIllness={stage:'treatment',turnsInStage:0,treatmentTargetTurns:5}; checkRetirementCandidate(state)");
A.check("治療期：被迫退休(illness)", ev("state.pendingRetirementOffer && state.pendingRetirementOffer.forced && state.pendingRetirementOffer.reason") === "illness");
ev("renderRetirementOfferModal(state.pendingRetirementOffer); state.pendingRetirementOffer=null");
A.check("被迫退休彈窗：沒有延後，只有半退休/療養", !doc.querySelector('.ret-btn[data-key="delay"]') && !!doc.querySelector('.ret-btn[data-key="semi"]') && !!doc.querySelector('.ret-btn[data-key="rest"]'));
doc.getElementById("btn-ret-confirm").click();
A.check("直接按確定＝專心療養(完全退休)", ev("state.careerStatus===CAREER_STATUS.RETIRED"));
ev("state.majorIllness=null");

// 12. 13.3.2 急性病
ev("state.age=40; state.cash=1000; state.housing={type:'rent'}; state.chronicConditions=[]; state.acuteRecoveryTurns=0; state.stats.health=70");
const liv = ev("computeBaseLivingCost(state)");
ev("state.stats.health=70; state.cash=1000");
// 直接呼叫疾病判定裡的急性分支：用rollAnnualIllnessCheck並固定分類
ev("window.__pick=rollIllnessLevel; rollIllnessLevel=()=>'acute'; window.__p=illnessAnnualProbability; illnessAnnualProbability=()=>1");
fixRandom(0); const acute = JSON.parse(ev("JSON.stringify(rollAnnualIllnessCheck(state))")); restoreRandom(); // 機率×健康倍率可能<1，固定骰值
ev("rollIllnessLevel=window.__pick; illnessAnnualProbability=window.__p");
A.check("急性病：扣1個月生活開銷、之後3回合回升", acute && acute.level === "acute" && ev("state.cash") === 1000 - liv && ev("state.acuteRecoveryTurns") === 3, { acute, cash: ev("state.cash"), liv });
const h0 = ev("state.stats.health");
ev("applyAcuteRecovery(state)");
A.check("回升一回合＋2", ev("state.stats.health") === Math.min(h0 + 2, 100) && ev("state.acuteRecoveryTurns") === 2);

// 13. 13.3.4 治療期
ev(`state.careerStatus=CAREER_STATUS.EMPLOYED; state.retirementStatus='在職'; state.pendingRetirementOffer=null;
    state.characters.push({name:'阿芬',relation:'配偶',romanceStatus:'married',affinity:60,active:true,traits:'',summary:'',lastTurn:0});
    state.majorIllness={stage:'diagnosed',turnsInStage:0}`);
const aff0 = ev("state.characters.find(c=>c.name==='阿芬').affinity");
ev("advanceMajorIllness(state)");
A.check("進入治療期：配偶好感+2、立即被迫退休判定", ev("state.characters.find(c=>c.name==='阿芬').affinity") === aff0 + 2 && ev("state.pendingRetirementOffer && state.pendingRetirementOffer.forced"));
ev("state.pendingRetirementOffer=null; state.cash=1000");
const liv2 = ev("computeBaseLivingCost(state)");
ev("advanceMajorIllness(state)");
A.check("治療期每回合扣0.5個月開銷", ev("state.cash") === 1000 - Math.round(liv2 * 0.5), { cash: ev("state.cash"), liv2 });
ev("state.majorIllness=null");

// 14. 13.6 手足協商＋另一位家長
ev(`state.characters=state.characters.filter(c=>!['老爸','老媽','阿哥','小妹'].includes(c.name) && c.origin!=='父母，從出生起' && c.origin!=='手足，從出生起' && c.origin!=='隔代教養，從出生起');
    state.characters.push({name:'老爸',relation:'父親',origin:'父母，從出生起',healthStage:1,age:80,affinity:60,active:true,traits:'',summary:'',lastTurn:0},
      {name:'老媽',relation:'母親',origin:'父母，從出生起',healthStage:1,age:78,affinity:60,active:true,traits:'',summary:'',lastTurn:0},
      {name:'阿哥',relation:'哥哥',origin:'手足，從出生起',affinity:70,active:true,traits:'',summary:'',lastTurn:0},
      {name:'小妹',relation:'妹妹',origin:'手足，從出生起',affinity:30,active:true,traits:'',summary:'',lastTurn:0});
    state.pendingEldercareDecision=null; state.eldercareQueue=[]`);
ev("finalizeParentDeath(state,'老爸')");
const pd = JSON.parse(ev("JSON.stringify(state.parentDeathEventLog)"));
A.check("手足依關係值分協商/衝突", pd.siblings_estate && pd.siblings_estate.find(x => x.name === "阿哥").tone === "negotiation" && pd.siblings_estate.find(x => x.name === "小妹").tone === "conflict", pd);
A.check("另一位家長提前一階並排入照顧決策", ev("state.characters.find(c=>c.name==='老媽').healthStage") === 2 && ev("state.pendingEldercareDecision && state.pendingEldercareDecision.parentName") === "老媽");
ev("state.pendingEldercareDecision=null");

// 15. 7.3.5.4 子女互動enum
ev("state.characters.find(c=>c.name==='阿樂').affinity=50");
override = () => ({ character_updates: [{ name: "阿樂", affinity_delta: 30, child_interaction: "closer" }] });
await H.playTurn(g);
A.check("子女closer：+3，忽略affinity_delta=30", ev("state.characters.find(c=>c.name==='阿樂').affinity") === 53, ev("state.characters.find(c=>c.name==='阿樂').affinity"));
override = () => ({ character_updates: [{ name: "阿樂", child_interaction: "weird" }] });
await H.playTurn(g);
A.check("enum外：0", ev("state.characters.find(c=>c.name==='阿樂').affinity") === 53);
override = () => ({});

// prompt
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：child_interaction說明與schema", prompt.includes("child_interaction:{type") && prompt.includes("系統不看"));
A.check("prompt：siblings_estate/other_parent說明", prompt.includes("siblings_estate") && prompt.includes("other_parent"));

// mock長程回歸
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "gapfix2bm" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
for (let i = 0; i < 500; i++) { await H.playTurn(gm); if (gm.ev("state.phase") !== "playing") break; }
A.check("mock連續500回合正常", gm.errors.length === 0 && gm.ev("state.turnCount") > 300, { t: gm.ev("state.turnCount"), age: gm.ev("state.age"), err: gm.errors.map(String).slice(0, 2) });

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
