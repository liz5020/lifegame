// 2026-09-30（十、10.2、10.9.2、10.9.3，第二批）帳號相關的HTTP路由
//   POST /account/send-code   {email}                          寄6位數驗證碼(上限見account.js)
//   POST /account/bind        {email, code, key, lives}        綁定信箱：建立帳號、未綁人生帶過去、錢包再+30點
//   POST /account/login       {email, code, key, lives}        用信箱登入既有帳號：裝置上的未綁人生併入、點數併入錢包
//   POST /account/logout      (Authorization: Bearer <token>)  只登出這台裝置
//   GET  /account/me          (Authorization)                  帳號狀態(每日補點、排隊中的啟程禮補發都在這裡順便處理)
//   POST /account/change-email {email, code} (Authorization)   換綁信箱：要先通過新信箱的驗證碼
//   POST /account/lives       {op:"add"|"remove"|"attach", …}  帳號的人生登記(最多2段)、第2份啟程禮
//   POST /account/wallet      {op:"charge"|"refund"|"spend"…}  只給mock模式與非回合的扣點用(真實模式的回合扣點在AI代理裡做)
//   GET  /gate                                                 現在AI呼叫是不是被全站花費上限暫停(給前端顯示小字用)
// 全部不碰KV(帳號資料在Durable Object)，所以雲端存檔關閉時照樣能用。驗證碼本身只會出現在寄出的信裡，不會回傳給前端。

import { jsonResponse } from "./http.js";
import { accountsCall, accountStore, bearerToken, syncGiftStats, spendGate } from "./gate.js";
import { sendMail, verifyMail } from "./mail.js";
import { isValidNonce, isValidLifeId } from "./ap.js";

const CODE_ERRORS = ["no_code", "code_expired", "code_locked", "wrong_code"];
function statusFor(error) {
  if (error === "unauthorized") return 401;
  if (["invalid_email", "bad_key", "bad_lid", "bad_nonce", "bad_amount", "bad_request"].includes(error) || CODE_ERRORS.includes(error)) return 400;
  if (["email_exists", "key_linked", "account_full", "no_account"].includes(error)) return 409;
  if (["too_soon", "rate_limited", "daily_cap"].includes(error)) return 429;
  if (error === "accounts_unavailable" || error === "mail_not_configured") return 503;
  return 500;
}
async function readBody(request) {
  try { const b = await request.json(); return b && typeof b === "object" ? b : {}; } catch (e) { return null; }
}
// DO的回應→HTTP回應：失敗時{success:false, error, ...}，成功時把帳號狀態原樣帶出去
function reply(origin, r, ctx, env) {
  if (r && r.gift_changed && r.gift_stats) { const j = syncGiftStats(env, ctx, r.gift_stats); if (j && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(j); }
  if (!r || r.ok === false) {
    const err = r && r.error;
    const code = typeof err === "string" ? err : (err && err.type) || "error";
    const out = { success: false, error: code };
    if (r && r.tries_left !== undefined) out.tries_left = r.tries_left;
    if (r && r.retry_after !== undefined) out.retry_after = r.retry_after;
    if (r && r.wallet) out.wallet = r.wallet;
    if (r && r.events && r.events.length) out.events = r.events;
    return jsonResponse(origin, out, (r && r.status) || statusFor(code));
  }
  const out = { success: true };
  for (const k of ["token", "account", "events", "result", "wallet", "pre", "can"]) if (r[k] !== undefined) out[k] = r[k];
  return jsonResponse(origin, out, 200);
}

export async function handleAccountRoute(request, env, origin, ctx, url) {
  if (!accountStore(env)) return jsonResponse(origin, { success: false, error: "accounts_unavailable" }, 503);
  const path = url.pathname;
  const method = request.method;
  const token = bearerToken(request);

  if (path === "/gate" && method === "GET") {
    const g = await spendGate(request, env, ctx);
    return jsonResponse(origin, { success: true, paused: !!g.blocked });
  }
  if (path === "/account/me" && method === "GET") {
    return reply(origin, await accountsCall(env, { op: "me", token }), ctx, env);
  }
  if (method !== "POST") return new Response("Only POST is allowed", { status: 405 });
  const body = await readBody(request);
  if (body === null) return jsonResponse(origin, { success: false, error: "bad_request" }, 400);

  if (path === "/account/send-code") {
    if (!env.RESEND_API_KEY) return jsonResponse(origin, { success: false, error: "mail_not_configured" }, 503);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const r = await accountsCall(env, { op: "send_code_reserve", email: body.email, ip });
    if (!r.ok) return reply(origin, r, ctx, env);
    const m = await sendMail(env, Object.assign({ to: r.email }, verifyMail(r.code)));
    if (!m.ok) {
      await accountsCall(env, { op: "send_code_release", email: body.email, ip }); // 寄失敗不算玩家的次數
      return jsonResponse(origin, { success: false, error: "send_failed" }, 502);
    }
    return jsonResponse(origin, { success: true, next_send_in: r.next_send_in, expires_in: r.expires_in });
  }
  if (path === "/account/bind") {
    return reply(origin, await accountsCall(env, { op: "bind", email: body.email, code: body.code, key: body.key, lives: body.lives }), ctx, env);
  }
  if (path === "/account/login") {
    return reply(origin, await accountsCall(env, { op: "login", email: body.email, code: body.code, lives: body.lives }), ctx, env);
  }
  if (path === "/account/logout") {
    await accountsCall(env, { op: "logout", token });
    return jsonResponse(origin, { success: true });
  }
  if (path === "/account/change-email") {
    return reply(origin, await accountsCall(env, { op: "change_email", token, email: body.email, code: body.code }), ctx, env);
  }
  if (path === "/account/lives") {
    if (body.op === "add") return reply(origin, await accountsCall(env, { op: "life_add", token, lid: body.lid }), ctx, env);
    if (body.op === "remove") return reply(origin, await accountsCall(env, { op: "life_remove", token, lid: body.lid }), ctx, env);
    if (body.op === "attach") return reply(origin, await accountsCall(env, { op: "attach_lives", token, lives: body.lives }), ctx, env);
    return jsonResponse(origin, { success: false, error: "bad_request" }, 400);
  }
  if (path === "/account/wallet") {
    if (body.op === "charge") {
      if (!isValidNonce(body.nonce) || (body.life_id !== undefined && !isValidLifeId(body.life_id))) return jsonResponse(origin, { success: false, error: "bad_request" }, 400);
      return reply(origin, await accountsCall(env, { op: "wallet_pre", token, nonce: body.nonce, life_id: body.life_id, is_prologue: body.prologue === true }), ctx, env);
    }
    if (body.op === "refund") return reply(origin, await accountsCall(env, { op: "wallet_post", token, nonce: body.nonce, life_id: body.life_id, success: false }), ctx, env);
    if (body.op === "spend") return reply(origin, await accountsCall(env, { op: "wallet_spend", token, n: body.n }), ctx, env);
    return jsonResponse(origin, { success: false, error: "bad_request" }, 400);
  }
  return null; // 不是帳號路由
}
export function isAccountPath(pathname) {
  return pathname === "/gate" || pathname.startsWith("/account/");
}
