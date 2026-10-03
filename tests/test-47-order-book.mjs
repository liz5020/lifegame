// 2026-09-30：副業訂單簿(八、8.13)、「工作」重心(二、2.8.2)（全程假上游，不打真實API）
import path from "path";
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("副業訂單簿");
let override = () => ({});
let lastPayload = null;
const fake = H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } });
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "ord0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = `ap:${H.loc("ord0000001")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
const C = "state.interestCandidates.find(c=>c.id==='hc')";
const setCard = (status, inv) => ev(`state.interestCandidates=[{id:'hc',category:'手作工藝',status:'active',investment:${inv},sideBusinessStatus:${JSON.stringify(status)},lastEngagedRound:state.turnCount}]; state.focusWorkId=null`);
const flags = () => ev("JSON.stringify((state.reviewFlags||[]).map(f=>JSON.stringify(f)))");

// ---------- 8.13.3 數值與接單上限 ----------
const SP = js("ORDER_SPEC");
A.check("8.13.3 大小對照：格數／交期／報酬基準", SP.small.need === 1 && SP.medium.need === 2 && SP.large.need === 4 && SP.small.due === 3 && SP.medium.due === 5 && SP.large.due === 8 && SP.small.base === 35 && SP.medium.base === 70 && SP.large.base === 140);
setCard("gig", 65);
A.check("8.13.2 偶爾接案：1單、接案收入", js(`orderTier(${C})`).cap === 1 && ev(`orderIncomeCat(${C})`) === "接案收入");
setCard("formal", 50);
A.check("8.13.2 正式經營(熟練)：2單×1.0、副業收入", js(`orderTier(${C})`).cap === 2 && js(`orderTier(${C})`).mult === 1 && ev(`orderIncomeCat(${C})`) === "副業收入");
setCard("formal", 80);
A.check("8.13.2 正式經營(精通)：3單×1.4", js(`orderTier(${C})`).cap === 3 && js(`orderTier(${C})`).mult === 1.4);
setCard("formal", 30);
A.check("8.13.2 正式經營但投入分數低於40：1單×0.8", js(`orderTier(${C})`).cap === 1 && js(`orderTier(${C})`).mult === 0.8);

// ---------- 8.13.1 登記 ----------
setCard("formal", 50);
ev(`state.reviewFlags=[]; registerOrders(state, [{category:'手作工藝', client:'林小姐', via:'雅涵', item:'不對稱耳環×10', size:'medium'}])`);
const o = js(`${C}.gigOrders[0]`);
A.check("8.13.1 登記：程式指派編號、交期、需要格數", o.no === 1 && o.need === 2 && o.due === ev("state.turnCount") + 5 && o.status === "進行中" && o.via === "雅涵" && o.done === 0, o);
ev(`registerOrders(state, [{client:'阿宇', item:'貼紙', size:'small'}, {client:'老闆', item:'招牌', size:'large'}])`);
A.check("8.13.1 接單上限：第3筆(已2單)拒絕並寫入錯誤紀錄；只有一個副業時category可省略", ev(`${C}.gigOrders.length`) === 2 && /order_new_over_cap/.test(flags()));
ev(`state.reviewFlags=[]; ${C}.gigOrders.pop(); registerOrders(state, [{category:'插畫', client:'x', item:'y', size:'small'}, {client:'z', item:'w', size:'huge'}])`);
A.check("8.13.1 類別不是玩家的副業、大小不合法：拒絕並寫入錯誤紀錄", ev(`${C}.gigOrders.length`) === 1 && /order_new_category/.test(flags()) && /order_new_size/.test(flags()));

// ---------- 推進與交件 ----------
setCard("formal", 50);
ev(`state.cash=1000; state.turnCount=20; registerOrders(state, [{client:'林小姐', via:'雅涵', item:'耳環', size:'medium'},{client:'阿宇', item:'貼紙', size:'small'}])`);
let dels = ev(`JSON.stringify(applyOrderResult(state, {}, {key:'work', gigCardId:'hc'}))`);
A.check("8.13.1 這回合才登記的訂單不推進", dels === "null" && ev(`${C}.gigOrders.every(o=>o.done===0)`));
ev("state.turnCount=21");
dels = js(`applyOrderResult(state, {}, {key:'work', gigCardId:'hc'})`);
A.check("8.13.1 重心「工作：副業X」：推進交期最近的一筆(小單1格＝當回合完成、依基準35交件入帳)", dels && dels.deliveries.length === 1 && dels.deliveries[0].amount === 35 && dels.deliveries[0].cat === "副業收入" && ev("state.cash") === 1035, dels);
A.check("8.13.1 完成的訂單記為已交件並累計收入", js(`${C}.gigOrders.find(o=>o.item==='貼紙')`).status === "已交件" && ev(`${C}.gigIncome`) === 35 && js(`${C}.gigOrders.find(o=>o.item==='耳環')`).done === 0);
ev("state.turnCount=22");
js(`applyOrderResult(state, {}, {key:'work', gigCardId:'hc'})`);
A.check("8.13.1 每回合最多推進1格(中單需2格)", js(`${C}.gigOrders.find(o=>o.item==='耳環')`).done === 1 && js(`${C}.gigOrders.find(o=>o.item==='耳環')`).status === "進行中");
ev("state.turnCount=23");
dels = js(`applyOrderResult(state, {}, {key:'work', gigCardId:'hc'})`);
A.check("8.13.1 中單完成交件：報酬70(未逾期)", dels && dels.deliveries[0].amount === 70 && dels.deliveries[0].late === false, dels);
// 交件通知：下一回合提示
ev("state.turnCount=24");
const n1 = js("prepareOrderTurn(state, null)");
A.check("8.13.1 下一回合提示寫明「上回合完成」的訂單，通知只給一次", n1.delivered_last_turn && n1.delivered_last_turn.length === 2 && js("prepareOrderTurn(state, null)").delivered_last_turn === null, n1);

// ---------- 逾期 ----------
setCard("formal", 50);
ev(`state.cash=1000; state.turnCount=30; registerOrders(state, [{client:'陳老闆', via:'雅涵', item:'招牌', size:'small'}]); state.characters.push({name:'雅涵',relation:'同學',gender:'女',traits:'',summary:'',active:true,isChild:false,lastTurn:30,origin:'x',affinity:50})`);
ev("state.turnCount=34"); // 交期33，超過1回合
let nn = js("prepareOrderTurn(state, null)");
A.check("8.13.1 超過交期：通知旁白寫客人不滿(只通知一次)", nn.late.length === 1 && nn.late[0].client === "陳老闆" && js("prepareOrderTurn(state, null)").late.length === 0, nn);
dels = js(`applyOrderResult(state, {}, {key:'work', gigCardId:'hc'})`);
A.check("8.13.1 超過交期、2回合內完成：延遲交件，報酬×0.7(35→25，四捨五入)", dels && dels.deliveries[0].amount === 25 && dels.deliveries[0].late === true && js(`${C}.gigOrders.find(o=>o.item==='招牌')`).status === "延遲交件", dels);
ev(`registerOrders(state, [{client:'林先生', via:'雅涵', item:'門牌', size:'small'}])`);
ev("state.turnCount=state.turnCount+1+3+3"); // 超過交期2回合以上
nn = js("prepareOrderTurn(state, null)");
A.check("8.13.1 超過交期2回合仍未完成：訂單取消、介紹人好感−2、通知旁白", nn.cancelled.length === 1 && js(`${C}.gigOrders.find(o=>o.item==='門牌')`).status === "已取消" && ev("state.characters.find(c=>c.name==='雅涵').affinity") === 48, nn);

// ---------- 報酬乘數 ----------
setCard("formal", 80); // 精通1.4
ev(`state.turnCount=50; registerOrders(state, [{client:'a', item:'b', size:'large'}]); ${C}.gigOrders[0].done=3; state.turnCount=51`);
dels = js(`applyOrderResult(state, {}, {key:'work', gigCardId:'hc'})`);
A.check("8.13.3 精通×1.4：大單140→196", dels && dels.deliveries[0].amount === 196, dels);
setCard("formal", 30); // 0.8
ev(`state.turnCount=60; registerOrders(state, [{client:'a', item:'b', size:'medium'}]); ${C}.gigOrders[0].done=1; state.turnCount=61`);
dels = js(`applyOrderResult(state, {}, {key:'work', gigCardId:'hc'})`);
A.check("8.13.3 投入降到40以下×0.8：中單70→56", dels && dels.deliveries[0].amount === 56, dels);
setCard("gig", 65);
ev(`state.turnCount=70; registerOrders(state, [{client:'a', item:'b', size:'small'}]); state.turnCount=71`);
dels = js(`applyOrderResult(state, {}, {key:'work', gigCardId:'hc'})`);
A.check("偶爾接案交件標籤為接案收入", dels && dels.deliveries[0].cat === "接案收入", dels);

// ---------- order_target／order_work ----------
setCard("formal", 50);
ev(`state.turnCount=80; registerOrders(state, [{client:'甲', item:'A', size:'medium'},{client:'乙', item:'B', size:'medium'}]); state.turnCount=81`);
js(`applyOrderResult(state, {order_target:'2'}, {key:'work', gigCardId:'hc'})`);
A.check("8.13.1 指名order_target：推進那一筆而不是交期最近的", ev(`${C}.gigOrders[1].done`) === 1 && ev(`${C}.gigOrders[0].done`) === 0);
ev("state.turnCount=82");
js(`applyOrderResult(state, {order_target:'1', order_work:true}, {key:'study'})`);
A.check("8.13.1 重心不是副業但order_work＋order_target：推進1格", ev(`${C}.gigOrders[0].done`) === 1);
ev("state.turnCount=83");
js(`applyOrderResult(state, {order_target:'2'}, {key:'study'})`);
A.check("8.13.1 重心不是副業、沒有order_work：不推進", ev(`${C}.gigOrders[1].done`) === 1);
ev("state.turnCount=84");
js(`applyOrderResult(state, {order_work:true}, {key:'study'})`);
A.check("8.13.1 order_work沒附order_target：不推進", ev(`${C}.gigOrders[0].done`) === 1);

// ---------- 新詢問擲骰 ----------
setCard("formal", 50);
ev("state.focus='work'; window.__rnd = Math.random");
ev("Math.random = ()=>0.1");
A.check("8.13.1 重心「工作：副業X」、未達上限、擲中：安排新詢問", js(`prepareOrderTurn(state, {key:'work', gigCardId:'hc'})`).inquiry.length === 1);
A.check("8.13.1 重心是打工(不是副業)、或別的重心：不擲", js(`prepareOrderTurn(state, {key:'work', gigCardId:null})`).inquiry.length === 0 && js(`prepareOrderTurn(state, {key:'study'})`).inquiry.length === 0);
ev("Math.random = ()=>0.2");
A.check("8.13.1 正式經營30%：0.2擲中", js(`prepareOrderTurn(state, {key:'work', gigCardId:'hc'})`).inquiry.length === 1);
ev("Math.random = ()=>0.35");
A.check("8.13.1 正式經營30%：0.35沒擲中", js(`prepareOrderTurn(state, {key:'work', gigCardId:'hc'})`).inquiry.length === 0);
setCard("gig", 65);
ev("Math.random = ()=>0.2");
A.check("8.13.1 偶爾接案15%：0.2沒擲中", js(`prepareOrderTurn(state, {key:'work', gigCardId:'hc'})`).inquiry.length === 0);
ev("Math.random = ()=>0.1");
A.check("8.13.1 偶爾接案15%：0.1擲中", js(`prepareOrderTurn(state, {key:'work', gigCardId:'hc'})`).inquiry.length === 1);
ev(`${C}.gigOrders=[{id:'x',no:1,client:'a',item:'b',size:'small',need:1,done:0,reg:0,due:99,status:'進行中'}]`);
A.check("8.13.1 已達接單上限：不擲新詢問", js(`prepareOrderTurn(state, {key:'work', gigCardId:'hc'})`).inquiry.length === 0);
ev("Math.random = window.__rnd");

// ---------- 整回合流程：payload、重心按鈕、訂單推進 ----------
setCard("formal", 50);
ev("state.interestCandidates[0].gigOrders=[]; state.focus='work'; state.focusWorkId='hc'");
override = () => ({ order_new: [{ category: "手作工藝", client: "林小姐", via: "雅涵", item: "耳環×6", size: "small" }] });
await H.playTurn(g, "嗯");
override = () => ({});
A.check("整回合：重心「工作：副業X」→ 提示的turn_focus帶gig_category、場景指令寫處理訂單", lastPayload.turn_focus.gig_category === "手作工藝" && /實際處理訂單/.test(lastPayload.turn_focus.scene_directive), lastPayload.turn_focus);
A.check("整回合：旁白回報order_new→登記成訂單簿", ev(`${C}.gigOrders.length`) >= 1 && js(`${C}.gigOrders[0]`).client === "林小姐");
A.check("整回合：日記記下重心「工作：手作工藝」", ev("state.log[state.log.length-1].focusLabel") === "工作：手作工藝");
await H.playTurn(g, "嗯");
A.check("整回合：下一回合的提示含訂單簿(接單量、上限)", lastPayload.side_gig_orders && lastPayload.side_gig_orders[0].cap === 2 && lastPayload.side_gig_orders[0].category === "手作工藝", lastPayload.side_gig_orders);
A.check("整回合：程式判定交件並入帳(累計收入、結算欄副業收入)", ev(`${C}.gigIncome`) > 0 && /副業收入 \+\d+/.test(ev("settlementText(state.log[state.log.length-1].settlement, state.cash)")), ev("settlementText(state.log[state.log.length-1].settlement, state.cash)"));
await H.playTurn(g, "嗯");
A.check("整回合：交件後下一回合提示order_notices.delivered_last_turn", !!(lastPayload.order_notices && lastPayload.order_notices.delivered_last_turn), lastPayload.order_notices);

// 投入一半
setCard("formal", 50);
ev("Math.random = ()=>0.5");
const invBefore = ev(`${C}.investment`);
ev(`applyInterestEvent(state, {category:'手作工藝', reaction:'positive'}, 0.5)`);
const halfGain = ev(`${C}.investment`) - invBefore;
ev(`${C}.investment=${invBefore}`);
ev(`applyInterestEvent(state, {category:'手作工藝', reaction:'positive'})`);
const fullGain = ev(`${C}.investment`) - invBefore;
ev("Math.random = window.__rnd");
A.check("2.8.2 「工作：副業X」的興趣投入約為「興趣：X」的一半", halfGain > 0 && halfGain < fullGain && Math.abs(halfGain * 2 - fullGain) <= 1.2, { halfGain, fullGain });

// ---------- 工作按鈕 ----------
setCard("formal", 50);
ev("state.focus='work'; state.focusWorkId=null; render()");
A.check("2.8.2 有副業時「工作」按鈕顯示目前選的項目並可展開", /工作：打工/.test(doc.querySelector('.focus-btn[data-focus="work"]').textContent));
doc.querySelector('.focus-btn[data-focus="work"]').click();
const pick = [...doc.querySelectorAll("#work-pick .focus-btn")].map(b => b.textContent);
A.check("2.8.2 再點一次展開清單：打工＋每個副業", pick.length === 2 && pick[0] === "打工" && /正式經營：手作工藝/.test(pick[1]), pick);
doc.querySelector('#work-pick .focus-btn[data-work-pick="hc"]').click();
A.check("2.8.2 選了副業：預設記住(下回合沿用)", ev("state.focusWorkId") === "hc" && /工作：手作工藝/.test(doc.querySelector('.focus-btn[data-focus="work"]').textContent));
ev("state.interestCandidates=[]; render()");
A.check("2.8.2 沒有副業時只有「工作」、不展開", doc.querySelector('.focus-btn[data-focus="work"]').textContent.trim() === "工作" && ev("currentWorkChoice(state)") === null);


// ---------- 16.16 副業面板 ----------
setCard("formal", 50);
ev(`state.turnCount=300; state.focus='rest'; state.focusWorkId=null; registerOrders(state, [{client:'林小姐', via:'雅涵', item:'耳環×6', size:'medium'},{client:'阿宇', item:'貼紙×20', size:'small'}]); state.turnCount=302; ${C}.gigIncome=210; ${C}.gigOrders.push({id:'d1',no:9,client:'老王',item:'胸針',size:'small',need:1,done:1,reg:280,due:283,status:'已交件',reward:35,endAbs:state.timeState.cal.lastRoundEnd})`);
ev("render()");
A.check("16.16 選單有「我的副業」入口(有副業才出現)", !!doc.getElementById("link-gig") && /進行中 2 單/.test(doc.getElementById("link-gig").textContent));
ev("renderGigModal()");
const gm = doc.getElementById("gig-modal");
const orders = [...gm.querySelectorAll(".gig-order")];
A.check("16.16 概況：類型與接單量「手上2單／上限2單」", /正式經營・手作工藝/.test(gm.textContent) && /手上 2 單／上限 2 單/.test(gm.textContent), gm.textContent.slice(0, 120));
A.check("16.16 訂單簿依交期排序(小單3回合先、中單5回合後)，顯示進度格與預估報酬", orders.length === 2 && /貼紙/.test(orders[0].textContent) && /□/.test(orders[0].textContent) && /預估報酬 35/.test(orders[0].textContent) && /預估報酬 70/.test(orders[1].textContent), orders.map(o => o.textContent.slice(0, 60)));
A.check("16.16 警示色：交期剩1回合橘色", /rgb\(196, 106, 28\)|#c46a1c/i.test(orders[0].getAttribute("style") + orders[0].style.color) && !/b23a2e/.test(orders[1].getAttribute("style")), orders[0].getAttribute("style"));
ev(`${C}.gigOrders.find(o=>o.item==='貼紙×20').due = state.turnCount - 1`);
gm.remove(); ev("renderGigModal()");
A.check("16.16 警示色：已逾期紅色、預估報酬按延遲×0.7", /b23a2e|rgb\(178, 58, 46\)/i.test(doc.querySelector("#gig-modal .gig-order").getAttribute("style")) && /預估報酬 25/.test(doc.querySelector("#gig-modal .gig-order").textContent));
A.check("16.16 交件紀錄：最近的交件與累計收入", /交件紀錄/.test(doc.getElementById("gig-modal").textContent) && /累計收入 210/.test(doc.getElementById("gig-modal").textContent) && /老王/.test(doc.getElementById("gig-modal").textContent));
doc.querySelector("#gig-modal .gig-rush").click();
A.check("16.16 「趕這單」：輸入框填入「趕○○的○○」、重心切到該副業、不自動送出", doc.getElementById("custom-input").value === "趕阿宇的貼紙×20" && ev("state.focus") === "work" && ev("state.focusWorkId") === "hc" && !doc.getElementById("gig-modal"), doc.getElementById("custom-input").value);


// ---------- 放置期間暫停交期、交期月份用2.7真實日曆 ----------
setCard("formal", 50);
ev(`state.turnCount=400; ${C}.gigOrders=[]; registerOrders(state, [{client:'甲', item:'A', size:'medium'},{client:'乙', item:'B', size:'small'}]); state.cash=1000`);
const dueBefore = js(`${C}.gigOrders.map(o=>o.due)`);
const tcBefore = ev("state.turnCount");
ev("state.idleEnabled=true; state.idleMode=true");
for (let i = 0; i < 12; i++) ev("(()=>{ state.turnCount += 1; state.sideGigIncomeNow=null; sideGigCards(state).forEach(c=>activeOrders(c).forEach(o=>{ o.due += 1; })); idleOrderRound(state); state.orderDeliveredLast=null; })()");
ev("state.idleMode=false");
const ords = js(`${C}.gigOrders`);
A.check("放置期間：訂單不會逾期被取消或罰款(交期跟著往後延)，做完的按準時價入帳", ords.every(o => o.status !== "已取消") && ords.filter(o => o.status === "已交件").length === 2 && ev("state.cash") === 1000 + 35 + 70, ords.map(o => o.status + ":" + o.reward));
ev(`${C}.gigOrders=[]; state.turnCount=500; registerOrders(state, [{client:'丙', item:'C', size:'large'}]); ${C}.gigOrders[0].done=0`);
const due0 = ev(`${C}.gigOrders[0].due`);
ev("(()=>{ for(let i=0;i<3;i++){ state.turnCount += 1; sideGigCards(state).forEach(c=>activeOrders(c).forEach(o=>{ o.due += 1; })); } })()");
A.check("放置期間：交期一回合一回合往後延，回來後才照常計算", ev(`${C}.gigOrders[0].due`) === due0 + 3 && ev(`${C}.gigOrders[0].due - state.turnCount`) === due0 - 500);
const src = ev("simulateIdleRound.toString()");
A.check("放置模式的實際程式不呼叫逾期處理(prepareOrderTurn)，改成延後交期", !/prepareOrderTurn/.test(src) && /o\.due \+= 1/.test(src));

ev("state.timeState.segmentIndex=YEAR_SEGMENTS.findIndex(x=>x.key==='期中準備期'); state.timeState.turnsInSegment=1; state.leaveStatus=null");
const monthOf = (idx, t) => ev(`(()=>{ const cal=state.timeState.cal; const a=schoolAnchor(cal, ${idx}, ${t}), b=schoolAnchor(cal, ${idx}, ${t}+1)-1; return calAbsToDate(Math.floor((a+b)/2)).m+"月"; })()`);
const idx = ev("state.timeState.segmentIndex");
A.check("交期月份：下一回合＝排好的日期中點所在月份(2.7真實日曆)", ev("futureTurnMonth(state, 1)") === monthOf(idx, 1), ev("futureTurnMonth(state, 1)"));
A.check("交期月份：第3個未來回合仍在同一階段時，照階段內平均分配的日期換算", ev("futureTurnMonth(state, 3)") === monthOf(idx, 3));
const budget = ev("YEAR_SEGMENTS[state.timeState.segmentIndex].budget");
A.check("交期月份：跨到下一個段落也照排好的日期換算", ev(`futureTurnMonth(state, ${budget})`) === monthOf(idx + 1, 0) || ev(`futureTurnMonth(state, ${budget})`) === monthOf(idx, budget - 1), ev(`futureTurnMonth(state, ${budget})`));
A.check("交期月份：超出已排好的學年日期時回傳null(才用估算)、開場回傳null", ev("futureTurnMonth(state, 999)") === null && ev("(()=>{ state.timeState.prologue=true; const r=futureTurnMonth(state,1); state.timeState.prologue=false; return r; })()") === null);
ev(`${C}.gigOrders=[]; state.turnCount=600; registerOrders(state, [{client:'丁', item:'D', size:'small'}])`);
A.check("副業面板的交期(月份)優先用真實日曆、算不出來才估算", ev(`orderDueMonth(state, ${C}.gigOrders[0])`) === ev(`futureTurnMonth(state, ${C}.gigOrders[0].due - state.turnCount) || orderDueMonth(state, ${C}.gigOrders[0])`) && /^\d+月$/.test(ev(`orderDueMonth(state, ${C}.gigOrders[0])`)));

// 實際的放置程式(simulateIdleRound)跑一回合：交期延後、不逾期
setCard("formal", 50);
ev(`state.turnCount=700; ${C}.gigOrders=[]; registerOrders(state, [{client:'戊', item:'E', size:'large'}]); state.cash=1000; state.idleEnabled=true; state.idleMode=true`);
const dueR = ev(`${C}.gigOrders[0].due`);
let idleErr = null;
try { ev("simulateIdleRound(state, 0)"); ev("simulateIdleRound(state, 1)"); } catch (e) { idleErr = String(e).slice(0, 120); }
ev("state.idleMode=false");
A.check("放置：實際跑simulateIdleRound，交期順延、沒有被判逾期或取消", !idleErr && ev(`${C}.gigOrders[0].due`) > dueR && ev(`${C}.gigOrders[0].status`) !== "已取消" && ev(`${C}.gigOrders[0].done`) >= 1 && ev("state.turnCount") === 702, { idleErr, due: ev(`${C}.gigOrders[0].due`), dueR, st: ev(`${C}.gigOrders[0].status`), done: ev(`${C}.gigOrders[0].done`), tc: ev("state.turnCount") });

// ---------- 放置、舊存檔、prompt ----------
setCard("formal", 50);
ev(`state.turnCount=200; ${C}.gigOpenOrders=[{turn:1,size:'large'}]; ${C}.gigNextOfferTurn=5; ${C}.gigOrders=[]; registerOrders(state, [{client:'a', item:'b', size:'small'}]); state.turnCount=201`);
ev("state.cash=1000; prepareOrderTurn(state, null); idleOrderRound(state)");
A.check("放置：每回合自動推進交期最近的一筆並入帳", ev("state.cash") === 1035 && ev(`${C}.gigOrders[0].status`) === "已交件");
A.check("舊存檔：舊制gigOpenOrders／gigNextOfferTurn被丟棄，訂單簿從空白開始(只有新登記的)", ev(`${C}.gigOpenOrders`) === undefined && ev(`${C}.gigNextOfferTurn`) === undefined);
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：訂單簿規則(接單上限、order_new、order_target、程式判定交件、不說系統用語)", ["side_gig_orders", "at_cap", "order_new", "order_target", "order_work", "order_notices", "order_inquiry_now", "gig_category", "系統用語"].every(k => prompt.includes(k)));
A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
