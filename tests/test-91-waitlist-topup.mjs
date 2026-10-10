// 2026-10-10 十、10.15.4：當天調高名額，候補立即補位；12:00以後分到的在下一次整點排程寄通知（全程假Resend與假上游）
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.15.4 候補當天補位");
const resend = H.makeFakeResend(); H.installUpstream(H.makeFakeAnthropic(), resend);
const worker = await H.loadWorker();
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const TW0 = Date.parse("2026-10-10T00:00:00+08:00");
const mk = (extra) => H.makeAccountEnv(Object.assign({ CLOUD_SAVE_ENABLED: "false", SAVE_ADMIN_TOKEN: "save-pw", TEST_NOW_MS: String(TW0 + 1 * HOUR) }, extra || {}));
const at = (e, ms) => { e.TEST_NOW_MS = String(TW0 + ms); };
const post = (e, path, body, headers) => H.callWorker(e, { path, body, headers });
const get = (e, path, headers) => H.callWorker(e, { method: "GET", path, headers });
const auth = t => ({ Authorization: "Bearer " + t });
const tick = async e => { const w = []; await worker.scheduled({ cron: "0 * * * *" }, e, { waitUntil: p => w.push(p) }); await Promise.all(w); };
let ipn = 0;
const join = async (e, email, key) => {
  const ip = "7.7.7." + (++ipn);
  await post(e, "/account/send-code", { email }, { "CF-Connecting-IP": ip });
  return post(e, "/waitlist/join", { email, code: resend.lastCode(email), key }, undefined);
};
const status = async e => (await get(e, "/entry/status")).json;
const stats = async e => (await get(e, "/stats-summary", auth("admin-secret"))).json.entry;
const fill = async (e, n, tag) => { for (let i = 1; i <= n; i++) await post(e, "/entry/claim", { key: tag + "-" + i }); };
const setup = async (cap, queue, extra) => {
  const e = await mk(Object.assign({ DAILY_NEW_PLAYER_CAP: String(cap) }, extra || {}));
  await fill(e, cap, "K" + (++ipn));
  const toks = [];
  for (let i = 1; i <= queue; i++) { at(e, 1 * HOUR + i * 2 * MIN); const r = await join(e, `q${ipn}x${i}@example.com`, `WK${ipn}-${i}`); toks.push(r.json.token); }
  at(e, 12 * HOUR + 20 * MIN + 59 * MIN); // 約13:20
  return { e, toks };
};
const wlStatus = async (e, t) => (await get(e, "/account/me", auth(t))).json.account.wl.status;

// 2) 名額用完、12人候補，調高50 → 12人補位，剩38給直接來的
{
  const { e, toks } = await setup(5, 12, { BETA_PLAYER_CHECKPOINT: "200" });
  A.check("調高前：滿額、12人排隊", (await status(e)).open === false && (await stats(e)).waiting === 12);
  e.DAILY_NEW_PLAYER_CAP = "55";
  const st = await status(e);
  const s = await stats(e);
  A.check("調高50後下一次請求：12人都補位、排隊0", s.waiting === 0 && s.notified === 12 && s.used === 17, s);
  A.check("剩38個開放給直接來的人", st.open === true && st.remaining === 38, st);
  A.check("原順序：第1位與第12位都已分配", (await wlStatus(e, toks[0])) === "allocated" && (await wlStatus(e, toks[11])) === "allocated");
  await status(e); await status(e);
  A.check("重複呼叫不重複補位／扣名額", (await stats(e)).used === 17 && (await stats(e)).cum === 17);
  // 6) 13:20分到，14:00排程寄
  A.check("13:20補位後到14:00前尚未寄信", resend.notices().length === 0);
  at(e, 14 * HOUR); await tick(e);
  A.check("14:00排程寄出12封通知信", resend.notices().length === 12, resend.notices().length);
  A.check("寄出後狀態變已通知、保留期從寄出起算", (await wlStatus(e, toks[0])) === "notified");
  await tick(e);
  A.check("再跑排程不重複寄信", resend.notices().length === 12);
}

// 3) 只調高5：前5人補位，7人仍排隊，直接來的仍進候補
{
  const { e, toks } = await setup(5, 12, { BETA_PLAYER_CHECKPOINT: "200" });
  e.DAILY_NEW_PLAYER_CAP = "10";
  const st = await status(e), s = await stats(e);
  A.check("只調高5：前5人補位、7人仍排隊", s.waiting === 7 && s.notified === 5 && st.open === false, [s, st]);
  A.check("前5位已分配、第6位仍等待", (await wlStatus(e, toks[4])) === "allocated" && (await wlStatus(e, toks[5])) === "waiting");
}

// 4) 補位不超過累計檢查點
{
  const { e } = await setup(5, 12, { BETA_PLAYER_CHECKPOINT: "8" });
  e.DAILY_NEW_PLAYER_CAP = "100";
  const s = await stats(e), st = await status(e);
  A.check("剩3人到檢查點：只補3人，當天整天暫停", s.notified === 3 && s.waiting === 9 && st.open === false && st.reason === "checkpoint", [s, st]);
}

// 5) 沒有玩家請求，只靠每小時排程也會補位
{
  const n0 = resend.notices().length;
  const { e } = await setup(5, 4, { BETA_PLAYER_CHECKPOINT: "200" });
  e.DAILY_NEW_PLAYER_CAP = "20";
  at(e, 14 * HOUR); await tick(e);
  const s = await stats(e);
  A.check("排程醒來補位並寄信", s.waiting === 0 && s.notified === 4 && resend.notices().length === n0 + 4, [s, resend.notices().length]);
}

// 6b) 09:00分到的照舊12:00寄
{
  const before = resend.notices().length;
  const e = await mk({ DAILY_NEW_PLAYER_CAP: "1", BETA_PLAYER_CHECKPOINT: "200" });
  await fill(e, 1, "N");
  at(e, 2 * HOUR); await join(e, "early@example.com", "EARLYK");
  e.DAILY_NEW_PLAYER_CAP = "2"; at(e, 9 * HOUR); await status(e);
  at(e, 10 * HOUR); await tick(e);
  A.check("09:00分到：中午前不寄", resend.notices().length === before);
  at(e, 12 * HOUR); await tick(e);
  A.check("12:00排程寄出", resend.notices().length === before + 1);
}

// 8) 過期收回仍加到隔天，不在當天補位
{
  const e = await mk({ DAILY_NEW_PLAYER_CAP: "1", BETA_PLAYER_CHECKPOINT: "200" });
  await fill(e, 1, "X");
  at(e, 1 * HOUR); const j1 = await join(e, "x1@example.com", "XK1");
  e.DAILY_NEW_PLAYER_CAP = "2"; at(e, 2 * HOUR); await status(e);
  at(e, 12 * HOUR); await tick(e);
  at(e, 4 * DAY + 13 * HOUR); // 通知後超過72小時
  e.DAILY_NEW_PLAYER_CAP = "1";
  const st = await status(e);
  const s = await stats(e);
  A.check("過期後位子收回，新的一天名額照常、累計減1", s.cum <= 2 && (await wlStatus(e, j1.json.token)) === "expired" && st.total >= 1, [s, st]);
}
process.exit(A.report() ? 0 : 1);
