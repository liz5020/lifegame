// 佇列批次5（2026-09-25）：等待畫面動態效果——用真的Chromium(Playwright)驗證，jsdom無法計算CSS動畫與媒體查詢
// 執行：需要playwright套件與Chromium。PW_MODULE可指定playwright模組路徑、CHROMIUM_PATH指定瀏覽器路徑
const path = require("path"); const fs = require("fs");
const { chromium } = require(process.env.PW_MODULE || "playwright");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  async function open(reducedMotion) {
    const ctx = await browser.newContext({ reducedMotion, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.route("https://game.test/**", r => r.fulfill({ contentType: "text/html", body: html }));
    await page.route("https://life-game.smile80275.workers.dev/**", r => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await page.addInitScript(() => { localStorage.setItem("life_sim_recovery_key", "browserkey1"); localStorage.setItem("life_sim_active_slot", "0"); });
    await page.goto("https://game.test/");
    await page.waitForTimeout(300);
    await page.evaluate(() => { state = newRoll(null, { name: "林小晴", gender: "女" }); state.spendingHabit = "普通"; state.mealArrangement = state.mealArrangement || "家裡煮"; MOCK_AI_DELAY_MS = 50; });
    await page.evaluate(() => startLife());
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll(".modal-backdrop").forEach(m => m.remove()));
    return { ctx, page };
  }
  // 一般動態
  const { page } = await open("no-preference");
  await page.evaluate(() => { MOCK_AI_DELAY_MS = 20000; takeTurn(state.choices[0], AP_COST_PER_TURN); });
  await page.waitForTimeout(1000);
  const a1 = await page.evaluate(() => {
    const el = document.getElementById("turn-loading");
    if (!el) return null;
    const cs = (sel) => getComputedStyle(el.querySelector(sel));
    return { text: el.querySelector(".loading-text").textContent, line: cs(".ink-line").animationName, nib: cs(".ink-nib").animationName, dot: cs(".dots i").animationName, dot2delay: getComputedStyle(el.querySelectorAll(".dots i")[1]).animationDelay, hasTips: /提示|小知識|攻略/.test(el.textContent) };
  });
  check("等待開始：顯示等待區塊與原本文字", a1 && a1.text === "旁白正在幫你寫下這一頁", a1);
  check("筆與墨線有動畫(ink-write/pen-move)", a1 && a1.line === "ink-write" && a1.nib === "pen-move", a1);
  check("三個點依序淡入淡出(dot-fade，第二個延遲0.2s)", a1 && a1.dot === "dot-fade" && a1.dot2delay === "0.2s", a1);
  check("等待畫面沒有遊戲知識或提示文字", a1 && !a1.hasTips);
  await page.screenshot({ path: process.env.SHOT_DIR ? path.join(process.env.SHOT_DIR, "loading-1s.png") : "/tmp/loading-1s.png", clip: { x: 0, y: 0, width: 390, height: 844 }, fullPage: false });
  const beforeDash = await page.evaluate(() => getComputedStyle(document.querySelector("#turn-loading .ink-line")).strokeDashoffset);
  await page.waitForTimeout(700);
  const afterDash = await page.evaluate(() => getComputedStyle(document.querySelector("#turn-loading .ink-line")).strokeDashoffset);
  check("動畫確實在跑(墨線的dashoffset隨時間改變)", beforeDash !== afterDash, { beforeDash, afterDash });
  await page.waitForTimeout(12800); // 累計約14.5秒
  const t14 = await page.evaluate(() => document.querySelector("#turn-loading .loading-text").textContent);
  check("14.5秒時仍是原本文字", t14 === "旁白正在幫你寫下這一頁", t14);
  await page.waitForTimeout(1200); // 約15.7秒
  const t16 = await page.evaluate(() => ({ text: document.querySelector("#turn-loading .loading-text").textContent, anim: getComputedStyle(document.querySelector("#turn-loading .ink-line")).animationName }));
  check("超過15秒：文字換成安撫的話，動畫持續", t16.text === "這一頁比較長，旁白還在寫" && t16.anim === "ink-write", t16);
  await page.screenshot({ path: process.env.SHOT_DIR ? path.join(process.env.SHOT_DIR, "loading-16s.png") : "/tmp/loading-16s.png" });
  await page.waitForTimeout(5000); // 約20.7秒，回合完成
  const done = await page.evaluate(() => ({ loading: !!document.getElementById("turn-loading"), turn: state.turnCount, timer: loadingSlowTimer }));
  check("20秒後回合完成：等待動畫消失、回合數+1", !done.loading && done.turn === 2, done);
  // 下一回合重新計時(不會一開始就顯示安撫文字)
  await page.evaluate(() => { document.querySelectorAll(".modal-backdrop").forEach(m => m.remove()); MOCK_AI_DELAY_MS = 3000; takeTurn(state.choices[0], AP_COST_PER_TURN); });
  await page.waitForTimeout(500);
  const next = await page.evaluate(() => document.querySelector("#turn-loading .loading-text").textContent);
  check("下一回合重新計時，一開始是原本文字", next === "旁白正在幫你寫下這一頁", next);
  await page.waitForTimeout(3000);
  // 減少動態
  const r = await open("reduce");
  await r.page.evaluate(() => { MOCK_AI_DELAY_MS = 3000; takeTurn(state.choices[0], AP_COST_PER_TURN); });
  await r.page.waitForTimeout(600);
  const rm = await r.page.evaluate(() => { const el = document.getElementById("turn-loading"); const cs = (s) => getComputedStyle(el.querySelector(s)); return { line: cs(".ink-line").animationName, nib: cs(".ink-nib").animationName, dot: cs(".dots i").animationName, dotOpacity: cs(".dots i").opacity, dash: cs(".ink-line").strokeDashoffset }; });
  check("系統設定減少動態：動畫全部關閉，改為靜態(墨線畫滿、點全亮)", rm.line === "none" && rm.nib === "none" && rm.dot === "none" && rm.dotOpacity === "1" && parseFloat(rm.dash) === 0, rm);
  await r.page.screenshot({ path: process.env.SHOT_DIR ? path.join(process.env.SHOT_DIR, "loading-reduced.png") : "/tmp/loading-reduced.png" });
  await browser.close();
  const pass = results.filter(x => x.ok).length;
  console.log(`\n=== 批次5 等待畫面(真實Chromium)：${pass}/${results.length} 通過 ===`);
  results.forEach(x => console.log(`${x.ok ? "通過" : "未通過"}｜${x.name}${x.ok ? "" : "｜" + JSON.stringify(x.detail)}`));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
