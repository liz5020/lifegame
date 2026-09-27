// 2026-09-27：三、3.8.2 幸福感管道補上社團參與、職涯認同（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("3.8.2 社團參與與職涯認同");
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => override(p, b) }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "happyin001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;

// 職涯認同
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.jobLevel=2; state.tenureMonths=60; state.occupationCategory='受雇專業/白領類'; state.interestCandidates=[]");
A.check("在職資深5年：40+30+10＝80", ev("computeCareerIdentity(state)") === 80);
ev("state.interestCandidates=[{category:'知識研究',status:'active',investment:50}]");
A.check("工作跟正式興趣對應：再+10", ev("computeCareerIdentity(state)") === 90);
ev("state.careerStatus=CAREER_STATUS.RETIRED");
A.check("退休：0", ev("computeCareerIdentity(state)") === 0);
ev("state.careerStatus=CAREER_STATUS.BUSINESS; state.jobLevel=1; state.interestCandidates=[]");
A.check("經營事業規模1：60", ev("computeCareerIdentity(state)") === 60);

// 自我實現取較高：沒工作但興趣高不被拉低
ev("state.stats.knowledge=50; state.careerStatus=CAREER_STATUS.RETIRED; state.interestCandidates=[{category:'藝術創作',status:'active',investment:80}]");
const selfRetired = ev("computeHappinessChannels(state).selfActualization");
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.jobLevel=0; state.tenureMonths=0; state.occupationCategory='勞力/服務類'");
const selfWorking = ev("computeHappinessChannels(state).selfActualization");
A.check("退休但興趣80 vs 在職新人(認同40)：自我實現相同(取較高)", Math.abs(selfRetired - selfWorking) < 1e-9, { selfRetired, selfWorking });
ev("state.interestCandidates=[]; state.jobLevel=3; state.tenureMonths=120");
A.check("沒有興趣但職涯認同高：自我實現被職涯撐起來", ev("computeHappinessChannels(state).selfActualization") > ev("(()=>{const s=JSON.parse(JSON.stringify(state)); s.careerStatus='retired'; return computeHappinessChannels(s).selfActualization;})()"));

// 社團參與
ev("state.clubEngagement=0; state.clubIdleStreak=0");
override = () => ({ club_activity: true });
await H.playTurn(g); await H.playTurn(g);
const c2 = ev("state.clubEngagement");
A.check("兩回合社團活動：參與度上升(有邊際遞減)", c2 > 8 && c2 < 16, c2);
override = () => ({ club_activity: false });
for (let i = 0; i < 11; i++) await H.playTurn(g);
A.check("11回合沒活動：還沒開始衰退", ev("state.clubEngagement") === c2);
await H.playTurn(g);
A.check("第12回合起每回合−1", Math.abs(ev("state.clubEngagement") - (c2 - 1)) < 1e-9, ev("state.clubEngagement"));
ev("state.characters.forEach(c=>{ if(!/配偶|伴侶|先生|太太|老公|老婆|兒子|女兒|父親|母親|爸|媽|哥|姊|姐|弟|妹/.test(c.relation||'')) c.affinity=20; }); state.stats.network=50");
const b0 = ev("(()=>{state.clubEngagement=0; return computeHappinessChannels(state).belonging;})()");
const b1 = ev("(()=>{state.clubEngagement=80; return computeHappinessChannels(state).belonging;})()");
A.check("社團參與高於朋友關係值時，撐起友情與歸屬", b1 > b0, { b0, b1 });
override = () => ({});

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：club_activity schema與說明", prompt.includes("club_activity: { type: \"boolean\"") && prompt.includes("【社團參與 club_activity"));

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
