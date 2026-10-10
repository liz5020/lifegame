// 十、10.13.6（2026-10-04定案，門牌改版）：一次性搬遷、對帳、保險期、清理。
//   POST /admin/location-migrate {who, reason, dry_run?}   試算(dry_run=true，只回報筆數、不寫入)或正式搬遷；對帳通過後此功能關閉
//   POST /admin/location-cleanup {who, reason}             保險期滿7天且保險期內「改讀舊位置」為0才能執行；清理後此功能關閉
//   GET  /admin/location-status                            目前狀態與各類筆數(含位置密鑰有沒有設好，不顯示密鑰)
//
// 搬遷＝把舊名稱(金鑰原文)的資料複製到新名稱(門牌)，舊的留著當保險，等清理才刪。
// 不覆蓋：新位置已有資料就保留新的。衝突：兩個舊金鑰統一格式後落在同一個位置，以格式正確(大寫含連字號)的那份為準，另一份列入衝突清單、不搬。
// 所有報告與紀錄只顯示資料類型與門牌前8碼，不出現金鑰原文。
import { accountsCall } from "./gate.js";
import { nowMs } from "./ap.js";
import { LOCATION_CLASSES, splitName, isLoc, locationId, locationSecretOk } from "./location.js";

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const CANON = /^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/; // 玩家看到的標準金鑰格式
export const DEFAULT_OP_BUDGET = 100;           // 一次呼叫最多做幾次KV／資料庫操作；做不完回partial，再執行一次就會接著做(搬遷與清理都能重複執行)
export const DEFAULT_INSURANCE_DAYS = 7;

// 舊內部代號(只用來讀舊索引的最後存檔時間；清理後這支函式與SAVE_INDEX_SECRET一起移除)
export async function legacySaveCode(env, key, slot) {
  const k = await crypto.subtle.importKey("raw", enc.encode(String(env.SAVE_INDEX_SECRET)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode("code|" + key + "|" + slot))).slice(0, 24);
}

async function listAll(env, prefix) {
  const out = []; let cursor;
  do {
    const page = await env.SAVES.list({ prefix, cursor });
    for (const k of page.keys || []) out.push({ name: k.name, metadata: k.metadata });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
const loc8 = (loc) => String(loc).slice(0, 8);

// 掃描全部KV，分出每一類的舊名稱、要搬的、已搬好的、衝突
async function plan(env) {
  const classes = [];
  for (const cls of LOCATION_CLASSES) {
    const all = await listAll(env, cls.prefix);
    const present = new Set(all.map(k => k.name));
    const legacy = []; let newCount = 0, unparsable = 0;
    for (const k of all) {
      const p = splitName(cls, k.name);
      if (!p) { unparsable++; continue; }
      if (isLoc(p.key)) { newCount++; continue; }
      const loc = await locationId(env, p.key);
      if (!loc) { unparsable++; continue; }
      legacy.push({ name: k.name, metadata: k.metadata, key: p.key, tail: p.tail, loc, newName: cls.prefix + loc + p.tail });
    }
    const groups = new Map();
    for (const it of legacy) { if (!groups.has(it.newName)) groups.set(it.newName, []); groups.get(it.newName).push(it); }
    const todo = [], matched = [], conflicts = [];
    for (const [newName, items] of groups) {
      let winner = items.length === 1 ? items[0] : null;
      if (!winner) {
        const canon = items.filter(i => CANON.test(i.key));
        if (canon.length === 1) winner = canon[0];
        for (const i of items) if (i !== winner) conflicts.push(i);
      }
      if (winner) (present.has(newName) ? matched : todo).push(winner);
    }
    classes.push({ cls, newCount, unparsable, legacy, todo, matched, conflicts });
  }
  return classes;
}

async function conflictInfo(env, cls, it) {
  if (cls.id !== "save") return {};
  try {
    const rec = JSON.parse(await env.SAVES.get(it.name));
    const m = rec && rec.meta || {};
    return { name: m.name, age: m.age, stage: m.stage };
  } catch (e) { return {}; }
}
async function report(env, classes, withConflictInfo) {
  const rows = [], conflictList = [];
  for (const c of classes) {
    rows.push({ type: c.cls.label, prefix: c.cls.prefix, old_names: c.legacy.length, to_migrate: c.todo.length, already_at_new: c.matched.length, conflicts: c.conflicts.length, unparsable: c.unparsable, new_names: c.newCount });
    for (const it of c.conflicts) conflictList.push(Object.assign({ type: c.cls.label, loc8: loc8(it.loc), tail: it.tail }, withConflictInfo ? await conflictInfo(env, c.cls, it) : {}));
  }
  return { rows, conflicts: conflictList };
}
async function acctKeyEntries(env) {
  const r = await accountsCall(env, { op: "acct_keys" });
  const entries = [];
  for (const a of (r && r.accounts) || []) { const loc = await locationId(env, a.key); if (loc) entries.push({ aid: a.aid, loc }); }
  return entries;
}

async function state(env) { return await accountsCall(env, { op: "loc_state" }); }
const disabled = (why) => ({ ok: false, status: 410, error: why });

// ---------- 試算／正式搬遷 ----------
export async function runMigration(env, { dry }) {
  if (!locationSecretOk(env)) return { ok: false, status: 503, error: "位置密鑰(SAVE_LOCATION_SECRET)尚未設定或格式不正確" };
  const st = await state(env);
  if (st.reconciled_at) return disabled("搬遷功能已停用(對帳已通過)");
  const classes = await plan(env);
  const rep = await report(env, classes, true);
  const counts = await accountsCall(env, { op: "loc_counts" });
  const keyEntries = await acctKeyEntries(env);
  const totals = { to_migrate: rep.rows.reduce((n, r) => n + r.to_migrate, 0), conflicts: rep.conflicts.length };
  if (dry) {
    await accountsCall(env, { op: "loc_set", name: "dry_at" });
    return { ok: true, dry_run: true, classes: rep.rows, conflicts: rep.conflicts, index: { saves_at_old: classes.find(c => c.cls.id === "save").legacy.length, index_entries_now: counts.y, legacy_index_entries: counts.legacy_x }, account_keys: { accounts_with_key: keyEntries.length, matched_now: counts.kl, legacy_entries: counts.legacy_k }, totals };
  }
  if (!st.dry_at) return { ok: false, status: 409, error: "正式搬遷前必須先做一次試算(dry_run=true)，由使用者確認筆數" };

  const budget = Number(env.LOCATION_OP_BUDGET) > 0 ? Number(env.LOCATION_OP_BUDGET) : DEFAULT_OP_BUDGET;
  let ops = 0, partial = false, failed = 0;
  const done = {};
  try {
    // ① 複製(新位置已有資料就不蓋)
    for (const c of classes) {
      for (const it of c.todo) {
        if (ops >= budget) { partial = true; break; }
        try {
          const v = await env.SAVES.get(it.name); ops++;
          if (v === null) continue;
          if ((await env.SAVES.get(it.newName)) !== null) { ops++; continue; }
          ops++;
          await env.SAVES.put(it.newName, v, it.metadata !== undefined && it.metadata !== null ? { metadata: it.metadata } : undefined); ops++;
          done[c.cls.id] = (done[c.cls.id] || 0) + 1;
        } catch (e) { failed++; console.warn("搬遷單筆失敗：" + c.cls.label + " " + loc8(it.loc)); }
      }
    }
    // ② 重建管理端索引(每份主存檔一筆：門牌＋格子)；最後存檔時間盡量沿用舊索引的
    if (!partial) {
      const saveClass = classes.find(c => c.cls.id === "save");
      const rawByNew = new Map(saveClass.legacy.map(it => [it.newName, it.key]));
      for (const k of await listAll(env, "save:")) {
        const p = splitName(saveClass.cls, k.name);
        if (!p || !isLoc(p.key)) continue;
        if (ops >= budget) { partial = true; break; }
        const slot = Number(p.tail.slice(1));
        try {
          const have = await accountsCall(env, { op: "save_index_get", loc: p.key, slot }); ops++;
          if (have && have.ok) continue;
          const raw = await env.SAVES.get(k.name); ops++;
          if (raw === null) continue;
          let meta = {}; try { meta = JSON.parse(raw).meta || {}; } catch (e) { /* 內容讀不懂也照樣建索引，資訊留空 */ }
          let at = null;
          const rawKey = rawByNew.get(k.name);
          if (rawKey && env.SAVE_INDEX_SECRET) {
            const old = await accountsCall(env, { op: "legacy_index_at", code: await legacySaveCode(env, rawKey, slot) }); ops++;
            if (old && old.ok) at = old.at;
          }
          await accountsCall(env, { op: "save_index_put", loc: p.key, slot, only_if_missing: true, at, info: { name: String(meta.name || "").slice(0, 40), age: Number.isFinite(Number(meta.age)) ? Number(meta.age) : null, stage: String(meta.stage || "").slice(0, 40), lid: typeof meta.lid === "string" ? meta.lid.slice(0, 40) : null, size: raw.length, turns: Number.isFinite(Number(meta.turns)) && Number(meta.turns) >= 0 ? Math.floor(Number(meta.turns)) : null } }); ops++;
        } catch (e) { failed++; console.warn("索引重建單筆失敗：" + loc8(p.key)); }
      }
    }
    // ③ 「金鑰→帳號」對照補成以門牌為名
    if (!partial) { await accountsCall(env, { op: "kl_sync", entries: keyEntries }); ops++; }
  } catch (e) {
    partial = true; // 碰到操作次數上限等狀況：已做的不會白做，再執行一次接著做
    console.warn("搬遷中斷：" + (e && e.message || e));
  }

  // ④ 對帳：重新掃描，逐類比對
  const after = await plan(env);
  const rep2 = await report(env, after, true);
  const counts2 = await accountsCall(env, { op: "loc_counts" });
  const saveAfter = after.find(c => c.cls.id === "save");
  let saves_without_index = 0, saves_total = 0;
  for (const k of await listAll(env, "save:")) {
    const p = splitName(saveAfter.cls, k.name);
    if (!p || !isLoc(p.key)) continue;
    saves_total++;
    const have = await accountsCall(env, { op: "save_index_get", loc: p.key, slot: Number(p.tail.slice(1)) });
    if (!have || !have.ok) saves_without_index++;
  }
  const keyEntriesNow = await acctKeyEntries(env);
  let keys_missing = 0;
  for (const e of keyEntriesNow) { const chk = await accountsCall(env, { op: "kl_has", loc: e.loc }); if (!chk || !chk.ok || !chk.has) keys_missing++; }
  const classRows = rep2.rows.map(r => ({ type: r.type, old_names: r.old_names, matched_at_new: r.already_at_new, not_yet_migrated: r.to_migrate, conflicts: r.conflicts, unparsable: r.unparsable }));
  const reconciled = !partial && failed === 0 && rep2.conflicts.length === 0
    && rep2.rows.every(r => r.to_migrate === 0 && r.unparsable === 0 && r.conflicts === 0)
    && saves_without_index === 0 && keys_missing === 0;
  if (reconciled) await accountsCall(env, { op: "loc_set", name: "reconciled_at" });
  return {
    ok: true, dry_run: false, partial, failed, copied_this_run: done, reconciled,
    classes: classRows, conflicts: rep2.conflicts,
    index: { saves_total, saves_without_index, index_entries: counts2.y },
    account_keys: { accounts_with_key: keyEntriesNow.length, missing: keys_missing, entries_at_new: counts2.kl },
    next: reconciled ? "對帳通過，保險期從現在起算7天" : (partial ? "尚未做完，請再執行一次" : "對帳未通過，請看conflicts／failed／各類not_yet_migrated")
  };
}

// 管理端刪除存檔(10.13.5)：保險期內舊名稱(金鑰原文)那份也要一起刪，否則玩家用金鑰讀取時會從舊位置「復活」。
// 管理端沒有金鑰原文，所以掃描舊名稱、逐個算門牌，對得上才刪；保險功能關閉後舊名稱已清空，不用再掃
export async function deleteLegacySave(env, loc, slot) {
  const st = await state(env);
  if (st.off) return 0;
  const cls = LOCATION_CLASSES.find(c => c.id === "save");
  let n = 0;
  for (const k of await listAll(env, cls.prefix)) {
    const p = splitName(cls, k.name);
    if (!p || isLoc(p.key) || p.tail !== ":" + slot) continue;
    if ((await locationId(env, p.key)) === loc) { await env.SAVES.delete(k.name); n++; }
  }
  return n;
}

// ---------- 清理 ----------
export async function runCleanup(env) {
  const st = await state(env);
  if (st.cleaned) return disabled("清理功能已停用(已清理完成)");
  if (!st.reconciled_at) return { ok: false, status: 409, error: "對帳還沒通過，不能清理" };
  const now = nowMs(env);
  const days = Number(env.LOCATION_INSURANCE_DAYS) > 0 ? Number(env.LOCATION_INSURANCE_DAYS) : DEFAULT_INSURANCE_DAYS;
  const reasons = [];
  if (now - st.reconciled_at < days * 86400000) reasons.push("保險期未滿" + days + "天(對帳通過時間 " + new Date(st.reconciled_at).toISOString() + ")");
  if (st.fb > 0) reasons.push("保險期內有 " + st.fb + " 次改讀舊位置，要先查明原因並再次對帳");
  if (reasons.length) return { ok: false, status: 409, error: "不符清理條件：" + reasons.join("；") };
  const classes = await plan(env);
  const unsafe = classes.filter(c => c.todo.length || c.conflicts.length || c.unparsable);
  if (unsafe.length) return { ok: false, status: 409, error: "對帳已不吻合，不能清理：" + unsafe.map(c => c.cls.label).join("、") };

  const budget = Number(env.LOCATION_OP_BUDGET) > 0 ? Number(env.LOCATION_OP_BUDGET) : DEFAULT_OP_BUDGET;
  let ops = 0, partial = false;
  const deleted = {};
  // 步驟1：刪除所有舊名稱的KV資料
  for (const c of classes) {
    for (const it of c.legacy) {
      if (ops >= budget) { partial = true; break; }
      try { await env.SAVES.delete(it.name); ops++; deleted[c.cls.label] = (deleted[c.cls.label] || 0) + 1; } catch (e) { partial = true; break; }
    }
    if (partial) break;
  }
  if (partial) return { ok: true, partial: true, deleted_this_run: deleted, next: "尚未做完，請再執行一次" };
  // 步驟2：刪除索引中的舊內部代號與加密參照，以及以金鑰原文為名的舊對照
  const purge = await accountsCall(env, { op: "loc_purge_legacy" });
  // 步驟3：關閉「改讀舊位置」的保險功能(程式碼本身之後另行移除)
  await accountsCall(env, { op: "loc_set", name: "off" });
  await accountsCall(env, { op: "loc_set", name: "cleaned" });
  return {
    ok: true, partial: false, deleted_this_run: deleted, legacy_index_removed: purge.x, legacy_key_links_removed: purge.k,
    next: "步驟1～3已完成。步驟4：確認程式中沒有其他地方使用SAVE_INDEX_SECRET後移除相關程式並重新部署；步驟5：再從Cloudflare設定刪除SAVE_INDEX_SECRET(若曾在別處保存也一併刪除)"
  };
}

// ---------- 狀態 ----------
export async function locationStatus(env) {
  const st = await state(env);
  const classes = await plan(env);
  const rep = await report(env, classes, false);
  const counts = await accountsCall(env, { op: "loc_counts" });
  const days = Number(env.LOCATION_INSURANCE_DAYS) > 0 ? Number(env.LOCATION_INSURANCE_DAYS) : DEFAULT_INSURANCE_DAYS;
  return {
    ok: true,
    location_secret: { set: locationSecretOk(env), length: typeof env.SAVE_LOCATION_SECRET === "string" ? env.SAVE_LOCATION_SECRET.length : 0 },
    dry_run_at: st.dry_at ? new Date(st.dry_at).toISOString() : null,
    reconciled_at: st.reconciled_at ? new Date(st.reconciled_at).toISOString() : null,
    insurance_ends_at: st.reconciled_at ? new Date(st.reconciled_at + days * 86400000).toISOString() : null,
    fallback_reads: st.fb, fallback_off: st.off, cleaned: st.cleaned,
    classes: rep.rows, index_entries: counts.y, legacy_index_entries: counts.legacy_x, key_links_at_new: counts.kl, key_links_legacy: counts.legacy_k
  };
}
