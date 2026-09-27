// 2026-09-27：9/26落差掃描第二節（有做但不完整）2A批——規則明確、可直接做的項目（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("9/27落差修正2A");
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => override(p, b) }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "gapfix2a01" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const doc = g.win.document;

// 3.2.2 milestone超上限降級intensive、enum外降級ordinary
ev("state.knowledgeMilestoneCountByStage={}; state.knowledgeMilestoneUsedIds=[]; state.knowledgeMilestoneCountByStage[chronicleLifeStageKey(state)]=KNOWLEDGE_MILESTONE_CAP_PER_STAGE");
const capped = ev("rollKnowledgeRawValue('milestone','new_evt_x',state)");
A.check("milestone達上限：改算intensive(5~8)", capped >= 5 && capped <= 8, capped);
ev("state.knowledgeMilestoneCountByStage={}; state.knowledgeMilestoneUsedIds=['dup_evt']");
A.check("milestone重複event_id：仍給0(去重)", ev("rollKnowledgeRawValue('milestone','dup_evt',state)") === 0);
const weird = ev("rollKnowledgeRawValue('super_big',null,state)");
A.check("enum外的值：降級ordinary(3~5)", weird >= 3 && weird <= 5, weird);
A.check("沒有event_type：0", ev("rollKnowledgeRawValue(null,null,state)") === 0);

// 3.4.11 非主要照顧者的子女扶養費不因降級停止
ev("state.characters.push({name:'小宇',relation:'兒子',isChild:true,age:8,affinity:50,active:false,cohabiting:false,traits:'',summary:'',lastTurn:0})");
A.check("未同住、已降級的未成年子女仍計扶養費", ev("computeChildSupportCost(state)") > 0);
ev("state.characters.find(c=>c.name==='小宇').deceased=true");
A.check("過世的子女不計", ev("computeChildSupportCost(state)") === 0);
ev("state.characters=state.characters.filter(c=>c.name!=='小宇')");

// 4.2 結構化里程碑自動進履歷
ev("state.milestoneChronicled=[]; state.milestones.graduation_highschool='completed'");
const ch0 = ev("state.chronicle.length");
await H.playTurn(g);
A.check("高中畢業完成 → 履歷自動一筆", ev("state.chronicle.slice(" + ch0 + ").some(x=>x.includes('高中畢業'))"), ev("JSON.stringify(state.chronicle.slice(-3))"));
const ch1 = ev("state.chronicle.length");
await H.playTurn(g);
A.check("同一里程碑不重複記", ev("state.chronicle.slice(" + ch1 + ").filter(x=>x.includes('高中畢業')).length") === 0);
ev("delete state.milestoneChronicled; state.milestones.moved_out='completed'");
const ch2 = ev("state.chronicle.length");
await H.playTurn(g);
A.check("舊存檔(無欄位)：已完成的不在現在補記", ev("state.chronicle.slice(" + ch2 + ").every(x=>!x.includes('搬出家裡'))"));

// 1.1.2 入職第X年・上/下半年
ev("state.timeState.stageMode='career'; state.studentStatus='graduated'; state.careerEntryAge=24; state.age=24; state.timeState.adultTurnsInYear=0; state.timeState.prologue=false");
A.check("24歲出社會第一年上半年", ev("computeTimeLabel(state)") === "入職第1年・上半年", ev("computeTimeLabel(state)"));
ev("state.age=26; state.timeState.adultTurnsInYear=roundsPerYearForAge(26)-1");
A.check("26歲下半年＝入職第3年・下半年", ev("computeTimeLabel(state)") === "入職第3年・下半年", ev("computeTimeLabel(state)"));

// 9.5.1 轉系年齡門檻
ev("state.timeState.stageMode='college'; state.studentStatus='enrolled'; state.transferCooldown=0; state.examBelowExpectationStreak=TRANSFER_EXAM_STREAK_TRIGGER; state.pendingTransferOffer=false; state.stats.knowledge=0; state.collegeDelayYearsUsed=0");
ev("state.age=22; updateTransferCandidateOnExam(state,0)");
A.check("22歲(超過可行年齡)：轉系候選不成立", ev("!state.pendingTransferOffer") && ev("state.lastExamPerformanceLog.candidate") === false);
ev("state.age=19; state.examBelowExpectationStreak=TRANSFER_EXAM_STREAK_TRIGGER; Math.__r=Math.random; Math.random=()=>0; updateTransferCandidateOnExam(state,0); Math.random=Math.__r"); // 9.5.1候選機率，固定骰值
A.check("19歲：候選成立，log含candidate", ev("state.pendingTransferOffer===true") && ev("state.lastExamPerformanceLog.candidate") === true);
ev("state.pendingTransferOffer=false; state.timeState.stageMode='career'; state.studentStatus='graduated'");

// 12.4 接受/拒絕offer（含保底）
ev("state.careerStatus=CAREER_STATUS.JOB_SEARCHING; state.occupationCategory=null; state.jobSearchStreak=JOB_SEARCH_STREAK_FALLBACK; state.age=30");
ev("resolveJobApplication(state,'受雇專業/白領類',false,{deferAccept:true})");
A.check("保底錄取＋deferAccept：先不上任", ev("!!state.pendingJobOffer") && ev("state.careerStatus") !== ev("CAREER_STATUS.EMPLOYED"));
ev("declineJobOffer(state)");
A.check("拒絕保底offer：維持求職、streak不變", ev("state.careerStatus===CAREER_STATUS.JOB_SEARCHING") && ev("state.jobSearchStreak===JOB_SEARCH_STREAK_FALLBACK") && ev("!state.occupationCategory"));
ev("resolveJobApplication(state,'受雇專業/白領類',false,{deferAccept:true}); acceptJobOffer(state)");
A.check("接受offer：上任", ev("state.careerStatus===CAREER_STATUS.EMPLOYED") && !!ev("state.occupationCategory"));
// 彈窗流程
ev("state.careerStatus=CAREER_STATUS.JOB_SEARCHING; state.occupationCategory=null; state.jobSearchStreak=JOB_SEARCH_STREAK_FALLBACK; renderJobSearchModal({offers:buildJobSearchOffers(state), isTransfer:false, isFallback:true})");
doc.getElementById("btn-job-search-apply").click();
A.check("彈窗錄取後出現接受/婉拒按鈕", !!doc.getElementById("btn-job-offer-accept") && !!doc.getElementById("btn-job-offer-decline"));
doc.getElementById("btn-job-offer-decline").click();
A.check("彈窗按婉拒：沒有上任、彈窗關閉", ev("!state.occupationCategory") && !doc.getElementById("job-search-modal"));

// 11.2 明細
ev("state.jobSearchStreak=0; state.stats.knowledge=70; state.stats.network=40; state.conscientiousness.achievement=60; renderJobSearchModal({offers:buildJobSearchOffers(state), isTransfer:false, isFallback:false})");
doc.getElementById("btn-job-search-apply").click();
const txt = doc.getElementById("job-search-stage2").textContent;
A.check("求職結果列出屬性加成明細", txt.includes("屬性加成") && txt.includes("才識70") && txt.includes("人脈40"), txt.slice(0, 160));
const bd = JSON.parse(ev("JSON.stringify(hireProbabilityBreakdown(state,'受雇專業/白領類',{}))"));
A.check("明細總和＝computeHireProbability", Math.abs(bd.total - ev("computeHireProbability(state,'受雇專業/白領類',{})")) < 1e-9);
doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove());
if (ev("!!state.pendingJobOffer")) ev("declineJobOffer(state)");

// 12.3 離職清高風險旗標
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='勞力/服務類'; state.riskyLifestyle=true; state.monthlyIncome=40; state.age=65; state.retirementStatus='在職'; resolveRetirementOffer(state,'on_time')");
A.check("退休後riskyLifestyle清除", ev("state.riskyLifestyle") === false);

// 12.8.1 自由輸入創業
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.retirementStatus='在職'; state.businessStatus=null; state.pendingBusinessLaunch=null; state.age=35; state.timeState.adultTurnsInYear=0");
ev("advanceStructuredTime('我想辭職自己開店')");
A.check("自由輸入想開店 → 創業彈窗排入", ev("!!state.pendingBusinessLaunch") && ev("state.pendingBusinessLaunch.source") === "free_input");
ev("state.pendingBusinessLaunch=null");

// 12.6.1 自由輸入出國
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.pendingJobSearch=null; state.careerTransferCooldown=0; state.cash=0; state.careerEventLog=null");
ev("advanceStructuredTime('我想申請外派')");
A.check("現金不足想外派：不成立並告知AI", !ev("state.pendingJobSearch") && ev("state.careerEventLog && state.careerEventLog.type") === "overseas_blocked");
ev("state.cash=99999; state.careerEventLog=null; advanceStructuredTime('我想申請外派')");
A.check("現金足夠：海外型轉職候選", ev("!!(state.pendingJobSearch && state.pendingJobSearch.isOverseas)"));
ev("state.characters.forEach(c=>{ if(c.origin==='父母，從出生起') c.cohabiting=true; })");
ev("Math.__r=Math.random; Math.random=()=>0; resolveJobApplication(state,'受雇專業/白領類',true,{isOverseas:true}); Math.random=Math.__r");
A.check("海外轉職錄取：父母同住標記解除", ev("state.characters.filter(c=>c.origin==='父母，從出生起').every(c=>!c.cohabiting)"));

// 13.6 父母過世回合emotional_tone強制heavy
ev("window.__tones=[]; const __ah=applyHappiness; applyHappiness=(s,t)=>{ window.__tones.push(t); return __ah(s,t); }");
const parentName = ev("(state.characters.find(c=>c.origin==='父母，從出生起'&&!c.deceased)||{}).name");
ev(`finalizeParentDeath(state, ${JSON.stringify(parentName)})`);
override = () => ({ emotional_tone: "uplifting" });
await H.playTurn(g);
A.check("父母過世回合：AI回uplifting仍以heavy計", ev("window.__tones[window.__tones.length-1]") === "heavy", ev("JSON.stringify(window.__tones)"));
override = () => ({});

// 13.5.2 照顧決策排隊＋獨生子女
ev(`state.characters=state.characters.filter(c=>c.origin!=='手足，從出生起');
    state.characters.push({name:'老爸',relation:'父親',origin:'父母，從出生起',healthStage:2,affinity:60,active:true,traits:'',summary:'',lastTurn:0},{name:'老媽',relation:'母親',origin:'父母，從出生起',healthStage:2,affinity:60,active:true,traits:'',summary:'',lastTurn:0});
    state.pendingEldercareDecision={parentName:'老爸',stage:2}; state.eldercareQueue=[{parentName:'老媽',stage:2}]`);
ev("renderEldercareDecisionModal(state.pendingEldercareDecision)");
A.check("沒有手足：不顯示手足選項、保留機構選項", !doc.querySelector('.ec-btn[data-key="split"]') && !doc.querySelector('.ec-btn[data-key="limited"]') && !!doc.querySelector('.ec-btn[data-key="hire"]'));
doc.getElementById("btn-ec-confirm").click();
A.check("第一位決定完：第二位接著排上", ev("state.pendingEldercareDecision && state.pendingEldercareDecision.parentName") === "老媽");
ev("state.pendingEldercareDecision=null");

// 4.1.1 劇情角色名可點
const html = ev("renderParagraphs('老媽在廚房叫你。', true)");
A.check("日記裡的角色名包成可點連結", html.includes('class="npc-link"') && html.includes('data-npc="老媽"'));
A.check("人生之書等不啟用時不加連結", !ev("renderParagraphs('老媽在廚房叫你。')").includes("npc-link"));
const holder = doc.createElement("div"); holder.innerHTML = html; doc.body.appendChild(holder);
holder.querySelector(".npc-link").dispatchEvent(new g.win.MouseEvent("click", { bubbles: true }));
A.check("點角色名叫出詳細頁", !!doc.querySelector(".modal-backdrop"));
doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove()); holder.remove();

// 7.4.2 傳承家境含房產淨值
ev("state.cash=100; state.propertyValue=5000; state.mortgageBalance=1000");
A.check("死亡當下財富＝現金＋房產淨值 → 富裕", ev("economicTierForSavingsAmount((state.cash||0)+Math.max(0,state.propertyValue-state.mortgageBalance))") === "富裕");
const src = fs.readFileSync(path.join(H.ROOT, "index.html"), "utf8");
A.check("succeedAsChild改用淨資產", src.includes("rollEconomicTierForced(economicTierForSavingsAmount(netWorthAtDeath))"));

// prompt
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：12.7裁員不歸因玩家", prompt.includes("部門裁撤"));
A.check("prompt：2.3假期活動選單", prompt.includes("純耍廢"));
A.check("prompt：1.2.8.4.1關鍵事件前溫暖日常", prompt.includes("溫暖平常的日常"));
A.check("prompt：5.2.6喪親忌日", prompt.includes("忌日"));
A.check("prompt：8.6背景興趣敘事喚醒", prompt.includes("整理舊物"));
A.check("prompt：overseas_blocked說明", prompt.includes("overseas_blocked"));

// mock長程回歸
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "gapfix2am" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
for (let i = 0; i < 400; i++) { await H.playTurn(gm); if (gm.ev("state.phase") !== "playing") break; }
A.check("mock連續400回合正常(跨到出社會)", gm.errors.length === 0 && gm.ev("state.turnCount") > 300, { t: gm.ev("state.turnCount"), age: gm.ev("state.age"), err: gm.errors.map(String).slice(0, 2) });

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
