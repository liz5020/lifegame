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
// 平常沒預期的彈窗由harness自動按〔不花〕；要自己按的那幾回合才把g.win.__sxManual打開
{ const k = `ap:${H.loc("sx00000001")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };

// ---------- 提出條件（用假的狀態＋固定亂數） ----------
const prep = (sOverrides, seq, ctx0 = {}, half = "上學期") => { const ctx = Object.assign({ holiday: true, segKey: "期中準備期", segTurn: 2 }, ctx0); return prep0(sOverrides, seq, ctx, half); };
const prep0 = (sOverrides, seq, ctx, half) => js(`(()=>{ const o=Math.random; const q=${JSON.stringify(seq)}; let i=0; Math.random=()=>i<q.length?q[i++]:0.5;
  try{ const s=Object.assign({studentStatus:"enrolled",family:"小康",cash:500,age:16,turnCount:20,idleMode:false,
    focusKeyLog:["study","study","study","rest","social","study"], clubEngagement:20, characters:[{name:"小明",relation:"同學",affinity:55,romanceStatus:null}], timeState:{cal:{v:2,semIdx:0}}}, ${sOverrides});
    return prepareStudentExpense(s, ${JSON.stringify(ctx)}, ${JSON.stringify(half)}); } finally { Math.random=o; } })()`);
{
  const p = prep("{}", [0.99, 0.01, 0.01]); // 家裡沒擲中(0.99>=0.10)；一般擲中；類別friend
  A.check("朋友與戀愛：小康0.5個月＝30，對象是同學小明，事件在三種之內", p && p.kind === "friend" && p.amount === 30 && p.target === "小明" && ["朋友小聚", "小禮物"].includes(p.event), p);
  const q = prep("{family:'清寒'}", [0.99, 0.01, 0.6]); // 家裡沒擲中、一般擲中、類別trip
  A.check("想要的大件(出遊／演唱會／社團)：清寒1.5個月＝45", q && q.kind === "trip" && q.amount === 45 && STR(q.event), q);
  const r = prep("{family:'富裕',turnCount:50}", [0.01, 0.8]); // 富裕：第一個亂數就是「一般」；類別gadget
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

// ---------- 17.3.6.9 每種事件的觸發條件 ----------
{
  const ev0 = (e) => (e || {}).event;
  const fam = (extra, ctx) => prep(`{family:'清寒',${extra || ""}}`, [0.05, 0.5, 0.5, 0.5], ctx); // 家裡擲中，事件在合格清單內挑
  A.check("補習或參考書費用：最近6回合讀書≥3且在準備期→可以出現", ev0(fam("", {})) === "補習或參考書費用", fam("", {}));
  A.check("補習或參考書費用：最近讀書不到3回合→不出現(只剩學費差額／電腦壞了才可能)", ev0(fam("focusKeyLog:['rest','social','study','rest','social','rest'],turnCount:20", {})) == null, fam("focusKeyLog:['rest','study']", {}));
  A.check("補習或參考書費用：不在準備期(假期)→不出現", ev0(fam("turnCount:20", { segKey: "假期" })) == null);
  A.check("電腦壞了：距離上次升級不到40回合→不出現；滿40回合可以", ev0(fam("focusKeyLog:[],studentExpense:{lastGadgetTurn:5,termKey:'',termWant:0,yearKey:'',yearFamily:0,license:false,pending:null,resultNow:null},turnCount:30", {})) == null
    && ev0(fam("focusKeyLog:[],studentExpense:{lastGadgetTurn:5,termKey:'',termWant:0,yearKey:'',yearFamily:0,license:false,pending:null,resultNow:null},turnCount:50", {})) === "電腦壞了");
  A.check("學費差額：只在新學期第一回合(開學初第0回合)", ev0(fam("focusKeyLog:[],turnCount:20", { segKey: "開學初", segTurn: 0 })) === "學費差額" && ev0(fam("focusKeyLog:[],turnCount:20", { segKey: "開學初", segTurn: 1 })) == null);
  A.check("家裡類沒有任何事件合格→不提出，也不用別的事件補上", fam("focusKeyLog:[],turnCount:20", { segKey: "期中準備期" }) === null);
  const gad = (extra, ctx) => prep(`{family:'富裕',${extra || ""}}`, [0.01, 0.8], ctx); // 一般擲中、類別gadget
  A.check("手機或電腦升級：沒升級過，要到第40回合才出現", gad("turnCount:30") === null && ev0(gad("turnCount:45")) === "手機或電腦升級");
  A.check("手機或電腦升級：上次升級後不到40回合→不出現", gad("turnCount:60,studentExpense:{lastGadgetTurn:40,termKey:'',termWant:0,yearKey:'',yearFamily:0,license:false,pending:null,resultNow:null}") === null);
  const trip = (extra, ctx, seqPick) => prep(`{${extra || ""}}`, [0.99, 0.01, 0.6, seqPick == null ? 0.0 : seqPick], ctx);
  A.check("出遊：寒暑假且有好感≥50的朋友→同行者是那位朋友", ev0(trip("", {}, 0.0)) === "出遊" && trip("", {}, 0.0).target === "小明", trip("", {}, 0.0));
  A.check("出遊：不在寒暑假→不會出遊(其他兩種事件也不合格時整個不提出)", trip("clubEngagement:0,characters:[{name:'小明',relation:'同學',affinity:30}]", { holiday: false }) === null);
  A.check("出遊：朋友好感不到50→不出遊", ev0(trip("characters:[{name:'小明',relation:'同學',affinity:45}]", {}, 0.0)) !== "出遊");
  A.check("社團活動：沒參加社團(參與度0)→不出現", [0.0, 0.5, 0.99].every(x => ev0(trip("clubEngagement:0,characters:[]", {}, x)) !== "社團活動"));
  A.check("社團活動：有參加社團→可以出現", [0.0, 0.5, 0.99].some(x => ev0(trip("clubEngagement:30,characters:[]", {}, x)) === "社團活動"));
  A.check("演唱會：沒朋友也沒表演類興趣→不出現；有社交表演的正式興趣卡→可以", [0.0, 0.5, 0.99].every(x => ev0(trip("clubEngagement:0,characters:[]", {}, x)) !== "演唱會")
    && [0.0, 0.5, 0.99].some(x => ev0(trip("clubEngagement:0,characters:[],interestCandidates:[{category:'社交表演',status:'active'}]", {}, x)) === "演唱會"));
  A.check("考駕照：滿18歲、沒考過，但不在寒暑假→併入朋友小聚(不出現考駕照)", ev0(prep("{age:18}", [0.99, 0.01, 0.95], { holiday: false })) !== "考駕照" && ev0(prep("{age:18}", [0.99, 0.01, 0.95], { holiday: true })) === "考駕照");
  A.check("朋友小聚：好感不到40的朋友不會被約出來(沒有合格朋友→不提出)", prep("{characters:[{name:'小明',relation:'同學',affinity:35}]}", [0.99, 0.01, 0.1]) === null);
  A.check("彈窗情境句：出遊／演唱會／家裡幾種寫法", js(`[studentExpenseSceneLine({kind:'trip',event:'出遊',target:'小明'}),studentExpenseSceneLine({kind:'trip',event:'演唱會',target:'小明'}),studentExpenseSceneLine({kind:'family',event:'學費差額'}),studentExpenseSceneLine({kind:'family',event:'電腦壞了'})]`).join("|")
    === "小明約你假期出去玩。|小明約你去演唱會。|家裡提到這學期學費差額的事。|家裡的電腦壞了。");
}
// 實際回合會記重心代號
await H.playTurn(g);
A.check("每回合記下重心代號(最近6回合)，且進快照清單", Array.isArray(js("state.focusKeyLog")) && js("state.focusKeyLog").length >= 1 && js("state.focusKeyLog").length <= 6 && js("SNAPSHOT_EXTRA_KEYS").includes("focusKeyLog"), js("state.focusKeyLog"));

// ---------- 價位換算：政治世家(零用錢150)用家境表(富裕120)，不用150 ----------
A.check("價位以家境的月零用錢為單位(清寒30、小康60、富裕120)", js("[studentExpenseUnit({family:'清寒'}),studentExpenseUnit({family:'小康'}),studentExpenseUnit({family:'富裕',monthlyIncome:150})]").join() === "30,60,120");

// ---------- 實際回合：玩家送出行動→先跳彈窗→花／不花→同一回合旁白收到結果（2026-10-09 先選完再寫） ----------
await H.playTurn(g); // 先把開場跑完
ev("state.family='小康'; state.cash=500; state.monthlyIncome=60; state.studentStatus='enrolled'");
ev(`state.characters.push({name:"阿森", relation:"同學", affinity:50, active:true, lastTurn:0, gender:"男", traits:["外向"], summary:"同班同學"})`);
const planJs = (kind, event, total, amount, target) => `window.__origPrep = window.__origPrep || prepareStudentExpense; prepareStudentExpense = ()=>({kind:${JSON.stringify(kind)},event:${JSON.stringify(event)},total:${total},amount:${amount},target:${JSON.stringify(target)},keys:studentExpenseKeys(state,"上學期")});`;
const unplan = () => ev("window.__origPrep = window.__origPrep || prepareStudentExpense; prepareStudentExpense = ()=>null;"); // 之後的回合固定不排定，避免隨機事件干擾
const aff = () => ev(`state.characters.find(c=>c.name==="阿森").affinity`);
const waitModal = async () => { for (let i = 0; i < 6000 && !doc.getElementById("student-expense-modal"); i++) await new Promise(r => setTimeout(r, 5)); };
// 送出行動→等彈窗出現→(檢查)→按鈕→等回合寫完。回傳這回合送給AI的payload
const runTurn = async (action, btn, check) => {
  payload = null;
  g.win.__sxManual = true;
  const pr = g.ev(`takeTurn(${JSON.stringify(action)}, AP_COST_PER_TURN)`);
  await waitModal();
  const sawPayloadBefore = payload;
  if (check) check();
  doc.getElementById(btn).click();
  await pr;
  g.win.__sxManual = false;
  return { before: sawPayloadBefore, payload };
};
unplan();
const apBefore = ev("totalAP(state)");
ev(planJs("friend", "朋友小聚", 30, 30, "阿森"));
const c0 = ev("state.cash"), a0 = aff();
unplan(); ev(planJs("friend", "朋友小聚", 30, 30, "阿森")); // runTurn內只會呼叫一次prepare
let r1 = await runTurn("跟同學聊聊天", "btn-sx-yes", () => {
  A.check("送出行動後、AI還沒呼叫前就跳彈窗(此時還沒有payload)", !!doc.getElementById("student-expense-modal") && payload === null);
  const m = doc.getElementById("student-expense-modal").textContent;
  A.check("彈窗內容：情境句「阿森約你朋友小聚。」、標題、金額與存款、〔花〕〔不花〕", /阿森約你朋友小聚。/.test(m) && /要跟朋友小聚嗎/.test(m) && /大約 30/.test(m) && doc.getElementById("btn-sx-yes").textContent === "花" && doc.getElementById("btn-sx-no").textContent === "不花");
  A.check("彈窗時還沒扣款、行動點也沒因彈窗多扣", ev("state.cash") === c0);
});
unplan();
A.check("按〔花〕：同一回合就扣30、對象好感+2、彈窗收掉、pending清除", JSON.stringify(ev("state.lastSettlement.extras")).includes('["朋友小聚",-30') && aff() - a0 === 2 && !doc.getElementById("student-expense-modal") && !ev("state.studentExpense.pending"), [c0, ev("state.cash"), a0, aff()]);
A.check("同一回合旁白收到結果bought=true、event、spent，沒有舊的scene欄位", r1.payload.student_expense_result_now && r1.payload.student_expense_result_now.bought === true && r1.payload.student_expense_result_now.event === "朋友小聚" && r1.payload.student_expense_result_now.spent === 30 && !("student_expense_scene" in r1.payload), r1.payload.student_expense_result_now);
A.check("回合結束後結果已清掉(只給這一回合)", ev("state.studentExpense.resultNow") === null);
A.check("只多扣這一回合的1點行動點，彈窗不另外扣", apBefore - ev("totalAP(state)") === 1, [apBefore, ev("totalAP(state)")]);
A.check("記進明細名稱「朋友小聚」", JSON.stringify(ev("state.cashLedger")).includes("朋友小聚") || JSON.stringify(js("state.lastSettlement||null")).includes("朋友小聚"), ev("state.cashLedger"));
A.check("次數記帳：上一件朋友的回合有記下", ev("state.studentExpense.lastFriendTurn") != null);
A.check("再下一回合結果已清掉", (await H.playTurn(g), payload.student_expense_result_now == null));

// 同一人同階段第二次好感減半
ev(planJs("friend", "小禮物", 30, 30, "阿森"));
const a1 = aff();
await runTurn("再約一次", "btn-sx-yes", () => A.check("小禮物的情境句", /你想買個小禮物給阿森。/.test(doc.getElementById("student-expense-modal").textContent)));
unplan();
A.check("同一個人同一階段第二次：好感只+1", aff() - a1 === 1, [a1, aff()]);

// 不花
ev(planJs("trip", "演唱會", 90, 90, null));
const c1 = ev("state.cash"), a2 = aff();
const r2 = await runTurn("週末", "btn-sx-no", () => A.check("出遊類彈窗：標題「要去演唱會嗎？」、情境句", /要去演唱會嗎/.test(doc.getElementById("student-expense-modal").textContent) && /有個機會：演唱會。/.test(doc.getElementById("student-expense-modal").textContent)));
unplan();
A.check("按〔不花〕：不扣款(只有生活結算)、不動好感、同一回合旁白收到declined", ev("state.cash") >= c1 - 20 && a2 === aff() && r2.payload.student_expense_result_now && r2.payload.student_expense_result_now.bought === false && r2.payload.student_expense_result_now.reason === "declined", r2.payload.student_expense_result_now);

// 出遊(選花)：只扣錢、不加任何數值
ev(planJs("trip", "出遊", 90, 90, null));
await runTurn("週末", "btn-sx-yes");
unplan();
A.check("出遊選花：扣90(明細有「出遊 −90」)", JSON.stringify(ev("state.lastSettlement.extras")).includes('["出遊",-90'), ev("state.lastSettlement.extras"));

// 家裡出不起
ev(planJs("family", "補習或參考書費用", 80, 40, null));
const c3 = ev("state.cash");
const r3 = await runTurn("放學", "btn-sx-yes", () => {
  const m = doc.getElementById("student-expense-modal").textContent;
  A.check("家裡類彈窗：情境句、顯示總價80與負擔40、〔出一半〕〔這次先不用〕", /家裡提到補習或參考書費用。/.test(m) && /補習或參考書費用，家裡這次需要你出一半/.test(m) && /總共大約 80/.test(m) && /約 40/.test(m)
    && doc.getElementById("btn-sx-yes").textContent === "出一半" && doc.getElementById("btn-sx-no").textContent === "這次先不用");
});
unplan();
A.check("出一半：扣40，同一回合旁白收到結果", JSON.stringify(ev("state.lastSettlement.extras")).includes('["補習或參考書費用",-40') && r3.payload.student_expense_result_now.bought === true && r3.payload.student_expense_result_now.spent === 40);
ev(planJs("family", "電腦壞了", 100, 50, null));
const c4 = ev("state.cash");
const r4 = await runTurn("放學", "btn-sx-no");
unplan();
A.check("這次先不用：不扣錢、旁白收到cheaper_or_later", c4 - ev("state.cash") < 50 && r4.payload.student_expense_result_now.reason === "cheaper_or_later", r4.payload.student_expense_result_now);

// 考駕照
ev("state.age=18; state.studentExpense.license=false");
ev(planJs("license", "考駕照", 60, 60, null));
await runTurn("放學", "btn-sx-yes");
unplan();
A.check("考駕照選花：記下已考過，之後不再出現", ev("state.studentExpense.license") === true);
await H.playTurn(g);

// 回合失敗要還原：彈窗花了錢，AI失敗→錢與次數都還原
{
  ev("state.age=16"); const cash5 = ev("state.cash"), want5 = ev("state.studentExpense.termWant");
  ev(planJs("trip", "出遊", 90, 90, null));
  const bad = H.installUpstreamOnce ? null : null; // 見下：改用callAI直接丟錯
  ev("window.__origCallAI = window.__origCallAI || callAI; callAI = async ()=>{ const e = new Error('boom'); e.noRetry = true; throw e; }; window.__origMock = window.__origMock || mockCallAI;");
  g.win.__sxManual = true; const pr = g.ev(`takeTurn("週末", AP_COST_PER_TURN)`); await waitModal(); doc.getElementById("btn-sx-yes").click(); await pr; g.win.__sxManual = false;
  ev("callAI = window.__origCallAI"); unplan();
  A.check("AI失敗還原：花的錢與次數都回到送出前", ev("state.cash") === cash5 && ev("state.studentExpense.termWant") === want5 && !ev("state.studentExpense.pending"), [cash5, ev("state.cash")]);
}

// ---------- 寫了才算數（17.3.6.6／8.8.2） ----------
{
  const chk = (r, resultNow, seed) => js(`(()=>{ const s={studentExpense:{resultNow:${JSON.stringify(resultNow)}}}; return detectMissingRequiredMentions(${JSON.stringify(r)}, s, ${JSON.stringify({ interestSeed: seed })}); })()`);
  const bought = { event: "手機或電腦升級", kind: "gadget", bought: true, spent: 120 };
  A.check("花了手機電腦、正文沒提→判不合格", chk({ action_result: "妳去了學校。", narrative: "下課後走回家。" }, bought, null).length === 1);
  A.check("正文寫到新手機→合格", chk({ action_result: "妳拆開新手機的盒子。", narrative: "螢幕比舊的亮很多。" }, bought, null).length === 0);
  A.check("沒花(declined)→不檢查", chk({ action_result: "沒事。", narrative: "沒事。" }, { event: "出遊", bought: false, reason: "declined" }, null).length === 0);
  A.check("補習或參考書費用：出一半卻整段沒提補習→不合格；提到補習→合格", chk({ narrative: "妳回家吃飯。" }, { event: "補習或參考書費用", bought: true, spent: 40 }, null).length === 1 && chk({ narrative: "補習班的費用妳出了一半。" }, { event: "補習或參考書費用", bought: true, spent: 40 }, null).length === 0);
  const seed = { kind: "try_new", category: "藝術創作", item: "影像剪輯" };
  const ie = { reaction: "neutral", category: "藝術創作" };
  A.check("指定興趣項目沒寫進正文→不合格(剪輯不在正文)", chk({ action_result: "媽媽說補習費。", narrative: "妳剝橘子。", interest_event: ie }, null, seed).length === 1);
  A.check("正文有「剪輯」或相關兩字詞→合格", chk({ action_result: "妳用手機剪輯一段影片。", narrative: "轉場卡住。", interest_event: ie }, null, seed).length === 0);
  A.check("種子回合AI沒回報interest_event(種子作廢)→不檢查", chk({ action_result: "沒事。", narrative: "沒事。" }, null, seed).length === 0);
}

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
  A.check("學生期打工1份(小康16)：入帳並記進工作收入紀錄", earned === Math.max(1, Math.round(unit)) && earned === 16 && ev("state.sideIncomeLog.length") === 1 && ev("state.sideIncomeLog[0].amount") === 16, [earned, ev("state.sideIncomeLog")]);
  A.check("學生期打工份數：清寒8、小康16、富裕33", js("[30,60,120].map(m=>Math.round(PART_TIME_SHARES*m*12/44))").join() === "8,16,33");
  A.check("近3個月工作收入平均＝打工入帳÷3(16÷3)", Math.abs(ev("computeSideBusinessIncome(state)") - 16 / 3) < 1e-9, ev("computeSideBusinessIncome(state)"));
  ev("recordSideIncome(state, 35, state.timeState.cal.lastRoundEnd)");
  A.check("副業交件和打工合併算平均((16+35)÷3＝17)", Math.abs(ev("computeSideBusinessIncome(state)") - 17) < 1e-9);
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
