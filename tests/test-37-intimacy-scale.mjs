// 2026-09-28：一、1.2.11 敘事尺度(親密關係)＋四、4.1.4 年齡欄位＋十六、16.3.7 偏好開關（USE_MOCK＋假上游，不打真實API）
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as H from "./harness.mjs";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = H.makeAsserter("一 敘事尺度(親密關係)");

// ================= 真實路徑(假上游)：AI建卡回報年齡、age_fill =================
let turnOverride = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => turnOverride(p) }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "intimkey01" });
const ev = g.ev, doc = g.win.document;
await H.startNewLife(g, { name: "林以晴", gender: "女" });
ev("state.age = 16");
turnOverride = () => ({ new_characters: [
  { name: "陳柏宇", relation: "同班同學", gender: "男", initial_affinity: 50, origin: "高一同班", age: 30 },
  { name: "王學長", relation: "社團學長", gender: "男", initial_affinity: 50, origin: "社團" },
  { name: "李老師", relation: "班導", gender: "女", initial_affinity: 50, origin: "班導", age: 41 },
  { name: "路人甲", relation: "網友", gender: "男", initial_affinity: 50, origin: "網路" }
] });
await H.playTurn(g, "去上學"); await H.waitIdle(g, 20);
const age = (n) => ev(`(state.characters.find(c=>c.name==='${n}')||{}).age`);
A.check("4.1.4 同班同學＝主角同齡(AI給的年齡不採用)", age("陳柏宇") === 16);
A.check("4.1.4 學長＝主角年齡＋1～2", [17, 18].includes(age("王學長")), age("王學長"));
A.check("4.1.4 其他NPC採用AI建卡時回報的整數年齡", age("李老師") === 41);
A.check("4.1.4 AI沒給年齡：先空著", age("路人甲") === undefined);
turnOverride = () => ({ character_updates: [{ name: "路人甲", affinity_delta: 1, age_fill: 19 }, { name: "李老師", affinity_delta: 0, age_fill: 99 }] });
await H.playTurn(g, "上網聊天"); await H.waitIdle(g, 20);
A.check("4.1.4 age_fill只對沒有年齡的角色回填一次", age("路人甲") === 19 && age("李老師") === 41);
turnOverride = () => ({ character_updates: [{ name: "路人甲", affinity_delta: 1, age_fill: 25 }] });
await H.playTurn(g, "上網聊天"); await H.waitIdle(g, 20);
A.check("4.1.4 回填後固定，AI不可修改", age("路人甲") === 19);
ev("ageChildren(state, 1)");
A.check("4.1.4 建卡後由程式每年加一歲", age("李老師") === 42 && age("路人甲") === 20);
const payload = JSON.parse(ev("buildUserMessage('去上學', false, {structured:true,label:'x'})"));
const roster = payload.active_characters.find(c => c.name === "陳柏宇");
A.check("payload：角色卡帶age；intimacy_mode預設full", roster && roster.age === 17 && payload.intimacy_mode === "full" && (payload.romance_flags === undefined || Array.isArray(payload.romance_flags)), { roster, mode: payload.intimacy_mode, names: payload.active_characters.map(c=>c.name+":"+c.age) });
A.check("整段沒有jsdom錯誤(真實路徑)", g.errors.length === 0, g.errors.map(String).slice(0, 3));

// ================= 規則單元(USE_MOCK) =================
const m = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "intimkey02" });
const e2 = m.ev, d2 = m.win.document;
e2("MOCK_AI_DELAY_MS = 0");
await H.startNewLife(m, { name: "林以晴", gender: "女" });
const addNpc = (name, npcAge, extra = "") => e2(`state.characters = state.characters.filter(c=>c.name!=='${name}'); state.characters.push({name:'${name}',relation:'朋友',gender:'男',${npcAge === null ? "" : "age:" + npcAge + ","}affinity:60,active:true,traits:'',summary:'',lastTurn:0,isChild:false${extra}})`);
const flags = (name) => JSON.parse(e2(`JSON.stringify(romanceAgeFlags(state, state.characters.find(c=>c.name==='${name}')))`));
const pushSignals = (name, n) => e2(`(()=>{ const c=state.characters.find(x=>x.name==='${name}'); for(let i=0;i<${n};i++){ applyRomanceSignal(state, c, 'positive'); if(c.romanceStatus==='ambiguous' && c.romanceProgress>=ROMANCE_DATING_PROGRESS) startDating(state, c); /* 4.8：交往要告白場面＋點頭，測試直接走成立函式 */ } return c.romanceStatus||null; })()`);

e2("state.age = 25"); addNpc("成年甲", 27);
A.check("1.2.11.7 兩人皆成年：both_adult", JSON.stringify(flags("成年甲")) === JSON.stringify({ both_adult: true, any_minor: false, age_gap_cross: false, began_as_minors: false, continuing: false }));
A.check("兩人皆成年可以一路交往", pushSignals("成年甲", 20) === "stable");
e2("state.age = 16"); addNpc("未成年乙", 17);
let f = flags("未成年乙");
A.check("兩人皆未成年：any_minor", f.any_minor && !f.both_adult && !f.age_gap_cross);
A.check("1.2.11.3.2 兩人皆未成年、差1歲：可以交往(最多stable)", pushSignals("未成年乙", 20) === "stable");
A.check("1.2.11.7 進入曖昧時兩人皆未成年：began_as_minors=true", e2("state.characters.find(c=>c.name==='未成年乙').beganAsMinors") === true);
addNpc("差太多", 13);
A.check("1.2.11.3.2 兩人皆未成年但年齡差超過2歲：訊號不處理", pushSignals("差太多", 20) === null);
addNpc("剛好2歲", 14);
A.check("年齡差剛好2歲：可以", pushSignals("剛好2歲", 5) !== null);
e2("state.age = 11"); addNpc("太小", 11);
A.check("1.2.11.3.2 任一方未滿12歲：不進入戀愛狀態", pushSignals("太小", 20) === null);
e2("state.age = 20"); addNpc("跨線", 16);
f = flags("跨線");
A.check("一方成年一方未成年：age_gap_cross", f.age_gap_cross && f.any_minor && !f.both_adult);
A.check("1.2.11.3.3 一方成年一方未成年：不發展新的戀愛線(訊號不處理)", pushSignals("跨線", 20) === null);
e2("state.age = 16"); addNpc("跨線", 16);
A.check("跨線反過來(主角未成年、對方成年)同樣不處理", (e2("state.characters.find(c=>c.name==='跨線').age = 19"), pushSignals("跨線", 20)) === null);
addNpc("沒年齡", null);
A.check("4.1.4 沒有年齡的NPC：訊號一律不處理", pushSignals("沒年齡", 20) === null);
// 生日跨線延續
e2("state.age = 18");
f = flags("未成年乙");
A.check("1.2.11.3.3 生日跨線延續(began_as_minors、主角先滿18)：送出any_minor、不算age_gap_cross", f.any_minor && !f.age_gap_cross && f.continuing);
A.check("延續中的關係訊號照常處理", (() => { const before = e2("state.characters.find(c=>c.name==='未成年乙').romanceProgress"); e2("applyRomanceSignal(state, state.characters.find(c=>c.name==='未成年乙'), 'positive')"); return e2("state.characters.find(c=>c.name==='未成年乙').romanceProgress") === before + 1; })());
// 同居與結婚須兩人皆成年(含延續期間)
e2("state.milestones.moved_out='completed'; state.housing={type:'rent'}; state.pendingCohabitationOffer=null; state.cohabitationOfferCooldownUntilTurn=0; state.characters.forEach(c=>{ if(c.name!=='未成年乙' && c.romanceStatus) c.romanceStatus=null; }); state.characters.find(c=>c.name==='未成年乙').stableSinceTurn=-100");
e2("checkCohabitationOffer(state, '我們搬去一起住吧')");
A.check("1.2.11.3.2 延續期間對方未成年：不跳同居彈窗", !e2("state.pendingCohabitationOffer"));
e2("applyMarriageDecisionCompletion(state)");
A.check("1.2.11.3.2 延續期間對方未成年：不能結婚", e2("state.characters.find(c=>c.name==='未成年乙').romanceStatus") === "stable");
e2("state.characters.find(c=>c.name==='未成年乙').age = 18");
f = flags("未成年乙");
A.check("1.2.11.7 兩人皆滿18歲：自動切換成both_adult", f.both_adult && !f.any_minor);
e2("checkCohabitationOffer(state, '我們搬去一起住吧')");
A.check("兩人皆成年後同居彈窗照常出現", e2("state.pendingCohabitationOffer && state.pendingCohabitationOffer.partnerName") === "未成年乙");
e2("state.pendingCohabitationOffer=null; applyMarriageDecisionCompletion(state)");
A.check("兩人皆成年後可以結婚", e2("state.characters.find(c=>c.name==='未成年乙').romanceStatus") === "married");
// 旗標送給AI
const rf = JSON.parse(e2("JSON.stringify(buildRomanceFlags(state))"));
A.check("1.2.11.7 romance_flags只列曖昧以上的NPC，依npc_id(姓名)", rf.some(x => x.npc_id === "未成年乙" && x.both_adult) && !rf.some(x => x.npc_id === "沒年齡"));
// 既有存檔
e2("state.age = 16; addNpcOld = null; state.characters.push({name:'舊戀人',relation:'朋友',gender:'男',age:16,affinity:70,active:true,romanceStatus:'dating',traits:'',summary:'',lastTurn:0}); state.characters.push({name:'舊戀人2',relation:'朋友',gender:'男',age:30,affinity:70,active:true,romanceStatus:'dating',traits:'',summary:'',lastTurn:0}); ensureRomanceAgeMarks(state)");
A.check("1.2.11.7 既有存檔：推算得出兩人皆未成年才補true，推算不出一律false", e2("state.characters.find(c=>c.name==='舊戀人').beganAsMinors") === true && e2("state.characters.find(c=>c.name==='舊戀人2').beganAsMinors") === false);

// 偏好開關：16.3.7（2026-09-28改定）不在選單顯示，一律完整呈現；舊存檔存過fade也照送full
e2("state.phase='playing'; render()");
A.check("16.3.7 選單沒有親密場景開關", !d2.getElementById("link-intimacy-toggle"));
e2("state.intimacyMode='fade'");
const p2 = JSON.parse(e2("buildUserMessage('x', false, {structured:true,label:'x'})"));
A.check("舊存檔intimacyMode=fade：每回合仍送intimacy_mode=full", p2.intimacy_mode === "full");
e2("ensureBook(state)");
const chMat = JSON.parse(e2("JSON.stringify(buildChapterMaterial(state, {index:1, items:[{t:'x',s:'y'}], events:[], ageFrom:15, ageTo:16}))"));
A.check("16.3.7 人生之書章節素材帶intimacy_mode=full與romance_flags", chMat.intimacy_mode === "full" && Array.isArray(chMat.romance_flags));
A.check("整段沒有jsdom錯誤(規則)", m.errors.length === 0, m.errors.map(String).slice(0, 3));

// ================= prompt =================
const prompt = fs.readFileSync(path.join(ROOT, "worker", "prompt.js"), "utf8");
const wrStart = prompt.indexOf("【寫作規則"), wrEnd = prompt.indexOf("【語氣軌");
const shared = prompt.slice(wrStart, wrEnd);
A.check("1.2.11.8 【親密場景寫法】整段放進寫作規則(章節成書共用)", /【親密場景寫法/.test(shared) && /age_gap_cross=true：不寫任何戀愛內容。/.test(shared) && /回傳 romantic_signal 時必須附上 npc_id。/.test(shared) && /intimacy_mode=fade：寫到擁吻即轉場至隔天或下一個場景。/.test(shared));
A.check("prompt不附範例段落(舊疤、麻油麵線)", !/舊疤|麻油|麵線/.test(prompt));
A.check("schema：new_characters有age、character_updates有age_fill", /age:\{type:\["number","null"\], description:"（四、4.1.4）角色年齡/.test(prompt) && /age_fill:\{type:\["number","null"\]/.test(prompt));
process.exit(A.report() ? 0 : 1);
