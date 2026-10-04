// 2026-09-28：二、2.6回合結構(回應與重心)＋十八、敘事節奏(場景、劇情線、角色輪替)（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("2.6回合結構＋十八敘事節奏");
let override = () => ({});
let lastPayload = null;
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } }));
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "focus00001" });
await H.startNewLife(g);
const ev = g.ev;
// 這支測試回合數多，避免中途行動點用完(伺服器端紀錄與本機一起補)
{ const k = `ap:${H.loc("focus00001")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const segIdx = (key) => ev(`YEAR_SEGMENTS.findIndex(x=>x.key===${JSON.stringify(key)})`);
const setSeg = (key) => ev(`state.timeState.segmentIndex=${segIdx(key)}; state.timeState.turnsInSegment=1`);
const js = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
const ORIGIN_ROLES = ["父親","母親","繼父","繼母","哥哥","姊姊","弟弟","妹妹"];

// ---------- 開場 ----------
A.check("開場回合沒有重心(payload.turn_focus為null)", lastPayload && lastPayload.turn_focus === null);
A.check("整局第一回合預設亮休息", ev("currentFocus(state)") === "rest");
ev("render()");
const btns = [...doc.querySelectorAll(".focus-btn[data-focus]")].map(b => b.textContent);
A.check("學生時期出現重心按鈕(含家人)", btns.length === 6 && btns.includes("讀書") && btns.includes("家人"), btns);
A.check("預設亮的是休息", doc.querySelector(".focus-btn.on") && doc.querySelector(".focus-btn.on").textContent === "休息");
A.check("按鈕下方小字提示", (doc.querySelector(".focus-hint:not(.focus-title)") || {}).textContent === "主要給健康，下個場景可能在家或出門散心");
const ta = doc.getElementById("custom-input");
A.check("輸入框三行高、提示文字", ta && ta.tagName === "TEXTAREA" && ta.getAttribute("rows") === "3" && ta.getAttribute("placeholder") === "寫下你想說或想做的事，也可以寫這段時間想怎麼過");

// ---------- 讀書重心 ----------
ev("state.stats.knowledge=40; state.studyCountThisTerm=0; state.interestCountThisTerm=0");
setSeg("期中準備期");
ev("state.focus='study'");
override = () => ({ event_type: null });
await H.playTurn(g, "跟同學去打球");
A.check("準備期選讀書：讀書次數+1(不看文字)", ev("state.studyCountThisTerm") === 1, ev("state.studyCountThisTerm"));
A.check("讀書重心保證至少ordinary：才識成長", ev("state.stats.knowledge") > 40, ev("state.stats.knowledge"));
A.check("payload告訴AI重心", lastPayload.turn_focus && lastPayload.turn_focus.key === "study" && lastPayload.response_source === "free_input");
const lastLog = js("state.log[state.log.length-1]");
A.check("才識變化記為重心(橘色)", lastLog.focusMarks && lastLog.focusMarks.stats.knowledge > 0, lastLog.focusMarks);
ev("render()");
A.check("畫面上橘色標記", !!doc.querySelector("#latest-entry .cap.focus"));
// 沒選讀書：文字寫讀書不計、回應不給才識(ordinary被擋)
ev("state.focus='rest'; state.stats.knowledge=40");
override = () => ({ event_type: "ordinary" });
await H.playTurn(g, "回家讀書讀到半夜");
A.check("沒選讀書重心：文字寫讀書不計次數", ev("state.studyCountThisTerm") === 1);
A.check("沒選讀書重心：回應不給才識", ev("state.stats.knowledge") === 40, ev("state.stats.knowledge"));
// 非準備期讀書：才識照樣成長、不計次數
setSeg("開學初");
ev("state.focus='study'; state.stats.knowledge=40");
override = () => ({});
await H.playTurn(g, "嗯");
A.check("非準備期讀書：才識照樣成長、不計次數", ev("state.stats.knowledge") > 40 && ev("state.studyCountThisTerm") === 1);

// ---------- 休息、社交 ----------
ev("state.focus='rest'; state.stats.health=50");
override = () => ({ stat_deltas: { health: 5, network: 3, expression: 3 } });
ev("state.stats.network=30; state.stats.expression=30");
await H.playTurn(g, "嗯");
A.check("休息：健康+2(AI給的健康加分不算)", Math.round(ev("state.stats.health")) === 52, ev("state.stats.health"));
A.check("學生時期AI給的表達力/人脈加分不算", Math.round(ev("state.stats.expression")) === 30 && Math.round(ev("state.stats.network")) <= 30);
override = () => ({ stat_deltas: { health: -4, network: 0, expression: -2 } });
ev("state.stats.health=50");
await H.playTurn(g, "嗯");
A.check("突發事件的扣分照常(健康−4＋休息+2)", Math.round(ev("state.stats.health")) === 48 && Math.round(ev("state.stats.expression")) === 28, [ev("state.stats.health"), ev("state.stats.expression")]);
ev("state.focus='social'; state.stats.network=30; state.networkIdleStreak=5");
override = () => ({ stat_deltas: { health: 0, network: 0, expression: 0 } });
await H.playTurn(g, "嗯");
A.check("社交：人脈成長、閒置衰退計數重置", ev("state.stats.network") > 30 && ev("state.networkIdleStreak") === 0, [ev("state.stats.network"), ev("state.networkIdleStreak")]);

// ---------- 打工 ----------
ev("state.focus='rest'; state.partTimeEventLog=null");
await H.playTurn(g, "去打工");
A.check("學生時期文字寫打工但沒選打工重心：不入帳", ev("state.partTimeEventLog") === null);
ev("state.focus='work'");
const cash0 = ev("state.cash");
await H.playTurn(g, "嗯");
A.check("打工重心：程式入帳並告訴AI", ev("state.partTimeEventLog && state.partTimeEventLog.earning") > 0 && lastPayload.turn_focus.part_time && lastPayload.turn_focus.part_time.earning > 0);
A.check("打工收入標在橘色存款標記", (js("state.log[state.log.length-1].focusMarks").extra || []).some(t => t.startsWith("存款 +")));

// ---------- 家人 ----------
const fam = js("focusFamilyPool(state).map(c=>({name:c.name, relation:c.relation}))");
A.check("高中生有同住家人", fam.length >= 1, fam);
ev("state.focus='family'");
const affBefore = js("Object.fromEntries(state.characters.map(c=>[c.name,c.affinity]))");
await H.playTurn(g, "嗯");
const affAfter = js("Object.fromEntries(state.characters.map(c=>[c.name,c.affinity]))");
A.check("家人重心：同住家人都+2", fam.every(f => affAfter[f.name] - affBefore[f.name] >= 2 - 0.001), { affBefore, affAfter });
const mom = fam.find(f => /母親|媽媽/.test(f.relation));
if (mom && fam.length > 1) {
  const b2 = js("Object.fromEntries(state.characters.map(c=>[c.name,c.affinity]))");
  await H.playTurn(g, "陪媽媽去買菜");
  const a2 = js("Object.fromEntries(state.characters.map(c=>[c.name,c.affinity]))");
  const others = fam.filter(f => f.name !== mom.name);
  A.check("文字提到媽媽：只加媽媽", a2[mom.name] - b2[mom.name] >= 2 - 0.001 && others.every(f => a2[f.name] - b2[f.name] < 2), { b2, a2 });
}
ev("state.characters.forEach(c=>{ if(familyRoleOf(c.relation)) c.cohabiting=false; })");
const pool2 = js("focusFamilyPool(state).map(c=>familyRoleOf(c.relation))");
A.check("沒有同住家人：改成原生家庭父母和手足", pool2.every(r => ORIGIN_ROLES.includes(r)) && pool2.length === ev("state.characters.filter(c=>['父親','母親','繼父','繼母','哥哥','姊姊','弟弟','妹妹'].includes(familyRoleOf(c.relation)) && !c.deceased && !c.lost).length"), { pool2, fam });
const savedChars = ev("JSON.stringify(state.characters)");
ev("state.characters.forEach(c=>{ if(familyRoleOf(c.relation)) c.deceased=true; })");
ev("render()");
A.check("沒有可聯絡的家人：不顯示家人按鈕", ![...doc.querySelectorAll(".focus-btn[data-focus]")].some(b => b.dataset.focus === "family"));
ev(`state.characters = JSON.parse(${JSON.stringify(savedChars)}); state.characters.forEach(c=>{ if(familyRoleOf(c.relation)) c.cohabiting=true; })`);

// ---------- 興趣 ----------
setSeg("期中準備期");
ev("state.interestCountThisTerm=0; state.interestCandidates=[{id:'g1',category:'藝術創作',status:'active',investment:30,positiveStreak:0,candidateProgress:3,lastEngagedRound:state.turnCount-1}]");
ev("state.focus='interest'; state.focusInterestId=null");
override = () => ({ interest_event: { category: "體能競技", reaction: "negative" } });
await H.playTurn(g, "嗯");
A.check("八、8.12.1 指定正式興趣卡：AI回報的category一律忽略(不會另開體能競技)", !ev("state.interestCandidates.some(c=>c.category==='體能競技')"));
A.check("八、8.12.1 指定正式興趣卡：反應由AI回報，negative不增加投入(照8.2扣進度)", ev("state.interestCandidates.find(c=>c.id==='g1').investment") < 30);
A.check("準備期選興趣：興趣次數+1", ev("state.interestCountThisTerm") === 1);
ev("state.focus='interest'; state.focusInterestId=null");
override = () => ({ interest_event: { category: "體能競技", reaction: "positive" } });
const invPos0 = ev("state.interestCandidates.find(c=>c.id==='g1').investment");
await H.playTurn(g, "嗯");
A.check("八、8.12.1 指定正式興趣卡：positive記到該卡(category忽略)", ev("state.interestCandidates.find(c=>c.id==='g1').investment") > invPos0 && !ev("state.interestCandidates.some(c=>c.category==='體能競技')"));
ev("state.focus='interest'; state.focusInterestId=null");
override = () => ({});
const inv1 = ev("state.interestCandidates.find(c=>c.id==='g1').investment");
await H.playTurn(g, "嗯");
A.check("八、8.12.1 AI沒回報reaction：視為positive", ev("state.interestCandidates.find(c=>c.id==='g1').investment") > inv1);
A.check("指定正式興趣卡：AI的interest_event的category不讀", !ev("state.interestCandidates.some(c=>c.category==='體能競技')"));
A.check("payload寫興趣名稱", lastPayload.turn_focus.interest_category === "藝術創作");
ev("render()");
A.check("興趣按鈕寫興趣名稱", [...doc.querySelectorAll(".focus-btn[data-focus]")].some(b => b.textContent.startsWith("興趣：藝術創作")));
doc.querySelector(".focus-btn[data-focus='interest']").click();
A.check("興趣已選中再點一次：出現切換清單(含嘗試新的)", !!doc.querySelector("#interest-pick [data-interest-card='new']"));
doc.querySelector("#interest-pick [data-interest-card='new']").click();
override = () => ({ interest_event: { category: "藝術創作", reaction: "neutral" } });
await H.playTurn(g, "嗯");
A.check("嘗試新的：payload寫嘗試新的，類別由AI判斷", lastPayload.turn_focus.interest_category === "嘗試新的");
override = () => ({});

// ---------- 回應的評價 ----------
setSeg("開學初");
ev("state.focus='rest'; state.stats.network=30; state.stats.expression=30");
ev("state.characters.push({name:'雅涵',relation:'同學',gender:'女',affinity:50,summary:'',lastTurn:state.turnCount,active:true,age:15})");
override = () => ({ response_rating: { grade: "excellent", ability: "expression", target: "雅涵" }, character_updates: [{ name: "雅涵", affinity_delta: 9 }] });
await H.playTurn(g, "我認真跟她說我其實很在意這件事");
A.check("自由輸入出色：表達力+2(邊際遞減後)、對象關係+3", ev("state.stats.expression") > 31 && ev("state.characters.find(c=>c.name==='雅涵').affinity") === 53, [ev("state.stats.expression"), ev("state.characters.find(c=>c.name==='雅涵').affinity")]);
ev("state.choices=['點頭說好']");
await H.playTurn(g, "點頭說好");
A.check("點選項最高只到不錯：關係+2", ev("state.characters.find(c=>c.name==='雅涵').affinity") === 55 && lastPayload.response_source === "choice");
override = () => ({ response_rating: { grade: "blunder", ability: "network", target: "雅涵" } });
const net0 = ev("state.stats.network");
await H.playTurn(g, "你很煩欸");
A.check("失言：人脈扣、對象關係−3", ev("state.stats.network") < net0 && ev("state.characters.find(c=>c.name==='雅涵').affinity") === 52);
const lg = js("state.log[state.log.length-1]");
A.check("回應帶來的變化記為紫色(不在重心標記裡)", lg.statChanges.network < 0 && !((lg.focusMarks.stats||{}).network));

// ---------- 跳過不結算重心 ----------
setSeg("期中後放鬆");
ev("state.focus='rest'; state.stats.health=50");
override = () => ({ stat_deltas: { health: 0, network: 0, expression: 0 } });
await H.playTurn(g, "跳過");
A.check("跳過指令的回合不結算重心", Math.round(ev("state.stats.health")) === 50 && lastPayload.turn_focus === null);

// ---------- 場景 ----------
setSeg("開學初");
override = () => ({ scene_category: "學校" });
ev("state.sceneStreak={cat:'學校',n:3}");
await H.playTurn(g, "嗯");
A.check("同類已連續3回合：直接換到別處並排除該類", lastPayload.scene_plan.mode === "away" && lastPayload.scene_plan.banned_category === "學校" && lastPayload.scene_plan.category !== "學校", lastPayload.scene_plan);
A.check("AI事後回報的類別計入連續次數", js("state.sceneStreak").cat === "學校" && js("state.sceneStreak").n === 4);
ev("state.sceneStreak={cat:'住處',n:1}");
let modes = {};
for (let i = 0; i < 12; i++) { override = () => ({ scene_category: "外面" }); ev("state.sceneStreak={cat:'住處',n:1}"); await H.playTurn(g, "嗯"); modes[lastPayload.scene_plan.mode] = (modes[lastPayload.scene_plan.mode] || 0) + 1; }
A.check("一半跟重心相關、一半換到別處(12回合兩種都有)", modes.related > 0 && modes.away > 0, modes);
await H.playTurn(g, "放學後去雅涵家");
A.check("玩家文字指名去處：覆寫、不擲骰", lastPayload.scene_plan.mode === "override" && lastPayload.scene_plan.reason === "player_named", lastPayload.scene_plan);
setSeg("期中考"); ev("state.timeState.turnsInSegment=0");
await H.playTurn(g, "去雅涵家");
A.check("考試回合固定在學校，玩家去處被擋下時告訴AI", lastPayload.scene_plan.reason === "fixed" && lastPayload.scene_plan.player_destination_blocked === true, lastPayload.scene_plan);
A.check("考試回合照樣有重心", lastPayload.turn_focus !== null);
const weights = js("SCENE_WEIGHTS");
A.check("各時期比例每列合計100", Object.values(weights).every(w => Object.values(w).reduce((a, b) => a + b, 0) === 100));

// ---------- 劇情線 ----------
ev("state.plotLines=[]; state.plotSeq=0; state.focusLog=[]");
setSeg("開學初");
override = () => ({ plot_new: [{ text: "雅涵想知道你家裡的事", kind: "心結", characters: ["雅涵"], main_character: "雅涵" }], plot_touched: [] });
await H.playTurn(g, "嗯");
const p1 = js("state.plotLines[0]");
A.check("新劇情線由程式配發編號", p1.id === "p1" && p1.kind === "心結" && p1.main === "雅涵" && p1.status === "active");
ev("state.characters.find(c=>c.name==='雅涵').style='敏感'");
override = () => ({ plot_touched: [{ id: "p1", mode: "ask" }] });
await H.playTurn(g, "嗯");
A.check("下一回合payload附上上回合碰到的線", JSON.stringify(lastPayload.narrative_rhythm.plot_touched_last_turn) === JSON.stringify([{ id: "p1", mode: "light" }]));
override = () => ({ plot_reactions: [{ id: "p1", reaction: "dodge" }], plot_touched: [{ id: "p1", mode: "ask" }] });
await H.playTurn(g, "我不想講");
A.check("閃開1次(被丟回應的線)", js("state.plotLines[0]").dodges === 1);
await H.playTurn(g, "換個話題");
const afterMorph = js("state.plotLines[0]");
A.check("閃開2次→需要變形(程式抽方式、閃開重新計數)", afterMorph.morphs === 1 && afterMorph.dodges === 0 && !!afterMorph.lastMorph, afterMorph);
A.check("同一回合才產生的變形指定，留到下一回合給AI", afterMorph.pendingMorph === afterMorph.lastMorph);
override = () => ({});
await H.playTurn(g, "嗯");
A.check("payload帶變形指定(或本人不在場時暫緩)", lastPayload.narrative_rhythm.plot_lines.some(l => l.id === "p1" && (l.morph === afterMorph.lastMorph || l.morph_on_hold)), lastPayload.narrative_rhythm.plot_lines);
A.check("變形方式屬於心結的五種", ["保持距離","受傷說出不滿","從別的管道知道","先說自己的事","默默關心"].includes(afterMorph.lastMorph));
// 輕碰+閃開→只能記帶過
ev("state.plotLines[0].pendingMorph=null; state.plotLines[0].lastTouchMode='light'; state.plotLines[0].lastTouchTurn=state.turnCount");
override = () => ({ plot_reactions: [{ id: "p1", reaction: "dodge" }], plot_touched: [{ id: "p1", mode: "light" }] });
await H.playTurn(g, "嗯");
A.check("上回合只是輕碰：玩家沒接只記帶過", js("state.plotLines[0]").dodges === 0 && js("state.plotLines[0]").glossStreak === 1);
await H.playTurn(g, "嗯"); await H.playTurn(g, "嗯");
A.check("連續帶過3次→需要推到眼前", js("state.plotLines[0]").pushToFront === true);
override = () => ({});
await H.playTurn(g, "嗯");
A.check("payload標push_to_front", lastPayload.narrative_rhythm.plot_lines.some(l => l.id === "p1" && l.push_to_front));
// 變形2次後再閃開2次→擱置
ev("Object.assign(state.plotLines[0], {morphs:2, dodges:1, lastTouchMode:'ask', lastTouchTurn:state.turnCount, pushToFront:false, glossStreak:0})");
override = () => ({ plot_reactions: [{ id: "p1", reaction: "dodge" }] });
await H.playTurn(g, "嗯");
A.check("變形2次後仍閃開→擱置(擱置次數1)", js("state.plotLines[0]").status === "shelved" && js("state.plotLines[0]").shelveCount === 1 && js("state.plotLines[0]").shelveReason === "dodge");
ev("state.plotLines[0].shelvedTurn = state.turnCount - 16");
override = () => ({});
await H.playTurn(g, "嗯");
const back = js("state.plotLines[0]");
A.check("擱置16回合→待回歸→被挑中浮現時回到進行中、次數歸零、用一件事讓它浮上來", back.status === "active" && back.dodges === 0 && back.morphs === 0 && lastPayload.narrative_rhythm.plot_surface_now && lastPayload.narrative_rhythm.plot_surface_now.how === "return_event", { back, surf: lastPayload.narrative_rhythm.plot_surface_now });
A.check("上次變形方式保留", !!back.lastMorph);
ev("Object.assign(state.plotLines[0], {status:'shelved', shelveReason:'dodge', shelveCount:2, shelvedTurn:state.turnCount})");
ev("shelvePlotLine(state, state.plotLines[0], 'dodge')");
A.check("擱置第3次→放下", js("state.plotLines[0]").status === "dropped");
override = () => ({ plot_reopened: ["p1"] });
await H.playTurn(g, "我想起雅涵之前問我的事");
A.check("放下的線被玩家提起→重新打開", js("state.plotLines[0]").status === "active");
// 8回合沒碰→浮現；超額擱置
ev("state.plotLines=[]; state.plotSeq=0");
override = () => ({ plot_new: [1,2,3,4,5,6,7].map(i => ({ text: "線" + i, kind: "伏筆", characters: [] })) .slice(0,3) });
await H.playTurn(g, "嗯");
override = () => ({ plot_new: [4,5,6].map(i => ({ text: "線" + i, kind: "伏筆", characters: [] })) });
await H.playTurn(g, "嗯");
override = () => ({ plot_new: [{ text: "線7", kind: "約定", characters: [] }] });
await H.playTurn(g, "嗯");
const pl = js("state.plotLines.map(l=>({id:l.id,status:l.status,reason:l.shelveReason,count:l.shelveCount}))");
A.check("超過6條：最久沒碰的轉擱置(超額，不計擱置次數)，新線照常登記", pl.filter(l => l.status === "active").length === 6 && pl.some(l => l.status === "shelved" && l.reason === "overflow" && l.count === 0) && pl.some(l => l.id === "p7" && l.status === "active"), pl);
ev("state.plotLines.forEach(l=>{ if(l.status==='active') l.lastTouchTurn = state.turnCount - 9; })");
override = () => ({});
await H.playTurn(g, "嗯");
A.check("8回合沒碰：每回合只浮現1條", !!lastPayload.narrative_rhythm.plot_surface_now);
ev("state.plotLines.filter(l=>l.status==='active').slice(0,2).forEach(l=>l.status='resolved')");
await H.playTurn(g, "嗯");
A.check("進行中少於6條：超額擱置的線待回歸", js("state.plotLines.filter(l=>l.shelveReason==='overflow' || l.status==='returning').length") === 0 || js("state.plotLines.some(l=>l.status==='returning' || (l.status==='active' && l.returnedTurn===state.turnCount))"));
// 過世收尾
ev("state.plotLines=[]; state.plotSeq=0");
ev("state.characters.push({name:'阿哲',relation:'同學',gender:'男',affinity:50,summary:'',lastTurn:state.turnCount,active:true,age:15,style:'直率'})");
override = () => ({ plot_new: [{ text: "阿哲說考完請喝奶茶", kind: "約定", characters: ["阿哲"], main_character: "阿哲" }] });
await H.playTurn(g, "嗯");
ev("state.characters.find(c=>c.name==='阿哲').deceased=true");
override = () => ({});
await H.playTurn(g, "嗯");
A.check("唯一相關角色過世：這回合要求收尾、轉放下", lastPayload.narrative_rhythm.plot_closure_now && lastPayload.narrative_rhythm.plot_closure_now[0].character === "阿哲" && js("state.plotLines[0]").status === "dropped");
// 相處風格抽選
const counts = {};
for (let i = 0; i < 2000; i++) { const m = ev("drawPlotMorph(state, {kind:'心結', main:'雅涵', lastMorph:null, chars:['雅涵']})"); counts[m] = (counts[m] || 0) + 1; }
A.check("敏感型心結：保持距離、受傷說出不滿各約35%", counts["保持距離"] > 600 && counts["保持距離"] < 800 && counts["受傷說出不滿"] > 600 && counts["受傷說出不滿"] < 800, counts);
A.check("不連續兩次抽到同一種", Array.from({ length: 200 }, () => ev("drawPlotMorph(state, {kind:'衝突', main:'雅涵', lastMorph:'冷處理', chars:['雅涵']})")).every(m => m !== "冷處理"));
// 舊伏筆轉換
ev("state.plotLines=undefined; state.foreshadows=[{id:'f1',text:'信',status:'open',bornTurn:3},{id:'f2',text:'鑰匙',status:'resolved',bornTurn:4},{id:'f3',text:'照片',status:'faded',bornTurn:5}]");
const mig = js("ensurePlotLines(state).map(l=>l.status)");
A.check("舊伏筆狀態轉換：未回收→進行中、已回收→已解開、淡出→放下", JSON.stringify(mig) === JSON.stringify(["active", "resolved", "dropped"]) && ev("state.foreshadows") === undefined, mig);

// ---------- 角色輪替 ----------
ev("state.focusLog=[]");
override = () => ({ focus_character: "雅涵" });
await H.playTurn(g, "嗯"); await H.playTurn(g, "嗯");
override = () => ({});
await H.playTurn(g, "嗯");
A.check("同一角色連續2回合當焦點：第3回合不在可選名單", !lastPayload.narrative_rhythm.focus_candidates.includes("雅涵") && lastPayload.narrative_rhythm.focus_streak_blocked === "雅涵", lastPayload.narrative_rhythm);
ev("state.focusLog=[]");
override = () => ({ focus_character: "雅涵" });
await H.playTurn(g, "嗯"); await H.playTurn(g, "嗯");
override = () => ({});
await H.playTurn(g, "我想找雅涵聊聊");
A.check("玩家文字指名：可越過連續上限", lastPayload.narrative_rhythm.focus_candidates.includes("雅涵"));
ev("state.focusLog=[1,2,3,4,5].map(i=>({turn:state.turnCount-6+i, name: i%2?'雅涵':null}))");
await H.playTurn(g, "嗯");
A.check("滾動6回合未達3位：要求新的焦點角色", lastPayload.narrative_rhythm.focus_must_be_new === true && !lastPayload.narrative_rhythm.focus_candidates.includes("雅涵"));

// ---------- 想找 ----------
ev("state.characters.find(c=>c.name==='雅涵').active=false");
ev("renderNpcDetailModal('雅涵')");
A.check("通訊錄出現去找她", !!doc.getElementById("btn-npc-seek") && doc.getElementById("btn-npc-seek").textContent === "去找她");
doc.getElementById("btn-npc-seek").click();
A.check("輸入框上方出現「想找：雅涵 ×」", (doc.querySelector(".seek-tag") || {}).textContent === "想找：雅涵×");
const ap0 = ev("totalAP(state)");
await H.playTurn(g, "嗯");
A.check("想找：payload告訴AI、場景覆寫、淡出的角色重新活躍", lastPayload.narrative_rhythm.seek_character === "雅涵" && lastPayload.scene_plan.reason === "player_named" && ev("state.characters.find(c=>c.name==='雅涵').active") === true);
A.check("想找只作用於下一次送出、不另外扣行動點", ev("state.seekTarget") === null && ap0 - ev("totalAP(state)") === 1);
ev("state.characters.find(c=>c.name==='阿哲').deceased=true; renderNpcDetailModal('阿哲')");
A.check("過世的角色：按鈕改為「回憶」(四、4.6.5)", doc.getElementById("btn-npc-seek") && doc.getElementById("btn-npc-seek").textContent === "回憶");
doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove());

// ---------- 相處風格 ----------
override = () => ({ new_characters: [{ name: "品妍", gender: "女", relation: "同學", traits: "", initial_affinity: 50, origin: "同班", dialogue_style: "normal", style: "體貼", age: 15 }], character_updates: [{ name: "雅涵", style_fill: "直率" }] });
ev("state.characters.find(c=>c.name==='雅涵').style=null");
await H.playTurn(g, "嗯");
A.check("新角色記下相處風格", ev("state.characters.find(c=>c.name==='品妍').style") === "體貼");
A.check("舊角色用style_fill補一次", ev("state.characters.find(c=>c.name==='雅涵').style") === "直率");
override = () => ({ character_updates: [{ name: "雅涵", style_fill: "灑脫" }] });
await H.playTurn(g, "嗯");
A.check("相處風格之後固定不變", ev("state.characters.find(c=>c.name==='雅涵').style") === "直率");

// ---------- 反悔 ----------
override = () => ({ plot_new: [{ text: "要被反悔掉的線", kind: "伏筆", characters: [] }] });
const plotsBefore = ev("state.plotLines.length");
await H.playTurn(g, "嗯");
ev("restoreUndo()");
A.check("反悔時劇情線回到上一回合", ev("state.plotLines.length") === plotsBefore);

// ---------- 出社會後 ----------
ev("state.studentStatus='graduated'; state.timeState.stageMode='career'; state.age=23; render()");
// 2026-10-04(二、2.6.7)：重心延續到出社會後；18.2～18.4場景擲骰仍只在學生時期(18.1)
A.check("出社會後照樣顯示重心按鈕，讀書改稱進修", !!doc.querySelector(".focus-btn[data-focus='study']") && doc.querySelector(".focus-btn[data-focus='study']").textContent === "進修");
override = () => ({ stat_deltas: { health: 0, network: 0, expression: 3 } });
ev("state.stats.expression=30");
await H.playTurn(g, "嗯");
A.check("出社會後有重心、沒有場景擲骰，AI的表達力加分改走回應評價", lastPayload.turn_focus && lastPayload.turn_focus.adult === true && lastPayload.scene_plan === null && ev("state.stats.expression") === 30, [lastPayload.turn_focus, lastPayload.scene_plan, ev("state.stats.expression")]);
A.check("出社會後劇情線與角色輪替照常送", !!lastPayload.narrative_rhythm && Array.isArray(lastPayload.narrative_rhythm.focus_candidates));

A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
