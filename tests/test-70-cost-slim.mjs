// 十、10.14（2026-10-04）AI費用控制（目標一）：少變資料移進快取區塊(排在名冊前；人物卡上線後發現後期每回合都變，移回本回合資料)、規則與工具定義去重複、開場不再固定多重生成一次、
// 快取保留時間維持5分鐘版（1小時版試算較貴）、學生版固定規則不拆（少不到5,000 token）。全程假上游，不打真實API
import * as H from "./harness.mjs";
import * as W from "../worker/worker.js";
import { TURN_SYSTEM_PROMPT, TURN_RESULT_TOOL } from "../worker/prompt.js";
const A = H.makeAsserter("AI費用控制(10.14)");

// ---------- 快取區塊 ----------
const payload = {
  player_name: "林小晴", age: 15, turn: 3, stats: { health: 70 }, time_context: { round_days: 5 },
  character_roster: ["甲｜女｜同學｜—｜一般"],
  active_characters: [{ name: "甲", affinity: 40, summary: "同班同學" }],
  milestone_status: [{ id: "a", label: "A", status: "available" }], milestone_skip_reason: { a: "x" },
  character_appearance: { innate: "高", styling: "短髮" }, family_structure: "雙親", family_background: "小康", key_event: null,
  is_politician_child_hidden_flag: false, stat_delta_limits: { health: [-10, 5] }, intimacy_mode: "full", chronicle_recent: ["（15歲）開學"],
  player_action: "讀書", forceEnding: false
};
const req = W.buildTurnRequest([{ role: "user", content: JSON.stringify(payload) }]);
const blocks = req.messages[0].content;
A.check("10.14.3 區塊順序：少變資料→名冊→本回合資料(2026-10-04使用者拍板調整；人物卡留在本回合資料)", Array.isArray(blocks) && blocks.length === 3 && /^【少變資料】/.test(blocks[0].text) && /^【名冊】/.test(blocks[1].text) && !blocks.some(b => /^【人物卡】/.test(b.text)), blocks.map(b => b.text.slice(0, 6)));
A.check("10.14.3 前兩個區塊設快取、最後一段(每回合會變)不設", blocks.slice(0, 2).every(b => b.cache_control && b.cache_control.type === "ephemeral") && !blocks[2].cache_control);
A.check("10.14.3 快取斷點總數不超過4(含固定規則)", blocks.filter(b => b.cache_control).length + req.system.filter(b => b.cache_control).length <= 4);
const merged = H.turnPayloadFromBody({ messages: [{ content: blocks }] });
const sortKeys = (o) => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
A.check("10.14.3 搬位置後內容一字不差(併回後與原payload完全相同)", sortKeys(merged) === sortKeys(payload), Object.keys(payload).filter(k => JSON.stringify(merged[k]) !== JSON.stringify(payload[k])));
A.check("10.14.3 少變資料區塊只含清單內的欄位，本回合資料不含這些欄位", Object.keys(JSON.parse(blocks[0].text.split("\n")[1])).every(k => W.STABLE_PAYLOAD_KEYS.includes(k)) && W.STABLE_PAYLOAD_KEYS.every(k => !(k in JSON.parse(blocks[2].text))));
A.check("10.14.3 常變欄位(狀態、時間、近況、人物卡)留在最後一段", ["stats", "time_context", "player_action", "turn", "active_characters"].every(k => k in JSON.parse(blocks[2].text)));
const noSlow = W.buildTurnRequest([{ role: "user", content: JSON.stringify({ a: 1, character_roster: ["甲｜女｜同學｜—｜一般"] }) }]).messages[0].content;
A.check("10.14.3 沒有少變欄位時不多出空區塊(名冊＋本回合資料共2段)", noSlow.length === 2);
const onlySlow = W.buildTurnRequest([{ role: "user", content: JSON.stringify({ a: 1, milestone_status: [] }) }]).messages[0].content;
A.check("10.14.3 沒有名冊但有少變欄位仍會分段", Array.isArray(onlySlow) && onlySlow.length === 2 && /^【少變資料】/.test(onlySlow[0].text));

// ---------- 快取保留時間：維持5分鐘版 ----------
A.check("10.14.4 固定規則快取維持5分鐘版(不帶ttl)——1小時版用呼叫成本紀錄試算較貴，不開", req.system.length === 1 && req.system[0].cache_control.type === "ephemeral" && !("ttl" in req.system[0].cache_control));

// ---------- 規則與工具定義去重複 ----------
const toolJson = JSON.stringify(TURN_RESULT_TOOL);
A.check("10.14.3 去重複後每個欄位仍在工具定義裡(沒有刪欄位)", ["scene_day_offset", "scene_summary", "turn_summary", "stat_deltas", "one_time_transaction", "life_summary", "response_rating", "action_result"].every(k => k in TURN_RESULT_TOOL.input_schema.properties) && JSON.stringify(TURN_RESULT_TOOL.input_schema.required) === JSON.stringify(["action_result", "narrative", "scene_day_offset", "scene_summary", "location", "chapter_subtitle", "turn_summary", "emotional_tone", "choices"]));
A.check("10.14.3 規則仍保留被去重的那幾條(留在system prompt一處)", /scene_day_offset（新場景日期＝round_start_date往後第幾天/.test(TURN_SYSTEM_PROMPT) && /stat_delta_limits是這回合health/.test(TURN_SYSTEM_PROMPT) && /one_time_transaction裡所有正數收入加起來/.test(TURN_SYSTEM_PROMPT) && /turn_summary：用1-2句話/.test(TURN_SYSTEM_PROMPT) && /life_summary（七、7\.1\.4/.test(TURN_SYSTEM_PROMPT));
A.check("10.14.3 規則說明回合內容分段送來；開場offset的0要輸出", /【少變資料】、【名冊】，最後一段是本回合的資料/.test(TURN_SYSTEM_PROMPT) && !/【人物卡】/.test(TURN_SYSTEM_PROMPT) && /scene_day_offset填0（這個0要輸出，不可以省略）/.test(TURN_SYSTEM_PROMPT));

// ---------- 開場不再固定多重生成一次 ----------
let omitOffset = true;
const fake = H.makeFakeAnthropic({ turnOverride: (p) => (omitOffset ? { scene_day_offset: undefined } : {}) });
H.installUpstream(fake);
{
  const env = H.makeEnv();
  const g = await H.loadGame({ useMock: false, env });
  await H.startNewLife(g);
  const turnCalls = () => fake.calls.filter(c => c.tool_choice && c.tool_choice.name === "submit_turn_result").length;
  A.check("10.14.3 開場：AI照【回傳資料精簡】把0省略，也只呼叫1次(不再13秒後多重生成)", turnCalls() === 1 && g.ev("state.turnCount") === 1, { calls: turnCalls(), turn: g.ev("state.turnCount") });
  A.check("10.14.3 開場沒寫offset：新場景日期照開場那天(offset當0)，沒有記違規", g.ev("(state.reviewFlags||[]).filter(f=>/scene_date/.test(f.kind)).length") === 0);
  g.ev("state.ap.gift = 50");
  const before = turnCalls();
  await H.playTurn(g, "讀書");
  A.check("10.14.3 一般回合沒寫offset：照舊算違規、自動重生成一次(共2次呼叫)", turnCalls() - before === 2, turnCalls() - before);
  g.win.close();
}
// ---------- 學生版固定規則：量測結果(不拆) ----------
const full = TURN_SYSTEM_PROMPT.length + toolJson.length;
const lines = TURN_SYSTEM_PROMPT.split("\n");
let removed = 0;
for (let i = 0; i < lines.length; i++) {
  if (["- 【十三、健康衰退與老年階段", "- 【十二、職涯系統", "- 【十二、12.11.1職涯伏筆", "- 【人生總結 life_summary"].some(a => lines[i].startsWith(a))) {
    removed += lines[i].length + 1;
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) { i++; removed += lines[i].length + 1; }
  }
}
removed += JSON.stringify(TURN_RESULT_TOOL.input_schema.properties.life_summary).length;
const estTokens = Math.round(removed * 51372 / 61012); // 實測：61,012字≈51,372 token(呼叫成本紀錄的快取讀取數)
A.check("10.14.2.4 學生版比完整版少的量(估計)低於5,000 token門檻→不拆", estTokens < 5000 && removed > 3000, { removedChars: removed, estTokens, fullChars: full });
console.log("學生版少的字數", removed, "估計token", estTokens);
const __ok = A.report();
process.exit(__ok ? 0 : 1);
