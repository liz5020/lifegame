// 2026-10-04：十、10.14.7 伺服器端AI實際用量紀錄——每日依呼叫類型加總、逐筆明細(匿名人生代號、7天／5,000筆)、/stats-summary的ai_usage、/usage-detail.csv、數據總覽區塊
// （全程假上游，不打真實API）
import * as H from "./harness.mjs";
import { USAGE_DETAIL_MAX_ROWS } from "../worker/gate.js";
const A = H.makeAsserter("10.14.7 AI實際用量紀錄");
const usage = { input_tokens: 3000, cache_creation_input_tokens: 1500, cache_read_input_tokens: 51000, output_tokens: 800 };
let fail = false;
const fakeAI = H.makeFakeAnthropic({ usage: () => usage, fail: () => fail });
H.installUpstream(fakeAI, H.makeFakeResend());

const T0 = Date.parse("2026-10-04T03:00:00Z"); // 台灣 10/04 11:00
const DAY = 86400000, MIN = 60000;
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false" });
const setNow = ms => { env.TEST_NOW_MS = String(T0 + ms); };
const post = (path, body, headers) => H.callWorker(env, { path, body, headers });
const get = (path, headers) => H.callWorker(env, { method: "GET", path, headers, origin: null });
const ADMIN = { Authorization: "Bearer admin-secret" };
const payload = (extra) => JSON.stringify(Object.assign({ player_name: "x", gender: "男", age: 15, turn: 5, stats: {}, player_action: "讀書", forceEnding: false }, extra || {}));
const turn = (lid, nonce, extra) => post("/", { life_id: lid, turn_nonce: nonce, messages: [{ role: "user", content: payload(extra) }] });
const rows = async () => [...env.USAGE_COUNTER._store.keys()].filter(k => k.startsWith("ud:")).sort().map(k => env.USAGE_COUNTER._store.get(k));
const per = 3000 * 2 + 1500 * 2.5 + 51000 * 0.2 + 800 * 10; // 美元×1e6

// ---- 各種呼叫類型 ----
const L1 = "lifeaaaaaaaaaaaa1", L2 = "lifebbbbbbbbbbbb2";
await turn(L1, "nonce-open-000001", { turn: 1, time_context: { is_prologue: true } });
await turn(L1, "nonce-open-000001", { turn: 1, time_context: { is_prologue: true } }); // 同一個nonce再一次＝重試
setNow(2 * MIN); await turn(L1, "nonce-turn-000002", { turn: 2 });
setNow(9 * MIN); await turn(L1, "nonce-turn-000003", { turn: 3 });
await turn(L2, "nonce-turn-000004", { turn: 130 });
await post("/", { kind: "chapter", life_id: L1, chapter_id: "c1", messages: [{ role: "user", content: JSON.stringify({ player_name: "x", stage_label: "高中", chapter_index: 1, age_from: 15, age_to: 18, turn_summaries: [{ s: "讀書" }], major_events: [] }) }] });
fail = true; await turn(L2, "nonce-turn-000005", { turn: 131 }); fail = false; // 上游失敗沒有用量→不記

let r = await rows();
A.check("每次成功的AI回應記一筆明細，失敗呼叫(沒有用量)不記", r.length === 6, r.length);
const kinds = r.map(x => x.k).join(",");
A.check("類型：開場、同nonce第二次＝失敗重試、一般回合、人生之書章節", kinds === "opening,retry,turn,turn,turn,chapter", kinds);
A.check("四種用量與美元依Anthropic回報記下", r[2].in === 3000 && r[2].cw === 1500 && r[2].cr === 51000 && r[2].out === 800 && Math.abs(r[2].usd - per / 1e6) < 1e-9, r[2]);
A.check("回合數有記；章節沒有回合數", r[0].turn === 1 && r[4].turn === 130 && r[5].turn === null);
A.check("匿名人生代號：8碼、同一段人生相同、不同人生不同、看不出原本的人生代號", /^[0-9a-f]{8}$/.test(r[0].life) && r[0].life === r[2].life && r[0].life !== r[4].life && !JSON.stringify(r).includes("aaaaaaaa"));
A.check("回合nonce也只存雜湊", !JSON.stringify(r).includes("nonce-open"));

// ---- /stats-summary ----
let s = (await get("/stats-summary", ADMIN)).json;
const a = s.ai_usage;
A.check("/stats-summary有ai_usage：今天6次呼叫、依類型分開", a && a.today.calls === 6 && a.today.by_kind.opening === 1 && a.today.by_kind.retry === 1 && a.today.by_kind.turn === 3 && a.today.by_kind.chapter === 1, a && a.today);
A.check("今天的實際美元＝6筆加總；近7天、累計相同；起算日今天", Math.abs(a.today.usd - Math.round(6 * per / 1e6 * 1e4) / 1e4) < 1e-9 && a.last7.usd === a.today.usd && a.total.usd === a.today.usd && a.since === "2026-10-04", a.today.usd);
A.check("快取讀取佔輸入比例", a.today.cache_read_pct === Math.round(51000 / 55500 * 1000) / 10, a.today.cache_read_pct);
A.check("每回合平均＝花費÷回合數(回合數取自既有每日回合計數)", a.today.turns >= 1 && Math.abs(a.today.usd_per_turn - Math.round(a.today.usd / a.today.turns * 1e4) / 1e4) < 1e-9, a.today);
A.check("沒有密碼：/stats-summary與CSV都回401", (await get("/stats-summary")).status === 401 && (await get("/usage-detail.csv")).status === 401 && (await get("/usage-detail.csv", { Authorization: "Bearer nope" })).status === 401);

// ---- CSV ----
let c = await get("/usage-detail.csv", ADMIN);
const lines = c.text.replace(/^﻿/, "").trim().split("\n");
A.check("CSV：表頭＋6筆，依時間排序，台灣時間", lines.length === 7 && lines[0] === "time_taipei,turn,kind,life,gap_min,input_tokens,cache_write_tokens,cache_read_tokens,output_tokens,cost_usd,elapsed_ms" && lines[1].startsWith("2026-10-04 11:00:"), lines.slice(0, 3));
A.check("CSV：類型用中文、距同一段人生上一次呼叫的分鐘數", lines[1].split(",")[2] === "開場" && lines[2].split(",")[2] === "失敗重試／重新生成" && lines[3].split(",")[4] === "2" && lines[4].split(",")[4] === "7" && lines[1].split(",")[4] === "" && lines[5].split(",")[4] === "", lines.slice(1, 6));
{
  const worker = await H.loadWorker();
  const res = await worker.fetch(new Request("https://life-game.smile80275.workers.dev/usage-detail.csv", { headers: ADMIN }), env, { waitUntil: () => {} });
  const bytes = new Uint8Array(await res.arrayBuffer());
  A.check("CSV：以UTF-8 BOM開頭(Excel開中文不亂碼)、附中文下載檔名", bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF && /filename\*=UTF-8''/.test(res.headers.get("Content-Disposition") || "") && decodeURIComponent((res.headers.get("Content-Disposition") || "").split("''")[1]).startsWith("AI用量明細_"), res.headers.get("Content-Disposition"));
}
A.check("也能用網址帶密碼直接下載", (await get("/usage-detail.csv?token=admin-secret")).status === 200);

// ---- 保留：7天 ----
setNow(8 * DAY); await turn(L1, "nonce-turn-000006", { turn: 4 });
r = await rows();
A.check("超過7天的明細被清掉，只剩新的一筆；每日加總永久保留", r.length === 1 && r[0].turn === 4 && (await get("/stats-summary", ADMIN)).json.ai_usage.total.calls === 7, r.length);

// ---- 保留：最多5,000筆(直接對計數器操作，模擬大量呼叫) ----
const stub = env.USAGE_COUNTER.get();
for (let i = 0; i < USAGE_DETAIL_MAX_ROWS + 3; i++) {
  await stub.fetch(`https://usage.internal/detail?date=2026-10-12&now=${T0 + 8 * DAY + (i + 1) * 1000}&kind=turn&in=1&cw=0&cr=0&out=1&usd=0.00001&turn=${i}`, { method: "POST" });
}
r = await rows();
A.check("超過上限時刪最舊的，筆數維持在上限", r.length === USAGE_DETAIL_MAX_ROWS && r[r.length - 1].turn === USAGE_DETAIL_MAX_ROWS + 2 && r[0].turn === 3 && !r.some(x => x.t === T0 + 8 * DAY), [r.length, r[0], r[r.length - 1]]);

// ---- 前端真實路徑也有記(雲端存檔關閉＝目前線上的設定) ----
{
  const env2 = await H.makeAccountEnv({ CLOUD_SAVE_ENABLED: "false" });
  const g = await H.loadGame({ useMock: false, env: env2, cloud: false });
  await H.startNewLife(g);
  await H.playTurn(g);
  const r2 = [...env2.USAGE_COUNTER._store].filter(([k]) => k.startsWith("ud:")).map(([, v]) => v);
  A.check("前端開場＋一回合：伺服器記到開場與一般回合各一筆", r2.map(x => x.k).join(",") === "opening,turn" && r2[1].turn === 2, r2.map(x => [x.k, x.turn]));
  g.win.close();
}

// ---- 數據總覽頁面 ----
const html = (await get("/dashboard")).text;
A.check("數據總覽有「AI 實際用量」區塊與下載按鈕", html.includes("AI 實際用量（Anthropic 回報）") && html.includes('id="dl"') && html.includes("/usage-detail.csv"));
A.report();
process.exit(0);
