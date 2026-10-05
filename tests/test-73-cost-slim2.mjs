// 十、10.14.8（2026-10-05）每回合費用再降：輸出欄位C類摘要40字(10.14.8.3)、空值欄位不送與刪重複(10.14.8.4)。
// 10.14.8.2人物卡只送出場者本次不做。全程假上游，不打真實API
import * as H from "./harness.mjs";
import * as W from "../worker/worker.js";
import { TURN_SYSTEM_PROMPT, TURN_RESULT_TOOL } from "../worker/prompt.js";
const A = H.makeAsserter("每回合費用再降(10.14.8)");

// ---------- 10.14.8.3 輸出欄位 ----------
const props = TURN_RESULT_TOOL.input_schema.properties;
A.check("34.24#6 已刪除的age_advance：工具定義沒有、system prompt也沒有殘留說明", !("age_advance" in props) && !/age_advance/.test(TURN_SYSTEM_PROMPT) && !/age_advance/.test(JSON.stringify(TURN_RESULT_TOOL)));
const toolJson = JSON.stringify(TURN_RESULT_TOOL);
A.check("10.14.8.3 C類摘要欄位在工具定義與規則都寫40字", /新場景的一句話摘要，40字內/.test(toolJson) && /一句話描述，40字內/.test(toolJson) && /一句話補述，40字內/.test(toolJson) && /一句話，40字內；氣氛描寫不算/.test(toolJson) && /謊話的內容，一句話，40字內/.test(toolJson)
  && /scene_summary（新場景的一句話摘要，40字以內/.test(TURN_SYSTEM_PROMPT) && /new_clue（一句話，40字以內）/.test(TURN_SYSTEM_PROMPT) && /一句話描述，40字以內/.test(TURN_SYSTEM_PROMPT) && /每則40字以內/.test(TURN_SYSTEM_PROMPT));
A.check("10.14.8.3 舊的60字、「正常寫就好」說明已拿掉", !/60字內；氣氛描寫不算/.test(toolJson) && !/你不用擔心會不會太長或該不該精簡/.test(TURN_SYSTEM_PROMPT));
A.check("10.14.8.3 turn_summary維持原規則(人生之書素材，待使用者決定)", /turn_summary：用1-2句話/.test(TURN_SYSTEM_PROMPT));
A.check("10.14.8.3 玩家看得到的欄位不動(narrative、choices、chapter_subtitle、life_summary仍在)", ["narrative", "action_result", "choices", "chapter_subtitle", "life_summary"].every(k => k in props));

const long = "很長的摘要".repeat(12); // 60字
let mode = "";
const fake = H.makeFakeAnthropic({ turnOverride: (p) => {
  if (mode === "long") {
    const fam = (p.active_characters || [])[0];
    return { scene_summary: long, character_updates: fam ? [{ name: fam.name, summary_add: long }] : [], plot_new: [{ text: long, kind: "心結", characters: fam ? [fam.name] : [] }] };
  }
  if (mode === "omit") return { stat_deltas: undefined, attachment_shift: undefined, conscientiousness_shift: undefined, peer_position_shift: undefined, age_advance: undefined, is_ending: undefined, revealed_key_event: undefined };
  return {};
} });
H.installUpstream(fake);
const env = H.makeEnv({ AP_TEST_KEYS: H.loc("slim2key") });
const g = await H.loadGame({ useMock: false, env, key: "slim2key", dev: true });
g.win.localStorage.setItem("lifegame_ap_test_free", "yes");
await H.startNewLife(g);
const turnCalls = () => fake.calls.filter(c => c.tool_choice && c.tool_choice.name === "submit_turn_result").length;
const lastPayload = () => H.turnPayloadFromBody(fake.calls.filter(c => c.tool_choice && c.tool_choice.name === "submit_turn_result").slice(-1)[0]);
await H.playTurn(g, "讀書");
mode = "long";
let before = turnCalls();
const famName = g.ev("activeCharacters()[0].name");
await H.playTurn(g, "讀書");
A.check("34.24#7 C類摘要超過40字：不重新產生(這回合只呼叫1次)", turnCalls() - before === 1, turnCalls() - before);
A.check("34.24#7 超過40字照舊規則截斷：新場景摘要、人物補述、劇情線一句話", g.ev("state.timeState.cal.lastSceneSummary.length") === 40
  && g.ev(`characterByName(state, ${JSON.stringify(famName)}).summaryEntries.slice(-1)[0].length`) === 40
  && g.ev("state.plotLines.slice(-1)[0].text.length") === 40,
  { scene: g.ev("state.timeState.cal.lastSceneSummary.length"), plot: g.ev("(state.plotLines.slice(-1)[0]||{}).text") });
g.ev(`(function(){ const l = state.plotLines.slice(-1)[0]; addPlotClue(state, l, ${JSON.stringify(long)}); })()`);
A.check("10.14.8.3 線索超過40字截斷", g.ev("state.plotLines.slice(-1)[0].clues.slice(-1)[0].length") === 40);
mode = "omit";
before = turnCalls();
await H.playTurn(g, "讀書");
A.check("34.24#8 值為0／false的欄位全部省略：不觸發重生成、回合照常推進", turnCalls() - before === 1 && g.errors.length === 0, { calls: turnCalls() - before, errors: g.errors });
mode = "";

// ---------- 10.14.8.4 其他每回合資料 ----------
await H.playTurn(g, "讀書");
const p = lastPayload();
const raw = JSON.parse(g.ev("buildUserMessage('讀書', false, {structured:true,label:'x'})"));
const emptyTop = Object.keys(raw).filter(k => { const v = raw[k]; return v === null || v === false || v === "" || (Array.isArray(v) && !v.length) || (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length); });
A.check("10.14.8.4 第一層值為null／false／空字串／空陣列／空物件的欄位不送(Worker必填除外)", emptyTop.every(k => ["forceEnding", "player_action"].includes(k)), emptyTop);
A.check("10.14.8.4 Worker必填欄位一律保留(forceEnding是false也送)", raw.forceEnding === false && ["player_name", "gender", "age", "turn", "stats", "player_action"].every(k => k in raw));
const tc = p.time_context || {}, nr = p.narrative_rhythm || {};
const innerEmpty = (o) => Object.keys(o).filter(k => { const v = o[k]; return v === null || v === false || (Array.isArray(v) && !v.length); });
A.check("10.14.8.4 time_context、narrative_rhythm裡面一層的空值也不送", innerEmpty(tc).length === 0 && innerEmpty(nr).length === 0 && !("retry_note" in tc) && tc.round_days >= 1, { tc: innerEmpty(tc), nr: innerEmpty(nr) });
A.check("10.14.8.4 人物卡裡的null不處理(style／age是null＝要回填)", JSON.stringify(g.ev("JSON.stringify(compactTurnPayload({active_characters:[{name:'甲',style:null}]}))")) === JSON.stringify(JSON.stringify({ active_characters: [{ name: "甲", style: null }] })));
A.check("10.14.8.4 刪重複：current_time_label(＝time_context.stage_label)、word_range不再送", !("current_time_label" in raw) && !("word_range" in (raw.narrative_length_guide || {})) && raw.narrative_length_guide.target_total_words > 0 && tc.stage_label);
A.check("10.14.8.4 刪重複：名冊放得下時不送all_character_names", !("all_character_names" in raw) && raw.character_roster.length === g.ev("state.characters.length"));
g.ev("for(let i=0;i<81;i++) state.characters.push({name:'路人'+i, relation:'同學', active:false, affinity:10, gender:'男'})");
const raw2 = JSON.parse(g.ev("buildUserMessage('讀書', false, {structured:true,label:'x'})"));
A.check("10.14.8.4 名冊超過80人(放不下)時才送完整名單", Array.isArray(raw2.all_character_names) && raw2.all_character_names.length === g.ev("state.characters.length") + 1 && raw2.character_roster.length === 80);
A.check("10.14.8.4 system prompt說明沒出現的欄位＝空值；新角色名字對照名冊", /值是null、false、空字串、空陣列或空物件的欄位不會送出/.test(TURN_SYSTEM_PROMPT) && /新角色的名字不得與【名冊】上任何一個名字/.test(TURN_SYSTEM_PROMPT) && !/all_character_names是所有既有角色的名字/.test(TURN_SYSTEM_PROMPT));
// 兩個固定值移進少變資料
const req = W.buildTurnRequest([{ role: "user", content: JSON.stringify(raw) }]);
const stable = JSON.parse(req.messages[0].content[0].text.split("\n")[1]);
A.check("10.14.8.4 固定值home_purchase_min_down_payment_pct、player_pronoun放進少變資料", stable.home_purchase_min_down_payment_pct === 20 && typeof stable.player_pronoun === "string" && !("player_pronoun" in JSON.parse(req.messages[0].content.slice(-1)[0].text)));
const merged = H.turnPayloadFromBody({ messages: req.messages });
A.check("10.14.8.4 分段後併回與送出的payload一字不差", JSON.stringify(Object.keys(merged).sort().map(k => [k, merged[k]])) === JSON.stringify(Object.keys(raw).sort().map(k => [k, raw[k]])));
g.win.close();
A.report();
process.exit(0);
