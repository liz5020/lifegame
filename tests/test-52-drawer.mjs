// 2026-09-30：底部選單抽屜、線條圖示、無紫色與emoji、玩法與圖例、帳務(十六、16.17／16.18)（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("底部選單抽屜");
const fake = H.makeFakeAnthropic({});
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "drw0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = "ap:drw0000001:0"; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
await H.playTurn(g, "嗯");
ev("render()");
const EMOJI = /[\u{1F300}-\u{1FAFF}☀-⛿✀-➿⭐⏰-⏿️]/u;

// ---------- 頂部列 ----------
const top = doc.querySelector(".topbar");
A.check("16.17 頂部列不再有右上角圓形按鈕", !doc.querySelector(".tb-btns") && !doc.querySelector(".round-btn"));
A.check("16.17 頂部列保留：年齡圓章、大標題(含月份)、小字進度行、行動點、存款", !!top.querySelector("#age-stamp, .tb-stamp") && /・\d+月/.test(top.querySelector(".tb-stage").textContent) && !!top.querySelector("#ap-total") && !!top.querySelector("#tb-cash") && !!top.querySelector(".tb-sub .right"));
A.check("16.17 行動點用線條圖示、不用⚡", !!top.querySelector("#ap-total svg.ic-svg") && !/⚡/.test(top.textContent));

// ---------- 選單鈕 ----------
const fab = doc.getElementById("btn-drawer");
A.check("16.17 選單鈕在輸入框左側(珊瑚紅圓形、線條圖示)", !!fab && fab.classList.contains("menu-fab") && fab.nextElementSibling && fab.nextElementSibling.id === "custom-input" && !!fab.querySelector("svg.ic-svg"));
A.check("16.17 抽屜預設關閉", !doc.getElementById("drawer").classList.contains("open"));
fab.click();
A.check("16.17 按選單鈕：抽屜升起，圖示變叉叉", doc.getElementById("drawer").classList.contains("open") && ev("drawerOpen") === true && /M18 6 6 18/.test(doc.getElementById("btn-drawer").innerHTML));
doc.getElementById("btn-drawer").click();
A.check("16.17 再按一次：關閉，圖示變回選單", !doc.getElementById("drawer").classList.contains("open") && /M4 5h16/.test(doc.getElementById("btn-drawer").innerHTML));

// ---------- 三組與大格 ----------
const secs = [...doc.querySelectorAll("#drawer .drawer-sec")].map(x => x.textContent);
A.check("16.17 抽屜三組：我的人生／身邊的世界／其他", secs.join() === "我的人生,身邊的世界,其他", secs);
const tile = (id) => doc.getElementById(id);
const mineIds = [...doc.querySelectorAll("#drawer .tiles")[0].children].map(x => x.id);
A.check("16.17 我的人生：屬性、興趣、人生之書、回憶錄、我的東西(沒有副業時不顯示副業)", ["tile-stats", "link-interests", "link-book", "link-memoir", "link-belongings"].every(i => mineIds.includes(i)) && !mineIds.includes("link-gig"), mineIds);
const worldIds = [...doc.querySelectorAll("#drawer .tiles")[1].children].map(x => x.id);
A.check("16.17 身邊的世界：人物、地點、帳務", worldIds.join() === "tile-roster,link-places,link-ledger", worldIds);
A.check("16.17 其他：玩法與圖例、存檔・設定、關於我(橫長條)", !!doc.querySelector("#drawer .bars #link-legend") && !!doc.querySelector("#drawer .bars #tile-settings") && !!doc.querySelector("#drawer .bars #link-about-me"));
A.check("16.17 大格結構：圓形底座線條圖示＋名稱＋一行即時資訊", (() => { const t = tile("tile-stats"); return !!t.querySelector(".base svg.ic-svg") && !!t.querySelector(".t") && !!t.querySelector(".n"); })());
A.check("16.17 即時資訊：屬性＝才識、人生之書＝第幾世、人物＝人數、地點＝地點數、帳務＝存款", /^才識 \d+$/.test(tile("tile-stats").querySelector(".n").textContent) && /^第\d+世$/.test(tile("link-book").querySelector(".n").textContent) && /^\d+人$/.test(tile("tile-roster").querySelector(".n").textContent) && /^\d+處$/.test(tile("link-places").querySelector(".n").textContent) && tile("link-ledger").querySelector(".n").textContent === Math.round(ev("state.cash")).toLocaleString());
A.check("16.17 回憶錄大格顯示則數", /^\d+則$/.test(tile("link-memoir").querySelector(".n").textContent));

// 興趣即時資訊、副業大格與小紅點
ev(`state.interestCandidates=[{id:'hc',category:'手作工藝',status:'active',investment:50,sideBusinessStatus:'formal',lastEngagedRound:state.turnCount}]; state.turnCount=100; registerOrders(state, [{client:'林小姐', item:'耳環', size:'small'}]); state.turnCount=102; render()`);
A.check("16.17 興趣即時資訊：最近投入的興趣與等級", tile("link-interests").querySelector(".n").textContent === "手作工藝・熟練", tile("link-interests").querySelector(".n").textContent);
A.check("16.17 有副業時多出「副業」大格，顯示進行中訂單數", !!tile("link-gig") && /進行中 1 單/.test(tile("link-gig").querySelector(".n").textContent));
A.check("16.17 副業小紅點：訂單交期剩1回合", !!tile("link-gig").querySelector(".dot"), tile("link-gig").innerHTML.slice(0, 80));
ev(`state.interestCandidates[0].gigOrders[0].due = state.turnCount + 5; render()`);
A.check("16.17 副業小紅點：沒有快到期的訂單就沒有紅點", !tile("link-gig").querySelector(".dot"));
ev(`state.interestCandidates[0].gigOrders[0].due = state.turnCount - 1; render()`);
A.check("16.17 副業小紅點：已逾期", !!tile("link-gig").querySelector(".dot"));
ev(`state.newCharTurns=[state.turnCount]; state.appearLog=(state.appearLog||[]).concat([{turn:state.turnCount,names:[]}]); render()`);
A.check("16.17 人物小紅點：上一回合出現新人物", !!tile("tile-roster").querySelector(".dot"));
ev(`state.newCharTurns=[]; render()`);
A.check("16.17 人物小紅點：沒有新人物就沒有", !tile("tile-roster").querySelector(".dot"));

// ---------- 點大格 ----------
doc.getElementById("btn-drawer").click();
tile("link-places").click();
A.check("16.17 點「地點」：收起抽屜、開地點面板", !!doc.getElementById("places-modal") && !doc.getElementById("drawer").classList.contains("open"));
doc.getElementById("places-modal").remove();
doc.getElementById("btn-drawer").click();
tile("tile-stats").click();
A.check("16.17 點「屬性」：收起抽屜、開數值面板", doc.getElementById("panel-stats").classList.contains("open") && !doc.getElementById("drawer").classList.contains("open"));
ev("setPanel(null)");
doc.getElementById("btn-drawer").click();
tile("tile-roster").click();
A.check("16.17 點「人物」：開通訊錄面板", doc.getElementById("panel-roster").classList.contains("open"));
ev("setPanel(null)");
doc.getElementById("btn-drawer").click();
doc.getElementById("tile-settings").click();
A.check("16.17 「存檔・設定」：開設定面板，含復原金鑰、切換人生、刪除人生(紅字最底)", doc.getElementById("panel-menu").classList.contains("open") && !!doc.getElementById("link-view-key") && !!doc.getElementById("link-switch-life") && doc.getElementById("panel-menu").lastElementChild.id === "link-reset" && doc.getElementById("link-reset").classList.contains("danger"));
ev("setPanel(null)");
ev("interestPickerOpen=false; state.focusWorkId=null");

// ---------- 帳務 ----------
doc.getElementById("btn-drawer").click();
tile("link-ledger").click();
const lm = doc.getElementById("ledger-modal");
A.check("16.17 帳務：目前存款、每回合收支明細、開銷細項說明", !!lm && /目前存款/.test(lm.textContent) && /點結算列裡的項目可以看明細/.test(lm.textContent) && /本回合結餘/.test(lm.textContent), lm && lm.textContent.slice(0, 120));
lm.remove();

// ---------- 玩法與圖例 ----------
doc.getElementById("btn-drawer").click();
doc.getElementById("link-legend").click();
const lg = doc.getElementById("legend-modal");
const heads = [...lg.querySelectorAll("h4")].map(x => x.textContent);
A.check("16.18 玩法與圖例：月份、地點、重心取捨、訂單、曖昧與關係成立、人物", ["月份怎麼看", "地點", "這段時間想做什麼", "訂單", "曖昧中與在一起", "人物"].every(h => heads.includes(h)), heads);
A.check("16.18 「興趣」練功與「工作：副業」趕單的取捨有寫", /選「興趣」/.test(lg.textContent) && /選「工作」/.test(lg.textContent) && /練功/.test(lg.textContent) && /趕手上的單/.test(lg.textContent));
A.check("18.16.5 人物說明加一句「衝突背後，通常有一件沒說出口的在意。」", lg.textContent.includes("衝突背後，通常有一件沒說出口的在意。"));
A.check("16.18 白話：不出現系統用語(好感度、投入度、重心)", !/好感度|投入度|重心/.test(lg.textContent));
lg.remove();


// 人物大格人數：不算已故、失聯仍算
ev(`state.characters.push({name:'已故甲',relation:'朋友',gender:'男',age:60,affinity:50,active:false,traits:'',summary:'',lastTurn:0,isChild:false,deceased:true},{name:'失聯乙',relation:'朋友',gender:'女',age:30,affinity:50,active:false,traits:'',summary:'',lastTurn:0,isChild:false,lost:true}); render()`);
const alive = ev("state.characters.filter(c=>!c.deceased).length");
A.check("16.17 人物大格人數不算已故的人、失聯的仍算", tile("tile-roster").querySelector(".n").textContent === `${alive}人` && ev("state.characters.length") === alive + 1, tile("tile-roster").querySelector(".n").textContent);

// ---------- 無emoji、無紫色 ----------
ev("state.interestCandidates=[]; state.reviewFlags=[]; render()");
const visible = doc.getElementById("app").textContent;
A.check("16.17 玩家看得到的介面(頂部、抽屜、輸入區、設定面板)沒有emoji", !EMOJI.test(visible), (visible.match(EMOJI) || [])[0]);
const css = [...doc.querySelectorAll("style")].map(x => x.textContent).join("\n");
A.check("16.17 樣式表沒有紫色(原回應數值、想找標籤、測試鈕的紫色)", !/#5B3A9A|126,\s*87,\s*194|#6B4FA0|--purple/i.test(css));
ev(`window.__caps = renderStatChanges({ knowledge: 7, network: -2 }, { stats: { knowledge: 2 } })`);
A.check("16.17 回應數值標記：增加＝珊瑚系、減少＝灰棕系、一律保留正負號", /cap resp">才識 \+5/.test(ev("window.__caps")) && /cap resp neg">人脈 -2/.test(ev("window.__caps")) && /cap focus">才識 \+2/.test(ev("window.__caps")), ev("window.__caps"));
ev(`window.__caps2 = renderStatChanges({}, null)`);
A.check("16.17 圖示是內嵌的Lucide官方線條圖示、沒有外部相依", /svg class="ic-svg"/.test(doc.getElementById("app").innerHTML) && !/cdn|unpkg|jsdelivr/i.test(ev("ICON_PATHS.menu + ICON_PATHS.x")));
A.check("16.17 圖示路徑取自官方檔案(選單三條橫線、叉叉)", ev("ICON_PATHS.menu") === '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>' && ev("ICON_PATHS.x") === '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
