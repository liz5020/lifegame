// 2026-09-28：十六、16.7 結局人生回顧頁(16.7.0定案版面)、人生總結與備案、回顧這一生(F批，含Worker扣點)、七、7.4.3.2免費轉世
// 全程USE_MOCK或假上游，不打真實API
import * as H from "./harness.mjs";
const A = H.makeAsserter("十六 結局頁＋回顧這一生");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ================= 前端(USE_MOCK) =================
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "endkey01" });
const ev = g.ev, doc = g.win.document;
ev("MOCK_AI_DELAY_MS = 0; MOCK_CHAPTER_DELAY_MS = 1");
await H.startNewLife(g, { name: "林以晴" });
await H.playTurn(g); await sleep(10);
// 素材：命運的骰子一筆以小搏大、兩位有共同記憶的NPC、職業月數、子女
ev(`state.fateRolls=[{round:3,age:36,stage:'30-39',category:'business',event:'年度營運',probability:0.2,success:true,resultText:'這一年生意成長',isOpenCheck:false}];
  state.characters.forEach((c,i)=>{ c.lastTurn = i; });`);
const endNow = async () => { ev("state.age = 78"); await ev("takeTurn(state.choices[0], AP_COST_PER_TURN, true)"); };
// 用真的結局流程(mock AI寫人生總結)
ev("MOCK_ENDING_OVERVIEW_FAIL = false");
const material = JSON.parse(ev("JSON.stringify(buildLifeSummaryMaterial(state))"));
A.check("16.7.0 結局素材帶人生特質(7.7)給AI", material.life_trait && typeof material.life_trait.text === "string", material.life_trait);
A.check("16.7.0 試看花絮素材優先挑命運的骰子", material.teaser_tidbit_material && material.teaser_tidbit_material.category === "fate", material.teaser_tidbit_material);
A.check("試看花絮的命運骰子素材用文字寫機率(隱藏判定不給數字)", material.teaser_tidbit_material.facts.probability_words === "機會很小");

const setEnding = (withKid) => ev(`
  state.age = 78; state.cash = 1234;
  state.lifeTrajectory = [{stage:"student",age_from:15,age_to:22,happiness_avg:60,resume_entries:["高中畢業"],key_npcs:[],spectrum_snapshot:{}},{stage:"23-29",age_from:23,age_to:29,happiness_avg:50,resume_entries:["第一份工作"],key_npcs:[],spectrum_snapshot:{}}];
  state.ending = assembleEnding(state, { life_summary: { segments: [], transitions: [], epitaph: "她走得很慢，但沒有停。",
    overview: "她在巷口開了一間早餐店，一路開到交給女兒。她總是先把別人的事做完，才輪到自己。", teaser_tidbit: "那一年，其實機會很小，結果生意成長了。" } });
  state.characters = state.characters.filter(c=>!c.isChild);
  ${withKid ? `state.characters.push({name:"林小安",relation:"女兒",isChild:true,active:true,affinity:70,gender:"女",age:40,summary:"",lastTurn:99});` : ``}
  state.phase = "ending"; render();`);
setEnding(true);
const app = doc.getElementById("app");
const seq = [".end-kicker", ".end-name", ".end-stamp", "#end-overview", ".end-epitaph", ".end-stats", ".end-people", "#end-review", ".end-actions", "#btn-ending-book", "#btn-reset-end"];
const pos = seq.map(sel => { const el = app.querySelector(sel); return el ? [...app.querySelectorAll("*")].indexOf(el) : -1; });
A.check("16.7.0 版面順序：標題→印章→人生總結→墓誌銘→雷達圖＋存款→重要的人→回顧這一生→分享/下一世；下方翻開人生之書、闔上這份草稿", pos.every(p => p >= 0) && pos.every((p, i) => i === 0 || p > pos[i - 1]), pos);
A.check("結局標題＝「人生草稿・第N世」＋名字；印章「78歲・定稿」", /人生草稿・第1世/.test(app.querySelector(".end-kicker").textContent) && app.querySelector(".end-name").textContent === "林以晴" && /78歲・定稿/.test(app.querySelector(".end-stamp").textContent));
A.check("人生總結(AI)與墓誌銘都顯示", /早餐店/.test(doc.getElementById("end-overview").textContent) && /她走得很慢/.test(app.querySelector(".end-epitaph").textContent));
A.check("L1/L2不在結局頁顯示(由人生總結取代)", !app.querySelector(".end-recap, .end-seg"));
const radar = app.querySelector(".end-radar");
A.check("五項能力雷達圖＋最終存款", radar && ["健康", "才識", "表達力", "外表", "人脈"].every(k => radar.textContent.includes(k)) && radar.querySelectorAll("polygon.rv").length === 1 && /1,234/.test(app.querySelector(".end-cash").textContent));
const people = [...app.querySelectorAll(".end-person")].map(p => p.textContent.trim());
const expectedPeople = JSON.parse(ev("JSON.stringify(state.characters.slice().sort((a,b)=>(relationDotCount(b)-relationDotCount(a))||((b.lastTurn||0)-(a.lastTurn||0))).slice(0,4).map(c=>c.name))"));
A.check("重要的人：關係等級最高的前四位，同級時最近互動優先", people.length === Math.min(4, ev("state.characters.length")) && people.every((p, i) => p.endsWith(expectedPeople[i])), { people, expectedPeople });
A.check("不顯示隱藏數值(福緣)", !/福緣/.test(app.textContent));
const review = doc.getElementById("end-review");
A.check("回顧這一生：未解鎖時免費試看一則花絮＋解鎖按鈕(5點)", /試看一則花絮/.test(review.textContent) && /機會很小/.test(review.textContent) && /解鎖回顧這一生（5點）/.test(doc.getElementById("btn-review-unlock").textContent));
const next = [...app.querySelectorAll(".end-next button")];
A.check("開始下一世：有子女時「選一個孩子接著寫」「再寫一次人生」並列同樣式", next.length === 2 && next[0].textContent === "選一個孩子接著寫" && next[1].textContent === "再寫一次人生" && next[0].className === next[1].className);
A.check("分享這一生按鈕", doc.getElementById("btn-ending-share").textContent === "分享這一生");
doc.getElementById("btn-succeed-open").click();
A.check("按「選一個孩子接著寫」展開子女清單", doc.getElementById("end-kids").hidden === false);
setEnding(false);
A.check("無子女時只有「再寫一次人生」", app.querySelectorAll(".end-next button").length === 1);

// 人生總結備案
ev(`state.milestones.first_startup='completed'; state.occupationMonths={'受雇專業/白領類':150,'自營/家庭事業類':60};
  state.characters.push({name:'大寶',relation:'兒子',isChild:true,active:true,affinity:60,gender:'男'},{name:'二寶',relation:'女兒',isChild:true,active:true,affinity:60,gender:'女'})`);
A.check("備案組句：創業→做最久的職業→子女，不列負面經歷", ev("composeLifeOverviewFallback(state)") === "自己創過業、在公司上班13年，養大2個孩子。", ev("composeLifeOverviewFallback(state)"));
ev("state.ending = assembleEnding(state, { life_summary: { segments:[], transitions:[], epitaph:'x', overview:'' } }); render()");
A.check("AI沒寫人生總結：用備案文字", ev("state.ending.overviewSource") === "fallback" && /自己創過業/.test(doc.getElementById("end-overview").textContent));
ev(`state.milestones.first_startup='available'; state.occupationMonths={}; state.characters=state.characters.filter(c=>!c.isChild && c.romanceStatus!=='married' && c.romanceStatus!=='widowed');
  state.ending = assembleEnding(state, { life_summary: { segments:[], transitions:[], epitaph:'x', overview:'' } }); render()`);
A.check("一項都挑不到時人生總結不顯示", ev("state.ending.overviewSource") === "none" && !doc.getElementById("end-overview"));
A.check("備案不列失業、離婚等負面經歷(沒有對應字詞)", !/失業|離婚|生病/.test(ev("composeLifeOverviewFallback(Object.assign({}, state, {occupationMonths:{'不穩定/待業類':100}}))")));

// 解鎖回顧這一生(mock)
setEnding(false);
ev("state.ap.daily = 2; state.ap.gift = 0; state.ap.purchased = 0; render()");
A.check("行動點不足5點：解鎖按鈕停用並說明", doc.getElementById("btn-review-unlock").disabled && /不足5點/.test(doc.getElementById("end-review").textContent));
ev("state.ap.daily = 3; state.ap.gift = 7; render()");
doc.getElementById("btn-review-unlock").click(); await sleep(60);
A.check("解鎖：扣5點(每日池→禮包點)", ev("state.ap.daily") === 0 && ev("state.ap.gift") === 5);
A.check("解鎖後有人生軌跡與人生花絮兩個分頁", ev("!!state.ending.review") && doc.querySelectorAll(".rv-tab").length === 2 && doc.querySelectorAll(".rv-traj li").length === ev("state.ending.review.trajectory.length") && ev("state.ending.review.trajectory.length") > 0);
[...doc.querySelectorAll(".rv-tab")].find(b => b.dataset.tab === "tidbits").click();
A.check("切到人生花絮分頁", doc.querySelectorAll(".rv-tidbits li").length >= 1 && !doc.querySelector(".rv-traj"));
A.check("解鎖後不再出現解鎖按鈕、重看不再扣點", !doc.getElementById("btn-review-unlock") && ev("totalAP(state)") === 5);
A.check("花絮每則都有階段標籤、只從客戶端挑好的素材來", ev("state.ending.review.tidbits.every(t=>t.label && t.category)"));

// 7.4.3.2 免費轉世
ev("window.__o = newRoll; newRoll = function(c,id){ window.__carry = c; return window.__o(c,id); }");
doc.getElementById("btn-reincarnate").click(); await sleep(20);
const carried = JSON.parse(ev("JSON.stringify(window.__carry)")); ev("newRoll = window.__o");
A.check("7.4.3.2 轉世不帶任何數值加成、敘事痕跡不說「前世」", carried && !["health", "knowledge", "network", "expression", "savingsCarry"].some(k => k in carried) && /熟悉感/.test(carried.chronicleCarry) && !/前世/.test(carried.chronicleCarry));
A.check("整段沒有jsdom錯誤(前端)", g.errors.length === 0, g.errors.map(String).slice(0, 3));

// ================= Worker：回顧這一生 =================
let failNext = false;
const fake = H.makeFakeAnthropic({ fail: (body) => body.tool_choice && body.tool_choice.name === "submit_life_review" && failNext });
H.installUpstream(fake);
const env = H.makeEnv();
const g2 = await H.loadGame({ useMock: false, env, key: "reviewkey1" });
await H.startNewLife(g2, { name: "陳予安" });
await H.playTurn(g2); await sleep(20);
const ev2 = g2.ev, d2 = g2.win.document;
ev2(`state.age=70; state.ending = assembleEnding(state, { life_summary:{ segments:[], transitions:[], epitaph:'x', overview:'y' } }); state.phase='ending'; render()`);
const apBefore = ev2("totalAP(state)");
const callsBefore = fake.calls.length;
failNext = true;
await ev2("unlockLifeReview()"); await sleep(50);
A.check("Worker：AI失敗不扣點、畫面說明沒有扣點", ev2("totalAP(state)") === apBefore && !ev2("state.ending.review") && /沒有扣點/.test(d2.getElementById("review-msg").textContent) && fake.calls.length === callsBefore + 1);
failNext = false;
await ev2("unlockLifeReview()"); await sleep(50);
const lastCall = fake.calls[fake.calls.length - 1];
A.check("Worker：送出kind=life_review，用回顧專用的系統提示與工具", lastCall.tool_choice.name === "submit_life_review" && /回顧這一生/.test(lastCall.system[0].text));
A.check("Worker：成功後扣5點、前端以伺服器餘額為準", ev2("totalAP(state)") === apBefore - 5 && ev2("!!state.ending.review"), { before: apBefore, after: ev2("totalAP(state)") });
// 餘額不足直接擋、不呼叫AI
ev2("state.ending.review = null; render()");
const apRec = JSON.parse(await env.SAVES.get("ap:reviewkey1:0"));
await env.SAVES.put("ap:reviewkey1:0", JSON.stringify(Object.assign(apRec, { daily: 1, gift: 0, purchased: 0 })));
const n0 = fake.calls.length;
const r2 = await H.callWorker(env, { body: { kind: "life_review", key: "reviewkey1", slot: 0, messages: [{ role: "user", content: JSON.stringify({ stages: [{ stage: "student" }], tidbits: [] }) }] } });
A.check("Worker：行動點不足回402、不呼叫AI", r2.status === 402 && fake.calls.length === n0 && r2.json.error.type === "insufficient_action_points");
const r3 = await H.callWorker(env, { body: { kind: "life_review", key: "reviewkey1", slot: 0, messages: [{ role: "user", content: JSON.stringify({ stages: [], tidbits: [] }) }] } });
A.check("Worker：素材格式不對回400", r3.status === 400);
const sum = await H.callWorker(env, { method: "GET", path: "/usage-summary", origin: null, headers: { Authorization: "Bearer admin-secret" } });
A.check("用量統計有「review」類別，記到回顧這一生的呼叫", sum.status === 200 && sum.json.today.review && sum.json.today.review.calls >= 1, { status: sum.status, review: sum.json && sum.json.today && sum.json.today.review });
A.check("整段沒有jsdom錯誤(真實路徑)", g2.errors.length === 0, g2.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
