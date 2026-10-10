// 2026-10-10：Anthropic帳戶餘額用完時，Worker把上游的400 credit balance錯誤改成503 credit_exhausted(跟全站每日上限同一種暫停訊號)，
// 玩家端不再看到泛用的失敗訊息；其他400錯誤不受影響。全程假上游，不打真實API
import * as H from "./harness.mjs";
import { isCreditExhaustedError } from "../worker/worker.js";
const A = H.makeAsserter("餘額不足暫停提示");
let mode = "ok";
const okAI = H.makeFakeAnthropic({});
const fake = async (url, init) => {
  if (mode === "credit") return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } }), { status: 400 });
  if (mode === "badreq") return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "max_tokens too large" } }), { status: 400 });
  return okAI(url, init);
};
const resend = H.makeFakeResend();
H.installUpstream(fake, resend);
const env = await H.makeAccountEnv({});
const post = (path, body, headers) => H.callWorker(env, { path, body, headers });
const payload = JSON.stringify({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false });
let seq = 0;
const turn = () => post("/", { key: "creditkey" + (++seq), slot: 0, turn_nonce: "cre" + seq + "xxxxxxx", life_id: "lifecre" + seq, messages: [{ role: "user", content: payload }] });

A.check("判斷函式：400帶credit balance→是；400其他錯誤→否；529→否；402帶billing→是",
  isCreditExhaustedError(400, "400:invalid_request_error", "Your credit balance is too low") === true &&
  isCreditExhaustedError(400, "400:invalid_request_error", "max_tokens too large") === false &&
  isCreditExhaustedError(529, "529", "credit balance") === false &&
  isCreditExhaustedError(402, "402", "billing issue") === true);

let r = await turn();
A.check("餘額正常：回合照常200", r.status === 200, r.status);
mode = "credit";
r = await turn();
A.check("餘額用完：回503 credit_exhausted，帶daily_cap標記讓前端走同一條暫停流程", r.status === 503 && r.json.error.type === "credit_exhausted" && r.json.lifegame.daily_cap === true && r.json.lifegame.credit_exhausted === true, r);
A.check("回應裡沒有洩漏上游原文(帳務訊息)", !/credit balance|Plans & Billing/i.test(r.text), r.text);
const mails = () => resend.notices().filter(x => x.subject.includes("餘額用完"));
A.check("餘額用完：寄一封通知信給管理者，說明玩家端看到什麼與怎麼處理", mails().length === 1 && mails()[0].text.includes("Billing") && mails()[0].text.includes("休息一下"), resend.notices().map(x => x.subject));
r = await turn();
A.check("同一天再失敗一次：不重複寄信", r.status === 503 && mails().length === 1, mails().length);
mode = "badreq";
r = await turn();
A.check("其他400錯誤照原樣轉發，不被當成餘額不足", r.status === 400 && r.json.error.type === "invalid_request_error", r);
A.check("其他400錯誤不寄餘額用完的信", mails().length === 1);
mode = "ok";
r = await turn();
A.check("儲值後恢復：回合又是200", r.status === 200, r.status);
process.exit(A.report() ? 0 : 1);
