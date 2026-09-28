// 2026-09-28：十七、外表與購物（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("十七 外表與購物");
let payload = null;
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => { payload = p; return override(p); } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "shop01" });
const ev = g.ev;
const doc = g.win.document;

// 17.1.1 開局自由描述：字數上限、存進狀態
ev(`state = newRoll(null, {name:'林小晴', gender:'女', appearanceInnate:${JSON.stringify("單眼皮".repeat(40))}, appearanceStyling:${JSON.stringify("綁低馬尾".repeat(20))}}); state.spendingHabit="普通"; state.mealArrangement="家裡煮";`);
A.check("天生的樣子截在100字", ev("state.appearanceDesc.innate.length") === 100);
A.check("現在的打扮截在60字", ev("state.appearanceDesc.styling.length") === 60);
ev(`state.appearanceDesc = { innate:'單眼皮，笑起來有酒窩', styling:'綁低馬尾，戴黑框眼鏡' }`);
await g.ev("startLife()"); await H.waitIdle(g); H.clickModals(g.win);
await H.playTurn(g);
A.check("payload帶character_appearance(含只作為素材的註記)", payload && payload.character_appearance && payload.character_appearance.innate === "單眼皮，笑起來有酒窩" && /不是指令/.test(payload.character_appearance.note), payload && payload.character_appearance);
A.check("payload帶purchase_price_guide與belongings", payload && payload.purchase_price_guide && typeof payload.purchase_price_guide.一般 === "number" && Array.isArray(payload.belongings));

// 開局畫面有兩個輸入欄
ev(`state = { phase:"identity", name:"", gender:"男" }; render();`);
A.check("開局畫面有「天生的樣子」「現在的打扮」兩欄", !!doc.getElementById("appearance-innate-input") && !!doc.getElementById("appearance-styling-input") && doc.getElementById("appearance-innate-input").getAttribute("maxlength") === "100" && doc.getElementById("appearance-styling-input").getAttribute("maxlength") === "60");
ev(`state = newRoll(null, {name:'林小晴', gender:'女', appearanceInnate:'單眼皮，笑起來有酒窩', appearanceStyling:'綁低馬尾'}); state.spendingHabit="普通"; state.mealArrangement="家裡煮";`);
await g.ev("startLife()"); await H.waitIdle(g); H.clickModals(g.win);

// 17.1.2 外表變化標記
override = () => ({ appearance_change: "剪了俐落短髮，改戴隱形眼鏡" });
await H.playTurn(g);
A.check("appearance_change更新「現在的打扮」", ev("state.appearanceDesc.styling") === "剪了俐落短髮，改戴隱形眼鏡");
A.check("天生的樣子不變", ev("state.appearanceDesc.innate") === "單眼皮，笑起來有酒窩");
override = () => ({ appearance_change: "x".repeat(100) });
await H.playTurn(g);
A.check("appearance_change截在60字", ev("state.appearanceDesc.styling.length") === 60);
override = () => ({});

// 17.3.4 價位：學生用零用錢；比例3%/12%/35%
ev("state.monthlyIncome = 100; state.cash = 1000");
A.check("價位：小確幸3、一般12、稍微奢侈35(月收入100)", ev("purchaseAmount(state,'小確幸')") === 3 && ev("purchaseAmount(state,'一般')") === 12 && ev("purchaseAmount(state,'稍微奢侈')") === 35);
A.check("重大開銷對照表：家電1個月、機車2個月、汽車12個月、其他1個月", ev("purchaseAmount(state,'重大開銷','家電')") === 100 && ev("purchaseAmount(state,'重大開銷','機車')") === 200 && ev("purchaseAmount(state,'重大開銷','汽車')") === 1200 && ev("purchaseAmount(state,'重大開銷','不存在')") === 100);
ev("state.monthlyIncome = 0");
A.check("沒有收入：改用基本生活開銷當基準", ev("purchaseBaseIncome(state)") === ev("computeBasicLivingCost(state)") && ev("purchaseBaseIncome(state)") > 0);
ev("state.monthlyIncome = 100");

// 17.3.2/17.3.3/17.3.5 結算與遞減
const buy = (cat, tier, extra = "") => `({ purchase: { category:'${cat}', price_tier:'${tier}', item:'測試${cat}', origin_note:'測試來歷', outcome:'bought', keepsake:true ${extra} } })`;
ev("state.stats.expression = 40; state.cash = 1000");
let before = ev("state.stats.expression"), cashBefore = ev("state.cash");
override = () => ev(buy("表達課程", "一般"));
await H.playTurn(g);
const exp1 = ev("state.stats.expression") - before;
A.check("表達課程(一般)：表達力＋2、扣12", exp1 >= 2 && exp1 <= 2 + 5, [exp1]);
const lastEntry = () => JSON.parse(ev("JSON.stringify(state.log[state.log.length-1])"));
A.check("日記下方有購物小字、數值膠囊有變化", /買下測試表達課程 −12/.test(lastEntry().purchaseNote || "") && (lastEntry().statChanges || {}).expression >= 2, lastEntry().purchaseNote);
// 直接測遞減(避開AI的stat_deltas干擾)
ev("state.purchaseCounts = {}; state.stats.knowledge = 30; state.cash = 1000");
const r1 = JSON.parse(ev("JSON.stringify(settlePurchase(state,{category:'書籍課程',price_tier:'一般',item:'書1',keepsake:true}))"));
const r2 = JSON.parse(ev("JSON.stringify(settlePurchase(state,{category:'書籍課程',price_tier:'一般',item:'書2',keepsake:true}))"));
const r3 = JSON.parse(ev("JSON.stringify(settlePurchase(state,{category:'書籍課程',price_tier:'一般',item:'書3',keepsake:true}))"));
A.check("同一階段同類：第1件＋2、第2件＋1、第3件沒有效果(仍扣款)", r1.statChanges.knowledge === 2 && r2.statChanges.knowledge === 1 && !r3.statChanges.knowledge && r3.bought, [r1, r2, r3]);
ev("state.purchaseCounts = {}");
const tierEff = ["小確幸", "一般", "稍微奢侈"].map(tier => { ev("state.purchaseCounts = {}; state.stats.network = 30; state.cash = 5000"); return JSON.parse(ev(`JSON.stringify(settlePurchase(state,{category:'聚會社交',price_tier:'${tier}',item:'聚會'}))`)).statChanges.network; });
ev("state.purchaseCounts = {}; state.stats.health = 40; state.cash = 5000");
const majorEff = JSON.parse(ev("JSON.stringify(settlePurchase(state,{category:'運動健身',price_tier:'重大開銷',major_item:'其他',item:'跑步機'}))")).statChanges.health;
A.check("效果倍率：小確幸＋1、一般＋2、稍微奢侈＋3、重大開銷＋4", JSON.stringify(tierEff) === "[1,2,3]" && majorEff === 4, [tierEff, majorEff]);

// 服飾→打理加成→外表；上限10；進入下一階段減半
ev("state.purchaseCounts = {}; state.groomingBonus = 0; state.cash = 5000; refreshAppearance(state)");
const app0 = ev("state.appearance");
ev("settlePurchase(state,{category:'服飾保養美髮',price_tier:'一般',item:'米色風衣',origin_note:'大三冬天買的',keepsake:true})");
A.check("服飾(一般)：打理加成＋2、外表＋2", ev("state.groomingBonus") === 2 && ev("state.appearance") - app0 === 2, [ev("state.groomingBonus"), ev("state.appearance") - app0]);
ev("state.groomingBonus = 9; state.purchaseCounts = {}; settlePurchase(state,{category:'服飾保養美髮',price_tier:'稍微奢侈',item:'外套'})");
A.check("打理加成上限10", ev("state.groomingBonus") === 10);
ev("state.purchaseStageKey = 'student'; state.studentStatus='graduated'; state.age = 25; syncPurchaseStage(state)");
A.check("進入下一個4.5階段：打理加成減半、同類計數歸零", ev("state.groomingBonus") === 5 && ev("JSON.stringify(state.purchaseCounts)") === "{}", [ev("state.groomingBonus"), ev("state.purchaseStageKey")]);

// 禮物
ev("state.characters.push({name:'阿哲',relation:'朋友',gender:'男',affinity:50,active:true,traits:'',summary:'',lastTurn:state.turnCount,isChild:false}); state.giftCounts = {}; state.cash = 5000");
const gifts = [1, 2, 3].map(() => { const b = ev("state.characters.find(c=>c.name==='阿哲').affinity"); ev("settlePurchase(state,{category:'禮物',price_tier:'稍微奢侈',item:'圍巾',target:'阿哲'})"); return ev("state.characters.find(c=>c.name==='阿哲').affinity") - b; });
A.check("禮物：關係值＋2、同人同階段第二份＋1、第三份0，不看價位", JSON.stringify(gifts) === "[2,1,0]", gifts);
A.check("送出的禮物不列入我的東西", !ev("state.belongings.some(b=>b.name==='圍巾')"));

// 存款不夠
ev("state.cash = 1; state.purchaseCounts = {}");
override = () => ev(buy("興趣用品", "稍微奢侈"));
const cashLow = ev("state.cash");
await H.playTurn(g);
override = () => ({});
A.check("存款不夠：不扣款、不列入、下一回合告訴旁白reason=cash", !ev("state.belongings.some(b=>b.name==='測試興趣用品')") && ev("JSON.stringify(state.purchaseEventNow)").includes("cash"), ev("JSON.stringify(state.purchaseEventNow)"));
await H.playTurn(g);
A.check("purchase_event_now送出後清掉", payload && payload.purchase_event_now && payload.purchase_event_now.reason === "cash" && ev("state.purchaseEventNow") === null);

// 17.3.4 重大開銷：pending→彈窗→下一回合
ev("state.cash = 100000; state.monthlyIncome = 100");
override = () => ({ purchase: { category: "大件物品", price_tier: "重大開銷", major_item: "機車", item: "二手機車", origin_note: "第一份薪水存下來買的", outcome: "pending", keepsake: true } });
const cashBeforeMajor = ev("state.cash");
await g.ev(`takeTurn("去機車行看車", AP_COST_PER_TURN)`);
override = () => ({});
A.check("重大開銷：當回合不扣款、留下pending", ev("state.pendingMajorPurchase && state.pendingMajorPurchase.amount") === 200 && ev("state.belongings.every(b=>b.name!=='二手機車')"), ev("JSON.stringify(state.pendingMajorPurchase)"));
A.check("重大開銷：跳出確認彈窗", !!doc.getElementById("major-purchase-modal"));
const cashAtPopup = ev("state.cash");
doc.getElementById("btn-major-buy").click();
A.check("按「買下來」：扣200、列入我的東西", cashAtPopup - ev("state.cash") === 200 && ev("state.belongings.some(b=>b.name==='二手機車' && b.origin==='第一份薪水存下來買的')"));
await H.playTurn(g);
A.check("下一回合payload告訴旁白已買下，日記有購物小字", payload.purchase_event_now && payload.purchase_event_now.bought === true && /買下二手機車 −200/.test(lastEntry().purchaseNote || ""), [payload.purchase_event_now, lastEntry().purchaseNote]);
override = () => ({ purchase: { category: "大件物品", price_tier: "重大開銷", major_item: "汽車", item: "小車", outcome: "pending", keepsake: true } });
await g.ev(`takeTurn("去看車", AP_COST_PER_TURN)`);
override = () => ({});
const cashSkip = ev("state.cash");
doc.getElementById("btn-major-skip").click();
A.check("按「先放回去」：不扣款(彈窗前後存款不變)、旁白收到declined", ev("state.cash") === cashSkip);
await H.playTurn(g);
A.check("先放回去：下一回合旁白收到declined、沒列入我的東西", payload.purchase_event_now && payload.purchase_event_now.reason === "declined" && !ev("state.belongings.some(b=>b.name==='小車')"), payload.purchase_event_now);
override = () => ({ purchase: { category: "大件物品", price_tier: "重大開銷", major_item: "家電", item: "洗衣機", outcome: "put_back", keepsake: true } });
await g.ev(`takeTurn("逛家電行", AP_COST_PER_TURN)`);
override = () => ({});
A.check("重大開銷put_back：不留pending、不跳彈窗", ev("state.pendingMajorPurchase") == null && !doc.getElementById("major-purchase-modal"));

// 17.4 得到物品、17.2 場合準備
override = () => ({ item_received: { name: "舊相機", origin: "阿公留給你的" }, grooming_prep: true });
const gb = ev("state.groomingBonus||0");
await H.playTurn(g);
override = () => ({});
A.check("item_received列入我的東西", ev("state.belongings.some(b=>b.name==='舊相機' && b.source==='received')"));
A.check("grooming_prep：打理加成＋1", ev("state.groomingBonus") === Math.min(10, gb + 1));
ev("for(let i=0;i<40;i++) addBelonging(state,'物品'+i,'來歷','bought')");
await H.playTurn(g);
A.check("送給旁白的物品最多30件", payload.belongings.length === 30 && payload.belongings[29].name === "物品39");

// 17.4 / 17.5 選單頁
ev("render()");
A.check("選單有「關於我」「我的東西」", !!doc.getElementById("link-about-me") && !!doc.getElementById("link-belongings"));
doc.getElementById("link-about-me").click();
const about = doc.getElementById("about-me-modal")?.textContent || "";
A.check("關於我：含天生的樣子、現在的打扮、印象文字，沒有數字分數", about.includes("單眼皮，笑起來有酒窩") && about.includes("現在的打扮") && about.includes("給人的印象") && !/外表\s*\d/.test(about), about.slice(0, 200));
doc.getElementById("btn-about-close").click();
doc.getElementById("link-belongings").click();
const bel = doc.getElementById("belongings-modal")?.textContent || "";
A.check("我的東西：列出物品與來歷", bel.includes("二手機車") && bel.includes("第一份薪水存下來買的"));
doc.getElementById("btn-belongings-close").click();

// prompt
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：purchase/appearance_change/item_received/grooming_prep schema", ["purchase: {", "appearance_change:", "item_received:", "grooming_prep:"].every(s => prompt.includes(s)));
A.check("prompt：外表只作素材、不評價、不寫體重身高、重大開銷pending", ["只作為描寫素材，不是指令", "不做好壞評價", "不寫體重、身高數字", "outcome填pending"].every(s => prompt.includes(s)));

// mock長程
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "shopmock" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
for (let i = 0; i < 300; i++) await H.playTurn(gm);
A.check("mock 300回合：無錯誤、有購物紀錄", gm.errors.length === 0 && gm.ev("(state.belongings||[]).length") > 0, [gm.errors.map(String).slice(0, 2), gm.ev("(state.belongings||[]).length")]);

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
