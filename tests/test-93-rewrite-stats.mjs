// 2026-10-10：十、10.14.7.2／10.14.7.3／10.17.12 重寫統計重算、頁面版本、舊分頁新版本提醒
// （重試種類只算自動重寫、連線重試／再試一次／未分類分開記、重寫原因只認代碼、佔重寫的分母、只看最新版、每日／每小時／逐筆CSV、
//  Worker回傳版本號不影響前端既有讀法、新版本提醒的出現時機與條件；全程假上游，不打真實API）
import fs from "fs";
import * as H from "./harness.mjs";
import { rewriteBlock } from "../worker/play-stats.js";
const A = H.makeAsserter("重寫統計與新版本提醒(10.14.7.2／10.14.7.3／10.17.12)");

// ---------- Worker：記重試種類與頁面版本 ----------
const usage = { input_tokens: 3000, cache_creation_input_tokens: 1500, cache_read_input_tokens: 51000, output_tokens: 800 };
const fakeAI = H.makeFakeAnthropic({ usage: () => usage });
H.installUpstream(fakeAI, H.makeFakeResend());
const T0 = Date.parse("2026-10-10T03:00:00Z");
const env = await H.makeAccountEnv({ TEST_NOW_MS: String(T0), CLOUD_SAVE_ENABLED: "false" });
const post = (path, body) => H.callWorker(env, { path, body });
const get = (path) => H.callWorker(env, { method: "GET", path, origin: null, headers: { Authorization: "Bearer admin-secret" } });
const payload = (extra) => JSON.stringify(Object.assign({ player_name: "x", gender: "男", age: 15, turn: 5, stats: {}, player_action: "讀書", forceEnding: false }, extra || {}));
const turn = (lid, nonce, extra, top) => post("/", Object.assign({ life_id: lid, turn_nonce: nonce, messages: [{ role: "user", content: payload(extra) }] }, top || {}));
const rows = () => [...env.USAGE_COUNTER._store.keys()].filter(k => k.startsWith("ud:")).sort().map(k => env.USAGE_COUNTER._store.get(k));
const V = "2026.10.10-i";

const L = "lifexxxxxxxxxxxx1";
await turn(L, "nonce-a-000000001", { turn: 2 }, { app_version: V });                                                     // 一般回合
await turn(L, "nonce-a-000000001", { turn: 2 }, { app_version: V, retry_kind: "重寫", regen_reason: "過短、日期" });         // 自動重寫
await turn(L, "nonce-b-000000002", { turn: 3 }, { app_version: V });
await turn(L, "nonce-b-000000002", { turn: 3 }, { app_version: V, retry_kind: "連線" });                                  // 連線重試
await turn(L, "nonce-c-000000003", { turn: 4 }, { app_version: V });
await turn(L, "nonce-c-000000003", { turn: 4 }, { app_version: V, retry_kind: "再試", retry: true });                     // 再試一次
await turn(L, "nonce-d-000000004", { turn: 5 });                                                                         // 舊分頁：沒帶版本
await turn(L, "nonce-d-000000004", { turn: 5 }, { regen_reason: "買了或付了一半換手機電腦的花費沒有寫進去" });                 // 舊分頁的重寫：沒帶重試種類、整句原因
await turn(L, "nonce-e-000000005", { turn: 6 }, { app_version: V, retry_kind: "亂寫的" });                                 // 不認得的種類→忽略
let r = rows();
A.check("T1 明細記了重試種類(重寫／連線／再試)與頁面版本", r[1].rk === "重寫" && r[3].rk === "連線" && r[5].rk === "再試" && r[0].v === V && r[1].v === V, r);
A.check("T2 沒帶版本的舊分頁：頁面版本欄留空；不認得的重試種類不收", r[6].v === undefined && r[7].v === undefined && r[8].rk === undefined && r[8].v === V, r.slice(6));
A.check("T3 第二次以後沒帶重試種類＝未分類(讀取時判斷)，第一次呼叫不是未分類", r[7].k === "retry" && r[7].rk === undefined && r[6].k === "turn");

const pl = (await get("/stats-play?range=7d")).json;
const w = pl.rewrite.all;
A.check("T4 重寫比例＝自動重寫÷一般回合(1÷5)，連線重試、再試一次、未分類各1次", w.rewrites === 1 && w.turns === 5 && w.rate === 0.2 && w.conn === 1 && w.again === 1 && w.unclassified === 1, w);
A.check("T5 重寫原因只收代碼：過短、日期各1次，佔重寫的分母＝自動重寫總次數(1次)＝100%", w.reasons.filter(x => x.code === "過短" || x.code === "日期").every(x => x.n === 1 && x.share === 1), w.reasons);
A.check("T6 舊分頁留下的整句原因整句當一筆「改版前格式」，不用「、」切開，不算佔比", w.reasons.some(x => x.code === "改版前格式" && x.n === 1 && x.share === null) && !w.reasons.some(x => x.code.length > 8 && x.code !== "改版前格式"), w.reasons);
A.check("T7 只看最新版：不含沒帶版本的舊分頁（未分類0、一般回合4）", pl.rewrite.latest.unclassified === 0 && pl.rewrite.latest.turns === 4 && pl.rewrite.latest.rewrites === 1 && pl.rewrite.latest_version === pl.rewrite.latest_version && !!pl.rewrite.latest_version, pl.rewrite.latest);
A.check("T8 summary.retries 只算自動重寫；時段表有連線重試／再試一次／未分類", pl.summary.retries === 1 && pl.timeline.reduce((t, x) => t + x.conn, 0) === 1 && pl.timeline.reduce((t, x) => t + x.again, 0) === 1 && pl.timeline.reduce((t, x) => t + x.unclassified, 0) === 1, pl.timeline);

// 純函式：前5名佔比的分母＝自動重寫總次數，不是前5名加總
{
  const rs = [];
  for (let i = 0; i < 10; i++) rs.push({ t: 1000 + i, k: "turn" });
  const codes = ["空白", "少一段", "過短", "欄位名稱", "節日", "日期", "花費"];
  codes.forEach((c, i) => rs.push({ t: 2000 + i, k: "retry", rk: "重寫", rr: c }));
  const b = rewriteBlock(rs);
  A.check("T9 前5名的「佔重寫」分母是7次自動重寫（每項1/7），不是前5名加總5", b.reasons.length === 5 && b.reasons.every(x => Math.abs(x.share - 1 / 7) < 0.001), b.reasons);
}

// ---------- 每日／每小時／逐筆CSV ----------
const csv = (await get("/usage-detail.csv")).text.replace(/^﻿/, "").trim().split("\n");
const cols = csv[0].split(",");
A.check("C1 逐筆CSV最後新增 retry_kind、page_version（原本欄位順序不動）", cols.slice(-2).join(",") === "retry_kind,page_version" && cols[11] === "regen_reason" && cols[13] === "end_reason", cols);
A.check("C2 逐筆CSV：重寫列的重試種類＝重寫、頁面版本有值；舊分頁列留空", csv[2].split(",")[14] === "重寫" && csv[2].split(",")[15] === V && csv[7].split(",")[15] === "", csv.slice(1, 3));
const hr = (await get("/hourly.csv")).text.replace(/^﻿/, "").trim().split("\n");
A.check("C3 每小時CSV：最後三欄＝連線重試、再試一次、未分類；「重寫」只算自動重寫", hr[0].endsWith(",連線重試,再試一次,未分類") && hr[1].split(",").slice(-3).join(",") === "1,1,1" && hr[1].split(",")[4] === "1", hr);
const dly = (await get("/daily.csv")).text.replace(/^﻿/, "").trim().split("\n");
const dc = dly[0].split(",");
const dr = dly[dly.length - 1].split(",");
A.check("C4 每日CSV：新增連線重試、再試一次兩欄（接在最後）；新算法起算日起重寫次數只算自動重寫", dc.slice(-2).join(",") === "連線重試,再試一次" && dr[dc.indexOf("重寫次數")] === "1" && dr[dc.indexOf("連線重試")] === "1" && dr[dc.indexOf("再試一次")] === "1" && dr[dc.indexOf("重寫比例")] === String(0.2), { dc, dr });
const daily = (await get("/stats-daily")).json;
A.check("C5 /stats-daily 帶新算法起算日（長期趨勢折線註記用）", daily.rw_since === "2026-10-10", daily.rw_since);

// ---------- 開場、章節、放置摘要、回顧這一生：沒有回合編號，不會被算成未分類 ----------
{
  const before = (await get("/stats-play?range=7d")).json.rewrite.all.unclassified;
  const L2 = "lifeyyyyyyyyyyyy2";
  await turn(L2, "nonce-open-00000009", { turn: 1, time_context: { is_prologue: true } }, { app_version: V });
  await post("/", { kind: "chapter", life_id: L2, chapter_id: "c1", app_version: V, messages: [{ role: "user", content: JSON.stringify({ player_name: "x", stage_label: "高中", chapter_index: 1, age_from: 15, age_to: 18, turn_summaries: [{ s: "讀書" }], major_events: [] }) }] });
  await post("/", { kind: "chapter", life_id: L2, chapter_id: "c2", app_version: V, messages: [{ role: "user", content: JSON.stringify({ player_name: "x", stage_label: "高中", chapter_index: 2, age_from: 15, age_to: 18, turn_summaries: [{ s: "讀書" }], major_events: [] }) }] });
  const rr = rows().filter(x => x.life && x.k !== "turn" || true);
  const chapters = rows().filter(x => x.k === "chapter");
  const after = (await get("/stats-play?range=7d")).json.rewrite.all.unclassified;
  A.check("U1 開場第一次呼叫＝開場；章節沒有回合編號，連續兩章都不會被判成重試或未分類", chapters.length === 2 && chapters.every(x => x.n === null && x.v === V) && rows().filter(x => x.k === "opening").length === 1 && after === before, { chapters, before, after });
  A.check("U2 章節等其他呼叫也記頁面版本", chapters.every(x => x.v === V));
}

// ---------- Worker回傳版本號，且不影響前端既有流程 ----------
const g = await H.loadGame({ useMock: false, env, key: "ver0000001" });
await H.startNewLife(g);
const ev = g.ev;
{
  const p = (await get("/version")).json;
  A.check("V1 前端的 APP_VERSION 與 Worker 版本相同（本版沒有新舊差）", p && ev("APP_VERSION") === p.version, { app: ev("APP_VERSION"), w: p });
  A.check("V2 回合結束後前端記下了Worker回報的版本；行動點、錢包的讀法照舊（點數仍是數字）", ev("serverVersionSeen") === ev("APP_VERSION") && Number.isFinite(ev("totalAP(state)")), ev("serverVersionSeen"));
  A.check("V3 版本一樣不提醒", ev("updateNoticeShown()") === false && !g.win.document.getElementById("update-notice"));
}

// ---------- 10.17.12 新版本提醒 ----------
A.check("N1 版本比較：新日期較新、同日字母較後較新、一樣或較舊不算、格式不對不算", ev(`appVersionNewer("2026.10.11-a","2026.10.10-i")`) === true && ev(`appVersionNewer("2026.10.10-j","2026.10.10-i")`) === true && ev(`appVersionNewer("2026.10.10-i","2026.10.10-i")`) === false && ev(`appVersionNewer("2026.10.09-z","2026.10.10-a")`) === false && ev(`appVersionNewer("abc","2026.10.10-a")`) === false && ev(`appVersionNewer("2026.10.10-aa","2026.10.10-z")`) === true);
// 讓Worker回報一個比頁面新的版本（假上游改回應裡的worker_version）
let fakeNewer = true;
{ const f = g.win.fetch; g.win.fetch = async (url, init) => { const res = await f(url, init);
  if (!fakeNewer || !init || !init.body || !String(init.body).includes("turn_nonce")) return res;
  const j = JSON.parse(await res.text()); if (j && j.lifegame) j.lifegame.worker_version = "2099.01.01-a";
  const txt = JSON.stringify(j);
  return { ok: res.ok, status: res.status, statusText: res.statusText, headers: res.headers, text: async () => txt, json: async () => JSON.parse(txt) }; }; }
A.check("N2 AI寫作中不出現：還沒到回合結束檢查點前，提醒不會顯示", ev("updateNoticeShown()") === false);
await H.playTurn(g, "去上學");
const notice = g.win.document.getElementById("update-notice");
A.check("N3 這一回合寫完、套用並存檔後出現：輸入列上方一行小字＋重新整理按鈕＋可關掉的×", !!notice && /遊戲有新版本，重新整理一下就能用到/.test(notice.textContent) && !!g.win.document.getElementById("btn-update-reload") && !!g.win.document.getElementById("btn-update-close"), notice && notice.textContent);
A.check("N4 文字不提AI、伺服器、程式等系統用語", !/AI|伺服器|程式|版本號/.test((notice.textContent || "").replace("遊戲有新版本", "")));
ev("localSaveFailed = true; render()");
A.check("N5 本機存檔失敗的提示正在出現時，不顯示新版本提醒", !g.win.document.getElementById("update-notice"));
ev("localSaveFailed = false; render()");
A.check("N6 存檔恢復後又顯示", !!g.win.document.getElementById("update-notice"));
g.win.document.getElementById("btn-update-close").click();
A.check("N7 按×關掉後不再出現（同一個分頁只出現一次）", !g.win.document.getElementById("update-notice") && ev("updateNoticeDismissed") === true);
await H.playTurn(g, "去上學");
A.check("N8 再玩一回合也不會再出現", !g.win.document.getElementById("update-notice"));

// 示範模式不出現
{
  const gm = await H.loadGame({ useMock: true, key: "ver0000002" });
  await H.startNewLife(gm);
  gm.ev(`noteWorkerVersion("2099.01.01-a")`);
  await H.playTurn(gm, "去上學");
  A.check("N9 示範模式不出現新版本提醒", !gm.win.document.getElementById("update-notice") && gm.ev("updateNoticeShown()") === false);
}

// ---------- 前端程式碼：重試種類與頁面版本都有送 ----------
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
A.check("F1 每種AI呼叫(回合、放置摘要、章節、回顧這一生)都帶app_version", (html.match(/app_version: APP_VERSION/g) || []).length >= 4);
A.check("F2 回合呼叫帶retry_kind，三種標記都有(再試／連線／重寫)", /retry_kind: \(timeCtx && timeCtx\.retryKind\)/.test(html) && html.includes('timeCtx.retryKind = "連線"') && html.includes('timeCtx.retryKind = "重寫"') && html.includes('timeCtx.isRetry ? "再試"'));
process.exit(A.report() ? 0 : 1);
