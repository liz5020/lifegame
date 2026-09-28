// 2026-09-28：三、3.4.10倍率改版後，九種花錢習慣×三餐組合在15～22歲的存款走勢（mock模式，不打真實API）
// 用法：node sim-lifestyle-savings.mjs [每組跑幾次，預設2] [家境，預設小康] [跑到幾歲，預設22]
import * as H from "./harness.mjs";
const RUNS = Number(process.argv[2] || 2);
const TIER = process.argv[3] || "小康";
const MAX_AGE = Number(process.argv[4] || 22); // 跑到幾歲(含)
const HABITS = ["精打細算", "普通花費", "隨性大方"];
const MEALS = ["家裡包辦", "自己打理", "外食為主"];
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "simlife01" });
const ev = g.ev;
ev("MOCK_CHAPTER_DELAY_MS = 1; MOCK_AI_DELAY_MS = 0");
const rows = [];
for (const habit of HABITS) for (const meal of MEALS) {
  for (let run = 0; run < RUNS; run++) {
    g.ev(`state = newRoll(null, {name:"模擬", gender:"女"});
      state.family=${JSON.stringify(TIER)}; state.monthlyIncome=STUDENT_ALLOWANCE_UNITS[${JSON.stringify(TIER)}]; state.cash=state.monthlyIncome;
      state.spendingHabit=${JSON.stringify(habit)}; state.mealArrangement=${JSON.stringify(meal)}; state.mealCareEligibleAtStart=true; state.idleEnabled=false;`);
    await g.ev("startLife()"); H.clickModals(g.win);
    const byAge = {}; let months = 0, zeroAtMonth = null, zeroTurns = 0, turns = 0, minCash = Infinity;
    byAge[15] = ev("state.cash");
    while (ev("state.phase") === "playing" && ev("state.age") <= MAX_AGE && turns < 3000) {
      ev(`state.spendingHabit=${JSON.stringify(habit)}; state.mealArrangement=${JSON.stringify(meal)}; ensureAP(state).daily=99;`);
      await H.playTurn(g); turns++;
      const st = ev("state.lastSettlement && {m:state.lastSettlement.months, student:state.lastSettlement.student}");
      if (st) months += st.m;
      const cash = ev("state.cash"), age = ev("state.age");
      minCash = Math.min(minCash, cash);
      if (cash <= 0) { zeroTurns++; if (zeroAtMonth === null) zeroAtMonth = Math.round(months * 10) / 10; }
      byAge[age] = cash;
    }
    rows.push({ habit, meal, mult: +(ev(`SPENDING_HABITS[${JSON.stringify(habit)}]*MEAL_EXPENSE_MULT[${JSON.stringify(meal)}]`)).toFixed(3), run, byAge, zeroAtMonth, zeroTurns, turns, minCash });
  }
}
console.log(`家境：${TIER}（零用錢 ${ev(`STUDENT_ALLOWANCE_UNITS[${JSON.stringify(TIER)}]`)}／月），每組 ${RUNS} 次`);
const AGES = []; for (let a = 15; a <= MAX_AGE; a++) if (MAX_AGE <= 23 || a <= 22 || a % 3 === 0 || a === MAX_AGE) AGES.push(a);
console.log(["組合", ...AGES, "首次見底(第幾個月)", "存款≤0回合數/總回合"].join("\t"));
for (const r of rows) console.log([`${r.habit}+${r.meal}`, ...AGES.map(a => r.byAge[a] ?? "-"), r.zeroAtMonth ?? "沒有", `${r.zeroTurns}/${r.turns}`].join("\t"));
if (g.errors.length) console.log("jsdom錯誤：", g.errors.map(String).slice(0, 3));
process.exit(0);
