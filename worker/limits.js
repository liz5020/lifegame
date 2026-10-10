// 2026-10-10：後台「攔截門檻」分頁的資料——把所有「會讓玩家被擋住或被限量」的數字集中列出，
// 值一律現算（後台可調的讀目前生效的設定值，程式固定的讀程式裡的常數），所以改了設定或常數，這裡自動跟著變，不會有第二份要同步的數字。
// 這個檔案只讀、不改任何設定；使用量（今天用了多少）由網頁自己搭配 /usage-today 與 /stats-summary 的 entry 補上。
import { spendCap, giftCap, newPlayerCap, playerCheckpoint, readSetting } from "./gate.js";
import {
  AP_DAILY_REFILL, AP_UNBOUND_GIFT, AP_BIND_BONUS, AP_SECOND_LIFE_GIFT, AP_GIFT_CLAIMS_PER_KEY, AP_COST_PER_TURN,
  MAX_CALLS_PER_TURN_NONCE, FREE_PROLOGUES_PER_SLOT_PER_DAY, MAX_CALLS_PER_CHAPTER_PER_DAY, IDLE_ROUNDS_PER_DAY, IDLE_MAX_DAYS, LIFE_REVIEW_COST, IDLE_ROLLBACK_COST
} from "./ap.js";
import {
  CODE_MAX_TRIES, RESEND_GAP_MS, EMAIL_HOURLY_MAX, IP_HOURLY_MAX, DEFAULT_DAILY_VERIFY_EMAIL_CAP, MAX_SESSIONS_PER_ACCOUNT, ACCOUNT_LIFE_MAX,
  GIFTS_PER_ACCOUNT, CARRY_MAX_TOTAL, WL_HOLD_MS
} from "./account.js";

// fixed＝worker.js 裡沒有 export 的常數，由 worker.js 傳進來
export function buildLimits(env, fixed) {
  const F = fixed || {};
  const ADJ = "後台可調", FIX = "程式固定（要改程式再部署）";
  const g = (group, label, value, unit, source, varName, effect, usage) => ({ group, label, value, unit, source, var: varName || null, effect, usage: usage || null });
  return [
    g("新玩家進場", "每日新玩家名額", newPlayerCap(env), "位", ADJ, "DAILY_NEW_PLAYER_CAP", "滿了之後新來的人進候補，隔天 00:00 起依序補位。設 0 ＝完全暫停發名額。", "newPlayers"),
    g("新玩家進場", "累計入場檢查點", playerCheckpoint(env), "位", ADJ, "BETA_PLAYER_CHECKPOINT", "累計入場人數到這個數字就停止發名額，調高後隔天 00:00 才恢復。", "checkpoint"),
    g("新玩家進場", "候補位子保留時間", WL_HOLD_MS / 3600000, "小時", FIX, null, "通知信寄出後這段時間內不入場，位子收回。"),

    g("花費", "每日花費上限", spendCap(env), "元", ADJ, "DAILY_SPEND_CAP", "碰到上限，從未購買過的帳號暫停 AI 呼叫，玩家看到「撰稿人休息一下」；台灣時間午夜恢復。已購買的帳號不受影響。", "spend"),
    g("花費", "Anthropic 餘額用完", "自動偵測", "", FIX, null, "玩家看到「撰稿人休息一下，稍後恢復」，你收到通知信；儲值後自動恢復。"),

    g("點數", "每日補點", AP_DAILY_REFILL, "點", FIX, null, "每天台灣時間午夜補到這個數字（不是加上去，是補滿到）。"),
    g("點數", "未綁信箱的啟程禮", AP_UNBOUND_GIFT, "點", FIX, null, "每把金鑰只能領一次（上限 " + AP_GIFT_CLAIMS_PER_KEY + " 次）。"),
    g("點數", "綁定信箱第 1 份啟程禮", AP_BIND_BONUS, "點", FIX, null, "每個信箱最多 " + GIFTS_PER_ACCOUNT + " 份。"),
    g("點數", "第 2 段人生啟程禮", AP_SECOND_LIFE_GIFT, "點", FIX, null, "開第 2 段人生時領。"),
    g("點數", "每日啟程禮發放上限", giftCap(env), "份", ADJ, "DAILY_GIFT_CAP", "發滿之後綁信箱照常成功，只是那份啟程禮延到隔天午夜後補發。", "gifts"),
    g("點數", "綁定／併入時帶過來的點數上限", CARRY_MAX_TOTAL, "點", FIX, null, "未綁人生併進帳號時，累計最多帶這麼多點。"),
    g("點數", "每回合扣點", AP_COST_PER_TURN, "點", FIX, null, "開場免費。"),
    g("點數", "回顧這一生", LIFE_REVIEW_COST, "點", FIX, null, "成功才扣。"),
    g("點數", "放置回溯", IDLE_ROLLBACK_COST, "點", FIX, null, ""),

    g("帳號與信箱", "每個帳號最多人生段數", ACCOUNT_LIFE_MAX, "段", FIX, null, "超過段數的人生沿用本機點數，不走帳號共用錢包。"),
    g("帳號與信箱", "每日驗證信上限（全站）", readSetting(env, "DAILY_VERIFY_EMAIL_CAP", DEFAULT_DAILY_VERIFY_EMAIL_CAP), "封", ADJ, "DAILY_VERIFY_EMAIL_CAP", "超過就不再寄驗證信，玩家看到「今天寄信的人比較多，請明天再試」。"),
    g("帳號與信箱", "同一信箱重寄間隔", RESEND_GAP_MS / 1000, "秒", FIX, null, ""),
    g("帳號與信箱", "同一信箱每小時最多", EMAIL_HOURLY_MAX, "封", FIX, null, ""),
    g("帳號與信箱", "同一網路位址每小時最多", IP_HOURLY_MAX, "封", FIX, null, "公司或學校共用網路的人可能被連帶擋住。"),
    g("帳號與信箱", "驗證碼輸錯幾次作廢", CODE_MAX_TRIES, "次", FIX, null, ""),
    g("帳號與信箱", "每個帳號同時登入的裝置數", MAX_SESSIONS_PER_ACCOUNT, "台", FIX, null, ""),

    g("單次請求", "同一回合最多重新生成", MAX_CALLS_PER_TURN_NONCE, "次", FIX, null, "超過後「再試一次」要換新的回合編號。"),
    g("單次請求", "每條人生每天免費開場", FREE_PROLOGUES_PER_SLOT_PER_DAY, "次", FIX, null, ""),
    g("單次請求", "寫章節每章每天最多", MAX_CALLS_PER_CHAPTER_PER_DAY, "次", FIX, null, "超過看到「這一章暫時寫不出來，明天再試」。"),
    g("單次請求", "放置每天回合數／最多天數", IDLE_ROUNDS_PER_DAY + "／" + IDLE_MAX_DAYS, "", FIX, null, ""),
    g("單次請求", "自由輸入字數上限", F.playerActionChars || null, "字", FIX, null, "超過會被拒絕。"),
    g("單次請求", "單次回合內容上限", F.turnPayloadChars || null, "字", FIX, null, "長壽人生內容很長時可能碰到。"),
    g("單次請求", "存檔大小上限", F.stateBytes ? Math.round(F.stateBytes / 1024) : null, "KB", FIX, null, "超過存不進雲端，長壽人生本來就接近上限。"),

    g("頻率限制", "同一網路位置每分鐘請求", F.rateLimitPerMin || null, "次", FIX, "wrangler.toml", "Cloudflare 內建，超過回 429。"),
    g("頻率限制", "封存包每小時寫入", readSetting(env, "STAGE_PACK_RATE_PER_HOUR", F.stagePackPerHour || 60), "次", ADJ, "STAGE_PACK_RATE_PER_HOUR", "超過視同存檔失敗。")
  ];
}
