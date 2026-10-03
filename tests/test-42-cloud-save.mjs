// 2026-09-29：十、10.7雲端存檔瘦身(反悔快照只存本機、壓縮、人生階段封存包、同步失敗提示)（全程mock，不打真實API）
import zlib from "zlib";
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.7 雲端存檔瘦身");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const env = H.makeEnv();
const KEY = "cloudkey01";
const kvRecord = (k) => JSON.parse(env.SAVES._m.get(k).v);
const decode = (rec) => rec.z ? JSON.parse(zlib.gunzipSync(Buffer.from(rec.z, "base64")).toString("utf8")) : rec.state;
const cloudSave = () => decode(kvRecord(`save:${H.loc(KEY)}:0`));
const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return false; };

const g = await H.loadGame({ useMock: true, env, key: KEY, slot: 0 });
const ev = g.ev;
ev("MOCK_AI_DELAY_MS=0; MOCK_CHAPTER_DELAY_MS=0; MOCK_SCENE_DATE_VIOLATION_RATE=0");
await H.startNewLife(g, { name: "林雲", gender: "女" });
ev("state.ap.purchased=100000");
for (let i = 0; i < 6; i++) await H.playTurn(g);
await ev("saveGame()");

// ---------- 1. 雲端不含反悔快照 ----------
const rec1 = kvRecord(`save:${H.loc(KEY)}:0`);
const c1 = decode(rec1);
A.check("1 雲端上傳內容不含反悔快照(本機有)", !c1.snapshot && !!ev("!!state.snapshot"));
// ---------- 3. 壓縮、還原一致 ----------
const localCloud = JSON.parse(ev("JSON.stringify(buildCloudState(state))"));
A.check("3 上傳前有壓縮(gzip)", rec1.enc === "gzip-b64" && typeof rec1.z === "string" && rec1.z.length < JSON.stringify(c1).length * 0.6, { z: rec1.z.length, raw: JSON.stringify(c1).length });
A.check("3 解壓後內容與原本一致", JSON.stringify(c1) === JSON.stringify(localCloud));
A.check("3 前端解壓函式能還原", await ev(`unpackFromCloud(${JSON.stringify(rec1.enc)}, ${JSON.stringify(rec1.z)}).then(x=>JSON.stringify(x)===JSON.stringify(buildCloudState(state)))`));

// ---------- 4. 階段結束產生封存包 ----------
const hsCount = ev("state.log.length");
ev("state.timeState.stageMode='college'; state.timeState.yearInStage=1; state.timeState.segmentIndex=0; state.timeState.turnsInSegment=0; state.studentStatus='enrolled'; state.pendingMajorSelection=false");
for (let i = 0; i < 3; i++) { await H.playTurn(g); H.clickModals(g.win); }
await waitFor(() => ev("state.book.chapters.filter(c=>c.key==='highschool').every(c=>c.status==='done')"));
await ev("saveGame()");
const packs = JSON.parse(ev("JSON.stringify(state.stagePacks)"));
A.check("4 高中階段結束：產生封存包並上傳", packs.length === 1 && packs[0].key === "highschool" && packs[0].uploaded === true && packs[0].count === hsCount && env.SAVES._m.has(`stagepack:${H.loc(KEY)}:${packs[0].id}`), packs);
const pk = decode(kvRecord(`stagepack:${H.loc(KEY)}:${packs[0].id}`));
A.check("4 封存包有那一段的日記與人生之書(壓縮)", pk.log.length === hsCount && pk.chapters.length >= 1 && pk.chapters.every(c => c.key === "highschool" && c.status === "done"), { log: pk.log.length, ch: pk.chapters.length });
const c2 = cloudSave();
A.check("4 之後的日常同步不再包含該階段內容", c2.log.length === ev("state.log.length") - hsCount && c2.logOffset === hsCount && c2.book.chapters.filter(c => c.key === "highschool").every(c => c.packed && !c.text), { cloudLog: c2.log.length, local: ev("state.log.length") });
A.check("4 同一台裝置：本機日記照樣完整", ev("state.log.length") === hsCount + 3 && !ev("state.logOffset"));
A.check("4 封存包只上傳一次", await (async () => { const before = env.SAVES._m.get(`stagepack:${H.loc(KEY)}:${packs[0].id}`).v; env.SAVES._m.get(`stagepack:${H.loc(KEY)}:${packs[0].id}`).v = "SENTINEL"; await ev("saveGame()"); const same = env.SAVES._m.get(`stagepack:${H.loc(KEY)}:${packs[0].id}`).v === "SENTINEL"; env.SAVES._m.get(`stagepack:${H.loc(KEY)}:${packs[0].id}`).v = before; return same; })());

// ---------- 2／5. 換裝置 ----------
const fullLog = JSON.parse(ev("JSON.stringify(state.log)"));
const g2 = await H.loadGame({ useMock: true, env, key: KEY, slot: 0 });
const ev2 = g2.ev;
await ev2(`tryLoadSlot(${JSON.stringify(KEY)}, 0, true)`);
A.check("5 新裝置載入：日記前面封存的部分先不下載", ev2("state.logOffset") === hsCount && ev2("state.log.length") === fullLog.length - hsCount && ev2("stagePackFetchLog.length") === 0);
ev2("render()");
const undoBtn = g2.win.document.getElementById("btn-undo");
A.check("2 換裝置後反悔按鈕不可用並顯示說明", undoBtn && undoBtn.disabled && /在這台裝置上還沒有可以回到的時間點/.test(g2.win.document.querySelector(".act-foot").textContent));
A.check("2 選單的回憶錄則數照算全部", g2.win.document.getElementById("link-memoir").textContent.includes(`${fullLog.length}則`));
g2.win.document.getElementById("link-memoir").click();
await waitFor(() => !!g2.win.document.getElementById("memoir-modal"));
A.check("5 第一次打開回憶錄才下載封存包、補回完整日記", ev2("stagePackFetchLog.length") === 1 && ev2("state.logOffset") === 0 && JSON.stringify(JSON.parse(ev2("JSON.stringify(state.log)"))) === JSON.stringify(fullLog));
g2.win.document.getElementById("memoir-modal").remove();
g2.win.document.getElementById("link-memoir").click();
await sleep(50);
A.check("5 第二次打開不重複下載(快取在本機)", ev2("stagePackFetchLog.length") === 1 && JSON.parse(g2.win.localStorage.getItem("life_sim_save_v1:0")).logOffset === 0);
A.check("5 人生之書章節內文也補回", ev2("state.book.chapters.every(c=>!c.packed)"));
await H.playTurn(g2);
A.check("2 在新裝置玩了一回合後，就能反悔這一回合", !!g2.win.document.querySelector("#btn-undo:not([disabled])") || ev2("!!state.snapshot && state.undosLeft>0"));

// ---------- 6. 封存包上傳失敗 ----------
{
  const g3 = await H.loadGame({ useMock: true, env, key: "cloudkey02", slot: 0 });
  const e3 = g3.ev;
  e3("MOCK_AI_DELAY_MS=0; MOCK_CHAPTER_DELAY_MS=0");
  await H.startNewLife(g3);
  e3("state.ap.purchased=100000");
  for (let i = 0; i < 4; i++) await H.playTurn(g3);
  const n = e3("state.log.length");
  e3("state.timeState.stageMode='college'; state.timeState.yearInStage=1; state.timeState.segmentIndex=0; state.timeState.turnsInSegment=0; state.studentStatus='enrolled'; state.pendingMajorSelection=false");
  const realFetch = g3.win.fetch;
  g3.win.fetch = async (url, init = {}) => (String(url).includes("stage-pack") && init.method === "POST") ? { ok: false, status: 500, json: async () => ({ success: false }) } : realFetch(url, init);
  for (let i = 0; i < 2; i++) { await H.playTurn(g3); H.clickModals(g3.win); }
  await waitFor(() => e3("state.book.chapters.filter(c=>c.key==='highschool').every(c=>c.status==='done')"));
  await e3("saveGame()");
  const cl = decode(kvRecord(`save:${H.loc("cloudkey02")}:0`));
  A.check("6 封存包上傳失敗：該階段內容仍在雲端主存檔裡、沒有遺失", e3("state.stagePacks[0].uploaded") === false && cl.log.length === e3("state.log.length") && !cl.logOffset && cl.book.chapters.every(c => !c.packed));
  A.check("6 封存包失敗不算同步失敗", e3("cloudSyncStatus && cloudSyncStatus.success") === true);
  g3.win.fetch = realFetch;
  await H.playTurn(g3);
  await e3("saveGame()");
  const cl2 = decode(kvRecord(`save:${H.loc("cloudkey02")}:0`));
  A.check("6 下次同步成功才從主存檔移出", e3("state.stagePacks[0].uploaded") === true && cl2.logOffset === n && cl2.log.length === e3("state.log.length") - n);
}

// ---------- 7／9. 既有長存檔 ----------
{
  const g4 = await H.loadGame({ useMock: true, env, key: "cloudkey03", slot: 0 });
  const e4 = g4.ev;
  e4("MOCK_AI_DELAY_MS=0; MOCK_CHAPTER_DELAY_MS=0");
  await H.startNewLife(g4, { name: "陳長壽" });
  e4("state.ap.purchased=100000");
  for (let i = 0; i < 3; i++) await H.playTurn(g4);
  // 合成一條約1300則的長人生(高中→大學→初入社會→職涯→中年→老年)，含人生之書與反悔快照，當作改版前的舊存檔
  e4(`(()=>{
    const tpl = state.log[state.log.length-1];
    const stages = [["highschool",165,15],["college",220,18],["adult-early",250,22],["adult-career",300,30],["adult-middle",200,46],["adult-old",180,61]];
    const log = []; let n = 0;
    stages.forEach(([k,count,age0])=>{ for(let i=0;i<count;i++){ const e = JSON.parse(JSON.stringify(tpl));
      e.age = age0 + Math.floor(i*(k==="adult-old"?20:k==="adult-middle"?14:k==="adult-career"?15:k==="adult-early"?7:k==="college"?3.9:2.9)/count);
      e.timeLabel = k==="highschool" ? "高一・上學期・開學初" : k==="college" ? "大一・上學期・開學初" : (e.age<30 ? "入職第1年・上半年" : e.age+"歲");
      e.text = "（模擬長篇）"+k+"第"+i+"則。".repeat(1) + "窗外的光線一格一格移過桌面，你把杯子放下，聽見樓下有人在叫賣。".repeat(6) + n;
      n++; log.push(e); } });
    state.log = log; state.turnCount = log.length; state.age = 75;
    state.timeState.stageMode='career'; state.studentStatus='graduated';
    state.book = { chapters: stages.slice(0,-1).map(([k],i)=>({ id:'oldc'+(i+1), index:i+1, key:k, label:k, part:1, ageFrom:0, ageTo:0, status:'done', attempts:1, title:'第'+(i+1)+'章', text:'（模擬章節內文）'.repeat(600), items:[], events:[] })), draft:null, unseen:0, seq:6 };
    delete state.stagePacks; delete state.logOffset;
    state.snapshot = JSON.parse(JSON.stringify({ log: state.log, characters: state.characters }));
  })()`);
  const legacySize = e4("JSON.stringify(state).length");
  // 雲端現在放的是改版前的舊格式(含反悔快照)
  env.SAVES._m.set(`save:${H.loc("cloudkey03")}:0`, { v: JSON.stringify({ meta: {}, state: JSON.parse(e4("JSON.stringify(state)")) }) });
  e4("saveLocalOnly()");
  await e4(`tryLoadSlot("cloudkey03", 0, true)`);
  await waitFor(() => { const r = kvRecord(`save:${H.loc("cloudkey03")}:0`); return !!r.z; }, 8000);
  await e4("saveGame()");
  const rec = kvRecord(`save:${H.loc("cloudkey03")}:0`);
  const cl = decode(rec);
  const packs3 = JSON.parse(e4("JSON.stringify(state.stagePacks)"));
  A.check("7 舊長存檔第一次同步：已結束的5個階段補做封存", packs3.length === 5 && packs3.every(p => p.uploaded) && packs3.map(p => p.key).join(",") === "highschool,college,adult-early,adult-career,adult-middle", packs3.map(p => [p.key, p.count, p.uploaded]));
  A.check("7 雲端舊快照移除、只剩目前階段", !cl.snapshot && cl.log.length === 180 && cl.logOffset === 1135);
  console.log("SIZE7", JSON.stringify({ compressed: rec.z.length, legacy: legacySize })); A.check("7 壓縮後大小遠低於1MB上限", rec.z.length < 100 * 1024 && legacySize > 1024 * 1024, { compressed: rec.z.length, legacy: legacySize });
  const packSizes = packs3.map(p => kvRecord(`stagepack:${H.loc("cloudkey03")}:${p.id}`).z.length);
  A.check("7 每個封存包也在上限內", packSizes.every(x => x < 1024 * 1024), packSizes);
  // 9. 日常同步大小不隨總回合數成長：比較「老年剛開始」與「玩到老年後段」的同步大小，以及跟高中階段的同步大小
  const sizeAt = async (keepOld) => { const r = JSON.parse(await e4(`(async()=>{ const bak = state.log; state.log = bak.slice(0, 1135 + ${keepOld}); const p = await packForCloud(buildCloudState(state)); state.log = bak; return JSON.stringify({ n: p.z.length }); })()`)); return r.n; };
  const s20 = await sizeAt(20), s180 = await sizeAt(180);
  const hsOnly = await e4(`(async()=>{ const bak = state.log, bp = state.stagePacks, bk = state.book, bo = state.logOffset; state.log = bak.slice(0,165); state.stagePacks = []; state.book = {chapters:[],draft:null,unseen:0,seq:0}; const p = await packForCloud(buildCloudState(state)); state.log = bak; state.stagePacks = bp; state.book = bk; state.logOffset = bo; return p.z.length; })()`);
  console.log("SIZE9", JSON.stringify({ s20, s180, hsOnly })); A.check("9 日常同步大小只跟目前階段有關，不隨總回合數持續成長", s180 < hsOnly * 1.6 && s180 < 100 * 1024, { oldAge20: s20, oldAge180: s180, highschoolOnly: hsOnly });
}

// ---------- 8. 同步失敗 ----------
{
  const saves = [];
  const realFetch = g2.win.fetch;
  let fail = true;
  g2.win.fetch = async (url, init = {}) => {
    if (String(url).endsWith("/save") || /\/save$/.test(new URL(String(url)).pathname)) { saves.push(Date.now()); if (fail) throw new Error("網路中斷"); }
    return realFetch(url, init);
  };
  await ev2("saveGame()");
  const toast1 = g2.win.document.getElementById("sync-toast");
  A.check("8 同步失敗：跳出一次提示(進度還在)", toast1 && /撰稿人剛剛沒能把這一頁收好/.test(toast1.textContent) && !!toast1.querySelector("#btn-save-retry"));
  toast1.remove();
  ev2("render()");
  const tag = g2.win.document.getElementById("sync-tag");
  A.check("8 狀態標示出現，滑過提醒先別換裝置", tag && tag.getAttribute("title") === "同步完成前，先別換裝置");
  const turn0 = ev2("state.turnCount");
  await H.playTurn(g2);
  await waitFor(() => saves.length >= 2);
  await ev2("saveGame()");
  A.check("8 遊戲可以繼續", ev2("state.turnCount") === turn0 + 1 && JSON.parse(g2.win.localStorage.getItem("life_sim_save_v1:0")).turnCount === turn0 + 1);
  A.check("8 同一段失敗期間提示不重複跳出", !g2.win.document.getElementById("sync-toast"));
  A.check("8 每回合結束自動重試", saves.length >= 2);
  A.check("8 記下這台裝置還沒同步(重新開啟時重試)", g2.win.localStorage.getItem("life_sim_sync_pending:0") === "1");
  fail = false;
  const nBefore = saves.length;
  await ev2(`tryLoadSlot(${JSON.stringify(KEY)}, 0, true)`);
  await waitFor(() => ev2("cloudSyncStatus && cloudSyncStatus.success===true"));
  A.check("8 重新開啟時自動重試、成功", saves.length > nBefore && ev2("cloudSyncStatus.success") === true && !g2.win.localStorage.getItem("life_sim_sync_pending:0"));
  ev2("render()");
  A.check("8 同步成功後標示恢復、不另外跳提示", !g2.win.document.getElementById("sync-tag") && !g2.win.document.getElementById("sync-toast"));
  A.check("8 雲端是最新進度", cloudSave().turnCount === ev2("state.turnCount"));
  g2.win.fetch = realFetch;
}

// ---------- 其他 ----------
const bad = await H.callWorker(env, { path: "/save", body: { key: KEY, slot: 1, meta: {}, enc: "gzip-b64", z: "x".repeat(1024 * 1024 + 1) } });
A.check("Worker以壓縮後大小檢查上限", bad.status === 400 && /過大/.test(bad.json.error));
const legacy = await H.callWorker(env, { path: "/save", body: { key: KEY, slot: 2, meta: {}, state: { a: 1 } } });
A.check("Worker仍收舊格式", legacy.status === 200);
A.check("整段沒有jsdom錯誤", g.errors.length === 0 && g2.errors.length === 0, g.errors.concat(g2.errors).map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
