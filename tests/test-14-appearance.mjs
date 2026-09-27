// 2026-09-27：三、3.3 外表成長來源（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("3.3 外表成長來源");
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => override(p, b) }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "appear0001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;

ev("state.looks=60; state.temperament=50; state.stats.health=70; state.studentStatus='enrolled'");
ev("refreshAppearance(state)");
A.check("健康正常、學生：外表＝(60+50)/2＝55", ev("state.appearance") === 55);
ev("state.stats.health=20; refreshAppearance(state)");
A.check("健康<30：顏值扣5 → 53", ev("state.appearance") === 53);
ev("state.stats.health=10; refreshAppearance(state)");
A.check("健康<15：顏值扣10 → 50", ev("state.appearance") === 50);
ev("state.stats.health=70; refreshAppearance(state)");
A.check("健康回來：氣色恢復 → 55", ev("state.appearance") === 55);
ev("state.studentStatus='graduated'; state.cash=999999; state.monthlyIncome=500; refreshAppearance(state)");
A.check("出社會財務健康度≥90：保養+5 → 58(四捨五入)", ev("state.appearance") === 58, ev("state.appearance"));
A.check("先天顏值不變", ev("state.looks") === 60);

// 氣質年度累積
ev("state.temperamentAgeTick=30; state.age=32; state.cash=0; state.monthlyIncome=0");
A.check("跨2歲、財務差：氣質+2", ev("annualTemperamentGrowth(state)") === 2);
ev("state.temperamentAgeTick=32; state.age=33; state.cash=999999; state.monthlyIncome=500");
A.check("跨1歲、財務健康度≥60：氣質+2(年齡+見識)", ev("annualTemperamentGrowth(state)") === 2);
A.check("同一歲不重複給", ev("annualTemperamentGrowth(state)") === 0);

// 關鍵事件揭露
ev("state.keyEvent={type:'家庭斷裂',revealed:false}; state.temperament=50; state.temperamentAgeTick=state.age");
override = () => ({ revealed_key_event: true });
await H.playTurn(g);
A.check("關鍵事件揭露那一回合：氣質+2", ev("state.temperament") >= 52, ev("state.temperament"));
const t1 = ev("state.temperament");
await H.playTurn(g);
A.check("已揭露過不再加", ev("state.temperament") <= t1 + 2 && ev("state.keyEvent.revealed") === true);
override = () => ({});

// mock長程
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "appearm001" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
const temp0 = gm.ev("state.temperament");
for (let i = 0; i < 300; i++) await H.playTurn(gm);
A.check("mock 300回合：氣質隨年齡上升、外表在0~100、無錯誤", gm.errors.length === 0 && gm.ev("state.temperament") > temp0 && gm.ev("state.appearance>=0 && state.appearance<=100"), { temp0, temp: gm.ev("state.temperament"), age: gm.ev("state.age") });

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
