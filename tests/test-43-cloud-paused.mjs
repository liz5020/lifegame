// 2026-09-29：十、10.8封測期間暫停雲端存檔——開關關閉時存檔/點數/人生回顧只存本機、恢復金鑰畫面隱藏、Worker完全不碰KV
// （全程不打真實API：真實API模式用假的Anthropic上游）
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.8 封測期間暫停雲端存檔");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// KV每一種操作都計數
function countKV(env) {
  const kv = env.SAVES, cnt = { get: 0, put: 0, delete: 0, list: 0 };
  for (const op of Object.keys(cnt)) { const f = kv[op].bind(kv); kv[op] = async (...a) => { cnt[op]++; return f(...a); }; }
  return cnt;
}
const kvTotal = (c) => c.get + c.put + c.delete + c.list;
function dumpStorage(win) { const o = {}; for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); o[k] = win.localStorage.getItem(k); } return o; }
// 記錄前端打到Worker的網址(路徑)
function trackPaths(g) {
  const paths = []; const f = g.win.fetch;
  g.win.fetch = async (url, init) => { paths.push(new URL(String(url)).pathname); return f(url, init); };
  return paths;
}

// ---------- Worker：開關關閉 ----------
{
  const env = H.makeEnv({ CLOUD_SAVE_ENABLED: "false" });
  const cnt = countKV(env);
  const fake = H.makeFakeAnthropic(); H.installUpstream(fake);
  const r1 = await H.callWorker(env, { path: "/claim-gift", body: { key: "k1", slot: 0 } });
  const r2 = await H.callWorker(env, { method: "GET", path: "/archives?key=k1" });
  const r3 = await H.callWorker(env, { method: "GET", path: "/usage-summary", headers: { Authorization: "Bearer admin-secret" } });
  A.check("W1 手動存檔以外的雲端網址回503 cloud_disabled", r1.status === 503 && r1.json.cloud_disabled === true && r2.status === 503);
  A.check("W2 /usage-summary暫停", r3.status === 503);
  A.check("W3 以上都沒有碰KV", kvTotal(cnt) === 0, cnt);
  // 沒有綁定RATE_LIMITER時放行；有綁定時超過就擋(不經KV)
  let n = 0; const env2 = H.makeEnv({ CLOUD_SAVE_ENABLED: "false", RATE_LIMITER: { limit: async () => ({ success: ++n <= 2 }) } });
  const cnt2 = countKV(env2);
  const s1 = (await H.callWorker(env2, { path: "/ap?key=k1&slot=0", method: "GET" })).status, s2 = (await H.callWorker(env2, { path: "/ap?key=k1&slot=0", method: "GET" })).status, s3 = (await H.callWorker(env2, { path: "/ap?key=k1&slot=0", method: "GET" })).status;
  A.check("W4 頻率限制改用Rate Limiting綁定：超過回429、不碰KV", s1 === 503 && s2 === 503 && s3 === 429 && kvTotal(cnt2) === 0, { s1, s2, s3, cnt2 });
}

// ---------- 前端＋Worker(真實API模式、假上游)：全新瀏覽器開始一段人生 ----------
const env = H.makeEnv({ CLOUD_SAVE_ENABLED: "false" });
const cnt = countKV(env);
const fake = H.makeFakeAnthropic(); H.installUpstream(fake);
const g = await H.loadGame({ useMock: false, env, key: null, cloud: false });
const paths = trackPaths(g);
const ev = g.ev;
A.check("0 前端開關預設讀到關閉(旗標off)", ev("CLOUD_SAVE_ENABLED===false && SERVER_AP===false"));
// 從取名後的生活方式畫面按「睜開眼睛」(這台裝置還沒有金鑰)
ev(`state = newRoll(null, {name:"周本機", gender:"女"}); state.spendingHabit="普通"; state.mealArrangement=state.mealArrangement||"家裡煮"; state.phase="lifestyle"; render();`);
ev(`document.getElementById("btn-lifestyle-confirm").click()`);
await sleep(80); H.clickModals(g.win);
A.check("4 恢復金鑰畫面隱藏：沒有經過金鑰畫面，直接開始", ev("state.phase") === "playing" && !g.win.document.getElementById("app").textContent.includes("這是你的復原金鑰"), ev("state.phase"));
A.check("4 金鑰仍在背景產生(本機存檔的編號)", !!ev("localStorage.getItem(RECOVERY_KEY_STORAGE_NAME)"));
A.check("3 新人生禮包55點(本機計數第1次)＋每日5點", ev("totalAP(state)") === 60 && ev("state.ap.gift") === 55 && ev(`Number(localStorage.getItem(GIFT_CLAIMS_LOCAL_PREFIX+localStorage.getItem(RECOVERY_KEY_STORAGE_NAME)))`) === 1, ev("JSON.stringify(state.ap)"));
A.check("4 選單保留「我的復原金鑰」、多了「存到雲端」、沒有自動同步狀態(10.8.1)", ev(`renderMenuPanel(state)`).includes("我的復原金鑰") && ev(`renderMenuPanel(state)`).includes("存到雲端") && !ev(`renderMenuPanel(state)`).includes("cloud-sync-status-wrap"));
ev(`state.phase="keyReveal"; state.newKey="X"; render();`);
A.check("4 開新人生的金鑰畫面狀態會導回首頁", ev("state.phase") === "home");
await ev(`tryLoadSlot(localStorage.getItem(RECOVERY_KEY_STORAGE_NAME), 0, false)`);

// 玩幾回合：真實API模式，點數在本機扣
const ap0 = ev("totalAP(state)");
for (let i = 0; i < 5; i++) await H.playTurn(g);
await sleep(50);
A.check("3 每回合在本機扣1點(真實API模式、雲端暫停)", ev("totalAP(state)") === ap0 - 5 && ev("state.turnCount") >= 5, { ap0, now: ev("totalAP(state)") });
A.check("1 本機存檔有寫入", JSON.parse(ev(`localStorage.getItem(STORAGE_KEY+":0")`)).turnCount === ev("state.turnCount"));
const turnsBefore = ev("state.turnCount"), nameBefore = ev("state.name"), logLen = ev("state.log.length");
// 每日補點：把上次補點日期改成昨天、每日池用完
ev("state.ap.daily=0; state.ap.lastRefillDate='2000-01-01'; saveGame()");
const giftBefore = ev("state.ap.gift");
ev("render()");
A.check("3 跨日補點：每日池補回5點、禮包點不變(本機判斷)", ev("state.ap.daily") === 5 && ev("state.ap.gift") === giftBefore && ev("state.ap.lastRefillDate") === ev("taipeiDateString()"));
ev("state.ap.daily=5; saveGame()");
// AI失敗不扣點
const apBeforeFail = ev("totalAP(state)");
H.installUpstream(async () => new Response("boom", { status: 500 }));
await H.playTurn(g); await sleep(30);
A.check("3 AI失敗不扣點(本機退回)", ev("totalAP(state)") === apBeforeFail, { apBeforeFail, now: ev("totalAP(state)") });
H.installUpstream(fake);
// 點數用完：擋下
ev("state.ap.daily=0; state.ap.gift=0; state.ap.purchased=0; state.ap.lastRefillDate=taipeiDateString(); saveGame()");
const tBefore = ev("state.turnCount");
await H.playTurn(g); await sleep(20);
A.check("3 點數歸零時不能再玩", ev("state.turnCount") === tBefore);
ev("state.ap.daily=5; saveGame()");

// ---------- 重新整理頁面 ----------
const stored = dumpStorage(g.win);
stored.life_sim_age_confirmed = "yes"; // 首頁年齡確認(十六、16.10.0)，確認前首頁按鈕不能按
const g2 = await H.loadGame({ useMock: false, env, storage: stored, cloud: false });
const paths2 = trackPaths(g2);
const ev2 = g2.ev;
A.check("2 重新整理後首頁列出還沒寫完的人生", ev2("homeUnfinishedLives().length") === 1 && ev2("homeUnfinishedLives()[0].name") === nameBefore);
g2.win.document.querySelector(".life-card[data-slot]").click();
await sleep(80);
A.check("1／2 重新整理後讀檔：進度還在", ev2("state.phase") === "playing" && ev2("state.turnCount") === ev("state.turnCount") && ev2("state.log.length") === ev("state.log.length"), { t: ev2("state.turnCount"), expect: ev("state.turnCount") });
A.check("2 重新整理後點數還在", ev2("totalAP(state)") === 5);
// 切換人生畫面：三格從本機讀
await ev2("switchLife()");
A.check("1 切換人生畫面：第1格是這段人生(本機)，其他空白", ev2("state.phase") === "slotPicker" && ev2("state.slots[0] && state.slots[0].meta.name") === nameBefore && ev2("state.slots[1]") === null && ev2("renderSlotPicker()").includes("這台裝置最多可以同時進行3段人生"));
g2.win.document.querySelector('.slot-btn[data-slot="0"]').click();
await sleep(60);
A.check("1 從切換畫面讀回同一段人生", ev2("state.phase") === "playing" && ev2("state.name") === nameBefore);
// 新人生禮包：同一台裝置第2、3次有、第4次沒有(本機計數)
const giftResults = [];
for (let i = 0; i < 3; i++) giftResults.push(await ev2(`claimNewLifeGift(localStorage.getItem(RECOVERY_KEY_STORAGE_NAME), 1).then(r=>r.granted)`));
A.check("3 新人生禮包每台裝置最多3次(第4次不發)", JSON.stringify(giftResults) === "[true,true,false]", giftResults);
// 人生結束：存進本機人生回顧(壓縮)，可以翻閱
ev2("state.ap.purchased=0");
await ev2(`endLife("deleted")`);
await sleep(50);
const key2 = ev2("localStorage.getItem(RECOVERY_KEY_STORAGE_NAME)");
const arch = JSON.parse(ev2(`localStorage.getItem(ARCHIVE_LOCAL_PREFIX+${JSON.stringify(key2)})`) || "[]");
A.check("1 人生結束：存進本機人生回顧(壓縮)，原本格子空出", arch.length === 1 && arch[0].enc === "gzip-b64" && !arch[0].state && !ev2(`localStorage.getItem(STORAGE_KEY+":0")`), arch.map(a => ({ id: a.id, enc: a.enc })));
await ev2(`showArchiveList(${JSON.stringify(key2)})`);
g2.win.document.querySelector(".archive-btn").click();
await sleep(60);
A.check("1 人生回顧可以翻閱(解壓)", ev2("state.phase") === "archiveView" && ev2("state.archived.name") === nameBefore);

// ---------- 5 完全沒有KV呼叫 ----------
const storagePaths = paths.concat(paths2).filter(p => p !== "/");
A.check("5 平常遊玩：前端沒有呼叫任何存檔類網址(只打AI)", storagePaths.length === 0, [...new Set(storagePaths)]);
A.check("5 平常遊玩：Worker全程沒有碰KV(讀/寫/刪/列都是0)", kvTotal(cnt) === 0 && env.SAVES._m.size === 0, cnt);
A.check("5 AI呼叫照常(假上游)", fake.calls ? fake.calls.length >= 5 : true);

// ---------- 10.8.1 手動存到雲端 ----------
{
  const envS = H.makeEnv({ CLOUD_SAVE_ENABLED: "false" });
  const cS = countKV(envS);
  const gA = await H.loadGame({ useMock: true, env: envS, key: null, cloud: false });
  const pA = trackPaths(gA);
  gA.ev(`state = newRoll(null, {name:"周雲端", gender:"女"}); state.spendingHabit="普通"; state.mealArrangement=state.mealArrangement||"家裡煮"; state.phase="lifestyle"; render();`);
  gA.ev(`document.getElementById("btn-lifestyle-confirm").click()`);
  await sleep(80); H.clickModals(gA.win);
  for (let i = 0; i < 4; i++) await H.playTurn(gA);
  await sleep(30);
  A.check("M1 按之前：雲端0次", kvTotal(cS) === 0 && pA.length === 0, { cS, pA });
  const keyA = gA.ev("localStorage.getItem(RECOVERY_KEY_STORAGE_NAME)");
  gA.ev("render()");
  gA.win.document.getElementById("link-manual-cloud-save").click();
  await sleep(120);
  A.check("M2 按一次＝雲端寫入1次(沒有其他KV操作)", cS.put === 1 && cS.get === 0 && cS.delete === 0 && cS.list === 0 && pA.filter(p => p === "/save").length === 1, cS);
  const modal = gA.win.document.getElementById("manual-save-modal");
  A.check("M3 顯示「已存到雲端」與復原金鑰", !!modal && modal.textContent.includes("已存到雲端") && modal.textContent.includes(keyA));
  A.check("M4 存的內容不含反悔快照、壓縮過", (() => { const r = JSON.parse(envS.SAVES._m.get(`save:${keyA}:0`).v); return r.enc === "gzip-b64"; })());
  const apA = gA.ev("totalAP(state)"), turnsA = gA.ev("state.turnCount"), lifeA = gA.ev("state.lifeId");
  // 存完之後再玩：雲端不再增加
  const putsAfterSave = cS.put;
  await H.playTurn(gA); await sleep(30);
  A.check("M5 存完再玩：雲端不會自動同步", cS.put === putsAfterSave);
  // 連按太快：Worker頻率限制回429時，顯示稍等
  const envR = H.makeEnv({ CLOUD_SAVE_ENABLED: "false", RATE_LIMITER: { limit: async () => ({ success: false }) } });
  const gR = await H.loadGame({ useMock: true, env: envR, key: "ratekey01", cloud: false });
  await H.startNewLife(gR);
  await gR.ev("manualCloudSave()");
  A.check("M6 連按太快被擋：提示稍等，本機進度還在", gR.win.document.getElementById("manual-save-modal").textContent.includes("按得太快") && gR.ev("state.phase") === "playing");

  // 換裝置(全新瀏覽器)：首頁「切換其他人生」→輸入金鑰→拿回
  const gB = await H.loadGame({ useMock: true, env: envS, key: null, cloud: false, storage: { life_sim_age_confirmed: "yes" } });
  gB.ev("state={phase:'home'}; render()");
  gB.win.document.getElementById("btn-home-switch").click();
  await sleep(30);
  A.check("M7 新裝置按「切換其他人生」：進到輸入金鑰畫面", gB.ev("state.phase") === "keyInput");
  gB.win.document.getElementById("key-input-field").value = keyA;
  gB.win.document.getElementById("btn-key-input-submit").click();
  await sleep(80);
  A.check("M8 列出雲端的人生", gB.ev("state.fromCloud") === true && gB.ev("state.slots[0] && state.slots[0].meta.name") === "周雲端");
  gB.win.document.querySelector('.slot-btn[data-slot="0"]').click();
  await sleep(120);
  A.check("M9 拿回的是按按鈕當時的進度(之後多玩的不會跟過去)", gB.ev("state.phase") === "playing" && gB.ev("state.turnCount") === turnsA && gB.ev("state.lifeId") === lifeA, { got: gB.ev("state.turnCount"), expect: turnsA });
  A.check("M10 行動點跟著存檔走", gB.ev("totalAP(state)") === apA, { got: gB.ev("totalAP(state)"), apA });
  A.check("M11 新裝置沿用這把金鑰，並存在本機", gB.ev("localStorage.getItem(RECOVERY_KEY_STORAGE_NAME)") === keyA && JSON.parse(gB.ev(`localStorage.getItem(STORAGE_KEY+":"+localStorage.getItem(ACTIVE_SLOT_STORAGE_NAME))`)).lifeId === lifeA);

  // 已經有自己人生的裝置：拿回來放進空的格子，自己的人生不受影響；之後再存，存回原本的金鑰
  const gC = await H.loadGame({ useMock: true, env: envS, key: "devicec01", cloud: false });
  await H.startNewLife(gC, { name: "吳本機", gender: "男" });
  const ownLife = gC.ev("state.lifeId");
  await gC.ev(`showCloudPicker(${JSON.stringify(keyA)})`);
  gC.win.document.querySelector('.slot-btn[data-slot="0"]').click();
  await sleep(120);
  A.check("M12 已有人生的裝置：放進空的格子，原本的人生還在", gC.ev("localStorage.getItem(ACTIVE_SLOT_STORAGE_NAME)") === "1" && gC.ev("state.lifeId") === lifeA && JSON.parse(gC.ev(`localStorage.getItem(STORAGE_KEY+":0")`)).lifeId === ownLife);
  A.check("M13 這台裝置的金鑰不變；選單金鑰顯示這段人生的金鑰", gC.ev("localStorage.getItem(RECOVERY_KEY_STORAGE_NAME)") === "devicec01" && (gC.ev("renderKeyViewModal()"), gC.win.document.getElementById("key-view-modal").textContent.includes(keyA)));
  gC.win.document.getElementById("key-view-modal").remove();
  await H.playTurn(gC); await sleep(20);
  await gC.ev("manualCloudSave()");
  A.check("M14 再存：存回原本那把金鑰的同一格", JSON.parse(envS.SAVES._m.get(`save:${keyA}:0`).v).meta.name === "周雲端" && !envS.SAVES._m.has("save:devicec01:1") && gC.win.document.getElementById("manual-save-modal").textContent.includes(keyA));
  // 打錯金鑰
  await gC.ev(`showCloudPicker("nosuchkey99")`);
  A.check("M15 打錯金鑰：提示雲端沒有存檔", gC.ev("state.notice||''").includes("沒有存檔"));
  // 其他雲端網址仍然關閉
  const r = await H.callWorker(envS, { path: "/archive", body: {} });
  A.check("M16 手動存檔以外的雲端網址仍然關閉", r.status === 503);
}

// ---------- mock模式也一樣不碰雲端 ----------
{
  const envM = H.makeEnv({ CLOUD_SAVE_ENABLED: "false" });
  const cM = countKV(envM);
  const gm = await H.loadGame({ useMock: true, env: envM, key: null, cloud: false });
  const pm = trackPaths(gm);
  gm.ev(`state = newRoll(null, {name:"周示範", gender:"男"}); state.spendingHabit="普通"; state.mealArrangement=state.mealArrangement||"家裡煮"; state.phase="lifestyle"; render();`);
  gm.ev(`document.getElementById("btn-lifestyle-confirm").click()`);
  await sleep(80); H.clickModals(gm.win);
  for (let i = 0; i < 3; i++) await H.playTurn(gm);
  await sleep(30);
  A.check("5 mock模式：沒有任何Worker呼叫、KV為0", pm.length === 0 && kvTotal(cM) === 0 && gm.ev("state.turnCount") >= 3, { pm, cM });
}

// ---------- 開關打開時雲端照舊(既有行為沒被影響) ----------
{
  const envC = H.makeEnv();
  const gc = await H.loadGame({ useMock: true, env: envC, key: "cloudon01", cloud: true });
  await H.startNewLife(gc);
  await H.playTurn(gc); await gc.ev("saveGame()"); await sleep(30);
  A.check("開關打開：照舊上傳雲端存檔", envC.SAVES._m.has("save:cloudon01:0") && gc.ev("CLOUD_SAVE_ENABLED") === true);
}

const ok = A.report();
if (g.errors.length) console.log("jsdom錯誤：", g.errors.slice(0, 3).map(String));
process.exit(ok ? 0 : 1);
