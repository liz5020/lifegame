// 2026-10-09：十、10.3.12「不扣行動點」擴及帳號錢包——伺服器測試帳號名單AP_TEST_ACCOUNTS（全程假Resend、假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.3.12 測試帳號不扣行動點");
const resend = H.makeFakeResend();
H.installUpstream(H.makeFakeAnthropic({}), resend);

const env = await H.makeAccountEnv({ AP_TEST_ACCOUNTS: " Me@Example.com , other-tester@example.com" });
const post = (path, body, headers) => H.callWorker(env, { path, body, headers });
const auth = t => ({ Authorization: "Bearer " + t });
let ipn = 0;
async function bind(email, key) {
  await post("/account/send-code", { email }, { "CF-Connecting-IP": "10.8." + (++ipn) + ".1" });
  return (await post("/account/bind", { email, code: resend.lastCode(email.toLowerCase()), key, lives: [] })).json;
}
const payload = JSON.stringify({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false });
let seq = 0;
const turn = (token, free) => post("/", Object.assign({ wallet: true, turn_nonce: "tn" + (++seq) + "zzzzzzz", life_id: "lifetest01", messages: [{ role: "user", content: payload }] }, free ? { ap_test_free: true } : {}), auth(token));

const me = await bind("me@example.com", "KEY-ME");
const other = await bind("player@example.com", "KEY-PLAYER");
const w0 = me.account.wallet.total, o0 = other.account.wallet.total;

let r = await turn(me.token, true);
A.check("名單上的帳號(大小寫、空白不影響)開開關：不扣點、回報開關有效", r.status === 200 && r.json.lifegame.ap_test_free === true && r.json.lifegame.charged === false && r.json.lifegame.wallet.total === w0, r.json.lifegame);
r = await turn(me.token, true);
A.check("連續兩回合都不扣", r.json.lifegame.wallet.total === w0, r.json.lifegame.wallet);
r = await turn(me.token, false);
A.check("名單上的帳號沒開開關：照常扣1點、不回報開關欄位", r.json.lifegame.charged === true && r.json.lifegame.wallet.total === w0 - 1 && !("ap_test_free" in r.json.lifegame), r.json.lifegame);
r = await turn(other.token, true);
A.check("名單外的帳號開開關：照常扣點、回報開關無效", r.json.lifegame.ap_test_free === false && r.json.lifegame.charged === true && r.json.lifegame.wallet.total === o0 - 1, r.json.lifegame);
delete env.AP_TEST_ACCOUNTS;
r = await turn(me.token, true);
A.check("沒設定AP_TEST_ACCOUNTS：名單上的帳號也照常扣點", r.json.lifegame.ap_test_free === false && r.json.lifegame.wallet.total === w0 - 2, r.json.lifegame);

// ---------- 前端：帳號錢包(真實模式)時看伺服器認不認 ----------
const g = await H.loadGame({ useMock: false, env: H.makeEnv({ CLOUD_SAVE_ENABLED: "false" }), cloud: false, key: "aptestacct1", dev: true }); // 正式網址現況：雲端暫停
await H.startNewLife(g);
const ev = g.ev;
ev("setApTestFree(true)");
A.check("本機點數：開關直接生效", ev("apTestFreeActive()") === true && ev("apTestFreeServerDecides()") === false);
ev("window.__wa = walletActive; walletActive = () => true");
A.check("帳號錢包(真實模式)：伺服器決定；還沒回報前先當有效", ev("apTestFreeServerDecides()") === true && ev("apTestFreeActive()") === true);
ev("apTestFreeRefused = true");
A.check("伺服器回報無效：開關失效", ev("apTestFreeActive()") === false);
ev("renderTestMenuModal()");
const note = g.win.document.getElementById("test-menu-modal").textContent;
A.check("測試選單提示「這個帳號不是測試帳號」", note.includes("這個帳號不是測試帳號，開關無效"), note.slice(0, 300));
ev("walletActive = window.__wa; setApTestFree(false)");
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));

process.exit(A.report() ? 0 : 1);
