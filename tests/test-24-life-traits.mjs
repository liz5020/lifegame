// 2026-09-27：七、7.7 人生特質（分類、特質卡、先猜再揭曉、分享卡、家族年表、下一代開局素材）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("7.7 人生特質");
let lastBody = "";
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => { lastBody = JSON.stringify(p); return {}; } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "traits0001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const doc = g.win.document;
const cls = (p) => JSON.parse(ev(`JSON.stringify(classifyLifeTrait(Object.assign(newPlayStyle(), ${JSON.stringify(p)})))`));

A.check("計數太少：還看不太出", cls({ risk: 1, riskEvents: 1 }).type === null && cls({ risk: 1, riskEvents: 1 }).text.includes("看不太出"));
A.check("高風險＋失敗後多重來 → 往沒走過的路走", cls({ risk: 4, riskEvents: 5, setback: { retry: 2, pivot: 0, rest: 0 } }).type === "explorer");
A.check("偏離常規多＋關係投入低 → 照自己的步調", cls({ deviation: 4, relation: -2, relationEvents: 2 }).type === "ownPath");
A.check("低風險＋關係投入 → 穩穩地過", cls({ risk: -4, riskEvents: 4, relation: 2, relationEvents: 2 }).type === "steadyCare");
A.check("關係投入極高且抉擇多圍繞人 → 為了某個人", cls({ relation: 6, relationEvents: 6, riskEvents: 1 }).type === "forPeople");
A.check("跳過多＋按部就班 → 照計畫走", cls({ skips: 20, deviation: 0, riskEvents: 1 }).type === "planner");
A.check("失敗後多休息＋興趣持續長 → 慢慢來", cls({ setback: { retry: 0, pivot: 0, rest: 3 }, longestInterest: { category: "藝術創作", turns: 200 }, riskEvents: 2 }).type === "slowDeep");
A.check("六種描述都不含評價詞", ev("Object.values(LIFE_TRAITS).every(x=>!/失敗|可惜|遺憾|成功|更好|應該/.test(x.desc))"));

// 死亡時判定
ev("state.playStyle=Object.assign(newPlayStyle(),{risk:-4,riskEvents:4,relation:2,relationEvents:2})");
ev("state.lifeTrait = classifyLifeTrait(state.playStyle)");
A.check("死亡時判定存進state.lifeTrait", ev("state.lifeTrait.type") === "steadyCare");

// 人生回顧流程
ev(`state = { phase:"archiveView", archived: { name:"林小晴", age:80, reincarnations:0, ending:{segments:[],epitaph:""}, log:[],
  playStyle: Object.assign(newPlayStyle(),{risk:-4,riskEvents:4,relation:2,relationEvents:2}), lifeTrait: classifyLifeTrait(Object.assign(newPlayStyle(),{risk:-4,riskEvents:4,relation:2,relationEvents:2})),
  chronicle:["（18歲）高中畢業","（23歲）第一份正職工作","（30歲）和阿偉結婚","（65歲）退休了"],
  familyChronicle:[{name:"林大明",generation:1,age:77,trait:{type:null,text:"這一生還看不太出特定樣子。"},playStyle:newPlayStyle(),events:["（20歲）大學畢業"]}] }, backItems:[] }; render();`);
A.check("人生回顧有「看看這一生的樣子」與家族年表", !!doc.getElementById("btn-archive-traits") && !!doc.getElementById("btn-archive-family"));
doc.getElementById("btn-archive-traits").click();
A.check("先出現特質卡、不寫描述、有六個猜測選項", !!doc.querySelector("#life-trait-modal svg.trait-card") && doc.querySelectorAll(".trait-guess-btn").length === 6 && !doc.getElementById("life-trait-modal").textContent.includes("把多出來的力氣"));
doc.querySelector('.trait-guess-btn[data-key="steadyCare"]').click();
const rv = doc.getElementById("trait-reveal").textContent;
A.check("揭曉：描述＋真實事件＋猜中收尾", rv.includes("把多出來的力氣") && rv.includes("退休了") && rv.includes("你比誰都清楚"), rv.slice(0, 200));
doc.getElementById("btn-trait-share").click();
A.check("分享卡：列出系統事件可勾選(預設前3)", doc.querySelectorAll(".share-ev").length === 4 && doc.querySelectorAll(".share-ev:checked").length === 3);
doc.getElementById("btn-share-save").click();
A.check("jsdom沒有canvas：顯示提示、不報錯", doc.getElementById("share-card-msg").textContent.length > 0);
doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove());
doc.getElementById("btn-archive-family").click();
A.check("家族年表每一代一格", doc.querySelectorAll(".fam-gen-btn").length === 1);
doc.querySelector(".fam-gen-btn").click();
A.check("點開上一代：看不太出時直接顯示那句話、不猜", doc.getElementById("life-trait-modal").textContent.includes("看不太出") && doc.querySelectorAll(".trait-guess-btn").length === 0);
doc.querySelectorAll(".modal-backdrop").forEach(x => x.remove());

// 傳承：家族年表與下一代開局素材
await H.startNewLife(g);
await ev(`state.playStyle=Object.assign(newPlayStyle(),{skips:20,deviation:0,riskEvents:1}); state.chronicle=["（18歲）高中畢業","（40歲）買了房子"];
    state.characters.push({name:'小寶',relation:'兒子',gender:'男',isChild:true,age:20,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});
    state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending'; succeedAsChild('小寶')`);
A.check("傳承：上一代特質存進家族年表", ev("state.familyChronicle.length") === 1 && ev("state.familyChronicle[0].trait.type") === "planner");
A.check("下一代記著上一代事件標題", ev("state.prevGenerationEventTitles.includes('（40歲）買了房子')"));
ev("state.spendingHabit='普通'; state.mealArrangement=state.mealArrangement||'家裡煮'");
await g.ev("startLife()"); await new Promise(r => setTimeout(r, 100)); H.clickModals(g.win); // startLife不會等開場回合跑完
A.check("開場回合送previous_generation_events", /previous_generation_events[^\]]*買了房子/.test(lastBody.replace(/\\"/g, '"')));
A.check("計數器不送AI", !/"playStyle"|"familyChronicle"/.test(lastBody.replace(/\\"/g, '"')));
await H.playTurn(g);
A.check("第二回合起不再送", !/previous_generation_events[^n]*買了房子/.test(lastBody.replace(/\\"/g, '"')));

// jsdom沒有實作canvas，呼叫getContext會記一筆「Not implemented」；真實瀏覽器不會，這筆不算
const realErrors = g.errors.filter(e => !/HTMLCanvasElement\.prototype\.getContext/.test(String(e)));
A.check("整段沒有jsdom錯誤(不含jsdom不支援canvas)", realErrors.length === 0, realErrors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
