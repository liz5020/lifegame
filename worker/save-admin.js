// 十、10.13.6 管理端（2026-10-01；2026-10-04門牌改版）：存檔索引、註冊名冊、單一存檔查看與刪除、存取紀錄、位置搬遷與清理。
//   所有路徑都要帶獨立密碼 Authorization: Bearer <SAVE_ADMIN_TOKEN>(Worker secret，不跟用量查詢的USAGE_ADMIN_TOKEN共用，因為名冊含信箱)：
//   GET  /admin/roster?who=&reason=         註冊名冊(2026-10-03定案)：已綁信箱玩家的信箱、人生代號lid、綁定日期、最後存檔時間；不含故事與日記；必填who、reason，先寫存取紀錄
//   GET  /admin/saves                       存檔列表(含未綁信箱)：只列人生代號lid與最後存檔時間，不含故事與日記(lid缺的舊存檔才多給code，當查看用的把手：門牌前8碼.格子)
//   GET  /admin/save?lid=(或code=)&who=&reason=  查看單一存檔(必填who、reason，會先寫存取紀錄；金鑰一律遮蔽)；回應的text是依人生階段整理好的可讀文字，加&raw=1才多附原始state
//   POST /admin/save/delete {lid(或code),who,reason}  刪除存檔(玩家透過回報表單提出，10.13.5)，同樣記錄
//   GET  /admin/access-log                  存取紀錄(保留180天)
//   POST /admin/location-migrate / location-cleanup、GET /admin/location-status   位置搬遷、清理與狀態(見location-migrate.js)
//   用量：沿用既有的 /usage-today、/usage-summary(USAGE_ADMIN_TOKEN)
// 索引放在帳號Durable Object(不放KV)，以「門牌＋格子」記錄(門牌＝金鑰的單向雜湊，見location.js)；索引、回應、存取紀錄都不出現復原金鑰原文，
// 管理端查看／刪除直接用門牌定位，伺服器內部不需要、也無法還原金鑰。索引在存檔寫入時自動補建；舊存檔由一次性搬遷補建。
import { jsonResponse } from "./http.js";
import { accountsCall, accountStore } from "./gate.js";
import { runMigration, runCleanup, locationStatus, deleteLegacySave } from "./location-migrate.js";

const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function indexEnabled(env) { return !!(env && accountStore(env)); }

// 每次存檔寫入KV之後呼叫：補建／更新這份存檔的索引。key這時已經是門牌；失敗不影響存檔，呼叫端自己try-catch
export async function indexSaveRecord(env, loc, slot, meta, size) {
  if (!indexEnabled(env)) return;
  const m = meta && typeof meta === "object" ? meta : {};
  const info = {
    name: String(m.name || "").slice(0, 40), age: Number.isFinite(Number(m.age)) ? Number(m.age) : null,
    stage: String(m.stage || "").slice(0, 40), lid: typeof m.lid === "string" ? m.lid.slice(0, 40) : null, size: Number(size) || 0,
    turns: Number.isFinite(Number(m.turns)) && Number(m.turns) >= 0 ? Math.floor(Number(m.turns)) : null // 名冊回合數(2026-10-10)：遊戲畫面上的第幾回合
  };
  await accountsCall(env, { op: "save_index_put", loc, slot, info });
}
// 存檔內容裡可能出現的金鑰(cloudHome、玩家自己寫進日記…)：長得像復原金鑰(20碼十六進位，可有連字號)的一律遮蔽，伺服器不再知道原文，所以改以格式辨認
const KEY_LIKE = /(?<![0-9A-Za-z])[0-9A-Fa-f]{4}(?:-?[0-9A-Fa-f]{4}){4}(?![0-9A-Za-z])/g;
const maskKeys = (t) => String(t).replace(KEY_LIKE, "[復原金鑰已遮蔽]");
const codeOf = (loc, slot) => loc.slice(0, 8) + "." + slot;

async function gunzipText(b64text) {
  const ds = new DecompressionStream("gzip");
  const w = ds.writable.getWriter(); w.write(unb64(b64text)); w.close();
  return await new Response(ds.readable).text();
}
// 把KV裡的存檔紀錄還原成state，並遮蔽金鑰
async function decodeRecord(record) {
  let state = null;
  if (record.z !== undefined) state = JSON.parse(record.enc === "gzip-b64" ? await gunzipText(record.z) : record.z);
  else state = record.state;
  if (state && typeof state === "object") delete state.cloudHome;
  return JSON.parse(maskKeys(JSON.stringify(state === undefined ? null : state)));
}

// 2026-10-03定案：查看結果整理成可讀文字——依人生階段順序，每個階段附上該階段的日記；已上傳的封存包從KV讀回來接在前面
async function decodePack(rec) {
  if (rec && rec.z !== undefined) return JSON.parse(rec.enc === "gzip-b64" ? await gunzipText(rec.z) : rec.z);
  return rec;
}
function entryText(e) {
  if (!e || typeof e !== "object") return "";
  const head = [e.age != null ? e.age + "歲" : "", e.timeLabel || "", e.subtitle || ""].filter(Boolean).join("｜");
  const act = e.action ? "\n〔玩家的選擇〕" + e.action + (e.inputSource === "free" ? "〔自由輸入〕" : e.inputSource === "choice" ? "〔選項〕" : "") : "";
  return "▍" + head + act + "\n" + String(e.text || "") + (e.error ? "\n（這一筆是系統訊息）" : "");
}
function ageRange(log) {
  const ages = (log || []).map(e => e && e.age).filter(a => Number.isFinite(a));
  return ages.length ? ages[0] + "～" + ages[ages.length - 1] + "歲" : "";
}
export async function buildReadable(state, lid, lastSave, getPack) {
  const parts = [];
  parts.push("人生代號：" + (lid || "（無）") + "　最後存檔：" + (lastSave ? new Date(lastSave).toISOString() : "未知") + "　目前年齡：" + (state && state.age != null ? state.age + "歲" : "未知"));
  const packs = ((state && state.stagePacks) || []).filter(p => p && p.uploaded).slice().sort((a, b) => a.from - b.from);
  let n = 0;
  for (const p of packs) {
    n++;
    let c = null;
    try { c = await getPack(p.id); } catch (e) { c = null; }
    const log = c && Array.isArray(c.log) ? c.log : null;
    parts.push("\n【第" + n + "階段：" + (p.key || "") + (log ? "（" + ageRange(log) + "，" + log.length + "則）" : "") + "】");
    parts.push(log ? log.map(entryText).join("\n\n") : "（這個階段的封存包讀不到）");
  }
  const cur = (state && state.log) || [];
  parts.push("\n【" + (packs.length ? "第" + (n + 1) + "階段（目前）" : "目前階段") + "（" + ageRange(cur) + "，" + cur.length + "則）】");
  parts.push(cur.map(entryText).join("\n\n"));
  return parts.join("\n");
}

function denied(origin, env, request, safeEqual) {
  if (!env.SAVE_ADMIN_TOKEN) return jsonResponse(origin, { success: false, error: "尚未設定SAVE_ADMIN_TOKEN" }, 503);
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!safeEqual(token, env.SAVE_ADMIN_TOKEN)) return jsonResponse(origin, { success: false, error: "密碼錯誤" }, 401);
  return null;
}

export function isAdminPath(pathname) { return pathname.startsWith("/admin/"); }

// helpers：{ kvKey, safeEqual }(從worker.js傳進來，避免循環引用)
export async function handleSaveAdmin(request, env, url, helpers) {
  const origin = null; // 管理用，不走來源白名單、不帶CORS
  const d = denied(origin, env, request, helpers.safeEqual);
  if (d) return d;
  if (!indexEnabled(env)) return jsonResponse(origin, { success: false, error: "尚未設定帳號資料庫" }, 503);
  const path = url.pathname, method = request.method;
  const asked = (src) => {
    const who = String(src.who || "").trim().slice(0, 40), reason = String(src.reason || "").trim().slice(0, 200);
    return who && reason ? { who, reason } : null;
  };

  // 先寫存取紀錄，寫不進去就不執行(名冊、查看、刪除共用)
  const logFirst = async (src, action, extra) => {
    const w = asked(src);
    if (!w) return jsonResponse(origin, { success: false, error: "請填寫who(誰)與reason(原因)，每次使用都會留下紀錄" }, 400);
    const logged = await accountsCall(env, { op: "admin_log_add", entry: Object.assign({ who: w.who, reason: w.reason, action }, extra || {}) });
    if (!logged.ok) return jsonResponse(origin, { success: false, error: "存取紀錄寫入失敗，未執行" }, 500);
    return null;
  };
  const savesByLid = async () => {
    const r = await accountsCall(env, { op: "save_index_list" });
    const m = new Map();
    for (const x of r.saves || []) { const lid = x.info && x.info.lid; if (lid && (!m.has(lid) || (m.get(lid).at || 0) < (x.at || 0))) m.set(lid, x); }
    return { all: r.saves || [], byLid: m };
  };

  if (path === "/admin/roster" && method === "GET") {
    const bad = await logFirst(Object.fromEntries(url.searchParams), "roster");
    if (bad) return bad;
    const r = await accountsCall(env, { op: "roster" });
    const { byLid } = await savesByLid();
    const accounts = (r.accounts || []).map(a => ({
      email: a.email, bound_at: a.created,
      lives: (a.lives || []).map(l => ({ lid: l.lid, last_save: byLid.has(l.lid) ? byLid.get(l.lid).at : null }))
    }));
    return jsonResponse(origin, { success: true, accounts });
  }
  // 十、10.15.6（2026-10-04）：數據網頁「名冊」分頁——唯讀；不必填who／reason，伺服器自動寫存取紀錄(操作者「管理員（數據網頁）」、原因「網頁查看名冊」)，寫不進去就不回傳名冊
  if (path === "/admin/dashboard-roster" && method === "GET") {
    const logged = await accountsCall(env, { op: "admin_log_add", entry: { who: "管理員（數據網頁）", reason: "網頁查看名冊", action: "roster" } });
    if (!logged.ok) return jsonResponse(origin, { success: false, error: "存取紀錄寫入失敗，未執行" }, 500);
    const r = await accountsCall(env, { op: "roster" });
    const { byLid } = await savesByLid();
    const WL = { waiting: "排隊中", allocated: "排隊中", notified: "已通知", entered: "已入場", expired: "已過期", send_failed: "寄送失敗" };
    const accounts = (r.accounts || []).map(a => {
      let last = null;
      for (const l of a.lives || []) { const v = byLid.has(l.lid) ? byLid.get(l.lid).at : null; if (v && (!last || v > last)) last = v; }
      const mine = new Set([...(a.ever_lids || []), ...(a.lives || []).map(l => l.lid)]);
      let turns = 0; for (const lid of mine) { const x = byLid.get(lid); if (x && x.info && x.info.turns) turns += x.info.turns; } // 名冊回合數(2026-10-10)：每段人生最後一次雲端存檔附的回合數加總
      return { email: a.email, bound_at: a.created, lives: (a.lives || []).length, turns, last_save: last,
        wl_status: a.wl ? (WL[a.wl.status] || "") : "", joined_at: a.wl ? a.wl.joinedAt : null, notified_at: a.wl ? a.wl.sentAt : null };
    });
    return jsonResponse(origin, { success: true, accounts });
  }
  if (path === "/admin/saves" && method === "GET") {
    const { all } = await savesByLid();
    const saves = all.map(x => x.info && x.info.lid ? { lid: x.info.lid, last_save: x.at } : { lid: null, code: codeOf(x.loc, x.slot), last_save: x.at });
    return jsonResponse(origin, { success: true, saves });
  }
  if (path === "/admin/access-log" && method === "GET") {
    const r = await accountsCall(env, { op: "admin_log_list" });
    return jsonResponse(origin, { success: true, log: r.log || [] });
  }
  // 10.13.6門牌改版：位置搬遷(試算／正式)、清理、狀態——都要who與reason，先寫存取紀錄，完成後再寫一筆結果紀錄
  if (path === "/admin/location-status" && method === "GET") {
    const bad = await logFirst(Object.fromEntries(url.searchParams), "location-status");
    if (bad) return bad;
    return jsonResponse(origin, Object.assign({ success: true }, await locationStatus(env)));
  }
  if ((path === "/admin/location-migrate" || path === "/admin/location-cleanup") && method === "POST") {
    let src = {}; try { src = await request.json(); } catch (e) { src = {}; }
    const isCleanup = path === "/admin/location-cleanup";
    const dry = !isCleanup && (src.dry_run === true || src.dry_run === "true");
    const bad = await logFirst(src, isCleanup ? "location-cleanup" : (dry ? "location-migrate-dry" : "location-migrate"));
    if (bad) return bad;
    let r;
    try { r = isCleanup ? await runCleanup(env) : await runMigration(env, { dry }); }
    catch (e) { r = { ok: false, status: 500, error: "執行失敗：" + (e && e.message || e) }; }
    // 結果也記一筆(只放摘要數字，不放金鑰)
    const w = asked(src);
    try { await accountsCall(env, { op: "admin_log_add", entry: { who: w.who, reason: w.reason, action: isCleanup ? "location-cleanup-result" : "location-migrate-result", code: r.ok ? (r.reconciled ? "對帳通過" : (r.partial ? "未做完" : (dry ? "試算" : "完成"))) : String(r.error || "失敗").slice(0, 80) } }); } catch (e) { /* 結果紀錄失敗不影響已做的事 */ }
    return jsonResponse(origin, Object.assign({ success: !!r.ok }, r), r.ok ? 200 : (r.status || 500));
  }
  if ((path === "/admin/save" && method === "GET") || (path === "/admin/save/delete" && method === "POST")) {
    const isDelete = method === "POST";
    let src = Object.fromEntries(url.searchParams);
    if (isDelete) { try { src = await request.json(); } catch (e) { src = {}; } }
    const code = String(src.code || "");
    const lidAsked = String(src.lid || "");
    const who = asked(src);
    if (!who) return jsonResponse(origin, { success: false, error: "請填寫who(誰)與reason(原因)，查看與刪除都會留下紀錄" }, 400);
    let hit = null;
    if (lidAsked) {
      hit = (await savesByLid()).byLid.get(lidAsked);
      if (!hit) return jsonResponse(origin, { success: false, error: "找不到這個人生代號" }, 404);
    } else if (/^[0-9a-f]{8}\.[0-2]$/.test(code)) {
      const found = (await savesByLid()).all.filter(x => codeOf(x.loc, x.slot) === code);
      if (found.length > 1) return jsonResponse(origin, { success: false, error: "這個代號對到不只一份存檔，請改用人生代號lid" }, 409);
      hit = found[0];
      if (!hit) return jsonResponse(origin, { success: false, error: "找不到這個代號" }, 404);
    } else return jsonResponse(origin, { success: false, error: "請提供人生代號lid(或code)" }, 400);
    const loc = hit.loc, slot = hit.slot, c = codeOf(loc, slot);
    // 先記錄再動作：記錄寫不進去就不給看／不刪
    const logged = await accountsCall(env, { op: "admin_log_add", entry: { who: who.who, reason: who.reason, code: c, lid: hit.info && hit.info.lid || null, action: isDelete ? "delete" : "view" } });
    if (!logged.ok) return jsonResponse(origin, { success: false, error: "存取紀錄寫入失敗，未執行" }, 500);
    const kv = helpers.kvKey(loc, slot);
    if (isDelete) {
      await env.SAVES.delete(kv);
      await deleteLegacySave(env, loc, slot); // 保險期：搬遷前的舊名稱那份一起刪
      await accountsCall(env, { op: "save_index_del", loc, slot });
      return jsonResponse(origin, { success: true, deleted: c });
    }
    const raw = await env.SAVES.get(kv);
    if (!raw) return jsonResponse(origin, { success: false, error: "存檔已不存在" }, 404);
    let record; try { record = JSON.parse(raw); } catch (e) { return jsonResponse(origin, { success: false, error: "存檔內容無法解析" }, 500); }
    let state = null;
    try { state = await decodeRecord(record); } catch (e) { return jsonResponse(origin, { success: false, error: "存檔無法解壓" }, 500); }
    const lid = hit.info && hit.info.lid || null;
    const getPack = async (id) => {
      const pr = await env.SAVES.get(helpers.stagePackKey(loc, id));
      return pr ? await decodePack(JSON.parse(pr)) : null;
    };
    const text = maskKeys(await buildReadable(state, lid, hit.at, getPack));
    return jsonResponse(origin, Object.assign({ success: true, lid, last_save: hit.at, text }, src.raw === "1" ? { state } : {}));
  }
  return jsonResponse(origin, { success: false, error: "找不到這個管理網址" }, 404);
}
