// 2026-09-27：四、4.1／一、1.2.5 NPC角色卡性別欄位（全程假上游，不打真實API）
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

// 開局家人卡都有性別
let allFamily = true;
for (let i = 0; i < 100; i++) {
  const fam = JSON.parse(ev("JSON.stringify(newRoll(null,{name:'測試',gender:'女'}).characters.map(c=>[c.relation,c.gender]))"));
  if (!fam.every(([r, gd]) => gd === "男" || gd === "女")) { allFamily = false; console.log(fam); break; }
}
A.check("100次開局：家人卡全部有性別", allFamily);
A.check("父親卡＝男、母親卡＝女", ev("state.characters.filter(c=>/^父親/.test(c.relation)).every(c=>c.gender==='男') && state.characters.filter(c=>/^母親/.test(c.relation)).every(c=>c.gender==='女')"));

// AI建卡帶gender
override = () => ({ new_characters: [{ name: "林子涵", relation: "同學", gender: "女", traits: "安靜", initial_affinity: 50, origin: "高一同班" }] });
await H.playTurn(g);
A.check("AI建卡的gender記在角色卡", ev("state.characters.find(c=>c.name==='林子涵').gender") === "女");
override = () => ({ new_characters: [{ name: "王大明", relation: "鄰居", traits: "熱心", initial_affinity: 50, origin: "住隔壁" }] });
await H.playTurn(g);
A.check("AI沒給gender且稱謂推不出：null(不猜)", ev("state.characters.find(c=>c.name==='王大明').gender") === null);
override = () => ({ new_characters: [{ name: "張小安", relation: "表哥", gender: "未知", traits: "", initial_affinity: 50, origin: "" }] });
await H.playTurn(g);
A.check("gender給enum外的值：不採用", ev("state.characters.find(c=>c.name==='張小安').gender") === null);

// 性別不變
override = () => ({ character_updates: [{ name: "林子涵", affinity_delta: 2, gender: "男" }] });
await H.playTurn(g);
A.check("character_updates不能改性別", ev("state.characters.find(c=>c.name==='林子涵').gender") === "女");
override = () => ({});

// payload帶gender
await H.playTurn(g);
const msg = lastPayload && JSON.stringify(lastPayload);
A.check("送AI的active_characters帶gender", msg && msg.includes("林子涵") && /林子涵[^}]*gender[^}]*女|gender[^}]*女[^}]*林子涵/.test(msg.replace(/\\"/g, '"')));

// 舊存檔補性別
ev("state.characters.forEach(c=>{ delete c.gender; })");
await H.playTurn(g);
A.check("舊存檔：家人卡依稱謂補上、同學維持null", ev("state.characters.filter(c=>/^(父親|母親)/.test(c.relation)).every(c=>c.gender)") && ev("state.characters.find(c=>c.name==='林子涵').gender") === null);

// 傳承：另一位家長稱謂依配偶性別
ev(`state.characters.push({name:'阿偉',relation:'配偶',gender:'男',romanceStatus:'married',cohabiting:true,affinity:70,active:true,traits:'',summary:'',lastTurn:0},
    {name:'小寶',relation:'兒子',gender:'男',isChild:true,age:20,affinity:60,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});
    state.gender='男'; state.ending={ successionAvailable:true, lifeSummary:'', epitaph:'' }; state.phase='ending'`);
ev("succeedAsChild('小寶')");
A.check("同性配偶傳承：另一位家長仍是父親、性別男", ev("state.characters.filter(c=>c.name==='阿偉').every(c=>c.relation==='父親' && c.gender==='男')"), ev("JSON.stringify(state.characters.filter(c=>c.name==='阿偉'))"));

// prompt
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：new_characters schema有gender enum", /gender:\{type:"string", enum:\["男","女"\]/.test(prompt));
A.check("prompt：說明引用時必須一致", prompt.includes("引用時代名詞、稱呼、姓名都必須跟它一致"));

// mock長程
const gm = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "npcgenderm" });
gm.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(gm); gm.ev("state.ap.gift=100000");
for (let i = 0; i < 200; i++) await H.playTurn(gm);
A.check("mock 200回合：新角色都有性別、無錯誤", gm.errors.length === 0 && gm.ev("state.characters.filter(c=>['小林','阿哲','惠雯','子晴','阿凱','詩婷'].some(n=>c.name.startsWith(n))).every(c=>c.gender==='男'||c.gender==='女')"));

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
