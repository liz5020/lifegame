// 2026-10-01 十、10.13.2 開場同意頁：第一次進站擋一頁、不同意留在本頁、同意後不再出現、版本提高重新同意、紀錄隨存檔與帳號、選單／綁定頁的隱私說明連結
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.13.2開場同意頁");
const fake = H.makeFakeAnthropic(); const resend = H.makeFakeResend();
H.installUpstream(fake, resend);
const env = await H.makeAccountEnv({ CLOUD_SAVE_ENABLED: "false" });
const wait = ms => new Promise(r => setTimeout(r, ms));
const gate = g => g.ev("!!document.getElementById('consent-gate')");

// ---- 全新玩家：先看到同意頁，文字定稿 ----
const g = await H.loadGame({ useMock: true, env, key: null, cloud: false, consent: false });
await wait(30);
A.check("全新裝置進站：出現開場同意頁", gate(g));
const txt = g.ev("document.getElementById('consent-gate').textContent");
A.check("標題與四點文字照定稿", txt.includes("開始之前，先跟你說明") && txt.includes("遊戲進行中會定期自動存檔到我們的伺服器，存檔用於改善遊戲體驗及維護。")
  && txt.includes("遊戲劇情由 AI 生成，你的選擇與輸入的文字會傳給 AI 服務商，用來產生下一段劇情。")
  && txt.includes("請不要在遊戲裡輸入真實姓名、電話、住址、公司等個人資訊。") && txt.includes("有任何問題與建議，可以透過回報表單告訴我們。"), txt);
A.check("有〔同意並開始〕〔不同意〕兩顆按鈕，沒有「不要再顯示」勾選", !!g.ev("document.getElementById('btn-consent-agree')") && !!g.ev("document.getElementById('btn-consent-decline')") && g.ev("document.querySelectorAll('#consent-gate input').length") === 0);
A.check("按〔不同意〕前沒有提示", g.ev("document.getElementById('consent-hint').style.display") === "none");
g.ev("document.getElementById('btn-consent-decline').click()");
A.check("按〔不同意〕：留在本頁並提示「需要同意才能開始遊戲」", gate(g) && g.ev("document.getElementById('consent-hint').style.display") === "block" && /需要同意才能開始遊戲/.test(g.ev("document.getElementById('consent-hint').textContent")) && g.ev("getConsent()") === null);
g.ev("document.getElementById('btn-consent-agree').click()");
A.check("按〔同意並開始〕：頁面關掉、紀錄同意時間與版本號", !gate(g) && g.ev("getConsent().v") === g.ev("CONSENT_VERSION") && g.ev("getConsent().at") > 0, g.ev("localStorage.getItem('lifegame_consent')"));
// 同意一次後不再出現：用同一份localStorage「重新整理」
const saved = g.ev("JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])))");
const again = await H.loadGame({ useMock: true, env, key: null, cloud: false, consent: false, storage: JSON.parse(saved) });
await wait(30);
A.check("重新整理後不再出現", !gate(again));

// ---- 說明版本提高：所有玩家重新同意 ----
const bumped = await H.loadGame({ useMock: true, env, key: null, cloud: false, consent: false, storage: Object.assign(JSON.parse(saved), { lifegame_consent: JSON.stringify({ v: 0, at: 1700000000000 }) }) });
await wait(30);
A.check("裝置上的同意版本低於目前版本：再次出現", gate(bumped));
// 紀錄壞掉／不存在：再次出現
const broken = await H.loadGame({ useMock: true, env, key: null, cloud: false, consent: false, storage: { lifegame_consent: "{壞掉" } });
await wait(30);
A.check("同意紀錄壞掉視同不存在：再次出現", gate(broken));

// ---- 已在遊戲中的玩家(有存檔、沒有同意紀錄)：下次開啟先看到本頁 ----
const mid = await H.loadGame({ useMock: true, env, key: "consent001", cloud: false });
await H.startNewLife(mid, { name: "老玩家" });
const midStore = JSON.parse(mid.ev("JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='lifegame_consent').map(k=>[k,localStorage.getItem(k)])))"));
const old = await H.loadGame({ useMock: true, env, key: "consent001", cloud: false, consent: false, storage: midStore });
await wait(30);
A.check("本規則生效前已在遊戲中的玩家：下次開啟先看到同意頁", gate(old));

// ---- 紀錄隨存檔上傳 ----
A.check("存檔裡帶著同意紀錄(說明版本＋時間)", mid.ev("state.consent && state.consent.v") === mid.ev("CONSENT_VERSION") && JSON.parse(mid.ev("localStorage.getItem('life_sim_save_v1:0')")).consent.at > 0);

// ---- 隱私說明連結 ----
A.check("選單有「隱私說明」連結", /隱私說明/.test(mid.ev("renderMenuPanel(state)")) && mid.ev("renderMenuPanel(state)").includes('id="link-privacy"'));
mid.ev("document.body.insertAdjacentHTML('beforeend','<a class=\"privacy-link\" id=\"t-p\">x</a>'); document.getElementById('t-p').click()");
const pm = mid.ev("document.getElementById('privacy-modal') && document.getElementById('privacy-modal').textContent");
A.check("點隱私說明：顯示同意頁同樣的四點文字，可關閉", /定期自動存檔/.test(pm) && /不要在遊戲裡輸入真實姓名/.test(pm) && (mid.ev("document.getElementById('btn-privacy-close').click()"), !mid.ev("!!document.getElementById('privacy-modal')")));
mid.ev("openAccountFlow('bind')");
const bt = mid.ev("document.getElementById('account-modal').textContent");
A.check("綁定說明頁只保留一句話＋隱私說明連結", bt.includes("信箱只用來保存進度和找回帳號，綁定後會收到啟程禮。") && !bt.includes("第 1 段") && !!mid.ev("document.querySelector('#account-modal .privacy-link')"), bt);
mid.ev("closeAccountFlow()");
mid.ev("openAccountFlow('login')");
A.check("用信箱登入流程只放一行隱私說明連結", !!mid.ev("document.querySelector('#account-modal .privacy-link')"));
mid.ev("closeAccountFlow()");

// ---- 已綁信箱：同意紀錄同時記在帳號資料上 ----
const post = (path, body, headers) => H.callWorker(env, { path, body, headers });
await post("/account/send-code", { email: "c1@example.com" }, { "CF-Connecting-IP": "8.8.8.1" });
const b = (await post("/account/bind", { email: "c1@example.com", code: resend.lastCode("c1@example.com"), key: "CK1", lives: [] })).json;
const auth = { Authorization: "Bearer " + b.token };
A.check("綁定前帳號沒有同意紀錄", b.account.consent === null, b.account);
let c = (await post("/account/consent", { v: 1, at: 1760000000000 }, auth)).json;
const me = (await H.callWorker(env, { method: "GET", path: "/account/me", headers: auth })).json;
A.check("POST /account/consent：記在帳號資料上，me可讀回", c.success === true && me.account.consent && me.account.consent.v === 1 && me.account.consent.at === 1760000000000, me.account);
const bad = await post("/account/consent", { v: "x", at: 1 }, auth);
A.check("格式不對：400；沒登入：401", bad.status === 400 && (await post("/account/consent", { v: 1, at: 1 })).status === 401, bad.status);
// 前端：登入狀態下同意→送帳號
const web = await H.loadGame({ useMock: true, env, key: null, cloud: false, consent: false, storage: { life_sim_account_token: b.token } });
await wait(30);
A.check("前端(已登入)同意後，帳號資料上記著同樣的紀錄", await (async () => {
  web.ev("acct = " + JSON.stringify(b.account));
  web.ev("document.getElementById('btn-consent-agree').click()");
  await wait(200);
  const m2 = (await H.callWorker(env, { method: "GET", path: "/account/me", headers: auth })).json;
  return m2.account.consent && m2.account.consent.at === web.ev("getConsent().at");
})());
process.exit(A.report() ? 0 : 1);
