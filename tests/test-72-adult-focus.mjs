// 2026-10-04：出社會後的重心(二、2.6.7＋補充定案)、60歲起排序前三、比例加分、年度健康扣分、老年題材排除（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("出社會後的重心");
let override = () => ({});
let lastPayload = null;
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } }));
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "adfocus001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = `ap:${H.loc("adfocus001")}:0`; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
const btnText = (k) => { const b = doc.querySelector(`.focus-btn[data-focus='${k}']`); return b ? b.textContent : null; };
const hint = () => { const xs = [...doc.querySelectorAll(".focus-hint:not(.focus-title)")]; return xs.length ? xs[xs.length - 1].textContent : null; };
const lastLog = () => js("state.log[state.log.length-1]");

// ---------- 畢業那一回合(2.6.7.8) ----------
ev("state.focus='study'; state.studentStatus='graduated'; state.timeState.stageMode='career'; state.age=23; state.careerStatus=CAREER_STATUS.NOT_EMPLOYED; state.occupationCategory=null; state.focusAdultInit=false; render()");
A.check("畢業：讀書改稱進修", btnText("study") === "進修", btnText("study"));
A.check("畢業：預設選工作，子項取當下職涯狀態第一項(找工作)", ev("state.focus") === "work" && btnText("work") === "工作：找工作 ▾", [ev("state.focus"), btnText("work")]);
A.check("找工作的小字", hint() === "改履歷、投遞、面試，錄取比較有機會", hint());
A.check("求職期工作展開：找工作、打工", js("adultWorkOptions(state).map(o=>o.label)").join() === "找工作,打工");
override = () => ({});
ev("state.stats.knowledge=50");
await H.playTurn(g, "嗯");
const tf = lastPayload.turn_focus;
A.check("payload：出社會後的重心、工作子項、沒有打工收入的提示", tf && tf.adult === true && tf.label === "工作：找工作" && tf.no_part_time_income === true && /改履歷/.test(tf.scene_directive), tf);
A.check("出社會後沒有場景擲骰(18.1)", lastPayload.scene_plan == null);
A.check("出社會後回應也要評價(response_source)", lastPayload.response_source === "free_input");
A.check("找工作計入求職比例", js("state.focusRatio.search").n === 1 && js("state.focusRatio.search").hit === 1, js("state.focusRatio"));

// ---------- 打工入帳(三、3.4.2) ----------
ev("state.jobSearchPhase=null; state.pendingJobSearch=null; state.focus='rest'");
const cash0 = ev("state.cash");
await H.playTurn(g, "去便利商店打工");
A.check("重心不是打工、文字寫打工：不入帳", !ev("state.partTimeEventLog") && lastPayload.turn_focus.no_part_time_income === true);
ev("state.focus='work'; state.focusWorkId='part'");
await H.playTurn(g, "嗯");
const pt = js("state.partTimeEventLog");
A.check("求職期選「工作：打工」：時薪×時數入帳", pt && pt.earning > 0 && pt.hours >= 4, pt);
A.check("打工回合沒有「沒有打工收入」提示，附上收入", lastPayload.turn_focus.no_part_time_income === undefined && lastPayload.turn_focus.part_time && lastPayload.turn_focus.part_time.earning === pt.earning);
A.check("打工回合打工不計入求職比例", js("state.focusRatio.search").hit === 1 && js("state.focusRatio.search").n >= 3);
ev("state.jobSearchPhase=null; state.pendingJobSearch=null");

// ---------- 職涯狀態改變：子項換成新狀態第一項 ----------
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.monthlyIncome=40; state.focus='work'; render()");
A.check("錄取後：工作子項自動換成本業拚一點", btnText("work") === "工作：本業拚一點" && ev("state.focusWorkId") === "push", btnText("work"));
A.check("本業拚一點的小字", hint() === "多扛一點，升遷比較有機會；一年拚太兇身體會累", hint());
ev("state.characters.push({name:'王經理',relation:'主管',affinity:40,gender:'男',traits:'',active:true,lastTurn:state.turnCount})");
ev("resetLevelPeriod(state)");
const salary0 = ev("state.monthlyIncome");
await H.playTurn(g, "嗯");
A.check("本業拚一點：主管或同事一位關係＋1", ev("state.characters.find(c=>c.name==='王經理').affinity") === 41);
A.check("本業拚一點：場景指令是加班、多扛一件事", /加班/.test(lastPayload.turn_focus.scene_directive));
A.check("本業拚一點：計入職級期間與這一年的比例", js("state.focusRatio.level").push === 1 && js("state.focusRatio.year").push >= 1);
A.check("薪水不看重心(月收入不變)", ev("state.monthlyIncome") === salary0);
ev("state.careerStatus=CAREER_STATUS.UNEMPLOYED; state.occupationCategory=null; render()");
A.check("被裁員：本業拚一點自動換成找工作", ev("state.focusWorkId") === "search" && btnText("work") === "工作：找工作 ▾");
ev("state.focus='rest'; state.careerStatus=CAREER_STATUS.BUSINESS; render()");
A.check("重心不是工作：子項不換", ev("state.focusWorkId") === "search");
ev("state.focus='work'; render()");
A.check("經營事業：工作＝顧事業(找不到原子項時退回第一項)", btnText("work") === "工作：顧事業" && hint() === "顧店、顧客人、顧帳，營運比較穩；一年拚太兇身體會累", [btnText("work"), hint()]);
ev("state.careerStatus=CAREER_STATUS.SEMI_RETIRED; render()");
A.check("半退休：工作＝兼職", btnText("work") === "工作：兼職" && hint() === "做點兼差，賺點收入");
ev("state.careerStatus=CAREER_STATUS.RETIRED; state.interestCandidates=[]; render()");
A.check("完全退休、沒有副業：不顯示工作，只剩5顆", !btnText("work") && doc.querySelectorAll(".focus-btn[data-focus]").length === 5 && ev("state.focus") === "rest");
ev("state.interestCandidates=[{id:'hc',category:'手作工藝',status:'active',investment:50,sideBusinessStatus:'formal',lastEngagedRound:state.turnCount}]; render()");
A.check("完全退休、有副業：工作只列副業", btnText("work") === "工作：手作工藝" && js("adultWorkOptions(state).map(o=>o.kind)").join() === "gig");

// ---------- 比例加分(2.6.7.4)：只加不減、算在原本範圍內 ----------
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.conscientiousness.achievement=50");
const promo = (n, push) => js(`(ensureFocusRatio(state).level={n:${n},push:${push}}, promotionProbabilityBreakdown(state).total)`);
A.check("升遷：2/3以上＋10、1/3～2/3＋5、1/3以下不加、沒有回合不加", promo(3, 2) === 50 && promo(3, 1) === 45 && promo(3, 0) === 40 && promo(0, 0) === 40, [promo(3, 2), promo(3, 1), promo(3, 0)]);
const hire = (n, hit) => js(`(ensureFocusRatio(state).search={n:${n},hit:${hit}}, hireProbabilityBreakdown(state,'勞力/服務類',{}).total)`);
ev("state.stats.knowledge=50; state.stats.network=50; state.studentStatus='graduated'; state.collegeDelayYearsUsed=0; state.age=30; state.studentMajorGroup=null");
const h0 = hire(0, 0);
A.check("求職：2/3以上＋10、1/3～2/3＋5", hire(6, 4) === h0 + 10 && hire(6, 2) === h0 + 5 && hire(6, 1) === h0, [h0, hire(6, 4), hire(6, 2)]);
ev("state.stats.knowledge=100; state.stats.network=100; state.conscientiousness.achievement=100");
A.check("求職：加分後最高仍是90%", hire(6, 6) === 90);
ev("state.stats.knowledge=50; state.stats.network=50; state.conscientiousness.achievement=50");
// 創業營運：擲骰固定為100(一定落在虧損外的判斷不重要)，只比對probPct
const biz = (n, b) => js(`(ensureFocusRatio(state).year={n:${n},push:0,biz:${b}}, state.businessStatus='經營中', state.businessCapital=0, (()=>{ const r = rollAnnualBusinessCheck(state); return r.probPct; })())`);
const b0 = biz(0, 0);
A.check("創業營運：2/3以上＋5、1/3～2/3＋3", biz(3, 2) === b0 + 5 && biz(3, 1) === b0 + 3 && biz(3, 0) === b0, [b0, biz(3, 2), biz(3, 1)]);
ev("state.businessStatus=null; state.jobLevel=0; state.consecutiveLossYears=0; state.pendingBusinessContinuation=null");

// ---------- 年度健康扣分(2.6.7.5) ----------
const yearCost = (n, push, b) => js(`(state.stats.health=60, ensureFocusRatio(state).year={n:${n},push:${push},biz:${b}}, state.focusYearNote=null, settleFocusYear(state), [60-state.stats.health, state.focusYearNote, state.focusRatio.year.n])`);
const y1 = yearCost(9, 4, 2), y2 = yearCost(9, 2, 1), y3 = yearCost(9, 1, 1);
A.check("本業拚一點＋顧事業合併2/3以上：健康−3、附說明", y1[0] === 3 && y1[1] === "這一年工作拚得比較兇，身體有點吃不消（健康−3）" && y1[2] === 0, y1);
A.check("1/3～2/3：健康−1、附說明", y2[0] === 1 && y2[1] === "這一年工作偶爾多扛了一些，身體有點累（健康−1）", y2);
A.check("1/3以下：不扣", y3[0] === 0 && y3[1] === null, y3);
// 實際跨年：這一年最後一回合、這一年都在拚
ev("state.focus='work'; state.focusWorkId='push'; state.focusWorkStatus=state.careerStatus; state.stats.health=70; ensureFocusRatio(state).year={n:5,push:5,biz:0}; state.timeState.adultTurnsInYear=(state.timeState.careerYearBudget||roundsPerYearForAge(state.age))-1");
await H.playTurn(g, "嗯");
A.check("年度結算那一回合：日記多一行說明、健康−3", lastLog().focusNote === "這一年工作拚得比較兇，身體有點吃不消（健康−3）", lastLog().focusNote);
ev("render()");
A.check("畫面顯示年度說明", [...doc.querySelectorAll("#latest-entry .small-line")].some(p => p.textContent.includes("身體有點吃不消")));
await H.playTurn(g, "嗯");
A.check("說明只跟那一則日記", !lastLog().focusNote);

// ---------- 休息不超過健康年齡上限 ----------
ev("state.age=75; state.focusRank=['rest']; state.focus='rest'");
const cap = ev("computeHealthCap(state)");
ev(`state.stats.health=${cap - 1}`);
override = () => ({ stat_deltas: { health: 0, network: 0, expression: 0 } });
await H.playTurn(g, "嗯");
A.check("休息健康＋2但不超過健康年齡上限", ev("state.stats.health") <= cap && ev("state.stats.health") >= cap - 1, [cap, ev("state.stats.health")]);
ev("state.age=40; state.focusRank=undefined; delete state.focusRank");

// ---------- 照顧家人(2.6.7.6、十三、13.5) ----------
ev("if(!state.characters.some(c=>familyRoleOf(c.relation)==='母親' && !c.deceased && !c.lost)) state.characters.push({name:'林媽媽',relation:'母親',affinity:50,gender:'女',traits:'',active:true,lastTurn:0,age:62}); const m=state.characters.find(c=>familyRoleOf(c.relation)==='母親' && !c.deceased && !c.lost); m.cohabiting=false; state.caringForParentName=m.name");
const mom = ev("state.caringForParentName");
if (mom) {
  ev("state.focus='work'; render()");
  A.check("照顧期間：家人按鈕改名「家人：照顧媽媽」，不自動選", btnText("family") === "家人：照顧媽媽" && ev("state.focus") === "work", btnText("family"));
  ev("state.focus='family'; render()");
  A.check("照顧的小字", hint() === "陪伴照顧，和媽媽更親近", hint());
  const aff0 = ev(`state.characters.find(c=>c.name===${JSON.stringify(mom)}).affinity`);
  await H.playTurn(g, "嗯");
  A.check("照顧：對象預設是被照顧的那位，關係＋2", lastPayload.turn_focus.family_targets.join() === mom && ev(`state.characters.find(c=>c.name===${JSON.stringify(mom)}).affinity`) >= aff0 + 2);
  A.check("照顧：場景指令是陪診、照料", /陪診/.test(lastPayload.turn_focus.scene_directive));
  ev("state.caringForParentName=null");
} else A.check("找到母親角色卡做照顧測試", false);

// ---------- 社交(三、3.5.5補充定案) ----------
ev("state.focus='social'; state.socialTurns=0");
await H.playTurn(g, "嗯");
A.check("出社會後社交也累積「朋友帶來的機會」", ev("state.socialTurns") === 1);

// ---------- 60歲生日：排序(2.6.7.7) ----------
ev("state.age=60; state.focus='study'; delete state.focusRank; render()");
A.check("60歲：原本單選的重心放在第1名，其他空著", js("state.focusRank").join() === "study");
const toast = doc.getElementById("writer-toast");
A.check("60歲：跳撰稿人訊息", toast && toast.textContent === "人生走到下半場，日子不再只繞著一件事轉。從現在起，你可以依序點選最多三個重心，排在越前面的越常發生。");
const click = (k) => { doc.querySelector(`.focus-btn[data-focus='${k}']`).click(); };
click("social"); click("rest");
A.check("依序點選：按鈕出現1、2、3", js("state.focusRank").join() === "study,social,rest" && doc.querySelector(".focus-btn[data-focus='rest'] .focus-rank").textContent === "3");
click("family");
A.check("最多三個", js("state.focusRank").length === 3);
click("social");
A.check("再點一次拿掉，後面的往前補", js("state.focusRank").join() === "study,rest");
click("social");
// 擲骰：Math.random固定0.5 → 第2名(60%)發生、第3名(30%)沒發生
ev("window.__rnd=Math.random; Math.random=()=>0.5; state.healthyTurnsThisYear=0; state.stats.knowledge=50; state.stats.health=50; state.socialTurns=0");
override = () => ({ event_type: null });
await H.playTurn(g, "嗯");
ev("Math.random=window.__rnd");
const ri = lastPayload.turn_focus.ranked_items;
A.check("排序回合：AI拿到每一名有沒有發生(第2名60%中、第3名30%沒中)", ri && ri.map(x => x.label).join() === "進修,休息,社交" && ri.map(x => x.occurred).join() === "true,true,false", ri);
A.check("排序制：休息排入名次且發生，算健康經營回合", ev("state.healthyTurnsThisYear") >= 1);
A.check("發生的給全額：第1名進修才識成長、第2名休息健康＋2；沒發生的社交不給", ev("state.stats.knowledge") > 50 && ev("state.stats.health") >= 52 && ev("state.socialTurns") === 0, [ev("state.stats.knowledge"), ev("state.stats.health"), ev("state.socialTurns")]);
A.check("60歲起：重心只寫進時間流逝段，不另外加字數", /時間流逝/.test(lastPayload.turn_focus.scene_directive) && !lastPayload.narrative_length_guide.focus_extra_words, lastPayload.narrative_length_guide);
A.check("日記記下發生的幾件", lastLog().focusLabel === "進修、休息", lastLog().focusLabel);

ev("state.focusRank=['study','social','rest']; window.__rnd=Math.random; Math.random=()=>0.5; state.healthyTurnsThisYear=0");
override = () => ({ stat_deltas: { health: 0, network: 0, expression: 0 } });
await H.playTurn(g, "嗯");
ev("Math.random=window.__rnd");
A.check("排序制：休息排第3名沒發生，不算健康經營回合", ev("state.healthyTurnsThisYear") === 0 && lastPayload.turn_focus.ranked_items[2].occurred === false);

// 收入類不擲骰：半退休兼職排第2名＝60%
ev("state.careerStatus=CAREER_STATUS.SEMI_RETIRED; state.interestCandidates=[]; state.focusWorkStatus=null; state.focusRank=['rest','work']; state.focusWorkId='sidejob'; ensureFocusRatio(state).year={n:0,push:0,biz:0}");
ev("window.__rnd=Math.random; Math.random=()=>0.99");
await H.playTurn(g, "嗯");
ev("Math.random=window.__rnd");
const pt2 = js("state.partTimeEventLog");
A.check("兼職排第2名：不擲骰，收入×60%", pt2 && pt2.rank_ratio === 0.6 && pt2.earning === Math.round(pt2.hourly * pt2.hours * 0.6), pt2);
A.check("排序回合比例只看第1名(休息)，兼職不算拚工作", js("state.focusRatio.year").push === 0);

// 副業：依名次推進訂單進度，交件照常入帳
ev("state.careerStatus=CAREER_STATUS.RETIRED; state.interestCandidates=[{id:'hc',category:'手作工藝',status:'active',investment:50,sideBusinessStatus:'formal',lastEngagedRound:state.turnCount}]; state.focusRank=['rest','work']; state.focusWorkId='hc'");
ev("registerOrders(state,[{category:'手作工藝',client:'林小姐',item:'耳環',size:'small'}])");
const ord = () => js("state.interestCandidates[0].gigOrders[0]");
await H.playTurn(g, "嗯");
A.check("副業排第2名：訂單進度推進0.6格、還沒交件", ord().done === 0.6 && ord().status === "進行中", ord());
await H.playTurn(g, "嗯");
A.check("進度只用整數格(無條件捨去)：payload是0/1、進度條沒有小數", JSON.stringify(lastPayload).includes('"progress":"0/1"') && !JSON.stringify(lastPayload).includes("0.6/1") && ev("gigProgressBar({done:0.6,need:1})") === "□");
A.check("再一回合累積滿：交件入帳", ord().status !== "進行中" && ord().reward > 0, ord());

// ---------- 老年題材排除(十三、13.7.2補充定案) ----------
ev("state.careerStatus=CAREER_STATUS.EMPLOYED; state.occupationCategory='受雇專業/白領類'; state.focusWorkStatus=null; state.focusRank=['work']; syncFocusState(state)");
A.check("第1名本業拚一點：退休題材不抽", ev("oldAgeThemeExcluded(state,'退休決定')") === true && ev("oldAgeThemeExcluded(state,'住居調整')") === false);
ev("state.focusRank=['rest','work']");
A.check("本業拚一點不在第1名：不排除", ev("oldAgeThemeExcluded(state,'退休決定')") === false);
A.check("老年主軸照常送", !!js("computeOldAgeTheme(state)").axis);

A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
