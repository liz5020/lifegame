// 佇列批次3（2026-09-25）：每回合token用量紀錄（十、10.5）
import * as H from "./harness.mjs";
import { recordUsage, costUSD, PRICE_PER_MTOK_USD } from "../worker/usage.js";
const A = H.makeAsserter("批次3 成本遙測");
let usageFn = () => ({ input_tokens: 3000, cache_creation_input_tokens: 0, cache_read_input_tokens: 20000, output_tokens: 1000 });
let fail = false, bad = false;
const fake = H.makeFakeAnthropic({ usage: (b, n) => usageFn(b, n), fail: () => fail, turnOverride: () => bad ? { choices: [] } : {} });
H.installUpstream(fake);
const env = H.makeEnv({ TEST_NOW_MS: String(Date.parse("2026-09-25T03:00:00Z")) });
const payload = JSON.stringify({ player_name: "x", gender: "男", age: 15, turn: 2, stats: {}, player_action: "讀書", forceEnding: false });
let seq = 0;
const turn = (key, lifeId, nonce) => H.callWorker(env, { body: { key, slot: 0, turn_nonce: nonce || ("u" + (++seq) + "xxxxxx"), life_id: lifeId, messages: [{ role: "user", content: payload }] } });
const near = (a, b) => Math.abs(a - b) < 1e-9;

A.check("單價常數：Sonnet 5 $2/$2.5/$0.2/$10", PRICE_PER_MTOK_USD.input === 2 && PRICE_PER_MTOK_USD.cache_write === 2.5 && PRICE_PER_MTOK_USD.cache_read === 0.2 && PRICE_PER_MTOK_USD.output === 10);
A.check("換算：3000輸入+20000快取讀取+1000輸出＝US$0.02", near(costUSD({ input: 3000, cache_write: 0, cache_read: 20000, output: 1000 }), 0.02));
await H.callWorker(env, { path: "/claim-gift", body: { key: "ua", slot: 0 } });
await H.callWorker(env, { path: "/claim-gift", body: { key: "ub", slot: 0 } });
usageFn = () => ({ input_tokens: 3000, cache_creation_input_tokens: 20000, cache_read_input_tokens: 0, output_tokens: 1000 });
let r = await turn("ua", "lifeaaa1");
A.check("回應附帶本次用量與估計花費(快取寫入回合US$0.066)", r.json.lifegame.usage && near(r.json.lifegame.usage.cost_usd, 0.066), r.json.lifegame);
usageFn = () => ({ input_tokens: 3000, cache_creation_input_tokens: 0, cache_read_input_tokens: 20000, output_tokens: 1000 });
const n = "regenxxxxx1";
await turn("ua", "lifeaaa1", n); await turn("ua", "lifeaaa1", n); // 1回合＋1次重新生成
const life = JSON.parse(await env.SAVES.get("usage:life:ua:0:lifeaaa1"));
A.check("每把金鑰＋slot＋這一世累計：3次呼叫、2個回合(重新生成不算回合)", life.turn.calls === 3 && life.turn.turns === 2, life.turn);
A.check("累計token正確", life.turn.input === 9000 && life.turn.cache_write === 20000 && life.turn.cache_read === 40000 && life.turn.output === 3000, life.turn);
fail = true; await turn("ua", "lifeaaa1"); fail = false;
A.check("Anthropic失敗(沒有usage)：不記錄", JSON.parse(await env.SAVES.get("usage:life:ua:0:lifeaaa1")).turn.calls === 3);
bad = true; await turn("ua", "lifeaaa1"); bad = false;
const life2 = JSON.parse(await env.SAVES.get("usage:life:ua:0:lifeaaa1"));
A.check("AI回傳格式壞掉：有產生費用所以記為呼叫，但不算回合", life2.turn.calls === 4 && life2.turn.turns === 2, life2.turn);
await turn("ub", "lifebbb1"); await turn("ub", "lifebbb1");
const day = JSON.parse(await env.SAVES.get("usage:day:2026-09-25"));
A.check("每日全站合計(台灣日期)：6次呼叫、4個回合", day.turn.calls === 6 && day.turn.turns === 4, day.turn);
A.check("記錄最大請求字數", day.max_payload_chars === payload.length);
// 章節類別另計
await recordUsage(env, { key: "ua", slot: 0, lifeId: "lifeaaa1", category: "chapter", usage: { input_tokens: 4000, output_tokens: 3000 }, countsAsTurn: false, taipeiDate: "2026-09-25" });
const day2 = JSON.parse(await env.SAVES.get("usage:day:2026-09-25"));
A.check("chapter類別跟一般回合分開統計", day2.chapter.calls === 1 && day2.turn.calls === 6 && day2.chapter.output === 3000);
// 昨天、8天前
await recordUsage(env, { key: "uc", slot: 0, lifeId: "lifeccc1", category: "turn", usage: { input_tokens: 1000000 }, countsAsTurn: true, taipeiDate: "2026-09-24" });
await recordUsage(env, { key: "uc", slot: 0, lifeId: "lifeccc1", category: "turn", usage: { input_tokens: 1000000 }, countsAsTurn: true, taipeiDate: "2026-09-17" });
// 遙測失敗不影響回合
const envBroken = H.makeEnv({ TEST_NOW_MS: env.TEST_NOW_MS });
const origPut = envBroken.SAVES.put.bind(envBroken.SAVES);
envBroken.SAVES.put = async (k, v, o) => { if (k.startsWith("usage:")) throw new Error("KV寫入失敗"); return origPut(k, v, o); };
await H.callWorker(envBroken, { path: "/claim-gift", body: { key: "ud", slot: 0 } });
r = await H.callWorker(envBroken, { body: { key: "ud", slot: 0, turn_nonce: "brokenxx1", messages: [{ role: "user", content: payload }] } });
A.check("遙測寫入失敗：回合照常成功並扣點", r.status === 200 && r.json.lifegame.charged === true && r.json.content[0].input.narrative);
// /usage-summary
r = await H.callWorker(env, { method: "GET", path: "/usage-summary", origin: null });
A.check("/usage-summary沒帶密碼：401", r.status === 401);
r = await H.callWorker(env, { method: "GET", path: "/usage-summary?token=wrong", origin: null });
A.check("/usage-summary密碼錯誤：401", r.status === 401);
r = await H.callWorker(H.makeEnv({ USAGE_ADMIN_TOKEN: "" }), { method: "GET", path: "/usage-summary?token=x", origin: null });
A.check("沒設定USAGE_ADMIN_TOKEN：503", r.status === 503);
r = await H.callWorker(env, { method: "GET", path: "/usage-summary", origin: null, headers: { Authorization: "Bearer admin-secret" } });
const S = r.json;
A.check("/usage-summary正確密碼(不需白名單來源)：200", r.status === 200 && S.success, r.status);
// 今日turn：呼叫7(ua 5+ub 2... 其中ua失敗那次不算)→ ua:4 ub:2 ud(另一個env)不算 → 6次, 4回合
const todayTurnCost = 0.066 + 0.02 * 5; // 第一次快取寫入 + 其餘5次
A.check("今日一般回合：6次呼叫、4回合、花費換算正確", S.today.turn.calls === 6 && S.today.turn.turns === 4 && near(S.today.turn.cost_usd, Math.round(todayTurnCost * 1e4) / 1e4), S.today.turn);
A.check("今日平均每回合花費＝總花費÷回合數", near(S.today.turn.avg_cost_per_turn_usd, Math.round(todayTurnCost / 4 * 1e5) / 1e5), S.today.turn.avg_cost_per_turn_usd);
const hit = 100000 / (18000 + 20000 + 100000);
A.check("今日快取命中率＝快取讀取÷全部輸入", near(S.today.turn.cache_hit_rate, Math.round(hit * 1e4) / 1e4), S.today.turn.cache_hit_rate);
A.check("今日chapter另列", S.today.chapter.calls === 1 && near(S.today.chapter.cost_usd, Math.round((4000 * 2 + 3000 * 10) / 1e6 * 1e4) / 1e4));
A.check("近7日包含昨天、不含8天前", S.last_7_days.turn.calls === 7 && S.last_7_days.from === "2026-09-19", { c: S.last_7_days.turn.calls, f: S.last_7_days.from });
// 每條人生：ua(4呼叫/2回合+章節)、ub(2/2)、uc(2/2)
const uaCost = 0.066 + 0.02 * 3 + (4000 * 2 + 3000 * 10) / 1e6, ubCost = 0.04, ucCost = 4;
A.check("平均每條人生花費＝各人生總花費平均(含章節)", S.per_life.lives_counted === 3 && near(S.per_life.avg_cost_per_life_usd, Math.round((uaCost + ubCost + ucCost) / 3 * 1e4) / 1e4), S.per_life);
A.check("平均每條人生回合數", S.per_life.avg_turns_per_life === 2);
A.check("摘要附上單價與查詢日期", S.price.checked_on === "2026-09-25" && S.price.model === "claude-sonnet-5");
// 前端開發者面板
const envF = H.makeEnv();
const g = await H.loadGame({ useMock: false, env: envF, dev: true, key: "devkey01" });
await H.startNewLife(g);
await H.playTurn(g);
const box = g.win.document.getElementById("dev-usage-box");
A.check("開發者面板(?dev=1)顯示上一回合token與估計花費", box && /快取讀取 20000/.test(box.textContent) && /US\$0\.0200/.test(box.textContent), box && box.textContent);
const g2 = await H.loadGame({ useMock: false, env: envF, key: "devkey02" });
await H.startNewLife(g2); await H.playTurn(g2);
A.check("一般玩家(沒有?dev=1)看不到用量面板", !g2.win.document.getElementById("dev-usage-box"));
const gm = await H.loadGame({ useMock: true, env: envF, dev: true, key: "devkey03" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); await H.playTurn(gm);
A.check("mock模式面板註明不產生費用", /模擬模式/.test(gm.win.document.getElementById("dev-usage-box").textContent));
const ok = A.report();
process.exit(ok ? 0 : 1);
