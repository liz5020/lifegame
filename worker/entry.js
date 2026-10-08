// 十、10.15（2026-10-04封測名額與候補）：排程與寄信部分。名額、候補隊伍、分配、過期的資料與規則都在帳號Durable Object(account.js)，這裡只負責「寄信」。
//   候補通知信：分配當天台灣時間中午12:00起寄(排程每小時整點跑一次)，失敗每小時重試、最多3次；不計入DAILY_VERIFY_EMAIL_CAP
//   檢查點通知信：累計入場達BETA_PLAYER_CHECKPOINT時寄一封給ADMIN_NOTIFY_EMAIL，防重複與重試比照10.9.3.1a
import { accountsCall } from "./gate.js";
import { sendMail, waitlistMail, checkpointMail } from "./mail.js";
import { nowMs } from "./ap.js";

// 檢查點通知信：notice由帳號DO交出(沒有要寄就是null)；寄完回報結果。沒有ctx.waitUntil就直接等(回傳promise)
export function flushCheckpointNotice(env, ctx, notice) {
  if (!notice) return null;
  const job = (async () => {
    let ok = false;
    try {
      if (env.ADMIN_NOTIFY_EMAIL) ok = (await sendMail(env, Object.assign({ to: env.ADMIN_NOTIFY_EMAIL }, checkpointMail(notice)))).ok;
      else console.warn("尚未設定ADMIN_NOTIFY_EMAIL，檢查點通知信沒寄出");
    } catch (e) { ok = false; }
    try { await accountsCall(env, { op: "cp_result", checkpoint: notice.checkpoint, ok }); } catch (e) { /* 回報失敗下次還會再試 */ }
  })();
  if (ctx && typeof ctx.waitUntil === "function") { ctx.waitUntil(job); return null; }
  return job;
}

// 每小時整點：當天分配(碰到帳號DO時自動做)、寄候補通知信、檢查點通知信。回傳{sent, failed}方便測試
export async function runWaitlistTick(env, ctx) {
  // 十、10.16.15：先清掉已到期的防濫用紀錄(IP、寄信次數)；失敗不影響後面的分配與寄信
  try { await accountsCall(env, { op: "purge_abuse" }); } catch (e) { console.warn("防濫用紀錄清除失敗：" + (e && e.message || e)); }
  // 十、10.15.11第1項：先分配(wl_due一開始就做當天的過期收回與分配，已做過就略過)，再寄信
  const r = await accountsCall(env, { op: "wl_due" });
  const out = { sent: 0, failed: 0 };
  if (!r || !r.ok) return out;
  for (const d of r.due || []) {
    // 保留期從寄送成功那一刻起算：寄之前先用「現在＋72小時」估出信上的期限(成功後帳號DO用實際成功時間記，兩者只差寄信的幾秒)
    const exp = nowMs(env) + 72 * 3600 * 1000;
    let ok = false;
    try { ok = (await sendMail(env, Object.assign({ to: d.email }, waitlistMail(exp)))).ok; } catch (e) { ok = false; }
    await accountsCall(env, { op: "wl_mail_result", aid: d.aid, ok });
    if (ok) out.sent++; else out.failed++;
  }
  const j = flushCheckpointNotice(env, ctx, r.notice);
  if (j) await j;
  return out;
}
