// 2026-09-30：十、10.9.2／10.9.3 共用錢包、綁定、登入併入、人生數上限、啟程禮發放與每日上限排隊、換綁信箱、錢包扣點（全程假Resend、假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("帳號：錢包、綁定、併入、啟程禮");
let upstreamFail = false;
const fakeAI = H.makeFakeAnthropic({ fail: () => upstreamFail });
const resend = H.makeFakeResend();
H.installUpstream(fakeAI, resend);

const T0 = Date.parse("2026-09-30T03:00:00Z");
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0) });
const MIN = 60 * 1000, DAY = 24 * 60 * MIN;
let clock = 0;
const setNow = ms => { clock = ms; env.TEST_NOW_MS = String(T0 + ms); };
const post = (path, body, headers) => H.callWorker(env, { path, body, headers });
const get = (path, headers) => H.callWorker(env, { method: "GET", path, headers });
const auth = t => ({ Authorization: "Bearer " + t });
let ipn = 0;
const lastSent = {};
async function code(email) { // 同一信箱60秒內不能重寄：需要的話把測試時鐘往後撥61秒
  const k = email.trim().toLowerCase();
  if (lastSent[k] !== undefined && clock - lastSent[k] < 61 * 1000) setNow(lastSent[k] + 61 * 1000);
  lastSent[k] = clock;
  const r = await post("/account/send-code", { email }, { "CF-Connecting-IP": "10.7." + (++ipn) + ".1" }); if (r.status !== 200) throw new Error("寄驗證碼失敗 " + JSON.stringify(r)); return resend.lastCode(k); }
async function bind(email, key, lives) { return post("/account/bind", { email, code: await code(email), key, lives }); }
async function login(email, lives) { return post("/account/login", { email, code: await code(email), lives }); }
const L = (lid, daily, gift) => ({ lid, pool: { daily, gift } });
const me = t => get("/account/me", auth(t));
const evTypes = r => (r.json.events || []).map(e => e.type + ":" + e.n).join("|");
const turnPayload = (extra) => JSON.stringify(Object.assign({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false }, extra || {}));
let nonceSeq = 0;
const aiTurn = (token, opts = {}) => post("/", { wallet: true, turn_nonce: opts.nonce || ("wn" + (++nonceSeq) + "zzzzzzz"), life_id: opts.life || "lifewallet1", messages: [{ role: "user", content: turnPayload(opts.prologue ? { time_context: { is_prologue: true } } : {}) }] }, auth(token));

// ================= 情境1：首次綁定 =================
setNow(0);
let r = await bind("one@example.com", "KEY-ONE", [L("lifeone01", 5, 30)]);
const tOne = r.json.token;
A.check("首次綁定：成功、未綁人生剩下的35點併入錢包後再+30點(2026-09-30第三批)", r.status === 200 && r.json.account.wallet.total === 65 && r.json.result.carried === 35 && r.json.result.gift.status === "granted" && r.json.result.gift.added === 30, r.json);
A.check("首次綁定：這段人生成為帳號第1段(slot 0)、金鑰綁在帳號上", r.json.account.lives.length === 1 && r.json.account.lives[0].lid === "lifeone01" && r.json.account.lives[0].slot === 0 && r.json.account.recovery_key === "KEY-ONE", r.json.account);
A.check("首次綁定：點數明細有「啟程禮 +30」(固定+30)", evTypes(r) === "啟程禮:30", r.json.events);
A.check("首次綁定：已領1／2份", r.json.account.gifts.claimed === 1 && r.json.account.gifts.max === 2 && r.json.account.gifts.queued === 0, r.json.account.gifts);
r = await bind("big@example.com", "KEY-BIG", [L("lifebig01", 5, 55)]);
A.check("首次綁定：帶過來的點數再多(60點)也照樣+30：錢包90點", r.json.account.wallet.total === 90 && r.json.result.gift.added === 30, r.json);
r = await bind("none@example.com", "KEY-NONE", []);
A.check("首次綁定：沒有人生也能綁(錢包直接30點)", r.status === 200 && r.json.account.wallet.total === 30 && r.json.account.lives.length === 0, r.json);
// 錢包沒有「每條人生各一池」：只有一個總數
A.check("錢包是整個帳號共用的一個數字(free＋purchased)", r.json.account.wallet.free === 30 && r.json.account.wallet.purchased === 0);

// ================= 情境2：綁到已有帳號的信箱→拒絕 =================
const before = (await me(tOne)).json.account;
r = await bind("ONE@example.com ", "KEY-OTHER", [L("lifeoth01", 5, 55)]);
A.check("綁到已有帳號的信箱→409 email_exists(驗證碼通過後才告知)", r.status === 409 && r.json.error === "email_exists", r);
const after = (await me(tOne)).json.account;
A.check("被拒絕時：原帳號的錢包、人生、啟程禮份數都沒動", JSON.stringify(before.wallet) === JSON.stringify(after.wallet) && after.lives.length === 1 && after.gifts.claimed === 1, { before, after });
r = await post("/account/bind", { email: "one@example.com", code: "123456", key: "KEY-X", lives: [] });
A.check("沒有驗證碼就想綁到已有帳號的信箱→只會得到驗證碼錯誤(不洩漏信箱有沒有帳號)", r.json.error === "no_code" || r.json.error === "wrong_code", r.json);

// ================= 情境3：登入併入(無歌啟程禮) =================
setNow(10 * MIN);
r = await login("one@example.com", [L("lifedev01", 3, 10)]);
const tOneDev2 = r.json.token;
A.check("登入既有帳號：裝置上的未綁人生併入(第2段)、剩下13點併入錢包、不發啟程禮", r.status === 200 && r.json.result.accepted.length === 1 && r.json.result.overflow.length === 0 && r.json.result.carried === 13 && r.json.account.wallet.total === 65 + 13 && r.json.account.lives.length === 2 && r.json.account.gifts.claimed === 1, r.json);
A.check("登入併入：點數明細「帳號併入 +13」，沒有啟程禮", evTypes(r) === "帳號併入:13", r.json.events);
A.check("登入併入：兩段人生各占一個格子(slot 0與1)", new Set(r.json.account.lives.map(l => l.slot)).size === 2);
r = await login("one@example.com", []);
A.check("再從第三台裝置登入(沒有人生要併入)：錢包不變、不重發啟程禮", r.status === 200 && r.json.account.wallet.total === 78 && r.json.account.gifts.claimed === 1 && !r.json.events.length, r.json);
r = await login("nobody-here@example.com", []);
A.check("登入沒有帳號的信箱→409 no_account(要從遊戲裡綁定信箱)", r.status === 409 && r.json.error === "no_account", r.json);

// ================= 情境4：併入超過2段 =================
setNow(20 * MIN);
r = await login("one@example.com", [L("lifemore1", 5, 55), L("lifemore2", 5, 55)]);
A.check("已有2段的帳號再併入更多人生→全部超額：不收、不刪(overflow)，點數也不併入(人生留在原金鑰帶著自己的點數)", r.status === 200 && r.json.result.accepted.length === 0 && r.json.result.overflow.length === 2 && r.json.result.carried === 0 && r.json.account.lives.length === 2 && r.json.account.wallet.total === 78, r.json);
r = await bind("three@example.com", "KEY-THREE", [L("lifet001", 5, 55), L("lifet002", 5, 55), L("lifet003", 5, 55)]);
A.check("封測留下3段人生首次綁定：收2段(依傳入順序)、第3段留在原金鑰", r.json.result.accepted.map(x => x.lid).join() === "lifet001,lifet002" && r.json.result.overflow.join() === "lifet003" && r.json.account.lives.length === 2, r.json.result);
A.check("超額的那段人生的點數不併入：錢包＝前2段帶入(上限120)＋30點啟程禮", r.json.account.wallet.total === 150, r.json.account.wallet);
const tThree = r.json.token;
r = await post("/account/lives", { op: "add", lid: "lifet004" }, auth(tThree));
A.check("帳號滿2段時再開新人生→409 account_full", r.status === 409 && r.json.error === "account_full", r.json);
await post("/account/lives", { op: "remove", lid: "lifet001" }, auth(tThree));
r = await post("/account/lives", { op: "attach", lives: [L("lifet003", 5, 55)] }, auth(tThree));
A.check("帳號空出格子後可以手動轉入：不發啟程禮、剩餘點數併入錢包", r.status === 200 && r.json.result.accepted.length === 1 && r.json.account.gifts.claimed === 1 && r.json.account.wallet.total === 150, r.json);

// ================= 第2份啟程禮 =================
setNow(30 * MIN);
r = await bind("two@example.com", "KEY-TWO", [L("lifetwo01", 5, 10)]);
const tTwo = r.json.token;
r = await post("/account/lives", { op: "add", lid: "lifetwo02" }, auth(tTwo));
A.check("帳號第一次開第2段人生：錢包直接增加55點(第2份)", r.status === 200 && r.json.result.gift && r.json.result.gift.status === "granted" && r.json.account.wallet.total === 45 + 55 && evTypes(r) === "啟程禮（第 2 份）:55" && r.json.account.gifts.claimed === 2, r.json);
await post("/account/lives", { op: "remove", lid: "lifetwo02" }, auth(tTwo));
r = await post("/account/lives", { op: "add", lid: "lifetwo03" }, auth(tTwo));
A.check("每個信箱最多2份：之後再開第2段人生不再發", r.status === 200 && !r.json.result.gift && r.json.account.wallet.total === 100 && r.json.account.gifts.claimed === 2, r.json);
r = await post("/account/lives", { op: "add", lid: "lifetwo03" }, auth(tTwo));
A.check("同一段人生重複登記不會重複發／重複占格子(冪等)", r.status === 200 && r.json.account.lives.length === 2 && r.json.account.wallet.total === 100, r.json);

// ================= 每日補點：補到 5點×人生數，不回溯、不設上限 =================
setNow(DAY);
r = await me(tTwo);
A.check("每日補點：餘額100已超過上限10→不補、不扣減", r.json.account.wallet.total === 100 && !r.json.events.length, r.json);
let spentAll = 0;
for (let i = 0; i < 98; i++) { const x = await aiTurn(tTwo); if (x.status === 200) spentAll++; }
A.check("(先扣到剩2點：連續98回合)", spentAll === 98 && (await me(tTwo)).json.account.wallet.total === 2, spentAll);
setNow(2 * DAY);
r = await me(tTwo);
A.check("每日補點：2段人生→補到10點(補8點)、明細「每日補點 +8」、當天再開不重複補", r.json.account.wallet.total === 10 && evTypes(r) === "每日補點:8" && (await me(tTwo)).json.account.wallet.total === 10, r.json);
await post("/account/lives", { op: "remove", lid: "lifetwo03" }, auth(tTwo));
for (let i = 0; i < 8; i++) await aiTurn(tTwo); // 10→2
setNow(5 * DAY);
r = await me(tTwo);
A.check("每日補點：只剩1段人生→補到5點(補3點)；不回溯補發沒上線的天數", r.json.account.wallet.total === 5 && evTypes(r) === "每日補點:3", r.json);
// 每日補點一天只補一次
r = await aiTurn(tTwo);
A.check("(補點後扣1點仍是同一天，不會再補)", (await me(tTwo)).json.account.wallet.total === 4);

// ================= 錢包扣點(AI代理) =================
setNow(6 * DAY);
r = await bind("pay@example.com", "KEY-PAY", [L("lifepay01", 0, 2)]); const tPay = r.json.token;
await post("/account/wallet", { op: "spend", n: 30 }, auth(tPay)); await post("/account/wallet", { op: "spend", n: 2 }, auth(tPay)); // 綁定時2點＋30點＝32點，扣光
r = await me(tPay); A.check("(準備：錢包剩0點)", r.json.account.wallet.total === 0, r.json.account.wallet);
setNow(7 * DAY); r = await me(tPay);
A.check("(隔天補到5點)", r.json.account.wallet.total === 5);
r = await aiTurn(tPay, { nonce: "payn0000001" });
A.check("回合：成功→扣1點、回傳最新錢包(4點)", r.status === 200 && r.json.lifegame.wallet.total === 4 && r.json.lifegame.charged === true, r.json.lifegame);
r = await aiTurn(tPay, { nonce: "payn0000001" });
A.check("同一turn_nonce重新生成不再扣點", r.status === 200 && r.json.lifegame.wallet.total === 4 && r.json.lifegame.charged === false, r.json.lifegame);
upstreamFail = true;
r = await aiTurn(tPay, { nonce: "payn0000002" });
upstreamFail = false;
A.check("回合：AI失敗→不扣點(退回)，仍是4點", r.status >= 400 && r.json.lifegame.wallet.total === 4, r.json);
r = await aiTurn(tPay, { prologue: true, life: "lifepayop1", nonce: "payn0000003" });
A.check("開場回合不扣點", r.status === 200 && r.json.lifegame.wallet.total === 4, r.json.lifegame);
for (let i = 0; i < 4; i++) await aiTurn(tPay);
r = await aiTurn(tPay);
A.check("錢包0點→402 insufficient_action_points、不呼叫AI", r.status === 402 && r.json.error.type === "insufficient_action_points" && r.json.lifegame.wallet.total === 0, r.json);
const callsBefore = fakeAI.calls.length;
await aiTurn(tPay);
A.check("(被擋時Anthropic沒有被呼叫)", fakeAI.calls.length === callsBefore);
r = await post("/", { wallet: true, turn_nonce: "wn0000000zz", life_id: "lifepay01", messages: [{ role: "user", content: turnPayload() }] }, auth("x".repeat(64)));
A.check("token不對→401，不呼叫AI", r.status === 401 && fakeAI.calls.length === callsBefore, r.status);
// 重新生成上限：同一個nonce最多9次(10.17.5，2026-10-08由5改9)
setNow(8 * DAY); await me(tPay);
const nn = "payregen001"; let lastSt = 0;
for (let i = 0; i < 10; i++) lastSt = (await aiTurn(tPay, { nonce: nn })).status;
A.check("同一回合最多呼叫9次AI，第10次→429", lastSt === 429, lastSt);
// 回顧這一生60點(2026-10-08付費周邊，取代原本的5點)
setNow(9 * DAY); r = await me(tPay); await aiTurn(tPay); // 補到5點後扣1點＝4點
const reviewMsg = JSON.stringify({ stages: [{ stage: "a", stage_label: "高中" }], tidbits: [] });
r = await post("/", { wallet: true, kind: "life_review", life_id: "lifepay01", messages: [{ role: "user", content: reviewMsg }] }, auth(tPay));
A.check("回顧這一生：餘額不足60點→402、不呼叫AI", r.status === 402, r.status);
await post("/account/lives", { op: "add", lid: "lifepay02" }, auth(tPay)); // 第2份啟程禮+55
r = await post("/", { wallet: true, kind: "life_review", life_id: "lifepay01", messages: [{ role: "user", content: reviewMsg }] }, auth(tPay));
A.check("回顧這一生：59點仍不夠60點→402", r.status === 402, r.status);
{ const k = [...env.ACCOUNTS._store.keys()].find(x => x.startsWith("a:") && env.ACCOUNTS._store.get(x).email === "pay@example.com") || [...env.ACCOUNTS._store.keys()].filter(x => x.startsWith("a:")).pop(); const a = env.ACCOUNTS._store.get(k); a.wallet.gift += 11; env.ACCOUNTS._store.set(k, a); }
const before60 = (await me(tPay)).json.account.wallet.total;
r = await post("/", { wallet: true, kind: "life_review", life_id: "lifepay01", messages: [{ role: "user", content: reviewMsg }] }, auth(tPay));
A.check("回顧這一生：成功才扣60點", r.status === 200 && r.json.lifegame.wallet.total === before60 - 60, [r.status, before60, r.json.lifegame]);
// mock模式用的錢包端點
const w0 = (await me(tPay)).json.account.wallet.total;
r = await post("/account/wallet", { op: "charge", nonce: "mockcharge01", life_id: "lifepay01" }, auth(tPay));
const w1 = r.json.wallet.total;
A.check("mock端點charge：扣1點", w1 === w0 - 1, [w0, w1]);
r = await post("/account/wallet", { op: "charge", nonce: "mockcharge01", life_id: "lifepay01" }, auth(tPay));
A.check("mock端點charge：同一nonce只扣一次(重新生成不再扣)", r.json.wallet.total === w1, r.json.wallet);
r = await post("/account/wallet", { op: "charge", nonce: "mockcharge02", life_id: "lifepay01" }, auth(tPay));
const w2 = r.json.wallet.total;
r = await post("/account/wallet", { op: "refund", nonce: "mockcharge02", life_id: "lifepay01" }, auth(tPay));
A.check("mock端點refund：回合失敗→退回這回合扣的1點", r.json.wallet.total === w2 + 1, r.json.wallet);
r = await post("/account/wallet", { op: "spend", n: 5 }, auth(tPay));
A.check("mock端點spend：扣5點", r.json.wallet.total === w2 + 1 - 5, r.json.wallet);
await post("/account/wallet", { op: "spend", n: 50 }, auth(tPay));
r = await post("/account/wallet", { op: "spend", n: 50 }, auth(tPay));
A.check("餘額不足的spend→402、不扣", r.status === 402, r.status);

// ================= 換綁信箱：必須先通過驗證碼 =================
setNow(10 * DAY);
const tKeep = (await bind("old@example.com", "KEY-OLD", [L("lifeold01", 5, 20)])).json.token;
let cc = await code("new@example.com");
r = await post("/account/change-email", { email: "new@example.com", code: "000000" }, auth(tKeep));
A.check("換綁：驗證碼不對→不能換(不能只憑金鑰／登入狀態)", r.status === 400 && r.json.error === "wrong_code", r.json);
r = await post("/account/change-email", { email: "new@example.com", code: cc });
A.check("換綁：沒帶登入token→401", r.status === 401, r.status);
r = await post("/account/change-email", { email: "new@example.com", code: cc }, auth(tKeep));
A.check("換綁：新信箱驗證碼正確→成功", r.status === 200 && r.json.account.email_masked === "ne***@example.com", r.json);
r = await login("new@example.com", []);
A.check("換綁後：用新信箱登入到同一個帳號(錢包相同)", r.status === 200 && r.json.account.wallet.total === (await me(tKeep)).json.account.wallet.total, r.json);
r = await post("/account/login", { email: "old@example.com", code: await code("old@example.com"), lives: [] });
A.check("換綁後：舊信箱沒有帳號了", r.status === 409 && r.json.error === "no_account", r.json);
cc = await code("one@example.com");
r = await post("/account/change-email", { email: "one@example.com", code: cc }, auth(tKeep));
A.check("換綁到已有帳號的信箱→409 email_exists", r.status === 409 && r.json.error === "email_exists", r.json);

// ================= 啟程禮每日上限與排隊 =================
setNow(20 * DAY);
env.DAILY_GIFT_CAP = "2";
const g1 = await bind("g1@example.com", "KEY-G1", [L("lifeg1001", 0, 0)]);
const g2 = await bind("g2@example.com", "KEY-G2", [L("lifeg2001", 0, 10)]);
const g3 = await bind("g3@example.com", "KEY-G3", [L("lifeg3001", 0, 7)]);
const g4 = await bind("g4@example.com", "KEY-G4", [L("lifeg4001", 0, 3)]);
A.check("每日上限2份：前2位綁定領到啟程禮(各+30)", g1.json.result.gift.status === "granted" && g1.json.account.wallet.total === 30 && g2.json.result.gift.status === "granted" && g2.json.account.wallet.total === 40);
A.check("發滿時：第3、4位綁定照常成功，啟程禮排隊(status queued)、錢包沒有增加", g3.status === 200 && g3.json.result.gift.status === "queued" && g3.json.account.wallet.total === 7 && g4.json.result.gift.status === "queued" && g4.json.account.wallet.total === 3 && g3.json.account.gifts.queued === 1 && g3.json.account.gifts.claimed === 0, [g3.json.result, g4.json.result]);
A.check("排隊的人綁定後仍是已綁狀態(有token、有帳號)", !!g3.json.token && !!g3.json.account.aid);
const gnow = (await get("/usage-today", { Authorization: "Bearer admin-secret" })).json;
A.check("/usage-today：今天發了2份、排隊2人、上限2", gnow.gifts.issued === 2 && gnow.gifts.queued === 2 && gnow.gifts.cap === 2, gnow.gifts);
r = await me(g3.json.token);
A.check("同一天內排隊的人不會被補發(要等隔天午夜後)", r.json.account.wallet.total === 7 && r.json.account.gifts.queued === 1, r.json.account);
setNow(21 * DAY + 5 * MIN); // 隔天台灣時間午夜過後
const g5 = await bind("g5@example.com", "KEY-G5", [L("lifeg5001", 0, 0)]); // 隔天有人新綁定：要排在補發的後面
r = await me(g4.json.token);
A.check("隔天午夜後：排隊者依綁定順序補發，補發一樣+30點", r.json.account.wallet.total === 33 && evTypes(r) === "啟程禮補發:30" && r.json.account.gifts.claimed === 1 && r.json.account.gifts.queued === 0, r.json);
r = await me(g3.json.token);
A.check("隔天：先綁的g3也已補發30點(記為「啟程禮補發」)", r.json.account.wallet.total === 37 && evTypes(r) === "啟程禮補發:30", r.json);
A.check("隔天：排在補發後面的新綁定者g5，當天2份上限已被補發用完→排隊", g5.json.result.gift.status === "queued" && g5.json.account.wallet.total === 0, g5.json.result);
setNow(22 * DAY + 5 * MIN);
r = await me(g5.json.token);
A.check("再隔天：g5也補發30點", r.json.account.wallet.total === 30 && evTypes(r).startsWith("啟程禮補發:"), r.json);
// 第2份也排隊，補發記為「啟程禮補發」
setNow(30 * DAY);
env.DAILY_GIFT_CAP = "1";
const h1 = await bind("h1@example.com", "KEY-H1", [L("lifeh1001", 0, 0)]);
const h2 = await bind("h2@example.com", "KEY-H2", [L("lifeh2001", 0, 0)]);
r = await post("/account/lives", { op: "add", lid: "lifeh1002" }, auth(h1.json.token));
A.check("第2份啟程禮遇到當天發滿→開第2段人生照常成功、啟程禮排隊", r.status === 200 && r.json.result.gift.status === "queued" && r.json.account.lives.length === 2 && r.json.account.wallet.total === 30, r.json);
setNow(31 * DAY + 5 * MIN);
r = await me(h2.json.token);
A.check("(隔天先補發最早排隊的h2的第1份)", evTypes(r).startsWith("啟程禮補發:") && r.json.account.wallet.total === 30, r.json);
setNow(32 * DAY + 5 * MIN);
r = await me(h1.json.token);
A.check("(再隔天補發h1的第2份：直接+55，記為「啟程禮補發」)", evTypes(r) === "啟程禮補發:55" && r.json.account.wallet.total === 85 && r.json.account.gifts.claimed === 2, r.json);
delete env.DAILY_GIFT_CAP;
process.exit(A.report() ? 0 : 1);
