// 2026-09-30：月份顯示(二、2.8.1／十六、16.14／十五、15.8)（全程假上游，不打真實API）
import path from "path";
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("月份顯示");
let lastPayload = null;
let override = () => ({});
const fake = H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } });
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "mon0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = "ap:mon0000001:0"; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
await H.playTurn(g, "嗯");
const title = ev("computeMonthTitle(state)");
A.check("大標題格式「年級・學期・月份」", /^高一・(上學期|下學期|寒假|暑假)・\d{1,2}月$/.test(title), title);
const doc = g.win.document;
A.check("頂部大標題顯示月份", /・\d{1,2}月/.test(doc.querySelector(".tb-stage").textContent), doc.querySelector(".tb-stage").textContent);
const prog = ev("JSON.stringify(computeStageProgress(state))");
A.check("小字進度行只留階段名稱", !/學期/.test(JSON.parse(prog).shortLabel || "學期"), prog);
const last = JSON.parse(ev("JSON.stringify(state.log[state.log.length-1])"));
A.check("日記回合標題含月份", /・\d{1,2}月/.test(last.timeLabel) || /^高一・(寒假|暑假)$/.test(last.timeLabel), last.timeLabel);
A.check("labelWithMonth：學期後接月份、階段名稱在後", ev(`labelWithMonth("高三・上學期・期末準備期",{start:${ev("state.timeState.cal.lastRoundEnd")},end:${ev("state.timeState.cal.lastRoundEnd")}})`).startsWith("高三・上學期・") && /・\d+月・期末準備期$/.test(ev(`labelWithMonth("高三・上學期・期末準備期",{start:0,end:0})`)));
A.check("labelWithMonth：寒暑假、出社會後沒有階段名稱時直接接月份", ev(`labelWithMonth("高二・暑假",{start:0,end:0})`) === "高二・暑假・8月" && ev(`labelWithMonth("30歲",{start:0,end:0})`) === "30歲・8月" && ev(`labelWithMonth("入職第2年・上半年",{start:0,end:0})`) === "入職第2年・上半年・8月" && ev(`labelWithMonth("大二・休學中",{start:0,end:0})`) === "大二・休學中・8月");
A.check("labelWithMonth：已經有月份不重複加", ev(`labelWithMonth("高二・暑假・7月",{start:0,end:0})`) === "高二・暑假・7月");

// ---------- 本回合時間範圍、靠近推遠欄位、interest_event必填檢查 ----------
await H.playTurn(g, "嗯");
const mr = lastPayload.time_context && lastPayload.time_context.month_range;
A.check("2.8.1 每回合提示放入本回合時間範圍", typeof mr === "string" && /^\d+月(上|中|下)旬(～\d+月(上|中|下)旬)?$/.test(mr), mr);
A.check("monthRangeText：同一旬只寫一段", ev("monthRangeText(0,0)") === ev("monthRangeText(0,0)").split("～")[0] && /^\d+月(上|中|下)旬$/.test(ev("monthRangeText(0,0)")));
const nr = (x) => JSON.parse(ev(`JSON.stringify(normalizeResponseRating(${JSON.stringify(x)}, false))`));
A.check("18.16.3 response_rating.approach 正規化：靠近／推遠／中性保留，亂填變null", nr({ grade: "good", approach: "approach", approach_type: "接住感受" }).approach === "approach" && nr({ grade: "good", approach: "away" }).approach === "away" && nr({ grade: "good", approach: "亂寫" }).approach === null && nr({ grade: "good" }).approach === null);
const flagsBefore = ev("(state.reviewFlags||[]).length");
override = () => ({ interest_event: { reaction: "positive" } });
ev("state.focus='rest'");
await H.playTurn(g, "嗯");
override = () => ({});
A.check("1.2.18 interest_event有reaction卻沒有category：寫入錯誤紀錄", ev("(state.reviewFlags||[]).some(f=>f.key==='interest_event_no_category' || f.type==='interest_event_no_category' || JSON.stringify(f).includes('interest_event_no_category'))"), ev("JSON.stringify((state.reviewFlags||[]).slice(-3))"));
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：本回合時間範圍與靠近推遠規則", ["month_range", "approach", "approach_type", "不得寫出超出此範圍"].every(k => prompt.includes(k)));
A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
