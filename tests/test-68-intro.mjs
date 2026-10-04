// 2026-10-04：十六、16.18.1 玩法與圖例「一回合怎麼玩」、16.18.2 第一次開局說明、二、2.6.3 重心小標題（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("16.18.1／16.18.2 遊玩說明");
H.installUpstream(H.makeFakeAnthropic({}));

// ---------- 16.18.2 第一次開局：跳窗 ----------
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "intro00001", intro: false });
const ev = g.ev, doc = g.win.document;
ev(`state = newRoll(null, {name:"林小晴", gender:"女"}); state.spendingHabit="普通"; state.mealArrangement="家裡煮";`);
await ev("startLife()"); await H.waitIdle(g);
const modal = doc.getElementById("intro-modal");
A.check("第一次開局：第一回合前跳出說明", !!modal);
A.check("跳窗標題與內容照定案原文", modal && modal.querySelector("h3").textContent === "一回合怎麼玩"
  && modal.textContent.includes("每一回合做兩件事，按下送出時一起算：")
  && modal.textContent.includes("自己寫才有機會拿到最高評價「出色」")
  && modal.textContent.includes("沒有換的話，會沿用上一回合。")
  && modal.textContent.includes("每一回合花 1 點行動點。人生很長，不用一次玩完，隨時可以停下，下次接著寫。")
  && modal.textContent.includes("想再看一次，可以到選單的「玩法與圖例」。"));
const btns = modal ? [...modal.querySelectorAll("button")] : [];
A.check("只有一顆「開始」按鈕", btns.length === 1 && btns[0].textContent === "開始");
A.check("開場回合在背後照常產生，跳窗還在", (ev("state.log.length") >= 1) && !!doc.getElementById("intro-modal"));
ev("render()");
A.check("重新render不會把跳窗弄掉或多跳一個", doc.querySelectorAll("#intro-modal").length === 1);
btns[0] && btns[0].click();
A.check("按開始關閉並記在瀏覽器本機", !doc.getElementById("intro-modal") && g.win.localStorage.getItem("lifegame_intro_seen") === "1");

// ---------- 2.6.3 重心小標題 ----------
ev("render()");
const title = doc.querySelector(".focus-title");
const row = doc.querySelector(".focus-row");
A.check("學生時期重心按鈕列上方有小標題「這段時間的重心」", title && title.textContent === "這段時間的重心" && row && title.nextElementSibling === row);
A.check("小標題沿用按鈕下方小字的樣式(focus-hint)", title && title.classList.contains("focus-hint"));
A.check("按鈕下方原本的小字提示不變", (doc.querySelector(".focus-hint:not(.focus-title)") || {}).textContent === "主要給健康，下個場景可能在家或出門散心");
ev("state.age=25; state.timeState.yearIndex=7; render()");
A.check("沒有重心按鈕時(出社會)小標題也不出現", !ev("focusModeActive(state)") ? !doc.querySelector(".focus-title") && !doc.querySelector(".focus-row") : true, ev("focusModeActive(state)"));

// ---------- 同一台裝置再開一段人生：不再跳 ----------
ev(`state = newRoll(null, {name:"陳大文", gender:"男"}); state.spendingHabit="普通"; state.mealArrangement="家裡煮";`);
await ev("startLife()"); await H.waitIdle(g);
A.check("同一台裝置第二次開局不再跳出", !doc.getElementById("intro-modal"));
H.clickModals(g.win);

// ---------- 世代傳承：不跳 ----------
{
  const g2 = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "intro00002", intro: false });
  await H.startNewLife(g2); // clickModals會按掉第一次的跳窗
  g2.win.localStorage.removeItem("lifegame_intro_seen"); // 模擬：這台裝置沒看過(例如清過資料)，只看傳承本身會不會跳
  g2.ev(`state.characters.push({name:'小寶',relation:'兒子',gender:'男',isChild:true,age:20,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});
         state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending';`);
  await g2.ev("succeedAsChild('小寶')");
  await g2.ev("startLife()"); await H.waitIdle(g2);
  A.check("世代傳承換新主角時不跳", (g2.ev("state.familyChronicle.length") > 0) && !g2.win.document.getElementById("intro-modal"));
}

// ---------- 瀏覽器本機存取失敗：畫面不壞 ----------
{
  const g3 = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "intro00003", intro: false });
  g3.ev(`Storage.prototype._get = Storage.prototype.getItem; Storage.prototype._set = Storage.prototype.setItem;
         Storage.prototype.getItem = function(k){ if(k==="lifegame_intro_seen") throw new Error("blocked"); return this._get(k); };
         Storage.prototype.setItem = function(k,v){ if(k==="lifegame_intro_seen") throw new Error("blocked"); return this._set(k,v); };`);
  g3.ev(`state = newRoll(null, {name:"林小晴", gender:"女"}); state.spendingHabit="普通"; state.mealArrangement="家裡煮";`);
  await g3.ev("startLife()"); await H.waitIdle(g3);
  const m = g3.win.document.getElementById("intro-modal");
  A.check("讀不到本機紀錄：照常跳出", !!m);
  let threw = false; try { m.querySelector("button").click(); } catch (e) { threw = true; }
  A.check("寫不進本機紀錄：按開始仍正常關閉、不報錯", !threw && !g3.win.document.getElementById("intro-modal"));
}

// ---------- 16.18.1 玩法與圖例 ----------
ev("renderLegendModal()");
const lg = doc.getElementById("legend-modal");
const heads = lg ? [...lg.querySelectorAll("h3,h4")].map(h => h.textContent) : [];
const idx = (t) => heads.indexOf(t);
A.check("最前面是「一回合怎麼玩」三段：回應、重心、一個人生有多長",
  idx("一回合怎麼玩") >= 0 && idx("回應：你對眼前這一刻的反應") > idx("一回合怎麼玩")
  && idx("重心：這段時間主要花在哪") > idx("回應：你對眼前這一刻的反應")
  && idx("一個人生有多長") > idx("重心：這段時間主要花在哪"), heads);
A.check("原「這段時間想做什麼」改名「興趣和副業怎麼選」，排在一回合怎麼玩之後、月份之前",
  idx("這段時間想做什麼") < 0 && idx("興趣和副業怎麼選") === idx("一個人生有多長") + 1 && idx("月份怎麼看") === idx("興趣和副業怎麼選") + 1, heads);
A.check("其餘節照舊保留", ["月份怎麼看", "地點", "訂單", "曖昧中與在一起", "人物"].every(t => idx(t) >= 0), heads);
const lt = lg ? lg.textContent : "";
A.check("舊末句已改寫", !lt.includes("你自己寫的話永遠優先") && lt.split("你寫的內容會優先寫進故事，成長的部分還是看你選的重心。").length === 3);
A.check("回應段：四級評價、自己寫才有機會出色", lt.includes("出色、不錯、平常或失言") && lt.includes("點選項最高到「不錯」，自己寫才有機會拿到「出色」。"));
A.check("重心段六項", ["・讀書：才識變高", "・興趣：興趣越練越熟", "・社交：人脈變廣", "・休息：身體變好", "・工作：存款變多", "・家人：跟家人更親近"].every(t => lt.includes(t)));
A.check("不寫出社會以後沒有重心(使用者2026-10-04修改)", !lt.includes("出社會以後就沒有這排按鈕"));
A.check("長度段只寫學生時期約380回合，不寫總回合數", lt.includes("學生時期大約 380 回合") && !/1[0-9]{3}\s*回合/.test(lt));

A.check("沒有JS錯誤", g.errors.length === 0, g.errors.map(String));
process.exit(A.report() ? 0 : 1);
