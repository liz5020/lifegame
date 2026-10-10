// 2026-10-10：葉夜第1世第150～193回合試玩回饋（九、9.10／八、8.8.5／十八、18.10.7／一、1.2.21～1.2.22／第三節A～F）
// 全程示範模式或假上游，不打真實API
import * as H from "./harness.mjs";
import { toTaiwanTraditional } from "../worker/s2t.js";
import { TURN_SYSTEM_PROMPT, TURN_RESULT_TOOL } from "../worker/prompt.js";
const A = H.makeAsserter("葉夜第150～193回合回饋");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ================= 九、9.10 選科系時機、畢業典禮、雙主修選系（示範模式，真的玩到高三） =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "ye88-major" });
  const ev = g.ev, doc = g.win.document;
  const js = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
  ev("MOCK_AI_DELAY_MS = 0; MOCK_CHAPTER_DELAY_MS = 1");
  g.win.__majorManual = true; // 這個測試自己按選系畫面
  await H.startNewLife(g, { name: "葉夜" });

  let modalAt = null, p = null, graduatedAt = null, preparedLabel = null, guard = 0;
  while (guard++ < 400 && !modalAt) {
    ev("state.ap.purchased=100000");
    const logLen = ev("state.log.length");
    p = ev(`takeTurn((state.choices&&state.choices[0])||'繼續過日子', AP_COST_PER_TURN)`);
    let done = false; p.then(() => { done = true; });
    for (let i = 0; i < 400 && !done; i++) { await sleep(3); if (doc.getElementById("major-selection-modal")) { modalAt = { logLen }; break; } }
    if (!modalAt) { await p; H.clickModals(g.win); }
  }
  A.check("高三下學期到5月才跳出選科系畫面（還沒選過、還在高中）", !!modalAt && js("state.timeState.stageMode") === "highschool" && js("state.timeState.yearInStage") === 3 && js("state.studentMajorGroup") === null, modalAt);
  const m = doc.getElementById("major-selection-modal");
  const mon = js("calAbsToDate(state.timeState.cal.lastRoundEnd).m");
  A.check("跳出時日期已到5月以後（5～7月）", mon >= 5 && mon <= 7, mon);
  A.check("選完才寫這一回合：畫面出現時這回合的日記還沒寫、AI還沒回", ev("state.log.length") === modalAt.logLen, [ev("state.log.length"), modalAt.logLen]);
  A.check("標題「○歲・選填志願」年齡照實際年齡顯示", new RegExp(`${ev("state.age")}歲・選填志願`).test(m.textContent) && /選擇你的科系/.test(m.textContent), m.textContent.slice(0, 60));
  m.querySelector(".mp-group").click();
  doc.getElementById("btn-major-confirm").click();
  await p; H.clickModals(g.win);
  A.check("選完後有科系與學生證，但還不是大學生（studentStatus不是enrolled，已錄取）", js("!!state.studentMajorGroup && !!state.studentDepartment && !!state.studentCard") && ev("state.studentStatus") !== "enrolled" && ev("majorAdmittedNotEnrolled(state)") === true, [ev("state.studentStatus")]);
  A.check("選完這一回合的日記有寫出來（不佔回合、不重複彈窗）", ev("state.log.length") === modalAt.logLen + 1 && !doc.getElementById("major-selection-modal"), ev("state.log.length"));

  // 續玩：期末考那回合送出畢業事件（6月），暑假標籤「準大一・暑假」，9月開學不再跳選系
  let sawGradRound = null, sawPrep = false, sawCollege = false, extraModal = false;
  for (let i = 0; i < 120 && !sawCollege; i++) {
    ev("state.ap.purchased=100000");
    await H.playTurn(g, null);
    if (doc.getElementById("major-selection-modal")) extraModal = true;
    const label = ev("computeTimeLabel(state)");
    if (/準大一・暑假/.test(label)) sawPrep = true;
    if (!sawGradRound && ev("state.milestones.graduation_highschool") === "completed" && ev("state.timeState.stageMode") === "highschool") {
      sawGradRound = { month: js("calAbsToDate(state.timeState.cal.lastRoundEnd).m"), seg: ev("state.timeState.segmentIndex") };
    }
    if (ev("state.timeState.stageMode") === "college") sawCollege = true;
  }
  A.check("高中畢業事件在高三下學期期末考那一回合（6月）就送出，不是9月", !!sawGradRound && sawGradRound.month === 6, sawGradRound);
  A.check("畢業後暑假的階段標籤是「準大一・暑假」", sawPrep);
  A.check("9月進大一：已是大學生、不再跳選系、學生證入學年齡改成實際入學年齡", sawCollege && ev("state.studentStatus") === "enrolled" && !extraModal && ev("state.studentCard.entryAge") === ev("state.age") && ev("state.pendingMajorSelection") === false);
  A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String));
}

// ================= 9.10 判斷條件與舊存檔 =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "ye88-due" });
  const ev = g.ev;
  await H.startNewLife(g);
  const abs = (y, m, d) => ev(`calDateToAbs(${y},${m},${d})`);
  const due = (over, win) => ev(`majorSelectionDue(Object.assign({}, state, {timeState:Object.assign({}, state.timeState, {prologue:false, stageMode:'highschool', yearInStage:3, segmentIndex:9})}, ${JSON.stringify(over)}), {half:'下學期', window:{start:${win}, end:${win}+5}})`);
  A.check("高三下學期4月：還不用選", due({ studentMajorGroup: null }, abs(2029, 4, 20)) === false);
  A.check("高三下學期5月第一回合：要選", due({ studentMajorGroup: null }, abs(2029, 5, 4)) === true);
  A.check("舊存檔：已過5月（暑假7月）還沒選系 → 下一回合補跳", due({ studentMajorGroup: null }, abs(2029, 7, 3)) === true);
  A.check("已經選過就不再跳", due({ studentMajorGroup: "理工資訊" }, abs(2029, 5, 4)) === false);
  A.check("高二的5月不跳（只有高三）", ev(`majorSelectionDue(Object.assign({}, state, {studentMajorGroup:null, timeState:Object.assign({}, state.timeState, {prologue:false, stageMode:'highschool', yearInStage:2})}), {half:'下學期', window:{start:${abs(2028, 5, 4)}, end:${abs(2028, 5, 9)}}})`) === false);
  A.check("已在念大學的舊存檔不受影響", ev(`majorSelectionDue(Object.assign({}, state, {studentMajorGroup:null, timeState:Object.assign({}, state.timeState, {prologue:false, stageMode:'college', yearInStage:1})}), {half:'下學期', window:{start:${abs(2029, 5, 4)}, end:${abs(2029, 5, 9)}}})`) === false);
  ev("state.timeState.stageMode='highschool'; state.timeState.yearInStage=3; state.milestones.graduation_highschool=null; state.studentMajorGroup=null; state.studentCard=null; advanceStageYear(state,'highschool',1)");
  A.check("跳過指令一路跨過5月沒選過系：9月進大一時在這裡補跳選系，並補送畢業事件", ev("state.pendingMajorSelection") === true && ev("state.studentStatus") === "enrolled" && ev("state.milestones.graduation_highschool") === "completed" && !!ev("state.graduationEventLog"));
  // 標籤
  A.check("highSchoolYearLabel：高三下學期的假期＝準大一，高三寒假與其他年級不變", ev("highSchoolYearLabel({yearInStage:3}, 13)") === "準大一" && ev("highSchoolYearLabel({yearInStage:3}, 6)") === "高三" && ev("highSchoolYearLabel({yearInStage:2}, 13)") === "高二" && ev("highSchoolYearLabel({yearInStage:3}, 9)") === "高三");
}

// ================= 9.10 雙主修自己選系 =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "ye88-dual" });
  const ev = g.ev, doc = g.win.document;
  g.win.__majorManual = true;
  await H.startNewLife(g, { name: "林以晴" });
  ev("enrollInDepartment(state,'理工資訊','資訊工程'); state.studentStatus='enrolled'; state.age=19; renderDualMajorOfferModal()");
  doc.querySelector('.dual-major-btn[data-key="apply"]').click();
  doc.getElementById("btn-dual-major-confirm").click();
  const m = doc.getElementById("major-selection-modal");
  A.check("選「申請雙主修」後接著跳出選系畫面（標題申請雙主修）", !!m && /申請雙主修/.test(m.textContent) && !doc.getElementById("dual-major-offer-modal"), m && m.textContent.slice(0, 40));
  const allDepts = [];
  for (const b of m.querySelectorAll(".mp-group")) {
    b.click();
    const n = +doc.getElementById("dept-counter").textContent.split("/")[1];
    for (let i = 0; i < n; i++) { allDepts.push(m.querySelector(".sid-front").textContent.replace(/\s+/g, " ")); doc.getElementById("btn-dept-next").click(); }
  }
  A.check("可選任何學群，但看不到與主修相同的系（資訊工程）", allDepts.length > 10 && !allDepts.some(t => /系別\s*資訊工程/.test(t)), allDepts.length);
  A.check("醫學、牙醫、獸醫（5年制）不能當雙主修", !allDepts.some(t => /系別\s*(醫學|牙醫|獸醫)/.test(t)));
  m.querySelector('.mp-group[data-key="藝術設計表演"]').click();
  const picked = m.querySelector(".sid-front dl").textContent.replace(/\s+/g, " ");
  doc.getElementById("btn-major-confirm").click();
  await sleep(10);
  A.check("確認後雙主修進行中、系名是玩家選的那一個、學生證加蓋雙主修章", ev("state.dualMajorStatus") === "active" && picked.includes(ev("state.dualMajorDepartment")) && ev("state.studentCard.stamps.some(x=>x.kind==='dual')") === true && !doc.getElementById("major-selection-modal"), [ev("state.dualMajorDepartment")]);
  A.check("主修沒有被雙主修選系動到", ev("state.studentDepartment") === "資訊工程" && ev("state.studentMajorGroup") === "理工資訊");
  ev("renderDualMajorOfferModal()");
  doc.querySelector('.dual-major-btn[data-key="decline"]').click();
  doc.getElementById("btn-dual-major-confirm").click();
  A.check("選「僅維持單一主修」不跳選系", !doc.getElementById("major-selection-modal"));
  A.check("放置期間代選（沒有指定系）仍由程式從4年制系別代選", (() => { ev("state.dualMajorStatus=null; state.dualMajorDepartment=null; resolveDualMajorOffer(state,'apply')"); return !!ev("state.dualMajorDepartment") && !ev("FIVE_YEAR_DEPARTMENTS.includes(state.dualMajorDepartment)"); })());
}

// ================= 八、8.8.5 嘗試新的延續 =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "ye88-try" });
  const ev = g.ev;
  await H.startNewLife(g);
  const js = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
  const seedOf = () => js("prepareInterestSeed(state, {key:'interest',items:[{key:'interest',interestCategory:null}]}, {})");
  ev("state.interestCandidates=[]; state.tryNewCont=null");
  const s1 = seedOf();
  A.check("沒有上一個項目：照原規則擲新種子，不是延續", s1 && s1.kind === "try_new" && !s1.continued, s1);
  ev(`recordTryNewContact(state, ${JSON.stringify(s1)}, {reaction:'positive'})`);
  const s2 = seedOf();
  A.check("上一個項目還是候選、反應不是負向 → 延續同一項目", s2.continued === true && s2.item === s1.item && s2.category === s1.category, [s1, s2]);
  A.check("延續時不改動『不連續同類』記錄", ev("state.interestSeedLast") === s1.category);
  ev(`recordTryNewContact(state, ${JSON.stringify(s2)}, {reaction:'neutral'})`);
  A.check("延續一次後計數＝1", ev("state.tryNewCont.conts") === 1, ev("state.tryNewCont.conts"));
  ev(`state.tryNewCont.lastReaction='negative'`);
  A.check("換新項目條件①：最近一次反應明顯負向", seedOf().continued !== true);
  ev(`state.tryNewCont.lastReaction='positive'; state.tryNewCont.conts=4`);
  A.check("換新項目條件③：延續滿4回合還沒成卡", seedOf().continued !== true);
  ev(`state.tryNewCont.conts=1; state.interestCandidates=[{id:'x',category:${JSON.stringify(s1.category)},item:${JSON.stringify(s1.item)},status:'candidate',investment:0,candidateProgress:1,positiveStreak:1}]`);
  A.check("候選卡階段仍可延續", seedOf().continued === true);
  ev(`state.interestCandidates[0].status='active'`);
  A.check("換新項目條件②：已成為正式興趣卡", seedOf().continued !== true);
  // 按鈕小字
  ev(`state.interestCandidates=[]; state.tryNewCont={category:'社交表演',item:'即興喜劇',conts:0,lastReaction:'positive'}`);
  A.check("tryNewContinuation 回傳延續的項目（供按鈕下方小字「繼續試試：即興喜劇」）", ev("tryNewContinuation(state).item") === "即興喜劇");
  ev("state.focus='interest'; state.focusInterestId='new'; render()");
  const hints = () => [...g.win.document.querySelectorAll(".focus-hint")].map(e => e.textContent).join("|");
  A.check("重心畫面：選到「嘗試新的」時小字寫「繼續試試：即興喜劇」", /繼續試試：即興喜劇/.test(hints()), hints());
  ev("state.tryNewCont=null; render()");
  A.check("沒有延續時小字回到原本說明", !/繼續試試/.test(hints()) && /下個場景可能在嘗試新的事物/.test(hints()), hints());
}

// ================= 8.8.5 玩家點名優先（假上游，旁白回報player_named） =================
{
  let override = () => ({});
  let lastPayload = null;
  H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => { lastPayload = p; return override(p); } }));
  const env = H.makeEnv();
  const g = await H.loadGame({ useMock: false, env, key: "ye88-named" });
  await H.startNewLife(g);
  const ev = g.ev;
  const js = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
  { const k = `ap:${H.loc("ye88-named")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
  ev(`state.interestCandidates=[{id:'c1',createdTurn:1,category:'社交表演',item:'即興喜劇',status:'candidate',investment:0,positiveStreak:0,candidateProgress:0,lastEngagedRound:0,sideBusinessOffered:false,sideBusinessStatus:null,selfDisciplineAwarded3:false,selfDisciplineAwarded6:false}]; state.tryNewCont={category:'手作工藝',item:'編織',conts:0,lastReaction:'positive'}; state.focus='interest'; state.focusInterestId='new'`);
  override = () => ({ interest_event: { category: "社交表演", item: "即興喜劇", reaction: "positive", player_named: true } });
  await H.playTurn(g, "我想找喜劇活動來參加");
  A.check("給旁白的資料帶 known_interests（以前接觸過的興趣清單）", Array.isArray(lastPayload.known_interests) && lastPayload.known_interests.some(x => x.item === "即興喜劇"), lastPayload.known_interests);
  A.check("給旁白的資料：嘗試新的仍有系統擲出（延續）的建議，供沒點名時使用", lastPayload.turn_focus.try_new_suggestion && lastPayload.turn_focus.try_new_suggestion.item === "編織" && lastPayload.turn_focus.try_new_suggestion.continued === true, lastPayload.turn_focus);
  const cards = js("state.interestCandidates");
  A.check("玩家點名：投入記到「即興喜劇」那張卡（有進度），沒有塞新的編織卡", cards.length === 1 && cards[0].item === "即興喜劇" && (cards[0].candidateProgress > 0 || cards[0].lastEngagedRound > 0), cards);
  A.check("玩家點名：種子作廢，延續記錄沒被動到", ev("state.tryNewCont.item") === "編織" && ev("state.tryNewCont.conts") === 0, ev("JSON.stringify(state.tryNewCont)"));
  // 沒有 player_named 時照種子
  override = () => ({ interest_event: { category: "社交表演", item: "即興喜劇", reaction: "positive" } });
  ev("state.focus='interest'; state.focusInterestId='new'");
  await H.playTurn(g, "繼續吧");
  const cards2 = js("state.interestCandidates");
  A.check("沒有點名：照系統擲出的種子（編織）建卡，延續計數＋1", cards2.some(c => c.item === "編織") && ev("state.tryNewCont.conts") === 1, [cards2.map(c => c.item), ev("state.tryNewCont.conts")]);
  A.check("工具定義與提示詞有 player_named / item / continued 的說明", !!TURN_RESULT_TOOL.input_schema.properties.interest_event.properties.player_named && /player_named/.test(TURN_SYSTEM_PROMPT) && /known_interests/.test(TURN_SYSTEM_PROMPT) && /continued/.test(TURN_SYSTEM_PROMPT));
  // 給旁白的資料：已錄取（5月選完到9月開學前）與住處
  ev(`enrollInDepartment(state,'藝術設計表演','視覺傳達設計'); state.studentStatus=null; state.timeState.stageMode='highschool'; state.dualMajorStatus='active'; state.dualMajorDepartment='護理'; state.focus='study'`);
  await H.playTurn(g, "認真讀書");
  const us = lastPayload.university_status;
  A.check("給旁白的資料：5月選完到9月前 university_status 帶 admitted、主修系名「視覺傳達設計系」、不寫成已經在上大學", us && us.admitted === true && us.major_department === "視覺傳達設計系" && /已錄取/.test(us.note), us);
  A.check("給旁白的資料：residence＝住家裡（學生時期）", lastPayload.residence === "住家裡", lastPayload.residence);
  ev(`state.studentStatus='enrolled'; state.timeState.stageMode='college'; state.timeState.yearInStage=1`);
  await H.playTurn(g, "去上課");
  const us2 = lastPayload.university_status;
  A.check("大學期間：university_status 以主修系名為主（major_department），雙主修只當次要資料", us2 && us2.major_department === "視覺傳達設計系" && us2.dual_major_department === "護理", us2);
  A.check("沒有前端錯誤（點名）", g.errors.length === 0, g.errors.map(String));
}

// ================= 十八、18.10.7 正文完整性檢查（直接測函式） =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "ye88-integ" });
  const ev = g.ev;
  await H.startNewLife(g);
  // 把狀態放到一個固定日期：上一回合新場景在 2027/10/2（週六），本回合範圍 10/4～10/9
  ev(`(()=>{ const cal=state.timeState.cal; cal.lastSceneDay = calDateToAbs(2027,10,2); state.promises=[]; })()`);
  const win = (a, b) => ({ start: ev(`calDateToAbs(2027,${a[0]},${a[1]})`), end: ev(`calDateToAbs(2027,${b[0]},${b[1]})`) });
  const W = win([10, 4], [10, 9]);
  const long = (n, seed = "窗外的風把窗簾吹起來一點，桌上的杯子還留著昨天的茶漬。") => seed.repeat(Math.ceil(n / seed.length)).slice(0, n * 2) ;
  const act = "你傳訊息約她放學後去合作社。" + long(60) + "她回了一個好，然後把書包甩上肩膀，你們一起走出教室。" + long(40);
  const nar = "隔天早上，天剛亮，你被樓下的機車聲吵醒。" + "走廊上的人漸漸多了起來，有人在討論昨晚的比賽，有人還在補作業，你把外套披上，慢慢走向教室後門。".repeat(3);
  const ok = { action_result: act, narrative: nar, choices: ["a", "b", "c", "d"] };
  // 2026-10-10（一、1.2.9.18.1）：改成三類——c1＝重寫、c3＝只記錄；舞台指示改由程式直接修(repairTurnText)
  ev("NARRATIVE_INTEGRITY_CHECK = true");
  const run = (r, extra = {}) => JSON.parse(ev(`JSON.stringify((()=>{ const o = classifyTurnOutput(${JSON.stringify(r)}, state, ${JSON.stringify(Object.assign({ window: W, actionText: "傳訊息約她放學後去合作社" }, extra))}); return { retry:o.c1.map(i=>i.code+"："+i.msg), log:o.c3.map(i=>i.code+"："+i.msg), fill:o.fillPromises }; })())`));
  // run()帶window時也會檢查新場景日期，測試用的正文固定填一個合法的scene_day_offset
  ok.scene_day_offset = 1;
  A.check("正常的正文不誤殺", run(ok).retry.length === 0 && run(ok).log.length === 0, run(ok));
  A.check("缺回應段（A5）→ 第1類", run({ ...ok, action_result: "" }).retry.some(x => /回應段缺漏/.test(x)));
  A.check("缺新場景（A5）→ 第1類", run({ ...ok, narrative: "" }).retry.some(x => /新場景缺漏/.test(x)));
  A.check("開場回合不要求回應段", run({ ...ok, action_result: "" }, { prologue: true }).retry.length === 0);
  A.check("回應段少於40字 → 第1類「過短」", run({ ...ok, action_result: "你傳了訊息約她去合作社。" }).retry.some(x => /^過短/.test(x)));
  A.check("新場景只有35字（第183回合）→ 第1類「過短」", run({ ...ok, narrative: "「深呼吸」這詞用在這裡好像誇張了點。" }).retry.some(x => /新場景太短/.test(x)));
  A.check("旁白評論自己用字 → 第3類、不重寫", (() => { const o = run({ ...ok, narrative: nar + "「深呼吸」這詞用在這裡好像誇張了點。" }); return o.log.some(x => /^評論用字/.test(x)) && o.retry.length === 0; })());
  A.check("「深呼吸」一般用詞照常可用", run({ ...ok, narrative: nar + "你深呼吸了一口氣。" }).log.length === 0);
  A.check("回應段沒寫到玩家選的動作（A1）→ 第3類「沒寫動作」", (() => { const o = run({ ...ok, action_result: "一個人在圖書館翻著厚厚的參考書，窗外的天色漸漸暗下來，管理員開始收拾推車。".repeat(4) }); return o.log.some(x => /^沒寫動作/.test(x)) && o.retry.length === 0; })());
  A.check("選項不足4個（A7）→ 第3類「選項3個」；結局回合不記", (() => { const o = run({ ...ok, choices: ["a", "b", "c"] }); return o.log.some(x => /^選項3個/.test(x)) && o.retry.length === 0 && run({ ...ok, choices: ["a", "b", "c"] }, { ending: true }).log.length === 0; })());
  // B 日期星期：星期、具體日期、倒數改第3類；大年初N／除夕仍第1類
  A.check("B1：回應段發生在週六（10/2），寫「週四傍晚」→ 第3類「星期」", (() => { const o = run({ ...ok, action_result: act + "週四傍晚的教室只剩你一個人。" }); return o.log.some(x => /^星期.*星期四/.test(x)) && o.retry.length === 0; })());
  A.check("B1：回應段寫「週六傍晚」沒問題；「上週四」「下週四」這類不算", run({ ...ok, action_result: act + "週六傍晚的教室只剩你一個人，上週四考的卷子還沒發。" }).log.length === 0);
  A.check("B1：新場景範圍10/4（週一）～10/9（週六）都有，寫「週三早上」沒問題", run({ ...ok, narrative: nar + "週三早上的雨沒停。" }).log.length === 0);
  A.check("B1/B2：短範圍（10/4～10/5）新場景寫「週五晚上」→ 第3類", run({ ...ok, scene_day_offset: 0, narrative: nar + "週五晚上的街燈亮了。" }, { window: win([10, 4], [10, 5]) }).log.some(x => /星期五/.test(x)));
  A.check("B4：編造日期「已讀，9/15」→ 第3類「日期」", run({ ...ok, narrative: nar + "訊息顯示已讀，9/15。" }).log.some(x => /^日期.*9\/15/.test(x)));
  A.check("B4：未來的約定日期「10/20」不記", run({ ...ok, narrative: nar + "你們約好10/20去看展。" }).log.length === 0);
  A.check("B5：「段考剩兩禮拜」→ 第3類「倒數」", run({ ...ok, narrative: nar + "段考剩兩禮拜，大家都開始緊張。" }).log.some(x => /^倒數/.test(x)));
  A.check("B5：模糊說法「段考越來越近」不記；7天內的倒數不記", run({ ...ok, narrative: nar + "段考越來越近了，段考只剩三天。" }).log.length === 0);
  // B3 春節：仍第1類
  const cny = ev("calLunarDates(2028).cny"); // 2028年春節（初一）的絕對日
  const cnyWin = { start: cny + 5, end: cny + 8 }; // 初六～初九
  ev(`state.timeState.cal.lastSceneDay = ${cny + 4}`);
  // 2026-10-10（1.2.9.18.1）：離檢查範圍14天以內改為第3類只記錄(節日附近)，超過才第1類重寫(節日)
  const nearOut = run({ ...ok, narrative: nar + "大年初二，家裡又擠滿了親戚。" }, { window: cnyWin });
  A.check("B3：新場景範圍是初六以後，寫「大年初二」（差4天）→ 第3類「節日附近」、不重寫", nearOut.retry.length === 0 && nearOut.log.some(x => /^節日附近.*大年初二/.test(x)), nearOut);
  const farWin = { start: cny + 30, end: cny + 33 }; // 離初二差28天以上
  ev(`state.timeState.cal.lastSceneDay = ${cny + 29}`);
  A.check("B3：範圍離初二超過14天，寫「大年初二」→ 第1類「節日」重寫", run({ ...ok, narrative: nar + "大年初二，家裡又擠滿了親戚。" }, { window: farWin }).retry.some(x => /^節日.*大年初二/.test(x)));
  const eveWin = { start: cny - 1 - 3, end: cny - 1 + 0 }; // 除夕前3天～除夕當天
  ev(`state.timeState.cal.lastSceneDay = ${cny - 5}`);
  A.check("B3：範圍含除夕當天，寫「除夕」→ 沒問題", run({ ...ok, narrative: nar + "今天是除夕，市場擠滿了人。" }, { window: eveWin }).retry.length === 0);
  const beforeEve = { start: cny - 1 - 5, end: cny - 1 - 3 }; // 除夕前5～3天
  ev(`state.timeState.cal.lastSceneDay = ${cny - 7}`);
  const eveNear = run({ ...ok, narrative: nar + "快到除夕了，媽媽開始準備年菜。" }, { window: beforeEve });
  A.check("B3：除夕在幾天後，寫「快到除夕了」→ 第3類「節日附近」、不重寫", eveNear.retry.length === 0 && eveNear.log.some(x => /^節日附近.*除夕/.test(x)), eveNear);
  const decWin = { start: ev("calDateToAbs(2027,12,10)"), end: ev("calDateToAbs(2027,12,13)") };
  ev(`state.timeState.cal.lastSceneDay = ${decWin.start - 1}`);
  A.check("B3：12月的場景提到隔年除夕（超過14天）→ 第1類「節日」", run({ ...ok, narrative: nar + "除夕要回外婆家，早點把車票訂好。" }, { window: decWin }).retry.some(x => /^節日.*除夕/.test(x)));
  A.check("B3：寫「大年初七」（範圍內）沒問題", run({ ...ok, narrative: nar + "大年初七，街上的店陸續開了。" }, { window: cnyWin }).retry.length === 0);
  ev(`state.timeState.cal.lastSceneDay = calDateToAbs(2027,10,2)`);
  // 約定（1.2.9.18.4）
  ev(`state.promises=[{id:'a1',character:'雅涵',content:'週六補慶生',dueAbs:${W.start + 1},status:'open',misses:0}]`);
  A.check("F1：約定到期、沒填promise_results、正文也沒交代 → 第1類「約定」", run(ok).retry.some(x => /^約定.*週六補慶生/.test(x)));
  A.check("F1：有交代（postponed）→ 通過", run({ ...ok, promise_results: [{ id: "a1", outcome: "postponed", new_due_date: "10/16" }] }).retry.length === 0);
  A.check("1.2.9.18.4：沒填欄位，但正文有「雅涵」＋「改天」→ 不重寫、程式代填", (() => { const o = run({ ...ok, narrative: nar + "雅涵傳訊息說補慶生改天再說。" }); return o.retry.length === 0 && o.fill.includes("a1"); })());
  A.check("1.2.9.18.4：只有名字沒有交代字眼 → 仍第1類", run({ ...ok, narrative: nar + "雅涵在走廊跟你揮了揮手。" }).retry.some(x => /^約定/.test(x)));
  A.check("F1：約定到期的回合寫「主角忘了約定」→ 第3類「忘約定」", run({ ...ok, promise_results: [{ id: "a1", outcome: "kept" }], narrative: nar + "你忘了跟雅涵約好的事，直到她傳訊息才想起來。" }).log.some(x => /^忘約定/.test(x)));
  ev("state.promises=[]");
  // 兩段重複（只記錄）
  const dupS = "你把那則訊息傳給了陳彥誠，問他今天晚上有沒有空一起把訂單的事情談清楚";
  const rd = run({ ...ok, action_result: act + dupS + "。", narrative: nar + dupS + "。" });
  A.check("第5點：同一件事兩段各寫一次 → 第3類「重複」，不重寫", rd.log.some(x => /各寫一次/.test(x)) && rd.retry.length === 0, rd);
  const rr = run({ ...ok, action_result: "我們到了KTV包廂，點了兩杯飲料就開始唱歌，唱到嗓子都啞了才停下來，你看著螢幕上的歌詞發呆。" + long(60), narrative: "我們到了KTV包廂，點了兩杯飲料就開始唱歌，唱到嗓子都啞了才停下來，你看著螢幕上的歌詞發呆。" + nar });
  A.check("第2點：新場景開頭重演回應段開頭 → 第3類", rr.log.some(x => /倒回/.test(x)) && rr.retry.length === 0, rr);
  ev("NARRATIVE_INTEGRITY_CHECK = false");
  // 半形逗號
  A.check("D2：中文字後面的半形逗號轉成全形，數字千分位與英文不動", ev(`fixHalfWidthPunct("你好,我是小明,價格是1,200 USD, ok, fine")`) === "你好，我是小明，價格是1,200 USD, ok, fine", ev(`fixHalfWidthPunct("你好,我是小明,價格是1,200 USD, ok, fine")`));
  A.check("D2：normalizeTurnResultText 兩段都處理", (() => { const r = JSON.parse(ev(`JSON.stringify(normalizeTurnResultText({action_result:["你好,世界"], narrative:["早安,今天"]}))`)); return r.action_result === "你好，世界" && r.narrative === "早安，今天"; })());
}

// ================= D1 簡體字混入（Worker簡轉繁） =================
{
  const cases = [["手里拿着手机，怎么确认赶完语气", "手裡拿著手機，怎麼確認趕完語氣"], ["他住在里长家，走了三公里", "他住在里長家，走了三公里"], ["茶几上有咖啡", "茶几上有咖啡"], ["心里想着这里的事", "心裡想著這裡的事"]];
  cases.forEach(([a, b]) => A.check(`D1 簡轉繁：「${a}」`, toTaiwanTraditional(a) === b, toTaiwanTraditional(a)));
}

// ================= 一、1.2.21／1.2.22 健康原因、住處、提示詞 =================
{
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "ye88-health" });
  const ev = g.ev;
  await H.startNewLife(g);
  const html = ev(`renderStatChanges({health:-2}, undefined, "感冒")`);
  A.check("1.2.21：健康下降且有原因 → 「健康 -2（感冒）」", /健康 -2（感冒）/.test(html), html);
  A.check("1.2.21：沒有原因時照舊只顯示數字；上升時不帶原因", /健康 -2<\/span>/.test(ev(`renderStatChanges({health:-2})`)) && !/（/.test(ev(`renderStatChanges({health:2}, undefined, "感冒")`)));
  A.check("1.2.21：工具定義有 health_reason，提示詞有不得自行發明病症的規則", !!TURN_RESULT_TOOL.input_schema.properties.health_reason && /不得寫會持續、需要就醫/.test(TURN_SYSTEM_PROMPT));
  A.check("1.2.22：提示詞有住處規則（residence）", /residence/.test(TURN_SYSTEM_PROMPT) && /不得自行改變/.test(TURN_SYSTEM_PROMPT));
  A.check("18.10.7／18.13：提示詞有對話講完、約500字、不評論用字、不得讓主角忘記約定", /約500字/.test(TURN_SYSTEM_PROMPT) && /不評論自己的用字/.test(TURN_SYSTEM_PROMPT) && /不得自行讓主角忘記約定/.test(TURN_SYSTEM_PROMPT));
  A.check("名冊：同住的家人標「（同住）」（C2）", (() => { ev(`state.characters=[{name:'阿翔',relation:'弟弟',gender:'男',cohabiting:true,affinity:60,active:true}]`); return /阿翔｜男｜.*（同住）/.test(ev(`buildCharacterRoster(state)[0]`)); })(), ev("buildCharacterRoster(state)[0]"));
}

// ================= E2 學生期花費不重複扣款 =================
{
  let override = () => ({});
  H.installUpstream(H.makeFakeAnthropic({ turnOverride: () => override() }));
  const env = H.makeEnv();
  const g = await H.loadGame({ useMock: false, env, key: "ye88-e2" });
  await H.startNewLife(g);
  const ev = g.ev;
  { const k = `ap:${H.loc("ye88-e2")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
  ev(`state.studentExpense = Object.assign(studentExpenseState(state), {resultNow:{event:'社團活動',kind:'trip',bought:true,spent:90}}); state.cash=500`);
  override = () => ({ one_time_transaction: [{ label: "寫生小旅行", amount: -4 }, { label: "買咖啡", amount: -3 }] });
  await H.playTurn(g, "去社團");
  const flags = JSON.parse(ev("JSON.stringify(state.reviewFlags||[])"));
  A.check("E2：社團活動已扣，AI另外回報的『寫生小旅行−4』不入帳並寫錯誤紀錄；不相干的『買咖啡−3』照常", flags.some(f => f.kind === "student_expense_duplicate" && /寫生小旅行/.test(f.detail)) && !flags.some(f => /買咖啡/.test(f.detail)), flags);
}

process.exit(A.report() ? 0 : 1);
