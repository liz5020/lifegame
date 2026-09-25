// 佇列批次4（2026-09-25）：數值與金錢的單回合上限（三、3.9）
import * as H from "./harness.mjs";
const A = H.makeAsserter("批次4 單回合上限");
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => override(p, b) }));
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "capkey01" });
await H.startNewLife(g);
await H.playTurn(g);
// 學生期
let p = null;
override = (payload) => { p = payload; return {}; };
await H.playTurn(g);
A.check("payload帶max_windfall_this_turn(學生期50)", p.max_windfall_this_turn === 50, p.max_windfall_this_turn);
A.check("payload帶stat_delta_limits", JSON.stringify(p.stat_delta_limits) === JSON.stringify({ health: [-10, 5], network: [-8, 5], expression: [-5, 5] }));
let cash0 = g.ev("state.cash");
override = () => ({ one_time_transaction: [{ label: "中樂透", amount: 5000000 }] });
await H.playTurn(g);
let cashGain = g.ev("state.cash") - cash0;
A.check("學生期AI回傳+500萬：只入帳上限50(月結算另計)", g.ev("state.reviewFlags.some(f=>f.kind==='windfall_capped')") && Math.abs(cashGain - 50) < 200, { cashGain });
// 為了排除月結算影響，直接測applyResult的交易部分
const rawGain = (txs) => g.ev(`(()=>{ const c = capWindfallTransactions(${JSON.stringify(txs)}, computeMaxWindfall(state)); return c.txs.reduce((a,t)=>a+(t.amount>0?t.amount:0),0); })()`);
A.check("多筆收入合計超過上限：合計截在50", rawGain([{ amount: 30 }, { amount: 30 }, { amount: 30 }]) === 50);
A.check("上限內的收入完整入帳", rawGain([{ amount: 20 }, { amount: 10 }]) === 30);
A.check("支出不受上限影響", g.ev(`capWindfallTransactions([{amount:-99999},{amount:10}], 50).txs[0].amount`) === -99999);
// stat_deltas
const before = g.ev("({h:state.stats.health, e:state.stats.expression})");
g.ev("state.stats.health=50; state.stats.expression=50; state.chronicConditions=[]");
override = () => ({ stat_deltas: { health: 50, network: 50, expression: 50 } });
await H.playTurn(g);
A.check("stat_deltas +50：健康只加5", g.ev("state.stats.health") <= 55, g.ev("state.stats.health"));
A.check("stat_deltas +50：表達力只加5", g.ev("state.stats.expression") === 55, g.ev("state.stats.expression"));
g.ev("state.stats.health=50; state.stats.expression=50; state.stats.network=50");
override = () => ({ stat_deltas: { health: -50, network: -50, expression: -50 } });
await H.playTurn(g);
A.check("stat_deltas -50：健康最多扣10", g.ev("state.stats.health") >= 40, g.ev("state.stats.health"));
A.check("stat_deltas -50：表達力最多扣5", g.ev("state.stats.expression") === 45);
A.check("stat_deltas -50：人脈最多扣8(乘數前)", g.ev("clampStatDeltas({network:-50}).network") === -8);
A.check("範圍內的數值不變", JSON.stringify(g.ev("clampStatDeltas({health:3,network:-2,expression:0})")) === JSON.stringify({ health: 3, network: -2, expression: 0 }));
// 出社會後
g.ev("state.studentStatus='graduated'; state.occupationCategory='受雇專業/白領類'; state.monthlyIncome=50");
A.check("有工作後上限＝月收入×3(50→150)", g.ev("computeMaxWindfall(state)") === 150);
g.ev("state.monthlyIncome=0; state.occupationCategory=null");
A.check("出社會但沒收入：下限50", g.ev("computeMaxWindfall(state)") === 50);
override = () => ({});
// 正常回合回歸
g.ev("state.studentStatus='enrolled'; state.occupationCategory=null");
cash0 = g.ev("state.cash");
override = () => ({ one_time_transaction: [{ label: "紅包", amount: 20 }], stat_deltas: { health: 2, network: 1, expression: 1 } });
const flags0 = g.ev("state.reviewFlags.filter(f=>f.kind==='windfall_capped').length");
await H.playTurn(g);
A.check("正常回合(+20紅包)：沒有被截斷", g.ev("state.reviewFlags.filter(f=>f.kind==='windfall_capped').length") === flags0);
// mock長程回歸
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "capmock1" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
for (let i = 0; i < 300; i++) await H.playTurn(gm);
A.check("mock連續300回合正常(跨高中到出社會)", gm.ev("state.turnCount") === 301 && gm.errors.length === 0, { t: gm.ev("state.turnCount"), age: gm.ev("state.age") });
const ok = A.report();
process.exit(ok ? 0 : 1);
