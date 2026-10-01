// 2026-10-01 十、10.13.6 管理端：存檔索引(金鑰雜湊＋伺服器密鑰、DO索引、下次寫入補建)、名冊、單一存檔查看(必填誰與原因、先記錄)、刪除、存取紀錄180天、
// 復原金鑰不出現在任何回應／索引／紀錄、玩家端存讀檔不受影響（全程假上游，不打真實API）
import zlib from "zlib";
import crypto from "crypto";
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.13.6 管理端");
const resend = H.makeFakeResend(); H.installUpstream(H.makeFakeAnthropic(), resend);
const NOW = Date.parse("2026-10-01T03:00:00Z");
const mk = (cloud) => H.makeAccountEnv({ CLOUD_SAVE_ENABLED: cloud, SAVE_INDEX_SECRET: "idx-secret-1", SAVE_ADMIN_TOKEN: "save-admin-pw", TEST_NOW_MS: String(NOW) });
const env = await mk("false");
const post = (path, body, headers, e = env) => H.callWorker(e, { path, body, headers });
const get = (path, headers, e = env) => H.callWorker(e, { method: "GET", path, headers });
const adm = { Authorization: "Bearer save-admin-pw" };
const KEY = "UNBOUNDKEY001";
const pack = (state) => ({ enc: "gzip-b64", z: zlib.gzipSync(Buffer.from(JSON.stringify(state))).toString("base64") });
const state1 = { name: "林未綁", turnCount: 10, cloudHome: { key: KEY, slot: 0 }, note: "金鑰是" + KEY + "喔", log: [{ action: "自由書寫原文：我想去海邊", text: "海風吹來。" }] };

// ---- 玩家端：舊存檔(沒有索引)照常可讀；新存檔寫入時補建索引 ----
await env.SAVES.put("save:LEGACYKEY01:0", JSON.stringify({ meta: { name: "舊存檔" }, state: { name: "舊存檔", log: [] } }));
const legacyLoad = await get("/load?key=LEGACYKEY01&slot=0");
A.check("玩家端：既有(舊)存檔照常可讀，不因管理端而讀不到", legacyLoad.status === 200 && legacyLoad.json.success === true);
let list0 = (await get("/admin/saves", adm)).json;
A.check("沒有寫入過的舊存檔不在索引裡(不做一次性回填)", list0.success && list0.saves.length === 0);
const s1 = await post("/save", Object.assign({ key: KEY, slot: 0, meta: { name: "林未綁", age: 16, stage: "高中" } }, pack(state1)));
const back = await get(`/load?key=${KEY}&slot=0`);
A.check("玩家端：存檔、以復原金鑰讀回，內容不變", s1.json.success === true && back.json.enc === "gzip-b64" && JSON.parse(zlib.gunzipSync(Buffer.from(back.json.z, "base64")).toString()).name === "林未綁");
const slots = await get(`/slots?key=${KEY}`);
A.check("玩家端：/slots 仍回這把金鑰的人生", slots.json.slots[0] && slots.json.slots[0].meta.name === "林未綁");
// 舊存檔下次寫入時補建
await post("/save", { key: "LEGACYKEY01", slot: 0, meta: { name: "舊存檔", age: 40, stage: "中年" }, state: { name: "舊存檔", log: [] } });
const list1 = (await get("/admin/saves", adm)).json;
A.check("索引：新存檔與『下次寫入的舊存檔』都補建了", list1.saves.length === 2 && list1.saves.some(x => x.info.name === "林未綁") && list1.saves.some(x => x.info.name === "舊存檔"));
const code1 = list1.saves.find(x => x.info.name === "林未綁").code;

// ---- 內部代號：金鑰單向雜湊＋伺服器密鑰 ----
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
A.check("代號是24碼，不等於金鑰本身或其單純雜湊(混入伺服器密鑰)", /^[0-9a-f]{24}$/.test(code1) && !KEY.includes(code1) && code1 !== sha(KEY).slice(0, 24) && code1 !== sha(KEY + "|0").slice(0, 24) && code1 !== sha("code|" + KEY + "|0").slice(0, 24));
const env2 = await mk("false"); env2.SAVE_INDEX_SECRET = "idx-secret-2"; env2.SAVES = env.SAVES;
await post("/save", Object.assign({ key: KEY, slot: 0, meta: { name: "林未綁" } }, pack(state1)), undefined, env2);
const codeOther = (await get("/admin/saves", adm, env2)).json.saves[0].code;
A.check("換一組密鑰，同一把金鑰算出不同代號", codeOther !== code1);
A.check("索引裡沒有復原金鑰原文(DO儲存的內容)", ![...env.ACCOUNTS._store.entries()].some(([k, v]) => k.startsWith("x:") && JSON.stringify(v).includes(KEY)));
A.check("索引清單回應沒有復原金鑰", !JSON.stringify(list1).includes(KEY) && !JSON.stringify(list1).includes("LEGACYKEY01"));

// ---- 密碼 ----
A.check("沒帶密碼401、錯誤密碼401、用量查詢的密碼不能進管理端", (await get("/admin/saves")).status === 401 && (await get("/admin/saves", { Authorization: "Bearer x" })).status === 401 && (await get("/admin/saves", { Authorization: "Bearer admin-secret" })).status === 401);
const noTok = await mk("false"); delete noTok.SAVE_ADMIN_TOKEN;
A.check("沒設SAVE_ADMIN_TOKEN：503", (await get("/admin/saves", adm, noTok)).status === 503);
const noSecret = await mk("false"); delete noSecret.SAVE_INDEX_SECRET;
const sv = await post("/save", Object.assign({ key: "NOSECRET0001", slot: 0, meta: { name: "x" } }, pack({ name: "x" })), undefined, noSecret);
A.check("沒設SAVE_INDEX_SECRET：玩家存檔照常成功、管理端503", sv.json.success === true && (await get("/admin/saves", adm, noSecret)).status === 503);

// ---- 查看單一存檔 ----
const noWho = await get(`/admin/save?code=${code1}`, adm);
A.check("查看必須填誰與原因(缺少回400，且沒有留下紀錄)", noWho.status === 400 && (await get("/admin/access-log", adm)).json.log.length === 0);
const view = await get(`/admin/save?code=${code1}&who=${encodeURIComponent("管理員小明")}&reason=${encodeURIComponent("玩家回報劇情卡住")}`, adm);
A.check("查看：回傳還原後的存檔(選擇、自由書寫原文、AI劇情都在)", view.status === 200 && view.json.state.log[0].action === "自由書寫原文：我想去海邊" && view.json.state.log[0].text === "海風吹來。" && view.json.info.name === "林未綁");
A.check("復原金鑰一律遮蔽(cloudHome移除、文字裡的金鑰換掉)，回應任何地方都沒有金鑰", !JSON.stringify(view.json).includes(KEY) && view.json.state.cloudHome === undefined && view.json.state.note.includes("[復原金鑰已遮蔽]"));
let log = (await get("/admin/access-log", adm)).json.log;
A.check("存取紀錄：誰、何時、哪份存檔(代號)、原因；不含金鑰", log.length === 1 && log[0].who === "管理員小明" && log[0].reason === "玩家回報劇情卡住" && log[0].code === code1 && log[0].at === NOW && log[0].action === "view" && !JSON.stringify(log).includes(KEY));
// 不存在的代號
A.check("不存在的代號404、格式不對400", (await get(`/admin/save?code=${"0".repeat(24)}&who=a&reason=b`, adm)).status === 404 && (await get("/admin/save?code=zz&who=a&reason=b", adm)).status === 400);

// ---- 名冊：已綁帳號 ----
await post("/account/send-code", { email: "roster@example.com" }, { "CF-Connecting-IP": "7.7.7.1" });
const bind = (await post("/account/bind", { email: "roster@example.com", code: resend.lastCode("roster@example.com"), key: "ACCTKEY00001", lives: [{ lid: "liferoster1", pool: { daily: 5, gift: 25 } }] })).json;
await post("/save", Object.assign({ key: "ACCTKEY00001", slot: 0, meta: { name: "林帳號", age: 20, stage: "大學", lid: "liferoster1" } }, pack({ name: "林帳號", cloudHome: { key: "ACCTKEY00001", slot: 0 } })));
const roster = (await get("/admin/roster", adm)).json;
const me = roster.accounts.find(a => a.email === "roster@example.com");
A.check("名冊：信箱、人生數、啟程禮領取狀態", !!me && me.lives.length === 1 && me.lives[0].lid === "liferoster1" && me.gifts.claimed === 1 && me.gifts.max === 2, me);
A.check("名冊與索引都沒有帳號的復原金鑰", !JSON.stringify(roster).includes("ACCTKEY00001") && !JSON.stringify((await get("/admin/saves", adm)).json).includes("ACCTKEY00001"));
const acctSave = (await get("/admin/saves", adm)).json.saves.find(x => x.info.name === "林帳號");
A.check("已綁帳號的存檔在索引裡帶人生代號(可對到名冊)", acctSave && acctSave.info.lid === "liferoster1");
const acctView = await get(`/admin/save?code=${acctSave.code}&who=me&reason=${encodeURIComponent("核對")}`, adm);
A.check("已綁存檔查看同樣遮蔽金鑰", acctView.status === 200 && !JSON.stringify(acctView.json).includes("ACCTKEY00001") && acctView.json.state.name === "林帳號");

// ---- 刪除(10.13.5) ----
const delNo = await post("/admin/save/delete", { code: code1 }, adm);
A.check("刪除也要填誰與原因", delNo.status === 400);
const del = await post("/admin/save/delete", { code: code1, who: "管理員小明", reason: "玩家來信要求刪除" }, adm);
A.check("刪除：KV存檔與索引都移除，玩家端再讀回404", del.json.success === true && (await get(`/load?key=${KEY}&slot=0`)).status === 404 && !(await get("/admin/saves", adm)).json.saves.some(x => x.code === code1));
log = (await get("/admin/access-log", adm)).json.log;
A.check("刪除也留下紀錄(action=delete)", log.some(x => x.action === "delete" && x.who === "管理員小明" && x.code === code1) && !JSON.stringify(log).includes(KEY));

// ---- 存取紀錄保留180天 ----
const before = log.length;
env.TEST_NOW_MS = String(NOW + 181 * 24 * 3600 * 1000);
await get(`/admin/save?code=${acctSave.code}&who=me&reason=${encodeURIComponent("半年後")}`, adm);
log = (await get("/admin/access-log", adm)).json.log;
A.check("超過180天的紀錄清掉，只剩新的一筆", before >= 3 && log.length === 1 && log[0].reason === "半年後", { before, now: log.length });
A.check("存取紀錄只放Durable Object，不放KV", ![...env.SAVES._m.keys()].some(k => /log|access|admin/i.test(k)));
process.exit(A.report() ? 0 : 1);
