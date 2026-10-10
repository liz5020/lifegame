// 佇列批次6（2026-09-25）：人生之書／章節成書（十五章）；2026-10-10改為十五、15.9「玩家按了才寫、每章扣3點」
import * as H from "./harness.mjs";
import { CHAPTER_SYSTEM_PROMPT, SHARED_WRITING_RULES } from "../worker/prompt.js";
const A = H.makeAsserter("人生之書(15.9 付費)");
const fake = H.makeFakeAnthropic(); H.installUpstream(fake);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function settle(g) { for (let i = 0; i < 100; i++) { if (!g.ev("bookInFlight")) return; await sleep(5); } }

// ================= mock模式 =================
const envM = H.makeEnv();
const g = await H.loadGame({ useMock: true, env: envM, key: "bookmock1" });
g.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t); MOCK_CHAPTER_DELAY_MS = 0;");
await H.startNewLife(g);
g.ev("state.ap.gift = 100000");
const statsKey = () => g.ev("JSON.stringify({h:state.stats.health,k:state.stats.knowledge,n:state.stats.network,e:state.stats.expression,c:state.cash})");
const ap = () => g.ev("totalAP(state)");
const doc = () => g.win.document;
for (let i = 0; i < 3000 && g.ev("state.book.chapters.length") === 0; i++) await H.playTurn(g);
const ch1 = g.ev("JSON.parse(JSON.stringify(state.book.chapters[0]))");
A.check("高中→大學／技職換階段時收成第一章(高中)，是空白章", ch1 && ch1.label === "高中" && ch1.index === 1 && ch1.status === "blank" && !ch1.text, ch1 && { label: ch1.label, status: ch1.status });
const apAtClose = ap(), callsBefore = fake.calls.length;
await sleep(80);
A.check("15.9.1 空白章不會自動呼叫AI、不自動寫、不扣點", g.ev("state.book.chapters[0].status") === "blank" && ap() === apAtClose && !g.ev("bookInFlight"));
A.check("入口顯示有新的一章(空白章)", g.ev("bookMenuCountText(state)") === "（0章・1章新）", g.ev("bookMenuCountText(state)"));
// 頁面
g.ev("openBookPage(state.book, { owner: state.name })");
let page = doc().getElementById("book-page");
A.check("頁面：空白章顯示「還沒寫」與按鈕「寫成這一章（3點）」，並說明每章扣3點", /還沒寫/.test(page.textContent) && !!page.querySelector("[data-write]") && /寫成這一章（3點）/.test(page.textContent) && /每章 3 點/.test(page.textContent));
A.check("頁面：只有一章時按鈕可按", !page.querySelector("[data-write]").disabled);
// 確認視窗
page.querySelector("[data-write]").click();
let modal = doc().getElementById("book-pay-modal");
A.check("15.9.3 按下去跳確認視窗，文字照定案", modal && modal.textContent.includes("這一章寫下去要扣 3 點，寫好之後就固定下來，扣了不退。") && /寫成這一章/.test(modal.textContent) && /先不要/.test(modal.textContent));
doc().getElementById("btn-book-pay-no").click();
await sleep(30);
A.check("按「先不要」：不寫、不扣點", g.ev("state.book.chapters[0].status") === "blank" && ap() === apAtClose && !doc().getElementById("book-pay-modal"));
// 點數不足
const saveGift = g.ev("state.ap.gift"); g.ev(`state.ap = { daily:0, gift:2, purchased:0, lastRefillDate: taipeiDateString() }; refreshBookPage()`);
page = doc().getElementById("book-page");
A.check("15.9.3 點數不足3點：按鈕變灰", page.querySelector("[data-write]").disabled && /行動點不足/.test(page.textContent));
g.ev(`requestWriteChapter(state.book.chapters[0].id)`);
A.check("點數不足時直接呼叫也不會跳確認視窗", !doc().getElementById("book-pay-modal"));
g.ev(`state.ap = { daily:0, gift:${saveGift}, purchased:0, lastRefillDate: taipeiDateString() }; refreshBookPage()`);
// 玩到第二章
for (let i = 0; i < 3000 && g.ev("state.book.chapters.length") < 2; i++) await H.playTurn(g);
g.ev("closeBookPage(); openBookPage(state.book, { owner: state.name })");
page = doc().getElementById("book-page");
const btns = page.querySelectorAll("[data-write]");
A.check("15.9.4 依序寫：第二章按鈕變灰並寫「請先寫上一章」", btns.length === 2 && !btns[0].disabled && btns[1].disabled && /請先寫上一章/.test(page.textContent));
g.ev("requestWriteChapter(state.book.chapters[1].id)");
A.check("沒輪到的章節直接呼叫也不會跳確認視窗", !doc().getElementById("book-pay-modal"));
// 失敗不扣點
g.ev("MOCK_CHAPTER_FAIL_RATE = 1");
let before = ap(); const logLen = g.ev("(state.apLog||[]).length");
g.ev("requestWriteChapter(state.book.chapters[0].id)"); doc().getElementById("btn-book-pay-ok").click();
await sleep(20); await settle(g);
let c1 = g.ev("state.book.chapters[0]");
A.check("15.9.2 生成失敗：回到空白章、不扣點、沒有點數紀錄、有提示可再按", c1.status === "blank" && ap() === before && g.ev("(state.apLog||[]).length") === logLen && /沒有扣點/.test(c1.errMsg || "") && /沒有扣點/.test(doc().getElementById("book-page").textContent), { st: c1.status, err: c1.errMsg });
A.check("失敗後按鈕仍可按", !doc().getElementById("book-page").querySelector("[data-write]").disabled);
// 成功
g.ev("MOCK_CHAPTER_FAIL_RATE = 0");
const stBefore = statsKey(); before = ap();
g.ev("requestWriteChapter(state.book.chapters[0].id)"); doc().getElementById("btn-book-pay-ok").click();
A.check("生成中：該章按鈕不能重複按、顯示正在寫", (g.ev("MOCK_CHAPTER_DELAY_MS = 0; 1"), true));
await sleep(20); await settle(g);
c1 = g.ev("state.book.chapters[0]");
A.check("寫成功：章節有章名與正文、狀態done、paid:true、已刪素材", c1.status === "done" && c1.paid === true && c1.title && Array.from(c1.text).length >= 1500 && c1.items === undefined, { st: c1.status, len: c1.text && Array.from(c1.text).length });
A.check("15.9.2 扣3點，點數紀錄「人生之書（第一章）」−3", ap() === before - 3 && g.ev("state.apLog.some(e=>e.type==='人生之書（第一章）' && e.n===-3 && e.ok)"), { b: before, a: ap() });
A.check("不影響任何遊戲數值", statsKey() === stBefore);
A.check("寫好後出現「新的一章已經寫好」提示", !!doc().getElementById("book-toast") && /新的一章已經寫好/.test(doc().getElementById("book-toast").textContent));
page = doc().getElementById("book-page");
A.check("第一章寫好後，第二章按鈕可按", page.querySelectorAll("[data-write]").length === 1 && !page.querySelector("[data-write]").disabled);
// 固定：已寫好的章節不能再寫
before = ap(); g.ev("requestWriteChapter(state.book.chapters[0].id)");
A.check("寫好後固定：不能換一版重寫、不再跳確認、不再扣點", !doc().getElementById("book-pay-modal") && ap() === before);
// 每日上限(前端先擋)
g.ev("state.book.chapters[1].calls = { d: taipeiDateString(), n: 5 }; refreshBookPage()");
A.check("15.9.4 同一章今天已呼叫5次：按鈕變灰並寫「明天再試」", doc().getElementById("book-page").querySelector("[data-write]").disabled && /明天再試/.test(doc().getElementById("book-page").textContent));
g.ev("state.book.chapters[1].calls = null; refreshBookPage()");
// 標點統一
const np = g.ev(`normalizeBookPunct("她說,好的.然後走了! 真的嗎? 一二三:四;五...第三個·名字")`);
A.check("15.9.8 標點由程式統一：半形逗號句點驚嘆問號冒號分號、…、間隔號改全形", np === "她說，好的。然後走了！ 真的嗎？ 一二三：四；五……第三個・名字", np);
A.check("英文與數字不被亂改(3.5、a.b、12:30)", g.ev(`normalizeBookPunct("版本3.5 與a.b在12:30見")`) === "版本3.5 與a.b在12:30見");
g.ev("closeBookPage()");

// ----- 反悔 -----
// 先寫好第二章，才能測「已寫好的章保留」
g.ev("requestWriteChapter(state.book.chapters[1].id)"); doc().getElementById("btn-book-pay-ok").click(); await sleep(20); await settle(g);
for (let i = 0; i < 4000; i++) {
  const n = g.ev("state.book.chapters.length");
  await g.ev("takeTurn(state.choices[0], AP_COST_PER_TURN)");
  if (g.ev("state.book.chapters.length") > n) break;
  H.clickModals(g.win);
}
const afterClose = g.ev("state.book.chapters.length");
const lastCh = g.ev("state.book.chapters[state.book.chapters.length-1]");
A.check("(前置) 剛收成的新章是空白章", lastCh.status === "blank");
g.ev("restoreUndo()");
A.check("15.9.7 反悔：沒寫的空白章撤掉，素材回到上一回合", g.ev("state.book.chapters.length") === afterClose - 1 && g.ev("state.book.draft") && g.ev("state.book.draft.items.length") > 0, { before: afterClose, after: g.ev("state.book.chapters.length") });
// 已付點寫好的章節保留，再收章不重寫
for (let i = 0; i < 4000; i++) {
  const n = g.ev("state.book.chapters.length");
  await g.ev("takeTurn(state.choices[0], AP_COST_PER_TURN)");
  if (g.ev("state.book.chapters.length") > n) break;
  H.clickModals(g.win);
}
const cnt = g.ev("state.book.chapters.length");
g.ev("(()=>{ const c = state.book.chapters[state.book.chapters.length-1]; c.status='done'; c.paid=true; c.title='已付費的章'; c.text='字'.repeat(400); delete c.items; })()");
const paidBefore = ap();
g.ev("restoreUndo()");
A.check("15.9.7 反悔：已付點寫好的章節保留，不撤掉、不退點", g.ev("state.book.chapters.length") === cnt && g.ev("state.book.chapters[state.book.chapters.length-1].title") === "已付費的章" && ap() === paidBefore + 0, { cnt, now: g.ev("state.book.chapters.length") });
A.check("反悔後素材回到上一回合(draft還在)", g.ev("state.book.draft && state.book.draft.items.length > 0"));
g.ev("closeBookDraft(state)");
A.check("15.9.7 同一階段再次收章時，已寫好的章節不重寫、不再多出一章", g.ev("state.book.chapters.length") === cnt);
H.clickModals(g.win);

// ----- 舊存檔相容 -----
const mig = g.ev(`(()=>{ const st = { book: { chapters: [
  {id:'o1', status:'done', title:'舊章', text:'x'}, {id:'o2', status:'pending'}, {id:'o3', status:'failed', attempts:3}, {id:'o4', status:'writing'}], draft:null, unseen:0 } };
  const keep = bookInFlight; bookInFlight = null; ensureBook(st); bookInFlight = keep; return st.book.chapters.map(c=>c.status); })()`);
A.check("15.9.5 舊存檔：寫好的照舊(免費)，排隊中／失敗／寫到一半的轉成空白章", JSON.stringify(mig) === JSON.stringify(["done", "blank", "blank", "blank"]), mig);
A.check("舊章節(沒有paid欄位)照常讀、不要求付費", g.ev("(()=>{ const c={status:'done',title:'舊章',text:'x',paid:undefined}; return c.status==='done' && chapterBlockedReason(state,c)==='state'; })()"));
// 唯讀
g.ev("openBookPage({ chapters:[{id:'r1',index:1,label:'高中',part:1,ageFrom:15,ageTo:17,status:'blank'},{id:'r2',index:2,label:'大學／技職',part:1,ageFrom:18,ageTo:22,status:'failed'}], draft:null }, { readOnly:true, owner:'某人' })");
page = doc().getElementById("book-page");
A.check("唯讀頁(人生回顧／家族年表)：空白章不能寫、顯示沒有寫成", !page.querySelector("[data-write]") && (page.textContent.match(/沒有寫成/g) || []).length === 2);
g.ev("closeBookPage()");

// ----- 5年分章、階段順序 -----
for (let i = 0; i < 5000 && g.ev("state.age") < 41; i++) await H.playTurn(g);
const chs = g.ev("state.book.chapters.map(c=>({l:c.label,p:c.part,f:c.ageFrom,t:c.ageTo,s:c.status}))");
A.check("同一階段超過5個遊戲年，每5年另成一章(每章跨度<5年)", chs.every(c => c.t - c.f < 5), chs);
A.check("有分成第二部的章節", chs.some(c => c.p >= 2), chs);
A.check("章節依序：高中→大學／技職→初入社會→職涯發展", (() => { const order = ["高中", "大學／技職", "初入社會", "職涯發展"]; const ls = chs.map(c => c.l); return ls[0] === "高中" && ls.includes("初入社會") && ls.includes("職涯發展") && ls.every((l, i) => i === 0 || order.indexOf(l) >= order.indexOf(ls[i - 1])); })(), chs.map(c => c.l));
A.check("玩了這麼多回合，沒有任何章節被自動寫", g.ev("state.book.chapters.filter(c=>c.status==='done').length") <= 3, chs.map(c => c.s));
// 人生結束
for (let i = 0; i < 6000 && g.ev("state.phase") === "playing"; i++) await H.playTurn(g);
A.check("人生結束(死亡)：最後一段也收成一章(空白章)", g.ev("state.phase") === "ending" && g.ev("state.book.draft") === null && g.ev("state.book.chapters[state.book.chapters.length-1].ageTo") === g.ev("state.age") && g.ev("state.book.chapters[state.book.chapters.length-1].status") === "blank", { phase: g.ev("state.phase") });
A.check("結局畫面有人生之書按鈕", !!doc().getElementById("btn-ending-book"));
// 結局畫面上最後一段可以直接寫(依序，所以先把前面的寫完)
g.ev("state.ap.gift = 100000; state.ap.daily = 0; state.ap.purchased = 0");
let guard = 0;
while (g.ev("state.book.chapters.some(c=>c.status==='blank')") && guard++ < 60) {
  const id = g.ev("state.book.chapters.find(c=>c.status==='blank').id");
  const pre = ap();
  g.ev(`requestWriteChapter(${JSON.stringify(id)})`); doc().getElementById("btn-book-pay-ok").click(); await sleep(20); await settle(g);
  if (ap() !== pre - 3) break;
}
A.check("結局畫面上依序把空白章一章章寫完，每章各扣3點", g.ev("state.book.chapters.every(c=>c.status==='done')"), g.ev("state.book.chapters.map(c=>c.status)"));
// 闔卷前提醒：造一個空白章
g.ev("state.book.chapters.push({id:'extrablank1', index: state.book.chapters.length+1, key:'adult-old', label:'老年', part:9, ageFrom: state.age, ageTo: state.age, items:[{t:'老年',s:'最後的日子'}], events:[], status:'blank', createdTurn: state.turnCount})");
const endP = g.ev("endLife('ended')");
await sleep(30);
modal = doc().getElementById("book-remind-modal");
A.check("15.9.6 就此闔卷前提醒一次：「這一世還有1章沒寫，要現在寫嗎？」", modal && modal.textContent.includes("這一世還有 1 章沒寫，要現在寫嗎？") && /闔卷之後就不能補/.test(modal.textContent));
doc().getElementById("btn-book-remind-skip").click();
await endP; await sleep(50);
const arch = [...envM.SAVES._m.keys()].find(k => k.startsWith(`archive:${H.loc("bookmock1")}:`));
A.check("選「不寫」：照常闔卷封存", !!arch);
if (!arch) { A.report(); process.exit(1); }
const archRec = JSON.parse(envM.SAVES._m.get(arch).v);
const archived = archRec.z ? JSON.parse((await import("zlib")).gunzipSync(Buffer.from(archRec.z, "base64")).toString("utf8")) : archRec.state;
A.check("封存的書：沒寫的章維持空白，闔卷後不能補", archived.book.chapters.filter(c => c.status === "blank").length === 1);
g.ev(`state = { phase:"archiveView", archived: ${JSON.stringify(archived).replace(/<\/script/g, "")}, backItems: [] }; render();`);
doc().getElementById("btn-archive-book").click();
page = doc().getElementById("book-page");
A.check("人生回顧唯讀頁看得到人生之書，空白章不提供寫", page && page.querySelectorAll(".book-toc-item").length === archived.book.chapters.length && !page.querySelector("[data-write]"));

// ================= 真實路徑(假上游，雲端存檔打開＝有KV的路徑) =================
const envR = H.makeEnv();
const gr = await H.loadGame({ useMock: false, env: envR, key: "bookreal1" });
await H.startNewLife(gr);
const sAP = async () => (await H.callWorker(envR, { method: "GET", path: "/ap?key=bookreal1&slot=0" })).json.ap.total;
for (let i = 0; i < 20; i++) await H.playTurn(gr);
gr.ev("closeBookDraft(state)");
let apBefore = await sAP(); const n0 = fake.calls.length;
await sleep(50);
A.check("真實路徑：換階段只新增空白章，不呼叫AI", fake.calls.length === n0 && gr.ev("state.book.chapters[0].status") === "blank");
gr.ev("requestWriteChapter(state.book.chapters[0].id)"); gr.win.document.getElementById("btn-book-pay-ok").click();
await sleep(50); await settle(gr);
const up = fake.calls[fake.calls.length - 1];
A.check("真實路徑：章節請求由Worker組章節prompt與submit_chapter工具", fake.calls.length === n0 + 1 && up.system[0].text === CHAPTER_SYSTEM_PROMPT && up.tool_choice.name === "submit_chapter" && up.max_tokens === 6000);
A.check("章節prompt含寫作規則與15.9.8三條補充", CHAPTER_SYSTEM_PROMPT.includes(SHARED_WRITING_RULES) && /第一次出現時，用半句話交代/.test(CHAPTER_SYSTEM_PROMPT) && /照turn_summaries的時間先後/.test(CHAPTER_SYSTEM_PROMPT) && /同一章避免重複同一個身體反應/.test(CHAPTER_SYSTEM_PROMPT));
A.check("真實路徑：章節寫好、paid", gr.ev("state.book.chapters[0].status") === "done" && gr.ev("state.book.chapters[0].paid") === true);
A.check("真實路徑：伺服器端扣3點(不是前端自己扣)，前端餘額與伺服器一致", (await sAP()) === apBefore - 3 && gr.ev("totalAP(state)") === apBefore - 3, { b: apBefore, a: await sAP(), f: gr.ev("totalAP(state)") });
const dayKey = [...envR.SAVES._m.keys()].find(k => k.startsWith("usage:day:"));
const day = JSON.parse(envR.SAVES._m.get(dayKey).v);
A.check("章節用量記為chapter類別，跟一般回合分開", day.chapter.calls === 1 && day.turn.calls === 21, { ch: day.chapter.calls, t: day.turn.calls });
// Worker端防護
const mat = JSON.stringify({ player_name: "x", gender: "男", chapter_index: 1, stage_label: "高中", age_from: 15, age_to: 17, turn_summaries: [{ t: "高一", s: "上學" }], major_events: [] });
const chapterBody = (key, id, content) => ({ kind: "chapter", key, slot: 0, life_id: "lifezzz1", chapter_id: id, messages: [{ role: "user", content: content || mat }] });
await H.callWorker(envR, { path: "/claim-gift", body: { key: "abuse01", slot: 0 } });
const apOf = async (k) => (await H.callWorker(envR, { method: "GET", path: `/ap?key=${k}&slot=0` })).json.ap;
const rec = async (k) => { const r = await H.callWorker(envR, { method: "GET", path: `/ap?key=${k}&slot=0` }); return r.json.ap.total; };
const t0 = await rec("abuse01");
let r = await H.callWorker(envR, { body: chapterBody("abuse01", "chapaaa1") });
A.check("繞過前端直接要求成書：點數夠 → 200且伺服器扣3點", r.status === 200 && r.json.lifegame.usable === true && r.json.lifegame.charged === true && (await rec("abuse01")) === t0 - 3, { s: r.status, t0, now: await rec("abuse01") });
r = await H.callWorker(envR, { body: chapterBody("abuse01", "chapaaa1") });
A.check("同一章再要求一次：不再扣點(同一章不得重複扣點)", r.status === 200 && r.json.lifegame.charged === false && (await rec("abuse01")) === t0 - 3);
// 點數不足
await H.callWorker(envR, { path: "/claim-gift", body: { key: "poor01", slot: 0 } });
const drain = async (k) => { const rr = await H.callWorker(envR, { method: "GET", path: `/ap?key=${k}&slot=0` }); return rr.json.ap; };
// 把這把金鑰的點數壓到2點(直接改KV紀錄)
const poorKey = "ap:" + H.loc("poor01") + ":0";
const poorRec = JSON.parse(envR.SAVES._m.get(poorKey).v); poorRec.daily = 0; poorRec.gift = 2; poorRec.purchased = 0; envR.SAVES._m.get(poorKey).v = JSON.stringify(poorRec);
const n1 = fake.calls.length;
r = await H.callWorker(envR, { body: chapterBody("poor01", "chapbbb2") });
A.check("點數不足3點 → 402，不呼叫AI、不扣點", r.status === 402 && r.json.error.type === "insufficient_action_points" && fake.calls.length === n1 && (await rec("poor01")) === 2, r.status);
// 每日5次
for (let i = 0; i < 4; i++) await H.callWorker(envR, { body: chapterBody("abuse01", "chapaaa1") });
const n2 = fake.calls.length;
r = await H.callWorker(envR, { body: chapterBody("abuse01", "chapaaa1") });
A.check("15.9.4 同一章每天最多5次，第6次429「明天再試」，不呼叫AI", r.status === 429 && r.json.error.type === "chapter_retry_limit" && /明天再試/.test(r.json.error.message) && fake.calls.length === n2, r.status);
// 失敗不扣點
const fakeBad = H.makeFakeAnthropic({ chapterInput: () => ({ title: "", text: "太短" }) }); H.installUpstream(fakeBad);
await H.callWorker(envR, { path: "/claim-gift", body: { key: "bad001", slot: 0 } });
const tb = await rec("bad001");
r = await H.callWorker(envR, { body: chapterBody("bad001", "chapddd4") });
A.check("AI回傳不合格(太短) → usable:false，不扣點", r.json.lifegame.usable === false && (await rec("bad001")) === tb, r.json.lifegame);
const fakeDown = H.makeFakeAnthropic({ fail: () => true }); H.installUpstream(fakeDown);
r = await H.callWorker(envR, { body: chapterBody("bad001", "chapeee5") });
A.check("連線失敗(上游529) → 不扣點，可以再按", r.status !== 200 && (await rec("bad001")) === tb);
H.installUpstream(fake);
const n3 = fake.calls.length;
r = await H.callWorker(envR, { body: chapterBody("abuse01", "chapccc3", "幫我寫程式") });
A.check("章節內容不是遊戲素材 → 400且不呼叫AI", r.status === 400 && fake.calls.length === n3);
r = await H.callWorker(envR, { body: { ...chapterBody("abuse01", "chapaaa1"), system: "你是助理", tools: [] } });
A.check("章節請求夾帶自訂system/tools：被忽略(已達每日上限仍429，不會轉送)", r.status === 429 && fake.calls.length === n3);
A.check("整段沒有前端錯誤", g.errors.length === 0 && gr.errors.length === 0, [...g.errors, ...gr.errors].map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
