// 2026-09-29：四、4.6關係面板與角色狀態、一、1.2.14精簡名冊／1.2.15大筆支出、十六、16.11結算明細、QA 34.13#1/#2/#16（全程假上游，不打真實API）
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("4.6關係面板與角色狀態");
let override = () => ({});
let lastPayload = null;
const fake = H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } });
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "rel0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = `ap:${H.loc("rel0000001")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const js = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
const W = await import(path.join(H.ROOT, "worker/worker.js"));
const card = (o) => JSON.stringify(Object.assign({ relation: "同學", gender: "女", traits: "安靜", summary: "", active: true, isChild: false, lastTurn: ev("state.turnCount"), origin: "高中同學" }, o));
const reset = () => ev(`state.characters = state.characters.filter(c=>c.origin==='父母，從出生起'||c.origin==='隔代教養，從出生起'||c.origin==='手足，從出生起'); state.seekTarget=null`);

// ---------- 4.6.1 排序、不分組；4.6.2 副標題；34.13#16 ----------
reset();
ev(`state.characters.push(${card({ name: "小安", affinity: 50 })}, ${card({ name: "阿哲", affinity: 85, active: false })}, ${card({ name: "小美", affinity: 50, lastTurn: 0 })},
  ${card({ name: "老王", affinity: 95, deceased: true, active: false })}, ${card({ name: "阿凱", affinity: 90, lost: true, active: false })}, ${card({ name: "阿光", affinity: 30, deceased: true, active: false })})`);
ev("state.characters.find(c=>c.name==='小安').lastTurn = state.turnCount"); // 同分：小安較近
ev("openPanel='roster'; render()");
const rows = [...doc.querySelectorAll("#panel-roster .rrow[data-npc]")];
const order = rows.map(r => r.dataset.npc);
const friendsOrder = order.filter(n => ["小安", "阿哲", "小美", "老王", "阿凱", "阿光"].includes(n));
A.check("4.6.1 一般與漸行漸遠混合依好感排序，同分最近互動在前；已故(組內依好感)、失聯排最後", JSON.stringify(friendsOrder) === JSON.stringify(["阿哲", "小安", "小美", "老王", "阿光", "阿凱"]), friendsOrder);
const states = order.map(n => ev(`characterState(state.characters.find(c=>c.name===${JSON.stringify(n)}))`));
const firstAway = states.findIndex(x => x === "deceased" || x === "lost");
A.check("4.6.1 已故、失聯排在所有一般/漸行漸遠角色之後(已故在前、失聯在後)", firstAway > 0 && states.slice(firstAway).every(x => x === "deceased" || x === "lost") && states.lastIndexOf("deceased") < states.indexOf("lost"), { order, states });
A.check("4.6.1 不再分組(沒有「位在場」「位漸行漸遠」字樣)", !/位在場|位漸行漸遠/.test(doc.querySelector("#panel-roster .roster-note").textContent), doc.querySelector("#panel-roster .roster-note").textContent);
const sub = (n) => doc.querySelector(`#panel-roster .rrow[data-npc="${n}"] .sub`).textContent;
A.check("4.6.2 副標題：漸行漸遠／已故／失聯", /漸行漸遠/.test(sub("阿哲")) && /已故/.test(sub("老王")) && /失聯/.test(sub("阿凱")) && /普通朋友/.test(sub("小安")), [sub("阿哲"), sub("老王"), sub("阿凱"), sub("小安")]);
A.check("4.6.2 漸行漸遠的點點改淡色，一般的不是", !!doc.querySelector('#panel-roster .rrow[data-npc="阿哲"] .dots5.faded') && !doc.querySelector('#panel-roster .rrow[data-npc="小安"] .dots5.faded'));
A.check("34.13#16 列不再使用class「bg」(全域.bg是固定背景層)", !doc.querySelector("#panel-roster .rrow.bg"));
const fam = js("state.characters.filter(c=>isFamilyCharacter(c) && !c.deceased && !c.lost).map(c=>c.name)");
ev("state.characters.filter(c=>isFamilyCharacter(c) && !c.deceased && !c.lost).forEach(c=>{ c.active=false; })");
A.check("4.6.2 家人不進漸行漸遠(不活躍的家人仍是一般狀態、家人標籤)", fam.length > 0 && fam.every(n => ev(`characterState(state.characters.find(c=>c.name===${JSON.stringify(n)}))`) === "normal") && ev(`FAMILY_RELATION_LABELS.includes(relationshipStatusLabel(state.characters.find(c=>c.name===${JSON.stringify(fam[0])})))`), fam);
ev("state.characters.filter(c=>isFamilyCharacter(c) && !c.deceased && !c.lost).forEach(c=>{ c.active=true; })");

// ---------- 4.6.3 疏遠期間好感不變動 ----------
reset();
ev(`state.characters.push(${card({ name: "阿哲", affinity: 72, lastTurn: 0 })})`);
override = () => ({});
for (let i = 0; i < 14; i++) await H.playTurn(g, "在家看書");
A.check("4.6.3 12回合沒互動→漸行漸遠，好感不變", ev("characterState(state.characters.find(c=>c.name==='阿哲'))") === "fading" && ev("state.characters.find(c=>c.name==='阿哲').affinity") === 72);

// ---------- 1.2.14 名冊 ----------
const roster = lastPayload.character_roster;
A.check("1.2.14 名冊送給AI：每人一行 名字｜性別｜關係｜簡介｜狀態", Array.isArray(roster) && roster.some(l => /^阿哲｜女｜同學｜.+｜漸行漸遠（重逢時：一見如故）$/.test(l)), roster);
A.check("1.2.14 名冊含家人", roster.some(l => /^(爸爸|媽媽|阿公|阿嬤)｜/.test(l)), roster);
A.check("1.2.14 漸行漸遠的人不在active_characters完整人物卡裡", !lastPayload.active_characters.some(c => c.name === "阿哲"));
const req = W.buildTurnRequest([{ role: "user", content: JSON.stringify({ a: 1, character_roster: ["甲｜女｜同學｜—｜一般", "乙｜男｜同學｜—｜已故"] }) }]);
const blocks = req.messages[0].content;
A.check("1.2.14 Worker把名冊放在第一個content block並設cache_control，其餘payload在後面", Array.isArray(blocks) && blocks[0].cache_control && blocks[0].text === "【名冊】\n甲｜女｜同學｜—｜一般\n乙｜男｜同學｜—｜已故" && JSON.parse(blocks[1].text).a === 1 && !("character_roster" in JSON.parse(blocks[1].text)), blocks);
A.check("1.2.14 沒有名冊時維持字串content", typeof W.buildTurnRequest([{ role: "user", content: JSON.stringify({ a: 1 }) }]).messages[0].content === "string");
const upstreamLast = fake.calls[fake.calls.length - 1];
A.check("1.2.14 實際送到上游的請求：名冊在快取block(10.14.3起排在【少變資料】之後)", Array.isArray(upstreamLast.messages[0].content) && upstreamLast.messages[0].content.some(b => b.cache_control && /^【名冊】/.test(b.text)));

// ---------- 4.6.4 重逢(想找) ----------
ev("state.seekTarget='阿哲'");
override = () => ({ character_updates: [{ name: "阿哲", affinity_delta: 2, recent_status: "上個月開始在咖啡店打工，頭髮剪短了，還養了一隻橘貓陪自己住" }] });
await H.playTurn(g, "去找阿哲");
A.check("4.6.4 去找漸行漸遠的人：payload帶重逢與氣氛(熟悉的朋友以上一見如故)", lastPayload.relationship_event_now && lastPayload.relationship_event_now.mode === "reunion" && lastPayload.relationship_event_now.reunion_tone === "一見如故" && lastPayload.relationship_event_now.turns_apart > 12, lastPayload.relationship_event_now);
A.check("4.6.4 重逢後恢復一般、好感照一般互動計算(沒有獎勵也不扣)", ev("characterState(state.characters.find(c=>c.name==='阿哲'))") === "normal" && ev("state.characters.find(c=>c.name==='阿哲').affinity") === 74);
A.check("4.6.7 近況寫入、截到30字", ev("state.characters.find(c=>c.name==='阿哲').recentStatus") === "上個月開始在咖啡店打工，頭髮剪短了，還養了一隻橘貓陪自己住".slice(0, 30));
// scene_characters也算互動；生疏的氣氛
reset();
ev(`state.characters.push(${card({ name: "小美", affinity: 45, active: false, lastTurn: 0 })})`);
await H.playTurn(g, "繼續過日子");
A.check("4.6.4 名冊上低於熟悉的朋友：重逢時生疏", lastPayload.character_roster.some(l => /^小美｜女｜同學｜.*安靜｜漸行漸遠（重逢時：生疏）$/.test(l)), lastPayload.character_roster);
override = () => ({ scene_characters: ["小美"] });
await H.playTurn(g, "繼續過日子");
A.check("4.6.4 出現在scene_characters也算一次互動→恢復一般", ev("characterState(state.characters.find(c=>c.name==='小美'))") === "normal" && ev("state.characters.find(c=>c.name==='小美').lastTurn") === ev("state.turnCount"));

// ---------- 4.6.6 失聯 ----------
reset();
ev(`state.characters.push(${card({ name: "阿凱", affinity: 66 })}, ${card({ name: "小雨", affinity: 30, romanceStatus: "dating" })})`);
override = () => ({ contact_lost: ["阿凱", "不存在的人", "小雨"] });
await H.playTurn(g, "繼續過日子");
A.check("4.6.6 contact_lost：名冊上的人改成失聯，不存在的名字忽略", ev("state.characters.find(c=>c.name==='阿凱').lost") === true && !ev("state.characters.some(c=>c.name==='不存在的人')"));
A.check("4.6.6 交往中的對象斷聯視為分手", ev("state.characters.find(c=>c.name==='小雨').romanceStatus") === "breakup");
override = () => ({ character_updates: [{ name: "阿凱", affinity_delta: 10 }] });
await H.playTurn(g, "繼續過日子");
A.check("4.6.6 失聯期間好感凍結、不會因角色更新恢復", ev("state.characters.find(c=>c.name==='阿凱').affinity") === 66 && ev("state.characters.find(c=>c.name==='阿凱').lost") === true);
A.check("4.6.6 成功率：普通朋友以下50%／熟悉的朋友65%／多年好友80%／家人一律50%",
  ev(`lostContactFindProb({affinity:45,relation:'同學'})`) === 0.5 && ev(`lostContactFindProb({affinity:66,relation:'同學'})`) === 0.65 && ev(`lostContactFindProb({affinity:90,relation:'同學'})`) === 0.8 && ev(`lostContactFindProb({affinity:90,relation:'父親（不同住）',origin:'父母，從出生起'})`) === 0.5);
ev("renderNpcDetailModal('阿凱')");
A.check("4.6.6 失聯者的詳細頁仍有「去找他」", /去找/.test((doc.getElementById("btn-npc-seek") || {}).textContent || ""));
ev("document.getElementById('npc-detail-modal').remove()");
// 擲骰失敗
override = () => ({});
ev("state.seekTarget='阿凱'; window.__rnd = Math.random; Math.random = ()=>0.99");
let ap0 = ev("totalAP(state)");
await H.playTurn(g, "去找阿凱");
ev("Math.random = window.__rnd");
A.check("4.6.6 找人撲空：payload告訴AI失敗、仍是失聯、照常花1行動點", lastPayload.relationship_event_now.mode === "find_lost" && lastPayload.relationship_event_now.found === false && ev("state.characters.find(c=>c.name==='阿凱').lost") === true && ap0 - ev("totalAP(state)") === 1, lastPayload.relationship_event_now);
ev("state.seekTarget='阿凱'; window.__rnd = Math.random; Math.random = ()=>0.6"); // 0.6 < 0.65
await H.playTurn(g, "去找阿凱");
ev("Math.random = window.__rnd");
A.check("4.6.6 找到：恢復一般，payload帶found與重逢氣氛", lastPayload.relationship_event_now.found === true && lastPayload.relationship_event_now.reunion_tone === "一見如故" && ev("characterState(state.characters.find(c=>c.name==='阿凱'))") === "normal", lastPayload.relationship_event_now);

// ---------- 4.6.5 已故：回憶 ----------
reset();
ev(`state.characters.push(${card({ name: "老王", affinity: 70, deceased: true, active: false })}, ${card({ name: "小安", affinity: 50 })})`);
ev("renderNpcDetailModal('老王')");
A.check("4.6.5 已故者的按鈕是「回憶」", (doc.getElementById("btn-npc-seek") || {}).textContent === "回憶");
doc.getElementById("btn-npc-seek").click();
ev("render()");
A.check("4.6.5 輸入框上方標籤顯示「回憶：老王」", /回憶：老王/.test((doc.querySelector(".seek-tag") || {}).textContent || ""));
override = () => ({ character_updates: [{ name: "老王", affinity_delta: 8 }, { name: "小安", affinity_delta: 5 }] });
ap0 = ev("totalAP(state)");
await H.playTurn(g, "想起老王");
A.check("4.6.5 回想回合：payload mode=recall、花1行動點", lastPayload.relationship_event_now && lastPayload.relationship_event_now.mode === "recall" && ap0 - ev("totalAP(state)") === 1);
A.check("4.6.5 回想回合回報的好感變化一律忽略", ev("state.characters.find(c=>c.name==='老王').affinity") === 70 && ev("state.characters.find(c=>c.name==='小安').affinity") === 50);
A.check("4.6.5 已故者不因回想恢復成一般", ev("characterState(state.characters.find(c=>c.name==='老王'))") === "deceased");

// ---------- 4.6.8 滑到動態 ----------
reset();
ev(`state.characters.push(${card({ name: "阿哲", affinity: 80, active: false, lastTurn: 0, recentStatus: "在台南開了一間小咖啡店" })}, ${card({ name: "小安", affinity: 60, recentStatus: "最近在準備轉學考" })})`);
ev("state.lastFeedTurn = null");
override = () => ({});
let feeds = 0, feedFirst = null;
for (let i = 0; i < 12; i++) { await H.playTurn(g, "在家看書"); if (lastPayload.social_feed_now) { feeds++; if (!feedFirst) feedFirst = lastPayload.social_feed_now; } }
A.check("4.6.8 每10回合最多1位，優先好感最高", feeds === 2 && feedFirst.name === "阿哲" && feedFirst.recent_status === "在台南開了一間小咖啡店", { feeds, feedFirst });
A.check("4.6.8 用了不算互動、不改變狀態與好感", ev("characterState(state.characters.find(c=>c.name==='阿哲'))") === "fading" && ev("state.characters.find(c=>c.name==='阿哲').affinity") === 80);

// ---------- 5.2.6 開局失聯／已故的家長 ----------
const stats = JSON.parse(ev(`(()=>{
  let bereaved=0, deceasedCard=0, badDeceased=0, divorced=0, lostCard=0, badLost=0;
  for(let i=0;i<2000;i++){
    const st = newRoll(null,{name:'測試',gender:'女'});
    if(st.familyStructure==='單親－喪親'){
      bereaved++;
      const d = st.characters.filter(c=>c.deceased);
      if(d.length===1){ deceasedCard++; const c=d[0]; if(c.active || c.cohabiting || c.healthStage!==4 || !c.estateSettled || c.occupation==='政治人物' || characterState(c)!=='deceased') badDeceased++; }
    }
    if(st.familyStructure==='單親－離異'){
      divorced++;
      const l = st.characters.filter(c=>c.lost);
      if(l.length){ lostCard++; const c=l[0]; if(c.active || c.cohabiting || characterState(c)!=='lost' || c.occupation==='政治人物') badLost++; }
    }
  }
  return JSON.stringify({bereaved, deceasedCard, badDeceased, divorced, lostCard, badLost});
})()`));
A.check("5.2.6／4.6.2 喪親：已過世的家長建卡，一開始就是已故", stats.bereaved > 0 && stats.deceasedCard === stats.bereaved && stats.badDeceased === 0, stats);
A.check("5.2.6／4.6.2 離異沒有音訊：建卡，一開始就是失聯(約40%)", stats.lostCard / stats.divorced > 0.3 && stats.lostCard / stats.divorced < 0.5 && stats.badLost === 0, stats);
// 失聯家長不進健康狀態機
reset();
ev(`state.characters = state.characters.filter(c=>c.origin!=='父母，從出生起');
  state.characters.push({name:'爸爸',relation:'父親（不同住）',gender:'男',origin:'父母，從出生起',healthStage:1,age:75,affinity:40,active:false,cohabiting:false,lost:true,traits:'',summary:'',lastTurn:0})`);
ev("window.__rnd = Math.random; Math.random = ()=>0; for(let i=0;i<5;i++) rollParentHealthStageAdvance(state); Math.random = window.__rnd");
A.check("4.6.2 失聯的家長不進13.5健康狀態機", ev("state.characters.find(c=>c.name==='爸爸').healthStage") === 1);
A.check("4.6.2 名冊列出失聯家人", ev("buildCharacterRoster(state).some(l=>/^爸爸｜男｜.+｜失聯$/.test(l))"), js("buildCharacterRoster(state)"));

// ---------- 16.11 結算明細；34.13#1、#2；1.2.15 ----------
const st1 = { months: 1, incomeTotal: 30, expenseTotal: 20, student: true, turnNet: 460, balanceAfter: 900,
  detail: { inc: [["零用錢", 30]], exp: [["基本生活開銷", 20]] },
  extras: [["交出十六件耳環", 135, "接案收入"], ["共同創業開辦費", -317, "其他收支"], ["工作室材料分攤", -2, "其他收支"], ["醫療費", 634, "其他收支"]] };
const items = js(`buildSettlementItems(${JSON.stringify(st1)}, ${JSON.stringify(st1.extras)}.map(([label,amount,cat])=>({label,amount,cat})), ${st1.turnNet})`);
const other = items.find(x => x.label === "其他收支");
A.check("16.11 其他收支逐筆列出名稱＋金額", other && other.amount === 315 && JSON.stringify(other.details) === JSON.stringify([["共同創業開辦費", -317], ["工作室材料分攤", -2], ["醫療費", 634]]), items);
A.check("16.11 各項加起來＝本回合結餘", items.reduce((a, x) => a + x.amount, 0) === st1.turnNet);
const html = ev(`settlementHtml(${JSON.stringify(st1)}, 0)`);
A.check("16.11 結算列每項都有明細小視窗", (html.match(/class="stl-pop"/g) || []).length === 4 && /共同創業開辦費/.test(html), html);
A.check("16.11 舊格式紀錄(沒有cat)照舊顯示", ev(`settlementText({months:1,incomeTotal:30,expenseTotal:20,student:true,turnNet:15,balanceAfter:50,extras:[["打工收入",5]]}, 0)`) === "零用錢 +30，生活開銷 −20，打工收入 +5，本回合結餘 +15；目前存款 50");
// 手機點一下打開、點別處關閉
ev(`(()=>{ const d=document.createElement('div'); d.id='stl-test'; d.innerHTML=settlementHtml(${JSON.stringify(st1)},0); document.body.appendChild(d); })()`);
const it = doc.querySelector("#stl-test .stl-item:not(.plain)");
it.dispatchEvent(new g.win.MouseEvent("click", { bubbles: true }));
const opened = it.classList.contains("open");
doc.body.dispatchEvent(new g.win.MouseEvent("click", { bubbles: true }));
A.check("16.11 點一下打開、點其他地方關閉", opened && !it.classList.contains("open"));
doc.getElementById("stl-test").remove();
// 2026-09-30：34.13#1／#2(接案交件重複付、購物鏡像)所對應的舊「AI回報交件」機制已由8.13訂單簿取代，改測見test-47-order-book.mjs
override = () => ({});
// 1.2.15：程式產生的大筆支出，列給旁白、明細有名稱
override = () => ({});
ev("state.cash = 1000; noteCashEntry(state, '醫療費', -300); state.cash -= 300");
await H.playTurn(g, "在家休息");
A.check("1.2.15 程式產生、超過存款一成的支出：payload列給旁白", lastPayload.program_expenses_now && lastPayload.program_expenses_now[0].label === "醫療費" && lastPayload.program_expenses_now[0].amount === -300, lastPayload.program_expenses_now);
A.check("16.11 程式產生的支出帶名稱進其他收支明細", (js("state.log[state.log.length-1].settlement.extras") || []).some(e => e[0] === "醫療費" && e[1] === -300 && e[2] === "其他收支"));
await H.playTurn(g, "在家休息");
A.check("1.2.15 列過一次就不再重複", !lastPayload.program_expenses_now);
ev("noteCashEntry(state, '小額花費', -5)");
A.check("1.2.15 沒超過一成的不列", !(js("state.pendingExpenseMentions") || []).length);
A.check("16.11 明細只留在最近30則日記", ev("pruneSettlementDetails(state), state.log.slice(0,-35).every(e=>!e.settlement||!e.settlement.detail)"));

// ---------- prompt ----------
const fs = await import("fs");
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：名冊規則、contact_lost、recent_status、重逢、回憶、滑到動態、大筆支出", ["【精簡名冊與角色狀態", "contact_lost", "recent_status", "一見如故", "recall", "social_feed_now", "program_expenses_now"].every(k => prompt.includes(k)));

A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
