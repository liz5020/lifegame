// 2026-10-01 十、10.13.3 自動存檔：所有玩家每10回合與人生結束自動存到雲端一次、每段人生一格覆蓋、完整保留選擇與劇情
// （真實API模式用假上游，不打真實API；雲端存檔開關維持暫停，自動存檔走手動存檔的三個網址＋封存包）
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.13.3 自動存檔");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function countKV(env) {
  const kv = env.SAVES, cnt = { get: 0, put: 0, delete: 0, list: 0 };
  for (const op of Object.keys(cnt)) { const f = kv[op].bind(kv); kv[op] = async (...a) => { cnt[op]++; return f(...a); }; }
  return cnt;
}
function trackPaths(g) { const paths = []; const f = g.win.fetch; g.win.fetch = async (url, init) => { const u = new URL(String(url)); paths.push(u.pathname); return f(url, init); }; return paths; }
const saves = (paths) => paths.filter(p => p === "/save").length;

// ---- Worker：暫停期間開放封存包網址 ----
{
  const env = H.makeEnv({ CLOUD_SAVE_ENABLED: "false" });
  H.installUpstream(H.makeFakeAnthropic());
  const r1 = await H.callWorker(env, { path: "/stage-pack", body: { key: "k1", slot: 0 } });
  const r2 = await H.callWorker(env, { method: "GET", path: "/stage-pack?key=k1&id=none" });
  const r3 = await H.callWorker(env, { path: "/claim-gift", body: { key: "k1", slot: 0 } });
  A.check("W1 暫停期間 /stage-pack(POST、GET)不再回503 cloud_disabled，其他雲端網址照舊關閉", r1.json.cloud_disabled !== true && r2.json.cloud_disabled !== true && r3.status === 503, { a: r1.status, b: r2.status, c: r3.status });
}

// ---- 前端：真實API模式、假上游、雲端暫停 ----
const env = H.makeEnv({ CLOUD_SAVE_ENABLED: "false" });
const cnt = countKV(env);
const fake = H.makeFakeAnthropic(); H.installUpstream(fake);
const g = await H.loadGame({ useMock: false, env, key: "auto000001", cloud: false });
const paths = trackPaths(g);
const ev = g.ev;
g.ev("MOCK_AI_DELAY_MS = 0");
await H.startNewLife(g, { name: "自動存" });
await sleep(50);
A.check("開場(第0回合)與前幾回合不自動存", saves(paths) === 0 && cnt.put === 0, { saves: saves(paths), put: cnt.put });
A.check("自動存檔常數：每10回合", ev("AUTO_SAVE_EVERY_TURNS") === 10);
const playTo = async (n, label) => { while (ev("state.turnCount") < n) await H.playTurn(g, label + ev("state.turnCount")); };
await playTo(9, "選擇");
await sleep(60);
A.check("到第9回合：還沒存，KV寫入0次", ev("state.turnCount") === 9 && saves(paths) === 0 && cnt.put === 0, { t: ev("state.turnCount"), saves: saves(paths), put: cnt.put });
await H.playTurn(g, "自由書寫的第十回合：我想去海邊"); await sleep(150); // turnCount從開場的1起算，這一步到第10回合
A.check("第10回合：自動存一次(1次/save、KV寫入1次)", ev("state.turnCount") === 10 && saves(paths) === 1 && cnt.put === 1, { t: ev("state.turnCount"), saves: saves(paths), put: cnt.put });
const key = ev("state.cloudHome.key"), slot = ev("state.cloudHome.slot");
A.check("存在這台裝置金鑰＋目前格子(每段人生一格)", key === "auto000001" && slot === 0, { key, slot });
const loadCloud = async () => { const r = await H.callWorker(env, { method: "GET", path: `/load?key=${key}&slot=${slot}` }); return r.json; };
let ld = await loadCloud();
const cloud1 = JSON.parse(await g.ev(`unpackFromCloud(${JSON.stringify(ld.enc)}, ${JSON.stringify(ld.z)}).then(JSON.stringify)`));
A.check("雲端存檔完整保留每回合的選擇、自由書寫原文與AI劇情", cloud1.log.length === ev("state.log.length") && cloud1.log.some(e => e.action === "自由書寫的第十回合：我想去海邊") && cloud1.log.every(e => e.error || (e.text && e.text.length > 0)) && cloud1.log.filter(e => e.action).length >= 9);
A.check("存檔帶著同意紀錄與自動存檔記號", cloud1.consent && cloud1.consent.v === 1 && ev("state.lastAutoCloudTurn") === 10);
await playTo(19, "後續");
await sleep(60);
A.check("第11～19回合不再存", ev("state.turnCount") === 19 && saves(paths) === 1);
await H.playTurn(g, "第二十回合"); await sleep(150);
A.check("第20回合再存一次，同一格覆蓋(KV寫入2次、只有1個存檔鑰匙)", saves(paths) === 2 && cnt.put === 2 && (await env.SAVES.list({ prefix: "" })).keys.filter(k => k.name.startsWith("save:") || k.name.includes("auto000001")).length === 1, { saves: saves(paths), put: cnt.put });
ld = await loadCloud();
const cloud2 = JSON.parse(await g.ev(`unpackFromCloud(${JSON.stringify(ld.enc)}, ${JSON.stringify(ld.z)}).then(JSON.stringify)`));
A.check("新存檔覆蓋舊存檔(不保留歷史版本)：雲端是第20回合的內容", cloud2.turnCount === 20 && cloud2.log.length > cloud1.log.length);

// ---- 換裝置：用金鑰拿回自動存的進度 ----
const g2 = await H.loadGame({ useMock: false, env, key: null, cloud: false });
g2.ev("MOCK_AI_DELAY_MS = 0");
const r = await g2.ev(`restoreFromCloud(${JSON.stringify(key)}, ${slot})`);
A.check("換裝置輸入金鑰能拿回自動存檔的進度，日記完整", r.ok === true && g2.ev("state.turnCount") === 20 && g2.ev("state.log.length") === cloud2.log.length && g2.ev("state.log.some(e=>e.action==='自由書寫的第十回合：我想去海邊')"));

// ---- 失敗不打擾、之後再試 ----
const origFetch = g.win.fetch; let failSave = true;
g.win.fetch = async (url, init) => { if (failSave && String(url).endsWith("/save")) return new Response("boom", { status: 500 }); return origFetch(url, init); };
const toastBefore = g.win.document.querySelectorAll(".toast, #sync-toast, #save-fail-toast").length;
await playTo(30, "失敗期間");
await sleep(100);
A.check("上傳失敗：玩家端沒有跳窗，遊戲照常進行，本機存檔照存", ev("state.turnCount") === 30 && ev("state.lastAutoCloudTurn") === 20 && g.win.document.querySelectorAll(".toast, #sync-toast, #save-fail-toast").length === toastBefore && JSON.parse(ev("localStorage.getItem(STORAGE_KEY+':0')")).turnCount === 30);
failSave = false; g.ev("autoCloudFailAt = 0");
await H.playTurn(g, "恢復後"); await sleep(150);
A.check("連線恢復後的下一次存檔補上(存到第31回合)", ev("state.lastAutoCloudTurn") === 31, ev("state.lastAutoCloudTurn"));

// ---- 人生結束時再存一次，只存一次 ----
const putBefore = cnt.put;
ev("state.phase = 'ending'; state.ending = state.ending || {}; saveGame()"); await sleep(150);
A.check("人生結束(ending)時再存一次", cnt.put === putBefore + 1 && ev("state.autoSavedEnding") === true, { put: cnt.put, putBefore });
ev("saveGame()"); await sleep(80);
A.check("結局頁之後的存檔不重複上傳", cnt.put === putBefore + 1);


// ---- 長壽人生(約1300回合，舊格式超過1MB)：已結束階段走封存包，主存檔仍在上限內，換裝置拿回後日記完整 ----
{
  const g3 = await H.loadGame({ useMock: false, env, key: "auto000005", cloud: false });
  g3.ev("MOCK_AI_DELAY_MS=0; MOCK_CHAPTER_DELAY_MS=0");
  await H.startNewLife(g3, { name: "長壽" });
  g3.ev("state.ap.purchased=100000");
  for (let i = 0; i < 3; i++) await H.playTurn(g3);
  const p3 = trackPaths(g3);
  g3.ev(`(()=>{
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
  const total = g3.ev("state.log.length"), legacy = g3.ev("JSON.stringify(state).length");
  g3.ev("state.lastAutoCloudTurn = 0; saveGame()");
  for (let i = 0; i < 100 && p3.filter(x => x === "/save").length === 0; i++) await sleep(100);
  await sleep(200);
  const home = g3.ev("state.cloudHome");
  const rec = await H.callWorker(env, { method: "GET", path: `/load?key=${home.key}&slot=${home.slot}` });
  const clX = JSON.parse(await g3.ev(`unpackFromCloud(${JSON.stringify(rec.json.enc)}, ${JSON.stringify(rec.json.z)}).then(JSON.stringify)`));
  A.check("長壽人生：已結束階段上傳了封存包(5個)，主存檔只剩目前階段且在大小上限內", p3.filter(x => x === "/stage-pack").length === 5 && clX.log.length === 180 && clX.logOffset === total - 180 && rec.json.z.length < 1024 * 1024 && legacy > 1024 * 1024, { packs: p3.filter(x => x === "/stage-pack").length, n: clX.log.length, z: rec.json.z.length, legacy });
  const g4 = await H.loadGame({ useMock: false, env, key: null, cloud: false });
  const rr = await g4.ev(`restoreFromCloud(${JSON.stringify(home.key)}, ${home.slot})`);
  const okAll = await g4.ev("ensureArchivedContent(state)");
  A.check("換裝置拿回長壽人生：補回封存包後日記一則不少(不截斷)", rr.ok === true && okAll === true && g4.ev("state.log.length") === total && g4.ev("state.logOffset") === 0, { n: g4.ev("state.log.length"), total, off: g4.ev("state.logOffset") });
}

// ---- 不該自動存的情況 ----
const gm = await H.loadGame({ useMock: true, env, key: "auto000002", cloud: false });
gm.ev("MOCK_AI_DELAY_MS = 0");
await H.startNewLife(gm, { name: "示範" });
gm.ev("state.turnCount = 10"); 
A.check("示範模式不自動存", gm.ev("autoSaveDue(state)") === false);
const gn = await H.loadGame({ useMock: false, env, key: "auto000003", cloud: false, consent: false });
await H.startNewLife(gn, { name: "沒同意" });
gn.ev("localStorage.removeItem('lifegame_consent'); state.turnCount = 10");
A.check("沒有同意紀錄不自動存(同意頁會先擋住，這裡是第二道保險)", gn.ev("autoSaveDue(state)") === false);
const gc = await H.loadGame({ useMock: false, env, key: "auto000004", cloud: true });
await H.startNewLife(gc, { name: "雲端全開" }); gc.ev("state.turnCount = 10");
A.check("雲端存檔全面打開時走原本的每次同步，不重複自動存", gc.ev("autoSaveDue(state)") === false);
process.exit(A.report() ? 0 : 1);
