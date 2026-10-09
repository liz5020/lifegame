// 2026-10-08：興趣多元化(八、8.8.1～8.8.3)——程式擲出興趣種子(類別＋項目)、已有類別減半、不連續同類、項目欄位與舊存檔相容（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("興趣種子與項目");
let override = () => ({});
let lastPayload = null;
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } }));
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "seed0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = `ap:${H.loc("seed0000001")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };

// ---------- 8.8.1 項目清單 ----------
A.check("8.8.1 七類都有項目清單，每類6～8項、沒有重複", js("INTEREST_CATEGORIES.every(c=>INTEREST_ITEMS[c]&&INTEREST_ITEMS[c].length>=6&&INTEREST_ITEMS[c].length<=8&&new Set(INTEREST_ITEMS[c]).size===INTEREST_ITEMS[c].length)"));
A.check("8.8.1 清單不多也不少：正好七類", js("Object.keys(INTEREST_ITEMS).length===7&&Object.keys(INTEREST_ITEMS).every(c=>INTEREST_CATEGORIES.includes(c))"));

// ---------- 8.8.2 類別抽選比例 ----------
const dist = (setup, n = 14000) => js(`(()=>{ const s={interestCandidates:${setup}, interestSeedLast:null}; const cnt={}; for(let i=0;i<${n};i++){ s.interestSeedLast=null; const r=rollInterestSeed(s); cnt[r.category]=(cnt[r.category]||0)+1; } return cnt; })()`);
const near = (v, exp, tol) => Math.abs(v - exp) <= tol;
{
  const d = dist("[]");
  A.check("8.8.2 沒有任何興趣卡：七類大致均等(各約14.3%)", Object.keys(d).length === 7 && Object.values(d).every(v => near(v / 14000, 1 / 7, 0.02)), d);
  A.check("8.8.2 手作工藝不再獨佔：占比不超過17%", d["手作工藝"] / 14000 < 0.17, d["手作工藝"] / 14000);
}
{
  const d = dist("[{category:'手作工藝',status:'active',item:'飾品',investment:30}]");
  const expHave = 0.5 / 6.5, expOther = 1 / 6.5;
  A.check("8.8.2 已有正式興趣卡的類別權重減半(約7.7%)，其他類別約15.4%", near(d["手作工藝"] / 14000, expHave, 0.015) && ["藝術創作", "知識研究", "體能競技", "科技邏輯", "社交表演", "商業交易"].every(c => near(d[c] / 14000, expOther, 0.02)), d);
}
{
  const d = dist("[{category:'手作工藝',status:'candidate',item:'飾品',investment:5},{category:'藝術創作',status:'dormant',item:'繪畫',investment:20}]");
  A.check("8.8.2 候選與背景興趣不算「已有正式興趣卡」：不減半", near(d["手作工藝"] / 14000, 1 / 7, 0.02) && near(d["藝術創作"] / 14000, 1 / 7, 0.02), d);
}
{
  const all = js("INTEREST_CATEGORIES").map(c => `{category:'${c}',status:'active',item:INTEREST_ITEMS['${c}'][0],investment:30}`).join(",");
  const d = dist(`[${all}]`);
  A.check("8.8.2 七類都已有正式興趣卡：恢復均等", Object.keys(d).length === 7 && Object.values(d).every(v => near(v / 14000, 1 / 7, 0.02)), d);
}
// 不連續兩次同類
{
  const r = js(`(()=>{ const s={interestCandidates:[], interestSeedLast:null}; let prev=null, dup=0; for(let i=0;i<5000;i++){ const x=rollInterestSeed(s); if(x.category===prev) dup++; prev=x.category; s.interestSeedLast=x.category; } return dup; })()`);
  A.check("8.8.2 連續5000次擲骰：沒有任何連續兩次同類", r === 0, r);
}
// 項目：該類已有卡時改抽其他項目
{
  const r = js(`(()=>{ const s={interestCandidates:[{category:'手作工藝',status:'active',item:'陶藝',investment:30}], interestSeedLast:null}; let same=0, tot=0; for(let i=0;i<8000;i++){ s.interestSeedLast=null; const x=rollInterestSeed(s); if(x.category==='手作工藝'){ tot++; if(x.item==='陶藝') same++; } } return {same,tot}; })()`);
  A.check("8.8.2 抽到已有卡的類別時：項目一律改抽其他項目", r.tot > 100 && r.same === 0, r);
}
{
  const r = js(`(()=>{ const s={interestCandidates:[], interestSeedLast:null}; const items=new Set(); for(let i=0;i<8000;i++){ s.interestSeedLast=null; const x=rollInterestSeed(s); if(x.category==='手作工藝') items.add(x.item); } return [...items]; })()`);
  A.check("8.8.2 沒有卡時：項目涵蓋清單內全部手作項目，且都在清單內", r.length === 8 && r.every(i => js("INTEREST_ITEMS['手作工藝']").includes(i)), r);
}

// ---------- 8.8.2 prepareInterestSeed：什麼時候擲 ----------
const prep = (focus, opts, rnd) => js(`(()=>{ const o=Math.random; Math.random=()=>${rnd}; try{ const s={interestCandidates:[], interestSeedLast:null}; const r=prepareInterestSeed(s, ${focus}, ${opts}); return {r, last:s.interestSeedLast}; } finally { Math.random=o; } })()`);
{
  const a = prep("{key:'rest'}", "{}", 0.01);
  A.check("8.8.2 重心不是興趣、擲中8%：產生自然種子，並記下上次類別", a.r && a.r.kind === "natural" && a.r.category && a.r.item && a.last === a.r.category, a);
  const b = prep("{key:'rest'}", "{}", 0.5);
  A.check("8.8.2 重心不是興趣、沒擲中：沒有種子", b.r === null && b.last === null, b);
  const c = prep("{key:'interest', interestCategory:'藝術創作', interestCardId:'x'}", "{}", 0.01);
  A.check("8.8.2 重心指定了興趣卡：不擲(即使機率會中)", c.r === null, c);
  const d = prep("{key:'interest', interestCategory:null, interestCardId:null}", "{}", 0.5);
  A.check("8.8.2 重心是「嘗試新的」：必定產生種子(try_new)，不看8%", d.r && d.r.kind === "try_new" && d.r.category && d.r.item, d);
  const e = prep("{key:'work', gigCategory:'手作工藝'}", "{}", 0.01);
  A.check("8.8.2 重心是「工作：副業」：不擲", e.r === null, e);
  const f = prep("{key:'rest'}", "{prologue:true}", 0.01);
  const f2 = prep("{key:'rest'}", "{skip:true}", 0.01);
  const f3 = prep("{key:'rest'}", "{ending:true}", 0.01);
  A.check("8.8.2 開場、跳過指令、死亡結局那一回合：不擲", f.r === null && f2.r === null && f3.r === null);
  const h = prep("null", "{}", 0.01);
  A.check("8.8.2 沒有重心(自由輸入)的回合：仍可擲出自然種子", h.r && h.r.kind === "natural", h);
}

// ---------- 8.8.2 接進回合：嘗試新的 ----------
ev("state.interestCandidates=[]; state.interestSeedLast=null; state.focus='interest'; state.focusInterestId='new'");
override = () => ({ interest_event: { category: "__錯誤類別__", reaction: "positive" } });
await H.playTurn(g, "嗯");
const tf = lastPayload.turn_focus;
A.check("嘗試新的：payload有 try_new_suggestion {category,item}", tf && tf.try_new_suggestion && js("INTEREST_CATEGORIES").includes(tf.try_new_suggestion.category) && js(`INTEREST_ITEMS['${tf.try_new_suggestion.category}']`).includes(tf.try_new_suggestion.item), tf);
A.check("嘗試新的：這回合 interest_seed_now 是 null", lastPayload.interest_seed_now == null, lastPayload.interest_seed_now);
const cards1 = js("state.interestCandidates");
A.check("嘗試新的：AI回報的類別不符時，以程式指定為準建成候選卡，並記下項目", cards1.length === 1 && cards1[0].category === tf.try_new_suggestion.category && cards1[0].item === tf.try_new_suggestion.item, cards1);
A.check("嘗試新的：類別不符寫入錯誤紀錄 interest_event_mismatch", js("(state.reviewFlags||[]).some(f=>f.kind==='interest_event_mismatch')"));
A.check("嘗試新的：記下上次種子類別(供不連續同類)", ev("state.interestSeedLast") === tf.try_new_suggestion.category);
const firstItem = cards1[0].item;

// 類別相符：不記錯誤
const flags0 = js("(state.reviewFlags||[]).filter(f=>f.kind==='interest_event_mismatch').length");
override = (p) => ({ interest_event: { category: p.turn_focus.try_new_suggestion.category, reaction: "positive" } });
ev("state.focus='interest'; state.focusInterestId='new'");
await H.playTurn(g, "嗯");
const flags1 = js("(state.reviewFlags||[]).filter(f=>f.kind==='interest_event_mismatch').length");
A.check("類別相符：不寫錯誤紀錄", flags1 === flags0, [flags0, flags1]);
A.check("連續兩回合嘗試新的：兩次種子類別不同(不連續同類)", lastPayload.turn_focus.try_new_suggestion.category !== cards1[0].category, [lastPayload.turn_focus.try_new_suggestion.category, cards1[0].category]);

// ---------- 8.8.4 每個項目各自成卡（2026-10-09） ----------
const card0 = (id, category, item, extra = "") => `{id:'${id}',category:'${category}',item:${item ? `'${item}'` : "null"},status:'active',investment:30,positiveStreak:0,candidateProgress:3,lastEngagedRound:state.turnCount-1,sideBusinessOffered:false${extra}}`;
ev(`state.interestCandidates=[${card0("k1", "手作工藝", "飾品")}]; state.interestSeedLast=null`);
ev("applyInterestEvent(state,{category:'手作工藝',item:'陶藝',reaction:'positive'})");
A.check("8.8.4 AI回報清單內的新項目(陶藝)：另開新卡(候選)，原卡不動", js("state.interestCandidates.length")===2 && js("state.interestCandidates[0].item")==="飾品" && js("state.interestCandidates[0].investment")===30 && js("state.interestCandidates[1].item")==="陶藝" && js("state.interestCandidates[1].status")==="candidate");
ev("applyInterestEvent(state,{category:'手作工藝',item:'陶藝',reaction:'positive'})");
A.check("8.8.4 同項目再回報：記到同一張卡，不再開新卡", js("state.interestCandidates.length")===2 && js("state.interestCandidates[1].candidateProgress")===2);
ev("state.interestCandidates[0].lastEngagedRound = state.turnCount; state.interestCandidates[1].lastEngagedRound = state.turnCount-3");
ev("applyInterestEvent(state,{category:'手作工藝',reaction:'positive'})");
A.check("8.8.4 沒回報項目：記到該類別最近一次投入的卡(飾品)", js("state.interestCandidates[0].investment")>30 && js("state.interestCandidates[1].candidateProgress")===2 && js("state.interestCandidates.length")===2);
const inv0 = js("state.interestCandidates[0].investment");
ev("applyInterestEvent(state,{category:'手作工藝',item:'亂寫的項目',reaction:'positive'})");
A.check("8.8.4 回報的項目不在清單內：當作沒回報，記到最近投入的卡，不開新卡", js("state.interestCandidates.length")===2 && js("state.interestCandidates[0].investment")>inv0);
const inv1 = js("state.interestCandidates[1].candidateProgress");
ev("applyInterestEvent(state,{category:'手作工藝',cardId:'k1',item:'陶藝',reaction:'positive'})");
A.check("8.8.4 指定cardId(重心選了那張卡)：一律記到那張，AI回報的項目忽略", js("state.interestCandidates[1].candidateProgress")===inv1 && js("state.interestCandidates.length")===2);
ev("applyInterestEvent(state,{category:'手作工藝',item:'烘焙',fromSeed:true,reaction:'neutral'})");
A.check("8.8.4 程式擲出的種子項目(烘焙)：另開新卡", js("state.interestCandidates.length")===3 && js("state.interestCandidates[2].item")==="烘焙");
ev(`state.interestCandidates=[${card0("o1", "手作工藝", null)}]`);
ev("applyInterestEvent(state,{category:'手作工藝',item:'飾品',fromSeed:true,reaction:'positive'})");
A.check("8.8.4 舊存檔的卡(沒有項目)：繼續當「手作工藝・未指定」，新項目另開新卡，舊卡不補項目", js("state.interestCandidates.length")===2 && js("state.interestCandidates[0].item")===null && js("state.interestCandidates[1].item")==="飾品");
{
  const r = js(`(()=>{ const s={interestCandidates:[{category:'手作工藝',status:'active',item:'飾品'},{category:'手作工藝',status:'candidate',item:'陶藝'}], interestSeedLast:null}; let bad=0, tot=0; for(let i=0;i<8000;i++){ s.interestSeedLast=null; const x=rollInterestSeed(s); if(x.category==='手作工藝'){ tot++; if(x.item==='飾品'||x.item==='陶藝') bad++; } } return {bad,tot}; })()`);
  A.check("8.8.4 種子不再抽已經擁有的項目(不分卡的狀態)", r.tot > 100 && r.bad === 0, r);
  const r2 = js(`(()=>{ const all=INTEREST_ITEMS['藝術創作'].map(i=>({category:'藝術創作',status:'active',item:i})); const s={interestCandidates:all, interestSeedLast:null}; let art=0; for(let i=0;i<4000;i++){ s.interestSeedLast=null; if(rollInterestSeed(s).category==='藝術創作') art++; } return art; })()`);
  A.check("8.8.4 某類別的項目全都擁有後：不再抽到那一類(改抽別類)", r2 === 0, r2);
}
{
  ev(`state.interestCandidates=[${card0("m1", "手作工藝", "金工")}, ${card0("m2", "手作工藝", "飾品")}]; state.focusInterestId='m2'; state.focus='interest'; state.focusWorkId=null`);
  const it = js("buildFocusItem(state,'interest','')");
  A.check("8.8.4 重心選第二張卡：focus帶cardId與「類別・項目」標籤", it.interestCardId === "m2" && it.interestLabel === "手作工藝・飾品", it);
  const bar = ev("renderFocusBar(state,false)");
  A.check("8.8.4 重心按鈕顯示「興趣：手作工藝・飾品」", bar.includes("興趣：手作工藝・飾品"), bar.slice(0, 200));
  ev("interestPickerOpen = true");
  const bar2 = ev("renderFocusBar(state,false)");
  A.check("8.8.4 選單每張卡一顆按鈕：手作工藝・金工、手作工藝・飾品", bar2.includes(">手作工藝・金工</button>") && bar2.includes(">手作工藝・飾品</button>"));
  ev("interestPickerOpen = false");
  const before = js("[state.interestCandidates[0].investment, state.interestCandidates[1].investment]");
  ev("applyFocusSettlement && 0"); // 確認函式存在不報錯
  ev("applyInterestEvent(state,{category:'手作工藝',cardId:'m2',reaction:'positive'})");
  A.check("8.8.4 只有被選的那張卡增加投入(金工不動，飾品增加)", js("state.interestCandidates[0].investment")===before[0] && js("state.interestCandidates[1].investment")>before[1]);
  ev("state.interestCandidates[0].sideBusinessStatus='formal'; state.interestCandidates[1].sideBusinessStatus='formal'");
  const op = js("orderPayload(state).map(x=>x.category)");
  A.check("8.8.4 訂單簿payload的類別帶項目：手作工藝・金工／手作工藝・飾品", op.includes("手作工藝・金工") && op.includes("手作工藝・飾品"), op);
  ev("registerOrders(state,[{category:'手作工藝・金工',client:'阿美',item:'戒指',size:'small'}])");
  A.check("8.8.4 AI用「類別・項目」回報訂單：登記到對的那張(金工)", js("(state.interestCandidates[0].gigOrders||[]).length")===1 && js("(state.interestCandidates[1].gigOrders||[]).length")===0, js("state.interestCandidates.map(c=>(c.gigOrders||[]).length)"));
  ev("state.interestCandidates[0].gigOrders=[]");
  ev("registerOrders(state,[{category:'手作工藝',client:'老王',item:'胸針',size:'small'}])");
  A.check("8.8.4 只回報類別：退回同類別第一張卡", js("(state.interestCandidates[0].gigOrders||[]).length")===1 && js("(state.interestCandidates[1].gigOrders||[]).length")===0);
  ev("registerOrders(state,[{category:'手作工藝・飾品',client:'小張',item:'耳環',size:'small'}])");
  A.check("8.8.4 用「手作工藝・飾品」回報：登記到飾品那張", js("(state.interestCandidates[1].gigOrders||[]).length")===1);
}

// ---------- 8.8.2 接進回合：自然種子 ----------
ev("state.interestCandidates=[]; state.interestSeedLast=null; state.focus='rest'");
override = (p) => ({ interest_event: p.interest_seed_now ? { category: p.interest_seed_now.category, reaction: "positive" } : null });
const origRandom = g.win.Math.random;
g.win.Math.random = () => 0.01;
await H.playTurn(g, "嗯");
g.win.Math.random = origRandom;
const ns = lastPayload.interest_seed_now;
A.check("自然種子：payload有 interest_seed_now {category,item}，且不放進 turn_focus", ns && ns.category && ns.item && !(lastPayload.turn_focus && lastPayload.turn_focus.try_new_suggestion), ns);
A.check("自然種子：AI照種子回報，建出該類別的候選卡並記下項目", js("state.interestCandidates.some(c=>c.category==='"+(ns && ns.category)+"'&&c.item==='"+(ns && ns.item)+"')"));
ev("state.focus='rest'");
override = () => ({});
g.win.Math.random = () => 0.5;
await H.playTurn(g, "嗯");
g.win.Math.random = origRandom;
A.check("沒擲中的回合：interest_seed_now 是 null", lastPayload.interest_seed_now == null, lastPayload.interest_seed_now);

// ---------- 8.8.3 項目欄位與舊存檔相容 ----------
ev("state.interestCandidates=[{id:'o1',category:'手作工藝',status:'active',investment:30,positiveStreak:0,candidateProgress:3,lastEngagedRound:state.turnCount,sideBusinessOffered:false},{id:'n1',category:'體能競技',item:'登山',status:'active',investment:12,positiveStreak:0,candidateProgress:3,lastEngagedRound:state.turnCount,sideBusinessOffered:false}]");
A.check("8.8.3 interestCardLabel：有項目顯示「類別・項目」，舊卡只顯示類別", ev("interestCardLabel(state.interestCandidates[1])") === "體能競技・登山" && ev("interestCardLabel(state.interestCandidates[0])") === "手作工藝");
const html = ev("state.interestCandidates.map(renderInterestCardHtml).join('')");
A.check("8.8.3 興趣面板：新卡顯示「體能競技・登山」，舊卡顯示「手作工藝」", html.includes("體能競技・登山") && html.includes("<b>手作工藝</b>"));
override = () => ({});
ev("state.focus='rest'");
await H.playTurn(g, "嗯");
A.check("8.8.3 interest_status 帶項目，舊卡 item 為 null", lastPayload.interest_status.find(c => c.category === "體能競技").item === "登山" && lastPayload.interest_status.find(c => c.category === "手作工藝").item === null, lastPayload.interest_status);
A.check("8.8.3 舊存檔(卡沒有item)：存檔、重新讀取後仍可繼續玩", (() => { try { ev("JSON.parse(JSON.stringify(state)).interestCandidates.forEach(c=>interestCardLabel(c))"); return true; } catch (e) { return false; } })());

// ---------- prompt ----------
const fs = await import("fs"); const path = await import("path");
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：提到 interest_seed_now、try_new_suggestion，要求照指定類別項目寫、不預設手作", ["interest_seed_now", "try_new_suggestion", "不要預設寫成手作"].every(k => prompt.includes(k)));
A.check("prompt：訂單範例不再只舉手作", ["活動照片", "家教", "剪輯"].every(k => prompt.includes(k)));

A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
