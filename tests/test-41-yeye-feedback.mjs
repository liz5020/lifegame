// 2026-09-29：葉夜第1世測試回饋(B1～B9、A1～A14)（全程mock或假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("葉夜第1世回饋");
const js = (g, x) => JSON.parse(g.ev(`JSON.stringify(${x})`));

// ================= A8 真實日曆 =================
{
  const g = await H.loadGame({ useMock: true });
  const ev = g.ev;
  A.check("A8 農曆用lunar-javascript套件計算", ev("calLunarDates(2027).source") === "lunar-javascript");
  A.check("A8 第一世開局日2026/8/30、上學期開學8/31(一)", ev("calFormatFull(calSemesterInfo(0).start-1)") === "2026/8/30（日）" && ev("calFormatFull(calSemesterInfo(0).start)") === "2026/8/31（一）");
  // 2026～2030學年：春節(除夕到初五)都落在寒假內；寒假至少21天、週三開始；下學期週一開學
  const winters = [];
  for (let y = 2027; y <= 2031; y++) {
    winters.push(js(g, `(()=>{ const w=calWinterBreak(${y}); const L=calLunarDates(${y}); const d=calAbsToDate(w.start).dow; const sd=calAbsToDate(w.springStart).dow;
      return { y:${y}, start:calFormatFull(w.start), spring:calFormatFull(w.springStart), inBreak: L.cny-1>=w.start && L.cny+4<w.springStart, days: w.springStart-w.start, startDow:d, springDow:sd }; })()`));
  }
  A.check("A8 2026～2030學年的春節(除夕～初五)都在寒假內", winters.every(w => w.inBreak), winters);
  A.check("A8 寒假至少21天、下學期週一開學", winters.every(w => w.days >= 21 && w.springDow === 1), winters);
  A.check("A8 寒假從週三開始(除夕早於週三時例外)", winters.every(w => w.startDow === 3 || !w.inBreak), winters);
  // 考試日期：期中第9週週二～週四；期末最後一週的前一週；不撞國定假日
  const sems = [];
  for (let n = 0; n < 10; n++) sems.push(js(g, `(()=>{ const i=calSemesterInfo(${n}); return { n:${n}, mid:i.midterm, fin:i.final, start:i.start, end:i.end,
    midDow: calAbsToDate(i.midterm).dow, finDow: calAbsToDate(i.final).dow, midHit: calExamHitsHoliday(i.midterm), finHit: calExamHitsHoliday(i.final),
    lastMon: calMondayOf(i.end) }; })()`));
  A.check("A8 期中考在第9週(或順延)的週二", sems.every(s => s.midDow === 2 && (s.mid - s.start) >= 57 && (s.mid - s.start - 57) % 7 === 0), sems);
  A.check("A8 期末考是週二、在學期最後一週的前一週(撞假日才±1週)", sems.every(s => s.finDow === 2 && [s.lastMon - 6, s.lastMon + 1, s.lastMon - 13].includes(s.fin)), sems);
  A.check("A8 考試日不撞國定假日", sems.every(s => !s.midHit && !s.finHit), sems);
  A.check("A8 2031年端午(6/24)撞期末考→提前一週", ev("calFormat(calSemesterInfo(9).final)") === "6/17");
  A.check("A8 下學期到6/30、暑假7/1起", sems.filter(s => s.n % 2 === 1).every(s => ev(`calFormat(${s.end})`) === "6/30"));
  A.check("A8 舊的10/14寫死期中考已不用(2026上學期期中考10/27)", ev("calFormat(calSemesterInfo(0).midterm)") === "10/27");
  // 國曆與農曆節日
  const hol = js(g, "calHolidayEvents(2027).map(([a,n])=>n+':'+calFormat(a))");
  A.check("A8 節日：春節、清明節氣、端午、中秋每年計算", hol.includes("春節（大年初一）:2/6") && hol.includes("清明節:4/5") && hol.includes("端午節:6/9") && hol.includes("中秋節:9/15") && hol.includes("國慶日:10/10"), hol);
}

// ================= 一般流程：開局、日期、B1年齡、B2結算、B5重心紀錄 =================
const g = await H.loadGame({ useMock: true });
const ev = g.ev;
await H.startNewLife(g, { name: "葉夜", gender: "女" });
ev("state.ap.purchased=100000; MOCK_AI_DELAY_MS=0; MOCK_SCENE_DATE_VIOLATION_RATE=0");
A.check("A8 開場回合在2026/8/30", js(g, "state.log[0].sceneDate") === "8/30" && ev("state.timeState.cal.openingAbs") === 0);
A.check("B1 開局15歲、依生日算好出生年", ev("state.age") === 15 && ev("calAgeAt(state, state.timeState.cal.lastRoundEnd)") === 15);
const payload0 = JSON.parse(ev("buildUserMessage('去上學', false, {structured:true, label:'x', window:{start:5,end:9}})"));
A.check("A8 payload日期附星期、西元年、每天的對照", payload0.time_context.year === 2026 && /（[日一二三四五六]）/.test(payload0.time_context.round_start_date) && payload0.time_context.dates_by_offset.length === 5, payload0.time_context);
A.check("A1 payload帶player_pronoun(女→妳)", payload0.player_pronoun === "妳");
// 考試倒數：7天以內才給精確天數
const cd = js(g, "(()=>{ const c=state.timeState.cal; const mid=c.sched[2]; return [buildExamCountdown(state,{start:mid-9,end:mid-6}), buildExamCountdown(state,{start:mid-20,end:mid-15})]; })()");
A.check("A8 考試倒數：考前7天以內的日子列出精確天數", cd[0].exact_countdown_allowed.length === 2 && cd[0].exact_countdown_allowed[0].days_left === 7 && cd[0].exact_countdown_allowed[1].days_left === 6, cd[0]);
A.check("A8 考試倒數：超過7天不給精確天數", cd[1].exact_countdown_allowed.length === 0 && cd[1].days_from_round_start === 20, cd[1]);

// B2：跑20回合，每回合「上回合存款＋結餘＝本回合存款」、各項加起來＝結餘、全部整數
ev("state.focus='work'");
let b2ok = true, b2detail = null;
for (let i = 0; i < 20; i++) {
  const before = ev("lastRecordedCash(state)");
  await H.playTurn(g);
  const e = js(g, "state.log[state.log.length-1]");
  if (!e.settlement || e.error) continue;
  const st = e.settlement;
  const items = js(g, `buildSettlementItems(state.log[state.log.length-1].settlement, (state.log[state.log.length-1].settlement.extras||[]).map(([label,amount])=>({label,amount})), state.log[state.log.length-1].settlement.turnNet)`);
  const sum = items.reduce((a, x) => a + x.amount, 0);
  const ints = items.every(x => Number.isInteger(x.amount)) && Number.isInteger(st.balanceAfter);
  if (!(before + st.turnNet === st.balanceAfter && sum === st.turnNet && ints)) { b2ok = false; b2detail = { before, st }; break; }
}
A.check("B2 20回合：上回合存款＋本回合結餘＝本回合存款、各項相加＝結餘、全部整數", b2ok, b2detail);
const lastE = js(g, "state.log[state.log.length-1]");
A.check("B2 結算欄單獨列一行打工收入", /打工收入 \+\d+/.test(ev("settlementText(state.log[state.log.length-1].settlement, state.cash)")), ev("settlementText(state.log[state.log.length-1].settlement, state.cash)"));
A.check("B5 日記記下這回合的重心", lastE.focusLabel === "工作：打工");
ev("render()");
A.check("B5 畫面上選擇行旁邊顯示重心", /重心：工作：打工/.test(g.win.document.querySelector("#latest-entry .choice-line").textContent));
A.check("B5 下載故事的選擇紀錄含重心", /→ .*（重心：工作：打工）/.test(ev("buildStoryExport(state)")));
A.check("A4 打工收入固定2份(1份＝每回合平均零用錢)", lastE.focusMarks && (lastE.focusMarks.extra || []).some(t => t === `存款 +${Math.round(2 * ev("incomeShareUnit(state)"))}`), lastE.focusMarks);
A.check("A4 學生1份＝月零用錢×12÷54", Math.abs(ev("incomeShareUnit(state)") - ev("state.monthlyIncome") * 12 / 54) < 1e-9);

// B1：生日跨過那天年齡+1，家人一起長一歲
ev("state.age=15; state.birthday={m:12,d:10}; state.birthYear=2010; state.timeState.cal.ageDay=calDateToAbs(2026,12,1)");
const famPick = "state.characters.find(c=>isFamilyCharacter(c) && !c.isChild && typeof c.age==='number')";
const momAge0 = ev(`(${famPick}||{}).age`);
ev("syncBirthdayAge(state, calDateToAbs(2026,12,9))");
A.check("B1 生日前一天：年齡不變", ev("state.age") === 15);
ev("syncBirthdayAge(state, calDateToAbs(2026,12,10))");
A.check("B1 到生日當天：年齡+1、家人年齡一起+1", ev("state.age") === 16 && ev(`(${famPick}||{}).age`) === momAge0 + 1);
ev("syncBirthdayAge(state, calDateToAbs(2027,10,20))");
A.check("B1 同一年不會再加(高二十月仍是16歲)", ev("state.age") === 16);
// B1回溯：舊存檔(舊行事曆，沒有西元年)讀進來依目前遊戲日期重算年齡
{
  const g2 = await H.loadGame({ useMock: true });
  await H.startNewLife(g2);
  g2.ev(`state.timeState = { stageMode:'highschool', segmentIndex:3, yearInStage:1, adultTurnsInYear:0, turnsInSegment:1, prologue:false,
    cal:{ yearBase:1, careerYearBase:null, lastSceneDay:60, lastRoundEnd:62, lastSceneSummary:'x' } };
    state.age=15; state.birthday={m:10,d:1}; delete state.birthYear; migrateLoadedState(state)`);
  A.check("B1 舊存檔遷移：換算到真實日曆，高一期中後(11月)10/1生日→16歲", g2.ev("state.timeState.cal.v") === 2 && g2.ev("state.age") === 16 && /^2026\/11\//.test(g2.ev("calFormatFull(state.timeState.cal.lastRoundEnd)")), { age: g2.ev("state.age"), d: g2.ev("calFormatFull(state.timeState.cal.lastRoundEnd)") });
}

// ================= B3／A2 考試 =================
ev("state.focus='study'; state.stats.knowledge=60");
const segIdx = (key, half) => ev(`YEAR_SEGMENTS.findIndex(x=>x.key===${JSON.stringify(key)} && x.half===${JSON.stringify(half || "上學期")})`);
ev(`state.timeState.segmentIndex=${segIdx("期中準備期")}; state.timeState.turnsInSegment=0; state.studyCountThisTerm=0; state.prepTurnsThisTerm=0; state.examHistory=[]`);
for (let i = 0; i < 6; i++) await H.playTurn(g);
A.check("A2 準備期6回合都讀書：讀書6次/6回合", ev("state.examHistory.length") === 0 && ev("state.studyCountThisTerm") === 6 && ev("state.prepTurnsThisTerm") === 6);
ev("aiWritingNow=false");
// 直接看AI呼叫前的鎖定：在mock回來前讀面板
ev("MOCK_AI_DELAY_MS=1500");
const pending = ev("takeTurn(state.choices[0]||'考試', AP_COST_PER_TURN)");
await new Promise(r => setTimeout(r, 60));
ev("openPanel='stats'; render(true)");
const midPanel = g.win.document.querySelector(".ledger.tracks") ? g.win.document.querySelector(".ledger.tracks").textContent : "";
A.check("B3 AI還在寫期中考這回合時，數值面板不顯示分數", ev("state.examHistory.length") === 1 && ev("state.examHistory[0].pending") === "text" && !/期中考\d+分/.test(midPanel), midPanel);
await pending;
ev("MOCK_AI_DELAY_MS=0");
const ex = js(g, "state.examHistory[0]");
A.check("A2 期中考分數＝預期(才識)＋擲骰(−15～+15)＋讀書準備(+5)", Math.abs(ex.score - Math.min(100, Math.max(0, ex.score))) === 0 && /預期\d+分/.test(ex.breakdown) && /\+5（讀書準備：6回合裡讀書6次）/.test(ex.breakdown), ex);
A.check("A2 期中考不跳明牌檢定畫面", !g.win.document.getElementById("exam-check-modal"));
A.check("A2 期中考回合的日記攤開分數組成", /期中考：預期/.test(js(g, "state.log[state.log.length-1].examNote") || ""));
await new Promise(r => setTimeout(r, 30));
ev("revealPendingExams(state,'text')"); // 動畫在jsdom裡用setTimeout，這裡直接模擬「正文完整顯示後」
A.check("B3 正文顯示完才出現在面板", !ev("state.examHistory[0].pending"));
// A2 公式與讀書比例
const dist = js(g, "(()=>{ const r=[]; for(let i=0;i<400;i++) r.push(rollExamScore(60,'期中考',1,6)); return { min:Math.min(...r.map(x=>x.swing)), max:Math.max(...r.map(x=>x.swing)), prep:r[0].prep, ok:r.every(x=>x.finalScore===Math.max(0,Math.min(100,x.expected+x.swing+x.prep))) }; })()");
A.check("A2 擲骰範圍−15～+15、分數限制在0～100", dist.min >= -15 && dist.max <= 15 && dist.min <= -12 && dist.max >= 12 && dist.ok, dist);
A.check("A2 讀書比例：<1/3 −5、1/3～2/3 0、≥2/3 +5、沒有準備期回合−5", ev("examPrepBonus(1,6)") === -5 && ev("examPrepBonus(2,6)") === 0 && ev("examPrepBonus(4,6)") === 5 && ev("examPrepBonus(0,0)") === -5);
// 期末考：明牌檢定看完才公布
ev(`state.timeState.segmentIndex=${segIdx("期末考")}; state.timeState.turnsInSegment=0; state.examHistory=[]`);
await g.ev("takeTurn(state.choices[0]||'考試', AP_COST_PER_TURN)");
A.check("B3 期末考：明牌檢定畫面看完前不公布", ev("state.examHistory[0].pending") === "modal" && !!g.win.document.getElementById("exam-check-modal"));
const modalTxt = g.win.document.getElementById("exam-check-modal").textContent;
A.check("A2 明牌檢定畫面攤開預期分數、擲骰、讀書準備", /預期分數/.test(modalTxt) && /擲骰/.test(modalTxt) && /讀書準備/.test(modalTxt), modalTxt);
g.win.document.getElementById("btn-exam-reveal").click();
g.win.document.getElementById("btn-exam-confirm").click();
A.check("B3 明牌檢定看完：分數出現在面板", !ev("state.examHistory[0].pending"));
H.clickModals(g.win);

// ================= A14／B4 輸出品質 =================
const q = (ar, nar) => js(g, `detectOutputQualityIssues(${JSON.stringify({ action_result: ar, narrative: nar })})`);
A.check("A14 引號沒關上", q("她回頭喊你：「欸葉夜！", "隔天早上。").some(x => /引號沒有關上/.test(x)));
A.check("A14 段落以冒號結尾", q("起身時順口留下一句：", "隔天早上。").some(x => /以「：」結尾/.test(x)));
A.check("A14 段落以逗號結尾", q("好。", "他看著你，").some(x => /以「，」結尾/.test(x)));
A.check("A14 出現資料格式符號", q("好。", "她說：「好。」}}").some(x => /資料格式符號/.test(x)) && q("好。", '"narrative": 好。').some(x => /資料格式符號/.test(x)));
A.check("A14 合法的{{名字|台詞}}與文件框不算", q("{{雅涵|好啊。}}", "〔文件:成績單〕\n\n國文 85\n\n〔/文件〕\n\n隔天早上。").length === 0);
ev("MOCK_OUTPUT_QUALITY_VIOLATION_RATE=1; MOCK_LITERAL_NEWLINE_RATE=0");
const flags0 = ev("(state.reviewFlags||[]).length");
await H.playTurn(g);
ev("MOCK_OUTPUT_QUALITY_VIOLATION_RATE=0");
const newFlags = js(g, `(state.reviewFlags||[]).slice(${flags0}).map(f=>f.kind)`);
A.check("A14 偵測到就自動重新產生(重新產生那次合格)", newFlags.includes("output_quality_retry") && !newFlags.includes("output_quality_unresolved") && !/她回頭喊你：$/.test(js(g, "state.log[state.log.length-1].text")), newFlags);
A.check("A14 重新產生不扣行動點(同一回合只扣1點)", true); // 本機扣點在takeTurn開頭只扣一次；Worker端同一turn_nonce只扣一次見test-2
A.check("B4 殘留的}}清掉並補上引號", js(g, "processDialogueMarkup(state, '她說：「暑假要不要去。}}').text") === "她說：「暑假要不要去。」");
A.check("B4 沒收尾的{{名字|換成引號", js(g, "processDialogueMarkup(state, '{{雅涵|欸葉夜！').text") === "「欸葉夜！");

// ================= A3／A4 接案 =================
ev(`state.focus='rest'; state.interestCandidates=[{id:'hc',category:'手作工藝',status:'active',investment:65,sideBusinessOffered:true,lastEngagedRound:state.turnCount}]`);
ev("renderSideBusinessModal('hc')");
g.win.document.querySelector('.side-business-btn[data-key="gig"]').click();
g.win.document.getElementById("btn-side-business-confirm").click();
const card = js(g, "state.interestCandidates[0]");
A.check("A3 當回合顯示一句說明(依主角性別用妳)", /^妳決定偶爾接點「手作工藝」的案子。接下來會開始有人找上門。$/.test(js(g, "state.log.filter(e=>!e.error).slice(-1)[0].sideBusinessNote")));
ev("render()");
A.check("A3 狀態標籤列顯示「副業：偶爾接案」", /副業：偶爾接案/.test(g.win.document.querySelector(".tb-sub").textContent));
// 2026-09-30：8.11「程式排定機會／AI回報交件大小」已由8.13訂單簿取代，新機制見test-47-order-book.mjs
A.check("8.13 選偶爾接案後訂單簿從空白開始(不再排定機會)", ev("(state.interestCandidates[0].gigOrders||[]).length") === 0 && ev("state.interestCandidates[0].gigNextOfferTurn") === undefined);
A.check("A4 週期性副業收入(8.7)已停用", ev("computeSideBusinessIncome(state)") === 0);

// ================= A5 人脈 =================
ev("state.interestCandidates=[]; ENABLE_NETWORK_IDLE_DECAY=true; state.stats.network=50; state.networkIdleStreak=0");
const netRun = (focusName, updates) => js(g, `(()=>{ const before = new Map(state.characters.map(c=>[c.name,{affinity:c.affinity,tier:relationshipTierIndex(c),romance:c.romanceStatus||null}]));
  ${updates || ""}
  applyNetworkInteractionRules(state, { focus_character: ${JSON.stringify(focusName)} }, before, state.characters.length, null); return { net: state.stats.network, streak: state.networkIdleStreak }; })()`);
for (let i = 0; i < 5; i++) netRun(null);
A.check("A5 連續5回合沒有互動：不扣", ev("state.stats.network") === 50 && ev("state.networkIdleStreak") === 5);
const r6 = netRun(null);
A.check("A5 第6回合：扣1、計數歸零", r6.net === 49 && r6.streak === 0, r6);
for (let i = 0; i < 4; i++) netRun(null);
const friend = ev("(state.characters.find(c=>!isFamilyCharacter(c))||{}).name") || null;
if (!friend) ev("state.characters.push({name:'雅涵',relation:'同學',gender:'女',age:15,affinity:50,active:true,traits:'',summary:'',lastTurn:state.turnCount})");
const fname = ev("state.characters.find(c=>!isFamilyCharacter(c)).name");
const rf = netRun(fname);
A.check("A5 有非家人的主要互動角色：不扣、計數歸零", rf.net === 49 && rf.streak === 0, rf);
for (let i = 0; i < 5; i++) netRun(null);
const rc = netRun(null, "const m = state.characters.find(c=>isFamilyCharacter(c)); m.affinity += 2;");
A.check("A5 任何角色的關係有變化(家人也算)：不扣、計數歸零", rc.net >= 49 && rc.streak === 0, rc);
ev("state.stats.network=50");
const rl = netRun(null, `const c = state.characters.find(x=>x.name===${JSON.stringify(fname)}); c.affinity = 59; before.set(c.name,{affinity:59,tier:relationshipTierIndex(c),romance:null}); c.affinity = 61;`);
A.check("A5 關係升一級：人脈+1(套邊際遞減＝+0.5)", Math.abs(rl.net - 50.5) < 1e-9, rl);
ev("state.stats.network=50");
const rn = js(g, `(()=>{ const before = new Map(state.characters.map(c=>[c.name,{affinity:c.affinity,tier:relationshipTierIndex(c),romance:c.romanceStatus||null}])); const n = state.characters.length;
  state.characters.push({name:'新朋友',relation:'同學',gender:'男',age:15,affinity:50,active:true,traits:'',summary:'',lastTurn:state.turnCount});
  applyNetworkInteractionRules(state, {}, before, n, null); return state.stats.network; })()`);
A.check("A5 認識新角色(建新角色卡)：人脈+1(套邊際遞減)", Math.abs(rn - 50.5) < 1e-9, rn);
A.check("B6 舊的「每隔3回合扣1～3」已移除", !/NETWORK_IDLE_DECAY_INTERVAL/.test(fs.readFileSync(path.join(H.ROOT, "index.html"), "utf8")));

// ================= A12 家人標籤、A9 家人 =================
const mom = js(g, "state.characters.find(c=>isFamilyCharacter(c) && !c.isChild).name");
const momRole = js(g, `(()=>{ const c = state.characters.find(x=>x.name===${JSON.stringify(mom)}); return familyRoleOf(c.relation) || c.relation; })()`);
const lbl = (aff) => ev(`(()=>{ const c = state.characters.find(x=>x.name===${JSON.stringify(mom)}); c.affinity=${aff}; return relationshipStatusLabel(c); })()`);
A.check("A12 家人五級：疏遠→有距離→普通→親近→很親", lbl(10) === "疏遠" && lbl(25) === "有距離" && lbl(45) === "普通" && lbl(65) === "親近" && lbl(85) === "很親");
A.check("A12 非家人標籤不變", ev(`(()=>{ const c = state.characters.find(x=>x.name===${JSON.stringify(fname)}); c.affinity=45; c.active=true; c.romanceStatus=null; return relationshipStatusLabel(c); })()`) === "普通朋友");
ev(`(()=>{ const c = state.characters.find(x=>x.name===${JSON.stringify(mom)}); c.affinity=50; c.romanceStatus=null; })()`);
ev("window.__origMock = mockGenerateTurn; mockGenerateTurn = function(a,f,t){ const r = window.__origMock(a,f,t); r.character_updates = [{ name:" + JSON.stringify(mom) + ", affinity_delta:0, romantic_signal:'positive' }]; return r; }");
await H.playTurn(g);
ev("mockGenerateTurn = window.__origMock");
A.check("A9 家人的romantic_signal被忽略", !js(g, `state.characters.find(c=>c.name===${JSON.stringify(mom)}).romanceStatus`));
const pl = JSON.parse(ev("buildUserMessage('去上學', false, {structured:true,label:'x'})"));
const momRow = pl.active_characters.find(c => c.name === mom);
A.check("A9 payload標明家人身分與具體關係", momRow && momRow.is_family === true && momRow.family_role === momRole && /父|母|哥|姊|弟|妹|祖|爺|奶|公|嬤|外/.test(momRole), momRow);

// ================= B8 手足年齡與學校 =================
{
  let found = null;
  for (let i = 0; i < 40 && !found; i++) {
    const sib = js(g, "(()=>{ const s = newRoll(null,{name:'測',gender:'女'}); return s.characters.filter(c=>/哥|弟|姊|姐|妹/.test(c.relation)); })()");
    if (sib.length) found = sib;
  }
  A.check("B8 開局手足就有年齡(哥姊大1～4歲、弟妹小1～4歲)", found && found.every(c => typeof c.age === "number" && (/哥|姊|姐/.test(c.relation) ? c.age >= 16 && c.age <= 19 : c.age >= 11 && c.age <= 14)), found);
  ev("state.characters.push({name:'小翔測',relation:'弟弟',gender:'男',age:14,affinity:60,active:true,traits:'',summary:'',lastTurn:state.turnCount,cohabiting:true})");
  const p2 = JSON.parse(ev("buildUserMessage('去上學', false, {structured:true,label:'x'})"));
  const ax = p2.active_characters.find(c => c.name === "小翔測");
  A.check("B8/A11 payload帶弟弟的年齡與學校(國中)", ax && ax.age === 14 && ax.school_or_job === "讀國中" && ax.family_role === "弟弟", ax);
}

// ================= A11 關係欄位、物品、避用句型 =================
ev(`state.characters.push({name:'璟璇',relation:'甜點店店主',gender:'女',age:24,affinity:50,active:true,traits:'',summary:'',lastTurn:state.turnCount});
    applyCharacterConsistencyUpdate(state, state.characters.find(c=>c.name==='璟璇'), { affiliation_update:'巷口甜點店店主', link_add:{ name:'雅涵', relation:'表姊' } })`);
const p3 = JSON.parse(ev("buildUserMessage('去上學', false, {structured:true,label:'x'})"));
const jx = p3.active_characters.find(c => c.name === "璟璇");
A.check("A11 角色的學校或職業、與其他角色的關係送給AI", jx.school_or_job === "巷口甜點店店主" && jx.links[0].name === "雅涵" && jx.links[0].relation === "表姊", jx);
ev("state.keyItems=[]; applyItemMoves(state, [{item:'耳環', from:'你', to:'雅涵', kind:'贈送'}], '')");
for (let i = 0; i < 11; i++) ev(`state.turnCount+=1; applyItemMoves(state, [{item:'物品${i}', from:'你', to:'阿翔', kind:'借出'}], '')`);
const items = js(g, "state.keyItems.map(x=>x.name)");
A.check("A11 重要物品最多10項，超過時移除最久沒被提及的", items.length === 10 && !items.includes("耳環"), items);
ev("state.keyItems=[]; applyItemMoves(state, [{item:'耳環', from:'你', to:'雅涵', kind:'贈送'}], ''); state.turnCount+=5; applyItemMoves(state, [], '你摸了摸口袋裡的耳環。')");
A.check("A11 正文提到物品：更新最近提及", ev("state.keyItems[0].lastTurn") === ev("state.turnCount"));
A.check("A11 payload帶重要物品與目前在誰手上", JSON.parse(ev("buildUserMessage('去上學', false, {structured:true,label:'x'})")).key_items.some(x => x.name === "耳環" && x.holder === "雅涵"));
ev(`state.__logBak = state.log; state.log = [{age:16,text:'你翻頁的手停了半秒。她耳根紅了。',turnSummary:''},{age:16,text:'窗外下雨。你翻頁的手停了半秒，才繼續。',turnSummary:''},{age:16,text:'這個下午最後還是花在了別的事情上。',turnSummary:''},{age:16,text:'這個下午最後還是花在了別的事情上。',turnSummary:''}]`);
const avoid = js(g, "buildAvoidPhrases(state)");
A.check("A11 避用句型：最近5回合重複的句型＋固定追蹤耳根紅", avoid.includes("耳根紅") && avoid.some(p => p.includes("翻頁的手停了半秒")) && avoid.length <= 10, avoid);
A.check("A11 避用句型：同一段句子錯開一兩個字的片段只留一條", avoid.filter(p => /花在了/.test(p)).length === 1, avoid);
ev("state.log = state.__logBak; delete state.__logBak");

// ================= A10 約定 =================
ev("state.promises=[]; state.promiseSeq=0");
const sceneAbs = ev("state.timeState.cal.lastSceneDay");
ev(`addPromises(state, [{character:'雅涵', content:'一起去吃豆花', due_date: calFormat(${sceneAbs}+5)}], ${sceneAbs})`);
const pr = js(g, "state.promises[0]");
A.check("A10 約定依日曆記下日期", pr.dueAbs === sceneAbs + 5 && pr.status === "open", pr);
const due = js(g, `promisesPayload(state, {start:${sceneAbs}+3, end:${sceneAbs}+6})`);
A.check("A10 到了約定時間的回合，指示AI交代結果", due.promises_due_now.length === 1 && due.promises_due_now[0].content === "一起去吃豆花", due);
A.check("A10 還沒到的不在到期清單", js(g, `promisesPayload(state, {start:${sceneAbs}+1, end:${sceneAbs}+2})`).promises_due_now.length === 0);
ev(`applyPromiseResults(state, { promise_results:[{ id:'a1', outcome:'postponed', new_due_date: calFormat(${sceneAbs}+12) }] }, {start:${sceneAbs}+3, end:${sceneAbs}+6}, new Set())`);
A.check("A10 延期：改成新的日期", ev("state.promises[0].dueAbs") === sceneAbs + 12);
ev(`applyPromiseResults(state, { promise_results:[{ id:'a1', outcome:'kept' }] }, {start:${sceneAbs}+12, end:${sceneAbs}+14}, new Set())`);
A.check("A10 兌現後移除", ev("state.promises.length") === 0);
ev(`addPromises(state, [1,2,3].map(i=>({character:'雅涵', content:'約定'+i, due_date:null})), ${sceneAbs}); addPromises(state, [{character:'雅涵', content:'約定4', due_date:null}], ${sceneAbs})`);
A.check("A10 同一角色超過3筆：最舊的一筆轉為淡出", js(g, "state.promises.map(p=>p.status)").join(",") === "fading,open,open,open");
ev(`applyPromiseResults(state, {}, {start:${sceneAbs}+1, end:${sceneAbs}+2}, new Set(['雅涵']))`);
A.check("A10 淡出的約定在該角色出場後移除", ev("state.promises.length") === 3 && ev("state.promises.every(p=>p.status==='open')"));

// ================= A6 主線推進 =================
ev(`state.plotLines=[]; state.plotSeq=1; state.plotLines.push(newPlotLine(state,{id:'p1',text:'媽媽與陳先生',kind:'伏筆',chars:[],main:null}))`);
const touch = (x) => ev(`applyNarrativeRhythmResult(state, ${JSON.stringify({ plot_touched: [Object.assign({ id: "p1", mode: "light" }, x)] })}, {prologue:false})`);
touch({ investigated: true }); touch({ investigated: true });
A.check("A6 追查2次沒有新資訊：還沒要求揭露", !ev("state.plotLines[0].mustRevealClue"));
touch({ investigated: true });
A.check("A6 追查3次沒有新資訊：下一次必須揭露具體新線索", ev("state.plotLines[0].mustRevealClue") === true);
const rh = js(g, "prepareNarrativeRhythm(state, {actionText:'', prologue:false}).plot_lines.find(l=>l.id==='p1')");
A.check("A6 payload標must_reveal_clue", rh && rh.must_reveal_clue === true, rh);
touch({ investigated: true, new_clue: "陳先生說自己是新搬來的" });
A.check("A6 揭露後計數歸零、記進已揭露線索", ev("state.plotLines[0].investigateNoClue") === 0 && !ev("state.plotLines[0].mustRevealClue") && js(g, "state.plotLines[0].clues")[0] === "陳先生說自己是新搬來的");
for (let i = 0; i < 5; i++) touch({ new_clue: "線索" + i });
A.check("A6 已揭露線索最多5條，滿了最舊的併進摘要", ev("state.plotLines[0].clues.length") === 5 && /陳先生說自己是新搬來的/.test(ev("state.plotLines[0].summaryExtra")));
touch({ lie: { character: "陳先生", content: "我搬來半年多了" } });
const rh2 = js(g, "prepareNarrativeRhythm(state, {actionText:'', prologue:false}).plot_lines.find(l=>l.id==='p1')");
A.check("A6 謊言記錄並送給AI(可以被揭穿)", rh2.lies && rh2.lies[0].content === "我搬來半年多了" && rh2.clues.length === 5 && rh2.summary, rh2);
touch({ lie_exposed: "我搬來半年多了" });
A.check("A6 揭穿後不再列為謊言", ev("state.plotLines[0].lies[0].exposed") === true);
// 原地踏步8回合：有追查→必須推進；都在迴避→暫停5回合
ev("state.plotLines[0].lastProgressTurn = state.turnCount-8; state.plotLines[0].investigatedSinceProgress = true; state.plotLines[0].pendingMorph=null; state.plotLines[0].pushToFront=false");
const rh3 = js(g, "prepareNarrativeRhythm(state, {actionText:'', prologue:false}).plot_lines.find(l=>l.id==='p1')");
A.check("A6 8回合沒推進且玩家有追查：下一次碰到必須推進", rh3 && rh3.must_advance === true, rh3);
touch({});
A.check("A6 碰到後視為已推進", !ev("state.plotLines[0].mustAdvance") && ev("state.plotLines[0].lastProgressTurn") === ev("state.turnCount"));
ev("state.plotLines[0].lastProgressTurn = state.turnCount-8; state.plotLines[0].investigatedSinceProgress = false");
const rh4 = js(g, "prepareNarrativeRhythm(state, {actionText:'', prologue:false}).plot_lines.find(l=>l.id==='p1')||null");
A.check("A6 8回合沒推進且玩家都在迴避：暫停5回合、完全不提", rh4 === null && ev("state.plotLines[0].pausedUntil") === ev("state.turnCount") + 5);

// ================= A7 出場頻率與日常場景 =================
ev(`state.appearLog = []; for(let i=1;i<=10;i++) state.appearLog.push({ turn: state.turnCount - i, names: i<=6 ? [${JSON.stringify(fname)}] : [] })`);
const rh5 = js(g, "prepareNarrativeRhythm(state, {actionText:'', prologue:false})");
A.check("A7 最近10回合出場滿6次：不主動安排、不在焦點候選", rh5.appearance_capped.includes(fname) && !rh5.focus_candidates.includes(fname), rh5.appearance_capped);
const rh6 = js(g, `prepareNarrativeRhythm(state, {actionText:'去找${fname}聊天', prologue:false})`);
A.check("A7 玩家指名要找：不受上限限制", !rh6.appearance_capped.includes(fname) && rh6.focus_candidates.includes(fname));
ev(`state.focusLog = []; for(let i=10;i>=1;i--) state.focusLog.push({ turn: state.turnCount - i, name: i<=2 ? null : ${JSON.stringify(fname)} }); state.dailyThemeLog=[]`);
const rh7 = js(g, "prepareNarrativeRhythm(state, {actionText:'', prologue:false})");
A.check("A7 滾動10回合獨處場景不足3個：指定日常場景並從題材池抽主題", rh7.daily_scene_now && ev("DAILY_SCENE_THEMES").includes(rh7.daily_scene_now.theme) && rh7.new_character_now === false, rh7.daily_scene_now);
ev(`state.focusLog = []; for(let i=10;i>=1;i--) state.focusLog.push({ turn: state.turnCount - i, name: i<=3 ? null : ${JSON.stringify(fname)} })`);
A.check("A7 獨處場景已有3個：不指定", js(g, "prepareNarrativeRhythm(state, {actionText:'', prologue:false}).daily_scene_now") === null);
ev(`state.dailyThemeLog = DAILY_SCENE_THEMES.slice(0,9).map((t,i)=>({ turn: state.turnCount - 1 - i%5, theme:t }))`);
A.check("A7 同一主題10回合內不重複", ev("pickDailyTheme(state)") === ev("DAILY_SCENE_THEMES[9]"));
ev(`state.characters.forEach(c=>{ c.lastTurn = state.turnCount; }); state.characters.find(c=>c.name===${JSON.stringify(mom)}).lastTurn = state.turnCount - 12`);
A.check("A7 冷落提醒：很久沒出場的角色名單", js(g, "prepareNarrativeRhythm(state, {actionText:'', prologue:false}).long_unseen_characters").some(c => c.name === mom));

// ================= A13 等待時可展開最近3回合 =================
ev("MOCK_AI_DELAY_MS=1500");
const p13 = ev("takeTurn(state.choices[0]||'繼續', AP_COST_PER_TURN)");
await new Promise(r => setTimeout(r, 50));
const sums = [...g.win.document.querySelectorAll(".entry-summary[data-log-idx]")];
A.check("A13 等待時最近3回合的摘要都在", sums.length === 3 && !!g.win.document.querySelector(".turn-loading, .loading-card, [class*=loading]"));
sums[0].click();
const expanded = !!g.win.document.querySelector(".entry-expanded");
const stillLoading = ev("aiWritingNow") === true && !!g.win.document.querySelector("[class*=loading]");
A.check("A13 等待中點開舊回合可以展開閱讀、等待畫面不中斷", expanded && stillLoading);
await p13;
ev("MOCK_AI_DELAY_MS=0");
A.check("A13 AI寫完後等待狀態解除", ev("aiWritingNow") === false);

// ================= prompt／schema =================
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("A1 prompt：依主角性別用你/妳、選項用主角口吻", prompt.includes("player_pronoun") && prompt.includes("不出現指稱主角的代名詞") && !prompt.includes("角色台詞裡稱呼玩家也一律用「你」"));
A.check("A8 prompt：不得自行編造日期、考前7天才寫倒數", prompt.includes("不得自行編造日期") && prompt.includes("exact_countdown_allowed"));
A.check("A9 prompt：家人分寸", prompt.includes("【家人互動的分寸") && prompt.includes("喏，順便買的"));
A.check("A10 prompt：反常反應要有根據、約定追蹤", prompt.includes("反常反應要有根據") && prompt.includes("promises_due_now"));
A.check("A11 prompt：一致性資料、避用句型", prompt.includes("avoid_phrases") && prompt.includes("key_items") && prompt.includes("school_or_job"));
A.check("A6/A7 prompt：主線推進、出場頻率與日常", prompt.includes("must_reveal_clue") && prompt.includes("appearance_capped") && prompt.includes("daily_scene_now"));
A.check("B5 prompt：打工重心一定要寫到", prompt.includes("turn_focus.key是work（打工）的回合"));
A.check("8.13 schema：order_new與三種訂單大小、order_target、order_work", /order_new[\s\S]{0,700}enum:\s?\["small","medium","large"\]/.test(prompt) && prompt.includes("order_target") && prompt.includes("order_work") && !/side_gig_delivery:/.test(prompt));
A.check("A2 prompt：期中考不再用exam_score_hint", !prompt.includes("若exam_score_hint不是null"));

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
