// 十六、16.1～16.5（2026-09-28）：介面改版——用真的Chromium(Playwright)驗證，jsdom無法計算CSS動畫、毛玻璃與媒體查詢
// 取代原本的browser-5-loading.cjs(一、1.1.4舊版等待畫面，已由16.5取代)
// 執行：需要playwright(或playwright-core)與Chromium。PW_MODULE可指定模組路徑、CHROMIUM_PATH指定瀏覽器路徑；Playwright需要Node 20以上
const path = require("path"); const fs = require("fs");
const { chromium } = require(process.env.PW_MODULE || "playwright");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const shot = (page, name) => page.screenshot({ path: path.join(process.env.SHOT_DIR || "/tmp", name) });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const pageErrors = [];
  async function open(reducedMotion) {
    const ctx = await browser.newContext({ reducedMotion, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on("pageerror", e => pageErrors.push(String(e)));
    await page.route("https://game.test/**", r => r.fulfill({ contentType: "text/html", body: html }));
    await page.route("https://life-game.smile80275.workers.dev/**", r => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await page.addInitScript(() => { localStorage.setItem("life_sim_recovery_key", "browserkey1"); localStorage.setItem("life_sim_active_slot", "0"); });
    await page.goto("https://game.test/");
    await page.waitForTimeout(300);
    await page.evaluate(() => { state = newRoll(null, { name: "林以晴", gender: "女" }); state.spendingHabit = "普通花費"; state.mealArrangement = state.mealArrangement || "自己打理"; MOCK_AI_DELAY_MS = 50; });
    await page.evaluate(() => startLife());
    await page.waitForTimeout(800);
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => { document.querySelectorAll(".modal-backdrop").forEach(m => m.remove()); takeTurn(state.choices[0], AP_COST_PER_TURN); });
      await page.waitForTimeout(1600);
    }
    await page.evaluate(() => document.querySelectorAll(".modal-backdrop").forEach(m => m.remove()));
    return { ctx, page };
  }
  // 16.10 首頁(真實瀏覽器才看得出動畫、毛玻璃與捲動)
  async function openHome(reducedMotion, confirmed) {
    const ctx = await browser.newContext({ reducedMotion, viewport: { width: 390, height: 844 } });
    const hp = await ctx.newPage();
    hp.on("pageerror", e => pageErrors.push(String(e)));
    await hp.route("https://game.test/**", r => r.fulfill({ contentType: "text/html", body: html }));
    await hp.route("https://life-game.smile80275.workers.dev/**", r => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    if (confirmed) await hp.addInitScript(() => localStorage.setItem("life_sim_age_confirmed", "yes"));
    await hp.goto("https://game.test/");
    await hp.waitForTimeout(150);
    return hp;
  }
  const hp = await openHome("no-preference", false);
  const gate = await hp.evaluate(() => { const c = document.querySelector(".age-card"); const h = document.querySelector(".home-hero"); return { blur: getComputedStyle(c).backdropFilter, heroOpacity: getComputedStyle(h).opacity, heroEvents: getComputedStyle(h).pointerEvents, stampAnim: getComputedStyle(document.getElementById("home-stamp")).animationName }; });
  check("16.10.0 年齡確認是毛玻璃卡片，首頁內容在後方淡淡透出且不能按", gate.blur === "blur(14px)" && +gate.heroOpacity < 0.5 && gate.heroEvents === "none", gate);
  check("16.10.1 首頁印章進場用16.4.3重蓋動畫", gate.stampAnim === "restamp", gate);
  await shot(hp, "home-gate.png");
  await hp.click("#btn-age-yes"); await hp.waitForTimeout(200);
  await hp.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await hp.waitForTimeout(100);
  const y0 = await hp.evaluate(() => window.scrollY);
  await hp.click("#btn-home-top");
  await hp.waitForTimeout(280);
  const yMid = await hp.evaluate(() => window.scrollY);
  await hp.waitForTimeout(500);
  const yEnd = await hp.evaluate(() => window.scrollY);
  check("16.10.7 翻回第一頁：平順捲動、約600ms回到頂端", y0 > 1000 && yMid > 0 && yMid < y0 && yEnd === 0, { y0, yMid, yEnd });
  const hr = await openHome("reduce", true);
  await hr.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await hr.waitForTimeout(100);
  await hr.click("#btn-home-top"); await hr.waitForTimeout(30);
  const yr = await hr.evaluate(() => window.scrollY);
  check("16.10.7 減少動態模式：直接跳回頂端", yr === 0, yr);
  const { page } = await open("no-preference");
  // 16.1 背景
  const bg = await page.evaluate(() => {
    const blobs = [...document.querySelectorAll(".bg .blob")].map(b => ({ anim: getComputedStyle(b).animationName, blur: getComputedStyle(b).filter, bgc: getComputedStyle(b).backgroundColor }));
    const g = getComputedStyle(document.querySelector(".bg .grain"));
    return { blobs, grain: { opacity: g.opacity, blend: g.mixBlendMode, img: /feTurbulence/.test(g.backgroundImage) }, base: getComputedStyle(document.querySelector(".bg")).backgroundColor, inApp: !!document.querySelector("#app .bg") };
  });
  check("16.1 四個模糊色塊、顏色與定案一致、模糊38px", bg.blobs.length === 4 && bg.blobs.every(b => b.blur === "blur(38px)") && ["rgb(232, 96, 76)", "rgb(240, 160, 75)", "rgb(185, 211, 234)", "rgb(227, 239, 197)"].every(c => bg.blobs.some(b => b.bgc === c)), bg);
  check("16.1 色塊飄動(drift1/drift2)", bg.blobs.every(b => b.anim === "drift1" || b.anim === "drift2"), bg);
  check("16.1 顆粒：SVG雜訊、overlay、55%；底色#F7F0E3；背景不在#app裡(render不會清掉)", bg.grain.img && bg.grain.blend === "overlay" && bg.grain.opacity === "0.55" && bg.base === "rgb(247, 240, 227)" && !bg.inApp, bg);
  // 16.2 設計基礎
  const base = await page.evaluate(() => {
    const st = getComputedStyle(document.getElementById("age-stamp"));
    const card = getComputedStyle(document.getElementById("latest-entry"));
    return { text: getComputedStyle(document.body).color, stampColor: st.borderTopColor, stampRadius: st.borderTopLeftRadius, stampTf: st.transform, stampText: document.getElementById("age-stamp").textContent,
      cardBlur: card.backdropFilter, cardRadius: card.borderTopLeftRadius, cardBg: card.backgroundColor,
      storyFont: getComputedStyle(document.querySelector("#latest-entry p")).fontFamily, uiFont: getComputedStyle(document.querySelector(".choice-btn")).fontFamily };
  });
  check("16.2.1 主要文字深棕#4A2E1F", base.text === "rgb(74, 46, 31)", base);
  check("16.2.2 最新一回合是毛玻璃卡片(模糊14px、圓角18px、白45%)", base.cardBlur === "blur(14px)" && base.cardRadius === "18px" && base.cardBg === "rgba(255, 255, 255, 0.45)", base);
  check("16.2.3 故事內文明體、介面元素黑體", /Serif/.test(base.storyFont) && !/Serif/.test(base.uiFont) && /sans-serif/.test(base.uiFont), base);
  const rot = (() => { const m = /matrix\(([^)]+)\)/.exec(base.stampTf); if (!m) return null; const [a, b] = m[1].split(",").map(Number); return Math.round(Math.atan2(b, a) * 180 / Math.PI); })();
  check("16.2.4 年齡印章：珊瑚紅圓框、傾斜約-8度、內含「歲・階段」", base.stampColor === "rgb(200, 85, 61)" && base.stampRadius === "50%" && rot === -8 && /^\d+歲・/.test(base.stampText), { ...base, rot });
  // 16.3 主畫面
  const main = await page.evaluate(() => {
    const top = document.querySelector(".topbar"), act = document.querySelector(".actions");
    return { topPos: getComputedStyle(top).position, actPos: getComputedStyle(act).position, btns: [...document.querySelectorAll(".round-btn")].map(b => b.getAttribute("aria-label")),
      demo: document.querySelector(".demo-tag")?.textContent, sub: document.querySelector(".tb-sub .right").textContent, meta: document.querySelector(".tb-meta").textContent,
      fullCards: document.querySelectorAll(".journal .entry.card").length, summaries: document.querySelectorAll(".journal .entry-summary").length, sumOpacity: getComputedStyle(document.querySelector(".entry-summary")).opacity,
      cols: getComputedStyle(document.querySelector(".choices")).gridTemplateColumns.split(" ").length, sendBg: getComputedStyle(document.getElementById("btn-custom")).backgroundColor, sendRadius: getComputedStyle(document.getElementById("btn-custom")).borderTopLeftRadius,
      undo: document.getElementById("btn-undo")?.textContent, count: document.getElementById("custom-input-count").textContent,
      caps: [...document.querySelectorAll("#latest-entry .cap")].map(c => ({ cls: c.className, bg: getComputedStyle(c).backgroundColor })),
      oldWarn: /⚠ 示範模式/.test(document.body.textContent) };
  });
  check("16.3.1 頂部狀態列固定；右側三個圓形按鈕(數值、通訊錄、選單)", main.topPos === "sticky" && main.btns.join() === "數值,通訊錄,選單", main);
  check("16.3.1 小字「名字・第幾世 行動點 第幾回合」；下一行左側示範模式小標籤、右側進度與存款；紅色警告文字已拿掉", /林以晴・第1世/.test(main.meta) && /行動點/.test(main.meta) && /第\d+回合/.test(main.meta) && main.demo === "示範模式" && /\d+\/\d+/.test(main.sub) && /存款/.test(main.sub) && !main.oldWarn, main);
  check("16.3.2 主畫面只有最新一回合完整卡片＋上一回合一行摘要(透明度55%)", main.fullCards === 1 && main.summaries === 1 && main.sumOpacity === "0.55", main);
  check("16.3.2 數值變化是膠囊，增加淡綠、減少淡珊瑚", main.caps.length > 0 && main.caps.every(c => (/up/.test(c.cls) && c.bg === "rgba(99, 153, 34, 0.16)") || (/down/.test(c.cls) && c.bg === "rgba(216, 90, 48, 0.16)")), main.caps);
  check("16.3.3 底部行動區固定、選項兩欄、送出鈕珊瑚紅圓形", main.actPos === "sticky" && main.cols === 2 && main.sendBg === "rgb(200, 85, 61)" && main.sendRadius === "50%", main);
  check("16.3.3 下方一行：左「反悔上一步(剩N次)」、右字數0/200", /反悔上一步（剩\d+次）/.test(main.undo || "") && /^0／200$/.test(main.count), main);
  await shot(page, "ui-main.png");
  // 16.3.2 上一回合摘要點開/收回
  await page.click("#prev-entry-summary"); await page.waitForTimeout(200);
  const exp1 = await page.evaluate(() => !!document.querySelector(".entry-expanded"));
  await page.click("#prev-entry-summary"); await page.waitForTimeout(200);
  const exp2 = await page.evaluate(() => !!document.querySelector(".entry-expanded"));
  check("16.3.2 上一回合摘要點箭頭可展開、再點收回", exp1 && !exp2, { exp1, exp2 });
  // 16.3.4 面板
  const panelInfo = {};
  for (const p of ["stats", "roster", "menu"]) {
    await page.click(`.round-btn[data-panel=${p}]`); await page.waitForTimeout(450);
    panelInfo[p] = await page.evaluate((p) => {
      const el = document.getElementById("panel-" + p), cs = getComputedStyle(el), r = el.getBoundingClientRect();
      return { open: el.classList.contains("open"), bottom: Math.round(r.bottom), vh: innerHeight, bg: cs.backgroundColor, blur: cs.backdropFilter, radius: cs.borderTopLeftRadius, backdrop: document.getElementById("sheet-backdrop").classList.contains("open"), text: el.textContent,
        bars: el.querySelectorAll(".stat-bar").length, cardNext: el.querySelector("#lifestyle-card")?.previousElementSibling?.textContent || "", dots: el.querySelectorAll(".dots5").length, rows: el.querySelectorAll(".rrow").length,
        ids: [...el.querySelectorAll("[id]")].map(x => x.id), dangerColor: el.querySelector(".danger") ? getComputedStyle(el.querySelector(".danger")).color : null };
    }, p);
    if (p === "menu") await shot(page, "ui-panel-menu.png");
    await page.click("#sheet-backdrop", { position: { x: 200, y: 30 } }); await page.waitForTimeout(450);
    panelInfo[p].closed = await page.evaluate((p) => !document.getElementById("panel-" + p).classList.contains("open") && getComputedStyle(document.getElementById("panel-" + p)).visibility === "hidden", p);
  }
  const allOpen = Object.values(panelInfo).every(x => x.open && x.backdrop && x.bottom === x.vh && x.bg === "rgba(250, 244, 234, 0.92)" && x.blur === "blur(18px)" && x.radius === "22px" && x.closed);
  check("16.3.4／16.2.2 三個面板由下往上滑出(背景rgba(250,244,234,.92)、模糊18px、上方圓角22px)，點暗色背景關閉", allOpen, panelInfo);
  check("16.3.4 數值面板：存款大字→生活方式小卡→五項能力進度條＋數字→課業", /存款/.test(panelInfo.stats.cardNext) && panelInfo.stats.bars === 5 && ["健康", "才識", "表達力", "外表", "人脈"].every(k => panelInfo.stats.text.includes(k)) && /課業/.test(panelInfo.stats.text), panelInfo.stats);
  check("16.3.4／16.3.5 通訊錄：每人一列、頭像、稱謂與關係等級、5格圓點", panelInfo.roster.rows > 0 && panelInfo.roster.dots === panelInfo.roster.rows, panelInfo.roster);
  check("16.3.4 選單：回憶錄、人生之書大卡；這段人生區；設定區(金鑰、同步狀態、切換)；刪除紅字在最底", ["link-memoir", "link-book", "link-about-me", "link-belongings", "link-idle-toggle", "link-view-key", "cloud-sync-status-wrap", "link-switch-life", "link-reset"].every(id => panelInfo.menu.ids.includes(id)) && panelInfo.menu.ids[panelInfo.menu.ids.length - 1] === "link-reset" && panelInfo.menu.dangerColor === "rgb(163, 45, 45)", panelInfo.menu);
  // 16.3.5 圓點級距
  const dots = await page.evaluate(() => [95, 70, 50, 30, 5].map(a => relationDotCount({ affinity: a })));
  check("16.3.5 圓點對應五段級距(80/60/40/20)", dots.join() === "5,4,3,2,1", dots);
  // 16.4.2＋16.5 等待
  const firstLines = [];
  await page.evaluate(() => { MOCK_AI_DELAY_MS = 20000; document.querySelector(".choice-btn[data-choice='1']").click(); });
  await page.waitForTimeout(600);
  const w1 = await page.evaluate(() => {
    const el = document.getElementById("turn-loading");
    const dots = [...el.querySelectorAll(".breath i")].map(i => ({ a: getComputedStyle(i).animationName, d: getComputedStyle(i).animationDuration }));
    const btns = [...document.querySelectorAll(".choice-btn")].map(b => ({ dis: b.disabled, op: getComputedStyle(b).opacity, chosen: b.classList.contains("chosen") }));
    return { text: el.querySelector(".loading-text").textContent, inList: LOADING_LINES.includes(el.querySelector(".loading-text").textContent), dots, btns, glass: getComputedStyle(el).backdropFilter, collapsed: !!document.querySelector(".entry-summary.anim-collapse"), noCard: !document.getElementById("latest-entry"), pen: !!el.querySelector(".ink-pen") };
  });
  firstLines.push(w1.text);
  check("16.4.2第1步：按下的選項保持原樣，其他選項淡成半透明並暫停可按", w1.btns.every(b => b.dis) && w1.btns.filter(b => b.chosen).length === 1 && w1.btns.filter(b => !b.chosen).every(b => +b.op < 0.6) && w1.btns.find(b => b.chosen).op === "1", w1.btns);
  check("16.4.2第2步／16.5：空白毛玻璃卡片、清單中的一句、三個呼吸小點1.2秒一循環；筆的小動畫已取消", w1.inList && w1.glass === "blur(14px)" && w1.dots.length === 3 && w1.dots.every(d => d.a === "breath" && d.d === "1.2s") && !w1.pen, w1);
  check("16.4.2第3步：舊回合收合成一行摘要", w1.collapsed && w1.noCard, w1);
  await shot(page, "ui-loading.png");
  await page.waitForTimeout(3900);
  const t45 = await page.evaluate(() => ({ text: document.querySelector("#turn-loading .loading-text").textContent, inList: LOADING_LINES.includes(document.querySelector("#turn-loading .loading-text").textContent) }));
  check("16.5 超過4秒淡出換下一句", t45.text !== w1.text && t45.inList, { first: w1.text, t45 });
  await page.waitForTimeout(6000);
  const t10 = await page.evaluate(() => document.querySelector("#turn-loading .loading-text").textContent);
  check("16.5 超過10秒固定顯示「這一頁寫得比較久，再等一下下」", t10 === "這一頁寫得比較久，再等一下下", t10);
  const cashBefore = await page.evaluate(() => state.cash);
  await page.waitForTimeout(10800); // 20秒回合完成
  const after = await page.evaluate(() => {
    const card = document.getElementById("latest-entry");
    return { card: !!card, anim: card && getComputedStyle(card).animationName, dur: card && getComputedStyle(card).animationDuration, pDelays: card ? [...card.querySelectorAll(":scope > p")].map(p => p.style.animationDelay) : [],
      capAnim: card && card.querySelector(".cap") ? getComputedStyle(card.querySelector(".cap")).animationName : "(無膠囊)", capDelays: card ? [...card.querySelectorAll(".cap")].map(c => parseInt(c.style.animationDelay)) : [], loading: !!document.getElementById("turn-loading") };
  });
  check("16.4.2第4步：新卡片由下往上淡入(400ms)、段落依序(間隔80ms)", after.card && after.anim === "rise-in" && after.dur === "0.4s" && after.pDelays.every((d, i) => d === (i * 80) + "ms") && !after.loading, after);
  check("16.4.2第5步：膠囊延遲彈出、每個間隔60ms", after.capAnim === "(無膠囊)" || (after.capAnim === "cap-pop" && after.capDelays.every((d, i) => i === 0 || d - after.capDelays[i - 1] === 60) && after.capDelays[0] >= 200), after);
  // 16.5 下一回合開頭那句不與上一回合重複
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => { document.querySelectorAll(".modal-backdrop").forEach(m => m.remove()); MOCK_AI_DELAY_MS = 300; takeTurn(state.choices[0], AP_COST_PER_TURN); });
    await page.waitForTimeout(100);
    firstLines.push(await page.evaluate(() => document.querySelector("#turn-loading .loading-text").textContent));
    await page.waitForTimeout(900);
  }
  check("16.5 每回合隨機挑一句、不與上一回合重複", firstLines.every((t, i) => i === 0 || t !== firstLines[i - 1]), firstLines);
  // 16.4.2第7步：存款數字滾動
  await page.evaluate(() => { document.querySelectorAll(".modal-backdrop").forEach(m => m.remove()); lastShownCash = state.cash - 500; lastAnimatedLogLen = state.log.length - 1; render(); });
  await page.waitForTimeout(250);
  const mid = await page.evaluate(() => ({ shown: document.getElementById("tb-cash").textContent, cash: state.cash }));
  await page.waitForTimeout(1600);
  const end = await page.evaluate(() => document.getElementById("tb-cash").textContent);
  check("16.4.2第7步：頂部存款由舊數字滾到新數字", mid.shown !== mid.cash.toLocaleString() && end === mid.cash.toLocaleString(), { mid, end });
  // 16.4.3 印章重蓋
  await page.evaluate(() => { state.age += 1; render(); });
  const re = await page.evaluate(() => ({ cls: document.getElementById("age-stamp").className, anim: getComputedStyle(document.getElementById("age-stamp")).animationName, dur: getComputedStyle(document.getElementById("age-stamp")).animationDuration }));
  await page.evaluate(() => { state.age -= 1; render(); });
  check("16.4.3 過生日時印章重蓋(350ms)", /restamp/.test(re.cls) && re.anim === "restamp" && re.dur === "0.35s", re);
  // 16.3.6 旁白錯誤
  await page.evaluate(() => { document.querySelectorAll(".modal-backdrop").forEach(m => m.remove()); MOCK_AI_DELAY_MS = 50; window.__m = mockCallAI; mockCallAI = async () => { throw new Error("測試用失敗"); }; takeTurn(state.choices[0], AP_COST_PER_TURN); });
  await page.waitForTimeout(2500);
  const err = await page.evaluate(() => ({ text: document.querySelector(".narrator-error")?.textContent || "", btn: !!document.getElementById("btn-retry-turn"), turn: state.turnCount }));
  await page.evaluate(() => { mockCallAI = window.__m; });
  await page.click("#btn-retry-turn"); await page.waitForTimeout(1500);
  const afterRetry = await page.evaluate(() => ({ err: !!(state.log[state.log.length - 1] || {}).error, turn: state.turnCount, errs: state.log.filter(e => e.error).length }));
  check("16.3.6 旁白錯誤保留原文案，旁邊有「再試一次」；按下後用同一個行動重送、錯誤那則移除", /旁白剛剛恍神了一下/.test(err.text) && err.btn && !afterRetry.err && afterRetry.turn === err.turn + 1 && afterRetry.errs === 0, { err, afterRetry });
  // 16.4.4 減少動態模式
  const r = await open("reduce");
  const rm = await r.page.evaluate(() => {
    const card = document.getElementById("latest-entry");
    return { blob: getComputedStyle(document.querySelector(".blob")).animationName, card: getComputedStyle(card).animationName, cardDur: getComputedStyle(card).animationDuration };
  });
  await r.page.evaluate(() => { MOCK_AI_DELAY_MS = 3000; takeTurn(state.choices[0], AP_COST_PER_TURN); });
  await r.page.waitForTimeout(500);
  const rm2 = await r.page.evaluate(() => ({ breath: getComputedStyle(document.querySelector(".breath i")).animationName }));
  await r.page.waitForTimeout(3200);
  await r.page.evaluate(() => { document.querySelectorAll(".modal-backdrop").forEach(m => m.remove()); lastShownCash = state.cash - 500; lastAnimatedLogLen = state.log.length - 1; render(); });
  const rm3 = await r.page.evaluate(() => ({ cash: document.getElementById("tb-cash").textContent === state.cash.toLocaleString(), anim: getComputedStyle(document.getElementById("latest-entry")).animationName, dur: getComputedStyle(document.getElementById("latest-entry")).animationDuration }));
  await r.page.click(".round-btn[data-panel=stats]"); await r.page.waitForTimeout(50);
  const rm4 = await r.page.evaluate(() => getComputedStyle(document.getElementById("panel-stats")).transitionProperty);
  check("16.4.4 減少動態：背景色塊停止飄動", rm.blob === "none", rm);
  check("16.4.4 減少動態：卡片只保留150ms淡入、數字直接跳到新數值", rm3.anim === "fade-in" && rm3.dur === "0.15s" && rm3.cash, rm3);
  check("16.4.4 減少動態：面板不位移只淡入；呼吸小點停止", !/transform/.test(rm4) && /opacity/.test(rm4) && rm2.breath === "none", { rm4, rm2 });
  await shot(r.page, "ui-reduced.png");
  check("整段沒有頁面錯誤", pageErrors.length === 0, pageErrors);
  await browser.close();
  const pass = results.filter(x => x.ok).length;
  console.log(`\n=== 十六 介面改版(真實Chromium)：${pass}/${results.length} 通過 ===`);
  results.forEach(x => console.log(`${x.ok ? "通過" : "未通過"}｜${x.name}${x.ok ? "" : "｜" + JSON.stringify(x.detail)}`));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
