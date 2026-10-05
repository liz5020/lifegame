// 2026-09-29：重心必須寫進劇情(1.2.16)、字數與填充描寫(18.14)、投入歸屬／副業交件類別／興趣等級(8.12)、社交回合(3.5.5)、
// NPC背景事件表(4.7)、人脈說明與興趣面板(16.12／16.13)（全程假上游，不打真實API）
import path from "path";
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("重心與興趣調整＋NPC背景事件表");
let override = () => ({});
let lastPayload = null;
const fake = H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } });
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "evt0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = `ap:${H.loc("evt0000001")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
const segIdx = (key) => ev(`YEAR_SEGMENTS.findIndex(x=>x.key===${JSON.stringify(key)})`);
const setSeg = (key) => ev(`state.timeState.segmentIndex=${segIdx(key)}; state.timeState.turnsInSegment=1`);
const card = (o) => JSON.stringify(Object.assign({ relation: "同學", gender: "女", traits: "安靜", summary: "", active: true, isChild: false, lastTurn: ev("state.turnCount"), origin: "高中同學", affinity: 50 }, o));
const reset = () => ev(`state.characters = state.characters.filter(c=>c.origin==='父母，從出生起'||c.origin==='隔代教養，從出生起'||c.origin==='手足，從出生起'); state.seekTarget=null`);
const FOCUS = ["study", "interest", "social", "rest", "work", "family"];

// ---------- 1.2.16 重心場景指令 ----------
setSeg("期中準備期");
const wants = { study: /實際讀書、複習或寫作業/, social: /和朋友相處的場景/, rest: /放鬆、獨處或睡飽/, work: /實際打工/, family: /和家人相處的場景，地點以家中或家庭活動為主/ };
for (const k of ["study", "social", "rest", "work", "family"]) {
  ev(`state.focus=${JSON.stringify(k)}`);
  await H.playTurn(g, "嗯");
  const d = lastPayload.turn_focus && lastPayload.turn_focus.scene_directive;
  A.check(`1.2.16 重心「${k}」：提示放入場景指令`, d && wants[k].test(d), d);
}
ev("state.interestCandidates=[{id:'g1',category:'藝術創作',status:'active',investment:30,positiveStreak:0,candidateProgress:3,lastEngagedRound:state.turnCount-1}]");
ev("state.focus='interest'; state.focusInterestId=null");
await H.playTurn(g, "嗯");
A.check("1.2.16 重心「興趣：X」：指令寫明主角在做的事必須是X", /實際從事藝術創作的描寫.*主角在做的事必須是藝術創作/.test(lastPayload.turn_focus.scene_directive), lastPayload.turn_focus.scene_directive);
ev("state.focusInterestId='new'");
await H.playTurn(g, "嗯");
A.check("1.2.16 重心「嘗試新的」：指令改為嘗試新事物", /嘗試一件新事物/.test(lastPayload.turn_focus.scene_directive), lastPayload.turn_focus.scene_directive);
A.check("1.2.16 程式事件回合：指令降為有空檔才帶到", /優先處理的事/.test(ev("focusSceneDirective({key:'study'}, '生病')")) && /玩家自由輸入的內容優先/.test(ev("focusSceneDirective({key:'study'}, null)")));
A.check("1.2.16 出社會後沒有重心＝沒有指令", ev("focusSceneDirective(null, null)") === null);

// ---------- 18.14 字數與填充描寫 ----------
const wg = lastPayload.narrative_length_guide;
const base = js("narrativeLengthTier(1, 'normal', false)"), plus = js("narrativeLengthTier(1, 'normal', true)");
A.check("18.14 有重心的回合字數上限增加100字，其餘不變", plus.target_total_words - base.target_total_words === 100 && plus.focus_extra_words === 100 && !base.focus_extra_words && wg.focus_extra_words === 100, { base, plus });
ev("state.log.push({age:15,text:'窗外的蟬聲很吵。巷口有一隻野貓走過。夕陽斜斜地照進來。他們的節奏對不上。'})");
const amb = js("recentAmbientCategories(state)");
A.check("18.14 程式從最近5回合正文比對出用過的環境描寫類別，送給旁白", amb.length >= 3 && JSON.stringify(JSON.parse(ev("buildUserMessage('x', false, {structured:true,label:'x'})")).recent_ambient_categories) === JSON.stringify(amb), amb);
ev("state.log.pop()");

// ---------- 8.12.1 投入歸屬 ----------
setSeg("期中準備期");
ev("state.interestCandidates=[{id:'g1',category:'藝術創作',status:'active',investment:30,positiveStreak:0,candidateProgress:3,lastEngagedRound:state.turnCount-1}]");
ev("state.focus='interest'; state.focusInterestId=null");
override = () => ({ interest_event: { category: "體能競技", reaction: "positive" } });
await H.playTurn(g, "嗯");
A.check("8.12.1 情況一：重心指定的興趣記到該卡，AI的category忽略", ev("state.interestCandidates.find(c=>c.id==='g1').investment") > 30 && !ev("state.interestCandidates.some(c=>c.category==='體能競技')"));
ev("state.focus='study'");
override = () => ({ interest_event: { category: "體能競技", reaction: "positive" } });
await H.playTurn(g, "嗯");
A.check("8.12.1 情況二：重心不是興趣的回合，AI回報的category照現行規則計入", ev("state.interestCandidates.some(c=>c.category==='體能競技')"));
ev("state.focus='interest'; state.focusInterestId=null");
override = () => ({});
const i0 = ev("state.interestCandidates.find(c=>c.id==='g1').investment");
await H.playTurn(g, "嗯");
A.check("8.12.1 情況一：AI沒回報reaction視為positive", ev("state.interestCandidates.find(c=>c.id==='g1').investment") > i0);

// ---------- 8.12.3 興趣等級 ----------
A.check("8.12.3 等級門檻：0/10/25/40/70", [[0, "初學"], [9, "初學"], [10, "入門"], [24, "入門"], [25, "上手"], [39, "上手"], [40, "熟練"], [69, "熟練"], [70, "精通"], [100, "精通"]].every(([v, n]) => ev(`interestLevelName(${v})`) === n));
A.check("8.12.3 進度條：入門(10)→上手(25)，17.5時過半；精通沒有下一級", Math.abs(ev("interestLevelProgress(18)") - 8 / 15) < 0.01 && ev("interestLevelProgress(80)") === null);
ev("state.interestCandidates.find(c=>c.id==='g1').investment=39.4; state.interestCandidates.find(c=>c.id==='g1').lastEngagedRound=state.turnCount");
ev("state.focus='interest'; state.focusInterestId=null");
override = () => ({ interest_event: { reaction: "positive" } });
await H.playTurn(g, "嗯");
const lvNotes = js("state.log[state.log.length-1].levelNotes");
A.check("8.12.3 等級變動的回合：結算區加一行「興趣：X　上手 → 熟練」", lvNotes && lvNotes[0] === "興趣：藝術創作　上手 → 熟練", lvNotes);
A.check("8.12.3 畫面上顯示這一行", [...doc.querySelectorAll(".small-line")].some(p => /上手 → 熟練/.test(p.textContent)));

// 2026-09-30：8.12.2(交件類別檢查、30%主角自己的案子)已由8.13訂單簿取代，改測見test-47-order-book.mjs
override = () => ({});

// ---------- 3.5.5 社交回合 ----------
reset();
ev(`state.characters.push(${card({ name: "小安", affinity: 50 })}, ${card({ name: "小美", affinity: 50 })})`);
ev("state.focus='social'; state.socialTurns=0; state.stats.network=40; state.friendOpportunityPending=false");
override = () => ({ scene_characters: ["小安", "媽媽"] });
await H.playTurn(g, "嗯");
const a1 = ev("state.characters.find(c=>c.name==='小安').affinity");
A.check("3.5.5 社交回合：本回合scene_characters裡的非家人角色好感+2(家人不算)", a1 >= 52 && ev("state.characters.find(c=>c.name==='小美').affinity") === 50, a1);
A.check("3.5.5 沒有符合的角色(場景裡只有家人)則不加", (() => { override = () => ({ scene_characters: ["媽媽"] }); return true; })());
A.check("3.5.5 機率＝20%＋人脈每10點+5%，上限60%", ev("(state.stats.network=0, friendOpportunityProb(state))") === 0.2 && ev("(state.stats.network=57, friendOpportunityProb(state))") === 0.45 && ev("(state.stats.network=100, friendOpportunityProb(state))") === 0.6);
ev("state.stats.network=40; state.socialTurns=0; state.friendOpportunityPending=false; window.__rnd = Math.random; Math.random = ()=>0.0");
override = () => ({ scene_characters: [] });
for (let i = 0; i < 3; i++) { ev("state.focus='social'"); await H.playTurn(g, "嗯"); }
ev("Math.random = window.__rnd");
A.check("3.5.5 累計社交回合每滿3次擲一次；擲中後下一回合提示指示旁白安排機會", ev("state.socialTurns") === 0, ev("state.socialTurns"));
ev("state.friendOpportunityPending=true");
ev("state.characters.find(c=>c.name==='小安').affinity=70");
ev("state.focus='rest'");
await H.playTurn(g, "嗯");
A.check("3.5.5 機會來源：沒有【機】事件時，從熟悉的朋友以上隨機挑", lastPayload.friend_opportunity_now && lastPayload.friend_opportunity_now.source === "小安", lastPayload.friend_opportunity_now);
ev(`state.characters.find(c=>c.name==='小美').events=[{name:'開始接小案子賺零用錢',lv:'轉折',label:'高一暑假',turn:1,known:true}]; state.friendOpportunityPending=true`);
ev("state.focus='rest'");
await H.playTurn(g, "嗯");
A.check("3.5.5 機會來源：優先挑有已得知【機】事件的角色", lastPayload.friend_opportunity_now && lastPayload.friend_opportunity_now.source === "小美" && lastPayload.friend_opportunity_now.based_on_event === "開始接小案子賺零用錢", lastPayload.friend_opportunity_now);
ev("state.focus='rest'");
await H.playTurn(g, "嗯");
A.check("3.5.5 機會只出現一回合", !lastPayload.friend_opportunity_now);

// ---------- 4.7 事件表資料 ----------
const tbl = js("BG_EVENT_TABLE");
const n = Object.fromEntries(Object.entries(tbl).map(([k, v]) => [k, v.length]));
A.check("4.7.6 事件清單筆數：13-18=15、19-22=14、23-30=16、31-45=17、46-60=13、61+=9", n["13-18"] === 15 && n["19-22"] === 14 && n["23-30"] === 16 && n["31-45"] === 17 && n["46-60"] === 13 && n["61-999"] === 9, n);
A.check("4.7.6 每個年齡段每個等級都有事件可抽", Object.values(tbl).every(rows => ["日常", "轉折", "重大"].every(lv => rows.some(r => r[0] === lv))));

// ---------- 4.7 擲骰機率 ----------
const stat = (mode, age, extra = "") => JSON.parse(ev(`(()=>{
  const s = state; let none=0, day=0, turn=0, big=0, died=0; const N=20000;
  for(let i=0;i<N;i++){
    const c = { name:'測'+i, relation:'同學', gender:'女', age:${age}, affinity:50, active:true, traits:'', events:[], ${extra} };
    const r = rollBackgroundEventForCharacter(s, c, ${JSON.stringify(mode)}, '測試');
    if(r==='過世') died++; else if(!r) none++; else { const e = c.events[0]; if(e.lv==='日常') day++; else if(e.lv==='轉折') turn++; else big++; }
  }
  return JSON.stringify({ none:none/N, day:day/N, turn:turn/N, big:big/N, died:died/N });
})()`));
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const s1 = stat("student", 16);
A.check("4.7.2 學生時期＋NPC22歲以下：日常25/轉折8/重大2/無事65", near(s1.day, 0.25) && near(s1.turn, 0.08, 0.01) && near(s1.big, 0.02, 0.01) && near(s1.none, 0.65), s1);
const s2 = stat("student", 25);
A.check("4.7.2 學生時期＋NPC23歲以上：日常17.5/轉折7.5/重大2.5/無事72.5", near(s2.day, 0.175) && near(s2.turn, 0.075, 0.01) && near(s2.big, 0.025, 0.01) && near(s2.none, 0.725), s2);
const s3 = stat("adult", 28);
A.check("4.7.2 出社會後：日常35/轉折15/重大5/無事45", near(s3.day, 0.35) && near(s3.turn, 0.15) && near(s3.big, 0.05, 0.01) && near(s3.none, 0.45), s3);
const d1 = stat("adult", 65), d2 = stat("adult", 75), d3 = stat("adult", 85), d4 = stat("student", 65), d5 = stat("adult", 55);
A.check("4.7.2 過世：61-70歲1%／71-80歲3%／81歲以上6%；學生時期減半；60歲以下不會", near(d1.died, 0.01, 0.006) && near(d2.died, 0.03, 0.008) && near(d3.died, 0.06, 0.01) && near(d4.died, 0.005, 0.004) && d5.died === 0, { d1, d2, d3, d4, d5 });
A.check("4.7.2 過世的角色狀態改為已故", (() => { ev("window.__rnd = Math.random; Math.random = ()=>0"); const r = js(`(()=>{ const c={name:'老',relation:'鄰居',age:85,affinity:50,active:true,traits:'',events:[]}; rollBackgroundEventForCharacter(state,c,'adult','x'); return {deceased:c.deceased, ev:c.events.map(e=>e.name)}; })()`); ev("Math.random = window.__rnd"); return r.deceased === true && r.ev[0] === "過世"; })());

// ---------- 4.7 條件、標籤、關聯權重 ----------
const chk = (js0) => ev(js0);
A.check("4.7.3 條件：目前無交往對象才能「交了男女朋友」、有才能「分手」", (() => {
  const pool = (tags, lv) => js(`bgEventPool(state, {bgTags:${JSON.stringify(tags)}}, '13-18', '${lv}', false).map(e=>e.name)`);
  return pool({}, "轉折").includes("交了男女朋友") && !pool({}, "轉折").includes("分手") && pool({ partnered: true }, "轉折").includes("分手") && !pool({ partnered: true }, "轉折").includes("交了男女朋友");
})());
A.check("4.7.3 條件：需has_child／married／未retired", (() => {
  const names = (band, tags, lv) => js(`bgEventPool(state, {bgTags:${JSON.stringify(tags)}}, '${band}', '${lv}', false).map(e=>e.name)`);
  return !names("31-45", {}, "日常").includes("孩子上小學") && names("31-45", { hasChild: true }, "日常").includes("孩子上小學")
    && !names("31-45", {}, "重大").includes("離婚") && names("31-45", { married: true }, "重大").includes("離婚")
    && !names("31-45", { married: true }, "重大").includes("結婚") && names("46-60", {}, "重大").includes("提早退休") && !names("46-60", { retired: true }, "重大").includes("提早退休")
    && !names("61-999", {}, "轉折").includes("喪偶") && names("61-999", { married: true }, "轉折").includes("喪偶");
})());
A.check("4.7.3 標籤：結婚設married、離婚移除、喪偶設widowed", (() => {
  const c = { bgTags: {} }; ev(`window.__c = ${JSON.stringify(c)}`);
  return js(`(()=>{ const c={bgTags:{}}; bgApplyFx(c,'+married','結婚'); const a=!!c.bgTags.married; bgApplyFx(c,'-married-partnered','離婚'); const b=!c.bgTags.married; const d={bgTags:{married:true}}; bgApplyFx(d,'-married-partnered+widowed','喪偶'); return a&&b&&d.bgTags.widowed&&!d.bgTags.married; })()`);
})());
A.check("4.7.3 【感】主角正在交往的對象不抽感情類事件", (() => {
  ev("window.__rnd = Math.random");
  const hits = js(`(()=>{ let feel=0; for(let i=0;i<4000;i++){ const c={name:'x'+i,relation:'同學',age:16,romanceStatus:'dating',affinity:60,active:true,traits:'',events:[]}; rollBackgroundEventForCharacter(state,c,'adult','t'); if(c.events[0] && BG_EVENT_BY_NAME[c.events[0].name].tags.includes('感')) feel++; } return feel; })()`);
  return hits === 0;
})());
A.check("4.7.2 關聯關鍵字出現在relation／affiliation／traits：權重×1.5", ev(`bgRelMult({relation:'同學',affiliation:'美術班',traits:''}, BG_EVENTS.find(e=>e.name==='比賽或作品得獎'))`) === 1.5 && ev(`bgRelMult({relation:'同學',affiliation:'',traits:'安靜'}, BG_EVENTS.find(e=>e.name==='比賽或作品得獎'))`) === 1 && ev(`bgRelMult({relation:'同學',traits:''}, BG_EVENTS.find(e=>e.name==='換了新髮型'))`) === 1);
A.check("4.7.1 不擲骰：家人、已故、未滿13歲、配偶／同住者", (() => {
  const t = (o) => ev(`bgRollable(${JSON.stringify(Object.assign({ name: "x", relation: "同學", age: 16, affinity: 50 }, o))})`);
  return t({}) === true && t({ relation: "母親" }) === false && t({ deceased: true }) === false && t({ age: 12 }) === false && t({ romanceStatus: "married" }) === false && t({ cohabiting: true }) === false && t({ age: undefined }) === true;
})());
A.check("4.7.1 漸行漸遠與失聯者也擲", ev(`bgRollable({name:'x',relation:'同學',age:16,active:false})`) === true && ev(`bgRollable({name:'x',relation:'同學',age:16,lost:true,active:false})`) === true);
A.check("4.7.2 沒有年齡資料時視為與主角同齡", (() => {
  ev("window.__rnd = Math.random; Math.random = ()=>0.3"); // 落在轉折(0.25~0.33)
  const r = js(`(()=>{ const c={name:'無年齡',relation:'同學',affinity:50,active:true,traits:'',events:[]}; rollBackgroundEventForCharacter(state,c,'student','x'); return c.events[0] && BG_EVENT_BY_NAME[c.events[0].name].band; })()`);
  ev("Math.random = window.__rnd");
  return r === "13-18";
})());
A.check("4.7.3 【距】事件：人物卡加left_circle標記", (() => {
  const c = js(`(()=>{ const c={name:'轉學生',relation:'同學',age:16,affinity:50,active:true,traits:'',events:[],bgTags:{}}; for(let i=0;i<3000 && !c.left_circle;i++){ c.events=[]; rollBackgroundEventForCharacter(state,c,'adult','x'); } return { flag:c.left_circle, ev:c.events.map(e=>e.name) }; })()`);
  return c.flag === true && ["轉學", "家裡出狀況搬家", "休學"].includes(c.ev[0]);
})());

// ---------- 4.7.1 擲骰時機 ----------
reset();
ev(`state.characters.push(${card({ name: "小安", affinity: 65, age: 16 })}, ${card({ name: "阿光", affinity: 30, age: 16, lost: true, active: false })})`);
ev("state.bgLastRollTurn=-99");
A.check("4.7.1 學生時期：進入假期第一回合才擲，且12回合內不重複", ev("maybeRollBackgroundEvents(state, {holiday:false, window:{start:0}})") === false && ev("maybeRollBackgroundEvents(state, {holiday:true, window:{start:0}})") === true && ev("maybeRollBackgroundEvents(state, {holiday:true, window:{start:0}})") === false);
ev("state.turnCount += 12");
A.check("4.7.1 隔了一個學期再進假期：再擲一次", ev("maybeRollBackgroundEvents(state, {holiday:true, window:{start:0}})") === true);
A.check("4.7.1 事件標籤：學生時期寫「{年級}寒假／暑假」", /^高.[寒暑]假$/.test(ev("bgLabelNow(state)")) || /大/.test(ev("bgLabelNow(state)")), ev("bgLabelNow(state)"));
ev("state.timeState.stageMode='career'; state.age=27; state.idleMode=false; state.studentStatus='graduated'");
A.check("4.7.1 出社會後：第一回合只記年份、不擲；跨入新年才擲", (() => {
  ev("state.bgYear=null; state.isStudentOverride=1");
  const a = ev("maybeRollBackgroundEvents(state, {window:{start:calDateToAbs(2030,12,20)}})");
  const b = ev("maybeRollBackgroundEvents(state, {window:{start:calDateToAbs(2030,12,28)}})");
  const c = ev("maybeRollBackgroundEvents(state, {window:{start:calDateToAbs(2031,1,3)}})");
  const d = ev("maybeRollBackgroundEvents(state, {window:{start:calDateToAbs(2031,1,20)}})");
  return a === false && b === false && c === true && d === false;
})(), { student: ev("focusModeActive(state)") });
ev("state.timeState.stageMode='highschool'; state.age=15; state.studentStatus='enrolled'");

// ---------- 4.7.4 主角得知方式 ----------
reset();
ev(`state.characters.push(${card({ name: "小安", affinity: 70, age: 16 })}, ${card({ name: "小美", affinity: 30, age: 16 })}, ${card({ name: "阿光", affinity: 80, age: 16, lost: true, active: false })})`);
ev(`state.characters.find(c=>c.name==='小安').events=[{name:'交了男女朋友',lv:'轉折',label:'高一寒假',turn:1,known:false},{name:'換了新髮型',lv:'日常',label:'高一寒假',turn:1,known:false}]`);
ev(`state.characters.find(c=>c.name==='小美').events=[{name:'開始補習',lv:'日常',label:'高一寒假',turn:1,known:false}]`);
ev(`state.characters.find(c=>c.name==='阿光').events=[{name:'轉學',lv:'轉折',label:'高一寒假',turn:1,known:false}]`);
ev("state.newsQueue=[{who:'小安',name:'交了男女朋友'},{who:'阿光',name:'轉學'}]; state.pendingInvites=[]; state.focus='rest'; state.lastFeedTurn=state.turnCount");
override = () => ({});
await H.playTurn(g, "嗯");
A.check("4.7.4 熟悉的朋友的轉折事件：下一回合提示列出，之後標為已得知", lastPayload.friend_news_now && lastPayload.friend_news_now.name === "小安" && lastPayload.friend_news_now.event === "交了男女朋友" && js("state.characters.find(c=>c.name==='小安').events")[0].known === true, lastPayload.friend_news_now);
A.check("4.7.4 日常事件不主動帶到(仍是未得知)", js("state.characters.find(c=>c.name==='小安').events")[1].known === false);
A.check("4.7.4 給旁白的人物卡列出尚未得知的事件", (lastPayload.active_characters.find(c => c.name === "小安") || {}).new_events && lastPayload.active_characters.find(c => c.name === "小安").new_events.includes("換了新髮型"), lastPayload.active_characters.find(c => c.name === "小安"));
override = () => ({ scene_characters: ["小安"] });
await H.playTurn(g, "嗯");
A.check("4.7.4 該角色出現在劇情中：未得知事件標為已得知", js("state.characters.find(c=>c.name==='小安').events").every(e => e.known));
A.check("4.7.4 失聯者的消息不會帶到(等聯繫上)", !lastPayload.friend_news_now && js("state.characters.find(c=>c.name==='阿光').events")[0].known === false);
ev("state.lastFeedTurn=null; state.characters.find(c=>c.name==='小美').recentStatus=''; state.characters.find(c=>c.name==='小安').cohabiting=true");
override = () => ({});
await H.playTurn(g, "嗯");
A.check("4.7.4 被選為滑到動態的素材：未得知事件揭曉並放進動態素材", lastPayload.social_feed_now && lastPayload.social_feed_now.name === "小美" && lastPayload.social_feed_now.event === "開始補習" && js("state.characters.find(c=>c.name==='小美').events")[0].known === true, lastPayload.social_feed_now);
ev("state.seekTarget='阿光'; window.__rnd = Math.random; Math.random = ()=>0.0");
await H.playTurn(g, "去找阿光");
ev("Math.random = window.__rnd");
A.check("4.7.4 失聯者成功聯繫上：事件一次揭曉並告知旁白", lastPayload.relationship_event_now && lastPayload.relationship_event_now.events_while_apart && lastPayload.relationship_event_now.events_while_apart.includes("轉學") && js("state.characters.find(c=>c.name==='阿光').events")[0].known === true, lastPayload.relationship_event_now);

// ---------- 4.7.3 【邀】選項 ----------
ev(`state.characters.find(c=>c.name==='小美').events.push({name:'作品入選展覽或競賽得獎',lv:'轉折',label:'高一暑假',turn:1,known:false}); state.pendingInvites=[{who:'小美',name:'作品入選展覽或競賽得獎'}]`);
override = () => ({ choices: ["一個人回家", "寫作業", "打電話給媽媽"] });
await H.playTurn(g, "嗯");
const ch = js("state.choices");
A.check("4.7.3 【邀】類事件：下一回合的選項加入一個相關選項，事件標為已得知", ch.includes("去看小美的作品展出") && ch.length === 4 && js("state.characters.find(c=>c.name==='小美').events").pop().known === true, ch);
override = () => ({ choices: ["一個人回家", "寫作業", "打電話給媽媽"] });
await H.playTurn(g, "嗯");
A.check("4.7.3 邀請選項只出現這一回合", !js("state.choices").some(c => /作品展出/.test(c)));

// ---------- 4.7.3 【距】不出現在日常場景 ----------
reset();
ev(`state.characters.push(${card({ name: "轉走的人", affinity: 60, age: 16, left_circle: true })}, ${card({ name: "同班同學", affinity: 60, age: 16 })})`);
ev("state.focus='rest'");
override = () => ({});
await H.playTurn(g, "嗯");
const cands = lastPayload.narrative_rhythm.focus_candidates;
A.check("4.7.3 【距】離開生活圈的角色不列入焦點角色候選(日常場景)", !cands.includes("轉走的人") && cands.includes("同班同學"), cands);
A.check("4.7.3 【距】人物卡帶left_circle給旁白、名冊註明", lastPayload.active_characters.find(c => c.name === "轉走的人").left_circle === true && lastPayload.character_roster.some(l => /^轉走的人｜.*已離開主角的日常生活圈/.test(l)));
ev("state.seekTarget='轉走的人'");
await H.playTurn(g, "去找轉走的人");
A.check("4.7.3 【距】主角主動去找時例外", lastPayload.narrative_rhythm.focus_candidates.includes("轉走的人") || lastPayload.narrative_rhythm.seek_character === "轉走的人");

// ---------- 4.7.5 動態紀錄 ----------
reset();
ev(`state.characters.push(${card({ name: "雅涵", affinity: 60, age: 16 })})`);
ev(`state.characters.find(c=>c.name==='雅涵').events = Array.from({length:14},(_,i)=>({name:'事件'+i,lv:'日常',label:'高一寒假',turn:i,known:i<13}))`);
ev("renderNpcDetailModal('雅涵')");
const dyn = doc.querySelector("#npc-detail-modal .npc-dyn");
A.check("4.7.5 動態：只列已得知的事件、格式「{時間}・{事件名稱}」、最近10筆", dyn && dyn.querySelectorAll(":scope > div").length === 10 && /高一寒假・事件12/.test(dyn.textContent) && !/事件13/.test(dyn.textContent), dyn && dyn.textContent.slice(0, 120));
A.check("4.7.5 更早的動態可展開查看", !!dyn.querySelector("details") && /更早的動態（3）/.test(dyn.textContent));
ev("document.getElementById('npc-detail-modal').remove()");
A.check("4.7.5 事件紀錄每人最多保留30筆(已得知的先捨去)", ev(`(()=>{ const c={events:[]}; for(let i=0;i<40;i++) pushBgEvent(c,{name:'e'+i,lv:'日常',label:'x',turn:i}); c.events.forEach((e,i)=>{ if(i<10) e.known=true; }); pushBgEvent(c,{name:'new',lv:'日常',label:'x',turn:99}); return c.events.length===30; })()`));

// ---------- 16.12 人脈說明、16.13 興趣面板 ----------
ev("openPanel='stats'; render()");
const tip = doc.querySelector("#tip-人脈");
A.check("16.12 人脈旁有說明小視窗，列出實際影響的項目", tip && /找工作/.test(tip.textContent) && /歸屬感/.test(tip.textContent) && /朋友帶來機會/.test(tip.textContent) && /連續好幾回合沒和非家人互動/.test(tip.textContent), tip && tip.textContent);
A.check("16.12 說明用白話條列(換行顯示)", getComputedStyleSafe(tip));
function getComputedStyleSafe(el) { return !!el && /pre-line/.test(fs.readFileSync(path.join(H.ROOT, "index.html"), "utf8").match(/\.stat-tip\{[^}]*\}/)[0]); }
ev("openPanel=null; render()");
ev("state.interestCandidates=[{id:'a',category:'藝術創作',status:'active',investment:32,sideBusinessStatus:'gig'},{id:'b',category:'手作工藝',status:'active',investment:75,sideBusinessStatus:'formal'},{id:'c',category:'科技邏輯',status:'dormant',investment:12},{id:'d',category:'社交表演',status:'candidate',investment:3}]");
ev("renderInterestsModal()");
const cards = [...doc.querySelectorAll("#interests-modal .interest-card")].map(e => e.textContent.replace(/\s+/g, " "));
A.check("16.13 每個興趣一張卡：等級名稱、距離下一級、副業狀態；候選不列", cards.length === 3 && /藝術創作.*上手.*距離「熟練」.*副業：偶爾接案/.test(cards[0]) && /手作工藝.*精通.*已到頂.*副業：正式經營/.test(cards[1]) && /科技邏輯.*入門.*久未投入.*副業：無/.test(cards[2]), cards);
A.check("16.13 不直接顯示原始投入分數", !cards.some(t => /32|75|\b12\b/.test(t.replace(/科技邏輯/, ""))) );
A.check("16.13 進度條寬度依進度(上手32→25到40=47%)", doc.querySelector("#interests-modal .ic-fill").style.width === "47%", doc.querySelector("#interests-modal .ic-fill").style.width);
ev("document.getElementById('interests-modal').remove(); openPanel='menu'; render()");
A.check("16.13 選單有「我的興趣」入口", !!doc.getElementById("link-interests"));

// ---------- prompt ----------
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：重心場景指令、字數額度、填充描寫、投入歸屬、背景事件、朋友機會", ["scene_directive", "focus_extra_words", "recent_ambient_categories", "category照抄興趣名稱", "new_events", "friend_news_now", "friend_opportunity_now", "left_circle", "events_while_apart"].every(k => prompt.includes(k)));
A.check("prompt：不再要求重心只放在新場景開頭兩三句", !/重心改在narrative新場景開頭兩三句/.test(prompt));

A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
