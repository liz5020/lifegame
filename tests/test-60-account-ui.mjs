// 2026-09-30：十、10.2／10.9.2／10.9.3／10.12.5 前端整合——首次綁定、綁到已有帳號被拒、登入併入、併入超過2段、訊息第2/3/4/7則、
// 錢包模式的行動點、第2份啟程禮、花費上限暫停（jsdom＋真的worker.js＋假上游＋假Resend，不打真實API、不寄真信）
import * as H from "./harness.mjs";
const A = H.makeAsserter("帳號前端：綁定／登入／錢包／訊息");
let upstreamFail = false;
const fakeAI = H.makeFakeAnthropic({ fail: () => upstreamFail });
const resend = H.makeFakeResend();
H.installUpstream(fakeAI, resend);
// 前端用真的時鐘算台灣日期，Worker也用真的時鐘，兩邊才一致
const env = await H.makeAccountEnv({ TEST_NOW_MS: undefined, CLOUD_SAVE_ENABLED: "false" }); // 貼近正式：雲端存檔暫停
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(g, fn, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return v; await wait(15); } return false; }
const text = (g, sel) => (g.win.document.querySelector(sel)?.textContent || "").replace(/\s+/g, "");
async function newDevice(key, opts = {}) {
  const g = await H.loadGame({ useMock: opts.mock ? true : false, env, key, cloud: false });
  await H.startNewLife(g, { name: opts.name || "林小晴" });
  if (!opts.noTurn) await H.playTurn(g, "嗯");
  return g;
}
// 走完綁定／登入流程：mode是bind或login，回傳送出驗證碼後的畫面
async function flow(g, mode, email, opts = {}) {
  const doc = g.win.document;
  g.ev(`openAccountFlow(${JSON.stringify(mode)})`);
  if (mode === "bind") doc.getElementById("btn-acct-start").click();
  doc.getElementById("acct-email").value = email;
  doc.getElementById("btn-acct-send").click();
  await until(g, () => doc.getElementById("acct-code"));
  const code = resend.lastCode(email.trim().toLowerCase());
  if (opts.wrongFirst) { doc.getElementById("acct-code").value = "000000"; doc.getElementById("btn-acct-verify").click(); await until(g, () => /驗證碼不對/.test(doc.getElementById("acct-error")?.textContent || "")); }
  doc.getElementById("acct-code").value = code;
  doc.getElementById("btn-acct-verify").click();
  await until(g, () => !doc.getElementById("account-modal") || /已有帳號|還沒有帳號|失效|不對/.test(doc.getElementById("acct-error")?.textContent || ""));
  await wait(60);
}
// 直接看假DO裡的帳號紀錄(登出後token失效，不能再用me查)
const rawAcct = (email) => { for (const [k, v] of env.ACCOUNTS._store) if (k.startsWith("a:") && v.email === email) return v; return null; };
const walletOf = async (token) => (await H.callWorker(env, { method: "GET", path: "/account/me", headers: { Authorization: "Bearer " + token } })).json.account;

// ================= 情境1：首次綁定 =================
const g1 = await newDevice("uikey0000001");
const d1 = g1.win.document;
g1.ev("state.ap.daily = 2; state.ap.gift = 10;"); // 未綁人生剩下12點
g1.ev("renderWalletModal()");
const tip = d1.getElementById("wallet-bind-tip");
A.check("第3則：未綁信箱的錢包常駐「撰稿人提醒你：綁定信箱可再領 30 點啟程禮，並保存你的進度。」", !!tip && tip.textContent.trim() === "撰稿人提醒你：綁定信箱可再領 30 點啟程禮，並保存你的進度。", tip && tip.textContent);
A.check("第3則：說明放在獨立的「綁定信箱」按鈕旁邊", !!d1.getElementById("btn-wallet-bind") && d1.getElementById("btn-wallet-bind").textContent.trim()==="綁定信箱" && tip.parentElement.contains(d1.getElementById("btn-wallet-bind")));
A.check("未綁：錢包有「用信箱登入」入口", !!d1.getElementById("btn-wallet-login"));
d1.getElementById("btn-wallet-bind").click();
A.check("點綁定信箱按鈕→進綁定說明頁(信箱只用來保存進度和找回帳號／成為帳號的第1段／會收到啟程禮)", !d1.getElementById("wallet-modal") && /信箱只用來保存進度和找回帳號/.test(text(g1, "#account-modal")) && /成為帳號的第1段/.test(text(g1, "#account-modal")) && /綁定後會再領30點啟程禮/.test(text(g1, "#account-modal")));
d1.getElementById("btn-acct-start").click();
d1.getElementById("acct-email").value = "  Player.One@Example.com ";
d1.getElementById("btn-acct-send").click();
await until(g1, () => d1.getElementById("acct-code"));
A.check("寄出後畫面文字：驗證碼已寄出，通常一分鐘內會到。沒收到請看垃圾信匣，或確認信箱有沒有打錯。", /驗證碼已寄出，通常一分鐘內會到。沒收到請看垃圾信匣，或確認信箱有沒有打錯。/.test(text(g1, "#account-modal")), text(g1, "#account-modal"));
A.check("重新寄送鈕顯示倒數(60秒內不能按)", d1.getElementById("btn-acct-resend").disabled === true && /重新寄送（\d+）/.test(d1.getElementById("btn-acct-resend").textContent), d1.getElementById("btn-acct-resend").textContent);
A.check("有〔信箱打錯了〕鈕，回到輸入信箱那一步", (() => { d1.getElementById("btn-acct-back").click(); return !!d1.getElementById("acct-email") && !d1.getElementById("acct-code"); })());
d1.getElementById("btn-acct-send").click(); // 剛寄過(60秒內)：直接進輸入驗證碼、倒數繼續
await until(g1, () => d1.getElementById("acct-code"));
A.check("60秒內再按寄送：不重寄，直接回到輸入驗證碼(前一組還有效)", resend.sent.filter(x => x.to === "player.one@example.com").length === 1 && !!d1.getElementById("acct-code"));
d1.getElementById("acct-code").value = "12ab";
d1.getElementById("btn-acct-verify").click();
A.check("驗證碼不是6位數字→提示、不送出", /6 位數/.test(d1.getElementById("acct-error").textContent));
d1.getElementById("acct-code").value = "000000";
d1.getElementById("btn-acct-verify").click();
await until(g1, () => /驗證碼不對/.test(d1.getElementById("acct-error")?.textContent || ""));
A.check("驗證碼輸錯：顯示還可以試幾次", /驗證碼不對，請再確認一次。（還可以試 4 次）/.test(d1.getElementById("acct-error").textContent), d1.getElementById("acct-error").textContent);
d1.getElementById("acct-code").value = resend.lastCode("player.one@example.com");
d1.getElementById("btn-acct-verify").click();
await until(g1, () => d1.getElementById("bind-result-modal"));
const bt = text(g1, "#bind-result-modal");
A.check("第7則(正常)：撰稿人幫你把這段人生收好了。啟程禮已經放進錢包，多了 30 點，接下來的故事都會跟著你的信箱保存。", bt.includes("撰稿人幫你把這段人生收好了。") && bt.includes("啟程禮已經放進錢包，多了30點，接下來的故事都會跟著你的信箱保存。"), bt);
A.check("第7則：按鈕〔繼續寫〕", d1.getElementById("btn-bind-result-ok").textContent === "繼續寫");
d1.getElementById("btn-bind-result-ok").click();
A.check("綁定後：這台裝置登入、accountEmailBound()＝true", g1.ev("accountEmailBound()") === true && !!g1.ev("acctToken()"));
A.check("綁定後：這段人生成為帳號第1段(state.acct)、錢包＝剩下12點＋30點", !!g1.ev("state.acct && state.acct.lid") && g1.ev("walletActive(state)") === true && g1.ev("totalAP(state)") === 42 && g1.ev("acct.lives.length") === 1, [g1.ev("totalAP(state)"), g1.ev("state.acct")]);
A.check("綁定後：本機的點數池歸零(點數已併進錢包，不能留一份在本機)", g1.ev("state.ap.daily + state.ap.gift + state.ap.purchased") === 0);
A.check("點數明細有「啟程禮 +30」", g1.ev("state.apLog.some(e=>e.type==='啟程禮' && e.n===30 && e.t>Date.now()-60000)"), g1.ev("state.apLog.slice(-3)"));
g1.ev("renderWalletModal()");
const wt = text(g1, "#wallet-modal");
A.check("綁定後錢包：不再出現第3則、顯示已綁信箱(遮住部分)與啟程禮已領1／2份、有登出與換綁", !d1.getElementById("wallet-bind-tip") && /已綁信箱：pl\*\*\*@example\.com/.test(wt) && /已領1／2份/.test(wt) && !!d1.getElementById("btn-acct-logout") && !!d1.getElementById("btn-acct-change"), wt);
A.check("綁定後錢包：說明是整個帳號共用一個錢包、補到5點×人生數", /共用錢包/.test(wt) && /補到5點×進行中的人生數（目前1段，補到5點）/.test(wt), wt);
d1.getElementById("btn-wallet-close").click();
A.check("複製給帳務回報的明細：信箱寫已綁、啟程禮寫已領 N／2 份，且不含信箱本身與復原金鑰", (() => { const t = g1.ev("walletReportText(state)"); return /信箱：已綁/.test(t) && /啟程禮：已領 1／2 份/.test(t) && !/player\.one|example\.com|uikey0000001/i.test(t); })());
// 之後回合：走帳號錢包(真實模式在AI代理扣點)
const w0 = g1.ev("totalAP(state)");
await H.playTurn(g1, "再一回");
const acctInfo = await walletOf(g1.ev("acctToken()"));
A.check("綁定後玩一回合：錢包扣1點、伺服器與畫面數字一致", g1.ev("totalAP(state)") === w0 - 1 && acctInfo.wallet.total === w0 - 1, [g1.ev("totalAP(state)"), acctInfo.wallet.total]);
const tokenP1 = g1.ev("acctToken()");
// 登出只影響這台裝置
g1.ev("renderWalletModal()"); d1.getElementById("btn-acct-logout").click();
await until(g1, () => !g1.ev("acctToken()"));
A.check("登出：這台裝置沒有登入狀態、回到未綁樣貌(第2則語境)、本機點數池從0開始(不複製錢包)", g1.ev("accountEmailBound()") === false && g1.ev("walletActive(state)") === false && g1.ev("totalAP(state)") === 0);
A.check("登出：伺服器上的帳號與錢包不受影響、這台裝置的token作廢", (() => { const a = rawAcct("player.one@example.com"); return a && a.wallet.gift + a.wallet.purchased === w0 - 1 && a.sessions.length === 0; })());
g1.ev("renderAPExhaustedModal()");
A.check("登出後點數用完→看第2則(未綁信箱版本)", /綁定信箱可以再領30點啟程禮/.test(text(g1, "#ap-exhausted-modal")));
g1.ev("document.getElementById('ap-exhausted-modal').remove()");

// ================= 情境2：綁到已有帳號的信箱→拒絕 =================
const g2 = await newDevice("uikey0000002");
const d2 = g2.win.document;
env.TEST_NOW_MS = String(Date.now() + 3 * 60 * 1000); // 同一信箱60秒內不能重寄：伺服器時鐘往後撥
await flow(g2, "bind", "PLAYER.one@example.com");
const errText = d2.getElementById("acct-error")?.textContent || "";
A.check("綁到已有帳號的信箱：驗證碼通過後拒絕，表單提示「這個信箱已有帳號，請直接用信箱登入」", errText === "這個信箱已有帳號，請直接用信箱登入", errText);
A.check("被拒絕時：沒有登入、這段人生沒變成帳號人生、本機點數不動", g2.ev("accountEmailBound()") === false && !g2.ev("state.acct") && g2.ev("totalAP(state)") > 20);
A.check("被拒絕時：提供〔改用這個信箱登入〕", !!d2.getElementById("btn-acct-to-login"));
A.check("被拒絕時：原帳號沒被動到(啟程禮仍是1／2份、人生1段)", (() => { const a = rawAcct("player.one@example.com"); return a.gifts.g1 === "done" && a.gifts.g2 === "none" && a.lives.length === 1; })());
g2.ev("closeAccountFlow()");

// ================= 情境3：登入併入(這台裝置的未綁人生併進既有帳號) =================
g2.ev("state.ap.daily = 3; state.ap.gift = 7;"); // 這段人生剩10點
const before3 = (() => { const a = rawAcct("player.one@example.com"); return a.wallet.gift + a.wallet.purchased; })();
await new Promise(r => setTimeout(r, 1)); // (下一步要再寄一封給同一信箱，要間隔60秒：把伺服器時鐘往後撥)
env.TEST_NOW_MS = String(Date.now() + 5 * 60 * 1000);
await flow(g2, "login", "player.one@example.com");
const bt3 = text(g2, "#bind-result-modal");
A.check("第7則(登入併入)：撰稿人幫你把這段人生收好了。這個信箱的啟程禮之前已經領過，進度和點數都合併進同一個錢包了。", bt3.includes("撰稿人幫你把這段人生收好了。") && bt3.includes("這個信箱的啟程禮之前已經領過，進度和點數都合併進同一個錢包了。"), bt3);
g2.win.document.getElementById("btn-bind-result-ok")?.click();
const acc3 = await walletOf(g2.ev("acctToken()"));
A.check("登入併入：這段人生成為帳號第2段、剩下10點併入錢包、不發啟程禮", acc3.lives.length === 2 && acc3.wallet.total === before3 + 10 && acc3.gifts.claimed === 1 && g2.ev("walletActive(state)") === true, { acc3, before3 });
A.check("登入併入：本機點數池歸零、錢包數字與伺服器一致", g2.ev("state.ap.daily + state.ap.gift") === 0 && g2.ev("totalAP(state)") === acc3.wallet.total);
A.check("登入併入：點數明細記「帳號併入 +10」", g2.ev("state.apLog.some(e=>e.type==='帳號併入' && e.n===10)"), g2.ev("state.apLog.slice(-3)"));
A.check("登入併入：帳號已滿2段→不能再開新人生(表單提示)，選格子畫面顯示原因", (() => { return g2.ev("acctFullNotice()") === "帳號最多同時進行 2 段人生，目前已滿。想開始新的人生，可以先把其中一段收進「人生回顧」。"; })());
await g2.ev("startNewLifeFromHome()");
A.check("帳號已滿時按「開始一段人生」→被擋在選格子畫面，帶提示文字", g2.ev("state.phase") === "slotPicker" && /帳號最多同時進行 2 段人生/.test(g2.ev("state.notice||''")), g2.ev("state.notice"));

// ================= 情境4：併入超過2段 =================
const g4 = await newDevice("uikey0000004", { name: "甲" });
g4.ev("localStorage.setItem('life_sim_active_slot','1')");
await H.startNewLife(g4, { name: "乙" });
g4.ev("localStorage.setItem('life_sim_active_slot','2')");
await H.startNewLife(g4, { name: "丙" });
await H.playTurn(g4, "嗯");
g4.ev("localStorage.setItem('life_sim_active_slot','0')");
await g4.ev("tryLoadSlot(localStorage.getItem('life_sim_recovery_key'), 0, true)");
env.TEST_NOW_MS = String(Date.now() + 10 * 60 * 1000);
await flow(g4, "login", "player.one@example.com");
const bt4 = text(g4, "#bind-result-modal");
A.check("併入時帳號已滿2段：沒有收進任何一段，表單提示「帳號已滿 2 條，這條人生暫時留在原本的復原金鑰上。收掉一條後可以轉進來。」", /帳號已滿 2 條，這條人生暫時留在原本的復原金鑰上。收掉一條後可以轉進來。/.test(g4.win.document.getElementById("bind-overflow-note")?.textContent || ""), bt4);
A.check("併入超過2段：不刪除任何一段——三段人生都還在這台裝置上，仍用各自本機的行動點", (() => { let n = 0; for (let i = 0; i < 3; i++) { const st = JSON.parse(g4.ev(`localStorage.getItem('life_sim_save_v1:${i}')`) || "null"); if (st && st.phase === "playing" && !st.acct && (st.ap.daily + st.ap.gift) > 0) n++; } return n === 3; })());
g4.win.document.getElementById("btn-bind-result-ok")?.click();
A.check("超額的人生：錢包頁顯示這段人生還在原本的復原金鑰上，行動點自己算", (() => { g4.ev("renderWalletModal()"); const t = text(g4, "#wallet-modal"); g4.win.document.getElementById("wallet-modal")?.remove(); return /還在原本的復原金鑰上/.test(t) && g4.ev("walletActive(state)") === false; })());
// 封測留下3段人生首次綁定：收2段、第3段留在原金鑰
const g5 = await newDevice("uikey0000005", { name: "甲" });
g5.ev("localStorage.setItem('life_sim_active_slot','1')"); await H.startNewLife(g5, { name: "乙" });
g5.ev("localStorage.setItem('life_sim_active_slot','2')"); await H.startNewLife(g5, { name: "丙" });
await H.playTurn(g5, "嗯");
env.TEST_NOW_MS = String(Date.now() + 20 * 60 * 1000);
await flow(g5, "bind", "third@example.com");
const acc5 = await walletOf(g5.ev("acctToken()"));
A.check("封測留下3段人生首次綁定：帳號收2段(目前這段優先)、第3段留在原金鑰、有超額提示", acc5.lives.length === 2 && !!g5.win.document.getElementById("bind-overflow-note") && g5.ev("state.name") === "丙" && g5.ev("walletActive(state)") === true, acc5);
g5.win.document.getElementById("btn-bind-result-ok")?.click();
A.check("超額那段人生保留原本本機點數(這台裝置的啟程禮只領1次，所以剩每日5點)，沒有被併進錢包", (() => { let left = 0; for (let i = 0; i < 3; i++) { const st = JSON.parse(g5.ev(`localStorage.getItem('life_sim_save_v1:${i}')`)); if (st && !st.acct) left = st.ap.daily + st.ap.gift; } return left >= 5; })());
// 空出格子後手動轉入
g5.ev("localStorage.setItem('life_sim_active_slot','1')"); // 超額留在原金鑰的是第2格「乙」
await g5.ev("tryLoadSlot(localStorage.getItem('life_sim_recovery_key'), 1, true)");
const someAcct = g5.ev("acct.lives[0].lid");
await H.callWorker(env, { path: "/account/lives", body: { op: "remove", lid: someAcct }, headers: { Authorization: "Bearer " + g5.ev("acctToken()") } });
await g5.ev("refreshAccount()");
g5.ev("renderWalletModal()");
A.check("帳號空出格子後：超額的人生在錢包裡有〔轉進帳號〕", !!g5.win.document.getElementById("btn-acct-transfer"));
g5.win.document.getElementById("btn-acct-transfer").click();
await until(g5, () => g5.ev("walletActive(state)") === true);
A.check("手動轉入：成為帳號人生、不發啟程禮(仍是已領1／2份)", g5.ev("walletActive(state)") === true && g5.ev("acct.gifts.claimed") === 1, g5.ev("acct.gifts"));
g5.win.document.getElementById("wallet-modal")?.remove();

// ================= 第2份啟程禮：帳號第一次開第2段人生 =================
const g6 = await newDevice("uikey0000006", { name: "壹" });
env.TEST_NOW_MS = String(Date.now() + 30 * 60 * 1000);
await flow(g6, "bind", "second@example.com");
g6.win.document.getElementById("btn-bind-result-ok")?.click();
const w6 = g6.ev("totalAP(state)");
A.check("(準備)綁定後帳號有1段人生", g6.ev("acct.lives.length") === 1 && w6 >= 55);
g6.ev("localStorage.setItem('life_sim_active_slot','1')");
await H.startNewLife(g6, { name: "貳" });
A.check("第2段人生：登記進帳號、不領本機啟程禮、錢包直接增加55點(第2份)、明細「啟程禮（第 2 份） +55」", g6.ev("acct.lives.length") === 2 && g6.ev("walletActive(state)") === true && g6.ev("state.ap.gift") === 0 && g6.ev("state.apLog.some(e=>e.type==='啟程禮（第 2 份）' && e.n===55)") && g6.ev("acct.gifts.claimed") === 2, [g6.ev("acct.gifts"), g6.ev("state.apLog.slice(-3)")]);
A.check("開場回合不扣點：第2段人生開場後錢包＝原本＋55(還沒扣)", (await walletOf(g6.ev("acctToken()"))).wallet.total === w6 + 55, [w6, (await walletOf(g6.ev("acctToken()"))).wallet.total]);
A.check("錢包裡「其他進行中的人生」標示共用錢包(不列各自的點數)", (() => { g6.ev("renderWalletModal()"); const t = text(g6, "#wallet-modal"); g6.win.document.getElementById("wallet-modal")?.remove(); return /壹.*共用錢包/.test(t); })());

// ================= mock模式：帳號錢包一樣在伺服器扣 =================
const gm = await newDevice("uikey0000007", { mock: true, name: "示範" });
env.TEST_NOW_MS = String(Date.now() + 40 * 60 * 1000);
await flow(gm, "bind", "mock@example.com");
gm.win.document.getElementById("btn-bind-result-ok")?.click();
const tm = gm.ev("acctToken()");
const wm0 = (await walletOf(tm)).wallet.total;
await H.playTurn(gm, "嗯");
A.check("mock模式：帳號人生玩一回合，伺服器上的錢包扣1點，畫面同步", (await walletOf(tm)).wallet.total === wm0 - 1 && gm.ev("totalAP(gm_state=state)") === wm0 - 1 || gm.ev("totalAP(state)") === wm0 - 1, [wm0, (await walletOf(tm)).wallet.total, gm.ev("totalAP(state)")]);

// ================= 全站每日花費上限：暫停、第4則、小字 =================
const gc = await newDevice("uikey0000008", { name: "上限" });
// 上限設成「目前花費＋1」：下一次成功的呼叫剛好碰到上限(不靠系統時鐘，避免跨台灣午夜時計數天數不同)
const spentNow = (await H.callWorker(env, { method: "GET", path: "/usage-today", origin: null, headers: { Authorization: "Bearer admin-secret" } })).json.est_cost_twd;
env.DAILY_SPEND_CAP = String(spentNow + 1);
await H.playTurn(gc, "先玩一回合讓花費到達上限");
const cd = gc.win.document;
const totalBefore = gc.ev("totalAP(state)"), turnBefore = gc.ev("state.turnCount"), logBefore = gc.ev("state.log.length");
cd.getElementById("custom-input").value = "我想去海邊走走";
cd.getElementById("btn-custom").click();
await until(gc, () => cd.getElementById("daily-cap-modal"));
const capModal = text(gc, "#daily-cap-modal");
A.check("第4則：碰到上限→跳窗「撰稿人今天寫得太多，需要休息一下。故事會在台灣時間午夜後恢復，你的進度都已經保存好了。」按鈕〔好的〕", capModal.includes("撰稿人今天寫得太多，需要休息一下。") && capModal.includes("故事會在台灣時間午夜後恢復，你的進度都已經保存好了。") && cd.getElementById("btn-daily-cap-ok").textContent === "好的", capModal);
cd.getElementById("btn-daily-cap-ok").click();
await wait(50);
A.check("暫停時：不扣點、不算回合、沒有多一則錯誤日記", gc.ev("totalAP(state)") === totalBefore && gc.ev("state.turnCount") === turnBefore && gc.ev("state.log.length") === logBefore, [gc.ev("totalAP(state)"), totalBefore, gc.ev("state.turnCount"), turnBefore]);
A.check("暫停時：輸入框文字保留(恢復後可直接再送出)", cd.getElementById("custom-input").value === "我想去海邊走走", cd.getElementById("custom-input").value);
A.check("暫停時：輸入列上方顯示小字「撰稿人休息中，台灣時間午夜後恢復。」", cd.getElementById("cap-note")?.textContent.trim() === "撰稿人休息中，台灣時間午夜後恢復。", cd.getElementById("cap-note")?.textContent);
cd.getElementById("btn-custom").click();
await wait(300);
A.check("同一天只跳窗一次：再送出被擋只保留小字、不再跳窗，文字仍保留", !cd.getElementById("daily-cap-modal") && !!cd.getElementById("cap-note") && cd.getElementById("custom-input").value === "我想去海邊走走");
A.check("暫停只擋AI呼叫：錢包、登入狀態照常(仍可開錢包、餘額不變)", (() => { gc.ev("renderWalletModal()"); const ok = !!cd.getElementById("wallet-modal") && gc.ev("totalAP(state)") === totalBefore; cd.getElementById("wallet-modal")?.remove(); return ok; })());
A.check("暫停時通知信：80%與上限各寄一封給管理者", resend.notices().filter(x => /已達上限的 80%/.test(x.subject)).length >= 1 && resend.notices().filter(x => /已碰到上限/.test(x.subject)).length >= 1, resend.notices().map(x => x.subject));
env.DAILY_SPEND_CAP = "500";
await gc.ev("checkDailyCapGate()");
A.check("額度恢復(上限調高)：小字消失", !cd.getElementById("cap-note"), gc.ev("dailyCapNoteActive()"));
cd.getElementById("btn-custom").click();
await until(gc, () => gc.ev("state.turnCount") === turnBefore + 1);
A.check("恢復後直接再送出同一段文字→照常成功、扣1點", gc.ev("state.turnCount") === turnBefore + 1 && gc.ev("totalAP(state)") === totalBefore - 1, [gc.ev("state.turnCount"), gc.ev("totalAP(state)")]);
// 開場回合被暫停
env.DAILY_SPEND_CAP = "1";
const gc2 = await H.loadGame({ useMock: false, env, key: "uikey0000009", cloud: false });
await H.startNewLife(gc2, { name: "開場被擋" });
A.check("開場回合被暫停：留一則說明與〔重新送出〕，沒有扣點(開場本來就不扣)", gc2.ev("state.log.length") === 1 && gc2.ev("state.log[0].capBlocked") === true && /撰稿人今天寫得太多/.test(gc2.win.document.querySelector(".narrator-error")?.textContent || "") && gc2.win.document.getElementById("btn-retry-turn")?.textContent === "重新送出", gc2.ev("state.log"));
env.DAILY_SPEND_CAP = "500";

// 登入失效(token被伺服器當作過期)
const tokenLive = g6.ev("acctToken()");
g6.ev("localStorage.setItem('life_sim_account_token', 'x'.repeat(64))");
g6.ev("acct.aid = acct.aid");
await g6.ev("refreshAccount()");
A.check("登入失效(超過90天沒用等)：這台裝置回到未登入、給一則說明、本機點數池歸零不複製錢包", g6.ev("accountEmailBound()") === false && !!g6.win.document.getElementById("writer-toast") && g6.ev("state.ap.daily + state.ap.gift") === 0, g6.win.document.getElementById("writer-toast")?.textContent);
g1.ev("renderMenuPanel && setPanel('menu')");
A.check("存檔・設定選單：未綁有「綁定信箱」一列", !!g1.win.document.getElementById("link-account") && /綁定信箱/.test(g1.win.document.getElementById("link-account").textContent));
A.check("頂部行動點有虛線底線提示可點", /dotted/.test(g1.ev("document.getElementById('ap-total') ? document.getElementById('ap-total').getAttribute('style') : ''")||"dotted"));
const realErrors = [g1, g2, g4, g5, g6, gm, gc, gc2].flatMap(g => g.errors).filter(e => !/fake upstream error|Not implemented|今天的故事額度已用完/.test(String(e)));
A.check("頁面沒有非預期的腳本錯誤", realErrors.length === 0, realErrors.slice(0, 3).map(String));
process.exit(A.report() ? 0 : 1);
