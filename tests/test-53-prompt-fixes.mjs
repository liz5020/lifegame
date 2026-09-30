// 2026-09-30：QA 34.15 第1、4、5、6項——性別以名單為準、選項只用已知人名、關係提示用詞、系統用語不進台詞(全程假上游，不打真實API)
import path from "path";
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("QA34.15 prompt層修正");
let override = () => ({});
let lastPayload = null;
const fake = H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } });
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "fix0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = "ap:fix0000001:0"; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
const flags = () => ev("JSON.stringify((state.reviewFlags||[]).map(f=>JSON.stringify(f)))");
ev("state.timeState.segmentIndex=YEAR_SEGMENTS.findIndex(x=>x.key==='期中準備期'); state.timeState.turnsInSegment=1");
const hintsOfLast = () => (js("state.log[state.log.length-1].relationshipHints") || []).join("｜");

// ---------- #5 關係提示用詞 ----------
A.check("#5 升級：「更近了，現在是…」", ev("labelChangeHint('阿哲','認識不深','普通朋友')") === "和阿哲的關係更近了，現在是「普通朋友」");
A.check("#5 降級：「退了一步，現在只是…」，跟升級措辭分開", ev("labelChangeHint('阿哲','熟悉的朋友','認識不深')") === "和阿哲的關係退了一步，現在只是「認識不深」");
A.check("#5 家人與婚姻的級距也分升降", /更近了/.test(ev("labelChangeHint('媽媽','普通','親近')")) && /退了一步/.test(ev("labelChangeHint('老公','恩愛','平穩')")));
A.check("#5 對不上級距表：中性說法，不寫「好像不一樣了」", ev("labelChangeHint('某人','甲','乙')") === "和某人的關係有了變化，現在是「乙」");
ev(`state.characters = state.characters.filter(c=>c.name!=='阿哲'); state.characters.push({name:'阿哲',relation:'同學',gender:'男',age:16,affinity:38,active:true,traits:'',summary:'',lastTurn:state.turnCount,isChild:false})`);
override = () => ({ character_updates: [{ name: "阿哲", affinity_delta: 5 }] });
await H.playTurn(g, "嗯");
A.check("#5 整回合：好感跨過級距往上，提示寫「更近了，現在是…」", /和阿哲的關係更近了，現在是「普通朋友」/.test(hintsOfLast()), hintsOfLast());
override = () => ({ character_updates: [{ name: "阿哲", affinity_delta: -6 }] });
await H.playTurn(g, "嗯");
A.check("#5 整回合：往下掉，提示寫「退了一步」，不出現「好像不一樣了」", /和阿哲的關係退了一步，現在只是「認識不深」/.test(hintsOfLast()) && !/好像不一樣/.test(hintsOfLast()), hintsOfLast());
override = () => ({ new_characters: [{ name: "筱涵", gender: "女", relation: "同學", traits: "開朗", origin: "新同學", initial_affinity: 50 }] });
await H.playTurn(g, "嗯");
A.check("#5 第一次認識新角色：提示寫「認識了○○」", /認識了筱涵/.test(hintsOfLast()), hintsOfLast());
override = () => ({});

// ---------- #4 選項只能用主角已知道的人名 ----------
override = () => ({ new_characters: [{ name: "筱雯", gender: "女", relation: "路人", traits: "安靜", origin: "門口的陌生人", initial_affinity: 50, name_known: false }] });
await H.playTurn(g, "嗯");
A.check("#4 name_known:false的新角色：不提示「認識了」、存下nameKnown＝false", !/認識了筱雯/.test(hintsOfLast()) && ev("state.characters.find(c=>c.name==='筱雯').nameKnown") === false, hintsOfLast());
override = () => ({ choices: ["招呼筱雯進來", "繼續寫作業", "去倒水", "看窗外"] });
await H.playTurn(g, "嗯");
const rosterEntry = (lastPayload.characters || lastPayload.active_characters || []).find && (lastPayload.characters || lastPayload.active_characters || []).find(c => c.name === "筱雯");
A.check("#4 提示裡的人物名單標出name_known＝false", !!rosterEntry && rosterEntry.name_known === false, rosterEntry);
A.check("#4 選項提前寫出還不知道的名字：換成外貌稱呼、寫入錯誤紀錄", ev("state.choices[0]") === "招呼那個女生進來" && !ev("state.choices.join('|')").includes("筱雯") && /choice_unknown_name/.test(flags()), ev("JSON.stringify(state.choices)"));
override = () => ({ names_revealed: ["筱雯"], choices: ["跟筱雯打招呼", "繼續寫作業", "去倒水", "看窗外"] });
await H.playTurn(g, "嗯");
A.check("#4 names_revealed：解除、提示「認識了筱雯」", ev("state.characters.find(c=>c.name==='筱雯').nameKnown") === undefined && /認識了筱雯/.test(hintsOfLast()), hintsOfLast());
A.check("#4 名字已知後選項可以用名字", ev("state.choices[0]") === "跟筱雯打招呼", ev("JSON.stringify(state.choices)"));
override = () => ({});

// ---------- #6 系統用語不進台詞與敘事 ----------
const q = (txt) => js(`detectOutputQualityIssues({ action_result:[], narrative:${JSON.stringify(txt)} })`);
A.check("#6 台詞說「正式副業那個」：偵測到、要求重新產生", q("詩涵說：「你那個正式副業那個，最近怎麼樣？」").some(x => /系統用語「正式副業」/.test(x)));
A.check("#6 敘事出現「好感度」「行動點」「投入度」「這回合」「訂單簿」：偵測到", ["好感度", "行動點", "投入度", "這回合", "訂單簿", "接單上限", "興趣卡"].every(w => q(`她的${w}好像有變化。`).some(x => x.includes(w))));
A.check("#6 一般句子不誤殺(身體重心、生活重心、一個回合)", q("他把身體重心壓低，穩穩接住球。").length === 0 && q("她的生活重心慢慢移到了工作室。").length === 0 && q("這一輪比賽打得很久。").length === 0);
A.check("#6 一般口語(「我現在認真在做手作了」)通過", q("「我現在算是認真在做手作了。」").length === 0);

// ---------- #1 prompt ----------
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt #1：性別以名單為準、玩家用錯代名詞不改寫", ["角色性別以名單為準", "不要跟著改寫名單上的性別", "表姊、表哥"].every(k => prompt.includes(k)));
A.check("prompt #4：選項只能用已知人名、name_known／names_revealed", ["選項只能用主角已知道的人名", "name_known:false", "names_revealed"].every(k => prompt.includes(k)) && /name_known:\{type:"boolean"/.test(prompt.replace(/\s+/g, "")) && /names_revealed:\{type:"array"/.test(prompt.replace(/\s+/g, "")));
A.check("prompt #5／#6：關係提示用詞、不說系統用語", ["關係提示用詞", "不說遊戲系統用語", "正式副業", "好像不一樣了"].every(k => prompt.includes(k)));
A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
