// 佇列批次2（2026-09-25）：行動點改由Worker端檢查（十、10.3.1～10.3.11）
import * as H from "./harness.mjs";
const A = H.makeAsserter("批次2 行動點Worker端");
let upstreamFail = null, upstreamBad = null;
const fake = H.makeFakeAnthropic({
  fail: (b, n) => upstreamFail ? upstreamFail(b, n) : false,
  turnOverride: () => upstreamBad ? upstreamBad() : {}
});
H.installUpstream(fake);
const UTC = (s) => Date.parse(s);
const env = H.makeEnv({ TEST_NOW_MS: String(UTC("2026-09-25T03:00:00Z")) }); // 台灣 9/25 11:00
const setNow = (iso) => { env.TEST_NOW_MS = String(UTC(iso)); };
const payload = (extra = {}) => JSON.stringify(Object.assign({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false, time_context: { is_prologue: false } }, extra));
let seq = 0; const nonce = () => "n" + (++seq) + "zzzzzz";
const turn = (key, slot, opts = {}) => H.callWorker(env, { body: { key, slot, turn_nonce: opts.nonce || nonce(), life_id: opts.lifeId || "lifeaaaa", ap_hint: opts.hint, messages: [{ role: "user", content: opts.content || payload() }] } });
const getAP = async (key, slot) => (await H.callWorker(env, { method: "GET", path: `/ap?key=${key}&slot=${slot}` })).json.ap;
const setRec = async (key, slot, patch, e = env) => { const r = JSON.parse(await e.SAVES.get(`ap:${key}:${slot}`)); Object.assign(r, patch); await e.SAVES.put(`ap:${key}:${slot}`, JSON.stringify(r)); };

// --- 禮包 ---
let r = await H.callWorker(env, { path: "/claim-gift", body: { key: "k1" } });
A.check("claim-gift沒帶slot：400", r.status === 400);
r = await H.callWorker(env, { path: "/claim-gift", body: { key: "k1", slot: 0 } });
A.check("新人生領禮包：伺服器端餘額＝每日5＋禮包55", r.json.granted && r.json.ap.daily === 5 && r.json.ap.gift === 55 && r.json.ap.total === 60, r.json);
await H.callWorker(env, { path: "/claim-gift", body: { key: "k1", slot: 1 } });
await H.callWorker(env, { path: "/claim-gift", body: { key: "k1", slot: 2 } });
r = await H.callWorker(env, { path: "/claim-gift", body: { key: "k1", slot: 2 } });
A.check("同一金鑰第4次領禮包：不發", r.json.granted === false && r.json.claimed === 3);
// --- 扣點順序 ---
await setRec("k1", 0, { purchased: 3 });
for (let i = 0; i < 6; i++) await turn("k1", 0);
let ap = await getAP("k1", 0);
A.check("扣點順序：每日池5點用完才扣禮包點，購買點不動", ap.daily === 0 && ap.gift === 54 && ap.purchased === 3, ap);
await setRec("k1", 0, { daily: 0, gift: 1 });
await turn("k1", 0);
ap = await getAP("k1", 0);
A.check("禮包點用完才扣購買點", ap.gift === 0 && ap.purchased === 3, ap);
await turn("k1", 0);
ap = await getAP("k1", 0);
A.check("最後扣購買點", ap.purchased === 2, ap);
r = await H.callWorker(env, { path: "/claim-gift", body: { key: "k1", slot: 0 } });
A.check("重複呼叫claim-gift不會把每日池補滿", r.json.ap.daily === 0, r.json.ap);
// --- 重新生成／失敗 ---
await setRec("k1", 1, { daily: 5, gift: 0 });
const nn = nonce();
const c0 = fake.calls.length;
await turn("k1", 1, { nonce: nn }); await turn("k1", 1, { nonce: nn }); await turn("k1", 1, { nonce: nn });
ap = await getAP("k1", 1);
A.check("同一回合重新生成(同turn_nonce)3次：只扣1點", ap.daily === 4 && fake.calls.length - c0 === 3, ap);
r = await turn("k1", 1, { nonce: nn });
A.check("同一turn_nonce第4次：429且不呼叫AI", r.status === 429 && fake.calls.length - c0 === 3);
upstreamFail = () => true;
r = await turn("k1", 1);
ap = await getAP("k1", 1);
A.check("Anthropic失敗：不扣點", r.status === 529 && ap.daily === 4, { s: r.status, ap });
const n2 = nonce(); await turn("k1", 1, { nonce: n2 }); upstreamFail = null; r = await turn("k1", 1, { nonce: n2 });
ap = await getAP("k1", 1);
A.check("失敗後同一回合重試成功：只扣1點", r.status === 200 && ap.daily === 3 && r.json.lifegame.charged === true, ap);
upstreamBad = () => ({ choices: [] });
r = await turn("k1", 1);
ap = await getAP("k1", 1); upstreamBad = null;
A.check("AI回傳格式壞掉(沒有選項)：不扣點", ap.daily === 3 && r.json.lifegame.charged === false, ap);
// --- 繞過前端、點數為0 ---
await setRec("k1", 1, { daily: 0, gift: 0, purchased: 0 });
const c1 = fake.calls.length;
r = await turn("k1", 1);
A.check("繞過前端直接打Worker、點數為0：402且沒有呼叫AI", r.status === 402 && r.json.error.type === "insufficient_action_points" && fake.calls.length === c1, r.status);
A.check("402回應附帶伺服器端餘額", r.json.lifegame && r.json.lifegame.ap.total === 0);
r = await H.callWorker(env, { body: { messages: [{ role: "user", content: payload() }] } });
A.check("沒帶金鑰/slot：400且不呼叫AI", r.status === 400 && fake.calls.length === c1);
r = await H.callWorker(env, { body: { key: "k1", slot: 1, messages: [{ role: "user", content: payload() }] } });
A.check("沒帶turn_nonce：400", r.status === 400 && fake.calls.length === c1);
r = await turn("k1", 1, { hint: { daily: 5, gift: 55 } });
A.check("已有伺服器端紀錄時，ap_hint謊報餘額無效", r.status === 402);
// --- 台灣日期 ---
setNow("2026-09-25T15:59:00Z");
ap = await getAP("k1", 1);
A.check("台灣23:59(UTC 15:59)：還沒跨日不補點", ap.daily === 0, ap);
setNow("2026-09-25T16:00:00Z");
ap = await getAP("k1", 1);
A.check("台灣00:00(UTC 16:00)：補到5點", ap.daily === 5, ap);
await setRec("k1", 2, { daily: 3, gift: 55, lastRefillDate: "2026-09-25" });
ap = await getAP("k1", 2);
A.check("補點不累加：剩3點只補到5，禮包點不變", ap.daily === 5 && ap.gift === 55, ap);
setNow("2026-09-27T01:00:00Z");
ap = await getAP("k1", 2);
A.check("已有5點：跨日不多補", ap.daily === 5, ap);
A.check("每個slot的每日池各自獨立", (await getAP("k1", 0)).daily === 5 && (await getAP("k1", 1)).daily === 5);
// --- 開場回合 ---
await H.callWorker(env, { path: "/claim-gift", body: { key: "k2", slot: 0 } });
const pro = payload({ turn: 1, time_context: { is_prologue: true } });
await turn("k2", 0, { content: pro, lifeId: "lifepro1" });
ap = await getAP("k2", 0);
A.check("開場回合(新life_id)不扣點", ap.total === 60, ap);
await turn("k2", 0, { content: pro, lifeId: "lifepro1" });
ap = await getAP("k2", 0);
A.check("同一life_id第二次開場：照常扣點", ap.total === 59, ap);
await turn("k2", 0, { content: pro, lifeId: "lifepro2" }); await turn("k2", 0, { content: pro, lifeId: "lifepro3" }); await turn("k2", 0, { content: pro, lifeId: "lifepro4" });
ap = await getAP("k2", 0);
A.check("同一slot同一天免費開場最多3次(第4個新life_id照扣)", ap.total === 58, ap);
// --- 舊存檔轉移 ---
r = await turn("k3", 0, { hint: { daily: 5, gift: 999, purchased: 999, lastRefillDate: "2026-09-27" } });
ap = await getAP("k3", 0);
A.check("舊存檔第一次打Worker：依存檔建立紀錄但有上限(每日≤5、禮包≤55、購買點0)，並扣本回合1點", ap.daily === 4 && ap.gift === 55 && ap.purchased === 0, ap);
// --- 人生結束 ---
await setRec("k3", 0, { purchased: 7 });
r = await H.callWorker(env, { path: "/archive", body: { key: "k3", slot: 0, id: "arch1", meta: {}, purchased: 7, state: { x: 1 } } });
const walletRes = await H.callWorker(env, { method: "GET", path: "/slots?key=k3" });
A.check("人生結束：點數紀錄刪除、購買點進金鑰錢包", r.status === 200 && (await env.SAVES.get("ap:k3:0")) === null && walletRes.json.wallet === 7);
r = await H.callWorker(env, { path: "/claim-gift", body: { key: "k3", slot: 0 } });
A.check("同一格子開新人生：重新建立(每日5＋禮包55，舊禮包點不殘留)", r.json.ap.daily === 5 && r.json.ap.gift === 55, r.json.ap);

// ================= 前端真實路徑 =================
// 前端用的是瀏覽器真實時間，Worker這邊也用真實時間，兩邊的台灣日期才會一致
const envF = H.makeEnv();
const g = await H.loadGame({ useMock: false, env: envF, key: "frontkey1", slot: 0 });
await H.startNewLife(g);
const sAP = async () => (await H.callWorker(envF, { method: "GET", path: "/ap?key=frontkey1&slot=0" })).json.ap;
A.check("前端開新人生：開場回合不扣點，畫面＝伺服器端60點", g.ev("totalAP(state)") === 60 && (await sAP()).total === 60, g.ev("JSON.stringify(state.ap)"));
for (let i = 0; i < 3; i++) await H.playTurn(g);
A.check("玩3回合：伺服器端57、畫面57", (await sAP()).total === 57 && g.ev("totalAP(state)") === 57);
g.ev("state.ap.gift = 9999");
await H.playTurn(g);
A.check("前端竄改本機點數：下一回合後畫面改回伺服器端數字", g.ev("totalAP(state)") === 56 && (await sAP()).total === 56, g.ev("totalAP(state)"));
const turnsBefore = g.ev("state.turnCount");
g.ev("restoreUndo()");
A.check("悔棋：伺服器端不退點", (await sAP()).total === 56);
upstreamFail = () => true;
const logLen = g.ev("state.log.length");
await H.playTurn(g);
upstreamFail = null;
A.check("AI連續失敗(含重試)：伺服器端不扣點、畫面點數不變", (await sAP()).total === 56 && g.ev("totalAP(state)") === 56);
A.check("AI失敗時玩家看到的是容錯文字", /恍神/.test(g.ev("state.log[state.log.length-1].text")));
await setRec("frontkey1", 0, { daily: 0, gift: 0, purchased: 0 }, envF);
g.ev("state.ap.daily = 5");
const callsBefore = fake.calls.length; const tc = g.ev("state.turnCount");
await g.ev("takeTurn(state.choices[0], AP_COST_PER_TURN)"); // 不自動點掉彈窗，才看得到提示
A.check("伺服器端0點、本機顯示5點：送出被Worker擋下，不呼叫AI、回合數不變", fake.calls.length === callsBefore && g.ev("state.turnCount") === tc, { calls: fake.calls.length - callsBefore, tc: g.ev("state.turnCount") });
A.check("被擋下後畫面同步成0點並跳出行動點用完提示", g.ev("totalAP(state)") === 0 && !!g.win.document.getElementById("ap-exhausted-modal"));
g.win.document.getElementById("ap-exhausted-modal")?.remove();
await setRec("frontkey1", 0, { daily: 1 }, envF);
await g.ev("refreshServerAP()");
await g.ev("takeTurn(state.choices[0], AP_COST_PER_TURN)");
A.check("用掉最後1點：回合照常完成後才跳提示", g.ev("state.turnCount") === tc + 1 && g.ev("totalAP(state)") === 0 && !!g.win.document.getElementById("ap-exhausted-modal"));
// 轉世丹/傳承：同一格子點數保留
await setRec("frontkey1", 0, { daily: 2, gift: 10 }, envF);
g.ev("state.phase='ending'; state.ending={epitaph:'x'};");
g.ev("reincarnate()");
g.ev("state.spendingHabit='普通'; state.mealArrangement=state.mealArrangement||'家裡煮';");
await g.ev("startLife()"); await H.waitIdle(g, 20); H.clickModals(g.win);
A.check("轉世丹：同一格子點數保留，開場回合不扣點", (await sAP()).total === 12 && g.ev("totalAP(state)") === 12, (await sAP()));
// 真實模式跨台灣日期：畫面向Worker重新讀餘額(由伺服器補點)，不自己補
await setRec("frontkey1", 0, { daily: 0, gift: 0, purchased: 0, lastRefillDate: "2000-01-01" }, envF);
g.ev("state.ap.daily = 0; state.ap.gift = 0; state.ap.lastRefillDate = '2000-01-01'; apRefreshAskedFor = null; render();");
await H.waitIdle(g, 30);
const srvAfter = await sAP();
A.check("真實模式跨日：畫面向Worker讀到伺服器補好的5點", g.ev("state.ap.daily") === 5 && srvAfter.total === 5, { client: g.ev("JSON.stringify(state.ap)"), srvAfter });
// mock模式回歸：本機扣點照舊
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "mockkey1" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm);
for (let i = 0; i < 5; i++) await H.playTurn(gm);
A.check("mock模式回歸：本機照常扣點(60→55)", gm.ev("totalAP(state)") === 55, gm.ev("totalAP(state)"));
const ok = A.report();
process.exit(ok ? 0 : 1);
