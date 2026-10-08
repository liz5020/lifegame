// 2026-10-01 十、10.13.6 管理端(2026-10-04門牌改版：索引以「門牌＋格子」記錄)：存檔索引(DO索引、下次寫入補建)、名冊、單一存檔查看(必填誰與原因、先記錄)、刪除、存取紀錄180天、
// 復原金鑰不出現在任何回應／索引／紀錄、玩家端存讀檔不受影響（全程假上游，不打真實API）
import zlib from "zlib";
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.13.6 管理端");
const resend = H.makeFakeResend(); H.installUpstream(H.makeFakeAnthropic(), resend);
const NOW = Date.parse("2026-10-01T03:00:00Z");
const mk = (cloud) => H.makeAccountEnv({ CLOUD_SAVE_ENABLED: cloud, SAVE_ADMIN_TOKEN: "save-admin-pw", TEST_NOW_MS: String(NOW) });
const env = await mk("false");
const post = (path, body, headers, e = env) => H.callWorker(e, { path, body, headers });
const get = (path, headers, e = env) => H.callWorker(e, { method: "GET", path, headers });
const adm = { Authorization: "Bearer save-admin-pw" };
const KEY = "ABCD-1234-EF56-7890-AB12"; // 真實格式的金鑰(20碼十六進位)，管理端用格式辨認並遮蔽
const ACCT_KEY = "1234-5678-9ABC-DEF0-1234";
const pack = (state) => ({ enc: "gzip-b64", z: zlib.gzipSync(Buffer.from(JSON.stringify(state))).toString("base64") });
const state1 = { name: "林未綁", turnCount: 10, cloudHome: { key: KEY, slot: 0 }, note: "金鑰是" + KEY + "喔", log: [{ action: "自由書寫原文：我想去海邊", text: "海風吹來。" }] };

// ---- 玩家端：舊名稱(搬遷前以金鑰原文為名)的存檔靠保險期照常可讀；新存檔寫入時補建索引 ----
await env.SAVES.put("save:LEGACYKEY01:0", JSON.stringify({ meta: { name: "舊存檔" }, state: { name: "舊存檔", log: [] } }));
const legacyLoad = await get("/load?key=LEGACYKEY01&slot=0");
A.check("玩家端：既有(舊)存檔照常可讀，不因管理端而讀不到", legacyLoad.status === 200 && legacyLoad.json.success === true);
let list0 = (await get("/admin/saves", adm)).json;
A.check("沒有寫入過的舊存檔不在索引裡(搬遷前不回填)", list0.success && list0.saves.length === 0);
const s1 = await post("/save", Object.assign({ key: KEY, slot: 0, meta: { name: "林未綁", age: 16, stage: "高中", lid: "lifeunbound1" } }, pack(state1)));
const back = await get(`/load?key=${KEY}&slot=0`);
A.check("玩家端：存檔、以復原金鑰讀回，內容不變", s1.json.success === true && back.json.enc === "gzip-b64" && JSON.parse(zlib.gunzipSync(Buffer.from(back.json.z, "base64")).toString()).name === "林未綁");
const slots = await get(`/slots?key=${KEY}`);
A.check("玩家端：/slots 仍回這把金鑰的人生", slots.json.slots[0] && slots.json.slots[0].meta.name === "林未綁");
// 舊存檔下次寫入時寫到門牌位置並補建索引
await post("/save", { key: "LEGACYKEY01", slot: 0, meta: { name: "舊存檔", age: 40, stage: "中年" }, state: { name: "舊存檔", log: [] } });
const list1 = (await get("/admin/saves", adm)).json;
A.check("索引：新存檔與『下次寫入的舊存檔』都補建了(2026-10-03：只列lid與最後存檔時間，沒有名字／年齡／階段)", list1.saves.length === 2 && list1.saves.some(x => x.lid === "lifeunbound1" && x.last_save === NOW) && list1.saves.some(x => x.lid === null && /^[0-9a-f]{8}\.[0-2]$/.test(x.code)) && !JSON.stringify(list1).includes("林未綁") && list1.saves.every(x => !("info" in x) && !("name" in x) && !("age" in x)));
const code1 = list1.saves.find(x => x.lid === null).code; // 舊存檔(沒有lid)的把手
const codeUnbound = (await get(`/admin/save?lid=lifeunbound1&who=t&reason=t`, adm)).json; // 以lid找到未綁存檔
A.check("以人生代號lid就能查看未綁存檔", codeUnbound.success === true && codeUnbound.lid === "lifeunbound1");
await get("/admin/access-log", adm); // (上一筆查看會留紀錄，後面的計數從這裡起算)
const KEYLEN = 0;

// ---- 索引：門牌＋格子，不含金鑰原文 ----
A.check("代號是『門牌前8碼.格子』，不等於金鑰本身", /^[0-9a-f]{8}\.[0-2]$/.test(code1) && !KEY.includes(code1));
const locKey = H.loc(KEY);
A.check("索引以門牌＋格子為名(y:門牌:格子)，門牌是64碼雜湊", env.ACCOUNTS._store.has("y:" + locKey + ":0") && /^[0-9a-f]{64}$/.test(locKey));
A.check("索引裡沒有復原金鑰原文(DO儲存的名稱與內容；帳號紀錄本身不在本次範圍)", ![...env.ACCOUNTS._store.entries()].some(([k, v]) => !k.startsWith("a:") && (k.includes(KEY) || k.includes("LEGACYKEY01") || JSON.stringify(v).includes(KEY) || JSON.stringify(v).includes("LEGACYKEY01"))));
A.check("索引清單回應沒有復原金鑰", !JSON.stringify(list1).includes(KEY) && !JSON.stringify(list1).includes("LEGACYKEY01"));
A.check("KV裡所有名稱都沒有這把金鑰原文(存檔、行動點…都用門牌)；舊名稱save:LEGACYKEY01:0是搬遷前遺留", ![...env.SAVES._m.keys()].some(k => k.includes(KEY)) && env.SAVES._m.has("save:" + H.loc("LEGACYKEY01") + ":0"));
const lowerKey = await get(`/load?key=${encodeURIComponent(KEY.toLowerCase())}&slot=0`);
const noDash = await get(`/load?key=${KEY.replace(/-/g, "")}&slot=0`);
A.check("貼成小寫、少了連字號也找得到同一份存檔(10.8.2統一格式)", lowerKey.status === 200 && noDash.status === 200);

// ---- 密碼 ----
A.check("沒帶密碼401、錯誤密碼401、用量查詢的密碼不能進管理端", (await get("/admin/saves")).status === 401 && (await get("/admin/saves", { Authorization: "Bearer x" })).status === 401 && (await get("/admin/saves", { Authorization: "Bearer admin-secret" })).status === 401);
const noTok = await mk("false"); delete noTok.SAVE_ADMIN_TOKEN;
A.check("沒設SAVE_ADMIN_TOKEN：503", (await get("/admin/saves", adm, noTok)).status === 503);
const noSecret = await mk("false"); delete noSecret.SAVE_LOCATION_SECRET;
const sv = await post("/save", Object.assign({ key: "NOSECRET0001", slot: 0, meta: { name: "x" } }, pack({ name: "x" })), undefined, noSecret);
A.check("沒設SAVE_LOCATION_SECRET：存檔類請求回503(不用壞掉的密鑰算位置)；太短的密鑰同樣視為沒設", sv.status === 503 && (await post("/save", Object.assign({ key: "NOSECRET0001", slot: 0, meta: {} }, pack({})), undefined, Object.assign({}, noSecret, { SAVE_LOCATION_SECRET: "short" }))).status === 503);

// ---- 查看單一存檔 ----
const logN0 = (await get("/admin/access-log", adm)).json.log.length;
const noWho = await get(`/admin/save?lid=lifeunbound1`, adm);
A.check("查看必須填誰與原因(缺少回400，且沒有留下紀錄)", noWho.status === 400 && (await get("/admin/access-log", adm)).json.log.length === logN0);
const view = await get(`/admin/save?lid=lifeunbound1&raw=1&who=${encodeURIComponent("管理員小明")}&reason=${encodeURIComponent("玩家回報劇情卡住")}`, adm);
A.check("查看：回傳還原後的存檔(選擇、自由書寫原文、AI劇情都在)", view.status === 200 && view.json.state.log[0].action === "自由書寫原文：我想去海邊" && view.json.state.log[0].text === "海風吹來。" && view.json.text.includes("海風吹來。") && view.json.text.includes("自由書寫原文：我想去海邊"));
const viewNoRaw = await get(`/admin/save?lid=lifeunbound1&who=a&reason=b`, adm);
A.check("可讀文字：預設只回text不回原始state，文字裡的金鑰也遮蔽", viewNoRaw.json.state === undefined && viewNoRaw.json.text.includes("人生代號：lifeunbound1") && !JSON.stringify(viewNoRaw.json).includes(KEY));
A.check("復原金鑰一律遮蔽(cloudHome移除、文字裡的金鑰換掉)，回應任何地方都沒有金鑰", !JSON.stringify(view.json).includes(KEY) && view.json.state.cloudHome === undefined && view.json.state.note.includes("[復原金鑰已遮蔽]"));
let log = (await get("/admin/access-log", adm)).json.log;
const mine = log.find(x => x.who === "管理員小明");
A.check("存取紀錄：誰、何時、哪份存檔(代號)、原因；不含金鑰", !!mine && mine.reason === "玩家回報劇情卡住" && /^[0-9a-f]{8}\.[0-2]$/.test(mine.code) && mine.lid === "lifeunbound1" && mine.at === NOW && mine.action === "view" && !JSON.stringify(log).includes(KEY));
// 不存在的代號
A.check("不存在的代號404、格式不對400", (await get(`/admin/save?code=00000000.0&who=a&reason=b`, adm)).status === 404 && (await get("/admin/save?code=zz&who=a&reason=b", adm)).status === 400);

// ---- 名冊：已綁帳號 ----
await post("/account/send-code", { email: "roster@example.com" }, { "CF-Connecting-IP": "7.7.7.1" });
const bind = (await post("/account/bind", { email: "roster@example.com", code: resend.lastCode("roster@example.com"), key: ACCT_KEY, lives: [{ lid: "liferoster1", pool: { daily: 5, gift: 25 } }] })).json;
await post("/save", Object.assign({ key: ACCT_KEY, slot: 0, meta: { name: "林帳號", age: 20, stage: "大學", lid: "liferoster1" } }, pack({ name: "林帳號", cloudHome: { key: ACCT_KEY, slot: 0 } })));
const rosterNo = await get("/admin/roster", adm);
const logR0 = (await get("/admin/access-log", adm)).json.log.length;
A.check("名冊必填who與reason，缺少回400且不留紀錄", rosterNo.status === 400 && (await get("/admin/access-log", adm)).json.log.length === logR0);
const roster = (await get("/admin/roster?who=me&reason=" + encodeURIComponent("核對名冊"), adm)).json;
A.check("名冊每次使用都先寫存取紀錄(action=roster)", (await get("/admin/access-log", adm)).json.log.some(x => x.action === "roster" && x.who === "me" && x.reason === "核對名冊"));
const me = roster.accounts.find(a => a.email === "roster@example.com");
A.check("名冊：信箱、人生代號lid、綁定日期、最後存檔時間；沒有故事、日記或其他欄位", !!me && me.lives.length === 1 && me.lives[0].lid === "liferoster1" && me.lives[0].last_save === NOW && typeof me.bound_at === "number" && !("gifts" in me) && !("consent" in me) && !JSON.stringify(roster).includes("林帳號"), me);
A.check("名冊與索引都沒有帳號的復原金鑰", !JSON.stringify(roster).includes(ACCT_KEY) && !JSON.stringify((await get("/admin/saves", adm)).json).includes(ACCT_KEY));
const acctSave = (await get("/admin/saves", adm)).json.saves.find(x => x.lid === "liferoster1");
A.check("已綁帳號的存檔在列表裡帶人生代號(可對到名冊)", !!acctSave && acctSave.last_save === NOW);
const acctView = await get(`/admin/save?lid=liferoster1&raw=1&who=me&reason=${encodeURIComponent("核對")}`, adm);
A.check("已綁存檔查看同樣遮蔽金鑰", acctView.status === 200 && !JSON.stringify(acctView.json).includes(ACCT_KEY) && acctView.json.state.name === "林帳號");

// ---- 刪除(10.13.5) ----
const delNo = await post("/admin/save/delete", { lid: "lifeunbound1" }, adm);
A.check("刪除也要填誰與原因", delNo.status === 400);
const del = await post("/admin/save/delete", { lid: "lifeunbound1", who: "管理員小明", reason: "玩家來信要求刪除" }, adm);
A.check("刪除：KV存檔與索引都移除，玩家端再讀回404", del.json.success === true && (await get(`/load?key=${KEY}&slot=0`)).status === 404 && !(await get("/admin/saves", adm)).json.saves.some(x => x.lid === "lifeunbound1"));
log = (await get("/admin/access-log", adm)).json.log;
A.check("刪除也留下紀錄(action=delete)", log.some(x => x.action === "delete" && x.who === "管理員小明" && x.lid === "lifeunbound1") && !JSON.stringify(log).includes(KEY));

// ---- 存取紀錄保留180天 ----
const before = log.length;
env.TEST_NOW_MS = String(NOW + 181 * 24 * 3600 * 1000);
await get(`/admin/save?lid=liferoster1&who=me&reason=${encodeURIComponent("半年後")}`, adm);
log = (await get("/admin/access-log", adm)).json.log;
A.check("超過180天的紀錄清掉，只剩新的一筆", before >= 3 && log.length === 1 && log[0].reason === "半年後", { before, now: log.length });
A.check("存取紀錄只放Durable Object，不放KV", ![...env.SAVES._m.keys()].some(k => /log|access|admin/i.test(k)));
// ---- 2026-10-03：封存包每階段只寫1次；暫停期間封存包與主存檔都可寫；查看依階段整理 ----
const SK = "5A5A-1111-2222-3333-4444";
const pk = (id, text) => ({ key: SK, slot: 0, id, ...pack({ v: 1, id, key: "highschool", log: [{ age: 16, timeLabel: "開學", action: "選擇A", text }] }) });
const p1 = await post("/stage-pack", pk("lifepp1", "第一版內容"));
const p1b = await post("/stage-pack", pk("lifepp1", "被改過的內容"));
const p1get = await get(`/stage-pack?key=${SK}&id=lifepp1`);
A.check("封存包：暫停期間可寫；同一個階段第二次不覆蓋(只寫1次)", p1.json.success === true && p1b.json.success === true && p1b.json.existed === true && JSON.parse(zlib.gunzipSync(Buffer.from(p1get.json.z, "base64")).toString()).log[0].text === "第一版內容");
A.check("封存包：沒有金鑰、內容過大都拒絕", (await post("/stage-pack", Object.assign(pk("lifepp2", "x"), { key: "" }))).status === 400 && (await post("/stage-pack", { key: SK, slot: 0, id: "lifepp3", enc: "json", z: "x".repeat(1100000) })).status === 400);
await post("/save", Object.assign({ key: SK, slot: 0, meta: { lid: "lifestage01" } }, pack({ age: 18, name: "階段人", stagePacks: [{ id: "lifepp1", key: "highschool", from: 0, count: 1, uploaded: true }], log: [{ age: 18, timeLabel: "大學入學", action: "選擇B", text: "進了大學。" }] })));
const staged = (await get("/admin/save?lid=lifestage01&who=a&reason=b", adm)).json;
const iHigh = staged.text.indexOf("第一版內容"), iUni = staged.text.indexOf("進了大學。");
A.check("查看結果依人生階段順序列出：封存包的階段在前、目前階段在後，各附日記", staged.success && staged.text.includes("第1階段：highschool") && staged.text.includes("目前階段") === false && staged.text.includes("第2階段（目前）") && iHigh > 0 && iUni > iHigh && !staged.text.includes(SK));
// ---- 2026-10-03補充二：封存包頻率限制(每來源每小時60次，設定值可調)與孤兒封存包每日清理 ----
const { cleanupOrphanStagePacks } = await import("../worker/worker.js");
const ipH = { "CF-Connecting-IP": "9.9.9.9" };
let okN = 0, lastRate = null;
for (let i = 0; i < 61; i++) { const r = await post("/stage-pack", { key: "RATEKEY00001", slot: 0, id: "liferate" + i, ...pack({ i }) }, ipH); if (r.status === 200) okN++; else lastRate = r; }
A.check("頻率限制：同一來源每小時最多寫入60次，第61次拒絕(429)，被擋的沒有寫進去", okN === 60 && lastRate && lastRate.status === 429 && (await get("/stage-pack?key=RATEKEY00001&id=liferate60")).status === 404);
A.check("頻率限制：換一個來源不受影響；已存在的封存包重送不吃額度", (await post("/stage-pack", { key: "RATEKEY00002", slot: 0, id: "liferatebb", ...pack({}) }, { "CF-Connecting-IP": "9.9.9.8" })).status === 200 && (await post("/stage-pack", { key: "RATEKEY00001", slot: 0, id: "liferate0", ...pack({}) }, ipH)).json.existed === true);
env.TEST_NOW_MS = String(NOW + 3700 * 1000);
A.check("頻率限制：過了這個小時就重新計算", (await post("/stage-pack", { key: "RATEKEY00001", slot: 0, id: "liferate60", ...pack({}) }, ipH)).status === 200);
// 2026-10-08(10.16.15)：封存包寫入計數(來源雜湊)也由每小時排程清除，沒人再寫入時不會留超過2小時
const { accountsCall } = await import("../worker/gate.js");
const pu1 = await accountsCall(env, { op: "purge_abuse" });
A.check("防濫用清除：當下這一小時的封存包寫入計數保留(排程不會誤刪還在計算的小時)", pu1.ok && pu1.purged.pack_rate === 0, pu1);
env.TEST_NOW_MS = String(NOW + 3 * 3600 * 1000);
const pu3 = await accountsCall(env, { op: "purge_abuse" });
A.check("防濫用清除：再過2小時、期間沒人寫入，排程把剩下的封存包計數清掉(沒留超過2小時)", pu3.purged.pack_rate === 1 && (await post("/stage-pack", { key: "RATEKEY00001", slot: 0, id: "liferate0", ...pack({}) }, ipH)).json.existed === true, pu3);
env.TEST_NOW_MS = String(NOW + 3700 * 1000);
const envLim = await mk("false"); envLim.STAGE_PACK_RATE_PER_HOUR = "2";
const lim = []; for (let i = 0; i < 3; i++) lim.push((await post("/stage-pack", { key: "RATEKEY00003", slot: 0, id: "limx" + i, ...pack({}) }, { "CF-Connecting-IP": "9.9.9.7" }, envLim)).status);
A.check("頻率上限是設定值(STAGE_PACK_RATE_PER_HOUR=2時第3次被擋)，不寫死", lim.join() === "200,200,429", lim);
A.check("頻率計數放Durable Object，不放KV", ![...env.SAVES._m.keys()].some(k => /rate|^r:/.test(k) && !k.startsWith("stagepack:")));

const D = 86400000, t0 = NOW + 10 * D;
const envC = await mk("false"); envC.TEST_NOW_MS = String(t0);
await envC.SAVES.put("stagepack:ORPHANKEY001:lifeo1", JSON.stringify({ enc: "json", z: "{}", at: t0 - 8 * D }));          // 8天、無主存檔 → 刪
await envC.SAVES.put("stagepack:ORPHANKEY002:lifeo2", JSON.stringify({ enc: "json", z: "{}", at: t0 - 6 * D }));          // 6天 → 留
await envC.SAVES.put("stagepack:HASMAIN00001:lifeo3", JSON.stringify({ enc: "json", z: "{}", at: t0 - 30 * D }));         // 30天但有主存檔(slot 2) → 留
await envC.SAVES.put("save:HASMAIN00001:2", JSON.stringify({ meta: {}, state: {} }));
await envC.SAVES.put("stagepack:OLDNOSTAMP01:lifeo4", JSON.stringify({ enc: "json", z: "{}" }));                          // 舊封存包沒有at → 補記現在時間、不刪
const L1 = H.loc("LOCORPHAN001"), L2 = H.loc("LOCHASMAIN01");
await envC.SAVES.put(`stagepack:${L1}:lifol1`, JSON.stringify({ enc: "json", z: "{}", at: t0 - 8 * D }));   // 門牌名稱、8天、無主存檔 → 刪
await envC.SAVES.put(`stagepack:${L2}:lifol2`, JSON.stringify({ enc: "json", z: "{}", at: t0 - 30 * D }));  // 門牌名稱、有主存檔 → 留
await envC.SAVES.put(`save:${L2}:1`, JSON.stringify({ meta: {}, state: {} }));
const c1 = await cleanupOrphanStagePacks(envC);
A.check("每日清理(10.8.2)：門牌命名的封存包同樣依門牌比對主存檔", c1.deleted === 2 && (await envC.SAVES.get(`stagepack:${L1}:lifol1`)) === null && (await envC.SAVES.get(`stagepack:${L2}:lifol2`)) !== null);
A.check("每日清理：超過7天且沒有主存檔的刪除；未滿7天、已有主存檔(任一格子)的保留", c1.deleted === 2 && (await envC.SAVES.get("stagepack:ORPHANKEY001:lifeo1")) === null && (await envC.SAVES.get("stagepack:ORPHANKEY002:lifeo2")) !== null && (await envC.SAVES.get("stagepack:HASMAIN00001:lifeo3")) !== null);
A.check("每日清理：舊封存包沒有時間戳就補記，不當場刪；7天後仍無主存檔才刪", JSON.parse(await envC.SAVES.get("stagepack:OLDNOSTAMP01:lifeo4")).at === t0);
envC.TEST_NOW_MS = String(t0 + 8 * D);
const c2 = await cleanupOrphanStagePacks(envC);
A.check("每日清理：補記的封存包7天後清掉；清理後該階段可重新傳1次", c2.deleted >= 1 && (await envC.SAVES.get("stagepack:OLDNOSTAMP01:lifeo4")) === null && (await post("/stage-pack", { key: "ORPHANKEY001", slot: 0, id: "lifeo1", ...pack({}) }, { "CF-Connecting-IP": "9.9.9.6" }, envC)).json.success === true);
const logged = []; const origLog = console.log; console.log = (...a) => { logged.push(a.join(" ")); };
const worker = (await import("../worker/worker.js")).default;
const waits = []; await worker.scheduled({}, envC, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits);
console.log = origLog;
A.check("排程入口scheduled會跑清理，並把清理數量寫進執行紀錄", logged.some(x => /孤兒封存包清理：檢查\d+個，刪除\d+個/.test(x)));
const envD = await mk("false"); envD.STAGE_PACK_ORPHAN_DAYS = "1"; envD.TEST_NOW_MS = String(t0);
await envD.SAVES.put("stagepack:ORPHANKEY009:lifeo9", JSON.stringify({ enc: "json", z: "{}", at: t0 - 2 * D }));
A.check("孤兒保留天數是設定值(STAGE_PACK_ORPHAN_DAYS=1時2天就清)，不寫死", (await cleanupOrphanStagePacks(envD)).deleted === 1);
process.exit(A.report() ? 0 : 1);
