// 2026-09-30：版本標記與玩家可見的更新紀錄（全程假上游，不打真實API）
// 檢查：index.html的APP_VERSION、RELEASE_NOTES最新一筆、worker.js的WORKER_VERSION、DEPLOY.md最新一行四處對得上
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("版本標記與更新紀錄");
const html = fs.readFileSync(path.join(H.ROOT, "index.html"), "utf8");
const workerSrc = fs.readFileSync(path.join(H.ROOT, "worker/worker.js"), "utf8");
const deploy = fs.existsSync(path.join(H.ROOT, "DEPLOY.md")) ? fs.readFileSync(path.join(H.ROOT, "DEPLOY.md"), "utf8") : "";
const VER = /^\d{4}\.\d{2}\.\d{2}-[a-z]$/;

const appVer = (html.match(/const APP_VERSION = "([^"]+)"/) || [])[1];
const workerVer = (workerSrc.match(/const WORKER_VERSION = "([^"]+)"/) || [])[1];
A.check("index.html有APP_VERSION且格式為YYYY.MM.DD-字母", VER.test(appVer || ""), appVer);
A.check("worker.js有WORKER_VERSION且格式正確", VER.test(workerVer || ""), workerVer);
A.check("DEPLOY.md存在，且記錄過目前的頁面版本號", !!deploy && deploy.includes(appVer), appVer);

const env = H.makeEnv();
const fake = H.makeFakeAnthropic({});
H.installUpstream(fake);
const g = await H.loadGame({ useMock: true, env, key: "ver0000001" });
const ev = g.ev;
const js = (x) => JSON.parse(ev(`JSON.stringify(${x})`));
const doc = g.win.document;

A.check("RELEASE_NOTES最新一筆的版本號＝APP_VERSION", js("RELEASE_NOTES[0].version") === appVer);
A.check("RELEASE_NOTES最新一筆的日期＝版本號的日期", js("RELEASE_NOTES[0].date") === appVer.slice(0, 10).replace(/\./g, "-"));
A.check("RELEASE_NOTES每筆都有日期、標題、至少一條說明，版本號不重複", js("RELEASE_NOTES.every(r=>/^\\d{4}-\\d{2}-\\d{2}$/.test(r.date)&&r.title&&r.items.length>0)") && js("new Set(RELEASE_NOTES.map(r=>r.version)).size===RELEASE_NOTES.length"));
A.check("RELEASE_NOTES由新到舊排列", js("RELEASE_NOTES.every((r,i)=>i===0||RELEASE_NOTES[i-1].version>=r.version)"));
A.check("更新說明不出現系統用語(好感度、投入度、行動點、訂單簿、重心、API、Worker、prompt)", !js("RELEASE_NOTES.some(r=>/好感度|投入度|行動點|訂單簿|重心|API|Worker|prompt/i.test(r.title+r.items.join()))"));

// 首頁頁尾看得到版本
A.check("首頁頁尾顯示版本號與日期", (doc.querySelector(".foot-copy") || {}).textContent && doc.querySelector(".foot-copy").textContent.includes(appVer));

// 遊戲中：抽屜「更新紀錄」與小紅點
await H.startNewLife(g);
ev("render()");
const bar = () => doc.getElementById("link-updates");
A.check("抽屜「其他」組有「更新紀錄」並顯示版本號", !!bar() && bar().closest(".bars") && bar().textContent.includes("更新紀錄") && bar().textContent.includes(appVer));
A.check("沒看過這一版：抽屜項目與選單鈕都有小紅點", !!bar().querySelector(".dot") && !!doc.querySelector("#btn-drawer .dot"));
bar().click();
const modal = doc.getElementById("updates-modal");
A.check("點更新紀錄：開啟視窗，列出各版日期、標題與說明", !!modal && modal.textContent.includes("更新紀錄") && modal.textContent.includes(js("RELEASE_NOTES[0].title")) && modal.querySelectorAll("li").length === js("RELEASE_NOTES.reduce((n,r)=>n+r.items.length,0)"));
A.check("視窗顯示目前版本號；測試模式不查伺服器", modal.querySelector("#updates-ver").textContent.includes(appVer) && modal.textContent.includes("測試模式"));
A.check("看過之後記下已讀版本、紅點消失", g.win.localStorage.getItem("lifegame_seen_version") === appVer && !doc.querySelector("#btn-drawer .dot") && !bar().querySelector(".dot"));
doc.getElementById("btn-updates-close").click();
A.check("關閉視窗", !doc.getElementById("updates-modal"));
ev("render()");
A.check("重新畫面後不再有紅點", !doc.querySelector("#btn-drawer .dot") && !bar().querySelector(".dot"));
g.win.localStorage.setItem("lifegame_seen_version", "2000.01.01-a");
ev("render()");
A.check("已讀的是舊版本：又出現紅點", !!doc.querySelector("#btn-drawer .dot"));

// Worker /version
const ok = await H.callWorker(env, { method: "GET", path: "/version" });
A.check("Worker GET /version 回傳WORKER_VERSION", ok.status === 200 && ok.json && ok.json.version === workerVer, ok.text);
const direct = await H.callWorker(env, { method: "GET", path: "/version", origin: null });
A.check("Worker /version 直接用瀏覽器網址列(沒有Origin標頭)也查得到(2026-10-01)", direct.status === 200 && direct.json && direct.json.version === workerVer, direct.text);
const bad = await H.callWorker(env, { method: "GET", path: "/version", origin: "https://evil.example.com" });
A.check("Worker /version 不在來源白名單的請求仍被擋", bad.status === 403, bad.status);
const paused = await H.callWorker(H.makeEnv({ CLOUD_SAVE_ENABLED: "false" }), { method: "GET", path: "/version" });
A.check("雲端暫停時 /version 照常可查", paused.status === 200 && paused.json.version === workerVer, paused.status);
A.check("頁面與Worker版本號一致(發布前應一致；不一致代表只改了其中一邊)", appVer === workerVer, { appVer, workerVer });
A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
