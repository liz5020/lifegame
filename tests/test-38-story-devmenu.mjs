// 2026-09-28：一、1.2.9.16段落清單＋十六、16.3.8故事正文排版；16.3.7親密開關不顯示；測試選單；16.3.4數值說明
// （USE_MOCK＋假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("十六 正文排版＋測試選單＋數值說明");

// ================= 真實路徑(假上游)：AI交段落清單 =================
let turnOverride = () => ({});
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => turnOverride(p) }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "storykey01", dev: true });
const ev = g.ev, doc = g.win.document;

// 換行清理(純函式)
A.check("16.3.8.1 字面\\n與\\\\n轉成換段、連續換行合併、頭尾空白去掉",
  JSON.stringify(ev(`narrativeParagraphs("甲\\\\n\\\\n乙\\\\\\\\n丙\\n\\n\\n  丁  ")`)) === JSON.stringify(["甲","乙","丙","丁"]),
  ev(`narrativeParagraphs("甲\\\\n\\\\n乙\\\\\\\\n丙\\n\\n\\n  丁  ")`));
A.check("16.3.8.1 段落清單(陣列)：空段落丟掉、段內換行也拆開",
  JSON.stringify(ev(`narrativeParagraphs(["一", "", "二\\n三"])`)) === JSON.stringify(["一","二","三"]));

await H.startNewLife(g, { name: "林以晴", gender: "女" });
const first = ev("JSON.stringify(state.log[state.log.length-1])");
const e0 = JSON.parse(first);
A.check("開場回合：沒有選擇行", !e0.action);
A.check("開場回合：卡片沒有選擇行、沒有分隔線", !doc.querySelector("#latest-entry .choice-line") && !doc.querySelector("#latest-entry .turn-divider"));

turnOverride = () => ({ action_result: ["雅涵湊過來看了一眼，噗哧笑出來。", "她把自己那張抽出來比對。"],
  narrative: ["隔天早上，你醒得比鬧鐘早。", "桌上的課本還攤著\\n\\n窗外有鳥。"] });
await H.playTurn(g, "把考卷拿給雅涵看");
const e1 = JSON.parse(ev("JSON.stringify(state.log[state.log.length-1])"));
A.check("日記記下玩家的選擇", e1.action === "把考卷拿給雅涵看", e1.action);
A.check("日記用sceneAt分開兩段、全文不重複存", Number.isInteger(e1.sceneAt) && !("resultText" in e1) && e1.text.slice(e1.sceneAt).trim().startsWith("隔天早上"), e1);
const card = doc.getElementById("latest-entry");
A.check("16.3.8.2 卡片由上到下：選擇行→行動結果→分隔線→新場景",
  card && /^→ 把考卷拿給雅涵看/.test(card.querySelector(".choice-line").textContent) && !!card.querySelector(".turn-divider"), card && card.innerHTML.slice(0, 300));
const ps = [...card.querySelectorAll(":scope > p")].map(p => p.textContent);
A.check("段落各自一個<p>，字面\\n已清掉", ps.length === 5 && !ps.some(t => /\\n/.test(t)), ps);
const order = card.innerHTML.indexOf("choice-line") < card.innerHTML.indexOf("turn-divider") && card.innerHTML.indexOf("turn-divider") < card.innerHTML.indexOf("隔天早上");
A.check("分隔線在行動結果與新場景之間", order);

turnOverride = () => ({ narrative: "舊格式單一字串\\n\\n第二段" });
await H.playTurn(g, "自己打的行動");
const card2 = doc.getElementById("latest-entry");
A.check("AI交回單一字串(含字面\\n)：程式依換行拆段", [...card2.querySelectorAll(":scope > p")].map(p => p.textContent).join("|").includes("舊格式單一字串|第二段"));
A.check("自由輸入同樣用選擇行呈現", /自己打的行動/.test(card2.querySelector(".choice-line").textContent));

turnOverride = () => ({});
for (let i = 0; i < 3; i++) await H.playTurn(g);
A.check("16.3.2 主畫面保留3則舊回合摘要", doc.querySelectorAll(".entry-summary[data-log-idx]").length === 3, doc.querySelectorAll(".entry-summary").length);
const sum = doc.querySelector(".entry-summary[data-log-idx]");
sum.click();
A.check("舊回合點開展開，同樣有選擇行", !!doc.querySelector(".entry-expanded .choice-line"));
A.check("16.3.8.3 選項在正文最後(#story-choices)，底部沒有選項", doc.querySelectorAll("#story-choices .choice-btn").length === 3 && !doc.querySelector("footer.actions .choice-btn"));
A.check("底部細列：輸入框、送出、字數", !!doc.querySelector("footer.actions #custom-input") && !!doc.getElementById("btn-custom") && !!doc.getElementById("custom-input-count"));

// 反悔：整回合一起移除
const lenBefore = ev("state.log.length");
ev("restoreUndo()");
A.check("16.3.8.5 反悔：這一回合的日記與選項一起移除", ev("state.log.length") === lenBefore - 1 && doc.querySelectorAll("#story-choices .choice-btn").length > 0);

// 16.3.7 親密開關不顯示
A.check("16.3.7 選單沒有親密場景開關", !doc.getElementById("link-intimacy-toggle"));

// 測試選單
A.check("dev旗標：選單抽屜多一格中性灰的「測試」(不用紫色)、頂部列沒有圓鈕", !!doc.querySelector("#drawer #tile-test.dev[data-panel='test']") && !!doc.getElementById("panel-test") && !doc.querySelector(".tb-btns") && !/6B4FA0/i.test(doc.querySelector("style").textContent));
A.check("遊戲畫面不另外放右上角浮動鈕", !doc.getElementById("dev-fab"));
const u = JSON.parse(ev("JSON.stringify(state.devUsage)"));
A.check("累計用量：每次真實呼叫都加上(假上游每次輸入5000)", u && u.calls >= 6 && u.input === 5000 * u.calls && u.cost_usd > 0, u);
A.check("用量文字：上一回合＋這一世累計", /上一回合｜輸入 5000/.test(doc.getElementById("dev-usage-last").textContent) && /這一世累計｜呼叫/.test(doc.getElementById("dev-usage-total").textContent));
const md = ev("buildStoryExport(state)");
A.check("下載故事：Markdown含標題、選擇行、行動結果、分隔、新場景", /^# 林以晴・第1世/.test(md) && md.includes("→ 把考卷拿給雅涵看") && md.includes("雅涵湊過來看了一眼") && md.includes("\n---\n") && md.includes("隔天早上"), md.slice(0, 400));
A.check("下載故事：台詞標記換成「」、有結算", !/\{\{/.test(md) && /結算：/.test(md));
A.check("反悔不退用量", ev("state.devUsage.calls") >= 5);
for (let i = 0; i < 9; i++) await H.playTurn(g);
const md2 = ev("buildStoryExport(state)");
A.check("下載故事：每回合列出選項，標出選了哪個", /這回合的選項：\n1\. /.test(md2) && /✔ 選了這個/.test(md2), md2.slice(0, 600));
A.check("自己打字的行動另外註明", md2.includes("（沒選現成的，自己寫：自己打的行動）"));
A.check("旁白完整資料只留最新10回合、不含正文", ev("state.devAiLog.length") === 10 && ev("state.devAiLog.every(x=>!('narrative' in x.data) && !('action_result' in x.data))") && md2.includes("## 附錄：旁白回傳的完整資料"));

// 數值說明
const tips = [...doc.querySelectorAll("#panel-stats .has-tip")].map(x => x.dataset.tip);
A.check("16.3.4 數值面板六項都有說明(存款＋五項能力)", ["存款","健康","才識","表達力","外表","人脈"].every(k => tips.includes(k)), tips);
const hb = doc.querySelector("#panel-stats .has-tip[data-tip='健康']");
hb.click();
A.check("點一下顯示(tip-open)，內容有用在哪裡與怎麼增減", hb.classList.contains("tip-open") && /用在哪裡/.test(hb.textContent) && /怎麼增減/.test(hb.textContent));
hb.click();
A.check("再點一下收起", !hb.classList.contains("tip-open"));
A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));

// ================= 沒有dev旗標：看不到測試選單 =================
const m = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "storykey02" });
await H.startNewLife(m);
await H.waitIdle(m, 900);
A.check("沒有?dev=1：頂部列沒有🧪、沒有測試面板", !m.win.document.querySelector(".test-btn") && !m.win.document.getElementById("panel-test") && !m.win.document.getElementById("dev-fab"));
A.check("mock：開場回合交段落清單也正常顯示", !!m.win.document.getElementById("latest-entry"));
await H.playTurn(m); await H.waitIdle(m, 900);
A.check("沒有?dev=1：不留旁白完整資料", !m.ev("state.devAiLog"));
// 首頁(有dev旗標)：右上角浮動鈕
const h2 = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "storykey03", dev: true });
h2.ev("state = {phase:'home'}; render()");
A.check("首頁等沒有頂部列的畫面：🧪固定在右上角", !!h2.win.document.getElementById("dev-fab"));
h2.win.document.getElementById("dev-fab").click();
A.check("首頁點🧪開彈窗，沒有人生時不能下載", !!h2.win.document.getElementById("test-menu-modal") && !h2.win.document.getElementById("dev-download-story"));

process.exit(A.report() ? 0 : 1);
