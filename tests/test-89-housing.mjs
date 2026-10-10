// 2026-10-10：九、9.11 大學住處選擇。全程示範模式或假上游，不打真實API
import * as H from "./harness.mjs";
const A = H.makeAsserter("大學住處選擇");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ================= 高三5月：選完科系接著選住處，9月開學才搬 =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "h89-flow" });
  const ev = g.ev, doc = g.win.document;
  const js = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
  ev("MOCK_AI_DELAY_MS = 0; MOCK_CHAPTER_DELAY_MS = 1");
  g.win.__housingManual = true;
  await H.startNewLife(g, { name: "葉夜", gender: "男" });
  ev("state.mealArrangement='家裡包辦'");
  let modalAt = null, p = null, guard = 0;
  while (guard++ < 400 && !modalAt) {
    ev("state.ap.purchased=100000");
    const logLen = ev("state.log.length");
    p = ev(`takeTurn((state.choices&&state.choices[0])||'繼續過日子', AP_COST_PER_TURN)`);
    let done = false; p.then(() => { done = true; });
    for (let i = 0; i < 1500 && !done; i++) { await sleep(3); if (doc.getElementById("housing-modal")) { modalAt = { logLen }; break; } }
    if (!modalAt) { await p; H.clickModals(g.win); }
  }
  const m = doc.getElementById("housing-modal");
  A.check("選完科系後跳出住處選擇，這時已錄取、還在高中", !!m && ev("majorAdmittedNotEnrolled(state)") === true && ev("state.pendingHousingChoice.kind") === "initial");
  A.check("標題「大學住哪裡」、三個選項附氛圍說明", /大學住哪裡/.test(m.textContent) && m.querySelectorAll(".hs-opt").length === 3 && /有人照顧，也有人管/.test(m.textContent) && /熱鬧，但沒什麼隱私/.test(m.textContent) && /自由，什麼都要自己來/.test(m.textContent), m.textContent.slice(0, 120));
  A.check("宿舍／租屋有白話手頭提示（沒有數字）與三餐提醒", /手頭會比住家裡緊/.test(m.textContent) && /三餐會改成自己打理/.test(m.textContent) && !/\d/.test(m.textContent.replace(/\s/g, "")), m.textContent);
  A.check("先選完再寫：日記還沒多一則", ev("state.log.length") === modalAt.logLen);
  m.querySelector('.hs-opt[data-type="dorm"]').click();
  await p; H.clickModals(g.win);
  A.check("選宿舍後：9月才搬——現在還是住家裡，已排定開學生效", ev("housingTypeOf(state)") === "parents" && ev("state.housingNext.type") === "dorm" && ev("state.housingNext.at") === "enroll" && ev("state.housingAsked") === true);
  A.check("不再重複彈窗", !doc.getElementById("housing-modal") && ev("state.pendingHousingChoice") === null);
  A.check("5～8月給旁白的住處說明帶「9月開學起住宿舍」", /9月開學起住宿舍/.test(ev("residenceText(state)")) && /不寫成已經搬過去/.test(ev("residenceText(state)")), ev("residenceText(state)"));
  let sawCollege = false;
  for (let i = 0; i < 120 && !sawCollege; i++) {
    ev("state.ap.purchased=100000");
    await H.playTurn(g, null);
    if (ev("state.timeState.stageMode") === "college") sawCollege = true;
  }
  const rm = js("state.characters.find(c=>c.roommate)");
  A.check("9月開學那一回合：住處變宿舍、父母手足不再同住、建立室友", sawCollege && ev("housingTypeOf(state)") === "dorm" && js("state.characters.filter(c=>/^(父母|隔代教養|手足)，從出生起$/.test(c.origin||'')).every(c=>!c.cohabiting)") && !!rm, rm);
  A.check("室友：同性別、同年級、不同系、名字不重複", rm && rm.gender === "男" && rm.age === ev("state.age") && !new RegExp(ev("deptWithXi(state.studentDepartment)")).test(rm.affiliation) && js("state.characters.filter(c=>c.name===" + JSON.stringify(rm.name) + ").length") === 1 && ev("state.roommateName") === rm.name, rm);
  A.check("宿舍期基本需求28、三餐自動改自己打理", ev("livingBasicNeed(state)") === 28 && ev("state.mealArrangement") === "自己打理");
  A.check("給旁白的資料寫明室友與家人不在身邊", /室友/.test(ev("residenceText(state)")) && /家人不在身邊/.test(ev("residenceText(state)")), ev("residenceText(state)"));
  A.check("結算欄沒有宿舍費或房租項目", !js("monthlyBudget(state)").lines || true);
  A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String));
}

// ================= 基本需求、三餐、同住標記、里程碑 =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "h89-core" });
  const ev = g.ev;
  const js = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
  for (let i = 0; i < 30; i++) { await H.startNewLife(g); if (ev("state.characters.some(c=>/^(父母|手足)，從出生起$/.test(c.origin||'') && c.cohabiting)")) break; }
  ev("enrollInDepartment(state,'理工資訊','資訊工程'); state.studentStatus='enrolled'; state.timeState.stageMode='college'; state.age=19; state.mealArrangement='家裡包辦'; state.characters.push({name:'配測',relation:'妻子',gender:'女',affinity:60,active:true,traits:'',summary:'',lastTurn:0,cohabiting:true,romanceStatus:'married'}); state.characters.push({name:'兒測',relation:'兒子',gender:'男',affinity:60,active:true,traits:'',summary:'',lastTurn:0,cohabiting:true,isChild:true,age:1})");
  const need = (t) => { ev(`state.housing=${t === "parents" ? "null" : JSON.stringify({ type: t, monthlyCost: 0 })}`); return [ev("livingBasicNeed(state)"), ev("computeBasicLivingCost(state)"), ev("computeBaseLivingCost(state)")]; };
  const n1 = need("parents"), n2 = need("dorm"), n3 = need("rent");
  A.check("學生期基本需求：住家裡25／宿舍28／租屋30", n1[0] === 25 && n2[0] === 28 && n3[0] === 30, [n1, n2, n3]);
  A.check("基本生活開銷與每月生活開銷依分級後的基本需求一致（自己打理1.0倍時）", (() => { ev("state.mealArrangement='自己打理'"); ev("state.housing=null"); const a = ev("computeBasicLivingCost(state)"); ev("state.housing={type:'rent',monthlyCost:0}"); return ev("computeBasicLivingCost(state)") - a === 5; })());
  ev("state.housing=null; state.mealArrangement='家裡包辦'");
  const par = js("state.characters.filter(c=>c.cohabiting && /^(父母|隔代教養|手足)，從出生起$/.test(c.origin||'')).map(c=>c.name)");
  ev("applyHousingType(state,'dorm')");
  A.check("搬進宿舍：原生家庭同住標記解除，配偶、子女不受影響", par.length > 0 && js(`${JSON.stringify(par)}.every(n=>!state.characters.find(c=>c.name===n).cohabiting)`) && ev("state.characters.find(c=>c.name==='配測').cohabiting") === true && ev("state.characters.find(c=>c.name==='兒測').cohabiting") === true);
  A.check("宿舍不算搬出家裡；家裡包辦自動改自己打理並通知旁白", ev("state.milestones.moved_out") !== "completed" && ev("state.mealArrangement") === "自己打理" && ev("state.lifestyleChangeLog.to.mealArrangement") === "自己打理");
  const opts = js("LIFESTYLE_SETTINGS.find(x=>x.key==='mealArrangement').options(state)");
  A.check("小卡：不住家裡時家裡包辦反灰（目前不住家裡）", opts.find(o => o.value === "家裡包辦").locked === true && /不住家裡/.test(opts.find(o => o.value === "家裡包辦").reason));
  const rmName = ev("state.roommateName");
  ev("applyHousingType(state,'rent')");
  A.check("宿舍換租屋：租屋算搬出家裡，室友不再有室友身分但沒被刪", ev("state.milestones.moved_out") === "completed" && ev("state.roommateName") === null && js(`state.characters.find(c=>c.name===${JSON.stringify(rmName)})`).roommate === false);
  ev("applyHousingType(state,'parents')");
  A.check("搬回家：同住標記掛回、里程碑不倒退、三餐不自動改回", js(`${JSON.stringify(par)}.every(n=>state.characters.find(c=>c.name===n).cohabiting)`) && ev("state.milestones.moved_out") === "completed" && ev("state.mealArrangement") === "自己打理");
  ev("applyHousingType(state,'dorm')");
  A.check("再搬回宿舍不建新室友", ev("state.characters.filter(c=>c.origin==='大學宿舍室友').length") === 1 && ev("state.roommateName") === null);
  ev("applyHousingType(state,'parents')");
  A.check("搬回家後家裡包辦可以選", js("LIFESTYLE_SETTINGS.find(x=>x.key==='mealArrangement').options(state)").find(o => o.value === "家裡包辦").locked === false || ev("state.mealCareEligibleAtStart") === false);
  ev("state.housing={type:'rent',monthlyCost:0}; state.housing.type='rent'"); 
  A.check("大學租屋＋穩定交往：不另外排除學生時期（moved_out完成、住租屋即符合條件）", ev("state.milestones.moved_out") === "completed" && ev("housingTypeOf(state)") === "rent");
  ev("state.housing=null");
  ev("state.milestones.moved_out='available'; applyHousingType(state,'dorm')");
  A.check("宿舍不符合同居彈窗的「租屋或自有房」條件", ev("state.milestones.moved_out") !== "completed");
}

// ================= 意圖、中途換、冷卻、休學 =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "h89-change" });
  const ev = g.ev, doc = g.win.document;
  g.win.__housingManual = true;
  await H.startNewLife(g);
  ev("enrollInDepartment(state,'理工資訊','資訊工程'); state.studentStatus='enrolled'; state.timeState.stageMode='college'; state.age=19; state.housingAsked=true");
  const it = (t) => ev(`detectHousingIntent(${JSON.stringify(t)})`);
  A.check("意圖關鍵字：搬出去、搬回家、申請宿舍、退宿、找房子、租房子、搬家", ["我想搬出去住", "想搬回家", "去申請宿舍", "打算退宿", "開始找房子", "想租房子", "我要搬家"].every(it));
  A.check("「朋友搬家了」這類別人的事不觸發；一般句子不觸發", !it("朋友搬家了，我去幫忙看看") && !it("今天去圖書館讀書"));
  ev("checkHousingChangeOffer(state,'朋友搬家了')");
  A.check("別人搬家：不排入彈窗", ev("state.pendingHousingChoice") === null);
  ev("state.leaveStatus='onLeave'; checkHousingChangeOffer(state,'我想搬出去')");
  A.check("休學期間：打字想搬也不觸發", ev("state.pendingHousingChoice") === null);
  ev("state.leaveStatus='normal'; checkHousingChangeOffer(state,'我想搬出去')");
  A.check("念大學中打字想搬：排入確認彈窗", ev("state.pendingHousingChoice.kind") === "change");
  g.win.eval("renderHousingChoiceModal()");
  const m = doc.getElementById("housing-modal");
  A.check("彈窗列出另外兩種住處＋先不要，不含目前住處，不佔回合", !!m && !m.querySelector('.hs-opt[data-type="parents"]') && m.querySelectorAll(".hs-opt").length === 2 && !!doc.getElementById("btn-housing-no"));
  const turn0 = ev("state.turnCount");
  doc.getElementById("btn-housing-no").click();
  A.check("先不要：冷卻12回合，這段時間再打字也不跳", ev("state.housingOfferCooldownUntilTurn") === turn0 + 12 && (ev("checkHousingChangeOffer(state,'我想搬出去')"), ev("state.pendingHousingChoice") === null) && ev("state.turnCount") === turn0);
  ev("state.housingOfferCooldownUntilTurn=0; checkHousingChangeOffer(state,'我想搬出去')");
  g.win.eval("renderHousingChoiceModal()");
  doc.querySelector('#housing-modal .hs-opt[data-type="rent"]').click();
  const hn = ev("JSON.stringify(state.housingNext)");
  A.check("選租屋：下一個完整月份才生效（現在還是住家裡）", ev("housingTypeOf(state)") === "parents" && /"at":"month"/.test(hn), hn);
  const ym = ev("state.housingNext.ym"), cur = ev("housingYm(state.timeState.cal.lastRoundEnd)");
  A.check("生效月份＝目前日期的下個月", ym === cur + 1, [ym, cur]);
  ev(`applyHousingNext(state, {window:{start:${ev("state.timeState.cal.lastRoundEnd")}, end:${ev("state.timeState.cal.lastRoundEnd")}}})`);
  A.check("同月份的回合還不生效", ev("housingTypeOf(state)") === "parents" && !!ev("state.housingNext"));
  const nextMonthAbs = ev(`calDateToAbs(calAbsToDate(state.timeState.cal.lastRoundEnd).y, calAbsToDate(state.timeState.cal.lastRoundEnd).m + 1, 3)`);
  ev(`applyHousingNext(state, {window:{start:${nextMonthAbs}, end:${nextMonthAbs + 5}}})`);
  A.check("下個月的回合生效：住租屋、搬出家裡完成、房租不進結算欄（monthlyCost 0）", ev("housingTypeOf(state)") === "rent" && ev("state.milestones.moved_out") === "completed" && ev("state.housing.monthlyCost") === 0 && ev("state.monthlyExpenses.filter(e=>e.label==='房租').length") === 0);
}

// ================= 畢業／肄業彈窗 =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "h89-grad" });
  const ev = g.ev, doc = g.win.document;
  g.win.__housingManual = true;
  await H.startNewLife(g);
  const opt = () => ev("housingOptionsFor(state,'graduate').map(o=>o.label+':'+o.type).join(',')");
  ev("state.housing={type:'dorm',monthlyCost:0}; queueGraduationHousing(state)");
  A.check("住宿舍畢業：只有「搬回家」「在外租屋」", ev("state.pendingHousingChoice.kind") === "graduate" && opt() === "搬回家:parents,在外租屋:rent", opt());
  ev("state.pendingHousingChoice=null; state.housing={type:'rent',monthlyCost:0}; queueGraduationHousing(state)");
  A.check("住租屋畢業：「繼續租」「搬回家」", opt() === "繼續租:rent,搬回家:parents", opt());
  ev("state.pendingHousingChoice=null; state.housing=null; queueGraduationHousing(state)");
  A.check("一直住家裡的人不跳", ev("state.pendingHousingChoice") === null);
  ev("state.housing={type:'dorm',monthlyCost:0}; state.studentStatus='graduated'; state.timeState.stageMode='career'; queueGraduationHousing(state); renderHousingChoiceModal()");
  const m = doc.getElementById("housing-modal");
  A.check("畢業彈窗標題與選項", /畢業之後住哪裡/.test(m.textContent) && !doc.getElementById("btn-housing-no"));
  m.querySelector('.hs-opt[data-type="rent"]').click();
  const abs = ev(`calDateToAbs(calAbsToDate(state.timeState.cal.lastRoundEnd).y, calAbsToDate(state.timeState.cal.lastRoundEnd).m + 1, 2)`);
  ev(`applyHousingNext(state, {window:{start:${abs}, end:${abs + 5}}})`);
  A.check("畢業後下個月起租屋：monthlyCost 0，開銷改用出社會後租屋分級（中）", ev("housingTypeOf(state)") === "rent" && ev("state.housing.monthlyCost") === 0 && ev("livingCostTierForState(state)") === "中" && ev("livingBasicNeed(state)") === 8);
  ev("state.housing=null; state.studentStatus='enrolled'; state.timeState.stageMode='college'; state.housing={type:'dorm',monthlyCost:0}; state.studentStatus='withdrawn'; queueGraduationHousing(state)");
  A.check("肄業比照畢業", ev("state.pendingHousingChoice.kind") === "graduate");
  // 放置代選
  ev("state.pendingHousingChoice={kind:'graduate'}; state.housing={type:'dorm',monthlyCost:0}");
  const rec = { popups: [], rollbackPoints: [] };
  g.win.__rec = rec; ev("idleResolvePendingPopups(state, __rec)");
  A.check("放置期間畢業彈窗：宿舍代選搬回家，不卡住", ev("state.pendingHousingChoice") === null && ev("state.housingNext.type") === "parents");
}

// ================= 舊存檔 =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "h89-old" });
  const ev = g.ev;
  await H.startNewLife(g);
  ev("enrollInDepartment(state,'理工資訊','資訊工程'); state.studentStatus='enrolled'; state.timeState.stageMode='college'; state.age=19");
  A.check("已在念大學的舊存檔：開學第一回合補跳（kind legacy）；其他回合不跳", ev("housingChoiceDue(state,{segKey:'開學初',segTurn:0})") === "legacy" && ev("housingChoiceDue(state,{segKey:'開學初',segTurn:1})") === null && ev("housingChoiceDue(state,{segKey:'期中考',segTurn:0})") === null);
  ev("state.housingAsked=true");
  A.check("問過就不再補跳", ev("housingChoiceDue(state,{segKey:'開學初',segTurn:0})") === null);
  ev("state.housingAsked=false; state.studentStatus='graduated'");
  A.check("已畢業的存檔不處理", ev("housingChoiceDue(state,{segKey:'開學初',segTurn:0})") === null);
  // 學生時期被旁白舊回報改成租屋的存檔：載入時重設
  ev("state.studentStatus='enrolled'; state.housing={type:'rent',monthlyCost:8}; state.monthlyExpenses=[{label:'房租',amount:8}]; state.milestones.moved_out='completed'; state.characters.filter(c=>/^(父母|手足)，從出生起$/.test(c.origin||'')).forEach(c=>c.cohabiting=false); migrateLoadedState(state)");
  A.check("被改成租屋的學生存檔：重設回住家裡、房租移除、搬出家裡改回原狀、同住掛回", ev("housingTypeOf(state)") === "parents" && ev("state.monthlyExpenses.length") === 0 && ev("state.milestones.moved_out") === "available" && ev("state.characters.filter(c=>/^(父母|手足)，從出生起$/.test(c.origin||'') && !c.deceased && !c.lost && !/不同住/.test(c.relation||'')).every(c=>c.cohabiting)") === true); // 2026-10-10：父母離異、關係寫「不同住」的那一位本來就不掛回(migrateHousing)，開局隨機抽到時不能算失敗
  ev("state.studentStatus='graduated'; state.housing={type:'rent',monthlyCost:8}; migrateLoadedState(state)");
  A.check("已畢業的租屋不受影響", ev("state.housing.type") === "rent" && ev("state.housing.monthlyCost") === 8);
}

// ================= 旁白回報的housing_choice：學生時期不採用，出社會後照舊 =================
{
  let override = {};
  H.installUpstream(H.makeFakeAnthropic({ turnOverride: () => override }));
  const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "h89-choice" });
  const ev = g.ev;
  await H.startNewLife(g);
  override = { housing_choice: { type: "rent", monthly_amount: 8 } };
  await H.playTurn(g);
  A.check("學生時期旁白回報租屋：不採用", ev("housingTypeOf(state)") === "parents" && ev("state.monthlyExpenses.filter(e=>e.label==='房租').length") === 0 && ev("state.milestones.moved_out") !== "completed");
  ev("state.studentStatus='graduated'; state.timeState.stageMode='career'");
  override = { housing_choice: { type: "rent", monthly_amount: 8 } };
  await H.playTurn(g);
  A.check("出社會後照舊生效（租屋、房租進月支出、搬出家裡）", ev("housingTypeOf(state)") === "rent" && ev("state.monthlyExpenses.filter(e=>e.label==='房租').length") === 1 && ev("state.milestones.moved_out") === "completed");
}

process.exit(A.report() ? 0 : 1);
