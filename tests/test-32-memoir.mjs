// 2026-09-28：十六、16.6 回憶錄時間軸（全程USE_MOCK，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("十六 回憶錄時間軸");
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "memoirkey1" });
const ev = g.ev, doc = g.win.document;
ev("MOCK_AI_DELAY_MS = 0");
await H.startNewLife(g, { name: "林以晴" });
for (let i = 0; i < 6; i++) { await H.playTurn(g); await H.waitIdle(g, 5); }

// 1. 新日記記下當時存款
const lastCash = ev("state.log[state.log.length-1].cash");
A.check("新日記記下當時存款(cash)", typeof lastCash === "number" && lastCash === ev("state.cash"), lastCash);

// 2. 分組
const grp = (label, age) => JSON.parse(ev(`JSON.stringify(memoirGroupOf({timeLabel:${JSON.stringify(label)}, age:${age}}))`));
A.check("學期一個節點：高一・上學期・期中準備期 → 高一・上學期／子階段期中準備期", (() => { const x = grp("高一・上學期・期中準備期", 15); return x.name === "高一・上學期" && x.sub === "期中準備期"; })());
A.check("假期一個節點：高二・寒假", grp("高二・寒假", 16).name === "高二・寒假");
A.check("延畢標籤也能分組：大四・已延畢1年・下學期・期末準備期", (() => { const x = grp("大四・已延畢1年・下學期・期末準備期", 23); return x.name === "大四・已延畢1年・下學期" && x.sub === "期末準備期"; })());
A.check("畢業倒數括號不影響分組", grp("大四・暑假（畢業倒數）", 22).name === "大四・暑假");
A.check("開場段落自成一個節點", grp("高一開學前・暑假最後一天", 15).name === "高一開學前");
A.check("出社會後每一歲一個節點，名稱沿用階段(初入社會)", (() => { const a = grp("入職第2年・上半年", 24), b = grp("入職第2年・下半年", 24), c = grp("入職第3年・上半年", 25); return a.key === b.key && a.key !== c.key && a.name === "初入社會" && a.sub === "入職第2年・上半年"; })());
A.check("30歲以後、放置期間也按年齡分", grp("35歲", 35).name === "職涯發展" && grp("35歲", 35).sub === "" && grp("放置期間", 35).key === grp("35歲", 35).key);

// 3. 重大事件標記
ev("state.log.forEach(e=>delete e.major); state.chronicleSeen = state.chronicle.length");
ev("state.chronicle.push('（15歲）測試用的人生履歷條目'); render()");
A.check("人生履歷變長時，標在最新一則日記上", ev("state.log[state.log.length-1].major") === true && ev("state.chronicleSeen") === ev("state.chronicle.length"));
ev("render()");
A.check("沒有新履歷不會多標", ev("state.log.filter(e=>e.major).length") === 1);
ev("delete state.chronicleSeen; state.log.forEach(e=>delete e.major); state.chronicle.push('x'); render()");
A.check("舊存檔第一次比對只記長度、不回頭補標", ev("state.log.filter(e=>e.major).length") === 0 && typeof ev("state.chronicleSeen") === "number");
// 等待旁白時不比對
ev("state.chronicle.push('y'); render(true)");
A.check("等待旁白時不標(留給這回合的新日記)", ev("state.log.filter(e=>e.major).length") === 0);
ev("render()");
ev("state.log[1].major = true");

// 4. 畫面
ev("state.log.push({age:15, timeLabel:null, text:'（旁白剛剛恍神了一下）', error:true})");
ev("renderMemoirModal()");
const m = doc.getElementById("memoir-modal");
const nodes = [...m.querySelectorAll(".tl-node")];
const items = [...m.querySelectorAll(".tl-item")];
A.check("每則回憶一個項目(錯誤訊息不列)", items.length === ev("state.log.filter(e=>!e.error).length"), items.length);
A.check("由舊到新往下排：第一則是開場", /開場|高一開學前/.test(nodes[0].textContent) || nodes[0].textContent.includes("高一開學前"), nodes[0] && nodes[0].textContent);
A.check("大節點用年齡印章樣式的圓章(內含年齡)＋階段名稱與「歲・階段」", nodes.length >= 2 && nodes.every(n => n.querySelector(".stamp.tl-stamp") && /\d+歲/.test(n.querySelector(".stamp").textContent) && /\d+歲・/.test(n.querySelector(".tl-node-sub").textContent)));
const meta = items[items.length - 1].querySelector(".tl-meta").textContent;
A.check("每則上方小字：子階段、當時存款", /存款 [\d,]+/.test(meta), meta);
A.check("故事前兩行(明體、收合)", items.every(it => it.querySelector(".tl-text") && !it.querySelector(".tl-card").classList.contains("open")));
const card = items[2].querySelector(".tl-card");
card.click();
const opened = card.classList.contains("open") && card.getAttribute("aria-expanded") === "true";
card.click();
A.check("點擊展開完整內容，再點收回", opened && !card.classList.contains("open"));
A.check("最新一則加外框(latest)", items[items.length - 1].classList.contains("latest") && m.querySelectorAll(".tl-item.latest").length === 1);
A.check("重大事件：小圓點改成小印章、卡片加淡珊瑚", items[1].classList.contains("major") && !!items[1].querySelector(".tl-mini-stamp") && !items[0].querySelector(".tl-mini-stamp"));
A.check("數值變化用膠囊", m.querySelectorAll(".tl-card .cap").length === m.querySelectorAll(".tl-card .caps .cap").length);
A.check("標題則數不含錯誤訊息", new RegExp(`共${items.length}則`).test(m.textContent));
doc.getElementById("btn-memoir-close").click();
A.check("關閉", !doc.getElementById("memoir-modal"));

// 5. 舊日記沒有cash時，從結算的balanceAfter補；都沒有就不顯示
A.check("舊日記：用settlement.balanceAfter", ev("memoirCashOf({settlement:{balanceAfter:321}})") === 321 && ev("memoirCashOf({})") === null);

// 6. 悔棋：重大事件標記跟著回到上一回合
ev("state.log.forEach(e=>delete e.major); state.chronicleSeen = state.chronicle.length");
await H.playTurn(g); await H.waitIdle(g, 5);
const before = ev("state.log.length");
ev("state.chronicle.push('（15歲）測試'); render()");
ev("restoreUndo()");
A.check("悔棋後標記與比對長度一起還原", ev("state.log.length") === before - 1 && ev("state.log.filter(e=>e.major).length") === 0);

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
