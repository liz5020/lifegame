// 2026-09-28：三、3.4.7收支分列／3.4.10倍率改版／五、5.5.5生活方式小卡與手頭狀態（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("5.5.5生活方式與收支分列");
let payload = null;
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => { payload = p; return {}; } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "lifestyle01" });
const ev = g.ev;
const doc = g.win.document;
await H.startNewLife(g);

// 1. 倍率
A.check("花錢習慣：可支配的錢花掉3成/6成/9成", ev("JSON.stringify(SPENDING_HABITS)") === JSON.stringify({ 精打細算: 0.3, 普通花費: 0.6, 隨性大方: 0.9 }));
A.check("三餐0.8/1.0/1.1", ev("JSON.stringify(MEAL_EXPENSE_MULT)") === JSON.stringify({ 家裡包辦: 0.8, 自己打理: 1.0, 外食為主: 1.1 }));
A.check("學生期基本需求25", ev("STUDENT_BASIC_NEED") === 25);
ev("state.studentStatus='enrolled'; state.monthlyIncome=60; state.monthlyExpenses=[]; state.spendingHabit='普通花費'; state.mealArrangement='自己打理'");
A.check("小康普通＋自己打理：25＋35×0.6＝46", ev("computeBaseLivingCost(state)") === 46);
ev("state.spendingHabit='隨性大方'; state.mealArrangement='外食為主'");
A.check("小康最重組合：25×1.1＋35×0.9＝59(還剩1)", ev("computeBaseLivingCost(state)") === 59);
ev("state.monthlyIncome=120");
A.check("富裕最重組合：27.5＋95×0.9＝113，不會見底", ev("computeBaseLivingCost(state)") === 113);
ev("state.monthlyIncome=30");
A.check("清寒最重組合：27.5＋5×0.9＝32，超支", ev("computeBaseLivingCost(state)") === 32);
ev("state.monthlyIncome=20");
A.check("零用錢低於基本需求：可支配為0，只算基本需求", ev("computeBaseLivingCost(state)") === 28);
ev("state.monthlyIncome=60; state.monthlyExpenses=[{label:'手機',amount:10}]");
A.check("固定支出先扣掉才算可支配：27.5＋25×0.9＝50", ev("computeBaseLivingCost(state)") === 50);
ev("state.monthlyExpenses=[]");

// 2. 出社會後也乘倍率(扶養費、慢性病不乘)
ev("state.studentStatus='graduated'; state.housing={type:'rent'}; state.chronicConditions=[]; state.characters=state.characters.filter(c=>!c.isChild)");
ev("state.monthlyIncome=100; state.spouseIncome=0; state.spendingHabit='普通花費'; state.mealArrangement='自己打理'");
const N = ev("livingBasicNeed(state)");
const adultBase = ev("computeBaseLivingCost(state)");
ev("state.spendingHabit='隨性大方'; state.mealArrangement='外食為主'");
const adultHeavy = ev("computeBaseLivingCost(state)");
A.check("出社會：基本需求(居住分級)×三餐＋可支配×花錢比例", adultBase === Math.round(N + (100 - N) * 0.6) && adultHeavy === Math.round(N * 1.1 + (100 - N) * 0.9), { adultBase, adultHeavy, N });
A.check("月薪100隨性大方外食：每月還有剩", 100 - adultHeavy > 0, 100 - adultHeavy);
ev("state.monthlyIncome=150");
A.check("賺越多剩越多：月薪150的結餘大於月薪100", 150 - ev("computeBaseLivingCost(state)") > 100 - adultHeavy);
const basicAt150 = ev("computeBasicLivingCost(state)");
ev("state.monthlyIncome=100");
A.check("醫療費量級(基本生活開銷)不隨收入變", ev("computeBasicLivingCost(state)") === basicAt150 && basicAt150 === Math.round(N * 1.1));
ev("state.chronicConditions=['高血壓']");
const C = ev("CHRONIC_CONDITION_MONTHLY_COST");
A.check("慢性病：費用另計、先從可支配扣掉", ev("computeBaseLivingCost(state)") === Math.round(N * 1.1 + (100 - N - C) * 0.9) + C);
ev("state.chronicConditions=[]; state.monthlyIncome=0");
A.check("待業：只剩基本需求", ev("computeBaseLivingCost(state)") === Math.round(N * 1.1));

// 3. 結算小字
const txt = (st, cash) => ev(`settlementText(${JSON.stringify(st)}, ${cash})`);
A.check("3個月內(學生)：零用錢/生活開銷/本回合結餘分列", txt({ months: 1, net: 6, rawNet: 6, incomeTotal: 60, expenseTotal: 54, student: true, balanceAfter: 126 }, 0) === "零用錢 +60，生活開銷 −54，本回合結餘 +6；目前存款 126");
A.check("出社會後：「零用錢」改「收入」", txt({ months: 0.5, net: -3, rawNet: -3, incomeTotal: 20, expenseTotal: 23, student: false, balanceAfter: 40 }, 0) === "收入 +20，生活開銷 −23，本回合結餘 −3；目前存款 40");
A.check("超過3個月：區間總結", txt({ months: 14, net: 280, rawNet: 280, incomeTotal: 700, expenseTotal: 420, student: false, balanceAfter: 1240 }, 0) === "這段期間收入約 700，支出約 420，結餘 +280；目前存款 1,240");
A.check("舊存檔紀錄：維持舊格式", txt({ months: 1, net: 20, balanceAfter: 87 }, 0) === "本回合結算：1個月淨收入 20；目前存款 87");
// 觸底：結餘照實列負數、存款維持0
ev("state.studentStatus='enrolled'; state.monthlyIncome=30; state.monthlyExpenses=[]; state.cash=1; state.spendingHabit='隨性大方'; state.mealArrangement='外食為主'");
ev("applyMonthlySettlement(state, 1); state.lastSettlement.balanceAfter=state.cash");
const floor = ev("JSON.parse(JSON.stringify(state.lastSettlement))");
A.check("學生期觸底：存款維持0", ev("state.cash") === 0 && floor.net === -1);
A.check("觸底：結餘照實列−2", floor.rawNet === -2 && ev("settlementText(state.lastSettlement, state.cash)") === "零用錢 +30，生活開銷 −32，本回合結餘 −2；目前存款 0", ev("settlementText(state.lastSettlement, state.cash)"));
ev("state.monthlyIncome=60; applyMonthlySettlement(state, 0.25)");
A.check("一週的回合按比例換算(60×0.25＝15、59×0.25≈15)", ev("state.lastSettlement.incomeTotal") === 15 && ev("state.lastSettlement.expenseTotal") === 15);

// 4. 手頭狀態
ev("state.monthlyIncome=100; state.cash=50; state.spendingHabit='精打細算'; state.mealArrangement='家裡包辦'"); // 20＋22.5 → 結餘57%
A.check("結餘57%→寬裕", ev("computeMoneySituation(state)") === "寬裕");
ev("state.spendingHabit='隨性大方'; state.mealArrangement='外食為主'"); // 27.5＋67.5＝95 → 5%
A.check("結餘5%→剛好", ev("computeMoneySituation(state)") === "剛好");
ev("state.monthlyIncome=100; state.spendingHabit='普通花費'; state.mealArrangement='自己打理'; state.monthlyExpenses=[{label:'補習',amount:37.5}]"); // 25＋37.5×0.6＝47.5→48，總支出85.5→結餘14.5%
A.check("有固定支出時一起算進支出→剛好", ev("computeMoneySituation(state)") === "剛好");
ev("state.monthlyExpenses=[]; state.monthlyIncome=30; state.spendingHabit='隨性大方'; state.mealArrangement='外食為主'");
A.check("入不敷出、存款還有→吃緊", ev("computeMoneySituation(state)") === "吃緊");
ev("state.cash=0");
A.check("入不敷出、存款0→見底", ev("computeMoneySituation(state)") === "見底");
ev("state.studentStatus='graduated'; state.cash=-20; state.monthlyExpenses=[{label:'房租',amount:500}]");
A.check("出社會後存款負數也算見底", ev("computeMoneySituation(state)") === "見底");
ev("state.monthlyExpenses=[]; state.studentStatus='enrolled'; state.cash=80; state.spendingHabit='普通花費'; state.mealArrangement='自己打理'; state.monthlyIncome=60");

// 5. 小卡
ev("state.mealCareEligibleAtStart=false; state.mealFullyUnlocked=false; render()");
const card = doc.getElementById("lifestyle-card");
A.check("存款下方有生活方式小卡：設定＋每月收入/開銷", card && /普通花費・自己打理/.test(card.textContent) && /每月收入 60/.test(card.textContent) && /每月生活開銷 46/.test(card.textContent), card && card.textContent);
A.check("小卡緊接在存款那一列後面", card && card.previousElementSibling && /存款/.test(card.previousElementSibling.textContent));
const apBefore = ev("totalAP(state)");
card.click();
let modal = doc.getElementById("lifestyle-modal");
const homeBtn = () => [...doc.querySelectorAll("#lifestyle-modal .ls-opt")].find(b => b.dataset.val === "家裡包辦");
A.check("未解鎖：家裡包辦反灰＋原因", modal && homeBtn().disabled && /家裡目前不方便幫忙準備/.test(modal.textContent));
A.check("預覽：調整前等於目前", /調整後每月生活開銷約 46，結餘約 \+14/.test(doc.getElementById("lifestyle-preview").textContent), doc.getElementById("lifestyle-preview").textContent);
[...doc.querySelectorAll("#lifestyle-modal .ls-opt")].find(b => b.dataset.val === "隨性大方").click();
[...doc.querySelectorAll("#lifestyle-modal .ls-opt")].find(b => b.dataset.val === "外食為主").click();
A.check("預覽跟著選項更新：59、結餘+1", /調整後每月生活開銷約 59，結餘約 \+1/.test(doc.getElementById("lifestyle-preview").textContent), doc.getElementById("lifestyle-preview").textContent);
A.check("預覽時還沒改到存檔", ev("state.spendingHabit") === "普通花費");
doc.getElementById("btn-lifestyle-cancel").click();
A.check("取消：不改", ev("state.spendingHabit") === "普通花費" && !doc.getElementById("lifestyle-modal"));
doc.getElementById("lifestyle-card").click();
[...doc.querySelectorAll("#lifestyle-modal .ls-opt")].find(b => b.dataset.val === "隨性大方").click();
[...doc.querySelectorAll("#lifestyle-modal .ls-opt")].find(b => b.dataset.val === "外食為主").click();
doc.getElementById("btn-lifestyle-save").click();
A.check("確定：套用新設定", ev("state.spendingHabit") === "隨性大方" && ev("state.mealArrangement") === "外食為主");
A.check("不花行動點", ev("totalAP(state)") === apBefore);
A.check("小卡立刻更新", /每月生活開銷 59/.test(doc.getElementById("lifestyle-card").textContent));
// 下一回合payload通知一次
ev("state.timeState.stageMode = state.timeState.stageMode || 'highschool'");
await H.playTurn(g);
A.check("下一回合payload：lifestyle_changed_now只列改到的項目", payload && JSON.stringify(payload.lifestyle_changed_now) === JSON.stringify({ from: { spendingHabit: "普通花費", mealArrangement: "自己打理" }, to: { spendingHabit: "隨性大方", mealArrangement: "外食為主" } }), payload && payload.lifestyle_changed_now);
A.check("payload有money_situation", payload && ["寬裕", "剛好", "吃緊", "見底"].includes(payload.money_situation), payload && payload.money_situation);
const st = ev("state.lastSettlement && JSON.parse(JSON.stringify(state.lastSettlement))");
A.check("下一回合起生效：這回合結算用新倍率", !st || st.expenses === 59, st);
await H.playTurn(g);
A.check("再下一回合：不再通知", payload && payload.lifestyle_changed_now === null);
// 改成自己打理 → 烹飪興趣種子
ev("state.cookingInterestSeed=false; renderLifestyleModal()");
[...doc.querySelectorAll("#lifestyle-modal .ls-opt")].find(b => b.dataset.val === "自己打理").click();
doc.getElementById("btn-lifestyle-save").click();
A.check("改成自己打理：cookingInterestSeed＝true", ev("state.cookingInterestSeed") === true);
A.check("通知只列三餐", JSON.stringify(ev("state.lifestyleChangeLog")) === JSON.stringify({ from: { mealArrangement: "外食為主" }, to: { mealArrangement: "自己打理" } }));
ev("renderLifestyleModal()");
[...doc.querySelectorAll("#lifestyle-modal .ls-opt")].find(b => b.dataset.val === "外食為主").click();
doc.getElementById("btn-lifestyle-save").click();
A.check("同一回合改回原樣：通知取消", ev("state.lifestyleChangeLog") === null);
A.check("鎖住的選項不能用程式硬套", (ev("applyLifestyleChange({mealArrangement:'家裡包辦'})"), ev("state.mealArrangement")) === "外食為主");

// 6. 解鎖視窗
ev("state.mealFullyUnlocked=true; renderMealUnlockModal()");
let um = doc.getElementById("meal-unlock-modal");
A.check("解鎖視窗：標題與內文", /生活圈變了，三餐怎麼安排？/.test(um.textContent) && /現在可以自己決定三餐怎麼解決了/.test(um.textContent));
A.check("解鎖視窗：沒有三餐選項按鈕", um.querySelectorAll(".meal-unlock-btn").length === 0);
doc.getElementById("btn-meal-unlock-go").click();
A.check("「去調整」打開生活方式小卡", !doc.getElementById("meal-unlock-modal") && !!doc.getElementById("lifestyle-modal"));
A.check("解鎖後家裡包辦可選", !homeBtn().disabled);
doc.getElementById("btn-lifestyle-cancel").click();
ev("renderMealUnlockModal()");
doc.getElementById("btn-meal-unlock-later").click();
A.check("「之後再說」關閉視窗", !doc.getElementById("meal-unlock-modal") && !doc.getElementById("lifestyle-modal"));

// 7. 歷史紀錄顯示新格式
const lastEntry = [...doc.querySelectorAll(".journal .entry")].map(e => e.textContent).join("\n");
A.check("日記裡的結算小字是分列格式(或這回合沒結算)", !/本回合結算：/.test(lastEntry) || /零用錢 \+/.test(lastEntry));

// 8. prompt
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt說明money_situation四級與純描寫", /money_situation/.test(prompt) && /寬裕/.test(prompt) && /見底/.test(prompt) && /純描寫/.test(prompt) && /不要連續/.test(prompt));
A.check("prompt說明lifestyle_changed_now", /lifestyle_changed_now/.test(prompt));
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));

const ok = A.report();
process.exit(ok ? 0 : 1);
