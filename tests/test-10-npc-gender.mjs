// 2026-09-27：四、4.1／一、1.2.5 NPC角色卡性別欄位；2026-09-28改依四、4.1.3（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("4.1 NPC性別欄位");
let override = () => ({});
let lastPayload = null;
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "npcgender1" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;

// 稱謂推性別
const cases = [["父親", "男"], ["母親（服刑中）", "女"], ["哥哥", "男"], ["妹妹", "女"], ["阿嬤", "女"], ["兒子", "男"], ["同學", null], ["配偶", null]];
A.check("genderFromRelation 稱謂推性別", cases.every(([r, gd]) => ev(`genderFromRelation(${JSON.stringify(r)})`) === gd), cases.map(([r]) => ev(`genderFromRelation(${JSON.stringify(r)})`)));

// 4.1.3 開局100次：家人卡gender與稱謂一致
let mismatch = 0, sample = null;
for (let i = 0; i < 100; i++) {
  const fam = JSON.parse(ev("JSON.stringify(newRoll(null,{name:'測試',gender:'女'}).characters.map(c=>[c.relation,c.gender,FAMILY_ROLE_GENDER[familyRoleOf(c.relation)]||null]))"));
  fam.forEach(([r, gd, exp]) => { if (!(gd === "男" || gd === "女") || gd !== exp) { mismatch++; sample = [r, gd, exp]; } });
}
A.check("開局100次：家人卡gender與稱謂一致(0次不一致)", mismatch === 0, sample);
A.check("父親卡＝男、母親卡＝女", ev("state.characters.filter(c=>/^父親/.test(c.relation)).every(c=>c.gender==='男') && state.characters.filter(c=>/^母親/.test(c.relation)).every(c=>c.gender==='女')"));
// 隔代教養、服刑中、不同住都要有gender（強制各跑幾次）
const structs = JSON.parse(ev(`JSON.stringify((()=>{ const seen={}; for(let i=0;i<400;i++){ const r=newRoll(null,{name:'測',gender:'男'}); seen[r.familyStructure]=(seen[r.familyStructure]||true) && r.characters.every(c=>c.gender==='男'||c.gender==='女'); } return seen; })())`));
A.check("五種家庭結構都跑到且家人卡都有gender", Object.keys(structs).length === 5 && Object.values(structs).every(Boolean), structs);

// AI建卡帶gender
override = () => ({ new_characters: [{ name: "林子涵", relation: "同學", gender: "女", traits: "安靜", initial_affinity: 50, origin: "高一同班" }] });
await H.playTurn(g);
A.check("AI建卡的gender記在角色卡", ev("state.characters.find(c=>c.name==='林子涵').gender") === "女");
override = () => ({ new_characters: [{ name: "王大明", relation: "鄰居", traits: "熱心", initial_affinity: 50, origin: "住隔壁" }] });
await H.playTurn(g);
const wangG = ev("state.characters.find(c=>c.name==='王大明').gender");
A.check("AI建卡缺gender：客戶端補骰(男/女)", wangG === "男" || wangG === "女", wangG);
override = () => ({ new_characters: [{ name: "張小安", relation: "表哥", gender: "未知", traits: "", initial_affinity: 50, origin: "" }] });
await H.playTurn(g);
const zhangG = ev("state.characters.find(c=>c.name==='張小安').gender");
A.check("gender給enum外的值：不採用、補骰", zhangG === "男" || zhangG === "女", zhangG);
override = () => ({ character_updates: [{ name: "王大明", affinity_delta: 1, gender: wangG === "男" ? "女" : "男", gender_fill: wangG === "男" ? "女" : "男" }] });
await H.playTurn(g); await H.playTurn(g);
A.check("補骰後的gender之後回合不可被改(gender/gender_fill都忽略)", ev("state.characters.find(c=>c.name==='王大明').gender") === wangG);

// 性別鎖定
override = () => ({ character_updates: [{ name: "林子涵", affinity_delta: 2, gender: "男" }] });
await H.playTurn(g);
A.check("character_updates帶gender：被忽略", ev("state.characters.find(c=>c.name==='林子涵').gender") === "女");
override = () => ({ character_updates: [{ name: "林子涵", affinity_delta: 0, gender_fill: "男" }] });
await H.playTurn(g);
A.check("gender_fill對已有值的角色：被忽略", ev("state.characters.find(c=>c.name==='林子涵').gender") === "女");
override = () => ({});

// payload帶gender
await H.playTurn(g);
const msg = lastPayload && JSON.stringify(lastPayload);
A.check("送AI的active_characters帶gender", msg && msg.includes("林子涵") && /林子涵[^}]*gender[^}]*女|gender[^}]*女[^}]*林子涵/.test(msg.replace(/\\"/g, '"')));

// 舊存檔讀入
ev("state.characters.forEach(c=>{ delete c.gender; })");
let migrateOk = true;
try { ev("ensureCharacterGenders(state)"); } catch (e) { migrateOk = false; }
A.check("舊存檔讀入：家人卡補齊、其餘為null、不crash", migrateOk && ev("state.characters.filter(c=>familyRoleOf(c.relation)&&familyRoleOf(c.relation)!=='配偶').every(c=>c.gender===FAMILY_ROLE_GENDER[familyRoleOf(c.relation)])") && ev("state.characters.find(c=>c.name==='林子涵').gender") === null && ev("state.characters.find(c=>c.name==='王大明').gender") === null);
await H.playTurn(g);
A.check("舊存檔：遷移後照常跑回合", g.errors.length === 0, g.errors.map(String).slice(0, 2));
override = () => ({ character_updates: [{ name: "林子涵", affinity_delta: 0, gender_fill: "女" }] });
await H.playTurn(g);
A.check("gender_fill對null角色：寫入", ev("state.characters.find(c=>c.name==='林子涵').gender") === "女");
override = () => ({ character_updates: [{ name: "林子涵", affinity_delta: 0, gender_fill: "男" }] });
await H.playTurn(g);
A.check("gender_fill寫入後鎖定", ev("state.characters.find(c=>c.name==='林子涵').gender") === "女");
override = () => ({});

// 同性戀愛線：曖昧→交往→穩定→結婚
ev(`state.age=26; state.characters.push({name:'怡君',relation:'朋友',gender:'女',affinity:60,active:true,traits:'',summary:'',lastTurn:state.turnCount,isChild:false})`);
const seen = new Set();
override = () => ({ character_updates: [{ name: "怡君", affinity_delta: 1, romantic_signal: "positive" }] });
for (let i = 0; i < 16; i++) { await H.playTurn(g); seen.add(ev("state.characters.find(c=>c.name==='怡君').romanceStatus")); }
ev("state.milestones.marriage_decision='available'");
override = () => ({ milestone_updates: [{ id: "marriage_decision", status: "completed" }] });
await H.playTurn(g);
override = () => ({});
A.check("同性戀愛線(玩家女、對象女)：曖昧→交往→穩定→結婚", ["ambiguous", "dating", "stable"].every(x => seen.has(x)) && ev("state.characters.find(c=>c.name==='怡君').romanceStatus") === "married", [...seen, ev("state.characters.find(c=>c.name==='怡君').romanceStatus")]);

// 世代傳承
async function inherit(playerGender, spouseGender, childGender, childRelation) {
  const gg = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "npcgi" + playerGender + spouseGender + childGender });
  await H.startNewLife(gg, { gender: playerGender });
  gg.ev(`state.characters.push({name:'阿伴',relation:'配偶',gender:${JSON.stringify(spouseGender)},romanceStatus:'married',cohabiting:true,affinity:70,active:true,traits:'',summary:'',lastTurn:0},
      {name:'小寶',relation:${JSON.stringify(childRelation)},gender:${JSON.stringify(childGender)},isChild:true,age:20,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]},
      {name:'小二',relation:'孩子',gender:'女',isChild:true,age:18,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});
      state.age=60; state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending'`);
  await gg.ev("succeedAsChild('小寶')");
  return JSON.parse(gg.ev(`JSON.stringify({ g: state.gender, chars: state.characters.map(c=>[c.name,c.relation,c.gender]), err: ${"0"} })`));
}
const het = await inherit("男", "女", "女", "女兒");
A.check("異性伴侶傳承：父親(上一代)＋母親(配偶)、新主角性別讀子女卡", het.g === "女" && het.chars.some(c => c[1] === "父親" && c[2] === "男") && het.chars.some(c => c[0] === "阿伴" && c[1] === "母親" && c[2] === "女"), het);
const gay = await inherit("男", "男", "男", "兒子");
A.check("同性伴侶(男男)傳承：兩位父親", gay.chars.filter(c => c[1] === "父親" && c[2] === "男").length === 2 && !gay.chars.some(c => c[1] === "母親"), gay);
const les = await inherit("女", "女", "女", "孩子");
A.check("同性伴侶(女女)傳承：兩位母親、新主角性別讀gender(稱謂不是兒子/女兒)", les.g === "女" && les.chars.filter(c => c[1] === "母親" && c[2] === "女").length === 2 && !les.chars.some(c => c[1] === "父親"), les);
A.check("傳承後手足稱謂依子女卡gender", ["姊姊", "妹妹"].includes((het.chars.find(c => c[0] === "小二") || [])[1]) && (het.chars.find(c => c[0] === "小二") || [])[2] === "女", het.chars.find(c => c[0] === "小二"));

// prompt
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：new_characters schema有gender enum", /gender:\{type:"string", enum:\["男","女"\]/.test(prompt));
A.check("prompt：說明引用時必須一致", prompt.includes("引用時代名詞、稱呼、姓名都必須跟它一致"));
A.check("prompt：character_updates schema有gender_fill", /gender_fill:\{type:\["string","null"\]/.test(prompt));
A.check("prompt：代名詞依gender、不從姓名判斷、戀愛對象不依玩家性別預設", prompt.includes("不從姓名自行判斷") && prompt.includes("不要依玩家性別預設對象的性別"));

// mock長程
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "npcgenderm" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
for (let i = 0; i < 200; i++) await H.playTurn(gm);
A.check("mock 200回合：新角色都有性別、無錯誤", gm.errors.length === 0 && gm.ev("state.characters.filter(c=>['小林','阿哲','惠雯','子晴','阿凱','詩婷'].some(n=>c.name.startsWith(n))).every(c=>c.gender==='男'||c.gender==='女')"));

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
