// 2026-09-28：十六、16.10 首頁（進站年齡確認、還沒寫完的人生、開始/切換流程、文案數字、分享預覽標籤）
// 全程USE_MOCK＋假Worker(記憶體KV)，不打真實API
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
import { fileURLToPath } from "url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = H.makeAsserter("十六 首頁");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- 1. 進站：一律先到首頁、年齡確認 ----------
const env = H.makeEnv();
let g = await H.loadGame({ useMock: true, env, key: "homekey01" });
let doc = g.win.document;
g.ev("MOCK_AI_DELAY_MS = 0"); // 模擬旁白不用等，避免回合在換掉state之後才回來
await sleep(30);
A.check("16.10.9 有金鑰也不自動接續，進站一律先到首頁", g.ev("state.phase") === "home" && !!doc.getElementById("home"));
A.check("16.10.0 第一次進站就顯示年齡確認(不是按開始才出現)", !!doc.getElementById("age-gate"));
const gateText = doc.getElementById("age-gate").textContent;
A.check("16.10.0 卡片文案", /翻開之前/.test(gateText) && /《人生草稿》寫的是一段完整的人生，有些事並不輕鬆。/.test(gateText) && /本站僅供年滿十八歲的人瀏覽。/.test(gateText) && /我已滿十八歲/.test(gateText) && /還沒有/.test(gateText), gateText);
A.check("16.10.0 首頁內容在後方淡淡透出(不能按)", doc.getElementById("home").classList.contains("gated") && !!doc.getElementById("btn-home-new"));
doc.getElementById("btn-home-new").click(); await sleep(10);
A.check("確認前按不到「開始一段人生」", g.ev("state.phase") === "home");
doc.getElementById("btn-age-no").click();
const noText = doc.getElementById("age-gate").textContent;
A.check("16.10.0 按「還沒有」後卡片文字換掉", /那就再等等吧。/.test(noText) && /這本草稿，會在這裡等你長大。/.test(noText) && !doc.getElementById("btn-age-yes"), noText);
A.check("按「還沒有」不會記住成已確認", g.win.localStorage.getItem("life_sim_age_confirmed") !== "yes");
g.ev("ageGateDeclined=false; render()");
doc.getElementById("btn-age-yes").click();
A.check("16.10.0 確認後這台裝置記住、卡片消失", g.win.localStorage.getItem("life_sim_age_confirmed") === "yes" && !doc.getElementById("age-gate") && !doc.getElementById("home").classList.contains("gated"));

// ---------- 2. 文案 ----------
const homeText = doc.getElementById("home").textContent;
A.check("16.10.1 印章「15歲・起稿」", /15歲・起稿/.test(doc.getElementById("home-stamp").textContent), doc.getElementById("home-stamp").textContent);
A.check("16.10.1 標題、副標、主視覺三行(開局年齡修正版)", /人生草稿/.test(homeText) && /這一次，換你決定要活成什麼樣子/.test(homeText)
  && /住在哪裡、念哪所學校、晚餐吃什麼，以前都是大人說了算。/.test(homeText) && /直到十五歲那年夏天，有人問你：「那你自己怎麼想？」/.test(homeText) && /從那天起，答案由你來寫，說書人陪你一路寫到老。/.test(homeText));
A.check("16.10.1 已移除舊文案「從出生那天起」「求學、工作、戀愛、理財」", !/從出生那天起/.test(homeText) && !/求學、工作、戀愛、理財/.test(homeText) && !/0歲/.test(homeText));
A.check("16.10.1 兩顆按鈕與下方說明", /開始一段人生/.test(homeText) && /切換其他人生/.test(homeText) && /免註冊，進度自動存在這台裝置。換了手機，用「復原金鑰」接回你的人生。/.test(homeText));
A.check("16.10.3 介紹第一段(從高一開學前開始)", /故事從高一開學前、暑假的最後一天開始。之後一路升學、畢業、出社會，直到老去。/.test(homeText) && !/你從出生開始/.test(homeText));
A.check("16.10.5 落筆內文改版", /在第一頁的角落寫上你的名字。寫歪了也沒關係，這本草稿從這裡開始，都由你自己選。/.test(homeText) && !/命運會先替你寫好第一頁/.test(homeText));
A.check("16.10.6 常見問題數字：每回合1點、啟程禮55點、每日補到5點", /每過一回合會用掉 1 個行動點。新的人生會先附上 55 點啟程禮，大約夠你走到高一結束；之後每天午夜，再替你補滿 5 點。/.test(homeText) && !/50 點/.test(homeText));
A.check("16.10.6 常見問題八題", doc.querySelectorAll(".faq").length === 8);
A.check("16.10.6 反悔不寫具體次數", /可以，但次數有限。畢竟是草稿，也不是每一筆都擦得掉。/.test(homeText));
A.check("16.10.7 頁尾：讀完了、翻回第一頁、字樣、版權", /這一頁讀完了，下一頁還空著。/.test(homeText) && !!doc.getElementById("btn-home-top") && /© 2026 人生草稿/.test(homeText));
const foot = doc.querySelector(".home-foot").textContent;
A.check("16.10.7 年齡提醒不放在頁尾", !/十八歲/.test(foot));
A.check("16.10.9 不宣傳電郵登入、加購訂閱、放置代活", !/電郵|email|訂閱|加購|放置|掛機/.test(homeText));
A.check("首頁沒有顯示復原金鑰", !homeText.includes("homekey01"));

// ---------- 3. 分享預覽 ----------
const meta = (p) => (html.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1];
A.check("16.10.8 og:title", meta("og:title") === "人生草稿｜這一次，換你決定要活成什麼樣子");
A.check("16.10.8 og:description", meta("og:description") === "AI 文字人生模擬。生在哪裡你選不了，但每一頁都由你落筆。");
A.check("16.10.8 og:image是完整網址的og.png(1200×630)", meta("og:image") === "https://lifegamepage.smile80275.workers.dev/og.png" && meta("og:image:width") === "1200" && meta("og:image:height") === "630");
const png = fs.readFileSync(path.join(ROOT, "og.png"));
A.check("og.png存在且為1200×630", png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630);

// ---------- 4. 還沒寫完的人生 ----------
A.check("16.10.2 沒有存檔時整塊隱藏", !/還沒寫完的人生/.test(homeText) && doc.querySelectorAll(".life-card").length === 0);
// 三段人生：slot0最舊、slot2最新、slot1已結束
const now = Date.now();
const put = (slot, m) => g.win.localStorage.setItem("life_sim_home:" + slot, JSON.stringify(Object.assign({ key: "homekey01" }, m)));
put(0, { name: "林以晴", age: 17, reincarnations: 0, timeLabel: "高二・期中準備期", lastPlayedAt: now - 3 * 86400000 });
put(2, { name: "陳予安", age: 34, reincarnations: 1, timeLabel: "職涯發展", lastPlayedAt: now - 2 * 3600000 });
g.ev("render()");
let cards = [...doc.querySelectorAll(".life-card")].map(c => c.textContent.replace(/\s+/g, " ").trim());
A.check("16.10.2 有存檔才顯示、區塊標題", /還沒寫完的人生/.test(doc.getElementById("home").textContent) && cards.length === 2, cards);
A.check("16.10.2 依最近遊玩排序", /陳予安/.test(cards[0]) && /林以晴/.test(cards[1]), cards);
A.check("16.10.2 卡片格式：小印章年齡、名字・第幾世、階段、上次遊玩時間", /17歲/.test(cards[1]) && /林以晴・第1世/.test(cards[1]) && /高二・期中準備期/.test(cards[1]) && /3 天前/.test(cards[1]) && /陳予安・第2世/.test(cards[0]) && /2 小時前/.test(cards[0]), cards);
put(1, { name: "別把金鑰的人", age: 20, reincarnations: 0, timeLabel: "大二", lastPlayedAt: now, key: "otherkey" });
g.ev("render()");
A.check("換過金鑰：別的金鑰的人生不列出來", doc.querySelectorAll(".life-card").length === 2);
g.win.localStorage.removeItem("life_sim_home:1");

// 真的玩一段，存檔時寫摘要；點卡片直接回到故事
g.win.localStorage.removeItem("life_sim_home:0"); g.win.localStorage.removeItem("life_sim_home:2");
g.win.localStorage.setItem("life_sim_active_slot", "1");
await H.startNewLife(g, { name: "周語彤" });
await H.playTurn(g); await sleep(20);
for (let i = 0; i < 100 && g.ev("aiWritingNow"); i++) await sleep(20); // 等回合寫完再換掉state
const m1 = JSON.parse(g.win.localStorage.getItem("life_sim_home:1") || "null");
A.check("存檔時寫首頁摘要(名字、年齡、世代、細階段、時間、金鑰)", m1 && m1.name === "周語彤" && m1.age === 15 && m1.reincarnations === 0 && /高一/.test(m1.timeLabel) && m1.key === "homekey01" && Math.abs(m1.lastPlayedAt - Date.now()) < 60000, m1);
const turnBefore = g.ev("state.turnCount");
g.ev("state = {phase:'home'}; render()");
cards = [...doc.querySelectorAll(".life-card")];
A.check("回到首頁看得到這段人生", cards.length === 1 && /周語彤/.test(cards[0].textContent));
cards[0].click(); await sleep(60);
A.check("16.10.2 點卡片直接回到故事，不經過中間頁", g.ev("state.phase") === "playing" && g.ev("state.name") === "周語彤" && g.ev("state.turnCount") === turnBefore);
// 首頁上線前的舊存檔(沒有摘要)也列得出來
g.win.localStorage.removeItem("life_sim_home:1");
g.ev("state = {phase:'home'}; render()");
A.check("舊存檔沒有摘要：讀本機存檔補(不顯示時間)", doc.querySelectorAll(".life-card").length === 1 && !doc.querySelector(".life-card .lc-time"));
// 已結束的人生不列
g.win.localStorage.setItem("life_sim_active_slot", "1");
g.ev("state = JSON.parse(localStorage.getItem('life_sim_save_v1:1'))");
await g.ev("endLife('ended')"); await sleep(60);
for (let i = 0; i < 200 && g.ev("aiWritingNow"); i++) await sleep(20); // 結局那一回合寫完再換掉state
g.ev("state = {phase:'home'}; render()");
A.check("16.10.2 已結束的人生不列在首頁", doc.querySelectorAll(".life-card").length === 0 && !g.win.localStorage.getItem("life_sim_home:1"));

// ---------- 5. 按鈕流程 ----------
// 有金鑰、有空格：找空的格子
await g.ev("startNewLifeFromHome()"); await sleep(30);
A.check("16.10.9 已有金鑰：直接進取名，這台裝置的金鑰沿用", g.ev("state.phase") === "identity" && g.win.localStorage.getItem("life_sim_recovery_key") === "homekey01");
const freeSlot = g.win.localStorage.getItem("life_sim_active_slot");
A.check("找到的是空格子", ["0", "1", "2"].includes(freeSlot));
g.ev("state = newRoll(null,{name:'顧子晴',gender:'女'}); state.phase='lifestyle'; state.spendingHabit='普通花費'; state.mealArrangement='自己打理'; render()");
doc.getElementById("btn-lifestyle-confirm").click(); await sleep(60); H.clickModals(g.win);
A.check("已有金鑰：選完生活方式直接開始，不再顯示金鑰", g.ev("state.phase") === "playing");
// 三格都滿
for (let i = 0; i < 3; i++) g.win.localStorage.setItem("life_sim_home:" + i, JSON.stringify({ key: "homekey01", name: "佔位" + i, age: 20, timeLabel: "x", lastPlayedAt: now }));
g.ev("state = {phase:'home'}; render()");
await g.ev("startNewLifeFromHome()"); await sleep(30);
A.check("16.10.9 三格都滿：導到切換畫面並說明已經滿三段", g.ev("state.phase") === "slotPicker" && /三段人生/.test(doc.getElementById("app").textContent) && /人生回顧/.test(doc.getElementById("app").textContent));
A.check("人生選擇畫面有「回首頁」", !!doc.getElementById("btn-slot-home"));
doc.getElementById("btn-slot-home").click();
A.check("回首頁", g.ev("state.phase") === "home");
// 切換其他人生：有金鑰→選人生
doc.getElementById("btn-home-switch").click(); await sleep(30);
A.check("16.10.9 切換其他人生(有金鑰)：進入三段人生選擇畫面", g.ev("state.phase") === "slotPicker");

// 沒有金鑰的新裝置
const g2 = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "tmp" });
g2.win.localStorage.removeItem("life_sim_recovery_key"); g2.win.localStorage.removeItem("life_sim_active_slot");
g2.win.localStorage.setItem("life_sim_age_confirmed", "yes");
g2.ev("MOCK_AI_DELAY_MS = 0");
g2.ev("state = {phase:'home'}; render()");
const d2 = g2.win.document;
d2.getElementById("btn-home-switch").click(); await sleep(10);
A.check("16.10.9 切換其他人生(沒有金鑰)：直接進入輸入復原金鑰畫面", g2.ev("state.phase") === "keyInput");
d2.getElementById("btn-key-input-back").click();
A.check("輸入金鑰畫面返回首頁", g2.ev("state.phase") === "home");
d2.getElementById("btn-home-new").click(); await sleep(10);
A.check("16.10.9 開始一段人生(沒有金鑰)：先取名，還沒有金鑰", g2.ev("state.phase") === "identity" && !g2.win.localStorage.getItem("life_sim_recovery_key"));
g2.ev("state = newRoll(null,{name:'許念安',gender:'男'}); state.phase='lifestyle'; state.spendingHabit='普通花費'; state.mealArrangement='自己打理'; render()");
d2.getElementById("btn-lifestyle-confirm").click(); await sleep(20);
const newKey = g2.win.localStorage.getItem("life_sim_recovery_key");
A.check("16.10.9 選完生活方式才顯示復原金鑰(收好)", g2.ev("state.phase") === "keyReveal" && !!newKey && d2.getElementById("app").textContent.includes(newKey), newKey);
d2.getElementById("btn-key-reveal-confirm").click(); await sleep(80); H.clickModals(g2.win);
A.check("記下金鑰後，剛剛設定好的那段人生正式開始(名字、第1格、禮包點)", g2.ev("state.phase") === "playing" && g2.ev("state.name") === "許念安" && g2.win.localStorage.getItem("life_sim_active_slot") === "0" && g2.ev("totalAP(state)") > 0);
for (let i = 0; i < 100 && g2.ev("aiWritingNow"); i++) await sleep(20); // 等開場回合寫完再換掉state(否則回來時state已被換掉)
await sleep(30);
g2.ev("state = {phase:'home'}; render()");
A.check("新金鑰的人生出現在首頁", /許念安/.test(d2.querySelector(".life-card")?.textContent || ""));

A.check("整段沒有jsdom錯誤", g.errors.length === 0 && g2.errors.length === 0, g.errors.concat(g2.errors).map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
