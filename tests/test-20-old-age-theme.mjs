// 2026-09-27：十三、13.7.2 老年主題池（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("13.7.2 老年主題池");
let lastBody = "";
let override = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => { lastBody = JSON.stringify(p); return override(p, b); } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "oldage0001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;

A.check("60歲以前：沒有主題", ev("(state.age=59, computeOldAgeTheme(state))") === null);
const dist = (age) => JSON.parse(ev(`JSON.stringify((()=>{ state.age=${age}; state.recentTones=[]; const c={body:0,relation:0,meaning:0,affairs:0}; for(let i=0;i<8000;i++) c[computeOldAgeTheme(state).axis]++; Object.keys(c).forEach(k=>c[k]=c[k]/8000); return c; })())`));
const d65 = dist(65), d85 = dist(85);
A.check("60-69比重≈20/30/35/15", Math.abs(d65.body - 0.2) < 0.02 && Math.abs(d65.relation - 0.3) < 0.02 && Math.abs(d65.meaning - 0.35) < 0.02 && Math.abs(d65.affairs - 0.15) < 0.02, d65);
A.check("80歲以後比重≈35/35/15/15", Math.abs(d85.body - 0.35) < 0.02 && Math.abs(d85.relation - 0.35) < 0.02 && Math.abs(d85.meaning - 0.15) < 0.02, d85);
A.check("素材不含系統判定事件(退休/長照/喪偶/過世)", ev("JSON.stringify(OLD_AGE_BACKBONES)").match(/退休|長照|喪偶|過世/) === null);
const br = JSON.parse(ev(`JSON.stringify((()=>{ state.age=85; state.recentTones=['heavy','unsettling']; let body=0, need=true; for(let i=0;i<3000;i++){ const t=computeOldAgeTheme(state); if(t.axis==='body') body++; need = need && t.need_breather; } return {body, need}; })())`));
A.check("前兩回合都沉重：need_breather且不抽身體與醫療", br.need === true && br.body === 0, br);
ev("state.recentTones=['heavy','warm']");
A.check("只有一回合沉重：不需喘息", ev("computeOldAgeTheme(state).need_breather") === false);
// 回合流程：recentTones記錄、payload帶old_age_theme
ev("state.age=70; state.recentTones=[]");
override = () => ({ emotional_tone: "heavy" });
await H.playTurn(g);
A.check("payload帶old_age_theme", /old_age_theme[^}]*axis_label/.test(lastBody.replace(/\\"/g, '"')));
A.check("recentTones記下這回合語氣", ev("state.recentTones.slice(-1)[0]") === "heavy");
override = () => ({});
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：old_age_theme與need_breather說明", prompt.includes("old_age_theme") && prompt.includes("need_breather"));
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
