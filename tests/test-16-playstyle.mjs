// 2026-09-26：十六、16.2 隱性行為傾向追蹤playStyle（建議一，【草案】）
// 第一部分：直接呼叫各結構化節點的resolve函式，確認每個計數規則；第二部分：mock長程模擬三種「玩法」，看計數有沒有跟著玩法分開
import * as H from "./harness.mjs";
const A = H.makeAsserter("十六 playStyle隱性計數");
const env = H.makeEnv();
const g = await H.loadGame({ useMock: true, env, key: "pstyle01" });
g.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
await H.startNewLife(g);
g.ev("state.ap.gift=100000");
const P = () => g.ev("JSON.parse(JSON.stringify(state.playStyle))");
const reset = () => g.ev("state.playStyle = newPlayStyle()");

A.check("新人生有playStyle且全為0", JSON.stringify(P()) === JSON.stringify(g.ev("newPlayStyle()")));

// 面對風險
reset();
g.ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.jobLevel=3");
g.ev("resolveCareerForkOffer(state,'stay')");
A.check("職級封頂選維持現狀：risk−1", P().risk === -1 && P().riskEvents === 1, P());
g.ev("state.pendingJobSearch=null; resolveCareerForkOffer(state,'transfer')");
A.check("職級封頂選轉職：risk+1", P().risk === 0 && P().riskEvents === 2, P());
reset();
g.ev("resolveCareerForkOffer(state,'startup')");
A.check("職級封頂選創業：岔路本身不計(留給啟動時計)", P().riskEvents === 0, P());
reset();
g.ev("resolvePromotionOffer(state,false)");
A.check("拒絕升遷：risk−1", P().risk === -1, P());
g.ev("resolvePromotionOffer(state,true)");
A.check("接受升遷：risk+1", P().risk === 0 && P().riskEvents === 2, P());
reset();
g.ev("state.careerStatus=CAREER_STATUS.JOB_SEARCHING; state.jobSearchStreak=0; computeHireProbability = ()=>30");
g.ev("resolveJobApplication(state,'自由/創作類',false,{})");
A.check("投遞錄取機率30%的方向：risk+1", P().risk === 1, P());
g.ev("state.jobSearchStreak=0; computeHireProbability = ()=>80; resolveJobApplication(state,'軍公教/警消類',false,{})");
A.check("投遞錄取機率80%的方向：risk−1", P().risk === 0 && P().riskEvents === 2, P());
g.ev("state.jobSearchStreak=0; computeHireProbability = ()=>60; resolveJobApplication(state,'勞力/服務類',false,{})");
A.check("錄取機率介於50~70%：不計", P().riskEvents === 2, P());
g.ev("state.jobSearchStreak=JOB_SEARCH_STREAK_FALLBACK; resolveJobApplication(state,'自由/創作類',false,{})");
A.check("保底offer(沒有選擇空間)：不計", P().riskEvents === 2, P());
reset();
g.ev("state.businessStatus='經營中'; resolveBusinessContinuation(state,'persist')");
A.check("連續虧損選硬撐：risk+1", P().risk === 1, P());
g.ev("state.businessContinuationCooldown=0; resolveBusinessContinuation(state,'close')");
A.check("連續虧損選收攤：risk−1且記下一次挫折(job_loss)", P().risk === 0 && P().pendingSetback && P().pendingSetback.type === "job_loss", P());

// 規則與自由度
reset();
g.ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.cash=1e9; launchBusiness(state)");
A.check("在職時辭職創業：risk+1、deviation+1", P().risk === 1 && P().deviation === 1, P());
reset();
g.ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.jobSearchStreak=0; computeHireProbability = ()=>60; resolveJobApplication(state,'勞力/服務類',true,{})");
A.check("轉職投遞：deviation+1", P().deviation === 1, P());
reset();
g.ev("state.stats.knowledge=50; resolveTransferOffer(state,'apply', MAJOR_CATEGORIES[0].key)");
A.check("申請轉系：deviation+1、risk+1", P().deviation === 1 && P().risk === 1, P());
g.ev("resolveTransferOffer(state,'stay')");
A.check("不轉系：risk−1、deviation不變", P().deviation === 1 && P().risk === 0, P());
reset();
g.ev("isAnotherLeaveFeasible = ()=>true; state.timeState.segmentIndex = state.timeState.segmentIndex||0; resolveWithdrawalOffer(state,'leave')");
A.check("休學：deviation+1", P().deviation === 1, P());
g.ev("state.leaveStatus='normal'; resolveWithdrawalOffer(state,'stay')");
A.check("撐下去：deviation不變", P().deviation === 1, P());

// 人際與界線
reset();
g.ev("state.characters.push({name:'測試伴侶',relation:'伴侶',affinity:50,active:true,lastTurn:0,romanceStatus:'married'})");
g.ev("resolveRelationshipInvestment(state,'測試伴侶','invest_time')");
A.check("投入時間陪伴侶：relation+1", P().relation === 1, P());
g.ev("resolveRelationshipInvestment(state,'測試伴侶','maintain_status_quo')");
A.check("維持現狀：不計", P().relation === 1 && P().relationEvents === 1, P());
g.ev("resolveRelationshipInvestment(state,'測試伴侶','divert_elsewhere')");
A.check("把時間轉到別處：relation−1", P().relation === 0 && P().relationEvents === 2, P());
g.ev("resolveMarriageCrisis(state,'測試伴侶','repair')");
A.check("婚姻危機選修復：relation+1", P().relation === 1, P());
g.ev("resolveMarriageCrisis(state,'測試伴侶','divorce'); state.pendingDivorceSettlement=null");
A.check("婚姻危機選離婚：relation−1", P().relation === 0 && P().relationEvents === 4, P());

// 面對錯誤
reset();
g.ev("state.careerStatus=CAREER_STATUS.JOB_SEARCHING; markPlayStyleSetback(state,'job_loss','受雇專業/白領類'); state.jobSearchStreak=0; computeHireProbability = ()=>60");
g.ev("resolveJobApplication(state,'受雇專業/白領類',false,{})");
A.check("失業後投回同一類工作：算「重來」", P().setback.retry === 1 && !P().pendingSetback, P());
g.ev("markPlayStyleSetback(state,'job_loss','受雇專業/白領類'); state.jobSearchStreak=0; resolveJobApplication(state,'自由/創作類',false,{})");
A.check("失業後換一類工作：算「轉向」", P().setback.pivot === 1, P());
g.ev("markPlayStyleSetback(state,'exam_fail',null); resolveTransferOffer(state,'stay')");
A.check("考試失利後留在原系：算「重來」", P().setback.retry === 2, P());
g.ev("markPlayStyleSetback(state,'exam_fail',null); isAnotherLeaveFeasible = ()=>true; resolveWithdrawalOffer(state,'leave'); state.leaveStatus='normal'");
A.check("考試失利後休學：算「休息」", P().setback.rest === 1, P());
g.ev("markPlayStyleSetback(state,'exam_fail',null); resolveJobApplication(state,'自由/創作類',false,{})");
A.check("考試失利後的求職不算考試挫折的回應(類型不符，挫折保留)", P().setback.pivot === 1 && P().pendingSetback && P().pendingSetback.type === "exam_fail", P());
g.ev("state.turnCount += PLAYSTYLE_SETBACK_WINDOW_TURNS+1; resolveTransferOffer(state,'stay')");
A.check("超過24回合才做的選擇：挫折過期、不計", P().setback.retry === 2 && !P().pendingSetback, P());
g.ev("markPlayStyleSetback(state,'business',null); state.cash=1e9; state.careerStatus=CAREER_STATUS.UNEMPLOYED");
g.ev("markPlayStyleSetback(state,'job_loss','自營/家庭事業類'); launchBusiness(state)");
A.check("收攤後再創業：算「重來」", P().setback.retry === 3, P());

// 效率與控制感＋長期關注（走真正的回合流程）
reset();
const skipsBefore = P().skips;
g.ev("state.studentStatus=null; state.timeState.stageMode='highschool'");
const segBefore = g.ev("state.timeState.segmentIndex");
await H.playTurn(g, "跳過這段時間");
A.check("學生期輸入跳過指令：skips+1", P().skips === skipsBefore + 1, { p: P(), segBefore, segAfter: g.ev("state.timeState.segmentIndex") });
await H.playTurn(g, "去圖書館念書");
A.check("一般行動：skips不變", P().skips === skipsBefore + 1, P());
reset();
g.ev("applyInterestEvent(state,{category:INTEREST_CATEGORIES[0],reaction:'positive'})");
g.ev("state.turnCount += 30; applyInterestEvent(state,{category:INTEREST_CATEGORIES[0],reaction:'positive'})");
g.ev("applyInterestEvent(state,{category:INTEREST_CATEGORIES[1],reaction:'positive'})");
A.check("長期關注：記下持續最久的興趣(30回合)", P().longestInterest && P().longestInterest.turns === 30 && P().longestInterest.category === g.ev("INTEREST_CATEGORIES[0]"), P());

// 反悔：這回合的計數一起撤銷
reset();
g.ev("state.undosLeft=3");
await H.playTurn(g, "跳過這段時間");
const afterSkip = P().skips;
g.ev("restoreUndo()");
A.check("反悔上一步：跳過次數回到反悔前", afterSkip === 1 && P().skips === 0, { afterSkip, now: P() });

// 不送給AI、不影響判定
const payload = g.ev("JSON.stringify(buildUserMessage ? buildUserMessage('繼續過日子', false, {structured:true,label:'x',monthsCrossed:0}) : '')");
A.check("送給AI的payload不含playStyle", !/playStyle|play_style/.test(payload));
const src = g.ev("document.documentElement.outerHTML");
const reads = (src.match(/\.playStyle\b/g) || []).length;
const readsInLogic = (src.match(/state\.playStyle\.(risk|deviation|relation|setback|skips)\s*[<>=]/g) || []).length;
A.check("沒有任何判定邏輯讀取playStyle的數值", readsInLogic === 0, { reads, readsInLogic });

// 舊存檔：沒有playStyle欄位也能正常玩
g.ev("delete state.playStyle");
await H.playTurn(g, "去圖書館念書");
A.check("舊存檔(沒有playStyle)：一般回合照常進行", g.errors.length === 0, g.errors.map(String).slice(0, 2));
await H.playTurn(g, "跳過這段時間");
A.check("舊存檔：第一次計數時自動補上playStyle", g.errors.length === 0 && g.ev("state.playStyle && state.playStyle.skips") === 1, g.ev("JSON.stringify(state.playStyle||null)"));

// 第二部分：mock長程模擬，三種玩法
function makeClicker(policy) {
  // 模擬真人：每個彈窗只選一個選項；選項本身就關掉彈窗時(例如升遷的「維持現狀」)不再去按確認鍵
  return (win) => {
    for (let i = 0; i < 20; i++) {
      const bd = win.document.querySelector(".modal-backdrop");
      if (!bd) return;
      const visible = [...bd.querySelectorAll("button")].filter(b => { let el = b; while (el && el !== bd) { if (el.style && el.style.display === "none") return false; el = el.parentElement; } return !b.disabled; });
      const opts = visible.filter(b => !b.classList.contains("primary-btn"));
      const confirm = visible.find(b => b.classList.contains("primary-btn"));
      const before = bd.innerHTML;
      if (opts.length) {
        const idx = policy === "first" ? 0 : policy === "last" ? opts.length - 1 : Math.floor(Math.random() * opts.length);
        opts[idx].click();
        if (!win.document.body.contains(bd)) continue;
      }
      if (confirm) confirm.click(); else if (!opts.length) { bd.remove(); continue; }
      if (win.document.body.contains(bd) && bd.innerHTML === before) bd.remove();
    }
  };
}
const sims = [];
for (const policy of ["first", "last", "random"]) {
  for (let life = 0; life < 2; life++) {
    const gs = await H.loadGame({ useMock: true, env: H.makeEnv(), key: `psim${policy}${life}` });
    gs.ev("mockCallAI = async (a,f,t)=>mockGenerateTurn(a,f,t)");
    await H.startNewLife(gs);
    gs.ev("state.ap.gift=100000; state.age<0");
    const click = makeClicker(policy);
    click(gs.win);
    for (let i = 0; i < 900 && gs.ev("state.phase") === "playing"; i++) {
      const t = (policy !== "first" && Math.random() < (policy === "last" ? 0.08 : 0.03)) ? "跳過這段時間" : gs.ev("(state.choices&&state.choices[Math.floor(Math.random()*state.choices.length)])||'繼續過日子'");
      const r = await Promise.race([gs.ev(`takeTurn(${JSON.stringify(t)}, AP_COST_PER_TURN)`).then(() => "done"), new Promise(res => setTimeout(() => res("HANG"), 15000))]);
      if (r === "HANG") { gs.errors.push("回合卡住超過15秒"); break; }
      click(gs.win);
      if (gs.errors.length) break;
    }
    sims.push({ policy, life, turns: gs.ev("state.turnCount"), age: gs.ev("state.age"), phase: gs.ev("state.phase"), errors: gs.errors.length, ps: gs.ev("JSON.parse(JSON.stringify(state.playStyle||null))") });
  }
}
console.log("\n--- mock長程模擬（每種玩法2條人生，最多900回合）---");
sims.forEach(x => console.log(`${x.policy}#${x.life}｜${x.turns}回合 ${x.age}歲 ${x.phase}｜risk ${x.ps.risk}/${x.ps.riskEvents}次 dev ${x.ps.deviation} rel ${x.ps.relation}/${x.ps.relationEvents}次 setback 重來${x.ps.setback.retry}/轉向${x.ps.setback.pivot}/休息${x.ps.setback.rest} skips ${x.ps.skips} 興趣${x.ps.longestInterest ? x.ps.longestInterest.category + x.ps.longestInterest.turns + "回合" : "無"}`));
A.check("長程模擬：6條人生都沒有錯誤", sims.every(x => x.errors === 0), sims.map(x => x.errors));
A.check("長程模擬：有做選擇的玩法(last/random)都有累積到計數", sims.filter(x => x.policy !== "first").every(x => x.ps && (x.ps.riskEvents + x.ps.deviation + x.ps.relationEvents + x.ps.skips) > 0));
const avg = (pol, f) => { const xs = sims.filter(x => x.policy === pol); return xs.reduce((a, x) => a + f(x.ps), 0) / xs.length; };
A.check("長程模擬：常輸入跳過的玩法，skips明顯高於從不跳過的玩法", avg("last", p => p.skips) > avg("first", p => p.skips) + 3, { last: avg("last", p => p.skips), first: avg("first", p => p.skips) });
const ok = A.report();
process.exit(ok ? 0 : 1);
