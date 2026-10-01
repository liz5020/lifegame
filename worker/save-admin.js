// 十、10.13.6 管理端（2026-10-01）：存檔索引(內部代號)、註冊名冊、單一存檔查看與刪除、存取紀錄。
//   所有路徑都要帶獨立密碼 Authorization: Bearer <SAVE_ADMIN_TOKEN>(Worker secret，不跟用量查詢的USAGE_ADMIN_TOKEN共用，因為名冊含信箱)：
//   GET  /admin/roster                      註冊名冊：信箱、人生數、啟程禮領取狀態(不含復原金鑰)
//   GET  /admin/saves                       存檔索引：內部代號、名字、年齡、階段、最後存檔時間、人生代號
//   GET  /admin/save?code=&who=&reason=     查看單一存檔(必填who、reason，會先寫存取紀錄；內容裡的復原金鑰一律遮蔽)
//   POST /admin/save/delete {code,who,reason}  刪除存檔(玩家透過回報表單提出，10.13.5)，同樣記錄
//   GET  /admin/access-log                  存取紀錄(保留180天)
//   用量：沿用既有的 /usage-today、/usage-summary(USAGE_ADMIN_TOKEN)
// 內部代號＝HMAC-SHA256(SAVE_INDEX_SECRET, 金鑰|格子)前24碼：只有伺服器知道密鑰，無法從金鑰推算、也無法從代號反推金鑰。
// 索引放在帳號Durable Object(不放KV)，指回存檔的參照用同一組密鑰加密(AES-GCM)，只有查看／刪除時在伺服器內解開，任何回應、索引、存取紀錄都不出現復原金鑰原文。
// 索引在「該存檔下次寫入時」自動補建，不做一次性回填；沒設SAVE_INDEX_SECRET就不建索引、管理端回503，玩家端存讀檔完全不受影響。
import { jsonResponse } from "./http.js";
import { accountsCall, accountStore } from "./gate.js";

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const b64 = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function indexEnabled(env) { return !!(env && env.SAVE_INDEX_SECRET && accountStore(env)); }

export async function saveCode(env, key, slot) {
  const k = await crypto.subtle.importKey("raw", enc.encode(String(env.SAVE_INDEX_SECRET)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode("code|" + key + "|" + slot))).slice(0, 24);
}
async function aesKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("enc|" + env.SAVE_INDEX_SECRET));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptRef(env, ref) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(JSON.stringify(ref)));
  return b64(iv) + "." + b64(new Uint8Array(ct));
}
async function decryptRef(env, s) {
  const [iv, ct] = String(s).split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(env), unb64(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// 每次存檔寫入KV之後呼叫：補建／更新這份存檔的索引(失敗不影響存檔，呼叫端自己try-catch)
export async function indexSaveRecord(env, key, slot, meta, size) {
  if (!indexEnabled(env)) return;
  const m = meta && typeof meta === "object" ? meta : {};
  const info = {
    name: String(m.name || "").slice(0, 40), age: Number.isFinite(Number(m.age)) ? Number(m.age) : null,
    stage: String(m.stage || "").slice(0, 40), lid: typeof m.lid === "string" ? m.lid.slice(0, 40) : null, size: Number(size) || 0
  };
  await accountsCall(env, { op: "save_index_put", code: await saveCode(env, key, slot), ref: await encryptRef(env, { key, slot }), info });
}

async function gunzipText(b64text) {
  const ds = new DecompressionStream("gzip");
  const w = ds.writable.getWriter(); w.write(unb64(b64text)); w.close();
  return await new Response(ds.readable).text();
}
// 把KV裡的存檔紀錄還原成state，並遮蔽復原金鑰
async function decodeRecord(record, key) {
  let state = null;
  if (record.z !== undefined) state = JSON.parse(record.enc === "gzip-b64" ? await gunzipText(record.z) : record.z);
  else state = record.state;
  if (state && typeof state === "object") delete state.cloudHome;
  return JSON.parse(JSON.stringify(state === undefined ? null : state).split(key).join("[復原金鑰已遮蔽]"));
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
  if (!indexEnabled(env)) return jsonResponse(origin, { success: false, error: "尚未設定SAVE_INDEX_SECRET或帳號資料庫" }, 503);
  const path = url.pathname, method = request.method;
  const asked = (src) => {
    const who = String(src.who || "").trim().slice(0, 40), reason = String(src.reason || "").trim().slice(0, 200);
    return who && reason ? { who, reason } : null;
  };

  if (path === "/admin/roster" && method === "GET") {
    const r = await accountsCall(env, { op: "roster" });
    return jsonResponse(origin, { success: true, accounts: r.accounts || [] });
  }
  if (path === "/admin/saves" && method === "GET") {
    const r = await accountsCall(env, { op: "save_index_list" });
    return jsonResponse(origin, { success: true, saves: r.saves || [] });
  }
  if (path === "/admin/access-log" && method === "GET") {
    const r = await accountsCall(env, { op: "admin_log_list" });
    return jsonResponse(origin, { success: true, log: r.log || [] });
  }
  if ((path === "/admin/save" && method === "GET") || (path === "/admin/save/delete" && method === "POST")) {
    const isDelete = method === "POST";
    let src = Object.fromEntries(url.searchParams);
    if (isDelete) { try { src = await request.json(); } catch (e) { src = {}; } }
    const code = String(src.code || "");
    const who = asked(src);
    if (!/^[0-9a-f]{24}$/.test(code)) return jsonResponse(origin, { success: false, error: "代號格式不正確" }, 400);
    if (!who) return jsonResponse(origin, { success: false, error: "請填寫who(誰)與reason(原因)，查看與刪除都會留下紀錄" }, 400);
    const got = await accountsCall(env, { op: "save_index_ref", code });
    if (!got.ok) return jsonResponse(origin, { success: false, error: "找不到這個代號" }, 404);
    let ref;
    try { ref = await decryptRef(env, got.ref); } catch (e) { return jsonResponse(origin, { success: false, error: "索引無法解開(密鑰是否更換過？)" }, 500); }
    // 先記錄再動作：記錄寫不進去就不給看／不刪
    const logged = await accountsCall(env, { op: "admin_log_add", entry: { who: who.who, reason: who.reason, code, lid: got.info && got.info.lid || null, action: isDelete ? "delete" : "view" } });
    if (!logged.ok) return jsonResponse(origin, { success: false, error: "存取紀錄寫入失敗，未執行" }, 500);
    const kv = helpers.kvKey(ref.key, ref.slot);
    if (isDelete) {
      await env.SAVES.delete(kv);
      await accountsCall(env, { op: "save_index_del", code });
      return jsonResponse(origin, { success: true, deleted: code });
    }
    const raw = await env.SAVES.get(kv);
    if (!raw) return jsonResponse(origin, { success: false, error: "存檔已不存在" }, 404);
    let record; try { record = JSON.parse(raw); } catch (e) { return jsonResponse(origin, { success: false, error: "存檔內容無法解析" }, 500); }
    let state = null;
    try { state = await decodeRecord(record, ref.key); } catch (e) { return jsonResponse(origin, { success: false, error: "存檔無法解壓" }, 500); }
    return jsonResponse(origin, { success: true, code, info: got.info, state });
  }
  return jsonResponse(origin, { success: false, error: "找不到這個管理網址" }, 404);
}
