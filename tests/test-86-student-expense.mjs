// 2026-10-09：十七、17.3.6 學生期自付大額花費＋三、3.4.10 副業收入近3個月平均算進每月生活開銷（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("17.3.6 學生期自付大額花費／3.4.10 副業平均");
let override = () => ({});
let payload = null;
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => { payload = p; return override(p, b); } }));
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "sx00000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = `ap:${H.loc("sx00000001")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };

// ---------- 提出條件（用假的狀態＋固定亂數） ----------
const prep = (sOverrides, seq, ctx = {}, half = "上學期") => js(`(()=>{ const o=Math.random; const q=${JSON.stringify(seq)}; let i=0; Math.random=()=>i<q.length?q[i++]:0.5;
  try{ const s=Object.assign({studentStatus:"enrolled",family:"小康",cash:500,age:16,turnCount:20,idleMode:false,
    characters:[{name:"小明",relation:"同學",affinity:50,romanceStatus:null}], timeState:{cal:{v:2,semIdx:0}}}, ${sOverrides});
    return prepareStudentExpense(s, ${JSON.stringify(ctx)}, ${JSON.stringify(half)}); } finally { Math.random=o; } })()`);
{
  const p = prep("{}", [0.99, 0.01, 0.01]); // 家裡沒擲中(0.99>=0.10)；一般擲中；類別friend
  A.check("朋友與戀愛：小康0.5個月＝30，對象是同學小明，事件在三種之內", p && p.kind === "friend" && p.amount === 30 && p.target === "小明" && ["朋友小聚", "小禮物"].includes(p.event), p);
  const q = prep("{family:'清寒'}", [0.99, 0.01, 0.6]); // 家裡沒擲中、一般擲中、類別trip
  A.check("想要的大件(出遊／演唱會／社團)：清寒1.5個月＝45", q && q.kind === "trip" && q.amount === 45 && STR(q.event), q);
  const r = prep("{family:'富裕'}", [0.01, 0.8]); // 富裕：第一個亂數就是「一般」；類別gadget
  A.check("手機或電腦升級：富裕2個月＝240；富裕不判定家裡出不起", r && r.kind === "gadget" && r.amount === 240, r);
  const l = prep("{age:18}", [0.99, 0.01, 0.95]);
  A.check("考駕照：滿18歲、沒考過→1個月(小康60)", l && l.kind === "license" && l.amount === 60 && l.event === "考駕照", l);
  const l2 = prep("{age:17}", [0.99, 0.01, 0.95]);
  A.check("考駕照：未滿18歲→併入朋友小聚等", l2 && l2.kind === "friend", l2);
  const l3 = prep("{age:18,studentExpense:{license:true,pending:null,resultNow:null}}", [0.99, 0.01, 0.95]);
  A.check("考駕照：已經考過→不再出現(併入朋友)", l3 && l3.kind === "friend", l3);
}
function STR(x) { return typeof x === "string" && ["出遊", "演唱會", "社團活動"].includes(x); }
{
  const f = prep("{family:'清寒'}", [0.05, 0.5, 0.0]); // 家裡擲中；總價60+floor(.5*61)=90；事件第一個
  A.check("家裡出不起：總價在60～120，玩家負擔一半(四捨五入)", f && f.kind === "family" && f.total >= 60 && f.total <= 120 && f.amount === Math.round(f.total / 2), f);
  A.check("家裡出不起：富裕不出現(亂數0.05也不出家裡類)", (prep("{family:'富裕'}", [0.05, 0.99]) || {}).kind !== "family", prep("{family:'富裕'}", [0.05, 0.99]));
  A.check("家裡出不起：付不起負擔金額→不提出，也不往下判定別類", prep("{family:'清寒',cash:10}", [0.05, 0.5, 0.0, 0.01, 0.01]) === null);
  A.check("家裡出不起：清寒每學年上限2件", prep("{family:'清寒',studentExpense:{yearKey:'0',yearFamily:2,termKey:'',termWant:0,license:false,pending:null,resultNow:null}}", [0.99]) === null);
  A.check("家裡出不起：小康每學年上限1件(沒滿的下一學年又可以)",
    prep("{studentExpense:{yearKey:'0',yearFamily:1,termKey:'',termWant:0,license:false,pending:null,resultNow:null}}", [0.99]) === null &&
    (prep("{studentExpense:{yearKey:'0',yearFamily:1,termKey:'',termWant:0,license:false,pending:null,resultNow:null},timeState:{cal:{v:2,semIdx:2}}}", [0.05, 0.5, 0.0]) || {}).kind === "family");
  A.check("朋友與戀愛：距離上一件不到6回合→不提出；滿6回合可以",
    prep("{studentExpense:{lastFriendTurn:16,termKey:'',termWant:0,yearKey:'',yearFamily:0,license:false,pending:null,resultNow:null}}", [0.99, 0.01, 0.1]) === null &&
    (prep("{studentExpense:{lastFriendTurn:14,termKey:'',termWant:0,yearKey:'',yearFamily:0,license:false,pending:null,resultNow:null}}", [0.99, 0.01, 0.1]) || {}).kind === "friend");
  A.check("想要的大件：同一學期2件為止；換學期(下學期)又可以",
    prep("{studentExpense:{termKey:'0-上學期',termWant:2,yearKey:'',yearFamily:0,lastFriendTurn:null,license:false,pending:null,resultNow:null}}", [0.99, 0.01, 0.6]) === null &&
    (prep("{studentExpense:{termKey:'0-上學期',termWant:2,yearKey:'',yearFamily:0,lastFriendTurn:null,license:false,pending:null,resultNow:null}}", [0.99, 0.01, 0.6], {}, "下學期") || {}).kind === "trip");
  A.check("存款付不起(朋友30、大件90)→不提出", prep("{cash:20}", [0.99, 0.01, 0.1]) === null && prep("{cash:80}", [0.99, 0.01, 0.6]) === null);
  A.check("沒有可以約的朋友(只有家人)→朋友與戀愛不提出", prep("{characters:[{name:'媽媽',relation:'母親',affinity:60}]}", [0.99, 0.01, 0.1]) === null);
  const d = prep("{characters:[{name:'小明',relation:'同學',affinity:50},{name:'小華',relation:'同學',affinity:70,romanceStatus:'dating'}]}", [0.99, 0.01, 0.01, 0.9, 0.0]);
  A.check("約會只能約有曖昧／交往對象的人", d && d.event === "約會" && d.target === "小華", d);
  A.check("沒有曖昧／交往對象時不會出現約會", [0.1, 0.6, 0.9].every(x => (prep("{}", [0.99, 0.01, 0.01, x, 0.0]) || {}).event !== "約會"));
  A.check("不提出：開場、跳過、結局、考試日、放置期間、已有別的彈窗、已畢業", [{ prologue: true }, { skip: true }, { ending: true }, { exam: true }].every(c => prep("{}", [0.99, 0.01, 0.1], c) === null)
    && prep("{idleMode:true}", [0.99, 0.01, 0.1]) === null && prep("{pendingMajorPurchase:{amount:1}}", [0.99, 0.01, 0.1]) === null && prep("{pendingJobSearch:{}}", [0.99, 0.01, 0.1]) === null
    && prep("{studentStatus:'graduated'}", [0.99, 0.01, 0.1]) === null);
}

// ---------- 價位換算：政治世家(零用錢150)用家境表(富裕120)，不用150 ----------
A.check("價位以家境的月零用錢為單位(清寒30、小康60、富裕120)", js("[studentExpenseUnit({family:'清寒'}),studentExpenseUnit({family:'小康'}),studentExpenseUnit({family:'富裕',monthlyIncome:150})]").join() === "30,60,120");

// ---------- 實際回合：排定→跳彈窗→花／不花→下一回合旁白收到結果 ----------
await H.playTurn(g); // 先把開場跑完
ev("state.family='小康'; state.cash=500; state.monthlyIncome=60; state.studentStatus='enrolled'");
ev(`state.characters.push({name:"阿森", relation:"同學", affinity:50, active:true, lastTurn:0, gender:"男", traits:["外向"], summary:"同班同學"})`);
const planJs = (kind, event, total, amount, target) => `window.__origPrep = window.__origPrep || prepareStudentExpense; prepareStudentExpense = ()=>({kind:${JSON.stringify(kind)},event:${JSON.stringify(event)},total:${total},amount:${amount},target:${JSON.stringify(target)},keys:studentExpenseKeys(state,"上學期")});`;
const unplan = () => ev("window.__origPrep = window.__origPrep || prepareStudentExpense; prepareStudentExpense = ()=>null;"); // 之後的回合固定不排定，避免隨機事件干擾
const aff = () => ev(`state.characters.find(c=>c.name==="阿森").affinity`);
unplan();
const apBefore = ev("totalAP(state)");
ev(planJs("friend", "朋友小聚", 30, 30, "阿森"));
await g.ev(`takeTurn("跟同學聊聊天", AP_COST_PER_TURN)`);
A.check("排定的回合：旁白收到情境(類別、事件、對象)，沒有金額", payload.student_expense_scene && payload.student_expense_scene.event === "朋友小聚" && payload.student_expense_scene.category === "朋友與戀愛" && payload.student_expense_scene.with === "阿森" && !/amount|total|price/.test(JSON.stringify(payload.student_expense_scene)), payload.student_expense_scene);
A.check("回合結束：留下等待決定的彈窗，並跳出視窗", !!ev("state.studentExpense.pending") && !!doc.getElementById("student-expense-modal"));
A.check("彈窗內容：標題、金額與存款、〔花〕〔不花〕", /要跟朋友小聚嗎/.test(doc.getElementById("student-expense-modal").textContent) && /大約 30/.test(doc.getElementById("student-expense-modal").textContent) && doc.getElementById("btn-sx-yes").textContent === "花" && doc.getElementById("btn-sx-no").textContent === "不花");
A.check("彈窗不佔回合、不扣行動點(只有那一回合的1點)", apBefore - ev("totalAP(state)") === 1, [apBefore, ev("totalAP(state)")]);
// 重新整理(重畫)後仍會再跳出
doc.getElementById("student-expense-modal").remove(); ev("render()");
A.check("重新整理後未決定的彈窗再跳出", !!doc.getElementById("student-expense-modal"));
unplan();
const c0 = ev("state.cash"), a0 = aff();
doc.getElementById("btn-sx-yes").click();
A.check("按〔花〕：扣30、對象好感+2、彈窗收掉、pending清除", c0 - ev("state.cash") === 30 && aff() - a0 === 2 && !doc.getElementById("student-expense-modal") && !ev("state.studentExpense.pending"), [c0, ev("state.cash"), a0, aff()]);
A.check("按〔花〕：記進明細名稱「朋友小聚」、日記小字", JSON.stringify(ev("state.cashLedger")).includes("朋友小聚") && /朋友小聚/.test(ev("state.carryPurchaseNote")||""), ev("state.cashLedger"));
await H.playTurn(g);
A.check("下一回合旁白收到結果bought=true，只這一回合", payload.student_expense_result_now && payload.student_expense_result_now.bought === true && payload.student_expense_result_now.event === "朋友小聚" && ev("state.studentExpense.resultNow") === null, payload.student_expense_result_now);
A.check("下一回合結算明細列出「朋友小聚 −30」", JSON.stringify(js("state.log[state.log.length-1].settlement||null")).includes("朋友小聚") || JSON.stringify(js("state.lastSettlement||null")).includes("朋友小聚"), js("state.lastSettlement"));
A.check("再下一回合結果已清掉", (await H.playTurn(g), payload.student_expense_result_now == null));

// 同一人同階段第二次好感減半
ev(planJs("friend", "小禮物", 30, 30, "阿森"));
await g.ev(`takeTurn("再約一次", AP_COST_PER_TURN)`);
unplan(); const a1 = aff(); doc.getElementById("btn-sx-yes").click();
A.check("同一個人同一階段第二次：好感只+1", aff() - a1 === 1, [a1, aff()]);
await H.playTurn(g);

// 不花
ev(planJs("trip", "演唱會", 90, 90, null));
await g.ev(`takeTurn("週末", AP_COST_PER_TURN)`);
unplan();
A.check("出遊類彈窗：標題「要去演唱會嗎？」", /要去演唱會嗎/.test(doc.getElementById("student-expense-modal").textContent));
const c1 = ev("state.cash"), a2 = aff();
doc.getElementById("btn-sx-no").click();
A.check("按〔不花〕：不扣款、不動數值、旁白下一回合收到declined", c1 === ev("state.cash") && a2 === aff() && ev("state.studentExpense.resultNow.reason") === "declined");
await H.playTurn(g);
A.check("不花：payload bought=false reason=declined", payload.student_expense_result_now && payload.student_expense_result_now.bought === false && payload.student_expense_result_now.reason === "declined");
await H.playTurn(g);

// 出遊(選花)：只扣錢、不加任何數值
ev(planJs("trip", "出遊", 90, 90, null));
await g.ev(`takeTurn("週末", AP_COST_PER_TURN)`);
unplan();
const st0 = js("state.stats"), c2 = ev("state.cash"), h0 = ev("state.happiness");
doc.getElementById("btn-sx-yes").click();
A.check("出遊選花：扣90，核心數值與好感都沒變", c2 - ev("state.cash") === 90 && JSON.stringify(js("state.stats")) === JSON.stringify(st0), [c2, ev("state.cash")]);
await H.playTurn(g);

// 家裡出不起
ev(planJs("family", "補習班費用", 80, 40, null));
await g.ev(`takeTurn("放學", AP_COST_PER_TURN)`);
unplan();
A.check("家裡類彈窗：顯示總價80與負擔40、〔出一半〕〔這次先不用〕", /補習班費用，家裡這次需要你出一半/.test(doc.getElementById("student-expense-modal").textContent) && /總共大約 80/.test(doc.getElementById("student-expense-modal").textContent) && /約 40/.test(doc.getElementById("student-expense-modal").textContent)
  && doc.getElementById("btn-sx-yes").textContent === "出一半" && doc.getElementById("btn-sx-no").textContent === "這次先不用");
const c3 = ev("state.cash");
doc.getElementById("btn-sx-yes").click();
A.check("出一半：扣40", c3 - ev("state.cash") === 40);
await H.playTurn(g);
ev(planJs("family", "電腦壞了", 100, 50, null));
await g.ev(`takeTurn("放學", AP_COST_PER_TURN)`);
unplan();
const c4 = ev("state.cash"); doc.getElementById("btn-sx-no").click();
A.check("這次先不用：不扣錢、旁白收到cheaper_or_later", c4 === ev("state.cash") && ev("state.studentExpense.resultNow.reason") === "cheaper_or_later");
await H.playTurn(g);

// 考駕照
ev("state.age=18; state.studentExpense.license=false");
ev(planJs("license", "考駕照", 60, 60, null));
await g.ev(`takeTurn("放學", AP_COST_PER_TURN)`);
unplan(); doc.getElementById("btn-sx-yes").click();
A.check("考駕照選花：記下已考過，之後不再出現", ev("state.studentExpense.license") === true);
await H.playTurn(g);

// 彈窗出現後的次數記帳(用真的commit)
ev(`state.studentExpense = null; state.turnCount = 40;`);
ev(`commitStudentExpense(state, {kind:"friend",event:"朋友小聚",total:30,amount:30,target:"阿森",keys:studentExpenseKeys(state,"上學期")})`);
A.check("commit：記下上一件朋友的回合，留下pending", ev("state.studentExpense.lastFriendTurn") === 40 && !!ev("state.studentExpense.pending"));
ev(`state.studentExpense.pending = null; commitStudentExpense(state, {kind:"trip",event:"出遊",total:90,amount:90,target:null,keys:studentExpenseKeys(state,"上學期")})`);
A.check("commit：想要的大件記一件", ev("state.studentExpense.termWant") === 1);
ev(`state.studentExpense.pending = null; state.pendingMajorPurchase = {amount:1}; commitStudentExpense(state, {kind:"trip",event:"出遊",total:90,amount:90,target:null,keys:studentExpenseKeys(state,"上學期")})`);
A.check("commit：這回合結算出別的彈窗→不排定，旁白下一回合帶過(reason=skipped)", !ev("state.studentExpense.pending") && ev("state.studentExpense.resultNow.reason") === "skipped" && ev("state.studentExpense.termWant") === 1);
ev("state.pendingMajorPurchase = null; state.studentExpense.resultNow = null");

// 放置期間：不排定、遇到pending一律不花
A.check("放置代活：pending一律先不花(不扣款)", (() => { ev(`state.studentExpense.pending={kind:"friend",event:"朋友小聚",total:30,amount:30,target:null}; const _c=state.cash; resolveStudentExpense(state,false); window.__ok = state.cash===_c && !state.studentExpense.pending;`); return ev("window.__ok"); })());

// ---------- 3.4.10 副業收入：近3個月平均算進每月收入與生活開銷 ----------
{
  ev("state.studentExpense = null; state.sideIncomeLog = []; state.cash = 5000; state.spendingHabit = '普通花費'; state.mealArrangement = '自己打理'; state.monthlyIncome = 60; state.monthlyExpenses = []");
  const base = ev("computeBaseLivingCost(state)"), baseB = ev("computeBasicLivingCost(state)"), inc0 = ev("monthlyBudget(state).income");
  const now = ev("state.timeState.cal.lastRoundEnd");
  ev(`recordSideIncome(state, 300, ${now}); recordSideIncome(state, 150, ${now - 40})`);
  A.check("副業近3個月總額÷3：(300+150)/3＝150", Math.abs(ev("computeSideBusinessIncome(state)") - 150) < 1e-9, ev("computeSideBusinessIncome(state)"));
  A.check("每月收入＝零用錢＋副業平均(60+150＝210)，手頭狀態與生活開銷用同一個數字", ev("monthlyBudget(state).income") === inc0 + 150);
  A.check("每月生活開銷變高(可支配的錢變多)，基本生活開銷(醫療費門檻用)不變", ev("computeBaseLivingCost(state)") > base && ev("computeBasicLivingCost(state)") === baseB, [base, ev("computeBaseLivingCost(state)")]);
  ev(`state.timeState.cal.lastRoundEnd = ${now + 80}`);
  A.check("80天後：40天前那筆已超過3個月不算，只剩現在那筆(300÷3＝100)", Math.abs(ev("computeSideBusinessIncome(state)") - 100) < 1e-9, ev("computeSideBusinessIncome(state)"));
  ev(`state.timeState.cal.lastRoundEnd = ${now + 120}`); ev("pruneSideIncomeLog(state)");
  A.check("滿3個月以上：副業平均歸零、紀錄清空(控制存檔大小)", ev("computeSideBusinessIncome(state)") === 0 && ev("state.sideIncomeLog.length") === 0);
  ev(`state.timeState.cal.lastRoundEnd = ${now}`);
  // 結算收入不重複算：交件已一次入帳
  ev(`recordSideIncome(state, 300, ${now})`);
  const cash0 = ev("state.cash");
  ev("applyMonthlySettlement(state, 1)");
  const expIncome = ev("state.monthlyIncome + (state.spouseIncome||0)");
  A.check("月結算的收入只有零用錢(不再加副業平均，避免交件入帳後又重複算)", ev("state.lastSettlement.income") === expIncome, [ev("state.lastSettlement.income"), expIncome]);
}


// ---------- 5.5.4.1 三餐提示 ----------
{
  const mp = (setup, seq = [0.1], ctx = {}) => js(`(()=>{ const o=Math.random; const q=${JSON.stringify(seq)}; let i=0; Math.random=()=>i<q.length?q[i++]:0.5; try{
    const s=Object.assign({studentStatus:"enrolled",mealArrangement:"外食為主",turnCount:20,idleMode:false,mealFullyUnlocked:false,timeState:{cal:{v:2,lastRoundEnd:200}}}, ${setup});
    return prepareMealHint(s, ${JSON.stringify(ctx)}); } finally { Math.random=o; } })()`);
  A.check("還沒開始計時：回傳init(成功套用後才記起算點)，不排提示", (mp("{}") || {}).init === true && !(mp("{}") || {}).mode);
  A.check("計時中、不到3個月(91天)：不排", mp("{mealHint:{arr:'外食為主',lastAbs:150}}") === null);
  const due = mp("{mealHint:{arr:'外食為主',lastAbs:100}}", [0.9]);
  A.check("滿3個月：排定一次；亂數0.9→A.正文一句帶過，沒有選項方向", due && due.mode === "A" && due.arrangement === "外食為主" && due.idea === null, due);
  const dueB = mp("{mealHint:{arr:'自己打理',lastAbs:100},mealArrangement:'自己打理'}", [0.1]);
  A.check("亂數0.1→B.放進選項，附對應的方向(自己打理＝自己煮點什麼)", dueB && dueB.mode === "B" && /煮/.test(dueB.idea), dueB);
  A.check("三種方式的選項方向都有：外食→同學、自己打理→煮、家裡包辦→家人", ["外食為主", "自己打理", "家裡包辦"].every(m => { const x = mp(`{mealHint:{arr:'${m}',lastAbs:100},mealArrangement:'${m}'}`, [0.1]); return x && x.idea; }));
  A.check("調整三餐方式後重新計時(紀錄的方式和現在不同→init)", (mp("{mealHint:{arr:'家裡包辦',lastAbs:100}}") || {}).init === true);
  A.check("不排：開場、跳過、結局、考試日、放置、已有別的彈窗、這回合有花費彈窗", [{ prologue: true }, { skip: true }, { ending: true }, { exam: true }, { popupThisTurn: true }].every(c => mp("{mealHint:{arr:'外食為主',lastAbs:100}}", [0.1], c) === null)
    && mp("{mealHint:{arr:'外食為主',lastAbs:100},idleMode:true}") === null && mp("{mealHint:{arr:'外食為主',lastAbs:100},pendingMajorPurchase:{}}") === null);
  A.check("沒選三餐方式、出社會後尚未解鎖：不排；已解鎖可以排", mp("{mealHint:{arr:'外食為主',lastAbs:100},mealArrangement:null}") === null
    && mp("{mealHint:{arr:'外食為主',lastAbs:100},studentStatus:'graduated'}") === null && !!mp("{mealHint:{arr:'外食為主',lastAbs:100},studentStatus:'graduated',mealFullyUnlocked:true}"));
  const n = 4000; let b = 0; for (let i = 0; i < n; i++) { /* 用真亂數統計A／B比例 */ }
  const ratio = js(`(()=>{ let b=0; for(let i=0;i<4000;i++){ const x=prepareMealHint({studentStatus:"enrolled",mealArrangement:"外食為主",turnCount:20,mealHint:{arr:"外食為主",lastAbs:0},timeState:{cal:{v:2,lastRoundEnd:200}}},{}); if(x.mode==="B") b++; } return b/4000; })()`);
  A.check("A／B各約一半", Math.abs(ratio - 0.5) < 0.04, ratio);
  A.check("payload：A→{mode:一句帶過}；B→{mode:放進選項, choice_idea}；init／null→null", JSON.stringify(js(`[mealHintPayload({mode:"A",arrangement:"外食為主"}), mealHintPayload({mode:"B",arrangement:"外食為主",idea:"x"}), mealHintPayload({init:true}), mealHintPayload(null)]`))
    === JSON.stringify([{ mode: "一句帶過", arrangement: "外食為主" }, { mode: "放進選項", arrangement: "外食為主", choice_idea: "x" }, null, null]));
  // 實際回合：排定→payload有meal_hint_now→重新計時
  ev("window.__origMeal = window.__origMeal || prepareMealHint; prepareMealHint = window.__origMeal;");
  ev("state.mealArrangement='外食為主'; state.mealFullyUnlocked=true; state.studentExpense=null");
  ev("state.mealHint = {arr:'外食為主', lastAbs: mealHintNow(state) - 100}");
  await H.playTurn(g);
  A.check("滿3個月的那一回合：payload有meal_hint_now，之後重新計時", payload.meal_hint_now && ["一句帶過", "放進選項"].includes(payload.meal_hint_now.mode) && ev("mealHintNow(state) - state.mealHint.lastAbs") < 15, [payload.meal_hint_now, ev("state.mealHint")]);
  await H.playTurn(g);
  A.check("下一回合沒有再排(沒有meal_hint_now)", payload.meal_hint_now == null);
  A.check("快照欄位清單包含mealHint", js("SNAPSHOT_EXTRA_KEYS").includes("mealHint"));
}

// ---------- 2026-10-09 打工也算進近3個月工作收入平均 ----------
{
  ev("state.sideIncomeLog = []; state.studentStatus='enrolled'; state.family='小康'; state.monthlyIncome=60; state.cash=500");
  const unit = ev("incomeShareUnit(state)");
  const c0 = ev("state.cash");
  ev("applyPartTimeWork(state, '去打工', null, 1)");
  const earned = ev("state.cash") - c0;
  A.check("學生期打工1份(小康13)：入帳並記進工作收入紀錄", earned === Math.max(1, Math.round(unit)) && earned === 13 && ev("state.sideIncomeLog.length") === 1 && ev("state.sideIncomeLog[0].amount") === 13, [earned, ev("state.sideIncomeLog")]);
  A.check("學生期打工份數：清寒7、小康13、富裕27", js("[30,60,120].map(m=>Math.round(PART_TIME_SHARES*m*12/54))").join() === "7,13,27");
  A.check("近3個月工作收入平均＝打工入帳÷3(13÷3)", Math.abs(ev("computeSideBusinessIncome(state)") - 13 / 3) < 1e-9, ev("computeSideBusinessIncome(state)"));
  ev("recordSideIncome(state, 35, state.timeState.cal.lastRoundEnd)");
  A.check("副業交件和打工合併算平均((13+35)÷3＝16)", Math.abs(ev("computeSideBusinessIncome(state)") - 16) < 1e-9);
  ev("state.studentStatus='graduated'; state.careerStatus=CAREER_STATUS.NOT_EMPLOYED; state.occupationCategory=null; state.sideIncomeLog=[]");
  const c1 = ev("state.cash"); ev("applyPartTimeWork(state, '去打工', {daysAdvanced:30}, 1)");
  A.check("出社會後的打工(時薪×時數)金額規則不變，也進平均", ev("state.cash") - c1 === ev("state.partTimeEventLog.earning") && ev("state.sideIncomeLog.length") === 1 && ev("state.sideIncomeLog[0].amount") === ev("state.partTimeEventLog.earning"), ev("state.partTimeEventLog"));
  A.check("一次性收入(one_time_transaction)不進平均：紀錄只有打工那一筆", ev("state.sideIncomeLog.length") === 1);
  ev("state.studentStatus='enrolled'; state.sideIncomeLog=[]");
}

// ---------- 反悔／失敗還原清單 ----------
A.check("快照欄位清單包含studentExpense與sideIncomeLog", js("SNAPSHOT_EXTRA_KEYS").includes("studentExpense") && js("SNAPSHOT_EXTRA_KEYS").includes("sideIncomeLog"));

const ok = A.report();
process.exit(ok ? 0 : 1);
