// 2026-10-10：一、1.2.9.18 AI回合自動重新產生降頻——三類分類(第1類重寫、第2類程式直接修、第3類只記錄)、
// 場景日期與品質合併成一次重寫、重寫後仍讀不了就退回回合、約定兩條件判定、本回合必辦清單、等待畫面小字、
// 用量明細三欄(重寫原因、上回合紀錄、結束原因)、數據網頁重寫比例、上游403不重寫(全程假上游，不打真實API)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as H from "./harness.mjs";
import { TURN_SYSTEM_PROMPT, TURN_RESULT_TOOL, SHARED_WRITING_RULES } from "../worker/prompt.js";
const A = H.makeAsserter("自動重新產生降頻(1.2.9.18)");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 夠長的正文(回應段≥100字、新場景≥130字)，回應段寫到玩家的動作「去上學」
const ACT = ["你背起書包去上學，走到巷口時公車剛好進站。", "車上很擠，你抓著吊環，看窗外的店一間一間拉開鐵門，早餐店的蒸氣從門口冒出來，一路飄到馬路上。", "到學校時早自習還沒開始，教室裡只有幾個人在補作業，你把書包掛在椅背上，拿出昨天沒寫完的數學講義，一題一題慢慢對答案。", "鐘聲響起時，班長從走廊跑進來，手上抱著一疊剛印好的考卷，油墨的味道還沒散。"];
const NAR = ["隔天早上下了一場小雨，操場邊的積水映著灰色的天空，升旗典禮改到穿堂舉行。", "你站在隊伍的最後面，聽主任在台上講話，旁邊的同學偷偷傳了一張紙條過來，上面畫著一隻歪歪扭扭的貓。", "雨停的時候，走廊的地板還是濕的，福利社門口排了長長的隊伍，大家都在等剛出爐的麵包。", "你排到的時候只剩兩個紅豆麵包，老闆娘多塞了一包餅乾給你，說是快過期了不要錢。"];
const CHOICES = ["去上學", "繞去福利社買麵包", "留在教室把講義寫完", "傳訊息問同學作業"];
const cjk = (s) => (String(s).match(/[一-鿿]/g) || []).length;
const scene = (n) => { const base = NAR.join(""); let out = ""; for (const ch of base) { if (cjk(out) >= n) break; out += ch; } return out.replace(/[，、]$/, "") + "。"; };

let script = [];                 // 每次上游呼叫依序取一個覆寫；用完就用預設(合格)
let force403 = false;
let onCall = null;               // 每次上游呼叫時呼叫(看等待畫面、payload)
const bodies = [];
const fake = H.makeFakeAnthropic({ turnOverride: (p, b) => {
  bodies.push({ p, b });
  if (onCall) onCall(p, b);
  const o = script.length ? script.shift() : {};
  return Object.assign({ action_result: ACT, narrative: NAR, choices: CHOICES, scene_day_offset: Math.min(1, ((p.time_context && p.time_context.round_days) || 1) - 1) }, typeof o === "function" ? o(p) : o);
} });
H.installUpstream(async (url, init) => {
  if (force403) { fake.calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ type: "error", error: { type: "forbidden", message: "Request not allowed" } }), { status: 403 }); }
  return fake(url, init);
});
const env = await H.makeAccountEnv({ CLOUD_SAVE_ENABLED: "true", __cf: { colo: "HKG" } });
const KEY = "regen00001";
const g = await H.loadGame({ useMock: false, env, key: KEY, integrity: true });
await H.startNewLife(g);
const ev = g.ev;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
{ const k = `ap:${H.loc(KEY)}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const serverAP = async () => (await H.callWorker(env, { method: "GET", path: `/ap?key=${KEY}&slot=0` })).json.ap.total;
const lastText = () => ev("state.log[state.log.length-1].text");
const flagsSince = (n) => js(`(state.reviewFlags||[]).slice(${n}).map(f=>f.kind)`);
const rows = () => [...env.USAGE_COUNTER._store.keys()].filter(k => k.startsWith("ud:")).sort().map(k => env.USAGE_COUNTER._store.get(k));
const turn = async (text = "去上學") => {
  const c0 = fake.calls.length, f0 = ev("(state.reviewFlags||[]).length"), t0 = ev("state.turnCount");
  await H.playTurn(g, text);
  return { calls: fake.calls.length - c0, flags: flagsSince(f0), advanced: ev("state.turnCount") > t0 };
};
const notes = () => ev("state.lastTurnNotes") || "";
await turn(); // 先走一個正常回合，讓日期與上一回合場景就位

// ---------- 正常回合 ----------
let r = await turn();
A.check("正常回合：只呼叫1次、不重寫、不記錄", r.calls === 1 && !r.flags.includes("output_quality_retry") && notes() === "", { r, notes: notes() });

// ---------- 第2類：冒號 ----------
script = [{ narrative: [...NAR, "他回頭說：", "「明天見。」"] }];
r = await turn();
A.check("冒號＋下一段是台詞：不動、不重寫、不記錄", r.calls === 1 && /說：\n\n「明天見。」/.test(lastText()) && !/冒號/.test(notes()), { r, notes: notes() });
script = [{ narrative: [NAR[0], "他回頭說：", NAR[1], NAR[2], "她留下一句："] }];
r = await turn();
A.check("冒號＋下一段不是台詞、冒號段是最後一段：改句號、不重寫、記「冒號」", r.calls === 1 && /他回頭說。/.test(lastText()) && /她留下一句。$/.test(lastText()) && /冒號/.test(notes()), { r, notes: notes() });

// ---------- 第2類：標點、引號、舞台指示、大括號 ----------
script = [{ action_result: [...ACT, "他看著你，", "她回頭喊你：「欸等一下"], narrative: [...NAR, "風把窗簾吹起來", "她說：「（憋笑）好啦，你請客喔。」", "他說：「（點頭）」", "{{雅涵|（笑）走了啦。}}"] }];
r = await turn();
const t3 = lastText();
A.check("逗號結尾→改句號；沒有收尾符號→補句號", /他看著你。/.test(t3) && /風把窗簾吹起來。/.test(t3), t3);
A.check("引號沒關→該段補」(先補句號)", /她回頭喊你：「欸等一下。」/.test(t3), t3);
A.check("舞台指示：「（憋笑）好啦…」→「好啦…」；整句只有括號→引號一起刪；{{名字|（笑）台詞}}也處理", /「好啦，你請客喔。」/.test(t3) && !/憋笑/.test(t3) && !/點頭/.test(t3) && !/（笑）/.test(t3) && /走了啦/.test(t3), t3);
A.check("以上都不重寫，都有紀錄(標點、補引號、舞台指示)", r.calls === 1 && ["標點", "補引號", "舞台指示"].every(c => notes().includes(c)) && r.flags.includes("output_quality_fixed"), { r, notes: notes() });
script = [{ narrative: [...NAR, "她說：「好。」}}"] }];
r = await turn();
A.check("落單的大括號：顯示時清掉、不重寫、記「大括號」", r.calls === 1 && !/\}\}/.test(lastText()) && notes().includes("大括號"), { r, notes: notes(), t: lastText() });

// ---------- 上回合紀錄：下一回合的請求帶給Worker，只記在第一筆 ----------
const prevNotes = notes();
r = await turn();
const lastRow = rows().filter(x => x.k === "turn").pop();
A.check("上回合紀錄：下一回合第一次呼叫帶給Worker，記進逐筆明細pn", lastRow && lastRow.pn === prevNotes, { lastRow, prevNotes });

// ---------- 字數：39字重寫、41字只記錄 ----------
script = [{ narrative: scene(39) }];
r = await turn();
A.check("新場景39字→第1類「過短」，重寫1次", r.calls === 2 && r.flags.includes("output_quality_retry"), r);
const regenRow = rows().filter(x => x.k === "retry").pop();
A.check("重寫那一筆記了重寫原因「過短」，結束原因tool_use", regenRow && regenRow.rr === "過短" && regenRow.end === "tool_use", regenRow);
script = [{ narrative: scene(41) }];
r = await turn();
A.check("新場景41字(低於130字)→不重寫、記「偏短」", r.calls === 1 && notes().includes("偏短"), { r, notes: notes() });

// ---------- 選項3個、第3類其他各項 ----------
script = [{ choices: CHOICES.slice(0, 3) }];
r = await turn();
A.check("選項3個→不重寫、記「選項3個」", r.calls === 1 && notes().includes("選項3個"), { r, notes: notes() });
script = [{ action_result: ["你在圖書館翻著厚厚的參考書，窗外的天色漸漸暗下來，管理員開始收拾推車，一排一排把書推回架上，你把筆記本闔起來，又打開，抄了兩行又停下來。", "旁邊的人在小聲講電話，你聽見他說好感度那種東西根本算不出來，說完自己笑了一聲。", "這個「沉默」用在這裡好像太誇張了。"],
  narrative: [...NAR, "段考剩兩禮拜，大家都開始緊張。"] }];
r = await turn("傳訊息約小美放學後打球");
A.check("第3類(沒寫動作、系統用語、評論用字、倒數)：不重寫、只記錄", r.calls === 1 && ["沒寫動作", "系統用語", "評論用字", "倒數"].every(c => notes().includes(c)), { r, notes: notes() });

// ---------- 合併：日期違規＋過短→只重寫1次，修改單兩種都列；重寫後日期仍違規→拉回、不再呼叫 ----------
let note2 = null;
script = [{ scene_day_offset: 99, narrative: scene(20) }, (p) => { note2 = p.time_context && p.time_context.retry_note; return { scene_day_offset: 99 }; }];
r = await turn();
A.check("同一回合日期違規＋過短：只重寫1次", r.calls === 2, r);
A.check("修改單同時列出日期與字數問題", /scene_day_offset/.test(note2 || "") && /太短/.test(note2 || ""), note2);
A.check("重寫後日期仍違規：拉回範圍、不再呼叫、記「日期拉回」", r.advanced && notes().includes("日期拉回") && r.flags.includes("scene_date_unresolved"), { r, notes: notes() });

// ---------- 連線失敗重試另計 ----------
{
  let failOnce = true;
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (failOnce && String(url).startsWith("https://api.anthropic.com/")) { failOnce = false; fake.calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ error: { message: "x" } }), { status: 529 }); } return prevFetch(url, init); };
  ev("AI_RETRY_DELAY_MS = 0");
  script = [{ narrative: scene(20) }];
  r = await turn();
  globalThis.fetch = prevFetch;
  A.check("連線失敗重試不算在重寫次數裡：失敗1次＋第一版＋重寫1次＝3次呼叫", r.calls === 3 && r.advanced, r);
}

// ---------- 重寫後仍不合格 ----------
{
  const ap0 = await serverAP(), t0 = ev("state.turnCount"), log0 = ev("state.log.length");
  script = [{ narrative: [] , action_result: [] }, { narrative: [], action_result: [] }];
  r = await turn();
  A.check("兩版都讀不了(空白)：回合退回、回合數不變", r.calls === 2 && ev("state.turnCount") === t0, { r, t: ev("state.turnCount"), t0 });
  A.check("讀不了：行動點退還(伺服器端餘額不變)", (await serverAP()) === ap0, { ap0, now: await serverAP() });
  A.check("讀不了：畫面留一則請玩家再試一次的紀錄", ev("state.log.length") >= log0 && !!ev("state.log[state.log.length-1].error"), ev("JSON.stringify(state.log[state.log.length-1])"));
  // 退回後正常再玩一回合
  r = await turn();
  A.check("退回後再按一次可以正常進行", r.advanced, r);
  const t1 = ev("state.turnCount");
  script = [{ action_result: ["你去上學。"], narrative: scene(20) }, { action_result: ["你去上學，一路上都在下雨，鞋子濕了一半。"], narrative: [...NAR, "（重寫版）"] }];
  r = await turn();
  A.check("其他第1類問題：給問題比較少的那版(重寫版只剩回應段過短)", r.calls === 2 && /重寫版/.test(lastText()) && ev("state.turnCount") === t1 + 1 && r.flags.includes("output_quality_unresolved"), { r, t: lastText() });
  script = [{ narrative: scene(20) + "（第一版）" }, { narrative: scene(20) + "（重寫版）" }];
  r = await turn();
  A.check("一樣多時給重寫版", /重寫版/.test(lastText()) && !/第一版/.test(lastText()), lastText());
  script = [{ narrative: scene(20) + "（第一版）" }, { narrative: [], action_result: [] }];
  r = await turn();
  A.check("【技術判斷】第一版能讀、重寫版讀不了：用第一版，不退回", r.advanced && /第一版/.test(lastText()), lastText());
}

// ---------- 約定(1.2.9.18.4) ----------
{
  const setPromise = (id, who = "雅涵") => ev(`(()=>{ const win = { end: state.timeState.cal.lastSceneDay + 30 }; state.promises = (state.promises||[]).filter(p=>p.id!=='${id}'); state.promises.push({ id:'${id}', character:'${who}', content:'一起去看展', dueAbs: state.timeState.cal.lastSceneDay, createdTurn: state.turnCount, status:'open', misses:0 }); })()`);
  setPromise("p1");
  let mustDo = null, lastKey = null, inCache = false;
  onCall = (p, b) => {
    mustDo = p.turn_must_do || null;
    const blocks = b.messages[0].content;
    if (Array.isArray(blocks)) { const lastB = JSON.parse(blocks[blocks.length - 1].text); const ks = Object.keys(lastB); lastKey = ks[ks.length - 1]; inCache = blocks.slice(0, -1).some(x => /turn_must_do/.test(x.text)); }
    else { const ks = Object.keys(JSON.parse(blocks)); lastKey = ks[ks.length - 1]; }
  };
  script = [{ narrative: [...NAR, "雅涵傳訊息說看展改天再說，你回了一個好。"] }];
  r = await turn();
  A.check("必辦清單：有到期約定時出現在payload最後、不在快取區塊", Array.isArray(mustDo) && mustDo.some(x => /雅涵/.test(x) && /p1/.test(x)) && lastKey === "turn_must_do" && !inCache, { mustDo, lastKey, inCache });
  A.check("約定沒填欄位，但正文有名字＋「改天」：不重寫、程式代填延期、記「約定代填」", r.calls === 1 && ev("state.promises.find(p=>p.id==='p1').status") === "open" && ev("state.promises.find(p=>p.id==='p1').dueAbs") > ev("state.timeState.cal.lastSceneDay") - 1 && notes().includes("約定代填"), { r, notes: notes(), p: js("state.promises.find(p=>p.id==='p1')") });
  ev("state.promises = state.promises.filter(p=>p.id!=='p1')");
  setPromise("p2", "阿哲");
  r = await turn();
  A.check("約定兩個條件都沒有：重寫1次，記「約定」，約定記上已觸發", r.calls === 2 && ev("state.promises.find(p=>p.id==='p2').regenTried") === true && rows().filter(x => x.k === "retry").pop().rr === "約定", { r, p: js("state.promises.find(p=>p.id==='p2')") });
  const aff0 = ev("(state.characters.find(c=>c.name==='阿哲')||{}).affinity");
  const misses0 = ev("(state.promises.find(p=>p.id==='p2')||{}).misses");
  r = await turn();
  A.check("同一約定下一回合再沒交代：不再重寫，照PROMISE_MISS_LIMIT計數", r.calls === 1 && ev("(state.promises.find(p=>p.id==='p2')||{}).misses||0") >= (misses0 || 0), { r, p: js("state.promises.find(p=>p.id==='p2')") });
  A.check("不扣好感", ev("(state.characters.find(c=>c.name==='阿哲')||{}).affinity") === aff0);
  ev("state.promises = []");
  onCall = (p) => { mustDo = p.turn_must_do || null; };
  r = await turn();
  A.check("沒有必辦事項時不送清單", mustDo === null, mustDo);
}

// ---------- 花費、興趣沒寫到(第1類) ----------
{
  const c = js(`classifyTurnOutput({ action_result:${JSON.stringify(ACT.join("\n\n"))}, narrative:${JSON.stringify(NAR.join("\n\n"))} }, Object.assign({}, state, { studentExpense:{ resultNow:{ event:"演唱會", bought:true } } }), { timeCtx:{ interestSeed:{ item:"陶藝" } } }).c1.map(i=>i.code)`);
  A.check("花費沒寫到→第1類「花費」", c.includes("花費"), c);
  const c2 = js(`classifyTurnOutput({ action_result:${JSON.stringify(ACT.join("\n\n"))}, narrative:${JSON.stringify(NAR.join("\n\n"))}, interest_event:{ reaction:"curious" } }, state, { timeCtx:{ interestSeed:{ item:"陶藝" } } }).c1.map(i=>i.code)`);
  A.check("指定的興趣項目沒寫到→第1類「興趣」", c2.includes("興趣"), c2);
  const md = js(`buildMustDoList(Object.assign({}, state, { studentExpense:{ resultNow:{ event:"演唱會", bought:true } }, promises:[] }), { window:{ end: 1e9 }, interestSeed:{ item:"陶藝" } }, false)`);
  A.check("必辦清單：花費、興趣項目各一行白話短句", md.length === 2 && /演唱會/.test(md[0]) && /陶藝/.test(md[1]), md);
}

// ---------- 等待畫面 ----------
{
  let hintNormal = null, hintRegen = null, n = 0;
  onCall = () => { n += 1; const has = !!g.win.document.querySelector(".loading-regen-hint"); if (n === 1) hintNormal = has; else hintRegen = has; };
  script = [{ narrative: scene(20) }];
  await turn();
  onCall = null;
  A.check("重寫期間等待畫面出現「正在把這段寫得更完整……」，第一次呼叫(正常)時沒有", hintNormal === false && hintRegen === true, { hintNormal, hintRegen });
  A.check("回合結束後小字消失", !g.win.document.querySelector(".loading-regen-hint"));
}

// ---------- 上游403 ----------
{
  const ap0 = await serverAP(), t0 = ev("state.turnCount");
  force403 = true;
  r = await turn();
  force403 = false;
  A.check("上游403：不自動重打(只呼叫1次)、回合退回", r.calls === 1 && ev("state.turnCount") === t0, r);
  A.check("上游403：行動點退還", (await serverAP()) === ap0);
  const row403 = rows().pop();
  A.check("上游403：逐筆明細記一筆、結束原因「403@機房代碼」", row403 && row403.end === "403@HKG" && row403.usd === 0, row403);
}

// ---------- 用量明細CSV與數據網頁 ----------
{
  const csv = await H.callWorker(env, { method: "GET", path: "/usage-detail.csv", origin: null, headers: { Authorization: "Bearer admin-secret" } });
  const lines = csv.text.replace(/^﻿/, "").trim().split("\n");
  const head = lines[0].split(",");
  A.check("CSV多三欄：regen_reason、prev_turn_notes、end_reason", head.slice(-3).join(",") === "regen_reason,prev_turn_notes,end_reason", lines[0]);
  A.check("CSV有重寫原因與403結束原因的列", lines.some(l => l.split(",")[11] === "過短") && lines.some(l => l.split(",")[13] === "403@HKG"));
  A.check("CSV新欄位只有代碼，不含正文", !lines.some(l => /雅涵傳訊息|福利社/.test(l)));
  const sum = await H.callWorker(env, { method: "GET", path: "/stats-summary", origin: null, headers: { Authorization: "Bearer admin-secret" } });
  const q = sum.json && sum.json.ai_usage && sum.json.ai_usage.regen_today;
  A.check("數據網頁資料：今天重寫比例、重寫原因前5名、上回合紀錄前5名", q && q.regens > 0 && q.turn_calls > 0 && typeof q.pct === "number" && q.reasons.length > 0 && q.reasons.length <= 5 && q.notes.length > 0 && q.notes.length <= 5, q);
  const dash = fs.readFileSync(path.join(ROOT, "worker/dashboard.js"), "utf8");
  A.check("數據網頁有「今天的自動重寫」小表", /今天的自動重寫/.test(dash) && /重寫原因前 5 名/.test(dash) && /上回合紀錄前 5 名/.test(dash));
}

// ---------- Worker：同一回合只扣一次點 ----------
{
  const ap0 = await serverAP();
  script = [{ narrative: scene(20) }];
  r = await turn();
  A.check("重寫的回合伺服器端只扣1點", r.calls === 2 && (await serverAP()) === ap0 - 1, { r, ap0, now: await serverAP() });
}

// ---------- 撰稿人規則與舊字眼 ----------
A.check("撰稿人規則：選項統一4個、有交稿前檢查7條、必辦清單說明", /choices：給4個/.test(TURN_SYSTEM_PROMPT) && /交稿前檢查/.test(TURN_SYSTEM_PROMPT) && /7\. 回應段、新場景都要寫到字數下限；選項給4個/.test(TURN_SYSTEM_PROMPT) && /payload最後的本回合必辦清單（turn_must_do），每一項都要寫進正文；約定要用promise_results回報/.test(TURN_SYSTEM_PROMPT));
A.check("工具定義：回應段、新場景必填；choices說明是4個", TURN_RESULT_TOOL.input_schema.required.includes("action_result") && TURN_RESULT_TOOL.input_schema.required.includes("narrative") && /^4個/.test(TURN_RESULT_TOOL.input_schema.properties.choices.description));
A.check("章節共用的寫作規則不帶交稿前檢查", !/交稿前檢查/.test(SHARED_WRITING_RULES) && /親密場景/.test(SHARED_WRITING_RULES));
{
  const files = ["index.html", "worker/prompt.js", "CLAUDE.md"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8"));
  A.check("程式與CLAUDE.md已沒有「3到4個」選項、品質重新產生「最多2次」的說法", !files.some(t => /3到4個/.test(t)) && !files.some(t => /重新產生最多2次|重新產生(?:，|,)?最多 ?2 ?次/.test(t)));
}

// ---------- 回放：真實AI紀錄的重寫比例(不花錢) ----------
{
  const { replay } = await import("./replay-regen.mjs");
  const out = await replay({ quiet: true });
  if (out.total === 0) A.check("回放：找不到真實紀錄(比對紀錄_模型比較/_work/records/)，略過", true);
  else A.check(`回放：${out.total}筆真實AI回合，需要重寫${out.regen}筆(${out.pct}%)，目標≤5%`, out.pct <= 5, out);
}

process.exit(A.report() ? 0 : 1);
