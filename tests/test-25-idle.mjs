// 2026-09-27：十、10.6 放置代活＋11.4＋6.5（Worker計算離線天數、放置模擬、彈窗代選、回來摘要、回溯、遙測）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.6 放置代活");
const fake = H.makeFakeAnthropic({});
H.installUpstream(fake);
const ap = await import(path.join(H.ROOT, "worker/ap.js"));
const DAY = 86400000;
const t0 = Date.parse("2026-09-24T04:00:00Z"); // 台灣中午

// ---------- Worker：離線天數 ----------
A.check("完整離線天數：9/20→9/24＝3天", ap.offlineDaysBetween("2026-09-20", "2026-09-24") === 3);
A.check("隔天回來：0天(回來那天不算、前一天有玩)", ap.offlineDaysBetween("2026-09-23", "2026-09-24") === 0);
A.check("最多7天", ap.offlineDaysBetween("2026-09-01", "2026-09-24") === 7);
const env = H.makeEnv({ TEST_NOW_MS: t0 });
const rec = ap.freshRecord("2026-09-20"); rec.lastActionDate = "2026-09-20";
await env.SAVES.put(ap.apKvKey("idlekey001", 0), JSON.stringify(rec));
let r = await H.callWorker(env, { path: "/idle-claim", body: { key: "idlekey001", slot: 0 } });
A.check("/idle-claim：3天→15回合", r.json && r.json.rounds === 15 && r.json.offlineDays === 3, r.json);
r = await H.callWorker(env, { path: "/idle-claim", body: { key: "idlekey001", slot: 0 } });
A.check("同一段離線只能領一次", r.json && r.json.rounds === 0);
// 摘要額度
const summaryBody = (key) => ({ kind: "idle_summary", key, slot: 0, life_id: "life0001", messages: [{ role: "user", content: JSON.stringify({ player_name: "林", idle_rounds: [{ i: 0, line: "過得很平靜。", tag: "安逸" }], key_rounds: [0] }) }] });
r = await H.callWorker(env, { body: summaryBody("idlekey002") });
A.check("沒領過放置：不能呼叫摘要", r.status === 402 || r.status === 400, r.status);
const rec2 = ap.freshRecord("2026-09-20"); rec2.lastActionDate = "2026-09-20";
await env.SAVES.put(ap.apKvKey("idlekey002", 0), JSON.stringify(rec2));
await H.callWorker(env, { path: "/idle-claim", body: { key: "idlekey002", slot: 0 } });
r = await H.callWorker(env, { body: summaryBody("idlekey002") });
A.check("領過之後：摘要可呼叫、不扣點", r.status === 200 && r.json.lifegame && r.json.lifegame.usable === true, r.status);
const apAfter = JSON.parse(await env.SAVES.get(ap.apKvKey("idlekey002", 0)));
A.check("摘要不扣點(每日池仍是5)", apAfter.daily === 5, apAfter.daily);
for (let i = 0; i < 2; i++) await H.callWorker(env, { body: summaryBody("idlekey002") });
r = await H.callWorker(env, { body: summaryBody("idlekey002") });
A.check("同一次放置最多呼叫3次摘要", r.status === 402);
// 回溯扣點
r = await H.callWorker(env, { path: "/idle-rollback", body: { key: "idlekey002", slot: 0 } });
A.check("回溯扣5點", r.json && r.json.success && r.json.ap.total === 0, r.json);
r = await H.callWorker(env, { path: "/idle-rollback", body: { key: "idlekey002", slot: 0 } });
A.check("每次放置只能回溯一次", r.status === 409);
// 遙測
r = await H.callWorker(env, { method: "GET", path: "/usage-summary", origin: null, headers: { Authorization: "Bearer admin-secret" } });
A.check("用量摘要有idle類別與churn流失分析", r.json && r.json.today && r.json.today.idle && r.json.today.idle.calls >= 1 && r.json.churn && typeof r.json.churn.lives === "number", r.json && r.json.today && r.json.today.idle);

// ---------- 前端（mock）：放置模擬 ----------
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "idlegame01" });
g.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(g); g.ev("state.ap.gift=1000");
for (let i = 0; i < 3; i++) await H.playTurn(g);
const ev = g.ev;
const doc = g.win.document;
ev("state.stats.health=20; state.characters=state.characters.filter(c=>!c.isChild && c.romanceStatus!=='married')");
const w = JSON.parse(ev("JSON.stringify(idleTagWeights(state))"));
A.check("健康<30：努力、冒險權重0；沒家庭：顧家0；其餘≥0.1", w.努力 === 0 && w.冒險 === 0 && w.顧家 === 0 && w.安逸 >= 0.1 && w.逃避 >= 0.1, w);
ev("state.stats.health=70");
const lines = JSON.parse(ev("JSON.stringify(Array.from({length:30},()=>nextIdleLine(state,'安逸')))"));
A.check("同標籤短句不連續重複", lines.every((l, i) => i === 0 || l !== lines[i - 1]));

// 放置期間不死亡、不得重大疾病、家人不過世
ev(`state.age=95; state.timeState.stageMode='career'; state.studentStatus='graduated'; state.stats.health=5; state.deathForeshadowed=true;
    state.characters.push({name:'老爸',relation:'父親',gender:'男',origin:'父母，從出生起',age:104,healthStage:3,affinity:60,active:true,traits:'',summary:'',lastTurn:0},
      {name:'阿芬',relation:'配偶',gender:'女',romanceStatus:'married',cohabiting:true,age:95,affinity:70,active:true,traits:'',summary:'',lastTurn:0});
    state.majorIllness=null; window.__deathP=computeDeathProbability; computeDeathProbability=()=>1; window.__illP=illnessAnnualProbability; illnessAnnualProbability=()=>1; window.__lvl=rollIllnessLevel; rollIllnessLevel=()=>'major'`);
ev("window.__run = runIdleRounds(state, 35)");
A.check("35回合放置：沒有死亡", ev("state.phase") === "playing" && ev("window.__run.rounds.length") === 35);
A.check("沒有重大疾病、父親沒過世、配偶沒過世", ev("state.majorIllness") === null && !ev("state.characters.find(c=>c.name==='老爸').deceased") && !ev("state.characters.find(c=>c.name==='阿芬').deceased"));
A.check("放置結束後idleMode關閉、悔棋快照清掉", ev("state.idleMode") === false && ev("state.snapshot") === null);
ev("computeDeathProbability=window.__deathP; illnessAnnualProbability=window.__illP; rollIllnessLevel=window.__lvl");
A.check("每回合都有標籤與短句", ev("window.__run.rounds.every(r=>IDLE_TAGS.includes(r.tag) && typeof r.line==='string')"));

// 彈窗代選＋回溯點
ev(`state.age=35; state.stats.health=70; state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.jobLevel=0; state.pendingPromotionOffer={fromLevel:0}; state.promotionCooldown=0`);
const rec3 = JSON.parse(ev("JSON.stringify((()=>{ state.idleMode=true; const r=simulateIdleRound(state, 0); state.idleMode=false; return {popups:r.popups, points:r.rollbackPoints.map(p=>p.kind)}; })())"));
A.check("升遷彈窗由性格代選、有回溯點", rec3.popups.some(p => p.kind === "promotion") && rec3.points.includes("promotion"), rec3);
A.check("代選後pending清掉", !ev("state.pendingPromotionOffer"));

// ---------- 回來流程（mock）：maybeRunIdle → 摘要 → 回溯 ----------
await H.startNewLife(g); g.ev("state.ap.gift=1000; state.ap.daily=0");
for (let i = 0; i < 2; i++) await H.playTurn(g);
ev(`state.idleEnabled=true; state.lastActiveDate=taipeiDateString(Date.now()-4*86400000); idleCheckedLives=new Set();
    state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.studentStatus='graduated'; state.timeState.stageMode='career'; state.age=30; state.pendingPromotionOffer={fromLevel:0}`);
const turn0 = ev("state.turnCount");
ev("render()");
await new Promise(r => setTimeout(r, 300));
A.check("回來時跑了3天×5＝15回合", ev("state.idleRun && state.idleRun.rounds.length") === 15 && ev("state.turnCount") === turn0 + 15, { n: ev("state.idleRun && state.idleRun.rounds.length") });
A.check("跳出「你不在的這段時間」摘要", !!doc.getElementById("idle-summary-modal"));
A.check("摘要寫進日記", ev("state.log.slice(-1)[0].timeLabel") === "放置期間");
const newChars = ev("state.idleRun.summary.newCharacters.length");
const friendRounds = ev("state.idleRun.rounds.filter(r=>r.newFriend).length");
A.check("新角色只來自新朋友回合、最多2位", newChars <= Math.min(2, friendRounds), { newChars, friendRounds });
A.check("同一次開啟不會再跑一次", (ev("render()"), ev("state.idleRun.rounds.length")) === 15);
const btn = doc.querySelector(".idle-rollback-btn");
A.check("摘要列出可回到此處的決定", !!btn);
const apBefore = ev("totalAP(state)");
btn.click();
await new Promise(r => setTimeout(r, 50));
A.check("回溯：扣5點、回到那個決定之前、跳出彈窗", ev("totalAP(state)") === apBefore - 5 && ev("state.idleRun.rolledBack") === true && !!doc.querySelector(".modal-backdrop:not(#idle-summary-modal)"), { ap: ev("totalAP(state)"), apBefore });
A.check("回溯後之後的放置回合標示已改寫、不能再回溯", ev("state.idleRun.rounds.some(r=>r.rewritten)") && (doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove()), ev("renderIdleSummaryModal()"), !doc.querySelector(".idle-rollback-btn")));
doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove());

// 開關預設關閉
await H.startNewLife(g);
A.check("放置代活預設關閉", !ev("state.idleEnabled"));
ev("render()");
A.check("遊戲畫面有開關連結", !!doc.getElementById("link-idle-toggle"));
doc.getElementById("link-idle-toggle").click();
A.check("點一下打開", ev("state.idleEnabled") === true);

// ---------- 真實模式：Worker算天數＋AI摘要 ----------
const envR = H.makeEnv({ TEST_NOW_MS: Date.now() });
const gr = await H.loadGame({ useMock: false, env: envR, key: "idlereal01" });
await H.startNewLife(gr);
await H.playTurn(gr); await H.playTurn(gr);
const recR = JSON.parse(await envR.SAVES.get(ap.apKvKey("idlereal01", 0)));
A.check("真實模式：成功的回合記下最後行動日", recR.lastActionDate === ap.taipeiDateString(Date.now()), recR.lastActionDate);
recR.lastActionDate = ap.taipeiDateString(Date.now() - 3 * DAY);
await envR.SAVES.put(ap.apKvKey("idlereal01", 0), JSON.stringify(recR));
gr.ev("state.idleEnabled=true; idleCheckedLives=new Set(); render()");
await new Promise(r => setTimeout(r, 500));
A.check("真實模式：Worker算2天→10回合、AI寫摘要", gr.ev("state.idleRun && state.idleRun.rounds.length") === 10 && gr.ev("state.idleRun.summary.retrospect").includes("日子照樣過"), { n: gr.ev("state.idleRun && state.idleRun.rounds.length") });
A.check("放置回合沒有呼叫回合AI(只有1次摘要)", fake.calls.filter(c => c.tool_choice && c.tool_choice.name === "submit_idle_summary").length >= 1);

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt.js有放置摘要system prompt與工具", prompt.includes("IDLE_SUMMARY_SYSTEM_PROMPT") && prompt.includes("submit_idle_summary"));
A.check("整段沒有jsdom錯誤", g.errors.length === 0 && gr.errors.length === 0, g.errors.concat(gr.errors).map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
