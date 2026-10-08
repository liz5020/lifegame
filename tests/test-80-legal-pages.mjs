// 2026-10-08 十、10.16 說明頁面：三個靜態頁（terms.html／privacy.html／pricing.html）的內容與樣式、頁首頁尾、版本號與前端設定值一致、
// 首頁頁尾與錢包的連結、開場同意頁的條款連結、build-pages.sh 有放進 dist/（不呼叫任何後台，全程不打真實API）
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { JSDOM } from "jsdom";
import * as H from "./harness.mjs";
const A = H.makeAsserter("10.16 說明頁面");
const R = f => fs.readFileSync(path.join(H.ROOT, f), "utf8");
const pages = { terms: R("terms.html"), privacy: R("privacy.html"), pricing: R("pricing.html") };
const doc = {};
for (const k of Object.keys(pages)) doc[k] = new JSDOM(pages[k]).window.document;
const visible = k => { const c = doc[k].body.cloneNode(true); c.querySelectorAll("script").forEach(x => x.remove()); return c.textContent.replace(/\s+/g, " "); }; // 只看使用者看得到的文字（不含script）
const T = visible;
const designDoc = R("life-sim-design/10-存檔與帳號系統.md");

// ---- 網址與檔案 ----
A.check("三個頁面檔案存在，build-pages.sh 把它們放進 dist/", execFileSync("sh", ["-c", "cat build-pages.sh"], { cwd: H.ROOT }).toString().includes("terms.html privacy.html pricing.html"));
const tmp = fs.mkdtempSync("/tmp/pages-");
execFileSync("sh", ["-c", `rm -rf dist && mkdir dist && cp index.html og.png lunar.min.js terms.html privacy.html pricing.html dist/ && ls dist`], { cwd: H.ROOT });
A.check("dist/ 有三個說明頁（Pages 會把 /terms 對應到 terms.html）", ["terms.html", "privacy.html", "pricing.html"].every(f => fs.existsSync(path.join(H.ROOT, "dist", f))));
execFileSync("rm", ["-rf", path.join(H.ROOT, "dist")]);
A.check("純靜態：頁面不呼叫後台（沒有 fetch／XMLHttpRequest／WORKER_URL）也不讀玩家資料（沒有 localStorage）", Object.values(pages).every(h => !/fetch\(|XMLHttpRequest|WORKER_URL|localStorage/.test(h)));
A.check("不引用外部資源（沒有外部 script／link／圖片）", Object.values(pages).every(h => !/(src|href)=["']https?:\/\/(?!draftmylife)/.test(h) || /href="mailto:/.test(h)) && Object.values(pages).every(h => !/<link /.test(h) && !/@import/.test(h)));
A.check("手機好讀：有 viewport、寬度不超出、表格可橫向捲動", Object.values(pages).every(h => /name="viewport"/.test(h) && /max-width:720px/.test(h)) && /table-wrap/.test(pages.pricing));
A.check("支援深色模式", Object.values(pages).every(h => /prefers-color-scheme:dark/.test(h)));

// ---- 版本與日期 ----
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "legal0001" });
const ver = g.ev("LEGAL_DOCS_VERSION"), upd = g.ev("LEGAL_DOCS_UPDATED");
A.check("條款與隱私的版本號存成設定值（前端 LEGAL_DOCS_VERSION＝1.0、最後更新日期）", ver === "1.0" && upd === "2026 年 10 月 8 日", [ver, upd]);
A.check("/terms、/privacy 最上方：「版本 1.0｜最後更新 2026 年 10 月 8 日」，與設定值一致", T("terms").includes(`版本 ${ver}｜最後更新 ${upd}`) && T("privacy").includes(`版本 ${ver}｜最後更新 ${upd}`));
A.check("/pricing 只標「最後更新 2026 年 10 月 8 日」，不標版本號", T("pricing").includes(`最後更新 ${upd}`) && !/版本 \d/.test(T("pricing")));
A.check("三頁最上方都有「回到遊戲」連結（連回首頁）", Object.keys(doc).every(k => { const a = doc[k].querySelector(".top a"); return a && a.textContent.includes("回到遊戲") && a.getAttribute("href") === "/"; }));

// ---- 頁尾經營者資訊 ----
A.check("三頁頁尾都有經營者資訊區塊（逐字）、另外兩頁的連結；不出現本名、地址、電話、統一編號", Object.keys(doc).every(k => { const f = doc[k].querySelector("footer").textContent.replace(/\s+/g, ""); return f.includes("經營者：人生草稿（個人經營）") && f.includes("客服信箱：support@draftmylife.com") && f.includes("回覆時間：3個工作天內") && doc[k].querySelectorAll("footer .links a").length === 2; }) && Object.values(pages).every(h => !/統一編號|電話：|地址：/.test(h)));

// ---- 全文逐字：和設計文件裡的全文區塊一致（逐行比對，扣掉給程式的出現條件說明）----
function block(sec) { const i = designDoc.indexOf("### " + sec + " "); const a = designDoc.indexOf("````markdown\n", i) + 13; return designDoc.slice(a, designDoc.indexOf("\n````", a)); }
function sentences(md) { return md.split("\n").map(l => l.replace(/^#+ |^\d+\. |^- |\*\*/g, "").replace(/^\|.*\|$/, "").trim()).filter(l => l && !/^（.*(出現條件|加錨點|開放購買|優惠期間|第七條連到).*）$/.test(l) && !/^（此標題加錨點/.test(l)); }
for (const [k, sec] of [["terms", "10.16.6"], ["privacy", "10.16.7"], ["pricing", "10.16.8"]]) {
  const txt = T(k).replace(/\s+/g, "");
  const missing = sentences(block(sec)).filter(l => !txt.includes(l.replace(/\s+/g, "")));
  A.check(`${k}：全文逐字放進頁面（設計文件 ${sec} 的每一句都在）`, missing.length === 0, missing.slice(0, 3));
}
A.check("服務條款共十二條，第七條「退款說明」有錨點 id=refund（錢包的「退款說明」連到 /terms#refund）", doc.terms.querySelectorAll("h2").length === 12 && doc.terms.getElementById("refund").textContent === "七、退款說明");
A.check("條款 1.0 不寫奇幻通行證，也沒有月費方案", !/通行證|月費/.test(T("terms")));
A.check("條款第一條預告新玩法；加贈點數用「活動加贈」通用寫法", /之後會陸續推出新的玩法與方案/.test(T("terms")) && /活動加贈/.test(T("terms")));
A.check("隱私權政策第二條逐項列出收集的資料，並寫明管理員查看存檔、整體統計無法拆出個人", ["信箱：", "復原金鑰與雲端存檔：", "行動點與購買紀錄：", "使用量紀錄：", "回報內容：", "付款資料：", "整體統計："].every(x => T("privacy").includes(x)) && /管理員為了改善遊戲、維護與除錯，可以查看存檔內容/.test(T("privacy")) && /紀錄保留 180 天/.test(T("privacy")));

// ---- 收費說明的出現條件 ----
A.check("開放購買前：有「購買功能準備中，開放時會在遊戲內公告。」、沒有首月優惠那一行（頁面上看得到的）", !doc.pricing.getElementById("prep-note").hasAttribute("hidden") && doc.pricing.getElementById("launch-offer").hasAttribute("hidden"));
A.check("頁面上不出現給程式的出現條件說明（括號註記）", !/出現條件|開放購買前才出現|優惠期間從開放購買當天起算/.test(T("pricing")) && !/加錨點/.test(T("terms")));
A.check("頁面預設開放日期 PURCHASE_OPENED_ON＝null（開放購買時才填）；首月天數 30", /var PURCHASE_OPENED_ON = null;/.test(pages.pricing) && /var LAUNCH_OFFER_DAYS = 30;/.test(pages.pricing));
{ // 模擬開放購買：開放日填入、優惠期間內顯示首月優惠並拿掉準備中；期間外都不顯示
  const run = (opened, nowMs) => { const d = new JSDOM(pages.pricing.replace("var PURCHASE_OPENED_ON = null;", `var PURCHASE_OPENED_ON = "${opened}";`), { runScripts: "dangerously", beforeParse(w) { const RD = w.Date; w.Date = class extends RD { static now() { return nowMs; } }; w.Date.parse = RD.parse; } }); return { prep: d.window.document.getElementById("prep-note").hidden, offer: d.window.document.getElementById("launch-offer").hidden }; };
  const open = Date.parse("2026-11-01T00:00:00+08:00");
  A.check("開放購買後第5天：準備中那行拿掉、顯示「開站首月，第一次購買多送 10%。」", JSON.stringify(run("2026-11-01", open + 5 * 86400000)) === JSON.stringify({ prep: true, offer: false }), run("2026-11-01", open + 5 * 86400000));
  A.check("開放購買滿 30 天後：首月優惠那行自動拿掉", run("2026-11-01", open + 31 * 86400000).offer === true && run("2026-11-01", open + 31 * 86400000).prep === true);
}
A.check("點數包表格逐項正確（短篇 99 元 90 點／中篇 499 元 600 點／長篇 999 元 1,300 點）與說明", /短篇.*99 元.*90 點.*先試試看/.test(T("pricing")) && /中篇.*499 元.*600 點.*約半段人生/.test(T("pricing")) && /長篇.*999 元.*1,300 點.*約一段人生/.test(T("pricing")));
A.check("收費說明不寫「付費不會讓人生比較順」（內部原則不對外），寫「付費帶來什麼」；免費點數不寫數字；有「奇幻人生，即將推出」", !/不會讓人生比較順|不會讓結局比較好/.test(T("pricing")) && /付費讓你可以寫更多段人生，也能體驗更多樣的玩法/.test(T("pricing")) && /奇幻人生，即將推出/.test(T("pricing")) && !/奇幻通行證|99 元.*30 天/.test(T("pricing")));
A.check("退款連到服務條款第七條（頁面寫「退款規則請見《服務條款》第七條」）", /退款規則請見《服務條款》第七條/.test(T("pricing")));

// ---- 遊戲裡的連結 ----
const home = g.win.document;
A.check("首頁最下方：「奇幻人生，即將推出」與小字「收費說明｜服務條款｜隱私權政策」，三個連結開新分頁；沒有聯絡信箱", home.getElementById("home-soon").textContent === "奇幻人生，即將推出" && [...home.querySelectorAll("#home-legal a")].map(a => a.textContent + a.getAttribute("href") + a.target).join("|") === "收費說明/pricing_blank|服務條款/terms_blank|隱私權政策/privacy_blank" && !/support@|mailto:/.test(home.querySelector(".home-foot").innerHTML));
g.ev("renderWalletModal()");
A.check("錢包的三行連結（含 /terms#refund）", !!home.querySelector('#wallet-legal-links a[href="/terms#refund"]') && !!home.querySelector('#wallet-legal-links a[href="/pricing"]') && !!home.querySelector('#wallet-legal-links a[href="/terms"]') && !!home.querySelector('#wallet-legal-links a[href="/privacy"]'));
A.check("錢包選單開放購買前不放購買按鈕（沿用）", !/購買點數|立即購買/.test(home.getElementById("wallet-modal").textContent));
home.getElementById("wallet-modal").remove();
const g2 = await H.loadGame({ useMock: true, env: H.makeEnv(), key: null, cloud: false, consent: false });
await new Promise(r => setTimeout(r, 40));
g2.ev("showConsentGate(()=>{})");
const gate = g2.win.document.getElementById("consent-gate");
A.check("開場同意頁：1～4 點原文不變，按鈕上方多一行「按〔同意並開始〕，代表你同意《服務條款》與《隱私權政策》。」，連結開新分頁", !!gate && gate.querySelectorAll("li").length === 4 && /按〔同意並開始〕，代表你同意《服務條款》與《隱私權政策》。/.test(gate.querySelector("#consent-legal").textContent) && [...gate.querySelectorAll("#consent-legal a")].every(a => a.target === "_blank") && gate.querySelector('#consent-legal a[href="/terms"]') && gate.querySelector('#consent-legal a[href="/privacy"]'));
A.check("同意頁文字順序：四點→條款連結那一行→按鈕", (() => { const h = gate.innerHTML; return h.indexOf("有任何問題與建議") < h.indexOf("consent-legal") && h.indexOf("consent-legal") < h.indexOf("btn-consent-agree"); })());
A.check("整段沒有前端錯誤", g.errors.length + g2.errors.length === 0, [...g.errors, ...g2.errors].map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
