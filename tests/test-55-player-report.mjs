// 2026-09-30：十、10.11 玩家回報機制＋10.10.3第二版點數紀錄(結果欄)＋「啟程禮」改名（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("玩家回報機制與點數紀錄");
let failing = false;
const fake = H.makeFakeAnthropic({ fail: () => failing });
H.installUpstream(fake);
const BILLING = "https://docs.google.com/forms/d/e/1FAIpQLSf4f1DheYeMzv-KF7e0zqSsTnCT38DT5J3BnrV2l7BLGiQYrA/viewform";
const GAME = "https://docs.google.com/forms/d/e/1FAIpQLSc0LPc0bVRKdnaN5AZol48gFcwHMHMmD5XYwrifJnRQ0dtHgg/viewform";

const KEY = "rep0000001";
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: KEY });
const ev = g.ev, doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
const opened = [];
g.win.open = (u, t, f) => { opened.push({ u, t, f }); return null; };
let copied = null, clipMode = "ok";
Object.defineProperty(g.win.navigator, "clipboard", { configurable: true, value: { writeText: (t) => clipMode === "ok" ? (copied = t, Promise.resolve()) : Promise.reject(new Error("denied")) } });
const tick = () => new Promise(r => setTimeout(r, 10));

await H.startNewLife(g);
await H.playTurn(g, "嗯");
ev("render()");

// ---------- 啟程禮改名 ----------
ev("renderWalletModal()");
const wtxt = doc.getElementById("wallet-modal").textContent;
A.check("改名：錢包顯示「啟程點」「啟程禮」，沒有「禮包」字樣", /啟程點/.test(wtxt) && !/禮包/.test(wtxt), wtxt.slice(0, 300));
doc.getElementById("wallet-modal").remove();
A.check("改名：程式內部欄位名稱不變(ap.gift、AP_NEW_LIFE_GIFT)", ev("typeof ensureAP(state).gift") === "number" && ev("AP_NEW_LIFE_GIFT") === 55);

// ---------- 10.10.3 第二版：結果欄、失敗回合 ----------
const rowsOf = () => js("state.apLog").filter(e => e.type === "回合" || e.type === "開場").map(e => [e.type, e.n, e.ok]);
A.check("10.10.3 開場記「0｜開場｜成功」、正常回合記「-1｜回合｜成功」", JSON.stringify(rowsOf()) === '[["開場",0,true],["回合",-1,true]]', rowsOf());
failing = true;
await H.playTurn(g, "再來一回");
failing = false;
const afterFail = rowsOf();
A.check("10.10.3 失敗回合(第一次＋重試都失敗)只留一筆「0｜回合｜失敗」，沒有-1", JSON.stringify(afterFail.slice(2)) === '[["回合",0,false]]', afterFail);
A.check("10.10.3 失敗那次AI呼叫了不只一次(重試合併成一筆)", fake.calls.length >= 4, fake.calls.length);
await H.playTurn(g, "重新來過");
A.check("10.10.3 之後再試成功另寫「-1｜回合｜成功」", JSON.stringify(rowsOf().slice(3)) === '[["回合",-1,true]]', rowsOf());
// 雲端暫停(本機扣點、失敗退點)的失敗回合同樣記0失敗
const gl = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "rep0000002", cloud: false, dev: true });
await H.startNewLife(gl);
// 測試不扣點開著時不寫入(本機生效的情境)
gl.ev("setApTestFree(true)");
const n0 = gl.ev("(state.apLog||[]).length");
await H.playTurn(gl, "測試中");
gl.ev("setApTestFree(false)");
A.check("10.3.12 測試不扣點期間不寫入紀錄(回合、開場都不記)", gl.ev("(state.apLog||[]).length") === n0, gl.ev("JSON.stringify(state.apLog)"));
failing = true; await H.playTurn(gl, "本機失敗"); failing = false;
const lrows = JSON.parse(gl.ev(`JSON.stringify(state.apLog.filter(e=>e.type==='回合'||e.type==='開場').map(e=>[e.type,e.n,e.ok]))`));
A.check("10.8 雲端暫停：本機先扣、失敗再退，合併成「0｜回合｜失敗」", JSON.stringify(lrows.slice(-1)) === '[["回合",0,false]]', lrows);

// ---------- 10.11 兩顆按鈕 ----------
ev("renderWalletModal()");
opened.length = 0;
const repBtn = doc.getElementById("btn-wallet-report");
A.check("10.11.3 錢包裡有「回報帳務問題」", !!repBtn && repBtn.textContent.trim() === "回報帳務問題");
repBtn.click(); await tick();
A.check("10.11.3 第一步只複製、不開表單(兩步不可合併)", copied && opened.length === 0, opened);
const msg = doc.getElementById("billing-report-msg");
A.check("10.11.3 提示「已複製，請到表單貼在『問題說明』欄」", msg && msg.textContent.includes("已複製，請到表單貼在『問題說明』欄"), msg && msg.textContent);
A.check("10.11.3 成功時不出現文字框", !doc.getElementById("billing-report-text"));
doc.getElementById("btn-billing-report-go").click();
A.check("10.11 前往表單：開帳務表單、新分頁、網址不帶任何資料", opened.length === 1 && opened[0].u === BILLING && opened[0].t === "_blank" && !opened[0].u.includes("?"), opened);
doc.getElementById("btn-billing-report-close").click();
doc.getElementById("wallet-modal").remove();

// 選單「回報遊戲問題」
ev("setPanel('menu')");
const gameLink = doc.getElementById("link-report-game");
A.check("10.11.5 選單有與「行動點錢包」並列的「回報遊戲問題」", !!gameLink && gameLink.textContent.includes("回報遊戲問題") && !!doc.getElementById("link-wallet"));
opened.length = 0; copied = null;
const beforeHTML = doc.getElementById("app").innerHTML.length;
gameLink.click(); await tick();
A.check("10.11.5 直接開遊戲問題表單(新分頁)、不複製任何內容、不跳視窗", opened.length === 1 && opened[0].u === GAME && opened[0].t === "_blank" && copied === null && !doc.getElementById("billing-report-modal"), { opened, copied });
A.check("10.11.2 兩個網址各自是常數、都是填寫連結", ev("REPORT_FORM_URLS.billing") === BILLING && ev("REPORT_FORM_URLS.game") === GAME);
ev("setPanel(null)");

// ---------- 10.11.4 複製內容 ----------
ev(`state.apLog = [
  {t:Date.UTC(2026,8,29,12,10), d:'2026-09-29', type:'回合', n:-1, ok:true},
  {t:Date.UTC(2026,8,30,0,0), d:'2026-09-30', type:'每日補點', n:5, ok:true},
  {t:Date.UTC(2026,8,30,5,58), d:'2026-09-30', type:'回合', n:-1, ok:true},
  {t:Date.UTC(2026,8,30,6,5), d:'2026-09-30', type:'回合', n:0, ok:false},
  {t:Date.UTC(2026,8,30,6,12), d:'2026-09-30', type:'回合', n:-1, ok:true},
  {t:Date.UTC(2026,8,30,6,13), d:'2026-09-30', type:'新手禮包', n:55}
]`);
const txt = ev("walletReportText(state)");
const lines = txt.split("\n");
A.check("10.11.4 格式：標題／複製時間(台灣)／目前餘額／信箱／啟程禮", lines[0] === "【點數明細】" && /^複製時間：\d+\/\d+ \d{2}:\d{2}（台灣時間）$/.test(lines[1]) && /^目前餘額：\d+ 點$/.test(lines[2]) && lines[3] === "信箱：未綁" && lines[4] === "啟程禮：已領", lines.slice(0, 6));
A.check("10.11.4 最近補點：月/日 時:分，+N 點(台灣時間 9/30 08:00)", lines[5] === "最近補點：9/30 08:00，+5 點", lines[5]);
const i5 = lines.indexOf("【最近 5 筆】");
A.check("10.11.4 最近5筆由新到舊、每筆「月/日 時:分｜變動｜原因｜結果」", i5 > 0 && lines.slice(i5 + 1).join("|") === "9/30 14:13｜+55｜啟程禮｜成功|9/30 14:12｜-1｜回合｜成功|9/30 14:05｜0｜回合｜失敗|9/30 13:58｜-1｜回合｜成功|9/30 08:00｜+5｜每日補點｜成功", lines.slice(i5));
A.check("10.11.4 舊存檔的「新手禮包」紀錄顯示為啟程禮", !/新手禮包|禮包點/.test(txt));
A.check("10.11.4 正常失敗回合是「0｜回合｜失敗」", txt.includes("｜0｜回合｜失敗"));
A.check("10.11.4 不含復原金鑰、信箱本身、故事正文", !txt.includes(KEY) && !txt.includes(ev("localStorage.getItem(RECOVERY_KEY_STORAGE_NAME)")) && !/@/.test(txt) && !txt.includes((ev("(state.log[state.log.length-1]||{}).text")||"\u0000").slice(0, 12)), txt);
// 沒有每日補點紀錄
ev(`state.apLog = [{t:Date.UTC(2026,8,30,6,12), d:'2026-09-30', type:'回合', n:-1, ok:true}]`);
const t2 = ev("walletReportText(state)");
A.check("10.11.4 沒有每日補點紀錄的玩家，整行「最近補點」不出現", !/最近補點/.test(t2), t2);
A.check("10.11.4 紀錄不滿5筆時有幾筆列幾筆", t2.split("【最近 5 筆】\n")[1].split("\n").length === 1);
A.check("10.11.4 沒領過啟程禮：寫「未領」", /啟程禮：未領/.test(t2) || ev("giftClaimedFor(state)") === true, t2);
// 沒有紀錄
ev(`state.apLog = []; state.giftGranted = false`);
const t3 = ev("walletReportText(state)");
A.check("10.11.4 完全沒有紀錄：「最近 5 筆」底下寫「目前沒有紀錄」", t3.endsWith("【最近 5 筆】\n目前沒有紀錄"), t3);
A.check("10.11.4 沒領過啟程禮寫「未領」", /啟程禮：未領/.test(t3), t3);
ev(`delete state.apLog`);
A.check("10.11.4 舊存檔沒有apLog也不出錯", ev("walletReportText(state)").endsWith("目前沒有紀錄"));

// ---------- 複製失敗的備案 ----------
clipMode = "deny"; opened.length = 0;
ev(`state.apLog = [{t:Date.UTC(2026,8,30,6,12), d:'2026-09-30', type:'回合', n:-1, ok:true}]`);
ev("renderWalletModal()");
doc.getElementById("btn-wallet-report").click(); await tick();
const ta = doc.getElementById("billing-report-text");
A.check("10.11.3 複製失敗：跳出文字框，內容就是點數明細", !!ta && ta.value === ev("walletReportText(state)").replace(/複製時間：[^\n]*/, m => ta.value.match(/複製時間：[^\n]*/)[0]), ta && ta.value);
A.check("10.11.3 文字框內容已全選", ta && ta.selectionStart === 0 && ta.selectionEnd === ta.value.length && ta.value.length > 20, ta && [ta.selectionStart, ta.selectionEnd, ta.value.length]);
A.check("10.11.3 備案畫面同樣有「前往表單」，按了開帳務表單", (doc.getElementById("btn-billing-report-go").click(), opened.length === 1 && opened[0].u === BILLING), opened);
A.check("10.11.3 沒有clipboard功能的瀏覽器也走備案", (() => { Object.defineProperty(g.win.navigator, "clipboard", { configurable: true, value: undefined }); return true; })());
doc.getElementById("billing-report-modal").remove();
doc.getElementById("btn-wallet-report").click(); await tick();
A.check("10.11.3 沒有clipboard時跳文字框", !!doc.getElementById("billing-report-text"));

// ---------- 10.9.7 第4項：回憶錄、人生之書閱讀頁、行動點錢包都不呼叫AI ----------
{
  await H.waitIdle(g, 30);
  const before = fake.calls.length;
  for (const id of ["billing-report-modal", "wallet-modal"]) { const el = doc.getElementById(id); if (el) el.remove(); }
  await ev("(async()=>{ await ensureArchivedContent(state); renderMemoirModal(); })()");
  const memOpen = !!doc.getElementById("memoir-modal") || doc.body.innerHTML.includes("btn-memoir-close");
  ev("openBookPage(ensureBook(state), { owner: state.name })");
  ev("renderWalletModal()");
  await tick(); await H.waitIdle(g, 50);
  A.check("10.9.7-4 回憶錄有打開", memOpen);
  A.check("10.9.7-4 打開回憶錄、人生之書閱讀頁、行動點錢包，都沒有呼叫AI", fake.calls.length === before, [before, fake.calls.length]);
}

// ---------- 時間一律台灣 ----------
A.check("10.11.4 taipeiMDHM：UTC 6:12＝台灣14:12", ev("taipeiMDHM(Date.UTC(2026,8,30,6,12))") === "9/30 14:12" && ev("taipeiMDHM(Date.UTC(2026,8,30,16,5))") === "10/1 00:05");
A.check("10.11.6 點數增減寫「+5」「-1」「0」", ev("[apLogChangeText(5),apLogChangeText(-1),apLogChangeText(0)].join(',')") === "+5,-1,0");
const realErrors = [...g.errors, ...gl.errors].filter(e => !/fake upstream error/.test(String(e))); // 故意讓上游失敗的那幾回合會留console.error
A.check("頁面沒有非預期的腳本錯誤", realErrors.length === 0, realErrors.slice(0, 2).map(String));
process.exit(A.report() ? 0 : 1);
