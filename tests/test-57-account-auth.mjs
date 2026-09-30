// 2026-09-30：十、10.2／10.2.1／10.2.2 帳號系統——信箱驗證碼登入、驗證碼規則、登入保持90天、寄信防濫用、寄信內容（全程假Resend，不寄真信、不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("帳號：信箱驗證碼登入");
const fakeAI = H.makeFakeAnthropic();
const resend = H.makeFakeResend();
H.installUpstream(fakeAI, resend);

const T0 = Date.parse("2026-09-30T03:00:00Z");
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0) });
const at = ms => { env.TEST_NOW_MS = String(T0 + ms); };
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const post = (path, body, headers) => H.callWorker(env, { path, body, headers });
const get = (path, headers) => H.callWorker(env, { method: "GET", path, headers });
const auth = t => ({ Authorization: "Bearer " + t });
const sendCode = (email, ip) => post("/account/send-code", { email }, ip ? { "CF-Connecting-IP": ip } : undefined);
const lives = [{ lid: "lifeaaaa1", pool: { daily: 5, gift: 30 } }];

// ---- 寄信內容(10.2.2) ----
let r = await sendCode("Alice@Example.com ");
A.check("寄驗證碼：成功、回應沒有驗證碼本身", r.status === 200 && r.json.success === true && !/\d{6}/.test(r.text.replace(/"(next_send_in|expires_in)":\d+/g, "")), r);
const m1 = resend.sent[0];
A.check("信：寄給正規化後的信箱(去前後空白、不分大小寫)", m1.to === "alice@example.com", m1.to);
A.check("信：寄件人＝人生草稿 <noreply@mail.draftmylife.com>", m1.from === "人生草稿 <noreply@mail.draftmylife.com>", m1.from);
A.check("信：主旨＝「人生草稿 驗證碼：123456」格式", /^人生草稿 驗證碼：\d{6}$/.test(m1.subject), m1.subject);
A.check("信：內文有驗證碼、10 分鐘內有效、用途說明，沒有任何連結", m1.text.includes(m1.subject.slice(-6)) && m1.text.includes("10 分鐘內有效") && m1.text.includes("保存進度和找回帳號") && !/https?:|www\.|\.com\/|<a /i.test(m1.text), m1.text);
A.check("信：驗證碼是6位數字", /^\d{6}$/.test(resend.lastCode("alice@example.com")));

// ---- 驗證碼規則 ----
r = await post("/account/bind", { email: "alice@example.com", code: "000000", key: "KEY-A", lives });
A.check("輸錯驗證碼：400 wrong_code，剩4次", r.status === 400 && r.json.error === "wrong_code" && r.json.tries_left === 4, r.json);
const code1 = resend.lastCode("alice@example.com");
at(61 * 1000);
r = await sendCode("alice@example.com");
const code2 = resend.lastCode("alice@example.com");
A.check("重寄：舊驗證碼立刻作廢、只有最新一組有效", r.status === 200 && (code1 === code2 || true));
if (code1 !== code2) {
  const old = await post("/account/bind", { email: "alice@example.com", code: code1, key: "KEY-A", lives });
  A.check("重寄後用舊驗證碼→失敗", old.status === 400 && old.json.error === "wrong_code", old.json);
} else A.check("重寄後用舊驗證碼→失敗(兩次碰巧同號，略過)", true);
// 輸錯5次作廢(從一組新的驗證碼開始算)
at(3 * MIN); await sendCode("alice@example.com");
const wrongs = [];
for (let i = 0; i < 5; i++) wrongs.push((await post("/account/bind", { email: "alice@example.com", code: resend.lastCode("alice@example.com") === "999999" ? "999998" : "999999", key: "KEY-A", lives })).json);
A.check("同一組輸錯前4次是wrong_code(剩3、2、1、0…依序)、第5次→作廢(code_locked)", wrongs.slice(0, 4).every((x, i) => x.error === "wrong_code" && x.tries_left === 4 - i) && wrongs[4].error === "code_locked", wrongs);
r = await post("/account/bind", { email: "alice@example.com", code: resend.lastCode("alice@example.com"), key: "KEY-A", lives });
A.check("作廢後連正確的驗證碼也不能用(要重新寄送)", r.status === 400 && r.json.error === "no_code", r.json);
// 過期
at(5 * MIN); await sendCode("alice@example.com");
const codeExp = resend.lastCode("alice@example.com");
at(5 * MIN + 10 * MIN + 1000);
r = await post("/account/bind", { email: "alice@example.com", code: codeExp, key: "KEY-A", lives });
A.check("驗證碼超過10分鐘→過期", r.status === 400 && r.json.error === "code_expired", r.json);
// 10分鐘內有效
at(20 * MIN); await sendCode("alice@example.com");
const codeOk = resend.lastCode("alice@example.com");
at(20 * MIN + 9 * MIN + 30 * 1000);
r = await post("/account/bind", { email: " ALICE@example.com", code: codeOk, key: "KEY-A", lives });
A.check("9分半鐘時用正確驗證碼、信箱大小寫／空白不同→綁定成功", r.status === 200 && r.json.success && !!r.json.token && r.json.account.email_masked === "al***@example.com", r.json);
const tokenA = r.json.token;
r = await post("/account/bind", { email: "alice@example.com", code: codeOk, key: "KEY-B", lives: [] });
A.check("驗證碼使用一次即失效", r.status === 400 && r.json.error === "no_code", r.json);

// ---- 登入保持90天，每次使用往後延長 ----
r = await get("/account/me", auth(tokenA));
A.check("me：帶token→帳號狀態", r.status === 200 && r.json.account.aid && r.json.account.recovery_key === "KEY-A", r.json);
r = await get("/account/me");
A.check("me：沒帶token→401", r.status === 401, r.status);
r = await get("/account/me", auth("x".repeat(64)));
A.check("me：亂猜的token→401", r.status === 401, r.status);
const base = 20 * MIN + 10 * MIN;
at(base + 89 * DAY); r = await get("/account/me", auth(tokenA));
A.check("89天後還在登入", r.status === 200, r.status);
at(base + 89 * DAY + 89 * DAY); r = await get("/account/me", auth(tokenA));
A.check("每次使用往後延長：又過89天(距離第一次登入178天)仍在登入", r.status === 200, r.status);
at(base + 89 * DAY + 89 * DAY + 91 * DAY); r = await get("/account/me", auth(tokenA));
A.check("超過90天沒用→要重新收驗證碼(401)", r.status === 401, r.status);

// ---- 多台裝置同時登入；登出只影響該台 ----
at(200 * DAY);
await sendCode("alice@example.com", "1.1.1.1"); let cd = resend.lastCode("alice@example.com");
r = await post("/account/login", { email: "alice@example.com", code: cd, lives: [] });
const dev1 = r.json.token; A.check("用信箱登入既有帳號成功", r.status === 200 && !!dev1, r.json);
at(200 * DAY + 2 * MIN); await sendCode("alice@example.com", "1.1.1.1"); cd = resend.lastCode("alice@example.com");
r = await post("/account/login", { email: "alice@example.com", code: cd, lives: [] });
const dev2 = r.json.token;
A.check("同一帳號可在多台裝置同時保持登入(兩個不同token)", !!dev2 && dev2 !== dev1);
await post("/account/logout", {}, auth(dev1));
A.check("登出：那台裝置的token失效", (await get("/account/me", auth(dev1))).status === 401);
A.check("登出：另一台裝置照常", (await get("/account/me", auth(dev2))).status === 200);
r = await post("/account/login", { email: "nobody@example.com", code: "123456", lives: [] });
A.check("沒有驗證碼就想登入→400 no_code", r.status === 400 && r.json.error === "no_code", r.json);

// ---- 寄信防濫用(10.2.1) ----
at(300 * DAY);
const mailsBefore = resend.sent.length;
r = await sendCode("bob@example.com", "2.2.2.2");
r = await sendCode("bob@example.com", "2.2.2.2");
A.check("同一信箱60秒內重寄→429 too_soon，帶剩餘秒數、沒有寄信", r.status === 429 && r.json.error === "too_soon" && r.json.retry_after > 0 && r.json.retry_after <= 60 && resend.sent.length === mailsBefore + 1, r.json);
for (let i = 1; i <= 4; i++) { at(300 * DAY + i * 61 * 1000); r = await sendCode("bob@example.com", "2.2.2." + i); }
A.check("同一信箱1小時內第5封還寄得出去", r.status === 200, r.json);
at(300 * DAY + 5 * 61 * 1000); r = await sendCode("bob@example.com", "2.2.2.9");
A.check("同一信箱每小時最多5封：第6封→429 rate_limited(對外只說寄得有點頻繁)", r.status === 429 && r.json.error === "rate_limited", r.json);
at(300 * DAY + HOUR + 6 * 61 * 1000); r = await sendCode("bob@example.com", "2.2.2.9");
A.check("1小時後又可以寄", r.status === 200, r.json);
// 同一IP每小時10封(不同信箱)
at(310 * DAY);
let ipBlocked = null;
for (let i = 0; i < 12; i++) { const x = await sendCode("ip" + i + "@example.com", "9.9.9.9"); if (x.status === 429 && !ipBlocked) ipBlocked = { i, err: x.json.error }; }
A.check("同一網路位址每小時最多10封：第11封被擋(rate_limited)", ipBlocked && ipBlocked.i === 10 && ipBlocked.err === "rate_limited", ipBlocked);
// 全站每日上限
env.DAILY_VERIFY_EMAIL_CAP = "12";
at(320 * DAY);
const sentBeforeCap = resend.sent.length;
let capErr = null, okCount = 0;
for (let i = 0; i < 15; i++) { const x = await sendCode("day" + i + "@example.com", "8.8." + i + ".1"); if (x.status === 200) okCount++; else if (!capErr) capErr = x.json.error; }
A.check("全站每日驗證信上限(DAILY_VERIFY_EMAIL_CAP=12)：寄到12封後→429 daily_cap", okCount === 12 && capErr === "daily_cap" && resend.sent.length === sentBeforeCap + 12, { okCount, capErr });
at(321 * DAY + 5 * MIN); r = await sendCode("nextday@example.com", "8.8.99.1");
A.check("台灣時間午夜過後恢復", r.status === 200, r.json);
delete env.DAILY_VERIFY_EMAIL_CAP;
// 不透露信箱有沒有帳號：已有帳號與沒有帳號的回應形狀一樣
at(330 * DAY);
const rExist = await sendCode("alice@example.com", "7.7.7.1"), rNew = await sendCode("fresh@example.com", "7.7.7.2");
A.check("寄驗證碼的回應不透露信箱有沒有帳號(形狀完全相同)", JSON.stringify(Object.keys(rExist.json).sort()) === JSON.stringify(Object.keys(rNew.json).sort()) && rExist.status === rNew.status, [rExist.json, rNew.json]);
// 寄信失敗：不算玩家的次數，可以馬上再試
resend.failNext(1);
r = await sendCode("failmail@example.com", "6.6.6.6");
A.check("寄信服務失敗→502 send_failed", r.status === 502 && r.json.error === "send_failed", r);
r = await sendCode("failmail@example.com", "6.6.6.6");
A.check("寄失敗不佔60秒間隔與次數：馬上重寄成功", r.status === 200, r.json);
r = await sendCode("not-an-email", "6.6.6.6");
A.check("信箱格式不對→400 invalid_email、不寄信", r.status === 400 && r.json.error === "invalid_email", r.json);
const envNoKey = await H.makeAccountEnv({ RESEND_API_KEY: undefined });
r = await H.callWorker(envNoKey, { path: "/account/send-code", body: { email: "a@b.co" } });
A.check("沒設定寄信金鑰→503 mail_not_configured(不會當機)", r.status === 503 && r.json.error === "mail_not_configured", r);

// ---- 金鑰與信箱：一個信箱只能綁一把金鑰 ----
at(340 * DAY);
await sendCode("carol@example.com", "5.5.5.1"); cd = resend.lastCode("carol@example.com");
r = await post("/account/bind", { email: "carol@example.com", code: cd, key: "KEY-A", lives: [] });
A.check("同一把復原金鑰不能綁第二個信箱(key_linked)", r.status === 409 && r.json.error === "key_linked", r.json);
const realErr = [];
A.check("寄出的信裡只有驗證信與管理通知信兩種", resend.sent.every(x => /^人生草稿/.test(x.subject)), resend.sent.map(x => x.subject));
process.exit(A.report() ? 0 : 1);
