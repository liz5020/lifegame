// 2026-09-30新增（十、10.2.2）：寄信——驗證信與管理通知信共用Resend(免費方案每月3,000封、每日100封)。
// 寄件網域draftmylife.com，寄信用子網域mail.draftmylife.com，寄件地址noreply@mail.draftmylife.com，寄件人名稱「人生草稿」。
// 寄信金鑰＝Worker secret RESEND_API_KEY(權限設為「只能寄信」、限定draftmylife.com)，不寫進程式碼、不進GitHub。
// 管理通知信寄到環境變數ADMIN_NOTIFY_EMAIL(初始值smile80275@gmail.com，只放Cloudflare後台，這裡不寫死)。

export const MAIL_FROM = "人生草稿 <noreply@mail.draftmylife.com>";
export const RESEND_URL = "https://api.resend.com/emails";

// 回傳{ok, error?}。沒設定金鑰＝not_configured；任何失敗都不丟例外，由呼叫端決定要不要重試
export async function sendMail(env, { to, subject, text }) {
  if (!env || !env.RESEND_API_KEY) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text })
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: "http_" + res.status };
  } catch (e) {
    return { ok: false, error: "network" };
  }
}

// 10.2.2：主旨「人生草稿 驗證碼：123456」；內文只有驗證碼、「10 分鐘內有效」、用途說明「保存進度和找回帳號」，信中不放任何連結
export function verifyMail(code) {
  return {
    subject: "人生草稿 驗證碼：" + code,
    text: "你的驗證碼：" + code + "\n10 分鐘內有效。\n用途：保存進度和找回帳號。\n"
  };
}

// 台灣時間 YYYY/MM/DD HH:mm（台灣時間）
export function taipeiTimeText(ms) {
  const d = new Date(ms + 8 * 3600 * 1000), p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}（台灣時間）`;
}

const round2 = x => Math.round(Number(x) * 100) / 100; // 2026-10-08：花費改記實際花費，金額會有小數，通知信取兩位
// 管理通知信(10.9.3.1、10.9.3.2)。kind：spend80／spend100／gift15／giftFull；info：{spent, cap, gifts, queued, giftCap, now}
export function noticeMail(kind, info) {
  const time = taipeiTimeText(info.now);
  if (kind === "spend80" || kind === "spend100") {
    const lines = [
      "今日估計花費：" + round2(info.spent) + " 元",
      "目前上限：" + round2(info.cap) + " 元",
      "時間：" + time
    ];
    if (kind === "spend80") {
      lines.push("狀態：今日花費已達上限的 80%。");
      return { subject: "人生草稿：今日花費已達上限的 80%", text: lines.join("\n") + "\n" };
    }
    lines.push("狀態：今日花費已碰到上限。");
    lines.push("已暫停從未購買過的帳號的 AI 呼叫，台灣時間午夜自動恢復。");
    return { subject: "人生草稿：今日花費已碰到上限", text: lines.join("\n") + "\n" };
  }
  if (kind === "creditOut") {
    return { subject: "人生草稿：Anthropic 餘額用完了", text: [
      "狀態：Anthropic 回報帳戶餘額不足，AI 呼叫都失敗了。",
      "玩家端看到「撰稿人今天寫得太多，需要休息一下」，不扣點、進度保留。",
      "請到 Anthropic Console 的 Billing 儲值；儲值後會自動恢復，不用重新部署。",
      "時間：" + time
    ].join("\n") + "\n" };
  }
  const lines = [
    "今日已發份數：" + info.gifts + " 份",
    "目前上限：" + info.giftCap + " 份",
    "排隊人數：" + info.queued + " 人",
    "時間：" + time
  ];
  if (kind === "gift15") return { subject: "人生草稿：今日啟程禮已發 15 份", text: lines.join("\n") + "\n" };
  return { subject: "人生草稿：今日啟程禮已發滿", text: lines.join("\n") + "\n" };
}

// 十、10.15.5：候補通知信。保留期限＝寄送成功那一刻＋72小時(台灣時間)，例：「10 月 8 日中午 12:00」。網址只放文字，不做按鈕、不放其他連結
export function taipeiDeadlineText(ms) {
  const d = new Date(ms + 8 * 3600 * 1000), h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, "0");
  const part = h === 12 ? "中午" : h < 12 ? "上午" : "下午";
  const hh = h === 12 ? 12 : h % 12;
  return (d.getUTCMonth() + 1) + " 月 " + d.getUTCDate() + " 日" + part + " " + hh + ":" + m;
}
export function waitlistMail(expMs) {
  return {
    subject: "人生草稿：輪到你了",
    text: "你的封測名額已經準備好了，保留到 " + taipeiDeadlineText(expMs) + "。\n" +
      "請打開 draftmylife.com，用這個信箱登入，就可以開始你的人生。\n" +
      "這封信是因為你留了信箱候補才寄出的，之後不會再寄其他通知。\n"
  };
}
// 十、10.15.6：累計入場達檢查點的管理通知信
export function checkpointMail(info) {
  return {
    subject: "人生草稿：封測名額已達檢查點",
    text: ["累計入場人數：" + info.cum + " 人", "目前檢查點：" + info.checkpoint + " 人", "候補排隊人數：" + info.queued + " 人", "時間：" + taipeiTimeText(info.now),
      "名額已暫停發放，調高檢查點後隔天 00:00 恢復。"].join("\n") + "\n"
  };
}
