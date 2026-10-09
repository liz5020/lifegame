// 2026-10-09 beta：回合節奏下修(二、2.2.1／2.3／2.5／2.5.2)（全程mock，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("回合節奏下修");
const g = await H.loadGame({ useMock: true });
const js = (x) => JSON.parse(g.ev(`JSON.stringify(${x})`));

const segs = js("YEAR_SEGMENTS.map(s=>({key:s.key,half:s.half,budget:s.budget}))");
const vac = segs.filter(s => s.key === "假期");
A.check("寒假(上學期假期段)2回合、暑假(下學期假期段)4回合", vac.length === 2 && vac[0].half === "上學期" && vac[0].budget === 2 && vac[1].half === "下學期" && vac[1].budget === 4, vac);
A.check("學期內其他段落回合數不變(上學期19、下學期19)", [0, 7].every(i => segs.slice(i, i + 6).reduce((a, s) => a + s.budget, 0) === 19), segs);
A.check("一學年44回合、學生時期7年308回合", js("YEAR_SEGMENTS.reduce((a,s)=>a+s.budget,0)") === 44 && 44 * 7 === 308);
A.check("22-29歲28回合/年、30-39歲24回合/年，其餘年齡帶不變", js("[22,29,30,39,40,50,60,70,80].map(roundsPerYearForAge)").join() === "28,28,24,24,15,12,10,7,5");
// 全人生總回合：22歲起到死亡年齡前一歲，加學生時期308
const total = (deathAge) => 308 + js(`(()=>{ let t=0; for(let a=22;a<${deathAge};a++) t+=roundsPerYearForAge(a); return t; })()`);
A.check("全人生總回合：死亡65歲1092、死亡90歲1262", total(65) === 1092 && total(90) === 1262, [total(65), total(90)]);
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
