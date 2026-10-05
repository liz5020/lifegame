// 2026-09-28：七、7.4.3.3.1～7.4.3.3.3 傳承時間線(上一代在世期間、遺產、健康)（全程USE_MOCK，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("七 傳承時間線");
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "succkey01" });
const ev = g.ev;
ev("MOCK_AI_DELAY_MS = 0; MOCK_CHAPTER_DELAY_MS = 1");
const setup = async ({ childAge, withSpouse = true, cash = 1000, prop = 500, mortgage = 200, kids = 2, illness = true }) => {
  await H.startNewLife(g, { name: "林以恩", gender: "女" });
  ev(`state.age = 78; state.cash = ${cash}; state.propertyValue = ${prop}; state.mortgageBalance = ${mortgage};
    state.majorIllnessTypeByBand = ${illness ? "{'70-79':['中風']}" : "{}"};
    state.ending = { successionAvailable:true, epitaph:'她走得很慢，但沒有停。', overview:'她在巷口開了早午餐店。', segments:[], transitions:[] };
    ${withSpouse ? "state.characters.push({name:'阿偉',relation:'配偶',gender:'男',romanceStatus:'married',cohabiting:true,affinity:72,active:true,traits:'木訥',summary:'',lastTurn:0,age:80});" : ""}
    state.characters.push({name:'小安',relation:'女兒',gender:'女',isChild:true,age:${childAge},affinity:70,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});
    ${kids > 1 ? "state.characters.push({name:'小寶',relation:'兒子',gender:'男',isChild:true,age:" + (childAge - 2) + ",affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});" : ""}
    state.phase = 'ending';`);
  await ev("succeedAsChild('小安')");
};
const prevCard = () => JSON.parse(ev("JSON.stringify(state.characters.find(c=>c.name==='林以恩'))"));

// 1. 孩子40歲時上一代過世 → 開局在世
await setup({ childAge: 40 });
let p = prevCard();
A.check("7.4.3.3.1 孩子15歲開局時上一代還在世(以父母身分出現、同住)", p.deceased === false && p.active === true && p.relation === "母親" && p.cohabiting === true && p.healthStage === 1);
A.check("上一代的年紀＝生下孩子時的年紀＋15(78−40＝38，開局53歲)", p.age === 53, p.age);
A.check("死亡鎖定在孩子40歲那年；遺產份額固定(1000＋500−200＝1300，兩個孩子平分650)", p.lockedDeathChildAge === 40 && p.lockedEstateShare === 650);
A.check("有在世配偶時家庭結構是雙親同住", ev("state.familyStructure") === "雙親同住");
A.check("開局還沒拿到遺產、不另外骰原生家庭的房子(避免重複繼承)", ev("state.successionOpening") === null && ev("state.familyHomeValue") === 0);
A.check("上一世的人生總結、特質、墓誌銘記在卡上", p.prevLifeProfile && p.prevLifeProfile.summary === "她在巷口開了早午餐店。" && p.prevLifeProfile.epitaph === "她走得很慢，但沒有停。" && p.prevLifeIllness === "中風");
ev("state.spendingHabit='普通花費'; state.mealArrangement='自己打理'");
await ev("startLife()"); await H.waitIdle(g, 20); H.clickModals(g.win);
const payload = JSON.parse(ev("buildUserMessage('去上學', false, {structured:true,label:'x'})"));
const rosterPrev = (payload.active_characters || []).find(c => c.name === "林以恩");
A.check("payload：這位家長帶prev_life(人生總結與特質)，AI寫對話時保持一致", rosterPrev && rosterPrev.prev_life && rosterPrev.prev_life.summary === "她在巷口開了早午餐店。", rosterPrev);
// 13.5：狀態機照常，但不會讓他過世
ev("state.characters.find(c=>c.name==='林以恩').healthStage = 3; state.characters.find(c=>c.name==='林以恩').age = 120");
ev("(()=>{ const o=Math.random; Math.random=()=>0; try{ for(let i=0;i<5;i++) rollParentHealthStageAdvance(state); } finally{ Math.random=o; } })()");
p = prevCard();
A.check("7.4.3.3.3 狀態機照常(可到失能)，但死亡結果對他停用(含105歲硬上限)", p.deceased === false && p.healthStage === 3);
ev("state.characters.find(c=>c.name==='林以恩').age = 60; state.characters.find(c=>c.name==='林以恩').healthStage = 1");
// 還沒到40歲不會過世
ev("state.age = 39"); ev("checkLockedParentDeath(state)");
A.check("還沒到鎖定的年紀不會過世", prevCard().deceased === false);
// 到40歲：這一回合過世＋遺產
const cashBefore = ev("state.cash");
ev("state.age = 40"); await H.playTurn(g); await H.waitIdle(g, 20);
p = prevCard();
A.check("7.4.3.3.1 到鎖定的年紀過世(孩子幾歲都照時間走)", p.deceased === true && p.healthStage === 4 && p.estateSettled === true);
A.check("過世寫進人生履歷", ev("state.chronicle.some(x=>/母親過世了/.test(x))"));
A.check("只過世一次、只發一次遺產", (() => { const c0 = ev("state.cash"); ev("checkLockedParentDeath(state); finalizeParentDeath(state,'林以恩')"); return ev("state.cash") === c0; })());

// 2. 事件內容：直接呼叫檢查parentDeathEventLog
await setup({ childAge: 30, withSpouse: false });
A.check("沒有在世配偶、上一世沒離婚沒喪偶：單親－離異", ev("state.familyStructure") === "單親－離異");
ev("state.age = 30"); ev("checkLockedParentDeath(state)");
const log = JSON.parse(ev("JSON.stringify(state.parentDeathEventLog)"));
A.check("7.4.3.3.3 過世事件帶prev_life_parent與同一種疾病(中風)、遺產650", log.prev_life_parent === true && log.same_illness_as_prev_life === "中風" && log.inheritance === 650, log);

// 3. 遺產最低為0、不繼承債務
await setup({ childAge: 30, cash: -500, prop: 100, mortgage: 300, kids: 1 });
A.check("7.4.3.3.2 遺產最低0、不繼承債務", prevCard().lockedEstateShare === 0);

// 4. 孩子未滿15歲時上一代就過世 → 開局即遺產事件
await setup({ childAge: 10, kids: 1 });
p = prevCard();
A.check("7.4.3.3.1 上一代過世時孩子未滿15歲：開局已故", p.deceased === true && p.lockedDeathChildAge === undefined);
const so = JSON.parse(ev("JSON.stringify(state.successionOpening)"));
A.check("開局即遺產事件：記下幾歲時離開、關係、遺產、疾病，遺產開局入帳", so && so.child_age === 10 && so.relation === "母親" && so.estate === 1300 && so.illness === "中風" && ev("state.cash") >= 1300);
A.check("人生履歷寫下「10歲時母親就離開了」", ev("state.chronicle.some(x=>/（10歲）母親就離開了/.test(x))"));
ev("state.spendingHabit='普通花費'; state.mealArrangement='自己打理'; state.phase='playing'");
const pro = JSON.parse(ev("buildUserMessage('開場', false, {structured:true,label:'x',prologue:true})"));
const nonPro = JSON.parse(ev("buildUserMessage('上學', false, {structured:true,label:'x'})"));
A.check("只有開場回合送succession_opening_event", pro.succession_opening_event && pro.succession_opening_event.child_age === 10 && nonPro.succession_opening_event == null);

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
