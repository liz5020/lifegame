// 2026-09-30：人際衝突線、靠近／推遠評分、收尾 outcome(十八、18.16)（全程假上游，不打真實API）
import path from "path";
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("人際衝突線");
let override = () => ({});
let lastPayload = null;
const fake = H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } });
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "cnf0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = "ap:cnf0000001:0"; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
const flags = () => ev("JSON.stringify((state.reviewFlags||[]).map(f=>JSON.stringify(f)))");
ev(`state.characters = state.characters.filter(c=>c.name!=='彥誠'); state.characters.push({name:'彥誠',relation:'朋友',gender:'男',age:16,affinity:60,active:true,traits:'',summary:'',lastTurn:state.turnCount,isChild:false})`);
const L = (id) => `state.plotLines.find(l=>l.id==='${id}')`;
const rhythm = (over) => ev(`applyNarrativeRhythmResult(state, ${JSON.stringify(over)}, { prologue:false })`);
const NEW = { text: "彥誠覺得被冷落", kind: "人際衝突", characters: ["彥誠"], main_character: "彥誠", conflict_event: "葉夜接單、找雅涵聊天、自己去逛街，都沒找他", unspoken_need: "想被放在心上，覺得自己是被優先考慮的人", resolve_condition: "葉夜的回應讓他感覺到自己被放在心上" };

// ---------- 登記與鎖定 ----------
ev("state.plotLines=[]; state.plotSeq=0; state.reviewFlags=[]; state.turnCount=10");
rhythm({ plot_new: [NEW] });
let l = js(L("p1"));
A.check("18.16.1 人際衝突線登記：三欄存檔、階段從徵兆開始、主要角色", l.kind === "人際衝突" && l.cf.event === NEW.conflict_event && l.cf.need === NEW.unspoken_need && l.cf.resolve === NEW.resolve_condition && l.cfStage === "徵兆" && l.main === "彥誠", l);
rhythm({ plot_new: [{ text: "沒填齊", kind: "人際衝突", characters: ["彥誠"], main_character: "彥誠", conflict_event: "x" }] });
A.check("18.16.1 缺三欄任一：降為一般「衝突」線並寫入錯誤紀錄", js(L("p2")).kind === "衝突" && !js(L("p2")).cf && /conflict_line_incomplete/.test(flags()));
rhythm({ plot_new: [{ text: "沒主角", kind: "人際衝突", characters: [], conflict_event: "a", unspoken_need: "b", resolve_condition: "c" }] });
A.check("18.16.1 沒有主要角色：降為一般衝突線", js(L("p3")).kind === "衝突");
ev("state.turnCount=11");
rhythm({ plot_touched: [{ id: "p1", mode: "light", conflict_event: "被改掉了", unspoken_need: "改掉", conflict_stage: "徵兆" }] });
A.check("18.16.1 三欄鎖定：之後回報帶新內容也不會改", js(L("p1")).cf.event === NEW.conflict_event && js(L("p1")).cf.need === NEW.unspoken_need);
A.check("18.16.1 其他種類(含懸念之類)維持原規則：p2是一般衝突線、沒有cf", !js(L("p2")).cf);

// ---------- 階段只能前進或停留 ----------
ev("state.turnCount=12; state.reviewFlags=[]");
rhythm({ plot_touched: [{ id: "p1", mode: "light", conflict_stage: "試探" }] });
A.check("18.16.2 階段前進：徵兆→試探", js(L("p1")).cfStage === "試探");
ev("state.turnCount=13");
rhythm({ plot_touched: [{ id: "p1", mode: "ask", conflict_stage: "試探" }] });
A.check("18.16.2 階段停留可以", js(L("p1")).cfStage === "試探");
ev("state.turnCount=14");
rhythm({ plot_touched: [{ id: "p1", mode: "light", conflict_stage: "徵兆" }] });
A.check("18.16.2 階段不可倒退：忽略並寫入錯誤紀錄", js(L("p1")).cfStage === "試探" && /conflict_stage_backward/.test(flags()));

// ---------- 提示：三欄與階段每回合給旁白 ----------
ev("state.turnCount=15");
const rh = js("prepareNarrativeRhythm(state, { seek:null, actionText:'', prologue:false, fixedEvent:false })");
const pl = rh.plot_lines.find(x => x.id === "p1");
A.check("18.16.1 每回合把三欄、階段、碰觸次數附給旁白(前面已碰4次，所以同時出現收尾要求)", pl.conflict && pl.conflict.event === NEW.conflict_event && pl.conflict.unspoken_need === NEW.unspoken_need && pl.conflict.resolve_condition === NEW.resolve_condition && pl.conflict.stage === "試探" && pl.conflict.touches === 4, pl.conflict);

// ---------- 碰觸上限與冷戰 ----------
ev("state.turnCount=16");
rhythm({ plot_touched: [{ id: "p1", mode: "light", conflict_stage: "攤牌" }] });
ev("state.turnCount=17");
const rh2 = js("prepareNarrativeRhythm(state, { seek:null, actionText:'', prologue:false, fixedEvent:false })");
A.check("18.16.4 碰觸滿4次仍未收尾：提示要求本回合收尾或升級為冷戰", /收尾，或升級為冷戰/.test(rh2.plot_lines.find(x => x.id === "p1").conflict.directive), rh2.plot_lines.find(x => x.id === "p1").conflict);
rhythm({ plot_touched: [{ id: "p1", mode: "light", conflict_stage: "攤牌", escalate_cold: true }] });
A.check("18.16.4 升級為冷戰：重新計數、只升級一次", js(L("p1")).cfEscalated === 1 && js(L("p1")).cfTouches === 1);
ev("state.turnCount=18"); rhythm({ plot_touched: [{ id: "p1", mode: "light", conflict_stage: "攤牌" }] });
ev("state.turnCount=19"); rhythm({ plot_touched: [{ id: "p1", mode: "light", conflict_stage: "攤牌" }] });
ev("state.turnCount=20"); rhythm({ plot_touched: [{ id: "p1", mode: "light", conflict_stage: "攤牌" }] });
ev("state.turnCount=21; state.plotLines.forEach(l=>{ l.pausedUntil=null; l.lastProgressTurn=state.turnCount; })"); // 18.11的「原地踏步暫停」與本測試無關，先解除
const rh3 = js("prepareNarrativeRhythm(state, { seek:null, actionText:'', prologue:false, fixedEvent:false })");
A.check("18.16.4 升級後再滿4次：必須以任一outcome收尾", /必須以任一outcome收尾/.test(rh3.plot_lines.find(x => x.id === "p1").conflict.directive));
ev("state.turnCount=22"); rhythm({ plot_touched: [{ id: "p1", mode: "light", conflict_stage: "攤牌", escalate_cold: true }] });
A.check("18.16.4 已升級過就不能再升級冷戰", js(L("p1")).cfEscalated === 1 && js(L("p1")).cfTouches === 5);

// ---------- 靠近與推遠 ----------
ev(`state.plotLines=[]; state.plotSeq=0; state.turnCount=30`);
rhythm({ plot_new: [NEW] });
ev("state.turnCount=31"); rhythm({ plot_touched: [{ id: "p1", mode: "ask", conflict_stage: "試探" }] });
ev("state.turnCount=32");
ev(`applyConflictApproach(state, { grade:'good', ability:null, target:'彥誠', approach:'approach', approach_type:'接住感受' })`);
ev(`applyConflictApproach(state, { grade:'blunder', ability:null, target:'別人', approach:'away', approach_type:'指責' })`);
A.check("18.16.3 回應靠近：往收尾推進；對象對不上的推遠不算", js(L("p1")).cfToward === 1 && js(L("p1")).cfAway === 0 && js(L("p1")).cfLastApproach === "approach");
ev(`applyConflictApproach(state, { grade:'blunder', ability:null, target:'彥誠', approach:'away', approach_type:'冷處理' })`);
ev(`applyConflictApproach(state, { grade:'plain', ability:null, target:'彥誠', approach:'neutral' })`);
A.check("18.16.3 回應推遠：升溫；中性不動", js(L("p1")).cfAway === 1 && js(L("p1")).cfToward === 1);
const rh4 = js("prepareNarrativeRhythm(state, { seek:null, actionText:'', prologue:false, fixedEvent:false })");
A.check("18.16.3 靠近／推遠的累計與上次回應給旁白判斷收尾", rh4.plot_lines[0].conflict.approach_so_far.toward === 1 && rh4.plot_lines[0].conflict.approach_so_far.away === 1 && rh4.plot_lines[0].conflict.last_response === "推遠", rh4.plot_lines[0].conflict);

// ---------- 收尾 outcome ----------
const resolveWith = (outcome) => {
  ev(`state.plotLines=[]; state.plotSeq=0; state.turnCount=40; state.reviewFlags=[]; ${"state.characters.find(c=>c.name==='彥誠')"}.affinity=50; delete ${"state.characters.find(c=>c.name==='彥誠')"}.cares; delete ${"state.characters.find(c=>c.name==='彥誠')"}.rift`);
  rhythm({ plot_new: [NEW] });
  ev("state.turnCount=41");
  rhythm({ plot_resolved: [outcome === undefined ? { id: "p1" } : { id: "p1", outcome }] });
  return js("state.characters.find(c=>c.name==='彥誠')");
};
let c = resolveWith("和好");
A.check("18.16.4 和好：好感+5、人物卡新增一行「他在意的，其實是○○」", c.affinity === 55 && c.cares[0] === NEW.unspoken_need && !c.rift && ev("state.plotLines[0].status") === "resolved" && ev("state.plotLines[0].cfOutcome") === "和好", c);
ev("window.__card = rosterCard(state.characters.find(c=>c.name==='彥誠'))");
A.check("18.16.4 通訊錄人物列顯示「他在意的，其實是…」", /他在意的，其實是想被放在心上/.test(ev("window.__card")));
c = resolveWith("各退一步");
A.check("18.16.4 各退一步：好感+2、不新增人物卡那一行", c.affinity === 52 && !c.cares && !c.rift, c);
c = resolveWith("裂痕");
A.check("18.16.4 裂痕：好感−5、人物卡記「裂痕」標記(供分手前提用)", c.affinity === 45 && c.rift === true && !c.cares, c);
c = resolveWith(undefined);
A.check("18.16.4 收尾沒回報outcome：寫入錯誤紀錄、當作各退一步", c.affinity === 52 && /conflict_outcome_missing/.test(flags()));
ev(`state.plotLines=[]; state.plotSeq=0; state.turnCount=50; rhythm=0`);
rhythm({ plot_new: [{ text: "普通衝突", kind: "衝突", characters: ["彥誠"], main_character: "彥誠" }] });
ev("state.turnCount=51"); ev("state.characters.find(c=>c.name==='彥誠').affinity=50");
rhythm({ plot_resolved: ["p1"] });
A.check("舊格式(只有id字串)照常解開，一般線不套用outcome", ev("state.plotLines[0].status") === "resolved" && ev("state.characters.find(c=>c.name==='彥誠').affinity") === 50);

// ---------- 已收尾不得重演 ----------
resolveWith("和好");
const cc = js("closedConflictsPayload(state)");
A.check("18.16.4 已收尾的線每回合告知「此事已落幕」，不得再寫同一件事的攤牌", cc && cc[0].id === "p1" && /此事已落幕/.test(cc[0].note) && cc[0].outcome === "和好", cc);
ev("state.turnCount=60");
const rh5 = js("prepareNarrativeRhythm(state, { seek:null, actionText:'', prologue:false, fixedEvent:false })");
A.check("提示：conflict_closed跟著narrative_rhythm送給旁白", Array.isArray(rh5.conflict_closed) && rh5.conflict_closed.length === 1);

// ---------- 整回合流程 ----------
ev("state.plotLines=[]; state.plotSeq=0");
ev("state.timeState.segmentIndex=YEAR_SEGMENTS.findIndex(x=>x.key==='期中準備期'); state.timeState.turnsInSegment=1");
override = () => ({ plot_new: [NEW] });
await H.playTurn(g, "嗯");
override = () => ({});
A.check("整回合：旁白登記人際衝突線→存檔鎖定，之後payload帶conflict三欄", ev("(state.plotLines||[]).some(l=>l.cf && l.cf.need)"));
await H.playTurn(g, "嗯");
const pline = (lastPayload.narrative_rhythm.plot_lines || []).find(x => x.conflict);
A.check("整回合：下一回合提示帶conflict三欄與階段", pline && pline.conflict.unspoken_need === NEW.unspoken_need && pline.conflict.stage === "徵兆", pline);

const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：人際衝突線規則(三欄、四階段、靠近推遠、outcome、冷戰、已落幕、自然口語)與欄位", ["人際衝突", "conflict_event", "unspoken_need", "resolve_condition", "conflict_stage", "escalate_cold", "和好", "各退一步", "裂痕", "此事已落幕", "教科書式"].every(k => prompt.includes(k)));
A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
