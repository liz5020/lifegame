// 2026-09-27：五、5.2.6 單親離異另一方角色卡＋父母狀態機不因降級停擺（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("5.2.6 離異另一方＋父母狀態機");
H.installUpstream(H.makeFakeAnthropic({}));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "divorced01" });
await H.startNewLife(g);
const ev = g.ev;

// 大量開局統計
const stats = JSON.parse(ev(`(()=>{
  let divorced=0, withCard=0, badCard=0, politicianFromAbsent=0, others=0, othersWithNonResident=0;
  for(let i=0;i<3000;i++){
    const st = newRoll(null,{name:'測試',gender:'女'});
    const nonRes = st.characters.filter(c=>/不同住/.test(c.relation||''));
    if(st.familyStructure==='單親－離異'){
      divorced++;
      const resident = st.characters.filter(c=>c.origin==='父母，從出生起' && c.cohabiting);
      if(nonRes.length===1){
        withCard++;
        const c = nonRes[0];
        const okGender = (/^父親/.test(c.relation) && c.gender==='男') || (/^母親/.test(c.relation) && c.gender==='女');
        const opposite = resident.length===1 && resident[0].relation.slice(0,2)!==c.relation.slice(0,2);
        if(c.cohabiting!==false || !okGender || !opposite || c.affinity<0 || c.affinity>70 || c.name===resident[0].name) badCard++;
        if(c.occupation==='政治人物') politicianFromAbsent++;
      }
    } else { others++; if(nonRes.length) othersWithNonResident++; }
  }
  return JSON.stringify({divorced, withCard, badCard, politicianFromAbsent, others, othersWithNonResident});
})()`));
const ratio = stats.withCard / stats.divorced;
A.check("單親離異約60%有另一方角色卡", ratio > 0.5 && ratio < 0.7, stats);
A.check("另一方卡：不同住、性別對、跟同住家長相反、名字不重複", stats.badCard === 0, stats);
A.check("另一方職業不會是政治人物", stats.politicianFromAbsent === 0);
A.check("其他家庭結構不會出現不同住家長", stats.othersWithNonResident === 0);

// 父母狀態機：降級(active=false)的父母仍會推進
ev(`state.characters = state.characters.filter(c=>c.origin!=='父母，從出生起' && c.origin!=='隔代教養，從出生起');
    state.characters.push({name:'老爸',relation:'父親',gender:'男',origin:'父母，從出生起',healthStage:1,age:104,affinity:60,active:false,cohabiting:false,traits:'',summary:'',lastTurn:0});
    state.age=60`);
ev("ageChildren(state,1); rollParentHealthStageAdvance(state)");
A.check("降為背景角色的父母到105歲仍會過世(原本會被跳過)", ev("state.characters.find(c=>c.name==='老爸').deceased") === true);
ev(`state.characters.push({name:'老媽',relation:'母親',gender:'女',origin:'父母，從出生起',healthStage:1,age:80,affinity:60,active:false,cohabiting:false,traits:'',summary:'',lastTurn:0}); state.pendingEldercareDecision=null`);
ev("Math.__r=Math.random; Math.random=()=>0; rollParentHealthStageAdvance(state); Math.random=Math.__r");
A.check("降為背景角色的父母健康階段會推進並跳照顧決策", ev("state.characters.find(c=>c.name==='老媽').healthStage") === 2 && ev("state.pendingEldercareDecision && state.pendingEldercareDecision.parentName") === "老媽");
ev("state.pendingEldercareDecision=null");

// 13.6：離異不同住的另一方不套用照顧負荷提前
ev(`state.characters = state.characters.filter(c=>c.origin!=='父母，從出生起' && c.origin!=='隔代教養，從出生起');
    state.characters.push({name:'媽媽',relation:'母親',gender:'女',origin:'父母，從出生起',healthStage:1,age:70,affinity:60,active:true,cohabiting:true,traits:'',summary:'',lastTurn:0},
      {name:'爸爸',relation:'父親（不同住）',gender:'男',origin:'父母，從出生起',healthStage:1,age:72,affinity:40,active:true,cohabiting:false,traits:'',summary:'',lastTurn:0})`);
ev("finalizeParentDeath(state,'媽媽')");
A.check("同住家長過世：不同住的前配偶不被提前一階", ev("state.characters.find(c=>c.name==='爸爸').healthStage") === 1 && ev("state.parentDeathEventLog.other_parent") === null);

// prompt
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：說明不同住與長期失聯", prompt.includes("不同住") && prompt.includes("長期失聯"));

// 抽到離異有卡的開局，正常玩幾回合
let found = false;
for (let i = 0; i < 200 && !found; i++) {
  ev("state = newRoll(null,{name:'林小晴',gender:'女'}); state.spendingHabit='普通'; state.mealArrangement=state.mealArrangement||'家裡煮';");
  found = ev("state.characters.some(c=>/不同住/.test(c.relation||''))");
}
await g.ev("startLife()"); H.clickModals(g.win);
for (let i = 0; i < 20; i++) await H.playTurn(g);
A.check("離異有卡的開局正常進行20回合", found && ev("state.turnCount") >= 20 && g.errors.length === 0, { found, t: ev("state.turnCount") });

const ok = A.report();
process.exit(ok ? 0 : 1);
