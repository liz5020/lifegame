// 2026-10-04 十、10.8.2／10.13.6：存放位置改用金鑰的單向雜湊「門牌」——
// 統一格式(大小寫／空白／連字號)、所有KV名稱不含金鑰原文、搬遷保險期(讀不到門牌位置改讀舊位置並計數)、
// 一次性搬遷(試算→搬遷→衝突→對帳)、清理(7天且改讀次數0)、金鑰→帳號對照、AP_TEST_KEYS存門牌、位置密鑰沒設好時的行為（全程假上游，不打真實API）
import zlib from "zlib";
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.8.2 門牌");
const resend = H.makeFakeResend(); H.installUpstream(H.makeFakeAnthropic(), resend);
const NOW = Date.parse("2026-10-04T03:00:00Z"), D = 86400000;
const mk = (extra) => H.makeAccountEnv(Object.assign({ SAVE_ADMIN_TOKEN: "save-admin-pw", SAVE_INDEX_SECRET: "old-index-secret", TEST_NOW_MS: String(NOW) }, extra || {}));
const post = (e, path, body, headers) => H.callWorker(e, { path, body, headers });
const get = (e, path, headers) => H.callWorker(e, { method: "GET", path, headers });
const adm = { Authorization: "Bearer save-admin-pw" };
const who = { who: "測試員", reason: "門牌測試" };
const pack = (state) => ({ enc: "gzip-b64", z: zlib.gzipSync(Buffer.from(JSON.stringify(state))).toString("base64") });
const payload = (extra = {}) => JSON.stringify(Object.assign({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false, time_context: { is_prologue: false } }, extra));
const names = (e) => [...e.SAVES._m.keys()];
const KEY = "ABCD-1234-EF56-7890-AB12";
const LOC = H.loc(KEY);

// ---- 1. 統一格式 ----
A.check("門牌＝64碼十六進位；標準／小寫／無連字號／夾空白算出同一個門牌", /^[0-9a-f]{64}$/.test(LOC) && H.loc(KEY.toLowerCase()) === LOC && H.loc(KEY.replace(/-/g, "")) === LOC && H.loc(" abcd 1234-ef56 7890-ab12 ") === LOC && H.loc("OTHER-KEY") !== LOC);
const env = await mk();
await post(env, "/save", Object.assign({ key: KEY, slot: 0, meta: { name: "林門牌", age: 16, stage: "高中", lid: "lifeloc0001" } }, pack({ name: "林門牌" })));
const slotsOf = async (k) => (await get(env, "/slots?key=" + encodeURIComponent(k))).json.slots[0];
A.check("標準、小寫、無連字號三種寫法都列得出格子、讀得到存檔", (await slotsOf(KEY)).meta.name === "林門牌" && (await slotsOf(KEY.toLowerCase())).meta.name === "林門牌" && (await slotsOf(KEY.replace(/-/g, ""))).meta.name === "林門牌" && (await get(env, "/load?key=" + KEY.replace(/-/g, "").toLowerCase() + "&slot=0")).status === 200);
A.check("格式統一後是空字串(例如只有連字號)回400，不會算出一個共用的位置", (await get(env, "/slots?key=" + encodeURIComponent("- - -"))).status === 400 && (await post(env, "/save", { key: "---", slot: 0, meta: {}, state: {} })).status === 400);

// ---- 2. 各類KV名稱都沒有金鑰原文 ----
await post(env, "/claim-gift", { key: KEY, slot: 0 });
await post(env, "/stage-pack", Object.assign({ key: KEY, slot: 0, id: "lifepk001" }, pack({ log: [] })));
await post(env, "/family-book", { key: KEY, id: "bookloc001", book: { owner: "林", chapters: [{ title: "t" }] } });
const t1 = await post(env, "/", { key: KEY, slot: 0, turn_nonce: "n1zzzzzz", life_id: "lifeloc0001", messages: [{ role: "user", content: payload() }] });
await post(env, "/archive", { key: KEY, slot: 1, id: "arcloc001", meta: { name: "林", age: 30 }, purchased: 7, state: { lifeId: "lifeloc0002", name: "林" } });
const ns = names(env);
const hasKey = ns.filter(n => n.includes(KEY) || n.toUpperCase().includes(KEY.replace(/-/g, "")));
const kinds = ["save:", "stagepack:", "archive:", "familybook:", "ap:", "giftclaims:", "wallet:", "usage:life:"];
A.check("AI回合成功(用量與行動點都寫進去)", t1.status === 200, t1.text && t1.text.slice(0, 120));
A.check("八類KV(存檔、封存包、回顧、傳承之書、行動點、領禮、錢包、用量)都用門牌命名，沒有任何名稱含金鑰原文", hasKey.length === 0 && kinds.every(k => ns.some(n => n.startsWith(k + LOC) || n.startsWith(k + LOC.slice(0, 0) + LOC))), { ns: ns.map(n => n.replace(LOC, "<LOC>")) });
A.check("usage:life 名稱格式＝usage:life:門牌:格子:人生代號", ns.includes(`usage:life:${LOC}:0:lifeloc0001`));
A.check("/archives、/archive、/family-book 以三種寫法的金鑰都讀得到", (await get(env, "/archives?key=" + KEY.toLowerCase())).json.archives.length === 1 && (await get(env, "/archive?key=" + KEY.replace(/-/g, "") + "&id=arcloc001")).status === 200 && (await get(env, "/family-book?key=" + KEY.toLowerCase() + "&id=bookloc001")).status === 200 && (await get(env, "/slots?key=" + KEY.toLowerCase())).json.wallet === 7);

// ---- 3. 保險期：舊名稱(金鑰原文)讀得到、計數、寫入走新位置、刪除兩邊都刪 ----
const OLD = "OLDK-1111-2222-3333-4444", OLOC = H.loc(OLD);
await env.SAVES.put(`save:${OLD}:0`, JSON.stringify({ meta: { name: "舊存檔", age: 40, stage: "中年", lid: "lifeold0001" }, state: { name: "舊存檔", log: [] } }));
await env.SAVES.put(`ap:${OLD}:0`, JSON.stringify({ daily: 5, gift: 0, purchased: 0, last: "2026-10-04" }));
await env.SAVES.put(`archive:${OLD}:arcold001`, JSON.stringify({ meta: { name: "舊回顧" }, state: {} }), { metadata: { name: "舊回顧", age: 70, stage: "老年", reincarnations: 0, reason: "ended", endedAt: 1 } });
await env.SAVES.put(`stagepack:${OLD}:lifepkold`, JSON.stringify({ enc: "json", z: "{}", at: NOW }));
await env.SAVES.put(`giftclaims:${OLD}`, "1");
await env.SAVES.put(`wallet:${OLD}`, "9");
const fbN = async () => (await env.ACCOUNTS.get().fetch("https://x/op", { method: "POST", body: JSON.stringify({ op: "loc_state", now: NOW }) }).then(r => r.json())).fb;
const fb0 = await fbN();
const sl = await get(env, "/slots?key=" + OLD);
A.check("保險期：舊名稱的存檔、錢包用金鑰照樣讀得到(讀不到門牌位置才改讀舊位置)", sl.json.slots[0] && sl.json.slots[0].meta.name === "舊存檔" && sl.json.wallet === 9);
A.check("保險期：每次改讀舊位置都計數", (await fbN()) > fb0);
A.check("保險期：舊名稱的回顧清單／封存包也併進來；領禮紀錄沿用(不會讓人重領)", (await get(env, "/archives?key=" + OLD)).json.archives.map(a => a.id).join() === "arcold001" && (await get(env, "/stage-pack?key=" + OLD + "&id=lifepkold")).status === 200 && (await post(env, "/claim-gift", { key: OLD, slot: 0 })).json.granted === false);
await post(env, "/save", { key: OLD, slot: 0, meta: { name: "舊存檔v2", age: 41, lid: "lifeold0001" }, state: { name: "舊存檔v2", log: [] } });
A.check("寫入一律寫門牌位置：新名稱有了、舊名稱沒被改", env.SAVES._m.has(`save:${OLOC}:0`) && JSON.parse(await env.SAVES.get(`save:${OLD}:0`)).meta.name === "舊存檔" && (await slotsOf(OLD)).meta.name === "舊存檔v2");
const fbBefore = await fbN();
await get(env, "/load?key=" + OLD + "&slot=0");
A.check("新位置已有資料就不再改讀舊位置(次數不增加)", (await fbN()) === fbBefore);
await post(env, "/archive", { key: OLD, slot: 0, id: "arcold002", meta: { name: "收掉" }, state: { lifeId: "lifeold0001" } });
A.check("人生結束刪存檔：新舊兩個位置都刪掉，不會從舊名稱復活", !env.SAVES._m.has(`save:${OLOC}:0`) && !env.SAVES._m.has(`save:${OLD}:0`) && (await slotsOf(OLD)) === null);

// ---- 4. 管理端與位置密鑰 ----
const st0 = (await get(env, "/admin/location-status?who=a&reason=b", adm)).json;
A.check("狀態端點：位置密鑰有設好(只回有沒有與長度，不回密鑰)、各類筆數", st0.success && st0.location_secret.set === true && st0.location_secret.length === H.LOC_SECRET.length && !JSON.stringify(st0).includes(H.LOC_SECRET) && st0.classes.length === 8);
const noSec = await mk({ SAVE_LOCATION_SECRET: "" });
A.check("位置密鑰沒設或太短：狀態端點如實回報、存檔類與AI請求都503、綁定503", (await get(noSec, "/admin/location-status?who=a&reason=b", adm)).json.location_secret.set === false && (await get(noSec, "/slots?key=" + KEY)).status === 503 && (await post(noSec, "/", { key: KEY, slot: 0, messages: [] })).status === 503);

// ---- 5. 金鑰→帳號對照(以門牌)與綁定 ----
const bindWith = async (e, email, key, ip) => {
  await post(e, "/account/send-code", { email }, { "CF-Connecting-IP": ip });
  return (await post(e, "/account/bind", { email, code: resend.lastCode(email), key, lives: [] })).json;
};
const BK = "9999-8888-7777-6666-5555";
const b1 = await bindWith(env, "a1@example.com", BK, "8.8.0.1");
const b2 = await bindWith(env, "a2@example.com", BK.toLowerCase().replace(/-/g, ""), "8.8.0.2");
A.check("綁定成功；同一把金鑰(換個寫法)綁第二個信箱仍被拒絕", b1.success === true && b2.success === false && b2.error === "key_linked", b2);
const dos = [...env.ACCOUNTS._store.keys()];
A.check("金鑰→帳號對照以門牌為名(kl:門牌)，DO的名稱裡沒有金鑰原文；沒有新的k:對照", dos.includes("kl:" + H.loc(BK)) && !dos.some(k => k.startsWith("k:")) && !dos.some(k => k.includes(BK)));
// 搬遷前遺留的舊對照(k:金鑰原文)也要擋
const LEG = "ABAB-CDCD-EFEF-0101-2323";
env.ACCOUNTS._store.set("k:" + LEG, "someaid");
const b3 = await bindWith(env, "a3@example.com", LEG, "8.8.0.3");
A.check("保險期：搬遷前遺留的舊對照(k:金鑰原文)同樣擋重複綁定", b3.success === false && b3.error === "key_linked", b3);

// ---- 6. AP_TEST_KEYS 存門牌 ----
const TK = "7E57-0000-AAAA-BBBB-CCCC";
const envT = await mk({ AP_TEST_KEYS: H.loc("OTHER-ONE") + ", " + H.loc(TK) });
const freeTurn = async (k, n) => (await post(envT, "/", { key: k, slot: 0, turn_nonce: "ft" + n + "zzzzzz", life_id: "lifetest01", ap_test_free: true, messages: [{ role: "user", content: payload() }] })).json;
const f1 = await freeTurn(TK, 1), f2 = await freeTurn(TK.toLowerCase(), 2), f3 = await freeTurn(TK.replace(/-/g, ""), 3), f4 = await freeTurn("NOT-LISTED-KEY", 4);
A.check("測試鑰匙(標準、小寫、無連字號)都被AP_TEST_KEYS(門牌名單)認出", f1.lifegame.ap_test_free === true && f2.lifegame.ap_test_free === true && f3.lifegame.ap_test_free === true && f4.lifegame.ap_test_free === false);
const envT2 = await mk({ AP_TEST_KEYS: TK });
A.check("名單若還放金鑰原文(沒換成門牌)就不認，不會默默放行", (await post(envT2, "/", { key: TK, slot: 0, turn_nonce: "ftzzzzzzz", life_id: "lifetest01", ap_test_free: true, messages: [{ role: "user", content: payload() }] })).json.lifegame.ap_test_free === false);

// ---- 7. 搬遷：試算→搬遷→衝突→對帳 ----
const E = await mk({ SAVE_LOCATION_SECRET: H.LOC_SECRET });
const AK = "AAAA-1111-BBBB-2222-CCCC"; // 乾淨的標準格式
const put = (n, v, meta) => E.SAVES.put(n, v, meta ? { metadata: meta } : undefined);
const rec = (name, lid) => JSON.stringify({ meta: { name, age: 30, stage: "職涯", lid }, state: { name } });
await put(`save:${AK}:0`, rec("甲", "lifemig0001"));
await put(`save:${AK}:2`, rec("甲二", "lifemig0002"));
await put(`ap:${AK}:0`, JSON.stringify({ daily: 5, gift: 25, purchased: 0 }));
await put(`archive:${AK}:arcm001`, JSON.stringify({ meta: { name: "回" }, state: {} }), { name: "回", age: 80, stage: "老年", reason: "ended", endedAt: 5 });
await put(`stagepack:${AK}:lifemgpk1`, JSON.stringify({ enc: "json", z: "{}", at: NOW }));
await put(`familybook:${AK}:bookm001`, JSON.stringify({ owner: "甲", chapters: [] }));
await put(`giftclaims:${AK}`, "1");
await put(`wallet:${AK}`, "3");
await put(`wallet:${H.loc(AK)}`, "50"); // 新版已經寫過新位置：搬遷不能蓋掉
await put(`usage:life:${AK}:0:lifemig0001`, JSON.stringify({ turn: { calls: 1 } }), { c: 1 });
const lower = "bbbb-3333-cccc-4444-dddd", upper = lower.toUpperCase(); // 同一把金鑰的兩種寫法 → 衝突
await put(`save:${upper}:1`, rec("標準格式乙", "lifemig0003"));
await put(`save:${lower}:1`, rec("小寫格式乙", "lifemig0004"));
await put(`wallet:${lower}`, "2"); // 只有一份、沒有衝突：照搬
E.ACCOUNTS._store.set("a:acctm001", { aid: "acctm001", email: "m@example.com", key: AK, created: NOW, purchased: false, lives: [], gifts: { g1: "none", g2: "none" }, events: [], sessions: [], carried: 0 });
E.ACCOUNTS._store.set("k:" + AK, "acctm001");
// 舊索引(內部代號)：搬遷時沿用它的最後存檔時間
const { legacySaveCode } = await import("../worker/location-migrate.js");
E.ACCOUNTS._store.set("x:" + await legacySaveCode(E, AK, 0), { ref: "x", info: {}, at: 12345 });
const mig = (body) => post(E, "/admin/location-migrate", Object.assign({}, who, body), adm);
const noWho = await post(E, "/admin/location-migrate", { dry_run: true }, adm);
A.check("搬遷必填who與reason(缺少回400)", noWho.status === 400);
const before = names(E).length;
const ee = await mig({});
A.check("正式搬遷前必須先試算一次(409)", ee.status === 409 && names(E).length === before);
const dry = (await mig({ dry_run: true })).json;
const row = (t) => dry.classes.find(c => c.type === t);
A.check("試算：逐類列出舊名稱筆數與要搬的筆數(含主存檔、封存包、回顧、傳承之書、行動點、領禮、錢包、用量)，沒有寫入任何東西", dry.success && dry.dry_run && dry.classes.length === 8 && row("主存檔").old_names === 4 && row("主存檔").to_migrate === 3 && row("主存檔").conflicts === 1 && row("錢包餘額").old_names === 2 && row("用量紀錄").old_names === 1 && row("傳承之書").old_names === 1 && names(E).length === before, dry.classes);
A.check("試算：衝突清單只有類型、門牌前8碼與存檔資訊，沒有金鑰原文", dry.conflicts.length === 1 && dry.conflicts.every(c => /^[0-9a-f]{8}$/.test(c.loc8) && c.type === "主存檔") && !JSON.stringify(dry).includes(AK) && !JSON.stringify(dry).includes(upper) && !JSON.stringify(dry).toLowerCase().includes(lower));
A.check("試算：帳號金鑰與索引筆數也一併回報", dry.account_keys.accounts_with_key === 1 && dry.index.saves_at_old === 4);
const r1 = (await mig({})).json;
const mainRow = r1.classes.find(c => c.type === "主存檔");
A.check("搬遷：不衝突的照搬；衝突的那組(同一個位置同一格兩份)只搬格式正確的那份，另一份不搬、列入清單，對帳不通過", r1.success && r1.reconciled === false && r1.conflicts.length === 1 && mainRow.not_yet_migrated === 0 && mainRow.conflicts === 1 && E.SAVES._m.has(`save:${H.loc(AK)}:0`) && E.SAVES._m.has(`save:${H.loc(AK)}:2`) && JSON.parse(E.SAVES._m.get(`save:${H.loc(lower)}:1`).v).meta.name === "標準格式乙", r1); // 同一個位置：搬的是標準格式那份，不是小寫那份
A.check("搬遷：用量、回顧的標註(metadata)一併帶過去；其他類型都搬到門牌名稱", JSON.stringify(E.SAVES._m.get(`archive:${H.loc(AK)}:arcm001`).meta).includes("老年") && E.SAVES._m.get(`usage:life:${H.loc(AK)}:0:lifemig0001`).meta.c === 1 && ["stagepack", "familybook", "ap"].every(k => names(E).some(n => n.startsWith(k + ":" + H.loc(AK)))) && E.SAVES._m.has(`giftclaims:${H.loc(AK)}`) && E.SAVES._m.get(`wallet:${H.loc(AK)}`).v === "50" && E.SAVES._m.get(`wallet:${H.loc(lower)}`).v === "2");
A.check("搬遷：舊資料還在(保險期用)", E.SAVES._m.has(`save:${AK}:0`) && E.SAVES._m.has(`wallet:${AK}`));
const idx = E.ACCOUNTS._store;
A.check("搬遷：管理端索引重建(門牌＋格子)，最後存檔時間沿用舊索引，沒有舊索引的記為未知", idx.get(`y:${H.loc(AK)}:0`).at === 12345 && idx.get(`y:${H.loc(AK)}:0`).info.lid === "lifemig0001" && idx.get(`y:${H.loc(AK)}:2`).at === null && idx.has(`kl:${H.loc(AK)}`) && !r1.reconciled);
// 衝突處理：使用者決定留標準格式、刪小寫那份(這裡用直接刪KV代表使用者的處理)，再對帳
await E.SAVES.delete(`save:${lower}:1`);
const r2 = (await mig({})).json;
A.check("衝突處理完再執行：標準格式那份搬過去、對帳通過", r2.reconciled === true && r2.conflicts.length === 0 && E.SAVES._m.has(`save:${H.loc(upper)}:1`) && JSON.parse(E.SAVES._m.get(`save:${H.loc(upper)}:1`).v).meta.name === "標準格式乙", r2);
A.check("對帳通過後搬遷／試算功能關閉(410)，報告全程沒有金鑰原文", (await mig({})).status === 410 && (await mig({ dry_run: true })).status === 410 && ![r1, r2].some(r => JSON.stringify(r).includes(AK) || JSON.stringify(r).includes(upper)));
A.check("新位置已有的資料不被舊資料覆蓋(錢包在搬遷前先被新版寫成50，搬遷後仍是50，不是舊的3)", E.SAVES._m.get(`wallet:${H.loc(AK)}`).v === "50");
const log = (await get(E, "/admin/access-log", adm)).json.log;
A.check("存取紀錄有搬遷的前後紀錄(試算、正式、結果)，沒有金鑰原文", log.some(x => x.action === "location-migrate-dry") && log.some(x => x.action === "location-migrate") && log.some(x => x.action === "location-migrate-result" && x.code === "對帳通過") && !JSON.stringify(log).includes(AK));
const lst = (await get(E, "/admin/saves", adm)).json.saves;
const listedAll = JSON.stringify(lst);
A.check("管理端存檔列表：搬遷後老存檔也在列表，帶人生代號，沒有金鑰", lst.some(x => x.lid === "lifemig0001") && lst.some(x => x.lid === "lifemig0002") && !listedAll.includes(AK));
const vw = (await get(E, "/admin/save?lid=lifemig0001&who=a&reason=b", adm)).json;
A.check("管理端以門牌定位查看搬遷後的存檔", vw.success && vw.text.includes("lifemig0001"));
await E.SAVES.put(`save:${AK}:2`, E.SAVES._m.get(`save:${H.loc(AK)}:2`).v); // (搬遷複製時舊名稱那份本來就在)
const dl = await post(E, "/admin/save/delete", { lid: "lifemig0002", who: "a", reason: "b" }, adm);
A.check("管理端以門牌刪除存檔(新位置、保險期內的舊名稱、索引都刪，不會從舊位置復活)", dl.json.success === true && !E.SAVES._m.has(`save:${H.loc(AK)}:2`) && !E.SAVES._m.has(`save:${AK}:2`) && !(await get(E, "/admin/saves", adm)).json.saves.some(x => x.lid === "lifemig0002"));

// ---- 8. 保險期與清理 ----
const cl = (e = E) => post(e, "/admin/location-cleanup", who, adm);
A.check("清理：保險期未滿7天拒絕(409)，沒刪任何東西", (await cl()).status === 409 && E.SAVES._m.has(`save:${AK}:0`));
E.TEST_NOW_MS = String(NOW + 8 * D);
await get(E, "/slots?key=" + AK); // 新位置有資料，不會改讀舊位置
A.check("保險期滿7天且沒有改讀舊位置：條件符合", (await get(E, "/admin/location-status?who=a&reason=b", adm)).json.fallback_reads === 0);
// 情境：保險期內有人改讀舊位置 → 拒絕
const E2 = await mk({}); // 另一個環境，單獨驗證「改讀次數不為0」
await E2.SAVES.put(`save:${AK}:0`, rec("甲", "lifemig0001"));
const m2 = (b) => post(E2, "/admin/location-migrate", Object.assign({}, who, b), adm);
await m2({ dry_run: true }); const rr = (await m2({})).json;
await E2.SAVES.put(`save:${AK}:1`, rec("丙", "lifemig0005")); // 對帳後才冒出的舊名稱存檔(例如舊版寫入)
await get(E2, "/slots?key=" + AK); // 這份只在舊名稱 → 改讀舊位置，計數+1
E2.TEST_NOW_MS = String(NOW + 8 * D);
const c2 = await cl(E2);
A.check("保險期內有改讀舊位置：拒絕清理並說明原因；對帳也已不吻合", rr.reconciled === true && c2.status === 409 && /改讀舊位置/.test(c2.json.error), c2.json);
// 回到E：正式清理
const c1 = await cl();
A.check("清理：刪除所有舊名稱資料、舊索引與舊對照，關閉保險功能，回報數量", c1.json.success === true && c1.json.partial === false && c1.json.deleted_this_run["主存檔"] === 2 && c1.json.legacy_index_removed === 1 && c1.json.legacy_key_links_removed === 1, c1.json);
const stillOld = names(E).filter(n => n.includes(AK) || n.includes(upper) || n.includes(lower));
A.check("清理後：KV中沒有任何舊名稱(含金鑰原文)的資料；索引沒有舊內部代號；DO沒有以金鑰原文為名的對照", stillOld.length === 0 && ![...E.ACCOUNTS._store.keys()].some(k => k.startsWith("x:") || k.startsWith("k:")), { stillOld: stillOld.length });
A.check("清理後新位置資料完整、用金鑰照樣讀得到", (await get(E, "/slots?key=" + AK)).json.slots[0].meta.name === "甲" && (await get(E, "/slots?key=" + AK.toLowerCase())).json.wallet === 50);
const st1 = (await get(E, "/admin/location-status?who=a&reason=b", adm)).json;
A.check("清理完成：保險功能關閉、此功能停用(410)", st1.cleaned === true && st1.fallback_off === true && (await cl()).status === 410);
await E.SAVES.put(`save:${AK}:1`, rec("清理後才冒出的舊名稱", "lifemig0009"));
A.check("保險功能關閉後：不再改讀舊位置(舊名稱讀不到)", (await get(E, "/slots?key=" + AK)).json.slots[1] === null);

// ---- 9. 分批：操作次數用完就回partial，再執行一次接著做 ----
const E3 = await mk({ LOCATION_OP_BUDGET: "6" });
for (let i = 0; i < 6; i++) await E3.SAVES.put(`ap:PART-0000-0000-0000-000${i}:0`, JSON.stringify({ daily: i }));
const p = (b) => post(E3, "/admin/location-migrate", Object.assign({}, who, b), adm);
await p({ dry_run: true });
const pa = (await p({})).json;
let pb = pa, rounds = 1; while (pb.partial && rounds < 10) { pb = (await p({})).json; rounds++; }
A.check("分批：第一次做不完回partial(未對帳)，再執行幾次後全部搬完並對帳通過", pa.partial === true && pa.reconciled === false && pb.reconciled === true && rounds > 1, { rounds });

// ---- 10. 換算測試鑰匙的小工具(worker/scripts/loc-convert.mjs)：輸出的門牌跟Worker的算法一致，畫面上不印金鑰、密鑰、門牌 ----
{
  const { spawnSync } = await import("child_process");
  const os = await import("os"), fs = await import("fs"), path = await import("path");
  const out = path.join(os.tmpdir(), "loc-convert-test-" + process.pid + ".txt");
  const keys = [TK, "second-key-0000-1111-2222", "  " + TK.toLowerCase() + " "]; // 第3把跟第1把統一格式後相同→只算一次
  const r = spawnSync(process.execPath, [path.join(H.ROOT, "worker/scripts/loc-convert.mjs")], { input: [H.LOC_SECRET, ...keys, ""].join("\n"), env: Object.assign({}, process.env, { LOC_CONVERT_TEST_OUT: out }), encoding: "utf8" });
  const got = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (fs.existsSync(out)) fs.unlinkSync(out);
  const shown = (r.stdout || "") + (r.stderr || "");
  A.check("換算工具：結果＝Worker同樣算法的門牌(逗號分隔、去重)", r.status === 0 && got === [H.loc(TK), H.loc("second-key-0000-1111-2222")].join(","), { status: r.status });
  A.check("換算工具：畫面輸出只說換算了幾把，沒有金鑰、密鑰、門牌", /已換算 2 把/.test(shown) && !shown.includes(H.LOC_SECRET) && !shown.includes(TK) && !shown.includes("second-key") && !shown.includes(H.loc(TK)));
  const bad = spawnSync(process.execPath, [path.join(H.ROOT, "worker/scripts/loc-convert.mjs")], { input: "short\n" + TK + "\n\n", env: Object.assign({}, process.env, { LOC_CONVERT_TEST_OUT: out }), encoding: "utf8" });
  A.check("換算工具：位置密鑰空的或太短就停止，不產生結果", bad.status === 1 && !fs.existsSync(out));
}
process.exit(A.report() ? 0 : 1);
