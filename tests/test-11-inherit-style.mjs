// 2026-09-27：七、7.4.2 教養風格寫入新一世（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("7.4.2 教養風格傳承");
H.installUpstream(H.makeFakeAnthropic({}));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "inherit001" });
const ev = g.ev;

async function setupAndSucceed({ log, childAff, withSpouse }) {
  await H.startNewLife(g);
  ev(`state.characters = state.characters.filter(c=>c.origin!=='父母，從出生起' && c.origin!=='隔代教養，從出生起');
      state.gender='女'; state.cash=100;
      ${withSpouse ? "state.characters.push({name:'阿偉',relation:'配偶',gender:'男',romanceStatus:'married',cohabiting:true,affinity:72,active:true,traits:'木訥、愛釣魚',summary:'',lastTurn:0});" : ""}
      state.characters.push({name:'小寶',relation:'兒子',gender:'男',isChild:true,age:20,affinity:${childAff},active:true,traits:'',summary:'一起去過墾丁',lastTurn:0,parentingLog:${JSON.stringify(log)}});
      state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending';`);
  await ev("succeedAsChild('小寶')");
}
const strict = [{ demand_delta: 2, warmth_delta: -1 }, { demand_delta: 3, warmth_delta: -1 }];
await setupAndSucceed({ log: strict, childAff: 40, withSpouse: true });
A.check("parenting_log偏高要求低溫暖 → 威權高壓", ev("state.inheritedParentingStyle") === "威權高壓");
A.check("上一代家長卡(7.4.3.3.1開局時在世)語氣＝威權高壓描述＋過去點滴", ev("state.characters.find(c=>c.prevLifeProfile).traits").startsWith("要求嚴格") && ev("state.characters.find(c=>c.prevLifeProfile).traits").includes("墾丁"));
A.check("在世配偶卡：教養風格描述＋自己的個性", ev("state.characters.find(c=>c.name==='阿偉').traits") === "要求嚴格、少誇獎、講求規矩；木訥、愛釣魚");
A.check("關係值延續不變", ev("state.characters.find(c=>c.name==='阿偉').affinity") === 72 && ev("state.characters.find(c=>c.prevLifeProfile).affinity") === 40);

const warm = [{ demand_delta: 1, warmth_delta: 3 }, { demand_delta: 0, warmth_delta: 2 }, { demand_delta: 1, warmth_delta: 2 }];
await setupAndSucceed({ log: warm, childAff: 80, withSpouse: false });
A.check("高要求高溫暖 → 民主開放，無配偶也正常", ev("state.inheritedParentingStyle") === "民主開放" && ev("state.characters.find(c=>c.prevLifeProfile).traits").startsWith("願意溝通"));

await setupAndSucceed({ log: [], childAff: 30, withSpouse: true });
A.check("節點不足2個：依關係值30取最接近 → 情感疏忽", ev("state.inheritedParentingStyle") === "情感疏忽" && ev("state.characters.find(c=>c.name==='阿偉').traits").startsWith("報喜不報憂"));

// 傳承後能正常玩幾回合
g.ev("state.spendingHabit='普通'; state.mealArrangement=state.mealArrangement||'家裡煮'");
await g.ev("startLife()"); H.clickModals(g.win);
for (let i = 0; i < 5; i++) await H.playTurn(g);
A.check("傳承後正常進行5回合", ev("state.turnCount") >= 5 && g.errors.length === 0, { t: ev("state.turnCount"), err: g.errors.map(String).slice(0, 2) });

const ok = A.report();
process.exit(ok ? 0 : 1);
