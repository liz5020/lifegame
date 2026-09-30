// 2026-09-30：關係里程碑——場面＋玩家點頭、曖昧中、分手場面、防止重演(四、4.8)（全程假上游，不打真實API）
import path from "path";
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("關係里程碑");
let override = () => ({});
let lastPayload = null;
const fake = H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } });
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "rom0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = "ap:rom0000001:0"; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
const flags = () => ev("JSON.stringify((state.reviewFlags||[]).map(f=>JSON.stringify(f)))");
const npc = (name, extra = "") => ev(`state.characters = state.characters.filter(c=>c.name!==${JSON.stringify(name)}); state.characters.push({name:${JSON.stringify(name)},relation:'朋友',gender:'女',age:26,affinity:60,active:true,traits:'',summary:'',lastTurn:state.turnCount,isChild:false${extra}})`);
const C = (n) => `state.characters.find(c=>c.name==='${n}')`;
ev("state.age=26; state.timeState.segmentIndex=YEAR_SEGMENTS.findIndex(x=>x.key==='期中準備期'); state.timeState.turnsInSegment=1");

// ---------- 曖昧中 ----------
npc("怡君");
ev(`for(let i=0;i<3;i++) applyRomanceSignal(state, ${C("怡君")}, 'positive')`);
A.check("4.8 對同一角色累積3次正面感情訊號：曖昧中", ev(`${C("怡君")}.romanceStatus`) === "ambiguous");
ev(`for(let i=0;i<20;i++) applyRomanceSignal(state, ${C("怡君")}, 'positive')`);
A.check("4.8 訊號再多也不會自己變成交往(需要告白場面＋點頭)", ev(`${C("怡君")}.romanceStatus`) === "ambiguous");
ev(`applyRomanceSignal(state, ${C("怡君")}, 'negative')`);
A.check("4.8 曖昧中累積1次負面：仍是曖昧中", ev(`${C("怡君")}.romanceStatus`) === "ambiguous");
ev(`applyRomanceSignal(state, ${C("怡君")}, 'negative')`);
A.check("4.8 曖昧中累積2次負面訊號：解除", ev(`${C("怡君")}.romanceStatus`) === null && ev(`${C("怡君")}.romanceProgress`) === 0);

// ---------- 對方告白 ----------
npc("小雨", ",romanceStatus:'ambiguous',romanceProgress:5");
ev("state.reviewFlags=[]; applyConfessionReports(state, { confession_from_npc:'小雨' })");
A.check("4.8 對方告白：登記待回應的告白", js("state.pendingConfession").name === "小雨");
let ch = js("enforceConfessionChoices(state, ['聊聊天','答應她','回家','看電影'])");
A.check("4.8 選項必須含答應／還不確定／拒絕三種(旁白已有的保留、缺的補上，最多4個)", ch.length === 4 && ch.some(t => /答應/.test(t)) && ch.some(t => /還不確定/.test(t)) && ch.some(t => /拒絕/.test(t)) && ch.includes("答應她"), ch);
ev("state.pendingConfession.turn = state.turnCount");
ch = js("enforceConfessionChoices(state, ['A','B','C','D'])");
A.check("4.8 旁白完全沒寫回應選項：補上三個(預設文字)", ch.length === 4 && ch.filter(t => /答應|還不確定|拒絕/.test(t)).length === 3, ch);
const acceptText = ev("state.pendingConfession.choices.accept");
let scene = js(`prepareRelationScene(state, ${JSON.stringify(acceptText)})`);
A.check("4.8 玩家選「答應」：交往成立、交給旁白寫成立場面、記下開始月份、第一次戀愛里程碑", scene && scene.mode === "started_dating" && ev(`${C("小雨")}.romanceStatus`) === "dating" && ev(`${C("小雨")}.datingSinceAbs`) != null && ev("state.milestones.first_romance") === "completed" && ev("state.pendingConfession") === null, scene);
const hints = [];
ev(`window.__h = []; applyRelationScene(state, ${JSON.stringify(scene)}, window.__h)`);
A.check("4.8 「你和○○開始交往了」提示與成立場面同一回合", /你和小雨開始交往了/.test(ev("JSON.stringify(window.__h)")));
const facts = js("relationshipFactsPayload(state)");
A.check("4.8 之後每回合提示「你們從○月開始交往」防止重演", facts && /^你們從\d+月開始交往$/.test(facts.find(f => f.name === "小雨").note), facts);
// 還不確定／拒絕／自由輸入
npc("阿柔", ",romanceStatus:'ambiguous',romanceProgress:5");
ev("state.pendingConfession={name:'阿柔',turn:0,choices:{accept:'答應阿柔',unsure:'還不確定',reject:'拒絕阿柔'}}");
scene = js("prepareRelationScene(state, '還不確定')");
A.check("4.8 選「還不確定」：狀態不變", scene.mode === "confession_unsure" && ev(`${C("阿柔")}.romanceStatus`) === "ambiguous");
ev("state.pendingConfession={name:'阿柔',turn:0,choices:{}}");
scene = js("prepareRelationScene(state, '我們在一起吧，我願意')");
A.check("4.8 自由輸入寫「我願意」：視為答應", scene.mode === "started_dating" && ev(`${C("阿柔")}.romanceStatus`) === "dating");
npc("阿柔", ",romanceStatus:'ambiguous',romanceProgress:5");
ev("state.pendingConfession={name:'阿柔',turn:0,choices:{accept:'答應阿柔',unsure:'還不確定',reject:'拒絕阿柔'}}");
scene = js("prepareRelationScene(state, '拒絕阿柔')");
A.check("4.8 選「拒絕」：回到朋友(狀態清空)", scene.mode === "confession_rejected" && ev(`${C("阿柔")}.romanceStatus`) === null);
ev("state.pendingConfession={name:'阿柔',turn:0,choices:{}}");
scene = js("prepareRelationScene(state, '不答應')");
A.check("4.8 自由輸入「不答應」：不算答應(拒絕優先於答應)", scene.mode === "confession_rejected");
ev("state.pendingConfession={name:'阿柔',turn:0,choices:{}}");
scene = js("prepareRelationScene(state, '去吃飯')");
A.check("4.8 選了別的事：當作還沒答覆，告白只有一回合有效", scene.mode === "confession_unsure" && ev("state.pendingConfession") === null);

// ---------- 玩家告白 ----------
ev("window.__rnd = Math.random");
const rollP = (name, r) => { ev(`Math.random = ()=>${r}; state.confessionResultNext=null; applyConfessionReports(state, { confession_from_player:'${name}' })`); ev("Math.random = window.__rnd"); return js("state.confessionResultNext"); };
npc("曖昧甲", ",romanceStatus:'ambiguous',romanceProgress:5,affinity:30");
A.check("4.8 玩家告白：曖昧中80%(0.79成功、0.81失敗)", rollP("曖昧甲", 0.79).success === true && rollP("曖昧甲", 0.81).success === false);
npc("熟朋友", ",affinity:65");
A.check("4.8 玩家告白：熟悉的朋友以上40%(0.39成功、0.41失敗)", rollP("熟朋友", 0.39).success === true && rollP("熟朋友", 0.41).success === false);
npc("點頭之交", ",affinity:10");
A.check("4.8 玩家告白：其他10%(0.09成功、0.11失敗)", rollP("點頭之交", 0.09).success === true && rollP("點頭之交", 0.11).success === false);
ev("state.confessionResultNext={name:'熟朋友',success:true}");
scene = js("prepareRelationScene(state, '嗯')");
A.check("4.8 玩家告白成功：下一回合交給旁白寫、交往成立", scene.mode === "started_dating" && ev(`${C("熟朋友")}.romanceStatus`) === "dating" && ev(`${C("熟朋友")}.beganAsMinors`) === false);
ev("state.confessionResultNext={name:'點頭之交',success:false}");
scene = js("prepareRelationScene(state, '嗯')");
A.check("4.8 玩家告白失敗：旁白寫被婉拒、狀態不變", scene.mode === "player_confession_declined" && !ev(`${C("點頭之交")}.romanceStatus`));

// ---------- 不符條件 ----------
ev("state.reviewFlags=[]; state.pendingConfession=null; state.confessionResultNext=null");
ev("applyConfessionReports(state, { confession_from_npc:'小雨' })");
A.check("4.8 已經在交往的對象再告白：不處理並寫入錯誤紀錄", ev("state.pendingConfession") === null && /confession_invalid/.test(flags()));
ev("state.reviewFlags=[]; applyConfessionReports(state, { confession_from_npc:'媽媽' })");
A.check("4.8 家人告白：不處理", ev("state.pendingConfession") === null && /confession_invalid/.test(flags()));
npc("未成年學弟", ",age:12");
ev("state.age=26; state.reviewFlags=[]; applyConfessionReports(state, { confession_from_player:'未成年學弟' })");
A.check("4.8 年齡不符(一方成年一方未成年)：沿用1.2.11.3規則，不處理", ev("state.confessionResultNext") === null && /confession_invalid/.test(flags()));

// ---------- 分手 ----------
ev("state.pendingBreakup=null");
npc("阿峰", ",romanceStatus:'dating',romanceNegativeStreak:2,affinity:60");
ev(`applyRomanceSignal(state, ${C("阿峰")}, 'negative')`);
A.check("4.8 連續負面達門檻但好感沒低於門檻、沒有裂痕：NPC不會主動提分手", ev("state.pendingBreakup") === null && ev(`${C("阿峰")}.romanceStatus`) === "dating");
ev(`${C("阿峰")}.romanceNegativeStreak=2; ${C("阿峰")}.rift=true; applyRomanceSignal(state, ${C("阿峰")}, 'negative')`);
A.check("4.8 有「裂痕」標記：排入分手場面，但狀態還沒改", js("state.pendingBreakup").name === "阿峰" && ev(`${C("阿峰")}.romanceStatus`) === "dating");
scene = js("prepareRelationScene(state, '嗯')");
A.check("4.8 下一回合提示旁白寫分手場面", scene.mode === "breakup" && scene.name === "阿峰");
ev(`window.__h = []; applyRelationScene(state, ${JSON.stringify(scene)}, window.__h)`);
A.check("4.8 場面那一回合結束才改狀態為分手、同回合提示", ev(`${C("阿峰")}.romanceStatus`) === "breakup" && ev("state.pendingBreakup") === null && /你和阿峰分手了/.test(ev("JSON.stringify(window.__h)")));
npc("小低", ",romanceStatus:'dating',romanceNegativeStreak:2,affinity:30");
ev(`state.pendingBreakup=null; applyRomanceSignal(state, ${C("小低")}, 'negative')`);
A.check("4.8 好感低於交往門檻：可以主動提分手", js("state.pendingBreakup").name === "小低");
ev("state.pendingBreakup=null");
npc("小玉", ",romanceStatus:'stable',affinity:80");
ev(`${C("小低")}.romanceStatus='breakup'`);
scene = js("prepareRelationScene(state, '我想跟小玉分手')");
A.check("4.8 玩家自己提分手：這一回合就寫分手場面", scene && scene.mode === "breakup" && scene.name === "小玉" && /玩家/.test(scene.by));
ev("state.pendingBreakup=null");

// ---------- 整回合流程 ----------
npc("小晴", ",romanceStatus:'ambiguous',romanceProgress:5");
ev("state.pendingConfession=null; state.pendingBreakup=null; state.confessionResultNext=null; state.lastDeviated=false");
override = () => ({ confession_from_npc: "小晴", choices: ["去散步", "回家", "看書", "睡覺"] });
await H.playTurn(g, "跟小晴聊天");
A.check("整回合：旁白回報confession_from_npc→下一回合選項含三種回應", ev("state.choices.some(t=>/答應/.test(t)) && state.choices.some(t=>/還不確定/.test(t)) && state.choices.some(t=>/拒絕/.test(t))") && ev("state.pendingConfession.name") === "小晴", ev("JSON.stringify(state.choices)"));
override = () => ({});
const ac = ev("state.pendingConfession.choices.accept");
await H.playTurn(g, ac);
A.check("整回合：選答應→提示含relationship_scene_now(started_dating)、交往成立、日記提示", lastPayload.relationship_scene_now && lastPayload.relationship_scene_now.mode === "started_dating" && ev(`${C("小晴")}.romanceStatus`) === "dating" && /你和小晴開始交往了/.test(ev("JSON.stringify(state.log[state.log.length-1].relationshipHints)")), lastPayload.relationship_scene_now);
await H.playTurn(g, "嗯");
const rf = (lastPayload.relationship_facts || []).find(f => f.name === "小晴");
A.check("整回合：下一回合不再有成立場面，改帶「你們從○月開始交往」", !lastPayload.relationship_scene_now && rf && /開始交往/.test(rf.note), rf);
A.check("整回合：告白回應那一回合不偏離", ev("(()=>{ state.lastDeviated=false; state.pendingConfession={name:'x',turn:0}; return rollChoiceDeviation(state,{fromChoice:true}); })()") === false);
ev("state.pendingConfession=null");

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：關係里程碑規則與欄位", ["confession_from_npc", "confession_from_player", "relationship_scene_now", "relationship_facts", "started_dating", "第二次告白"].every(k => prompt.includes(k)));
A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
