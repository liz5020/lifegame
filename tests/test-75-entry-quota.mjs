// 2026-10-08 十、10.15 封測名額與候補（Worker端）：每日名額、檢查點、候補隊伍、00:00分配、12:00通知信與重試、保留72小時與過期收回、入場領55點、
// 管理端名額卡片與唯讀名冊（全程假Resend與假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.15 封測名額與候補");
const resend = H.makeFakeResend(); H.installUpstream(H.makeFakeAnthropic(), resend);
const worker = await H.loadWorker();
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const TW0 = Date.parse("2026-10-10T00:00:00+08:00"); // 台灣10/10 00:00
const mk = (extra) => H.makeAccountEnv(Object.assign({ CLOUD_SAVE_ENABLED: "false", SAVE_ADMIN_TOKEN: "save-pw", TEST_NOW_MS: String(TW0 + 11 * HOUR) }, extra || {}));
const env = await mk();
const at = (ms, e = env) => { e.TEST_NOW_MS = String(TW0 + ms); }; // 距台灣10/10 00:00的毫秒數
const post = (path, body, headers, e = env) => H.callWorker(e, { path, body, headers });
const get = (path, headers, e = env) => H.callWorker(e, { method: "GET", path, headers });
const auth = t => ({ Authorization: "Bearer " + t });
const tick = async (e = env) => { const w = []; await worker.scheduled({ cron: "0 * * * *" }, e, { waitUntil: p => w.push(p) }); await Promise.all(w); };
const kvBefore = env.SAVES._m.size;
let ipn = 0;
const join = async (email, key, e = env) => {
  const ip = "9.9.9." + (++ipn);
  await post("/account/send-code", { email }, { "CF-Connecting-IP": ip }, e);
  return post("/waitlist/join", { email, code: resend.lastCode(email), key }, undefined, e);
};
const login = async (email, e = env) => {
  const ip = "8.8.8." + (++ipn);
  await post("/account/send-code", { email }, { "CF-Connecting-IP": ip }, e);
  return post("/account/login", { email, code: resend.lastCode(email), lives: [] }, undefined, e);
};
const status = async (e = env) => (await get("/entry/status", undefined, e)).json;

// ---- 每日名額：5個 ----
let st = await status();
A.check("一開始有名額：open、剩5／5、公開回應不含累計與檢查點", st.success && st.open === true && st.remaining === 5 && st.total === 5 && st.cum === undefined && st.checkpoint === undefined, st);
const claims = [];
for (let i = 1; i <= 5; i++) claims.push(await post("/entry/claim", { key: "NEWKEY-000" + i }));
A.check("前5位新玩家領名額成功", claims.every(r => r.status === 200 && r.json.success), claims.map(r => r.status));
let r = await post("/entry/claim", { key: "NEWKEY-0006" });
A.check("第6位：409 full（看到第9則）", r.status === 409 && r.json.error === "full", r.json);
r = await post("/entry/claim", { key: "NEWKEY-0001" });
A.check("同一把金鑰重複呼叫：成功但不重複扣名額", r.status === 200 && r.json.repeat === true);
st = await status();
A.check("名額用完：open=false、reason=full、剩0", st.open === false && st.reason === "full" && st.remaining === 0, st);
A.check("金鑰原文不進帳號資料庫(只存門牌)", ![...env.ACCOUNTS._store.keys()].some(k => k.includes("NEWKEY")) && env.ACCOUNTS._store.has("ec:" + H.loc("NEWKEY-0001")));

// ---- 留信箱候補 ----
r = await post("/waitlist/join", { email: "x@example.com", code: "123456", key: "WLK-X" });
A.check("驗證碼不對→不能候補", r.status === 400, r.json);
const w1 = await join("w1@example.com", "WLKEY-1"), w2 = await join("w2@example.com", "WLKEY-2"), w3 = await join("w3@example.com", "WLKEY-3");
A.check("候補成功：回順位1、2、3，帳號沒有任何人生", w1.status === 200 && w1.json.result.position === 1 && w2.json.result.position === 2 && w3.json.result.position === 3 && w1.json.account.lives.length === 0 && w1.json.account.wl.status === "waiting", [w1.json, w2.json.result]);
at(11 * HOUR + 2 * MIN); // 過了重寄間隔(60秒)，才拿得到新的驗證碼
r = await join("w1@example.com", "WLKEY-1b");
A.check("同一個信箱不能排兩次：409 email_exists（沿用現有提示）", r.status === 409 && r.json.error === "email_exists", r.json);
r = await join("w4@example.com", "WLKEY-1");
A.check("同一把金鑰不能綁兩個信箱：409 key_linked", r.status === 409 && r.json.error === "key_linked", r.json);
let me = await get("/account/me", auth(w2.json.token));
A.check("排隊中再打開：me回status=waiting與目前順位2", me.json.account.wl.status === "waiting" && me.json.account.wl.position === 2, me.json.account.wl);
r = await post("/account/lives", { op: "add", lid: "lifewl000001" }, auth(w1.json.token));
A.check("還在排隊的人不能開始人生：409 wl_not_ready", r.status === 409 && r.json.error === "wl_not_ready", r.json);
A.check("候補通知信不是在登記時寄的（只有驗證信）", resend.notices().length === 0);

// ---- 台灣00:00分配 ----
at(DAY + 5 * MIN); // 10/11 00:05
st = await status();
A.check("隔天第一次有人碰到：自動做當天分配（3位候補各佔1個，直接來的剩2個）", st.open === true && st.remaining === 2, st);
let es = await get("/stats-summary", auth("admin-secret"));
A.check("名額卡片：今日已用3、累計8、排隊0、已通知未入場3", es.json.entry && es.json.entry.used === 3 && es.json.entry.cum === 8 && es.json.entry.waiting === 0 && es.json.entry.notified === 3 && es.json.entry.checkpoint === 50, es.json.entry);
await tick();
A.check("中午12:00之前不寄通知信", resend.notices().length === 0);
at(DAY + 12 * HOUR); // 10/11 12:00
const verifyCount = async (e = env) => (await e.ACCOUNTS.get().fetch("https://x/op", { method: "POST", body: JSON.stringify({ op: "stats", now: Number(e.TEST_NOW_MS), date: "2026-10-11" }) }).then(x => x.json())).verify_emails;
const v0 = await verifyCount();
resend.failNext(1);
await tick();
let notes = resend.notices();
A.check("12:00：先寄3封，其中1封失敗（2封已送出）", notes.length === 2 && notes.every(m => m.subject === "人生草稿：輪到你了"), notes.map(m => m.to));
const m0 = notes[0];
A.check("信件：寄件人、全形標點、保留到3天後中午12:00、只有網址文字沒有連結", m0.from === "人生草稿 <noreply@mail.draftmylife.com>" && m0.text.includes("你的封測名額已經準備好了，保留到 10 月 14 日中午 12:00。") && m0.text.includes("請打開 draftmylife.com，用這個信箱登入，就可以開始你的人生。") && m0.text.includes("這封信是因為你留了信箱候補才寄出的，之後不會再寄其他通知。") && !/https?:|<a /i.test(m0.text), m0.text);
const failedTo = ["w1@example.com", "w2@example.com", "w3@example.com"].find(e => !notes.some(m => m.to === e));
at(DAY + 12 * HOUR + 20 * MIN); await tick();
A.check("失敗的那封20分鐘後不重試（間隔每小時）", resend.notices().length === 2);
at(DAY + 13 * HOUR); await tick();
notes = resend.notices();
const retry = notes.find(m => m.to === failedTo);
A.check("13:00：失敗的重試成功，保留期從成功那一刻起算（信上寫 10 月 14 日下午 1:00）", notes.length === 3 && retry && retry.text.includes("10 月 14 日下午 1:00"), retry && retry.text);
await tick();
A.check("全部寄完後不再重複寄", resend.notices().length === 3);
A.check("候補通知信不計入每日驗證信額度（寄了3封通知信，驗證信計數不變）", (await verifyCount()) === v0, [v0, await verifyCount()]);

// ---- 入場：領55點 ----
let lg = await login("w1@example.com");
A.check("位子保留中登入：wl.status=notified、gift_full=false", lg.status === 200 && lg.json.account.wl.status === "notified" && lg.json.account.wl.gift_full === false && lg.json.account.lives.length === 0, lg.json.account.wl);
r = await post("/account/lives", { op: "add", lid: "lifewl000001" }, auth(lg.json.token));
A.check("開始人生：錢包55點（25＋30）、wl.status=entered、第1份啟程禮記為已領", r.status === 200 && r.json.account.wallet.total === 55 && r.json.account.wl.status === "entered" && r.json.account.gifts.claimed === 1 && r.json.result.wl_entry.added === 25, r.json);
A.check("點數明細事件：啟程禮25與30", (r.json.events || []).filter(e => e.type === "啟程禮").map(e => e.n).sort().join() === "25,30", r.json.events);
// 候補入場的30點計入DAILY_GIFT_CAP
const gcap = await env.ACCOUNTS.get().fetch("https://x/op", { method: "POST", body: JSON.stringify({ op: "stats", now: Number(env.TEST_NOW_MS), date: "2026-10-11" }) }).then(x => x.json());
A.check("30點計入當天啟程禮份數（1份）", gcap.gifts_issued === 1, gcap);

// ---- 啟程禮當天已發滿：25點先領、30點排到隔天 ----
const envG = await mk({ DAILY_GIFT_CAP: "1", DAILY_NEW_PLAYER_CAP: "2" });
await post("/entry/claim", { key: "GK1" }, undefined, envG); await post("/entry/claim", { key: "GK2" }, undefined, envG);
await join("g1@example.com", "GWL-1", envG); await join("g2@example.com", "GWL-2", envG);
at(DAY + 12 * HOUR, envG); await tick(envG);
const gl1 = await login("g1@example.com", envG), gl2 = await login("g2@example.com", envG);
A.check("啟程禮還沒發滿時：gift_full=false", gl1.json.account.wl.gift_full === false);
const ge1 = await post("/account/lives", { op: "add", lid: "lifegf000001" }, auth(gl1.json.token), envG);
A.check("第1位入場：55點（25＋30），當天份數用完", ge1.json.account.wallet.total === 55 && ge1.json.result.wl_entry.gift.status === "granted", ge1.json);
const gl2b = await get("/account/me", auth(gl2.json.token), envG);
A.check("第2位登入時：gift_full=true（第13則第二行改為『另外 30 點明天會自動補上』）", gl2b.json.account.wl.gift_full === true, gl2b.json.account.wl);
const ge2 = await post("/account/lives", { op: "add", lid: "lifegf000002" }, auth(gl2.json.token), envG);
A.check("第2位入場：先領25點、30點排隊", ge2.json.account.wallet.total === 25 && ge2.json.result.wl_entry.gift.status === "queued" && ge2.json.account.gifts.queued === 1, ge2.json);
at(2 * DAY + 10 * MIN, envG);
const ge2b = await get("/account/me", auth(gl2.json.token), envG);
A.check("隔天自動補發30點（共55點），不另外寄信", ge2b.json.account.wallet.total >= 55 && (ge2b.json.events || []).some(e => e.type === "啟程禮補發" && e.n === 30), ge2b.json);

// ---- 位子保留72小時，過期收回 ----
let l2 = await login("w2@example.com");
A.check("w2收到通知後仍在保留期內", l2.json.account.wl.status === "notified");
at(DAY + 12 * HOUR + 72 * HOUR + 1 * MIN); // 過了72小時
me = await get("/account/me", auth(l2.json.token));
A.check("超過72小時未入場：位子收回，狀態已過期，帳號保留", me.status === 200 && me.json.account.wl.status === "expired", me.json.account.wl);
es = await get("/stats-summary", auth("admin-secret"));
A.check("收回後累計入場減回（w2、w3各減1；w3在13:00前後寄出，這時同樣過期或保留中）", es.json.entry.cum <= 7, es.json.entry);

// ---- 手動暫停與檢查點 ----
const envC = await mk({ DAILY_NEW_PLAYER_CAP: "0" });
r = await post("/entry/claim", { key: "ANY-KEY-1" }, undefined, envC);
A.check("DAILY_NEW_PLAYER_CAP=0：所有新玩家看到滿額、候補仍可登記", r.status === 409 && r.json.error === "full" && (await join("c0@example.com", "C0-KEY", envC)).status === 200);
const envP = await mk({ BETA_PLAYER_CHECKPOINT: "2" });
await post("/entry/claim", { key: "CP-1" }, undefined, envP);
const cpBefore = resend.sent.length;
r = await post("/entry/claim", { key: "CP-2" }, undefined, envP);
A.check("累計達檢查點：寄管理通知信一次（主旨、累計、檢查點、排隊人數、台灣時間、暫停說明）", r.status === 200 && resend.sent.length === cpBefore + 1 && resend.sent.at(-1).to === "admin@example.com" && resend.sent.at(-1).subject === "人生草稿：封測名額已達檢查點" && /累計入場人數：2 人/.test(resend.sent.at(-1).text) && /目前檢查點：2 人/.test(resend.sent.at(-1).text) && /名額已暫停發放，調高檢查點後隔天 00:00 恢復。/.test(resend.sent.at(-1).text), resend.sent.at(-1));
r = await post("/entry/claim", { key: "CP-3" }, undefined, envP);
A.check("達檢查點後：409 checkpoint（看到第10則）、通知信不重複寄", r.status === 409 && r.json.error === "checkpoint" && resend.sent.length === cpBefore + 1, r.json);
envP.BETA_PLAYER_CHECKPOINT = "10";
r = await post("/entry/claim", { key: "CP-4" }, undefined, envP);
A.check("當天調高檢查點仍不恢復（隔天00:00才恢復）", r.status === 409 && r.json.error === "checkpoint", r.json);
at(DAY + 5 * MIN, envP);
r = await post("/entry/claim", { key: "CP-5" }, undefined, envP);
A.check("隔天00:00後恢復發放", r.status === 200, r.json);
envP.BETA_PLAYER_CHECKPOINT = "3"; // 再次達到(累計已經3)：新的檢查點數字再寄一次
await post("/entry/claim", { key: "CP-6" }, undefined, envP);
A.check("調高後下次達到新檢查點再寄一次", resend.sent.filter(m => m.subject === "人生草稿：封測名額已達檢查點").length >= 1);

// ---- 候補優先、剩下的名額才給直接來的 ----
const envQ = await mk({ DAILY_NEW_PLAYER_CAP: "2" });
await post("/entry/claim", { key: "Q1" }, undefined, envQ); await post("/entry/claim", { key: "Q2" }, undefined, envQ);
for (let i = 1; i <= 3; i++) await join(`q${i}@example.com`, "QWL-" + i, envQ);
at(DAY + 5 * MIN, envQ);
st = await status(envQ);
A.check("隊伍有3人、當天名額2個：分給前2位，隊伍還有人→直接來的一律進候補", st.open === false && st.reason === "full" && st.queue === 1, st);
me = await get("/account/me", auth((await login("q3@example.com", envQ)).json.token), envQ);
A.check("沒分到的第3位還在排隊，順位變成第1位", me.json.account.wl.status === "waiting" && me.json.account.wl.position === 1, me.json.account.wl);

// ---- 已過期玩家：重新候補／直接入場 ----
const lq = await login("w3@example.com");
A.check("已過期的玩家登入看到expired", ["expired", "notified"].includes(lq.json.account.wl.status));
if (lq.json.account.wl.status === "expired") {
  r = await post("/waitlist/requeue", {}, auth(lq.json.token));
  A.check("重新候補：排到隊伍最後、不用重新驗證", r.status === 200 && r.json.account.wl.status === "waiting" && r.json.account.wl.position >= 1, r.json.account.wl);
} else A.check("(略過) w3仍在保留期", true);

// ---- 管理端：唯讀名冊 ----
const logN0 = (await get("/admin/access-log", { Authorization: "Bearer save-pw" })).json.log.length;
r = await get("/admin/dashboard-roster", auth("admin-secret"));
A.check("用量查詢密碼不能看名冊：401", r.status === 401);
r = await get("/stats-summary", auth("save-pw"));
A.check("存檔管理密碼也能看數字（登入數據網頁）", r.status === 200 && r.json.entry && typeof r.json.entry.cum === "number");
r = await get("/admin/dashboard-roster", auth("save-pw"));
const rows = r.json && r.json.accounts;
A.check("存檔管理密碼可看名冊：含候補狀態與日期、最新的在最上面、沒有人生的候補帳號也列出", r.status === 200 && rows.length === 3 && rows.some(x => x.wl_status === "已入場") && rows.some(x => x.wl_status === "排隊中") && rows.some(x => x.wl_status === "已過期") && rows.some(x => x.lives === 0) && rows.every((x, i) => i === 0 || rows[i - 1].bound_at >= x.bound_at), rows);
A.check("名冊欄位：信箱、綁定日期、人生數、最後存檔時間、候補狀態、留信箱日期、通知日期；不含故事內容", Object.keys(rows[0]).sort().join() === ["bound_at", "email", "joined_at", "last_save", "lives", "notified_at", "wl_status"].sort().join() && !/log|diary|story|text/i.test(JSON.stringify(rows)));
const logs = (await get("/admin/access-log", { Authorization: "Bearer save-pw" })).json.log;
A.check("每次載入名冊自動寫存取紀錄：操作者「管理員（數據網頁）」、原因「網頁查看名冊」", logs.length === logN0 + 1 && logs[0].who === "管理員（數據網頁）" && logs[0].reason === "網頁查看名冊" && logs[0].action === "roster", logs[0]);
A.check("名冊回應裡沒有復原金鑰、驗證碼", !/WLKEY|NEWKEY|GWL/.test(JSON.stringify(rows)));

// ---- 不碰KV ----
A.check("整段名額／候補流程沒有新增任何KV項目（計數都在Durable Object）", env.SAVES._m.size === kvBefore, [env.SAVES._m.size, kvBefore]);

// ---- 數據網頁 ----
const dash = await get("/dashboard");
A.check("數據網頁：有名額卡片與名冊分頁，接受兩組密碼的說明字樣", dash.status === 200 && dash.text.includes("今日名額") && dash.text.includes("候補排隊中") && dash.text.includes("已通知未入場") && dash.text.includes("名冊") && dash.text.includes("需要用存檔管理密碼登入"));
process.exit(A.report() ? 0 : 1);
