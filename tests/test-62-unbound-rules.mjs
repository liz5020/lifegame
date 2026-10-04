// 2026-09-30(第三批，使用者決定)：未綁信箱啟程禮25點且每台裝置只領1次、同時只能1段人生；綁定+30；正式網址預設真AI（假上游、假Resend，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("未綁25點／1段人生／綁定+30／正式網址預設");
const fake = H.makeFakeAnthropic(); const resend = H.makeFakeResend();
H.installUpstream(fake, resend);
const env = await H.makeAccountEnv({ CLOUD_SAVE_ENABLED: "false" });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return v; await wait(15); } return false; }

// ---- 未綁：25點、只領1次、同時只能1段 ----
const g = await H.loadGame({ useMock: true, env, key: "unb0000001", cloud: false, storage: { life_sim_age_confirmed: "yes", life_sim_recovery_key: "unb0000001", life_sim_active_slot: "0", lifegame_cloud_save: "off" } });
await H.startNewLife(g, { name: "第一段" });
A.check("未綁新人生的啟程禮＝25點(每日5＋啟程禮25＝30)", g.ev("state.ap.gift") === 25 && g.ev("totalAP(state)") === 30 && g.ev("AP_UNBOUND_GIFT") === 25, g.ev("JSON.stringify(state.ap)"));
A.check("啟程禮常數：綁定+30、第2段人生+55、每把金鑰只領1次", g.ev("AP_BIND_BONUS") === 30 && g.ev("AP_SECOND_LIFE_GIFT") === 55 && g.ev("AP_GIFT_CLAIMS_PER_KEY") === 1);
A.check("25點約走到寒假：上學期27回合的寒假從第20回合開始(依設計文件2.2)，25點＋開場免費 ≥ 寒假", 3 + 6 + 1 + 2 + 6 + 1 === 19);
g.ev("state = {phase:'home'}; render()");
await g.ev("startNewLifeFromHome()");
A.check("未綁已有1段人生：按開始新人生→被擋在選格子畫面，提示只能1段、綁定後可2段", g.ev("state.phase") === "slotPicker" && g.ev("state.notice") === "未綁定信箱時只能同時進行 1 段人生。綁定信箱後可以同時進行 2 段。", g.ev("state.notice"));
g.ev("document.querySelector('.slot-btn[data-action=\"new\"]').click()");
await wait(30);
A.check("選格子畫面按空格子也一樣被擋，沒有進到建角畫面", g.ev("state.phase") === "slotPicker" && /只能同時進行 1 段人生/.test(g.ev("state.notice")));
// 同一台裝置第2次領啟程禮：不發(本機計數已是1次)
const claim2 = await g.ev("claimNewLifeGift(localStorage.getItem(RECOVERY_KEY_STORAGE_NAME), 1).then(r=>r.granted)");
A.check("同一台裝置第2次領啟程禮：不發", claim2 === false);
// 已結束的人生騰出格子後可以再開新的(只是不再發啟程禮)
g.ev("localStorage.setItem('life_sim_active_slot','0'); state = JSON.parse(localStorage.getItem('life_sim_save_v1:0'))");
await g.ev("endLife('deleted')"); await wait(50);
g.ev("state = {phase:'home'}; render()");
await g.ev("startNewLifeFromHome()");
A.check("人生結束後(沒有進行中的人生)可以開新的一段", g.ev("state.phase") === "identity", g.ev("state.phase"));
await H.startNewLife(g, { name: "第二段" });
A.check("再開的新人生不再發啟程禮(每台裝置只領1次)：只有每日5點", g.ev("state.ap.gift") === 0 && g.ev("totalAP(state)") === 5, g.ev("JSON.stringify(state.ap)"));
// 登入帳號後不受未綁限制(帳號自己有2段上限)
g.ev("acct = { aid:'a1', email_masked:'x***@y.z', recovery_key:'K', wallet:{free:10,purchased:0,total:10,refill_cap:5}, lives:[], gifts:{claimed:1,queued:0,max:2} }");
A.check("已登入帳號：不套用「未綁只能1段」，改看帳號人生數", g.ev("unboundFullNotice()") === null && g.ev("acctFullNotice()") === null);
g.ev("acct = null");

// ---- Worker：綁定固定+30、不看剩下的點數 ----
const post = (path, body, headers) => H.callWorker(env, { path, body, headers });
let ip = 0;
async function bind(email, key, lives) { await post("/account/send-code", { email }, { "CF-Connecting-IP": "9.9." + (++ip) + ".1" }); return (await post("/account/bind", { email, code: resend.lastCode(email), key, lives })).json; }
let r = await bind("u1@example.com", "UK1", [{ lid: "lifeu1a1", pool: { daily: 5, gift: 25 } }]);
A.check("綁定：剩下30點(每日5＋啟程禮25)＋固定+30＝60點，明細「啟程禮 +30」", r.account.wallet.total === 60 && r.result.gift.added === 30 && r.events.some(e => e.type === "啟程禮" && e.n === 30), r);
r = await bind("u2@example.com", "UK2", [{ lid: "lifeu2a1", pool: { daily: 0, gift: 0 } }]);
A.check("綁定：點數剛好用光的人＝25(已用掉)＋30，錢包30點", r.account.wallet.total === 30, r.account.wallet);

// ---- 正式網址預設真AI ----
const off = await H.loadGame({ useMock: true, env, key: null, cloud: false, host: "lifegame-6an.pages.dev" });
A.check("正式網址(lifegame-6an.pages.dev)沒有旗標：預設真AI，不顯示示範模式", off.ev("USE_MOCK") === false && off.ev("isOfficialHost()") === true);
const dml = await H.loadGame({ useMock: true, env, key: null, cloud: false, host: "draftmylife.com" });
A.check("正式網域(draftmylife.com，2026-10-04)沒有旗標：預設真AI、分享連結用新網域", dml.ev("USE_MOCK") === false && dml.ev("isOfficialHost()") === true && dml.ev("SHARE_URL") === "https://draftmylife.com/");
const offMock = await H.loadGame({ useMock: true, env, key: null, cloud: false, host: "lifegame-6an.pages.dev", storage: { lifegame_force_real_api: "no" } });
A.check("正式網址＋旗標no：開發者切到示範模式", offMock.ev("USE_MOCK") === true);
const other = await H.loadGame({ useMock: true, env, key: null, cloud: false });
A.check("其他網址(本機、預覽、測試)沒有旗標：預設示範模式", other.ev("USE_MOCK") === true && other.ev("isOfficialHost()") === false);
const otherReal = await H.loadGame({ useMock: true, env, key: null, cloud: false, storage: { lifegame_force_real_api: "yes" } });
A.check("其他網址＋旗標yes：真AI(原本的手動開法不變)", otherReal.ev("USE_MOCK") === false);
offMock.ev("setApiMode(false)");
A.check("開發者切到真AI寫旗標yes；正式網址切回示範寫旗標no(否則又回到預設真AI)", offMock.ev("localStorage.getItem('lifegame_force_real_api')") === "yes" && (offMock.ev("setApiMode(true)"), offMock.ev("localStorage.getItem('lifegame_force_real_api')") === "no"));
other.ev("setApiMode(false)"); other.ev("setApiMode(true)");
A.check("其他網址切回示範＝移除旗標", other.ev("localStorage.getItem('lifegame_force_real_api')") === null);
process.exit(A.report() ? 0 : 1);
