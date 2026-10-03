// 2026-09-30：十、10.2／10.9.2／10.9.3 前端整合(續)——啟程禮發滿的第7則與隔天補發、每日補點提示、人生結束空出格子、連線失敗不扣點、
// 帳號人生遇到花費上限、換綁信箱、換裝置登入拿回人生、同時遊玩以最後一次存檔為準（jsdom＋真的worker.js＋假上游＋假Resend）
import * as H from "./harness.mjs";
const A = H.makeAsserter("帳號前端(續)：補發、補點、換裝置、換綁");
let upstreamFail = false;
const fakeAI = H.makeFakeAnthropic({ fail: () => upstreamFail });
const resend = H.makeFakeResend();
H.installUpstream(fakeAI, resend);
const env = await H.makeAccountEnv({ TEST_NOW_MS: undefined, CLOUD_SAVE_ENABLED: "false" });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return v; await wait(15); } return false; }
const text = (g, sel) => (g.win.document.querySelector(sel)?.textContent || "").replace(/\s+/g, "");
let clockOffset = 0; // 伺服器時鐘往後撥的量(同一信箱60秒內不能重寄；跨日測試)
const bump = ms => { clockOffset += ms; env.TEST_NOW_MS = String(Date.now() + clockOffset); };
async function newDevice(key, name = "林小晴", turn = true) {
  const g = await H.loadGame({ useMock: false, env, key, cloud: false });
  await H.startNewLife(g, { name });
  if (turn) await H.playTurn(g, "嗯");
  return g;
}
async function flow(g, mode, email) {
  const doc = g.win.document;
  bump(2 * 60 * 1000);
  g.ev(`openAccountFlow(${JSON.stringify(mode)})`);
  if (mode === "bind") doc.getElementById("btn-acct-start").click();
  doc.getElementById("acct-email").value = email;
  doc.getElementById("btn-acct-send").click();
  await until(() => doc.getElementById("acct-code"));
  doc.getElementById("acct-code").value = resend.lastCode(email.trim().toLowerCase());
  doc.getElementById("btn-acct-verify").click();
  await until(() => !doc.getElementById("account-modal") || /已有帳號|還沒有帳號|失效|不對/.test(doc.getElementById("acct-error")?.textContent || ""));
  await wait(60);
}
const rawAcct = (email) => { for (const [k, v] of env.ACCOUNTS._store) if (k.startsWith("a:") && v.email === email) return v; return null; };
const post = (path, body, token) => H.callWorker(env, { path, body, headers: token ? { Authorization: "Bearer " + token } : {} });
const ok = (g) => g.win.document.getElementById("btn-bind-result-ok")?.click();

// ================= 啟程禮發滿：第7則「當天啟程禮已發完」＋隔天補發 =================
env.DAILY_GIFT_CAP = "1";
const gA = await newDevice("k61a0000001", "甲");
gA.ev("state.ap.daily = 0; state.ap.gift = 0;"); // 點數已用完的人綁定，補到55點才算「實際發出」一份(進帳號時剩下的點數不到55點)
await flow(gA, "bind", "a61@example.com"); ok(gA);
const gB = await newDevice("k61b0000002", "乙");
gB.ev("state.ap.daily = 1; state.ap.gift = 2;"); // 剩3點
const giftLogBefore = gB.ev("state.apLog.filter(e=>/啟程禮/.test(e.type)).length"); // 開場時本機領的那一筆
await flow(gB, "bind", "b61@example.com");
const t7 = text(gB, "#bind-result-modal");
A.check("第7則(當天啟程禮已發完)：撰稿人幫你把這段人生收好了。今天的啟程禮已經發完，明天會自動放進你的錢包。", t7.includes("撰稿人幫你把這段人生收好了。") && t7.includes("今天的啟程禮已經發完，明天會自動放進你的錢包。") && !t7.includes("55點啟程禮已經放進錢包"), t7);
ok(gB);
A.check("發滿時綁定照常成功：已登入、錢包只有帶過來的3點、啟程禮排隊中(明細不記啟程禮)", gB.ev("accountEmailBound()") === true && gB.ev("totalAP(state)") === 3 && gB.ev("acct.gifts.queued") === 1 && gB.ev("state.apLog.filter(e=>/啟程禮/.test(e.type)).length") === giftLogBefore, [gB.ev("totalAP(state)"), gB.ev("acct.gifts")]);
gB.ev("renderWalletModal()");
A.check("錢包顯示「1 份排隊中，台灣時間午夜後自動補發」", /已領0／2份（1份排隊中，台灣時間午夜後自動補發）/.test(text(gB, "#wallet-modal")), text(gB, "#wallet-modal"));
gB.win.document.getElementById("wallet-modal").remove();
const mailsToB = () => resend.sent.filter(x => x.to === "b61@example.com").length;
const mailsBefore = mailsToB();
bump(26 * 3600 * 1000); // 隔天
await gB.ev("refreshAccount()");
A.check("隔天午夜後自動補發：錢包補發+30點(3→33)，點數明細「啟程禮補發 +30」，不寄信給玩家", gB.ev("totalAP(state)") === 33 && gB.ev("state.apLog.some(e=>e.type==='啟程禮補發' && e.n===30)") && mailsToB() === mailsBefore && gB.ev("acct.gifts.claimed") === 1 && gB.ev("acct.gifts.queued") === 0, [gB.ev("totalAP(state)"), gB.ev("state.apLog.slice(-3)")]);
A.check("補發不新增訊息：沒有彈窗、沒有提示條(只有點數明細)", !gB.win.document.querySelector(".modal-backdrop") && !gB.win.document.getElementById("refill-toast") && !gB.win.document.getElementById("writer-toast"));
delete env.DAILY_GIFT_CAP;

// ================= 每日補點：第8則提示只在實際補到點時出現 =================
const gC = await newDevice("k61c0000003", "丙");
gC.ev("state.ap.daily = 0; state.ap.gift = 0;"); // 綁定後錢包剛好30點
await flow(gC, "bind", "c61@example.com"); ok(gC);
const tC = gC.ev("acctToken()");
await post("/account/wallet", { op: "spend", n: 30 }, tC); // 綁定後剛好30點，扣光
await gC.ev("refreshAccount()"); gC.win.document.getElementById("refill-toast")?.remove();
A.check("(準備：錢包剩0點，畫面同步)", gC.ev("totalAP(state)") === 0);
bump(26 * 3600 * 1000);
await gC.ev("refreshAccount()");
gC.ev("render()");
A.check("隔天第一次打開遊戲、實際補到點：錢包補到5點、明細「每日補點 +5」、出現第8則提示", gC.ev("totalAP(state)") === 5 && gC.ev("state.apLog.some(e=>e.type==='每日補點' && e.n===5)") && gC.win.document.getElementById("refill-toast")?.textContent === "撰稿人已經幫你備好今天的行動點了。", [gC.ev("totalAP(state)"), gC.win.document.getElementById("refill-toast")?.textContent]);
gC.win.document.getElementById("refill-toast")?.remove();
await gC.ev("refreshAccount()");
A.check("同一天再打開：餘額已達上限、沒補點→不出現提示", !gC.win.document.getElementById("refill-toast"));
A.check("點數用完的跳窗：已綁信箱看第1則(打開錢包／好的)", (() => { gC.ev("acct.wallet.free = 0; acct.wallet.total = 0; renderAPExhaustedModal()"); const ok1 = !!gC.win.document.getElementById("btn-ap-exhausted-wallet") && !gC.win.document.getElementById("btn-ap-exhausted-bind"); gC.win.document.getElementById("ap-exhausted-modal")?.remove(); return ok1; })());

// ================= 帳號人生結束→空出格子；沒登入時結束→下次登入再通知 =================
const gD = await newDevice("k61d0000004", "丁");
await flow(gD, "bind", "d61@example.com"); ok(gD);
const lidD = gD.ev("state.acct.lid");
A.check("(準備)帳號有1段人生", rawAcct("d61@example.com").lives.some(l => l.lid === lidD));
await gD.ev("endLife('deleted')");
A.check("刪除帳號人生：帳號空出格子(伺服器人生數0)、錢包不受影響", rawAcct("d61@example.com").lives.length === 0 && (rawAcct("d61@example.com").wallet.gift > 0));
const gE = await newDevice("k61e0000005", "戊");
await flow(gE, "bind", "e61@example.com"); ok(gE);
const lidE = gE.ev("state.acct.lid");
await gE.ev("acctLogout()");
await gE.ev("endLife('deleted')");
A.check("沒登入時結束帳號人生：先記下，伺服器還沒空出格子", rawAcct("e61@example.com").lives.length === 1 && JSON.parse(gE.ev("localStorage.getItem('life_sim_acct_pending_remove')") || "[]").includes(lidE));
await flow(gE, "login", "e61@example.com");
A.check("下次登入：通知伺服器空出格子、待處理清單清空", rawAcct("e61@example.com").lives.length === 0 && JSON.parse(gE.ev("localStorage.getItem('life_sim_acct_pending_remove')") || "[]").length === 0);

// ================= 連線失敗：帳號錢包不扣點，紀錄 0｜回合｜失敗 =================
const gF = await newDevice("k61f0000006", "己");
await flow(gF, "bind", "f61@example.com"); ok(gF);
const wF = gF.ev("totalAP(state)");
upstreamFail = true; await H.playTurn(gF, "會失敗的一回合"); upstreamFail = false;
const errEntry = gF.ev("state.log[state.log.length-1]");
A.check("AI失敗：這回合還沒扣點(畫面與伺服器都一樣)、顯示第6則文字，紀錄「0｜回合｜失敗」", gF.ev("totalAP(state)") === wF && rawAcct("f61@example.com").wallet.gift === wF && errEntry.error === true && /撰稿人一時沒接上線，這一回合還沒扣點/.test(errEntry.text) && gF.ev("(()=>{const e=state.apLog[state.apLog.length-1]; return e.type==='回合' && e.n===0 && e.ok===false;})()"), [wF, gF.ev("totalAP(state)"), rawAcct("f61@example.com").wallet.gift]);
gF.ev("render()");
gF.win.document.getElementById("btn-retry-turn").click();
await until(() => gF.ev("state.turnCount") >= 3 && !gF.ev("aiWritingNow"));
A.check("按〔重新送出〕→成功、扣1點", gF.ev("totalAP(state)") === wF - 1 && rawAcct("f61@example.com").wallet.gift === wF - 1, [gF.ev("totalAP(state)"), wF]);

// ================= 帳號人生遇到花費上限：不扣點、錢包不動、跳窗一次 =================
const gG = await newDevice("k61g0000007", "庚");
await flow(gG, "bind", "g61@example.com"); ok(gG);
env.DAILY_SPEND_CAP = "1";
const wG = gG.ev("totalAP(state)"), tnG = gG.ev("state.turnCount");
gG.win.document.getElementById("custom-input").value = "帳號的一句話";
gG.win.document.getElementById("btn-custom").click();
await until(() => gG.win.document.getElementById("daily-cap-modal"));
A.check("帳號人生被花費上限暫停：跳第4則、錢包(畫面與伺服器)不動、不算回合、文字保留", !!gG.win.document.getElementById("daily-cap-modal") && gG.ev("totalAP(state)") === wG && rawAcct("g61@example.com").wallet.gift === wG && gG.ev("state.turnCount") === tnG && gG.win.document.getElementById("custom-input").value === "帳號的一句話", [gG.ev("totalAP(state)"), wG]);
gG.win.document.getElementById("btn-daily-cap-ok").click();
// 有購買紀錄的帳號不受影響
const recG = rawAcct("g61@example.com"); const keyG = [...env.ACCOUNTS._store.keys()].find(k => k.startsWith("a:") && env.ACCOUNTS._store.get(k).email === "g61@example.com");
env.ACCOUNTS._store.set(keyG, Object.assign({}, recG, { purchased: true }));
gG.win.document.getElementById("btn-custom").click();
await until(() => gG.ev("state.turnCount") === tnG + 1);
A.check("有購買紀錄的帳號：碰到上限照常玩、照常扣點", gG.ev("state.turnCount") === tnG + 1 && gG.ev("totalAP(state)") === wG - 1, [gG.ev("state.turnCount"), gG.ev("totalAP(state)")]);
env.DAILY_SPEND_CAP = "500";

// ================= 換綁信箱(UI) =================
const gH = await newDevice("k61h0000008", "辛");
await flow(gH, "bind", "h61@example.com"); ok(gH);
gH.ev("renderWalletModal()"); gH.win.document.getElementById("btn-acct-change").click();
A.check("錢包→〔換綁信箱〕：標題換綁信箱、要求輸入新信箱", /換綁信箱/.test(text(gH, "#account-modal")) && !!gH.win.document.getElementById("acct-email"));
gH.win.document.getElementById("btn-acct-cancel").click();
await flow(gH, "change", "h61-new@example.com");
A.check("換綁成功：帳號信箱改成新的(舊的沒有帳號了)、畫面遮罩顯示新信箱、給一則說明", rawAcct("h61-new@example.com") && !rawAcct("h61@example.com") && gH.ev("acct.email_masked") === "h6***@example.com" && /信箱已經換綁好了/.test(gH.win.document.getElementById("writer-toast")?.textContent || ""));

// ================= 表單提示文字 =================
A.check("提示文字：1小時內寄太多→「寄得有點頻繁，請 1 小時後再試」", gH.ev("acctErrText({error:'rate_limited'})") === "寄得有點頻繁，請 1 小時後再試");
A.check("提示文字：全站每日上限→「今天寄信的人比較多，請明天再試」", gH.ev("acctErrText({error:'daily_cap'})") === "今天寄信的人比較多，請明天再試");
A.check("提示文字：已有帳號→「這個信箱已有帳號，請直接用信箱登入」", gH.ev("acctErrText({error:'email_exists'})") === "這個信箱已有帳號，請直接用信箱登入");
A.check("提示文字：帳號已滿→「帳號已滿 2 條，這條人生暫時留在原本的復原金鑰上。收掉一條後可以轉進來。」", gH.ev("BIND_OVERFLOW_TEXT") === "帳號已滿 2 條，這條人生暫時留在原本的復原金鑰上。收掉一條後可以轉進來。");

// ================= 換裝置：用信箱登入→拿回存在雲端的人生 =================
const gI = await newDevice("k61i0000009", "壬");
await flow(gI, "bind", "i61@example.com"); ok(gI);
const lidI = gI.ev("state.acct.lid"), keyI = gI.ev("acct.recovery_key");
A.check("綁定時順手把收進帳號的人生存到雲端(帳號的復原金鑰底下)", (await H.callWorker(env, { method: "GET", path: "/slots?key=" + encodeURIComponent(keyI) })).json.slots.some(x => x && x.meta && x.meta.lid === lidI), keyI);
A.check("帳號人生的雲端位置記在帳號的金鑰底下", gI.ev("state.cloudHome && state.cloudHome.key") === keyI);
// 2026-10-02定案B2：示範模式(USE_MOCK)綁定時不上傳存檔，示範內容不進伺服器；一樣能綁、錢包照扣
const gMock = await H.loadGame({ useMock: true, env, key: "k61m0000010", cloud: false });
await H.startNewLife(gMock, { name: "示範綁" });
await H.playTurn(gMock, "嗯");
await flow(gMock, "bind", "mock61@example.com"); ok(gMock);
const keyM = gMock.ev("acct.recovery_key");
A.check("示範模式綁定成功(帳號建立、人生收進帳號)", !!rawAcct("mock61@example.com") && !!gMock.ev("state.acct && state.acct.lid"));
A.check("示範模式綁定時不上傳存檔(帳號金鑰底下沒有任何存檔、沒有雲端位置)", !(await H.callWorker(env, { method: "GET", path: "/slots?key=" + encodeURIComponent(keyM) })).json.slots.some(x => x && x.meta) && !gMock.ev("state.cloudHome"), keyM);
const gJ = await H.loadGame({ useMock: false, env, key: null, cloud: false, storage: { life_sim_age_confirmed: "yes" } }); // 全新裝置：沒有金鑰、沒有人生(已過年齡確認)
await flow(gJ, "login", "i61@example.com");
A.check("全新裝置用信箱登入：登入成功、沿用帳號的復原金鑰、沒有人生要併入所以不跳第7則", gJ.ev("accountEmailBound()") === true && gJ.ev("localStorage.getItem('life_sim_recovery_key')") === keyI && !gJ.win.document.getElementById("bind-result-modal"));
A.check("首頁提示帳號有1段人生存在雲端，可拿回這台裝置", /拿回這台裝置/.test(gJ.win.document.getElementById("btn-home-cloud-lives")?.textContent || ""), gJ.win.document.getElementById("home")?.textContent.slice(0, 200));
gJ.win.document.getElementById("btn-home-cloud-lives").click();
await until(() => gJ.ev("state.phase") === "slotPicker");
await until(() => gJ.win.document.querySelector(".slot-btn[data-action='load']"));
gJ.win.document.querySelector(".slot-btn[data-action='load']").click();
await until(() => gJ.ev("state.phase") === "playing");
A.check("拿回來的人生：是帳號人生(錢包共用)、點數與伺服器一致、可繼續玩", gJ.ev("state.phase") === "playing" && gJ.ev("walletActive(state)") === true && gJ.ev("state.acct.lid") === lidI && gJ.ev("totalAP(state)") === rawAcct("i61@example.com").wallet.gift, [gJ.ev("state.phase"), gJ.ev("walletActive(state)")]);
await H.playTurn(gJ, "在新裝置玩一回合");
A.check("在新裝置玩一回合：扣的是帳號錢包，舊裝置刷新後看到同樣的數字", (await gI.ev("refreshAccount()"), gI.ev("totalAP(state)") === gJ.ev("totalAP(state)") && gJ.ev("totalAP(state)") === rawAcct("i61@example.com").wallet.gift), [gI.ev("totalAP(state)"), gJ.ev("totalAP(state)")]);

// ================= 同一段人生在兩台裝置：以最後一次存檔為準 =================
const cloudOld = { lifeId: "lifeXX", turnCount: 10, savedAt: 1000 }, localNew = { lifeId: "lifeXX", turnCount: 8, savedAt: 2000 };
A.check("合併：兩邊都有存檔時間→比時間，本機較新(回合數較小)也用本機", gJ.ev(`mergeCloudWithLocal(${JSON.stringify(cloudOld)}, ${JSON.stringify(localNew)})`).savedAt === 2000);
A.check("合併：雲端較新(存檔時間)→用雲端，即使本機回合數較大", gJ.ev(`mergeCloudWithLocal(${JSON.stringify({ lifeId: "lifeXX", turnCount: 5, savedAt: 5000 })}, ${JSON.stringify({ lifeId: "lifeXX", turnCount: 9, savedAt: 3000 })})`).savedAt === 5000);
A.check("合併：舊存檔沒有存檔時間→照舊比回合數", gJ.ev(`mergeCloudWithLocal(${JSON.stringify({ lifeId: "lifeXX", turnCount: 5 })}, ${JSON.stringify({ lifeId: "lifeXX", turnCount: 9, savedAt: 3000 })})`).turnCount === 9);
A.check("每次存檔都記下存檔時間", gJ.ev("(()=>{ const t0 = Date.now(); saveLocalOnly(); return state.savedAt >= t0; })()"));
// 手動拿回時，這台裝置上的進度比雲端新→先問過再覆蓋
await gI.ev("manualCloudSave()"); await wait(80);
const cloudSaved = (await H.callWorker(env, { method: "GET", path: "/load?key=" + encodeURIComponent(keyI) + "&slot=" + gI.ev("state.cloudHome.slot") })).json;
await H.playTurn(gI, "舊裝置又玩一回合，比雲端新");
gI.win.confirm = () => false;
const declined = await gI.ev(`restoreFromCloud(${JSON.stringify(keyI)}, ${gI.ev("state.cloudHome.slot")})`);
A.check("這台裝置的進度比雲端新：拿回雲端進度前先問，選不覆蓋→保留較新的、不動存檔", declined.ok === false && /保留這台裝置上比較新的進度/.test(declined.message) && gI.ev("state.phase") === "playing", declined);
gI.win.confirm = () => true;
const accepted = await gI.ev(`restoreFromCloud(${JSON.stringify(keyI)}, ${gI.ev("state.cloudHome.slot")})`);
A.check("選覆蓋→用雲端的進度", accepted.ok === true);
const realErrors = [gA, gB, gC, gD, gE, gF, gG, gH, gI, gJ].flatMap(g => g.errors).filter(e => !/fake upstream error|Not implemented|今天的故事額度已用完/.test(String(e)));
A.check("頁面沒有非預期的腳本錯誤", realErrors.length === 0, realErrors.slice(0, 3).map(String));
process.exit(A.report() ? 0 : 1);
