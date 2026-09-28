// 2026-09-27：第三節第三批（12.2求職期、12.9職場關係與合夥、12.10自訂/年資/交棒）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("第三節第三批");
let lastBody = "";
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => { lastBody = JSON.stringify(p); return {}; } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "batch3c001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const doc = g.win.document;
const flat = () => lastBody.replace(/\\"/g, '"');

// 12.2 求職期
ev(`state.studentStatus='graduated'; state.timeState.stageMode='career'; state.occupationCategory=null; state.careerStatus=CAREER_STATUS.NOT_EMPLOYED;
    state.jobSearchPhase=null; state.everSearchedJob=false; state.pendingJobSearch=null; state.familyBusinessFromPrevLife=false`);
ev("checkJobSearchTrigger(state)");
const total = ev("state.jobSearchPhase.total");
A.check("第一次求職：求職期5~6回合、第1回合不跳彈窗", total >= 5 && total <= 6 && ev("state.jobSearchPhase.first") === true && !ev("state.pendingJobSearch"));
for (let i = 1; i < total - 1; i++) ev("checkJobSearchTrigger(state)");
A.check("最後一回合之前都不跳", !ev("state.pendingJobSearch"));
ev("checkJobSearchTrigger(state)");
A.check("最後一回合結束：跳投遞彈窗、求職期結束", !!ev("state.pendingJobSearch") && ev("state.jobSearchPhase") === null);
ev("state.pendingJobSearch=null; state.careerStatus=CAREER_STATUS.JOB_SEARCHING; checkJobSearchTrigger(state)");
const t2 = ev("state.jobSearchPhase.total");
A.check("之後的求職期：3~5回合", t2 >= 3 && t2 <= 5 && ev("state.jobSearchPhase.first") === false);
await H.playTurn(g);
A.check("payload帶job_search_phase", /job_search_phase[^}]*total/.test(flat()) || ev("state.pendingJobSearch") !== null || ev("state.careerStatus") === ev("CAREER_STATUS.EMPLOYED"));
ev("state.jobSearchPhase=null; state.pendingJobSearch=null");

// 12.9 職場關係類別
const cats = JSON.parse(ev(`JSON.stringify(["公司同事","直屬主管","新來的下屬","合作廠商","高中同學"].map(workplaceRelationCategory))`));
A.check("職場關係歸成四類，其他不動", JSON.stringify(cats) === JSON.stringify(["同事", "主管", "下屬", "客戶或合作對象", null]), cats);
A.check("關係類別顯示", ev("relationCategoryLabel({relation:'直屬主管'})") === "主管");

// 12.9 合夥
ev("state.conscientiousness.teamSolo=0");
A.check("單打獨鬥(teamSolo 0)：合夥選項機率低但不為0", Math.abs(ev("partnerOptionProb(state)") - 0.3) < 1e-9);
ev("state.conscientiousness.teamSolo=100");
A.check("偏團隊(teamSolo 100)：機率0.9", Math.abs(ev("partnerOptionProb(state)") - 0.9) < 1e-9);
ev(`state.characters.push({name:'阿凱',relation:'公司同事',gender:'男',affinity:75,active:true,traits:'',summary:'',lastTurn:0});
    state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.businessStatus=null; state.cash=computeStartupCapitalRequired()*0.6`);
A.check("找得到合夥人", ev("findBusinessPartnerCandidate(state).name") === "阿凱");
ev("Math.__r=Math.random; Math.random=()=>0; renderBusinessLaunchModal({}); Math.random=Math.__r");
A.check("現金只夠一半：不能自己創業、可以找人合夥、也能先不創業", !doc.getElementById("btn-business-launch-solo") && !!doc.getElementById("btn-business-launch-partner") && !doc.getElementById("btn-business-launch-partner").disabled && !!doc.getElementById("btn-business-launch-decline"));
doc.getElementById("btn-business-launch-partner").click();
A.check("合夥創業：扣一半資金、記夥伴、收入×0.7", ev("state.businessStatus") === "經營中" && ev("state.businessPartner") === "阿凱" && ev("state.businessCapital") === Math.round(ev("computeStartupCapitalRequired()") * 0.5) && ev("state.monthlyIncome") === Math.round(ev("computeCareerSalary(state,'自營/家庭事業類')") * ev("SALARY_SCALE") * 0.7));

// 12.10 年資微調
ev("state.careerYearsWorked=40");
A.check("年資40年：替代率+6個百分點(上限)", Math.abs(ev("retirementTenureAdjustment(state)") - 0.06) < 1e-9);
ev("state.careerYearsWorked=10");
A.check("年資10年：−3個百分點", Math.abs(ev("retirementTenureAdjustment(state)") + 0.03) < 1e-9);
ev("state.careerYearsWorked=5; state.careerStatus=CAREER_STATUS.EMPLOYED; rollAnnualCareerChecks(state)");
A.check("在職每年累積年資", ev("state.careerYearsWorked") === 6);

// 12.10 交棒
ev(`state.characters.push({name:'小寶',relation:'兒子',gender:'男',isChild:true,age:25,affinity:80,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});
    state.careerStatus=CAREER_STATUS.BUSINESS; state.age=65; state.retirementStatus='在職'; state.pendingRetirementOffer=null`);
A.check("自營經營中＋成年子女：可以交棒", ev("canHandOverBusiness(state)") === true);
ev("renderRetirementOfferModal({forced:false})");
A.check("退休彈窗有交棒與自訂選項", !!doc.querySelector('.ret-btn[data-key="handover"]') && !!doc.querySelector('.ret-btn[data-key="custom"]'));
doc.querySelector('.ret-btn[data-key="custom"]').click();
doc.getElementById("ret-custom-input").value = "想去環島，順便幫朋友顧店";
doc.getElementById("btn-ret-confirm").click();
A.check("自訂：繼續工作、內容交給AI", ev("state.careerStatus===CAREER_STATUS.BUSINESS") && ev("state.careerEventLog.choice") === "custom" && ev("state.careerEventLog.text").includes("環島"));
ev("resolveRetirementOffer(state,'handover')");
A.check("交棒：退休、事業已交棒、子女記為繼承人、寫履歷", ev("state.retirementStatus") === "已退休" && ev("state.businessStatus") === "已交棒" && ev("state.characters.find(c=>c.name==='小寶').familyBusinessHeir") === true && ev("state.chronicle.slice(-1)[0]").includes("交給了小寶"));
await ev(`state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending'; succeedAsChild('小寶')`);
A.check("傳承給繼承人：下一世記著家業", ev("state.familyBusinessFromPrevLife") === true && ev("state.characters.find(c=>c.deceased).occupation") === "自營業者");
ev(`state.studentStatus='graduated'; state.timeState.stageMode='career'; state.careerStatus=CAREER_STATUS.NOT_EMPLOYED; state.occupationCategory=null; state.pendingFamilyBusinessOffer=null; checkJobSearchTrigger(state)`);
A.check("下一世出社會：先問要不要回來接家業", ev("state.pendingFamilyBusinessOffer && state.pendingFamilyBusinessOffer.fromPrevLife") === true && ev("state.familyBusinessFromPrevLife") === false);
ev("resolveFamilyBusinessOffer(state, state.pendingFamilyBusinessOffer, 'accept')");
A.check("接下家業：經營中、inherited", ev("state.businessStatus") === "經營中" && ev("state.businessOrigin") === "inherited");

// 一般退休：事業收起來
ev("state.businessStatus='經營中'; state.retirementStatus='在職'; state.careerStatus=CAREER_STATUS.BUSINESS; state.characters=state.characters.filter(c=>!c.isChild); resolveRetirementOffer(state,'on_time')");
A.check("自營者一般退休：事業收起、不再做年度營運", ev("state.businessStatus") === "已收起" && ev("rollAnnualBusinessCheck(state)") === null);

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：求職期/職場關係/合夥/退休自訂與交棒說明", prompt.includes("job_search_phase") && prompt.includes("「同事」「主管」「下屬」") && prompt.includes("handover"));

// mock長程
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "batch3cm01" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
for (let i = 0; i < 500; i++) { await H.playTurn(gm); if (gm.ev("state.phase") !== "playing") break; }
// 自動點擊只會點彈窗第一顆按鈕(選類別)、不會按「投遞」，所以mock長程本來就找不到工作；這裡只確認有進入求職期
A.check("mock長程正常、畢業後有進入求職期", gm.errors.length === 0 && gm.ev("state.turnCount") > 300 && gm.ev("state.everSearchedJob") === true, { t: gm.ev("state.turnCount"), age: gm.ev("state.age"), occ: gm.ev("state.occupationCategory"), err: gm.errors.map(String).slice(0, 2) });

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
