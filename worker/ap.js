// 2026-09-25新增（佇列批次2：行動點改由Worker端檢查，設計文件十、10.3.11）
// 原本扣點只發生在index.html，繞過畫面直接打Worker就能無限呼叫AI。現在每條人生的行動點餘額存在KV(ap:<金鑰>:<slot>)，
// Worker呼叫Anthropic之前先檢查、扣點，前端只負責顯示Worker回傳的餘額。規則照10.3.1～10.3.10：
//   - 每回合1點，扣點順序：每日池→禮包點→購買點
//   - 每日池在台灣00:00(UTC+8)後第一次使用時補到5點，不累加；日期由伺服器判斷，不看玩家裝置時間(10.3.5)
//   - API失敗/斷線/AI回傳格式壞掉：不扣點；重新生成(同一回合的turn_nonce)：不扣點(10.3.1)
//   - 新手禮包55點，每把金鑰一輩子3次(10.3.4)
//   - 人生結束(封存)：這條人生的點數紀錄刪除(禮包點消失)，購買點照舊由/archive移到金鑰錢包(10.3.6)
//   - 世代傳承/restart_item：沿用同一個slot，點數紀錄不動＝全部繼承(10.3.6)
// ⚠️購買點目前仍信任前端(/archive送來的purchased)；封測尚未開放購買，永遠是0。開放付費前要改成以伺服器端付款紀錄為準

export const AP_DAILY_REFILL = 5;
export const AP_NEW_LIFE_GIFT = 55;
export const AP_GIFT_CLAIMS_PER_KEY = 3;
export const AP_COST_PER_TURN = 1;
// 同一個turn_nonce最多呼叫幾次AI：第一次＋失敗重試1次＋場景日期違規重新生成1次(見index.html takeTurn)
export const MAX_CALLS_PER_TURN_NONCE = 3;
// 開場回合(人生正式開始那一回合)不扣點(10.3.1「開場建角不扣點」)。為了避免被拿來無限免費呼叫：
// 同一個life_id只免費一次，且每個slot每個台灣日最多3次免費開場
export const FREE_PROLOGUES_PER_SLOT_PER_DAY = 3;

export function nowMs(env) {
  // 只給測試用：部署環境不會設定TEST_NOW_MS
  const t = env && Number(env.TEST_NOW_MS);
  return Number.isFinite(t) && t > 0 ? t : Date.now();
}
export function taipeiDateString(ms) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
export function apKvKey(key, slot) { return "ap:" + key + ":" + slot; }
export function isValidNonce(n) { return typeof n === "string" && /^[a-z0-9]{6,40}$/.test(n); }
export function isValidLifeId(n) { return typeof n === "string" && /^[a-z0-9]{4,40}$/.test(n); }

function toInt(v, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return max === undefined ? n : Math.min(n, max);
}
export function freshRecord(today) {
  return { daily: AP_DAILY_REFILL, gift: 0, purchased: 0, lastRefillDate: today, lastNonce: null, nonceCalls: 0, nonceCharged: null, prologueLifeIds: [], prologueDay: today, prologueCount: 0 };
}
export function publicAP(rec) {
  return { daily: rec.daily, gift: rec.gift, purchased: rec.purchased, total: rec.daily + rec.gift + rec.purchased, lastRefillDate: rec.lastRefillDate };
}
export function refillIfNeeded(rec, today) {
  if (rec.lastRefillDate === today) return false;
  rec.lastRefillDate = today;
  if (rec.daily >= AP_DAILY_REFILL) return false;
  rec.daily = AP_DAILY_REFILL;
  return true;
}
// 回傳各池實際扣了多少，失敗時照原樣退回
export function spend(rec, n) {
  const used = { daily: 0, gift: 0, purchased: 0 };
  for (const pool of ["daily", "gift", "purchased"]) {
    const take = Math.min(n, rec[pool]);
    rec[pool] -= take; used[pool] = take; n -= take;
  }
  return used;
}
export function refund(rec, used) {
  if (!used) return;
  rec.daily += used.daily; rec.gift += used.gift; rec.purchased += used.purchased;
}

// 讀取某條人生的點數紀錄；沒有紀錄時(改版前就在玩的舊存檔)依前端存檔裡的ap建一份，數字有上限：
// 每日池≤5、禮包點≤55、購買點一律0(封測沒有人買過，不相信前端送來的購買點)
export async function loadRecord(env, key, slot, apHint) {
  const today = taipeiDateString(nowMs(env));
  const raw = await env.SAVES.get(apKvKey(key, slot));
  let rec = null;
  if (raw) { try { rec = JSON.parse(raw); } catch (e) { rec = null; } }
  let migrated = false;
  if (!rec) {
    rec = freshRecord(today);
    if (apHint && typeof apHint === "object") {
      rec.daily = toInt(apHint.daily, AP_DAILY_REFILL);
      rec.gift = toInt(apHint.gift, AP_NEW_LIFE_GIFT);
      rec.lastRefillDate = typeof apHint.lastRefillDate === "string" ? apHint.lastRefillDate.slice(0, 10) : today;
    }
    migrated = true;
  }
  if (!Array.isArray(rec.prologueLifeIds)) rec.prologueLifeIds = [];
  refillIfNeeded(rec, today);
  if (rec.prologueDay !== today) { rec.prologueDay = today; rec.prologueCount = 0; }
  return { rec, today, migrated };
}
export async function saveRecord(env, key, slot, rec) {
  await env.SAVES.put(apKvKey(key, slot), JSON.stringify(rec));
}

// 呼叫AI之前：決定這次要不要扣點/能不能呼叫。回傳{ok, status, error, charge(扣掉的點，失敗時要退), freePrologue}
export function preCharge(rec, { nonce, isPrologue, lifeId }) {
  if (rec.lastNonce === nonce) {
    // 同一回合的重試/重新生成
    if (rec.nonceCalls >= MAX_CALLS_PER_TURN_NONCE) return { ok: false, status: 429, error: { type: "regeneration_limit", message: "這一回合重新生成太多次了" } };
    rec.nonceCalls += 1;
    if (rec.nonceCharged) return { ok: true, charge: null, repeat: true }; // 這回合已經扣過(成功過一次)，重新生成不再扣
  } else {
    rec.lastNonce = nonce; rec.nonceCalls = 1; rec.nonceCharged = null;
  }
  const total = rec.daily + rec.gift + rec.purchased;
  if (isPrologue && lifeId && !rec.prologueLifeIds.includes(lifeId) && rec.prologueCount < FREE_PROLOGUES_PER_SLOT_PER_DAY) {
    return { ok: true, charge: null, freePrologue: true };
  }
  if (total < AP_COST_PER_TURN) return { ok: false, status: 402, error: { type: "insufficient_action_points", message: "行動點不足" } };
  const used = spend(rec, AP_COST_PER_TURN);
  rec.nonceCharged = used;
  return { ok: true, charge: used };
}
// 呼叫AI之後：失敗就退點；成功的免費開場記下life_id
export function postCharge(rec, pre, success, lifeId) {
  if (!success) {
    if (pre.charge) { refund(rec, pre.charge); rec.nonceCharged = null; }
    return;
  }
  if (pre.freePrologue) {
    rec.prologueLifeIds = rec.prologueLifeIds.concat(lifeId).slice(-10);
    rec.prologueCount += 1;
    rec.nonceCharged = { daily: 0, gift: 0, purchased: 0 }; // 標記這回合已處理，重新生成不扣點也不再算一次免費開場
  }
}

// AI回傳內容是否可用(比照index.html的isMalformedTurnResult)——不可用的回應不扣點，前端會重試
export function isUsableTurnResponse(data) {
  const block = data && Array.isArray(data.content) && data.content.find(b => b.type === "tool_use" && b.name === "submit_turn_result");
  if (!block) return false;
  const input = block.input;
  if (!input || typeof input !== "object") return false;
  if (typeof input.narrative !== "string" || !input.narrative.trim()) return false;
  if (typeof input.turn_summary !== "string" || !input.turn_summary.trim()) return false;
  if (!Array.isArray(input.choices)) return false;
  if (!input.is_ending && input.choices.length === 0) return false;
  try { if (/<\/narrative>|<parameter\s+name=/.test(JSON.stringify(input))) return false; } catch (e) { return false; }
  return true;
}
