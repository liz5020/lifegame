// 2026-09-29：一、1.2.9.17 AI回傳資料精簡(沒變化的欄位不輸出)＋十、10.3.12 測試用「不扣行動點」開關（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("回傳資料精簡＋不扣行動點開關");
const js = (g, x) => JSON.parse(g.ev(`JSON.stringify(${x})`));
const apRec = async (env, key) => JSON.parse(await env.SAVES.get(`ap:${H.loc(key)}:0`));
const apSum = (r) => r.daily + r.gift + r.purchased;

// ---------- 一、資料精簡：假上游只回必填欄位(真實路徑：callAI→Worker→假上游) ----------
const REQUIRED = ["action_result", "narrative", "scene_day_offset", "scene_summary", "location", "chapter_subtitle", "turn_summary", "emotional_tone", "choices"];
let variant = "minimal";
H.installUpstream(H.makeFakeAnthropic({
  turnOverride: (p) => {
    const days = (p.time_context && p.time_context.round_days) || 1;
    const base = {
      action_result: p.time_context && p.time_context.is_prologue ? undefined : ["你照著剛剛的決定做了。", "她點點頭。"],
      narrative: ["隔天早上，你醒得比鬧鐘早。", "桌上的課本還攤著。"],
      scene_day_offset: Math.min(1, days - 1), scene_summary: "早上，在房間", chapter_subtitle: "普通的一天",
      turn_summary: "過了平凡的一天。", emotional_tone: "warm", choices: ["去上學", "在家讀書", "出門走走"]
    };
    if (variant === "partial") Object.assign(base, { stat_deltas: { health: -2 }, attachment_shift: { anxiety: 1 }, conscientiousness_shift: {}, new_characters: null, plot_touched: null, character_updates: undefined });
    if (variant === "nulls") Object.assign(base, { stat_deltas: null, attachment_shift: null, conscientiousness_shift: null, expense_change: null, one_time_transaction: null, milestone_updates: null, plot_new: null, plot_reactions: null });
    // makeFakeAnthropic先放完整欄位再Object.assign覆寫：把非必填欄位設成undefined，JSON序列化時就會真的消失
    const out = {};
    ["tone_switch", "response_rating", "scene_category", "focus_character", "plot_new", "plot_touched", "plot_reactions", "plot_resolved", "plot_reopened",
      "age_advance", "stat_deltas", "event_type", "event_id", "expense_change", "one_time_transaction", "housing_choice", "attachment_shift",
      "peer_position_shift", "conscientiousness_shift", "interest_event", "revealed_key_event", "college_location_choice", "fertility_stage_update",
      "milestone_updates", "new_characters", "character_updates", "major_event_summary", "major_event_type", "is_ending", "life_summary", "succession_available"
    ].forEach(k => { out[k] = undefined; });
    return Object.assign(out, base);
  }
}));
const TEST_KEY = "apfree0001";
// 10.8.2：AP_TEST_KEYS名單存門牌
const env = H.makeEnv({ AP_TEST_KEYS: H.loc("someoneelse") + ", " + H.loc(TEST_KEY) });
{
  const g = await H.loadGame({ useMock: false, env, key: "slim000001" });
  await H.startNewLife(g);
  A.check("精簡：開場回合(沒有action_result)正常進入遊戲", g.ev("state.phase") === "playing" && g.ev("state.log.length") >= 1, g.ev("state.phase"));
  const statsBefore = js(g, "state.stats");
  const turnsBefore = g.ev("state.turnCount");
  for (let i = 0; i < 4; i++) await H.playTurn(g);
  variant = "partial";
  g.ev("state.focus='study'; state.stats.health=60"); // 讀書重心不加健康，才看得出AI只回報health:-2有沒有套用
  const healthBefore = g.ev("state.stats.health");
  await H.playTurn(g);
  const healthAfterPartial = g.ev("state.stats.health");
  variant = "nulls";
  for (let i = 0; i < 2; i++) await H.playTurn(g);
  variant = "minimal";
  const log = js(g, "state.log");
  const errs = log.filter(e => e.error);
  A.check("精簡：7回合都成功(沒有旁白恍神的錯誤回合)", errs.length === 0 && g.ev("state.turnCount") === turnsBefore + 7, { errs: errs.length, turns: g.ev("state.turnCount") - turnsBefore });
  A.check("精簡：沒有jsdom執行錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
  A.check("精簡：遊戲仍在進行、選項有顯示", g.ev("state.phase") === "playing" && g.ev("state.choices.length") === 3);
  const st = js(g, "state.stats");
  A.check("精簡：數值沒有變成NaN/undefined", Object.values(st).every(v => typeof v === "number" && isFinite(v)), st);
  A.check("精簡：依附兩軸與光譜仍是數字", ["anxiety", "avoidance"].every(k => isFinite(g.ev("state." + k))) && Object.values(js(g, "state.conscientiousness")).every(v => isFinite(v)));
  A.check("精簡：只輸出部分數值(health:-2)時照樣套用", healthAfterPartial < healthBefore, { healthBefore, after: healthAfterPartial });
  g.ev("render()");
  A.check("精簡：畫面正常render(最新一回合卡片)", !!g.win.document.getElementById("latest-entry"));
  // 補空值函式本身
  const filled = js(g, "fillOmittedTurnFields({narrative:'x', stat_deltas:{health:3}, new_characters:null, plot_new:'壞掉'})");
  A.check("精簡：fillOmittedTurnFields補齊空值", filled.stat_deltas.health === 3 && filled.stat_deltas.network === 0 && Array.isArray(filled.new_characters) && Array.isArray(filled.plot_new) && filled.plot_new.length === 0
    && filled.age_advance === 0 && filled.is_ending === false && filled.attachment_shift.anxiety === 0 && filled.conscientiousness_shift.teamSolo === 0 && filled.interest_event === null, filled);
}
{ // Worker的tool定義
  const { TURN_RESULT_TOOL } = await import("../worker/prompt.js");
  const req = TURN_RESULT_TOOL.input_schema.required;
  A.check("精簡：schema required只剩每回合一定有內容的欄位", req.length === 9 && req.includes("action_result") && !req.includes("stat_deltas") && !req.includes("is_ending") && !req.includes("age_advance") && req.every(k => REQUIRED.includes(k)), req);
  const p = TURN_RESULT_TOOL.input_schema.properties;
  A.check("精簡：數值物件不再要求每一項", !p.stat_deltas.required && !p.attachment_shift.required && !p.conscientiousness_shift.required);
}
{ // mock路徑：mock旁白輸出拿掉所有非必填欄位，照樣能玩
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "slim000002" });
  g.ev(`const __orig = mockGenerateTurn; mockGenerateTurn = function(a,f,t){ const r = __orig(a,f,t); const keep = ${JSON.stringify(REQUIRED)}; Object.keys(r).forEach(k=>{ if(!keep.includes(k)) delete r[k]; }); return r; }; MOCK_AI_DELAY_MS = 0;`);
  await H.startNewLife(g);
  await new Promise(r => setTimeout(r, 20));
  for (let i = 0; i < 6; i++) { await H.playTurn(g); }
  const log = js(g, "state.log");
  A.check("精簡(mock)：6回合都成功、沒有錯誤回合", log.filter(e => e.error).length === 0 && g.ev("state.turnCount") >= 6, { errs: log.filter(e => e.error).length, turns: g.ev("state.turnCount") });
  A.check("精簡(mock)：沒有jsdom執行錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
}

// ---------- 二、不扣行動點開關 ----------
variant = "minimal";
{ // 登記過的測試鑰匙：開關有效
  const g = await H.loadGame({ useMock: false, env, key: TEST_KEY, dev: true });
  await H.startNewLife(g);
  g.ev("render()");
  const menuHtml = g.ev("renderTestMenuBody(state)");
  A.check("開關：測試選單有「測試：不扣行動點」", menuHtml.includes("測試：不扣行動點"));
  g.ev("setApTestFree(true)");
  const rec0 = await apRec(env, TEST_KEY);
  const local0 = g.ev("totalAP(state)");
  const turns0 = g.ev("state.turnCount");
  for (let i = 0; i < 3; i++) await H.playTurn(g);
  const rec1 = await apRec(env, TEST_KEY);
  A.check("開關(測試鑰匙)：伺服器端行動點沒被扣", apSum(rec1) === apSum(rec0), { before: apSum(rec0), after: apSum(rec1) });
  A.check("開關(測試鑰匙)：本機行動點沒被扣", g.ev("totalAP(state)") === local0, { local0, now: g.ev("totalAP(state)") });
  A.check("開關(測試鑰匙)：回合數照常累計", g.ev("state.turnCount") === turns0 + 3);
  A.check("開關(測試鑰匙)：伺服器端沒有記下這幾回合的nonce(不寫入正式紀錄)", rec1.lastNonce === rec0.lastNonce, { before: rec0.lastNonce, after: rec1.lastNonce });
  g.ev("render()");
  const apText = g.win.document.getElementById("ap-total").textContent;
  A.check("開關(測試鑰匙)：頂部顯示「∞ 測試中」", apText.includes("∞ 測試中"), apText);
  // 行動點歸零時也照玩
  await env.SAVES.put(`ap:${H.loc(TEST_KEY)}:0`, JSON.stringify(Object.assign(rec1, { daily: 0, gift: 0, purchased: 0 })));
  g.ev("state.ap.daily=0; state.ap.gift=0; state.ap.purchased=0; render()");
  A.check("開關(測試鑰匙)：點數0時選項不停用", !g.win.document.querySelector("#story-choices button[disabled]"));
  await H.playTurn(g);
  A.check("開關(測試鑰匙)：點數0時照樣能玩一回合", g.ev("state.turnCount") === turns0 + 4 && !js(g, "state.log[state.log.length-1]").error);
  // 關掉之後照常扣
  g.ev("setApTestFree(false)");
  await env.SAVES.put(`ap:${H.loc(TEST_KEY)}:0`, JSON.stringify(Object.assign(await apRec(env, TEST_KEY), { daily: 5 })));
  g.ev("state.ap.daily=5");
  await H.playTurn(g);
  A.check("開關關閉後：照常扣1點", apSum(await apRec(env, TEST_KEY)) === 4, apSum(await apRec(env, TEST_KEY)));
}
{ // 沒登記的金鑰：開了也無效
  const KEY2 = "apfree0002";
  const g = await H.loadGame({ useMock: false, env, key: KEY2, dev: true });
  await H.startNewLife(g);
  g.ev("setApTestFree(true)");
  const rec0 = await apRec(env, KEY2);
  await H.playTurn(g);
  const rec1 = await apRec(env, KEY2);
  A.check("開關(非測試鑰匙)：伺服器端照常扣1點", apSum(rec1) === apSum(rec0) - 1, { before: apSum(rec0), after: apSum(rec1) });
  A.check("開關(非測試鑰匙)：本機餘額跟伺服器一致", g.ev("totalAP(state)") === apSum(rec1));
  g.ev("render()");
  const apText = g.win.document.getElementById("ap-total").textContent;
  A.check("開關(非測試鑰匙)：頂部改回顯示數字", !apText.includes("∞") && apText.includes(String(apSum(rec1))), apText);
  A.check("開關(非測試鑰匙)：測試選單提示開關無效", g.ev("renderTestMenuBody(state)").includes("開關無效"));
}
{ // 直接打Worker(繞過畫面)：沒登記的金鑰送ap_test_free也照扣；沒設AP_TEST_KEYS時連登記的也無效
  const envNo = H.makeEnv();
  const msg = (nonce) => ({ key: TEST_KEY, slot: 0, turn_nonce: nonce, life_id: "life0001", ap_test_free: true,
    messages: [{ role: "user", content: JSON.stringify({ player_name: "a", gender: "女", age: 16, turn: 3, stats: {}, player_action: "嗯", forceEnding: false, time_context: { round_days: 3 } }) }] });
  const r1 = await H.callWorker(envNo, { body: msg("nonce00001") });
  A.check("Worker：沒設AP_TEST_KEYS時ap_test_free無效、照常扣點", r1.status === 200 && r1.json.lifegame.ap_test_free === false && r1.json.lifegame.charged === true, r1.json && r1.json.lifegame);
  const r2 = await H.callWorker(env, { body: Object.assign(msg("nonce00002"), { key: "stranger01" }) });
  A.check("Worker：名單外的金鑰送ap_test_free照常扣點", r2.json.lifegame.ap_test_free === false && r2.json.lifegame.charged === true, r2.json && r2.json.lifegame);
}
{ // 沒開過?dev=1：一般玩家就算自己寫localStorage也開不了
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "apfree0003" });
  g.ev("localStorage.setItem('lifegame_ap_test_free','yes')");
  A.check("一般玩家(沒有?dev=1)：開關不生效", g.ev("apTestFreeOn()") === false && g.ev("apTestFreeActive()") === false);
  A.check("一般玩家：測試選單不出現(沒有🧪)", !g.win.document.getElementById("dev-fab"));
}
process.exit(A.report() ? 0 : 1);
