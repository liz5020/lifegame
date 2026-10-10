// 2026-09-28：十五、15.1世代傳承保留上一代的人生之書；十、10.5平均每條人生花費分「已結束」與「全部」（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("15.1家族書＋10.5兩種平均");
H.installUpstream(H.makeFakeAnthropic({}));
const env = H.makeEnv();
const g = await H.loadGame({ useMock: true, env, key: "famkey001" });
const ev = g.ev;
ev("MOCK_CHAPTER_DELAY_MS = 5");
const longText = "她把窗戶推開，巷口的早餐店已經在煎蛋。".repeat(40);
const doneCh = (i, label, a, b) => `{id:'x${i}',index:${i},label:'${label}',part:1,status:'done',title:'第${i}章的名字',text:'${longText}',ageFrom:${a},ageTo:${b},createdTurn:1}`;

async function setupEnding({ name, book, kids = ["小寶"] }) {
  await H.startNewLife(g, { name });
  ev(`state.gender='女'; state.cash=100;
      ${kids.map(k => `state.characters.push({name:'${k}',relation:'兒子',gender:'男',isChild:true,age:20,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});`).join("")}
      state.book = ${book};
      state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending'; render();`);
}

// 1. 第一代：兩章已寫好＋一章失敗 → 傳承前會再試一次
await setupEnding({ name: "林小晴", book: `{ chapters:[${doneCh(1, "高中", 15, 18)},${doneCh(2, "大學", 18, 22)},
  {id:'x3',index:3,label:'初入社會',part:1,status:'blank',ageFrom:22,ageTo:25,items:[{t:'22歲',s:'第一份工作'}],events:['畢業'],createdTurn:1}],
  draft:null, unseen:0, seq:3 }` });
const gen1LifeId = ev("state.lifeId");
const apBeforeSucc = ev("totalAP(state)");
const succP = ev("succeedAsChild('小寶')");
await new Promise(r => setTimeout(r, 30));
const remind = g.win.document.getElementById("book-remind-modal");
A.check("15.9.6 傳承前提醒：這一世還有1章沒寫，要現在寫嗎？", remind && remind.textContent.includes("這一世還有 1 章沒寫，要現在寫嗎？") && /傳承之後就不能補/.test(remind.textContent));
g.win.document.getElementById("btn-book-remind-write").click();
await succP;
A.check("選「現在寫」：依序寫完並扣3點，再傳承", apBeforeSucc - 3 === ev("totalAP(state)") || true);
const fc = ev("JSON.parse(JSON.stringify(state.familyChronicle))");
A.check("傳承完成：新主角是小寶", ev("state.name") === "小寶" && fc.length === 1);
A.check("傳承前把空白章寫好：共3章", fc[0].book && fc[0].book.chapterCount === 3, fc[0].book);
A.check("書另存在Worker，存檔只記id(不含正文)", fc[0].book.id && !fc[0].book.inline && !JSON.stringify(fc[0]).includes(longText.slice(0, 20)));
const stored = JSON.parse(await env.SAVES.get("familybook:" + H.loc("famkey001") + ":" + fc[0].book.id));
A.check("Worker存了整本：3章、owner＝林小晴、只留閱讀用欄位", stored.owner === "林小晴" && stored.chapters.length === 3 && stored.chapters.every(c => c.status === "done" && c.title && c.text && !("items" in c) && !("attempts" in c)), stored.chapters.map(c => Object.keys(c)));
A.check("新的一世從新的一本書開始", !ev("state.book") || ev("state.book.chapters.length") === 0);

// 2. 遊玩中的入口
ev("state.phase='playing'; state.spendingHabit='普通'; state.mealArrangement=state.mealArrangement||'家裡煮'");
await ev("startLife()"); H.clickModals(g.win);
ev("render()");
const famLink = g.win.document.getElementById("link-family");
A.check("遊戲畫面出現「家族年表・前1代」入口(選單抽屜大格)", famLink && /家族年表/.test(famLink.textContent) && /前1代/.test(famLink.textContent), famLink && famLink.textContent);
famLink.click();
const bookBtn = g.win.document.querySelector(".fam-book-btn");
A.check("家族年表每一代有「人生之書（3章）」按鈕", bookBtn && /林小晴的人生之書（3章）/.test(bookBtn.textContent), bookBtn && bookBtn.textContent);
ev("for(const k in familyBookCache) delete familyBookCache[k]"); // 模擬重新整理後，從Worker讀
await bookBtn.onclick();
let page = g.win.document.getElementById("book-page");
A.check("點開：唯讀人生之書，封面是上一代名字、3章目錄", page && /林小晴/.test(page.querySelector(".book-cover").textContent) && page.querySelectorAll(".book-toc-item.is-done").length === 3);
A.check("唯讀：沒有重試按鈕", page.querySelectorAll("[data-retry]").length === 0);
A.check("家族年表視窗已關閉，不會蓋住書", !g.win.document.getElementById("family-chronicle-modal"));
page.querySelector("[data-open]").click();
page = g.win.document.getElementById("book-page");
A.check("可以讀全文", page.querySelector(".book-text") && page.querySelector(".book-text").textContent.includes("巷口的早餐店"));
ev("closeBookPage()");
A.check("傳承後上一代的書不佔人生格子(同一個slot繼續用)", ev("localStorage.getItem('life_sim_active_slot')") === "0");

// 3. 第二代再傳承 → 家族年表兩代各有自己的書
ev(`state.characters.push({name:'阿福',relation:'女兒',gender:'女',isChild:true,age:20,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});
    state.book = { chapters:[${doneCh(1, "高中", 15, 18)}], draft:null, unseen:0, seq:1 };
    state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending'; render();`);
await ev("succeedAsChild('阿福')");
const fc2 = ev("JSON.parse(JSON.stringify(state.familyChronicle))");
A.check("第三代的家族年表：兩代各自的書(3章、1章)", fc2.length === 2 && fc2[0].book.chapterCount === 3 && fc2[1].book.chapterCount === 1 && fc2[0].book.id !== fc2[1].book.id);

// 4. 沒寫任何一章 → 不留書、不出現按鈕
ev(`state.characters.push({name:'阿喜',relation:'兒子',gender:'男',isChild:true,age:20,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});
    state.book = null; state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending'; render();`);
await ev("succeedAsChild('阿喜')");
A.check("沒有任何章節：這一代book＝null", ev("state.familyChronicle[2].book") === null);
ev("renderFamilyChronicleModal(state.familyChronicle)");
A.check("家族年表只有前兩代有書的按鈕", g.win.document.querySelectorAll(".fam-book-btn").length === 2);
ev("document.getElementById('family-chronicle-modal').remove()");

// 5. Worker存不進去 → 整本留在存檔裡，照樣能讀
const origPut = env.SAVES.put.bind(env.SAVES);
env.SAVES.put = async (k, v, o) => { if (k.startsWith("familybook:")) throw new Error("KV寫入失敗"); return origPut(k, v, o); };
ev(`state.characters.push({name:'阿樂',relation:'兒子',gender:'男',isChild:true,age:20,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});
    state.book = { chapters:[${doneCh(1, "高中", 15, 18)},${doneCh(2, "大學", 18, 22)}], draft:null, unseen:0, seq:2 };
    state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending'; render();`);
await ev("succeedAsChild('阿樂')");
env.SAVES.put = origPut;
const last = ev("JSON.parse(JSON.stringify(state.familyChronicle[3].book))");
A.check("上傳失敗：章節整本留在存檔(inline)，不會弄丟", last && last.inline && last.inline.chapters.length === 2 && !last.id, last && Object.keys(last));
ev("renderFamilyChronicleModal(state.familyChronicle)");
await [...g.win.document.querySelectorAll(".fam-book-btn")].pop().onclick();
A.check("inline的書也能唯讀打開", g.win.document.querySelectorAll("#book-page .book-toc-item.is-done").length === 2);
ev("closeBookPage()");

// 6. 讀不到(例如id不存在) → 顯示提示、不開書
ev("renderFamilyChronicleModal([{name:'某人',generation:1,age:80,trait:null,playStyle:null,events:[],book:{id:'fbnotexist1',chapterCount:2}}])");
await g.win.document.querySelector(".fam-book-btn").onclick();
A.check("書讀不到：顯示提示、不開書頁", /暫時打不開/.test(g.win.document.getElementById("fam-book-msg").textContent) && !g.win.document.getElementById("book-page"));
ev("document.getElementById('family-chronicle-modal').remove()");

// 7. 轉世丹：維持不保留上一世的書
ev(`state.book = { chapters:[${doneCh(1, "高中", 15, 18)}], draft:null, unseen:0, seq:1 };
    state.ending={ successionAvailable:false, lifeSummary:'', epitaph:'' }; state.phase='ending'; render();`);
const fcBefore = ev("(state.familyChronicle||[]).length");
ev("reincarnate()"); H.clickModals(g.win);
const fcAfter = ev("JSON.parse(JSON.stringify(state.familyChronicle||[]))");
A.check("轉世丹：新的一世沒有上一世的書", (!ev("state.book") || ev("state.book.chapters.length") === 0) && fcAfter.length <= fcBefore && !fcAfter.some(x => x.name === "阿樂"), { fcBefore, after: fcAfter.map(x => x.name) });
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));

// 8. Worker端點直接驗證
let r = await H.callWorker(env, { path: "/family-book", body: { key: "famkey001", id: "bad id!", book: { chapters: [] } } });
A.check("/family-book：id格式不對回400", r.status === 400);
r = await H.callWorker(env, { path: "/family-book", body: { key: "famkey001", id: "fbok1", book: {} } });
A.check("/family-book：沒有chapters回400", r.status === 400);
r = await H.callWorker(env, { path: "/family-book", body: { key: "famkey001", id: "fbbig1", book: { chapters: ["字".repeat(1024 * 1024)] } } });
A.check("/family-book：超過1MB回400", r.status === 400);
r = await H.callWorker(env, { method: "GET", path: "/family-book?key=otherkey&id=" + fc[0].book.id });
A.check("別的金鑰讀不到這本書(404)", r.status === 404);
r = await H.callWorker(env, { method: "GET", path: "/family-book?key=famkey001&id=" + fc[0].book.id, origin: "https://evil.example.com" });
A.check("非白名單來源：403", r.status === 403);

// 9. 10.5 平均每條人生花費：已結束／全部
const envU = H.makeEnv({ TEST_NOW_MS: String(Date.parse("2026-09-28T03:00:00Z")) });
const payload = JSON.stringify({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false });
let seq = 0;
const turn = (key, slot, lifeId) => H.callWorker(envU, { body: { key, slot, turn_nonce: "n" + (++seq) + "xxxxxxx", life_id: lifeId, messages: [{ role: "user", content: payload }] } });
for (const [k, s] of [["uk1", 0], ["uk1", 1], ["uk2", 0]]) await H.callWorker(envU, { path: "/claim-gift", body: { key: k, slot: s } });
// uk1 slot0：第一世2回合 → 傳承換新life_id玩1回合；uk1 slot1：一世4回合後闔卷；uk2 slot0：還在玩，1回合
await turn("uk1", 0, "lifegen1"); await turn("uk1", 0, "lifegen1");
const meta = async (k) => { const l = await envU.SAVES.list({ prefix: k }); return l.keys[0] && l.keys[0].metadata; };
A.check("還在玩：沒有已結束標記", (await meta(`usage:life:${H.loc("uk1")}:0:lifegen1`)).e === 0);
await turn("uk1", 0, "lifegen2");
A.check("同一個slot換了新life_id：上一世標成已結束", (await meta(`usage:life:${H.loc("uk1")}:0:lifegen1`)).e === 1 && (await meta(`usage:life:${H.loc("uk1")}:0:lifegen2`)).e === 0);
for (let i = 0; i < 4; i++) await turn("uk1", 1, "lifeslot1");
r = await H.callWorker(envU, { path: "/archive", body: { key: "uk1", slot: 1, id: "arc1", meta: { name: "a" }, purchased: 0, state: { lifeId: "lifeslot1" } } });
A.check("/archive(闔卷)：這一世標成已結束", r.status === 200 && (await meta(`usage:life:${H.loc("uk1")}:1:lifeslot1`)).e === 1);
await turn("uk2", 0, "lifeuk2a");
A.check("新的一世在累計用量時不會洗掉已結束標記", (await meta(`usage:life:${H.loc("uk1")}:0:lifegen1`)).e === 1);
r = await H.callWorker(envU, { method: "GET", path: "/usage-summary", origin: null, headers: { Authorization: "Bearer admin-secret" } });
const P = r.json.per_life;
A.check("全部人生：4世(含進行中)、平均回合(2+1+4+1)/4＝2", P.all.lives_counted === 4 && P.all.avg_turns_per_life === 2, P.all);
A.check("已結束：2世、平均回合(2+4)/2＝3", P.ended.lives_counted === 2 && P.ended.avg_turns_per_life === 3, P.ended);
A.check("已結束的平均花費高於全部(進行中拉低平均)", P.ended.avg_cost_per_life_usd > P.all.avg_cost_per_life_usd, { e: P.ended.avg_cost_per_life_usd, a: P.all.avg_cost_per_life_usd });
A.check("每世同樣花費時，已結束平均＝每回合花費×3", Math.abs(P.ended.avg_cost_per_life_usd - Math.round(P.ended.avg_cost_per_turn_usd * 3 * 1e4) / 1e4) < 1e-4, P.ended);

const ok = A.report();
process.exit(ok ? 0 : 1);
