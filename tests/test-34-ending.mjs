// 2026-09-28：十六、16.7 結局人生回顧頁(新結構)＋七、7.4.3.2 免費轉世不保留數值（全程USE_MOCK，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("十六 結局頁");
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "endkey01" });
const ev = g.ev, doc = g.win.document;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
ev("MOCK_AI_DELAY_MS = 0");
await H.startNewLife(g, { name: "林以晴" });
await H.playTurn(g); await sleep(10);
const setEnding = (withKid) => ev(`
  state.age = 78;
  state.ending = { segments:[{stage:"student",label:"學生時期",text:"那幾年總是坐在靠窗的位置。",age_from:15,age_to:22},{stage:"a23",label:"初入社會",text:"第一份工作做了四年。",age_from:23,age_to:29}],
    transitions:[{after_stage:"student",text:"從前往牆邊坐的人，後來會先開口。"}], epitaph:"她走得很慢，但沒有停。" };
  state.characters = state.characters.filter(c=>!c.isChild);
  ${withKid ? `state.characters.push({name:"林小安",relation:"女兒",isChild:true,active:true,affinity:70,gender:"女",age:40,summary:""});` : ``}
  state.phase = "ending"; render();`);

setEnding(true);
const app = doc.getElementById("app");
const order = [...app.querySelectorAll("#end-card, .end-recap, #btn-ending-book, .end-next, #btn-reset-end")].map(e => e.id || e.className);
A.check("16.7 由上到下：結局卡→人生回顧→翻開人生之書→下一步按鈕→闔上這份草稿", JSON.stringify(order) === JSON.stringify(["end-card", "end-recap", "btn-ending-book", "end-next two", "btn-reset-end"]), order);
const card = doc.getElementById("end-card").textContent;
A.check("結局卡：年齡(印章「歲・定稿」)、標題、一句總結(L3墓誌銘)", /78歲・定稿/.test(card) && /人生草稿・第1世/.test(card) && /林以晴/.test(card) && /她走得很慢，但沒有停。/.test(card));
A.check("結局卡角落有「分享這一生」小圖示按鈕", doc.getElementById("btn-ending-share")?.getAttribute("aria-label") === "分享這一生" && !!doc.querySelector("#end-card #btn-ending-share"));
const recap = doc.querySelector(".end-recap");
A.check("人生回顧：L1段落回顧與L2變化句直接展開(沒有收合元件)", /那幾年總是坐在靠窗的位置/.test(recap.textContent) && /第一份工作做了四年/.test(recap.textContent) && /從前往牆邊坐的人/.test(recap.textContent) && !recap.querySelector("details, [hidden]"));
A.check("回顧最後接「翻開人生之書」", /翻開人生之書/.test(doc.getElementById("btn-ending-book").textContent));
doc.getElementById("btn-ending-book").click(); await sleep(20);
A.check("翻開人生之書進入唯讀紀錄", !!doc.getElementById("book-page"));
ev("closeBookPage()");
const next = [...doc.querySelectorAll(".end-next button")];
A.check("有子女：「選一個孩子接著寫」與「再寫一次人生」並列、樣式相同", next.length === 2 && next[0].textContent === "選一個孩子接著寫" && next[1].textContent === "再寫一次人生" && next[0].className === next[1].className);
A.check("「闔上這份草稿」次要樣式(文字按鈕)，取代「就此闔卷」", doc.getElementById("btn-reset-end").textContent === "闔上這份草稿" && doc.getElementById("btn-reset-end").classList.contains("text-btn") && !/就此闔卷|服下轉世丹/.test(app.textContent));
A.check("不再顯示隱藏數值(福緣)與舊的六格數值", !/福緣|羈絆/.test(app.textContent) && !app.querySelector(".roll-grid"));
A.check("選孩子的清單先收起", doc.getElementById("end-kids").hidden === true);
doc.getElementById("btn-succeed-open").click();
A.check("按「選一個孩子接著寫」展開子女清單", doc.getElementById("end-kids").hidden === false && !!doc.querySelector('.choice-btn[data-child="林小安"]'));

setEnding(false);
const next2 = [...doc.querySelectorAll(".end-next button")];
A.check("無子女：只顯示「再寫一次人生」", next2.length === 1 && next2[0].textContent === "再寫一次人生" && !doc.getElementById("btn-succeed-open"));

// 分享
g.win.navigator.clipboard = { writeText: async (t) => { g.win.__copied = t; } };
await ev("shareThisLife()");
A.check("分享：不支援系統分享時複製文字(名字、享年、墓誌銘、網址)", /林以晴，享年78歲。「她走得很慢，但沒有停。」/.test(g.win.__copied || "") && /lifegamepage/.test(g.win.__copied || "") && /已複製/.test(doc.getElementById("end-share-msg").textContent));

// 7.4.3.2 免費轉世：不保留任何數值、點數全部保留、敘事痕跡不直接說前世
ev("state.ap.gift = 33; state.ap.daily = 4");
const before = JSON.parse(ev("JSON.stringify({r:state.reincarnations||0, ap:totalAP(state)})"));
let carried = null;
ev("window.__origNewRoll = newRoll; newRoll = function(c, id){ window.__carry = c; return window.__origNewRoll(c, id); }");
doc.getElementById("btn-reincarnate").click(); await sleep(20);
carried = JSON.parse(ev("JSON.stringify(window.__carry)"));
ev("newRoll = window.__origNewRoll");
A.check("7.4.3.2 轉世不帶任何數值加成(沒有health/knowledge/network/expression/savingsCarry)", carried && !["health", "knowledge", "network", "expression", "savingsCarry"].some(k => k in carried), carried);
A.check("轉世：世代數＋1、點數全部保留(十、10.3.6)", ev("state.reincarnations") === before.r + 1 && ev("totalAP(state)") === before.ap);
A.check("7.4.3.2 敘事痕跡寫成說不上來的熟悉感，不直接說「前世」", /熟悉感/.test(carried.chronicleCarry) && !/前世/.test(carried.chronicleCarry));

// 闔上這份草稿 → 進唯讀封存區
g.win.localStorage.setItem("life_sim_active_slot", "0");
ev(`state.phase="playing"; state.ending={segments:[],epitaph:"x"}; state.phase="ending"; render()`);
doc.getElementById("btn-reset-end").click(); await sleep(80);
const archives = await ev("fetch(WORKER_URL+'archives?key=endkey01').then(r=>r.json()).then(d=>d.archives.length)");
const localArch = JSON.parse(g.win.localStorage.getItem("life_sim_archive:endkey01") || "[]").length;
A.check("闔上這份草稿：這一生收進人生回顧(Worker或本機後備)、本機進行中存檔移除、離開結局頁", archives + localArch === 1 && ev("state.phase") !== "ending" && !g.win.localStorage.getItem("life_sim_save_v1:0"), { archives, localArch, phase: ev("state.phase") });

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
