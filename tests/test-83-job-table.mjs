// 2026-10-08：五、5.2.5／十二、12.3／12.4 共用職業細表（家長、配偶、手足子女、玩家）。全程mock，不打真實API
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("共用職業細表");
let lastBody = "";
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => { lastBody = JSON.stringify(p); return {}; } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "jobtable001" });
const ev = g.ev, doc = g.win.document;
const js = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
await H.startNewLife(g);
await H.playTurn(g);

// ---------- 細表本身 ----------
const tbl = js("Object.fromEntries(OCCUPATION_CATEGORIES.map(c=>[c.key, jobsOfCategory(c.key)]))");
A.check("八大類都有職業，權重各合計100", Object.values(tbl).every(a => a.length >= 3 && a.reduce((s, j) => s + j.weight, 0) === 100), Object.keys(tbl).map(k => [k, tbl[k].reduce((s, j) => s + j.weight, 0)]));
A.check("高風險職業共8個，對應原本的工種", JSON.stringify(Object.values(tbl).flat().filter(j => j.risk).map(j => j.name).sort()) === JSON.stringify(["工地工人", "海外工地工人", "特技演員", "警消外勤", "野戰部隊軍人", "遠洋漁業船員", "遠洋船員", "高空作業員"].sort()), Object.values(tbl).flat().filter(j => j.risk).map(j => j.name));
const frac = js(`(()=>{ const o={}; ["勞力/服務類","長期不在身邊類","軍公教/警消類","自由/創作類","受雇專業/白領類"].forEach(k=>{ let n=0; for(let i=0;i<6000;i++) if(jobIsHighRisk(k, rollJobInCategory(k))) n++; o[k]=n/6000; }); return o; })()`);
A.check("家長等人物抽職業：高風險比例大致維持30%／40%／40%／5%／0", Math.abs(frac["勞力/服務類"] - 0.3) < 0.03 && Math.abs(frac["長期不在身邊類"] - 0.4) < 0.03 && Math.abs(frac["軍公教/警消類"] - 0.4) < 0.03 && Math.abs(frac["自由/創作類"] - 0.05) < 0.02 && frac["受雇專業/白領類"] === 0, frac);
A.check("nonRiskOnly只抽一般職業", js(`(()=>{ for(let i=0;i<500;i++){ if(jobIsHighRisk("勞力/服務類", rollJobInCategory("勞力/服務類", true))) return false; } return true; })()`));

// ---------- 家長 ----------
const par = js("state.characters.filter(c=>c.origin==='父母，從出生起' && c.occupation)");
A.check("開局家長有具體職業，且屬於自己的類別", par.length > 0 && par.every(c => isCat(c)), par.map(c => [c.occupation, c.occupationJob]));
function isCat(c) { return ev(`isValidJob(PARENT_LABEL_CATEGORY[${JSON.stringify(c.occupation)}], ${JSON.stringify(c.occupationJob)})`) === true; }
const p0 = par[0];
A.check("人物職業欄顯示具體職業", ev(`npcOccupationText(state, state.characters.find(c=>c.name===${JSON.stringify(p0.name)}))`) === p0.occupationJob, p0);
ev("state.characters.push({name:'父測退',relation:'父親',gender:'男',affinity:50,active:true,traits:'',summary:'',lastTurn:0,occupation:'白領上班族',occupationJob:'工程師',retired:true,age:70})");
A.check("已退休寫「已退休（原本是○○）」用具體職業", ev("npcOccupationText(state, state.characters.find(c=>c.name==='父測退'))") === "已退休（原本是工程師）");

// ---------- 配偶、手足子女 ----------
const sp = js("rollSpouseIncome()");
A.check("配偶收入一併擲具體職業", ev(`isValidJob(${JSON.stringify(sp.category)}, ${JSON.stringify(sp.job)})`) === true, sp);
ev("state.characters.push({name:'配測',relation:'配偶',gender:'女',affinity:50,active:true,traits:'',summary:'',lastTurn:0,romanceStatus:'married'}); setSpouseIncome(state, 40, '受雇專業/白領類', '財務會計')");
A.check("已婚配偶顯示具體職業", ev("npcOccupationText(state, state.characters.find(c=>c.name==='配測'))") === "財務會計");
ev("state.characters.push({name:'哥測',relation:'哥哥',gender:'男',affinity:50,active:true,traits:'',summary:'',lastTurn:0,age:25})");
ev("updateFamilyPath(state.characters.find(c=>c.name==='哥測'))");
const bro = js("state.characters.find(c=>c.name==='哥測').path");
A.check("手足出路擲出具體職業，不含政治人物類", bro.stage === "work" && ev(`isValidJob(${JSON.stringify(bro.category)}, ${JSON.stringify(bro.job)})`) === true && !/政治/.test(bro.category), bro);

// ---------- 玩家求職 ----------
ev("state.studentStatus='graduated'; state.timeState.stageMode='career'; state.careerStatus=CAREER_STATUS.JOB_SEARCHING; state.jobSearchStreak=0; state.occupationCategory=null; state.jobTitle=null; state.age=30");
ev("Math.__r=Math.random; Math.random=()=>0; resolveJobApplication(state,'受雇專業/白領類',false,{job:'工程師'}); Math.random=Math.__r");
A.check("玩家挑的職缺錄取後成為職稱", ev("state.jobTitle") === "工程師" && ev("state.occupationCategory") === "受雇專業/白領類", ev("state.jobTitle"));
await H.playTurn(g);
A.check("送AI的payload帶job_title", /job_title[^,]*工程師/.test(lastBody.replace(/\\"/g, '"')));
// 挑了不屬於該類別的職缺→程式改抽
ev("state.careerStatus=CAREER_STATUS.JOB_SEARCHING; state.occupationCategory=null; state.jobSearchStreak=0");
ev("Math.__r=Math.random; Math.random=()=>0; resolveJobApplication(state,'受雇專業/白領類',false,{job:'工地工人'}); Math.random=Math.__r");
A.check("職缺不屬於該類別：程式依權重改抽", ev("isValidJob('受雇專業/白領類', state.jobTitle)") === true && ev("state.jobTitle") !== "工地工人", ev("state.jobTitle"));
// 保底改類別
ev("state.careerStatus=CAREER_STATUS.JOB_SEARCHING; state.occupationCategory=null; state.jobSearchStreak=JOB_SEARCH_STREAK_FALLBACK");
ev("resolveJobApplication(state,'自由/創作類',false,{job:'寫作'})");
A.check("保底改了類別：職稱屬於新類別", ev("['不穩定/待業類','勞力/服務類'].includes(state.occupationCategory) && isValidJob(state.occupationCategory, state.jobTitle)") === true, [ev("state.occupationCategory"), ev("state.jobTitle")]);
// 離職清掉
ev("state.age=65; state.retirementStatus='在職'; state.careerStatus=CAREER_STATUS.EMPLOYED; resolveRetirementOffer(state,'on_time')");
A.check("退休：職稱清掉", ev("state.jobTitle") === null);

// ---------- 求職彈窗 ----------
ev("state.careerStatus=CAREER_STATUS.JOB_SEARCHING; state.occupationCategory=null; state.jobTitle=null; state.jobSearchStreak=0; state.retirementStatus='在職'; state.age=30; renderJobSearchModal({offers:buildJobSearchOffers(state), isTransfer:false, isFallback:false})");
const btns = () => [...doc.querySelectorAll(".job-pick-btn")].map(b => b.dataset.job);
A.check("彈窗預設列出第一個類別的全部職缺", JSON.stringify(btns()) === JSON.stringify(js("jobsOfCategory(OCCUPATION_CATEGORIES[0].key).map(j=>j.name)")), btns());
[...doc.querySelectorAll(".job-search-btn")].find(b => b.dataset.key === "勞力/服務類").click();
const labels = [...doc.querySelectorAll(".job-pick-btn")].map(b => b.textContent);
A.check("切換類別換成該類別職缺，高風險的標出來", labels.length === 8 && labels.filter(x => x.includes("（高風險）")).length === 3, labels);
[...doc.querySelectorAll(".job-pick-btn")].find(b => b.dataset.job === "工地工人").click();
doc.getElementById("btn-job-search-apply").click();
const out = doc.getElementById("job-search-stage2").textContent;
A.check("結果畫面寫出錄取的職缺或沒錄取", out.includes("工地工人") || out.includes("這次沒有錄取"), out.slice(0, 120));
if (ev("!!state.pendingJobOffer")) { A.check("待決offer記著職缺", ev("state.pendingJobOffer.job") === "工地工人", ev("state.pendingJobOffer.job")); ev("acceptJobOffer(state)"); A.check("接受後職稱與高風險一致", ev("state.jobTitle") === "工地工人" && ev("state.jobRiskSubtype") === "工地工人" && ev("state.riskyLifestyle") === true); }
doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove());

// ---------- 舊存檔補擲 ----------
ev("state.occupationCategory='軍公教/警消類'; state.careerStatus=CAREER_STATUS.EMPLOYED; state.jobTitle=null; state.jobRiskSubtype='野戰部隊'; state.riskyLifestyle=true; state.spouseOccupationCategory='勞力/服務類'; state.spouseOccupationJob=null");
ev("state.characters.push({name:'舊父',relation:'父親',gender:'男',affinity:50,active:true,traits:'',summary:'',lastTurn:0,occupation:'自營業者'}, {name:'舊哥',relation:'哥哥',gender:'男',affinity:50,active:true,traits:'',summary:'',lastTurn:0,age:26,path:{stage:'work',category:'勞力/服務類'}})");
ev("backfillOccupationJobs(state)");
A.check("舊存檔高風險玩家：沿用同一個職業(野戰部隊→野戰部隊軍人)", ev("state.jobTitle") === "野戰部隊軍人" && ev("state.jobRiskSubtype") === "野戰部隊", ev("state.jobTitle"));
A.check("舊存檔家長補擲屬於自營業者的職業", ev("isValidJob('自營/家庭事業類', state.characters.find(c=>c.name==='舊父').occupationJob)") === true);
A.check("舊存檔手足、配偶補擲", ev("isValidJob('勞力/服務類', state.characters.find(c=>c.name==='舊哥').path.job)") === true && ev("isValidJob('勞力/服務類', state.spouseOccupationJob)") === true);
ev("state.occupationCategory='勞力/服務類'; state.jobTitle=null; state.jobRiskSubtype=null; state.riskyLifestyle=false");
A.check("舊存檔一般玩家補擲只抽非高風險職業(不改變原本的高風險狀態)", js(`(()=>{ for(let i=0;i<300;i++){ state.jobTitle=null; backfillOccupationJobs(state); if(jobIsHighRisk('勞力/服務類', state.jobTitle)) return false; } return true; })()`));

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：job_title說明", prompt.includes("job_title"));
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
