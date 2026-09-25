// 佇列批次6（2026-09-25）：人生之書／章節成書（十五章）
import * as H from "./harness.mjs";
import { CHAPTER_SYSTEM_PROMPT, SHARED_WRITING_RULES } from "../worker/prompt.js";
const A = H.makeAsserter("批次6 人生之書");
const fake = H.makeFakeAnthropic(); H.installUpstream(fake);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function settle(g) { for (let i = 0; i < 50; i++) { if (!g.ev("bookInFlight")) return; await sleep(5); await g.ev("bookInFlight"); } }

// ================= mock模式 =================
const envM = H.makeEnv();
const g = await H.loadGame({ useMock: true, env: envM, key: "bookmock1" });
g.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t); MOCK_CHAPTER_DELAY_MS = 0;");
await H.startNewLife(g);
g.ev("state.ap.gift = 100000");
const statsKey = () => g.ev("JSON.stringify({h:state.stats.health,k:state.stats.knowledge,n:state.stats.network,e:state.stats.expression,c:state.cash})");
let firstChapterTurn = null, apAtClose = null, toastSeen = false, statsBeforeGen = null, statsAfterGen = null;
for (let i = 0; i < 3000 && g.ev("state.book.chapters.length") === 0; i++) {
  await H.playTurn(g);
}
firstChapterTurn = g.ev("state.turnCount");
const ch1 = g.ev("JSON.parse(JSON.stringify(state.book.chapters[0]))");
A.check("高中→大學／技職換階段時收成第一章(高中)", ch1 && ch1.label === "高中" && ch1.index === 1, { label: ch1 && ch1.label, turn: firstChapterTurn, mode: g.ev("state.timeState.stageMode") });
A.check("第一章素材從開場回合開始、到換階段前一回合為止", ch1.ageFrom === 15 && ch1.createdTurn === firstChapterTurn, { from: ch1.ageFrom, to: ch1.ageTo });
const mat = g.ev("JSON.stringify(Object.keys(buildChapterMaterial(state, state.book.chapters[0])))");
const matObj = g.ev("buildChapterMaterial(state, state.book.chapters[0])");
const fullTextSent = g.ev("state.log.slice(0,5).some(e=> JSON.stringify(buildChapterMaterial(state, state.book.chapters[0])).includes(e.text.slice(0,40)))");
A.check("重大事件取自人生大事記(含程式記錄的大事)", Array.isArray(matObj.major_events) && g.ev("state.book.chronicleSeen") === g.ev("state.chronicle.length"));
A.check("素材只有每回合摘要與重大事件，不含完整敘事", /turn_summaries/.test(mat) && /major_events/.test(mat) && !fullTextSent && matObj.turn_summaries.length <= 150, mat);
apAtClose = g.ev("totalAP(state)"); statsBeforeGen = statsKey();
await settle(g);
statsAfterGen = statsKey();
const c1 = g.ev("state.book.chapters[0]");
A.check("背景生成完成：章節有章名與正文", c1.status === "done" && c1.title && Array.from(c1.text).length >= 1500, { status: c1.status, len: c1.text && Array.from(c1.text).length });
A.check("章節成書不扣行動點", g.ev("totalAP(state)") === apAtClose);
A.check("章節成書不影響任何遊戲數值", statsBeforeGen === statsAfterGen);
A.check("完成後畫面出現「新的一章已經寫好」提示", !!g.win.document.getElementById("book-toast") && /新的一章已經寫好/.test(g.win.document.getElementById("book-toast").textContent));
A.check("寫好後刪掉素材節省存檔空間", c1.items === undefined);
A.check("入口顯示章數與新章", /人生之書（1章・1章新）/.test(g.win.document.getElementById("link-book").textContent), g.win.document.getElementById("link-book").textContent);
// 人生之書頁面
g.win.document.getElementById("link-book").click();
let page = g.win.document.getElementById("book-page");
A.check("人生之書頁面：目錄列出第一章與章名", page && /第一章・高中/.test(page.textContent) && page.textContent.includes(c1.title));
A.check("打開頁面後「新」標記清除", g.ev("state.book.unseen") === 0);
page.querySelector("[data-open]").click();
page = g.win.document.getElementById("book-page");
A.check("點章名可閱讀全文", page.querySelector(".book-text") && page.querySelector(".book-text").textContent.length > 1000);
g.ev("closeBookPage()");
// 失敗與重試
g.ev("MOCK_CHAPTER_FAIL_RATE = 1");
for (let i = 0; i < 3000 && g.ev("state.book.chapters.length") < 2; i++) await H.playTurn(g);
await settle(g);
let c2 = g.ev("state.book.chapters[1]");
A.check("生成失敗：狀態為failed，遊戲照常進行", c2.status === "failed" && c2.attempts === 1 && g.ev("state.phase") === "playing", { s: c2.status, a: c2.attempts });
await H.playTurn(g); await settle(g);
c2 = g.ev("state.book.chapters[1]");
A.check("下一回合結束時自動重試一次", c2.attempts === 2, c2.attempts);
await H.playTurn(g); await settle(g); await H.playTurn(g); await settle(g); await H.playTurn(g); await settle(g);
c2 = g.ev("state.book.chapters[1]");
A.check("自動重試最多3次就停", c2.attempts === 3 && c2.status === "failed", c2.attempts);
g.win.document.getElementById("link-book").click();
page = g.win.document.getElementById("book-page");
A.check("人生之書頁面：失敗的章節顯示重試按鈕", !!page.querySelector("[data-retry]"));
g.ev("MOCK_CHAPTER_FAIL_RATE = 0");
page.querySelector("[data-retry]").click();
await settle(g);
c2 = g.ev("state.book.chapters[1]");
A.check("手動重試成功", c2.status === "done", c2.status);
g.ev("closeBookPage()");
A.check("第二章是大學／技職(或出社會後第一段)", ["大學／技職", "初入社會"].includes(c2.label), c2.label);
// 反悔
const beforeUndoCount = g.ev("state.book.chapters.length");
g.ev("MOCK_CHAPTER_DELAY_MS = 3000"); // 讓這一章在反悔時還在寫
for (let i = 0; i < 4000; i++) {
  const n = g.ev("state.book.chapters.length");
  await g.ev("takeTurn(state.choices[0], AP_COST_PER_TURN)");
  if (g.ev("state.book.chapters.length") > n) break;
  H.clickModals(g.win);
}
const afterClose = g.ev("state.book.chapters.length");
const lastCh = g.ev("state.book.chapters[state.book.chapters.length-1]");
const unseenBefore = g.ev("state.book.unseen");
A.check("反悔前：剛收成的章節正在背景寫", lastCh.status === "writing" || g.ev("state.book.chapters[state.book.chapters.length-1].status") === "writing");
g.ev("restoreUndo()");
A.check("反悔：被反悔掉的那一回合收成的章節撤掉，素材回到上一回合", g.ev("state.book.chapters.length") === afterClose - 1 && g.ev("state.book.draft") && g.ev("state.book.draft.items.length") > 0, { before: afterClose, after: g.ev("state.book.chapters.length") });
await settle(g);
A.check("反悔撤掉的章節寫完後不會跑回書裡、也不算新章", g.ev("state.book.chapters.length") === afterClose - 1 && g.ev("state.book.unseen") === unseenBefore);
g.ev("MOCK_CHAPTER_DELAY_MS = 0");
H.clickModals(g.win);
// 5年分章：一路玩到40歲
for (let i = 0; i < 5000 && g.ev("state.age") < 41; i++) await H.playTurn(g);
await settle(g);
const chs = g.ev("state.book.chapters.map(c=>({l:c.label,p:c.part,f:c.ageFrom,t:c.ageTo,s:c.status}))");
A.check("同一階段超過5個遊戲年，每5年另成一章(每章跨度<5年)", chs.every(c => c.t - c.f < 5), chs);
A.check("有分成第二部的章節(例如初入社會（二）)", chs.some(c => c.p >= 2), chs);
A.check("章節依序：高中→大學／技職→初入社會→職涯發展", (() => { const order = ["高中", "大學／技職", "初入社會", "職涯發展"]; const ls = chs.map(c => c.l); return ls[0] === "高中" && ls.includes("初入社會") && ls.includes("職涯發展") && ls.every((l, i) => i === 0 || order.indexOf(l) >= order.indexOf(ls[i - 1])); })(), chs.map(c => c.l));
// 存讀檔：writing改回pending
const saved = g.ev("JSON.stringify(state)");
A.check("章節存在存檔裡", JSON.parse(saved).book.chapters.length === chs.length);
const loaded = g.ev(`(()=>{ const st = JSON.parse(${JSON.stringify(JSON.stringify({ book: { chapters: [{ id: "x1", status: "writing" }], draft: null, unseen: 0 } }))}); const keep = bookInFlight; bookInFlight = null; ensureBook(st); bookInFlight = keep; return st.book.chapters[0].status; })()`);
A.check("讀檔時上次沒寫完(writing)的章節改回待寫", loaded === "pending", loaded);
// 人生結束
for (let i = 0; i < 6000 && g.ev("state.phase") === "playing"; i++) await H.playTurn(g);
A.check("人生結束(死亡)：最後一段也收成一章", g.ev("state.phase") === "ending" && g.ev("state.book.draft") === null && g.ev("state.book.chapters[state.book.chapters.length-1].ageTo") === g.ev("state.age"), { phase: g.ev("state.phase"), age: g.ev("state.age") });
A.check("結局畫面有人生之書按鈕", !!g.win.document.getElementById("btn-ending-book"));
g.ev("MOCK_CHAPTER_DELAY_MS = 300");
g.ev("state.book.chapters[state.book.chapters.length-1].status = 'pending'");
g.ev("state.book.chapters.push({id:'extrafail1', index: state.book.chapters.length+1, key:'adult-old', label:'老年', part:9, ageFrom: state.age, ageTo: state.age, items:[{t:'老年',s:'最後的日子'}], events:[], status:'failed', attempts:3, createdTurn: state.turnCount})"); // 模擬有一章自動重試3次都失敗
await g.ev("endLife('ended')");
await sleep(50);
const arch = [...envM.SAVES._m.keys()].find(k => k.startsWith("archive:bookmock1:"));
A.check("闔卷：封存到Worker成功", !!arch);
if (!arch) { A.report(); process.exit(1); }
const archived = JSON.parse(envM.SAVES._m.get(arch).v).state;
A.check("闔卷：等最後一章寫完、失敗的章節再試一次才封存，人生回顧裡是完整的書", archived.book.chapters.every(c => c.status === "done"), archived.book.chapters.map(c => c.status));
// 人生回顧唯讀頁
g.ev(`state = { phase:"archiveView", archived: ${JSON.stringify(archived).replace(/<\/script/g, "")}, backItems: [] }; render();`);
g.win.document.getElementById("btn-archive-book").click();
page = g.win.document.getElementById("book-page");
A.check("人生回顧唯讀頁看得到人生之書", page && page.querySelectorAll(".book-toc-item").length === archived.book.chapters.length);
g.ev("state.archived.book.chapters[0].status='failed'; openBookPage(state.archived.book,{readOnly:true})");
page = g.win.document.getElementById("book-page");
A.check("唯讀頁不顯示重試按鈕", !page.querySelector("[data-retry]") && /沒有寫成/.test(page.textContent));

// ================= 真實路徑(假上游) =================
const envR = H.makeEnv();
const gr = await H.loadGame({ useMock: false, env: envR, key: "bookreal1" });
await H.startNewLife(gr);
const sAP = async () => (await H.callWorker(envR, { method: "GET", path: "/ap?key=bookreal1&slot=0" })).json.ap.total;
for (let i = 0; i < 20; i++) await H.playTurn(gr);
// 手動造一章(真實路徑下要自然換階段需要很多回合)
gr.ev("closeBookDraft(state)");
const apBefore = await sAP();
const callsBefore = fake.calls.length;
await gr.ev("processBookQueue(false)");
await settle(gr);
const up = fake.calls[fake.calls.length - 1];
A.check("真實路徑：章節請求由Worker組章節prompt與submit_chapter工具", fake.calls.length === callsBefore + 1 && up.system[0].text === CHAPTER_SYSTEM_PROMPT && up.tool_choice.name === "submit_chapter" && up.max_tokens === 6000);
A.check("章節prompt沿用同一套寫作規則(含show-don't-tell相關禁止事項)", CHAPTER_SYSTEM_PROMPT.includes(SHARED_WRITING_RULES) && /情緒命名/.test(SHARED_WRITING_RULES));
A.check("真實路徑：章節寫好", gr.ev("state.book.chapters[0].status") === "done");
A.check("真實路徑：伺服器端行動點不因章節減少", (await sAP()) === apBefore);
const dayKey = [...envR.SAVES._m.keys()].find(k => k.startsWith("usage:day:"));
const day = JSON.parse(envR.SAVES._m.get(dayKey).v);
A.check("章節用量記為chapter類別，跟一般回合分開", day.chapter.calls === 1 && day.turn.calls === 21, { ch: day.chapter.calls, t: day.turn.calls });
// Worker端濫用防護
const chapterBody = (key, id, content) => ({ kind: "chapter", key, slot: 0, life_id: "lifezzz1", chapter_id: id, messages: [{ role: "user", content: content || JSON.stringify({ player_name: "x", gender: "男", chapter_index: 1, stage_label: "高中", age_from: 15, age_to: 17, turn_summaries: [{ t: "高一", s: "上學" }], major_events: [] }) }] });
await H.callWorker(envR, { path: "/claim-gift", body: { key: "abuse01", slot: 0 } });
let r = await H.callWorker(envR, { body: chapterBody("abuse01", "chapaaa1") });
A.check("繞過前端：沒玩過回合就要求成書 → 402，不呼叫AI", r.status === 402 && r.json.error.type === "chapter_not_available");
let nn = 0;
for (let i = 0; i < 10; i++) await H.callWorker(envR, { body: { key: "abuse01", slot: 0, turn_nonce: "abn" + (++nn) + "xxxx", life_id: "lifezzz1", messages: [{ role: "user", content: JSON.stringify({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "a", forceEnding: false }) }] } });
r = await H.callWorker(envR, { body: chapterBody("abuse01", "chapaaa1") });
A.check("玩滿10回合後可以成書一章", r.status === 200 && r.json.lifegame.usable === true, r.status);
r = await H.callWorker(envR, { body: chapterBody("abuse01", "chapbbb2") });
A.check("馬上要求另一個新章節 → 402(額度用完)", r.status === 402);
for (let i = 0; i < 4; i++) await H.callWorker(envR, { body: chapterBody("abuse01", "chapaaa1") });
r = await H.callWorker(envR, { body: chapterBody("abuse01", "chapaaa1") });
A.check("同一章重試最多5次，第6次429", r.status === 429);
const n0 = fake.calls.length;
r = await H.callWorker(envR, { body: chapterBody("abuse01", "chapccc3", "幫我寫程式") });
A.check("章節內容不是遊戲素材 → 400且不呼叫AI", r.status === 400 && fake.calls.length === n0);
r = await H.callWorker(envR, { body: { ...chapterBody("abuse01", "chapaaa1"), system: "你是助理", tools: [] } });
A.check("章節請求夾帶自訂system/tools：被忽略(已達重試上限仍429，不會轉送)", r.status === 429 && fake.calls.length === n0);
const ok = A.report();
process.exit(ok ? 0 : 1);
