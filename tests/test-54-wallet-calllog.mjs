// 2026-09-30：十、10.9.4 逐筆成本量測、10.10 行動點錢包與點數紀錄（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("成本量測與行動點錢包");
const fake = H.makeFakeAnthropic({});
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "wal0000001" });
const ev = g.ev, doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
await H.startNewLife(g);
await H.playTurn(g, "嗯"); await H.playTurn(g); await H.playTurn(g);
ev("render()");

// ---------- 10.9.4 逐筆呼叫紀錄 ----------
const log = js("readCallLog()");
A.check("10.9.4 每次真實呼叫都逐筆記錄(3回合＋開場)", log.length >= 3, log.length);
A.check("10.9.4 第一筆是開場", log[0].kind === "opening", log[0]);
A.check("10.9.4 之後是一般回合", log.slice(1).every(r => r.kind === "turn"), log.map(r => r.kind));
const r1 = log[log.length - 1];
A.check("10.9.4 四種用量與估計花費有記", r1.in === 5000 && r1.cr === 20000 && r1.out === 1200 && r1.usd > 0, r1);
A.check("10.9.4 固定規則字數來自Worker", r1.rules > 1000, r1.rules);
A.check("10.9.4 送出內容各區塊字數(角色數值、NPC卡、玩家輸入)有值", r1.stats > 0 && r1.npc > 0 && r1.input > 0, r1);
A.check("10.9.4 前情提要與近期回合字數欄位存在(數字)", typeof r1.recap === "number" && typeof r1.recent === "number");
A.check("10.9.4 AI輸出分旁白正文與其他欄位", r1.narr > 0 && r1.other > 0, r1);
A.check("10.9.4 現有「這一世累計」維持不變", js("state.devUsage").calls === log.length, js("state.devUsage"));
A.check("10.9.4 紀錄不放進存檔本體(state沒有callLog)", ev("state.callLog") === undefined && !JSON.stringify(js("state")).includes("chars_rules"));
ev(`window.__k1 = callKindFor(state,'turn','nonce-x',false); window.__k2 = callKindFor(state,'turn','nonce-x',false); window.__k3 = callKindFor(state,'turn','nonce-y',true);`);
A.check("10.9.4 同一個turn_nonce第二次起算失敗重試／重新生成", ev("__k1") === "turn" && ev("__k2") === "retry", [ev("__k1"), ev("__k2")]);
A.check("10.9.4 強制結局回合算結局", ev("__k3") === "ending");
const csv = ev("callLogCSV()");
A.check("10.9.4 CSV有欄位列與逐筆資料", csv.split("\n").length === log.length + 1 && csv.includes("chars_rules") && csv.includes("開場"), csv.split("\n")[0]);
ev(`for(let i=0;i<520;i++) recordCallLog(state,{input:1,cache_write:0,cache_read:0,output:1,cost_usd:0.01},{kind:'turn'})`);
A.check("10.9.4 本機最多保留最近500筆", js("readCallLog().length") === 500);
const before = fake.calls.length;

// ---------- 10.10 錢包 ----------
A.check("10.10.1 上方行動點可點", !!doc.getElementById("ap-total") && doc.getElementById("ap-total").getAttribute("role") === "button");
doc.getElementById("ap-total").click();
const m = doc.getElementById("wallet-modal");
A.check("10.10.1 點上方行動點開啟錢包", !!m);
const txt = m ? m.textContent : "";
A.check("10.10.2 顯示合計、每日池X／5、永久池(啟程點/購買點)", /每日池 \d+／5/.test(txt) && /永久池 \d+（啟程點 \d+、購買點 \d+）/.test(txt), txt.slice(0, 200));
A.check("10.10.2 小字說明補點規則", txt.includes("00:00 補到 5 點") && txt.includes("不會過期"));
A.check("10.10.2 資料截至(台灣時間)", /資料截至 \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/.test(txt));
A.check("10.10.2 開放付費前不放購買按鈕與共用購買點(2026-09-30第二批起，未綁信箱玩家的錢包多一行綁定說明，見test-60)", !/購買點數|共用購買點/.test(txt));
A.check("10.11.3 錢包裡有「回報帳務問題」按鈕(表單網址已設定，不再依網址有無隱藏)", !!doc.getElementById("btn-wallet-report"));
A.check("10.10.3 啟程禮 +25 有記錄(改名，不再叫新手禮包)", /啟程禮/.test(txt) && txt.includes("+25") && !/新手禮包|禮包點/.test(txt), txt);
A.check("10.10.3(第二版) 每回合扣點與開場都記：開場0成功、回合-1成功", JSON.stringify(js("state.apLog").filter(e => e.type === "開場" || e.type === "回合").map(e => [e.type, e.n, e.ok])) === '[["開場",0,true],["回合",-1,true],["回合",-1,true],["回合",-1,true]]', js("state.apLog"));
A.check("10.10.3 錢包每筆呈現日期時間、變動、原因、結果", /\d+\/\d+ \d{2}:\d{2}　回合-1　成功|\d+\/\d+ \d{2}:\d{2}　回合.{0,4}-1　成功/.test(txt.replace(/\s+/g, "")) || (txt.includes("-1") && txt.includes("成功") && txt.includes("開場")), txt.slice(-300));
A.check("10.9.7-4 開啟錢包不呼叫AI", fake.calls.length === before);
doc.getElementById("btn-wallet-close").click();
A.check("10.10 可關閉", !doc.getElementById("wallet-modal"));
ev("setPanel('menu')");
A.check("10.10.1 選單有「行動點錢包」", !!doc.getElementById("link-wallet"));
doc.getElementById("link-wallet").click();
A.check("10.10.1 選單開啟錢包", !!doc.getElementById("wallet-modal"));
doc.getElementById("wallet-modal").remove();

// 每日補點記錄
ev(`state.apLog=[]; state.ap.daily=2; state.ap.lastRefillDate='2000-01-01'; window.__r = refillDailyIfNeeded(state)`);
A.check("10.10.3 每日補點只記實際補的數量(剩2補到5記+3)", ev("__r") === true && JSON.stringify(js("state.apLog").map(e => [e.type, e.n])) === '[["每日補點",3]]', js("state.apLog"));
ev(`state.apLog=[]; state.ap.daily=5; state.ap.lastRefillDate='2000-01-01'; refillDailyIfNeeded(state)`);
A.check("10.10.3 已有5點不記", js("state.apLog").length === 0);
// 其他入帳/扣點與30筆上限
ev(`for(let i=0;i<40;i++) apLogAdd(state,'購買',10)`);
A.check("10.10.3 只保留最近30筆", js("state.apLog.length") === 30);
ev(`state.apLog=[]; apLogAdd(state,'回顧這一生',-5)`);
A.check("10.10.3 扣點記負數", js("state.apLog")[0].n === -5);
ev(`state.apLog=[]; setApTestFree(true)`);
ev(`apLogAdd(state,'購買',10)`);
A.check("10.10.3 測試「不扣行動點」開著時不寫入紀錄", js("state.apLog.length") === 0 || ev("apTestFreeActive()") === false, js("state.apLog"));
ev(`setApTestFree(false)`);
ev("render()");
ev(`state.apLog=[{t:1,d:'2026-09-30',type:'新手禮包',n:55}]`); // 舊存檔：沒有ok欄、原因還叫新手禮包
// 其他進行中的人生與測試中顯示
ev(`localStorage.setItem(STORAGE_KEY+':1', JSON.stringify({phase:'playing',name:'第二人',ap:{daily:5,gift:10,purchased:0}}))`);
ev("renderWalletModal()");
const t2 = doc.getElementById("wallet-modal").textContent;
A.check("10.10.2 列出其他進行中的人生與點數", /其他進行中的人生/.test(t2) && t2.includes("第二人") && t2.includes("15 點"), t2);
doc.getElementById("wallet-modal").remove();
// 傳承／回溯記錄型別
ev(`window.__log = (function(){ const prev={ap:{daily:5,gift:20,purchased:3},apLog:[]}; const a=ensureAP(prev); const l=[]; if(a.gift+a.purchased>0) l.push('傳承繼承'); return l; })()`);
// 舊存檔沒有apLog不會出錯
ev(`delete state.apLog; renderWalletModal()`);
A.check("舊存檔沒有apLog也能開錢包", !!doc.getElementById("wallet-modal") && !/最近點數紀錄/.test(doc.getElementById("wallet-modal").textContent));
doc.getElementById("wallet-modal").remove();

// 測試選單匯出
const g2 = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "wal0000002", dev: true });
g2.ev("renderTestMenuModal()");
A.check("10.9.4 測試選單有匯出CSV", !!g2.win.document.getElementById("dev-download-calllog"));
A.check("模擬模式不產生呼叫紀錄", g2.ev("readCallLog().length") === 0);
A.check("頁面沒有腳本錯誤", g.errors.length === 0 && g2.errors.length === 0, g.errors.slice(0, 2).map(String));
process.exit(A.report() ? 0 : 1);
