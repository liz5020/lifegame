// 2026-09-27：十二、12.3 高風險細分到工種（2026-10-08改為由具體職業細表的旗標決定，這支改驗細表）（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("12.3 高風險工種");
let lastBody = "";
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => { lastBody = JSON.stringify(p); return {}; } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "jobrisk001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;

const dist = JSON.parse(ev(`JSON.stringify((()=>{ const out={}; ["勞力/服務類","長期不在身邊類","軍公教/警消類","自由/創作類","受雇專業/白領類"].forEach(k=>{ let n=0; for(let i=0;i<5000;i++) if(jobIsHighRisk(k, rollJobInCategory(k))) n++; out[k]=n/5000; }); return out; })())`));
A.check("勞力/服務類約30%是高風險工種", Math.abs(dist["勞力/服務類"] - 0.3) < 0.03, dist);
A.check("長期不在身邊類約40%、軍公教/警消約40%", Math.abs(dist["長期不在身邊類"] - 0.4) < 0.03 && Math.abs(dist["軍公教/警消類"] - 0.4) < 0.03, dist);
A.check("自由/創作類約5%、白領0%", Math.abs(dist["自由/創作類"] - 0.05) < 0.015 && dist["受雇專業/白領類"] === 0, dist);

ev("state.studentStatus='graduated'; state.timeState.stageMode='career'; state.careerStatus=CAREER_STATUS.JOB_SEARCHING; state.jobSearchStreak=0; state.occupationCategory=null");
ev("Math.__r=Math.random; Math.random=()=>0; resolveJobApplication(state,'勞力/服務類',false,{job:'工地工人'}); Math.random=Math.__r");
A.check("挑了高風險職缺：riskyLifestyle與工種名稱", ev("state.riskyLifestyle") === true && ["工地工人", "遠洋漁業船員", "高空作業員"].includes(ev("state.jobRiskSubtype")));
await H.playTurn(g);
A.check("送AI的payload帶job_risk_subtype", /job_risk_subtype[^,]*(工地工人|遠洋漁業船員|高空作業員)/.test(lastBody.replace(/\\"/g, '"')));
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.age=65; state.retirementStatus='在職'; resolveRetirementOffer(state,'on_time')");
A.check("退休：旗標與工種都清掉", ev("state.riskyLifestyle") === false && ev("state.jobRiskSubtype") === null);
ev("state.careerStatus=CAREER_STATUS.JOB_SEARCHING; state.retirementStatus='在職'; state.jobSearchStreak=0; state.occupationCategory=null; state.age=30");
ev("Math.__r=Math.random; let __i=0; Math.random=()=>(__i++===0?0:0.99); resolveJobApplication(state,'勞力/服務類',false,{job:'司機'}); Math.random=Math.__r");
A.check("挑了一般職缺：不算高風險", ev("state.occupationCategory") === "勞力/服務類" && ev("state.riskyLifestyle") === false && ev("state.jobRiskSubtype") === null);

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：job_risk_subtype說明", prompt.includes("job_risk_subtype"));
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
