// 2026-09-25新增（佇列批次2：行動點改由Worker端檢查，設計文件十、10.3.11）
// 原本扣點只發生在index.html，繞過畫面直接打Worker就能無限呼叫AI。現在每條人生的行動點餘額存在KV(ap:<金鑰>:<slot>)，
// Worker呼叫Anthropic之前先檢查、扣點，前端只負責顯示Worker回傳的餘額。規則照10.3.1～10.3.10：
//   - 每回合1點，扣點順序：每日池→禮包點→購買點
//   - 每日池在台灣00:00(UTC+8)後第一次使用時補到5點，不累加；日期由伺服器判斷，不看玩家裝置時間(10.3.5)
//   - API失敗/斷線/AI回傳格式壞掉：不扣點；重新生成(同一回合的turn_nonce)：不扣點(10.3.1)
//   - 啟程禮：未綁信箱新人生25點，每把金鑰一輩子1次(10.3.4，2026-09-30第三批由55點／3次改)
//   - 人生結束(封存)：這條人生的點數紀錄刪除(禮包點消失)，購買點照舊由/archive移到金鑰錢包(10.3.6)
//   - 世代傳承/restart_item：沿用同一個slot，點數紀錄不動＝全部繼承(10.3.6)
// ⚠️購買點目前仍信任前端(/archive送來的purchased)；封測尚未開放購買，永遠是0。開放付費前要改成以伺服器端付款紀錄為準

export const AP_DAILY_REFILL = 5;
// 2026-09-30(第三批)：啟程禮拆成三種——未綁信箱的新人生25點(每把金鑰／裝置只領1次，同時只能1段)、綁定信箱再+30點(25＋30＝55)、帳號開第2段人生再+55點。
// AP_LEGACY_GIFT_MAX：封測留下、改版前已領55點的舊人生，本機點數可以到55，併入帳號時的上限照這個算
export const AP_UNBOUND_GIFT = 25;
export const AP_BIND_BONUS = 30;
export const AP_SECOND_LIFE_GIFT = 55;
export const AP_LEGACY_GIFT_MAX = 55;
export const AP_GIFT_CLAIMS_PER_KEY = 1;
export const AP_COST_PER_TURN = 1;
// 同一個turn_nonce最多呼叫幾次AI(十、10.17.5，2026-10-08由5改9)：一次送出最多5次(第一次＋失敗重試1次＋場景日期違規重新生成1次＋輸出品質不合格重新生成最多2次，一、1.2.9.18)；
// 「再試一次」沿用同一個turn_nonce：失敗的那次送出最多用掉2次(第一次＋失敗重試)，之後成功的那次送出最多5次，合計最多7次，再加2次餘裕＝9。
// 達上限時前端放掉這個turn_nonce(下一次送出換新的)，所以不會卡死
export const MAX_CALLS_PER_TURN_NONCE = 9;
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
      rec.gift = toInt(apHint.gift, AP_LEGACY_GIFT_MAX);
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
export function preCharge(rec, { nonce, isPrologue, lifeId, retryOfFailed }) {
  if (rec.lastNonce === nonce) {
    // 同一回合的重試/重新生成
    if (rec.nonceCalls >= MAX_CALLS_PER_TURN_NONCE) return { ok: false, status: 429, error: { type: "regeneration_limit", message: "這一回合重新生成太多次了" } };
    rec.nonceCalls += 1;
    // 這回合已經扣過(成功過一次)，重新生成不再扣。十、10.17.5：玩家按「再試一次」(retryOfFailed)沿用同一回合編號時，上一次是伺服器已扣點、內容寫好但前端沒收到(例如逾時)——
    // 這次不重複扣，但這次若又失敗，要把那一筆退掉(postCharge)；上一次已退點(nonceCharged為null)就走下面的正常預扣
    if (rec.nonceCharged) return { ok: true, charge: null, repeat: true, retryOfFailed: !!retryOfFailed };
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
export function postCharge(rec, pre, success, lifeId, today) {
  if (success && today) markAction(rec, today); // 10.6.2（2026-09-27）：有成功的回合就算這天有行動
  if (!success) {
    if (pre.charge) { refund(rec, pre.charge); rec.nonceCharged = null; }
    else if (pre.repeat && pre.retryOfFailed && rec.nonceCharged) { refund(rec, rec.nonceCharged); rec.nonceCharged = null; } // 10.17.5：「再試一次」又失敗，退掉上一次留下的那一筆
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
  // 一、1.2.9.16（2026-09-28）：narrative改交段落清單(字串陣列)；舊格式(單一字串)仍接受
  const narr = input.narrative;
  const narrOk = typeof narr === "string" ? !!narr.trim()
    : (Array.isArray(narr) && narr.some(p => typeof p === "string" && p.trim()) && narr.every(p => typeof p === "string"));
  if (!narrOk) return false;
  if (typeof input.turn_summary !== "string" || !input.turn_summary.trim()) return false;
  if (!Array.isArray(input.choices)) return false;
  if (!input.is_ending && input.choices.length === 0) return false;
  try { if (/<\/narrative>|<parameter\s+name=/.test(JSON.stringify(input))) return false; } catch (e) { return false; }
  return true;
}

// ========== 十五、人生之書：章節成書的額度（2026-09-25新增，佇列批次6） ==========
// 章節成書不扣行動點(玩家獎勵)，但要防止被拿來當免費AI用：每條人生每玩成功10回合累積1章的額度(最多存10章)，
// 新章節用掉1章額度；同一章(chapter_id)重試不再扣額度，但最多呼叫5次
export const CHAPTER_TURN_UNITS = 10;
export const CHAPTER_UNITS_CAP = 100;
export const MAX_CALLS_PER_CHAPTER = 5;
export function isValidChapterId(id) { return typeof id === "string" && /^[a-z0-9]{4,40}$/.test(id); }
export function addChapterUnit(rec) {
  rec.chapterUnits = Math.min(CHAPTER_UNITS_CAP, (Number(rec.chapterUnits) || 0) + 1);
}
export function preChapter(rec, chapterId) {
  if (!rec.chapterCalls || typeof rec.chapterCalls !== "object") rec.chapterCalls = {};
  const calls = rec.chapterCalls[chapterId];
  if (calls !== undefined) {
    if (calls >= MAX_CALLS_PER_CHAPTER) return { ok: false, status: 429, error: { type: "chapter_retry_limit", message: "這一章重試太多次了" } };
    rec.chapterCalls[chapterId] = calls + 1;
    return { ok: true };
  }
  if ((Number(rec.chapterUnits) || 0) < CHAPTER_TURN_UNITS) return { ok: false, status: 402, error: { type: "chapter_not_available", message: "這條人生還沒累積到可以成書的回合數" } };
  rec.chapterUnits -= CHAPTER_TURN_UNITS;
  rec.chapterCalls[chapterId] = 1;
  const ids = Object.keys(rec.chapterCalls);
  if (ids.length > 12) delete rec.chapterCalls[ids[0]]; // 只留最近幾章的重試次數
  return { ok: true };
}
export function isUsableChapterResponse(data) {
  const block = data && Array.isArray(data.content) && data.content.find(b => b.type === "tool_use" && b.name === "submit_chapter");
  if (!block || !block.input) return false;
  const { title, text } = block.input;
  return typeof title === "string" && title.trim().length > 0 && typeof text === "string" && text.trim().length >= 300;
}

// ========== 十、10.6 放置代活（2026-09-27，使用者授權Claude全權判斷） ==========
// 10.6.2【定案】「離線日」＝一整天(台灣日期)沒有任何行動；回來那天不算。放置回合數＝完整離線天數×5，最多7天35回合。
// 由伺服器計算：每次成功扣點的回合(postCharge)記下lastActionDate；領取放置(claimIdle)後把lastActionDate設成今天，同一段離線只能領一次。
// 放置摘要(10.6.4)不扣點，但要有剛領過放置的額度(idleSummaryCalls)才能呼叫，避免被拿來免費呼叫AI
export const IDLE_ROUNDS_PER_DAY = 5;
export const IDLE_MAX_DAYS = 7;
export const MAX_IDLE_SUMMARY_CALLS = 3;
function dateToDayNumber(d) { const [y, m, dd] = String(d).split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, dd) / 86400000); }
export function offlineDaysBetween(lastActionDate, today) {
  if (!lastActionDate || !today) return 0;
  const gap = dateToDayNumber(today) - dateToDayNumber(lastActionDate) - 1; // 兩個日期之間「完整」的天數
  return Math.max(0, Math.min(IDLE_MAX_DAYS, gap));
}
export function markAction(rec, today) { rec.lastActionDate = today; }
export function claimIdle(rec, today) {
  const days = offlineDaysBetween(rec.lastActionDate, today);
  rec.lastActionDate = today;
  if (days > 0) rec.idleSummaryCalls = MAX_IDLE_SUMMARY_CALLS; else rec.idleSummaryCalls = 0;
  rec.idleRollbackAvailable = days > 0; // 10.6.5：每次放置只能回溯一次
  return { offlineDays: days, rounds: days * IDLE_ROUNDS_PER_DAY };
}
export function preIdleSummary(rec) {
  if (!((Number(rec.idleSummaryCalls) || 0) > 0)) return { ok: false, status: 402, error: { type: "idle_summary_not_available", message: "沒有可以寫摘要的放置紀錄" } };
  rec.idleSummaryCalls -= 1;
  return { ok: true };
}
export function isUsableIdleSummaryResponse(data) {
  const block = data && Array.isArray(data.content) && data.content.find(b => b.type === "tool_use" && b.name === "submit_idle_summary");
  if (!block || !block.input) return false;
  const { retrospect, fragments } = block.input;
  return typeof retrospect === "string" && retrospect.trim().length > 0 && Array.isArray(fragments);
}
// 10.6.5【定案】回溯重大決定花5點，扣點順序比照10.3.3(每日池→禮包點→購買點)，每次放置只能一次
export const IDLE_ROLLBACK_COST = 5;
export function chargeIdleRollback(rec) {
  if (!rec.idleRollbackAvailable) return { ok: false, status: 409, error: { type: "idle_rollback_used", message: "這次放置已經回溯過了" } };
  if (rec.daily + rec.gift + rec.purchased < IDLE_ROLLBACK_COST) return { ok: false, status: 402, error: { type: "insufficient_action_points", message: "行動點不足" } };
  spend(rec, IDLE_ROLLBACK_COST);
  rec.idleRollbackAvailable = false;
  return { ok: true };
}
// 十六、16.7.2.1【定案】回顧這一生解鎖扣60點(2026-10-08付費周邊，取代原本的5點)，扣點順序同10.3.3。AI成功產生後才扣(10.3.1 API失敗不扣點)；
// 請求前先確認餘額夠，不夠直接擋下、不呼叫AI
export const LIFE_REVIEW_COST = 60;
export function canAffordLifeReview(rec) { return rec.daily + rec.gift + rec.purchased >= LIFE_REVIEW_COST; }
export function chargeLifeReview(rec) { spend(rec, LIFE_REVIEW_COST); }
export function isUsableLifeReviewResponse(data) {
  const block = data && Array.isArray(data.content) && data.content.find(b => b.type === "tool_use" && b.name === "submit_life_review");
  if (!block || !block.input) return false;
  return Array.isArray(block.input.trajectory) && block.input.trajectory.length > 0 && Array.isArray(block.input.tidbits);
}
