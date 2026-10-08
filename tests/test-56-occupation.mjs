// 2026-09-30：四、4.9 人物的職業／就學欄（全程mock，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("4.9 人物的職業／就學欄");
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "occ0000001" });
const ev = g.ev, doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };

await H.startNewLife(g);
await H.playTurn(g, "嗯");

const add = (o) => ev(`state.characters.push(Object.assign({gender:'男',affinity:50,active:true,traits:'',summary:'',lastTurn:state.turnCount}, ${JSON.stringify(o)}))`);
const label = (name) => ev(`npcOccupationLabel(state, state.characters.find(c=>c.name===${JSON.stringify(name)}))`);
const payloadRow = (name) => JSON.parse(ev("buildUserMessage('去上學', false, {structured:true,label:'x'})")).active_characters.find(c => c.name === name);
const withRandom = (v, code) => ev(`(()=>{ const r = Math.random; Math.random = ()=>${v}; try{ return (${code}); } finally { Math.random = r; } })()`);

// ---------- 4.9.1 顯示位置 ----------
add({ name: "父測零", relation: "父親", occupation: "自由接案", age: 46, origin: "父母，從出生起" });
ev("renderNpcDetailModal('父測零')");
const occEl = doc.getElementById("npc-occupation");
const html = doc.getElementById("npc-detail-modal").innerHTML;
A.check("4.9.1 人物詳細頁有「職業：」一行，放在「目前關係」下方", occEl && occEl.textContent === "職業：自由接案" && html.indexOf("目前關係") < html.indexOf("npc-occupation"), html.slice(0, 400));
doc.getElementById("npc-detail-modal").remove();

// ---------- 4.9.3 父母 ----------
add({ name: "父測甲", relation: "父親", occupation: "白領上班族", age: 45, origin: "父母，從出生起" });
add({ name: "母測乙", relation: "母親", gender: "女", occupation: "長期不在身邊", age: 44, origin: "父母，從出生起" });
add({ name: "父測丙", relation: "繼父", occupation: "自營業者", age: 70, retired: true });
add({ name: "祖測丁", relation: "祖父", occupation: "軍公教警消", age: 80, retired: true, deceased: true, active: false });
A.check("4.9.3 父母顯示開局職業", label("父測甲") === "白領上班族", label("父測甲"));
A.check("4.9.3「長期不在身邊」顯示「在外地工作」", label("母測乙") === "在外地工作", label("母測乙"));
A.check("4.9.3 已退休寫「已退休（原本是○○）」", label("父測丙") === "已退休（原本是自營業者）", label("父測丙"));
A.check("4.9.3 已故保留原本的職業", label("祖測丁") === "軍公教警消", label("祖測丁"));
A.check("4.9.7 父母職業每回合傳給AI", (payloadRow("父測甲") || {}).school_or_job === "白領上班族", payloadRow("父測甲"));

// ---------- 4.9.2 兄弟姊妹依年齡 ----------
add({ name: "弟測一", relation: "弟弟", age: 5, cohabiting: true });
add({ name: "弟測二", relation: "弟弟", age: 10, cohabiting: true });
add({ name: "姊測三", relation: "姊姊", gender: "女", age: 16, cohabiting: true });
A.check("4.9.2 未滿6歲「還沒上學」、國小、高中", label("弟測一") === "還沒上學" && label("弟測二") === "讀國小" && label("姊測三") === "讀高中", [label("弟測一"), label("弟測二"), label("姊測三")]);
A.check("4.9.7 主角在讀高中時，傳給AI的同讀高中手足補「不同校」(B8)", /^讀高中（跟你不同校/.test((payloadRow("姊測三") || {}).school_or_job || ""), payloadRow("姊測三"));

// ---------- 4.9.5 出路 ----------
add({ name: "哥測四", relation: "哥哥", age: 18 });
add({ name: "哥測五", relation: "哥哥", age: 19 });
withRandom(0.1, "updateFamilyPath(state.characters.find(c=>c.name==='哥測四'))");
withRandom(0.95, "updateFamilyPath(state.characters.find(c=>c.name==='哥測五'))");
A.check("4.9.5 滿18歲擲到讀大學：顯示「讀大學」", label("哥測四") === "讀大學", js("state.characters.find(c=>c.name==='哥測四').path"));
const p5 = js("state.characters.find(c=>c.name==='哥測五').path");
A.check("4.9.5 擲到工作：同時擲職業類別與具體職業、顯示具體職業(2026-10-08)", p5 && p5.stage === "work" && !!p5.job && label("哥測五") === p5.job, [p5, label("哥測五")]);
ev("(()=>{ const c = state.characters.find(c=>c.name==='哥測四'); c.age = 22; updateFamilyPath(c); })()");
const p4 = js("state.characters.find(c=>c.name==='哥測四').path");
A.check("4.9.5 讀大學的滿22歲畢業，擲職業類別", p4 && p4.stage === "work" && !!p4.category && label("哥測四") !== "讀大學", p4);
add({ name: "姊測六", relation: "姊姊", gender: "女", age: 17 });
ev("updateFamilyPaths(state)");
A.check("4.9.5 未滿18歲不擲出路", !js("state.characters.find(c=>c.name==='姊測六').path"));
const rolled = js(`(()=>{ const out = { college:0, work:0, politics:0 }; for(let i=0;i<4000;i++){ const c = { relation:'哥哥', age:18 }; updateFamilyPath(c); out[c.path.stage]++; } for(let i=0;i<500;i++){ if(/政治/.test(rollFamilyWorkCategory())) out.politics++; } return out; })()`);
A.check("4.9.5 讀大學約80%(4000次落在0.77～0.83)", rolled.college / 4000 > 0.77 && rolled.college / 4000 < 0.83, rolled);
A.check("4.9.5 職業類別不含「政治人物子女(自身從政)」", rolled.politics === 0, rolled);
// ---------- 5.2.5 家長職業加權（2026-10-08） ----------
const occDist = js(`(()=>{ const a={}, b={}; for(let i=0;i<10000;i++){ const x=rollParentOccupation(false).label; a[x]=(a[x]||0)+1; const y=rollParentOccupation(true).label; b[y]=(b[y]||0)+1; } return {a,b}; })()`);
const near = (n, pct, tol) => Math.abs(n / 100 - pct) <= tol;
A.check("5.2.5 家長職業加權：白領30%、勞力25%、自營15%（10000次，±2.5%）", near(occDist.a["白領上班族"], 30, 2.5) && near(occDist.a["勞力/服務業"], 25, 2.5) && near(occDist.a["自營業者"], 15, 2.5), occDist.a);
A.check("5.2.5 政治人物約2%（±1%），不再12.5%", near(occDist.a["政治人物"] || 0, 2, 1), occDist.a);
A.check("5.2.5 排除政治人物時完全不出現，其餘按比例放大", !occDist.b["政治人物"] && near(occDist.b["白領上班族"], 30.6, 2.5), occDist.b);
A.check("5.2.5 八類權重合計100", ev("PARENT_OCCUPATIONS.reduce((s,o)=>s+o.weight,0)") === 100);
A.check("4.9.5 開局已22歲以上直接擲職業類別", js(`(()=>{ const c = { relation:'姊姊', age:25 }; updateFamilyPath(c); return c.path.stage; })()`) === "work");
add({ name: "弟測七", relation: "弟弟", age: 20, affiliation: "休學去當兵" });
ev("updateFamilyPaths(state)");
A.check("4.9.5 劇情交代過的出路優先，程式不擲", label("弟測七") === "休學去當兵" && !js("state.characters.find(c=>c.name==='弟測七').path"));
add({ name: "女測八", relation: "女兒", gender: "女", isChild: true, age: 19 });
ev("(()=>{ const c = state.characters.find(c=>c.name==='女測八'); delete c.path; migrateLoadedState(state); })()");
A.check("4.9.5 舊存檔載入時補擲出路(子女也適用)", !!js("state.characters.find(c=>c.name==='女測八').path"));
add({ name: "妹測生日", relation: "妹妹", gender: "女", age: 17 });
const bd = js(`(()=>{ const cal = state.timeState.cal, d = cal.ageDay + 1, dt = calAbsToDate(d); const ageBefore = state.age; state.birthday = { m: dt.m, d: dt.d }; const n = syncBirthdayAge(state, d); const c = state.characters.find(c=>c.name==='妹測生日'); return { n, age: c.age, path: c.path || null }; })()`);
A.check("4.9.5 跨過生日滿18歲那天就擲出路(走syncBirthdayAge)", bd.n === 1 && bd.age === 18 && !!bd.path, bd);
const cashBefore = ev("state.cash");
ev("updateFamilyPaths(state)");
A.check("4.9.5 出路不影響數值(現金不變)", ev("state.cash") === cashBefore);

// ---------- 4.9.4 顯示名稱 ----------
const names = js(`OCCUPATION_CATEGORIES.map(o=>occupationDisplayName(o.key))`);
A.check("4.9.4 八種職業類別的顯示名稱", JSON.stringify(names) === JSON.stringify(["自己做生意", "上班族", "勞力/服務業", "待業中", "在外地工作", "自由接案", "軍公教警消", "從政"]), names);
add({ name: "配測九", relation: "配偶", gender: "女", romanceStatus: "married" });
ev("state.spouseOccupationCategory = '受雇專業/白領類'");
A.check("4.9.2 配偶顯示結婚時擲出的職業類別", label("配測九") === "上班族", label("配測九"));

// ---------- 4.9.6 同學 ----------
add({ name: "同測十", relation: "同學" });
add({ name: "同測十一", relation: "隔壁班同學" });
add({ name: "同測十二", relation: "同學的姊姊", gender: "女" });
A.check("4.9.6 同學依主角階段寫「讀高中（跟你同校）」", label("同測十") === "讀高中（跟你同校）" && label("同測十一") === "讀高中（跟你同校）", [label("同測十"), label("同測十一")]);
A.check("4.9.6「同學的姊姊」不算同學：顯示未知", label("同測十二") === "未知", label("同測十二"));
A.check("4.9.7「未知」不傳school_or_job給AI", payloadRow("同測十二") && payloadRow("同測十二").school_or_job === undefined, payloadRow("同測十二"));

// ---------- 其他 ----------
add({ name: "事測十三", relation: "同事" });
add({ name: "師測十四", relation: "數學老師" });
add({ name: "友測十五", relation: "網友" });
A.check("4.9.2 同事「跟你同公司」、老師寫身分", label("事測十三") === "跟你同公司" && label("師測十四") === "數學老師", [label("事測十三"), label("師測十四")]);
A.check("4.9.2 推不出來寫「未知」", label("友測十五") === "未知", label("友測十五"));
ev("applyCharacterConsistencyUpdate(state, state.characters.find(c=>c.name==='友測十五'), { affiliation_update:'在書店打工' })");
A.check("4.9.2 劇情交代後改顯示新內容", label("友測十五") === "在書店打工", label("友測十五"));

A.check("頁面沒有腳本錯誤", g.errors.length === 0, g.errors.slice(0, 2).map(String));
process.exit(A.report() ? 0 : 1);
