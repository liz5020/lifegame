// 2026-09-28：十六、16.8 大學科系學生證＋九、9.2正式系別清單（全程USE_MOCK，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("十六 學生證選系");
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "sidkey01" });
const ev = g.ev, doc = g.win.document;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
ev("MOCK_AI_DELAY_MS = 0");
await H.startNewLife(g, { name: "林以晴" });

// 1. 9.2系別清單
const depts = JSON.parse(ev("JSON.stringify(MAJOR_DEPARTMENTS)"));
A.check("9.2 八個學群都有系別清單，與MAJOR_CATEGORIES一致", Object.keys(depts).length === 8 && ev("MAJOR_CATEGORIES.every(m=>Array.isArray(MAJOR_DEPARTMENTS[m.key]) && MAJOR_DEPARTMENTS[m.key].length>0)"));
A.check("9.2 清單＝原本的具體科系範例(除醫藥類補兩系外)", ev("MAJOR_CATEGORIES.filter(m=>m.key!=='醫藥護理').every(m=>m.examples.split('、').join()===MAJOR_DEPARTMENTS[m.key].join())"));
A.check("9.2 醫藥類補牙醫、獸醫；5年制＝醫學、牙醫、獸醫", depts["醫藥護理"].includes("牙醫") && depts["醫藥護理"].includes("獸醫") && ev("FIVE_YEAR_DEPARTMENTS.join()") === "醫學,牙醫,獸醫");
A.check("16.8.5 校名清單12所，避開「台」「國立」", ev("SCHOOL_NAMES.length") === 12 && ev("SCHOOL_NAMES.every(n=>!/台|臺|國立/.test(n) && /大學$/.test(n))"));

// 2. 選系畫面
ev("state.age = 18; renderMajorSelectionModal()");
const m = doc.getElementById("major-selection-modal");
A.check("16.8.1 標題「18歲・大學入學」「選擇你的科系」", /18歲・大學入學/.test(m.textContent) && /選擇你的科系/.test(m.textContent));
A.check("16.8.1 八個學群按鈕(含圖示)", m.querySelectorAll(".mp-group").length === 8 && [...m.querySelectorAll(".mp-group")].every(b => b.querySelector("svg path, svg rect, svg circle")));
A.check("16.8.1 提示文字與底部按鈕", /點學生證可以翻面，看看畢業後的方向/.test(m.textContent) && doc.getElementById("btn-major-confirm").textContent === "就讀這個科系");
const front = () => m.querySelector(".sid-front").textContent.replace(/\s+/g, " ");
A.check("16.8.2 正面：色帶校名＋學生證、學號；大頭照名字首字；姓名、學群、系別、入學年齡；系徽", /大學 學生證/.test(front()) && /\d{7}/.test(m.querySelector(".sid-no").textContent) && m.querySelector(".sid-photo").textContent === "林" && /姓名\s*林以晴/.test(front()) && /學群\s*理工\/資訊類/.test(front()) && /系別\s*資訊工程/.test(front()) && /入學年齡\s*18歲/.test(front()) && !!m.querySelector(".sid-emblem"), front());
m.querySelector('.mp-group[data-key="服務社工餐旅"]').click();
A.check("16.8.1 點學群，學生證切換到該學群、系別從第一個開始、中間顯示目前/總數", /服務\/社工\/餐旅類/.test(front()) && /社會工作學系/.test(front()) && doc.getElementById("dept-counter").textContent === "1/4");
doc.getElementById("btn-dept-next").click(); doc.getElementById("btn-dept-next").click(); doc.getElementById("btn-dept-next").click();
A.check("16.8.1 右箭頭切換同學群科系", /運動休閒/.test(front()) && doc.getElementById("dept-counter").textContent === "4/4");
doc.getElementById("btn-dept-next").click();
A.check("箭頭到底會繞回第一個", /社會工作學系/.test(front()) && doc.getElementById("dept-counter").textContent === "1/4");
doc.getElementById("btn-dept-prev").click();
A.check("左箭頭往回", /運動休閒/.test(front()));
const back = m.querySelector(".sid-back").textContent.replace(/\s+/g, " ");
A.check("16.8.3 背面：未來方向＋系名、對應職業類型、可能的職業(服務類依科系細分)", /未來方向\s*運動休閒/.test(back) && /勞力\/服務類，教練接案走向自由\/創作類/.test(back) && /健身教練/.test(back) && !/社工師/.test(back), back);
const card = doc.getElementById("sid-card");
card.click();
const flippedOnce = card.classList.contains("flipped");
card.click();
A.check("點學生證翻面、再點翻回", flippedOnce && !card.classList.contains("flipped"));
A.check("16.8.6 色帶統一珊瑚紅、不分級(只有一種色帶樣式)", m.querySelectorAll(".sid-band").length === 2);
const shownSchool = m.querySelector(".sid-band span").textContent.replace("　學生證", "");
const shownId = m.querySelector(".sid-no").textContent;
m.querySelector('.mp-group[data-key="醫藥護理"]').click();
doc.getElementById("btn-dept-next").click(); // 牙醫
card.click(); // 翻到背面再確認
doc.getElementById("btn-major-confirm").click();
A.check("16.8.4 確認入學：學生證先翻回正面", !card.classList.contains("flipped"));
await sleep(600);
A.check("16.8.4 翻回正面後蓋上「入學」印章(彈窗還開著)", !!m.querySelector(".enroll-stamp.shown") && !!doc.getElementById("major-selection-modal"));
await sleep(1300);
A.check("入學動畫後關閉彈窗", !doc.getElementById("major-selection-modal"));
const sc = JSON.parse(ev("JSON.stringify(state.studentCard)"));
A.check("入學寫進狀態：學群、系別、5年制", ev("state.studentMajorGroup") === "醫藥護理" && ev("state.studentDepartment") === "牙醫" && ev("state.studentIsFiveYearTrack") === true && ev("state.collegeYearsRequired") === 5);
A.check("16.8.5 校名、學號就是選系畫面上看到的那組，存進狀態", sc.school === shownSchool && sc.studentId === shownId && sc.dept === "牙醫" && sc.entryAge === 18, { sc, shownSchool, shownId });
A.check("16.8.5 學號＝入學年份碼(這一世第幾年，18歲＝04)＋5位數字", /^04\d{5}$/.test(sc.studentId), sc.studentId);
// 4年制
ev("state.studentCard=null; renderMajorSelectionModal()");
doc.querySelector('#major-selection-modal .mp-group[data-key="醫藥護理"]').click();
for (let i = 0; i < 3; i++) doc.getElementById("btn-dept-next").click(); // 藥學
doc.getElementById("btn-major-confirm").click();
await sleep(1700);
A.check("醫藥類其他系(藥學)是4年制", ev("state.studentDepartment") === "藥學" && ev("state.collegeYearsRequired") === 4 && ev("state.studentIsFiveYearTrack") === false);

// 3. 選單裡的學生證
ev("render()");
A.check("16.8.4 學生證收在選單裡", !!doc.getElementById("link-student-card") && /學生證/.test(doc.getElementById("link-student-card").textContent));
doc.getElementById("link-student-card").click();
const v = doc.getElementById("student-card-modal");
A.check("選單打開學生證：正面有入學章、可以翻面", v && !!v.querySelector(".enroll-stamp.shown") && /藥學/.test(v.textContent));
doc.getElementById("btn-student-card-close").click();
ev("state.studentCard = null; render()");
A.check("沒有學生證的存檔(還沒上大學／舊存檔)選單不顯示", !doc.getElementById("link-student-card"));

// 4. 放置期間代選到系別
ev("state.studentCard=null; state.studentDepartment=null");
const picked = JSON.parse(ev(`(()=>{ const out=[]; for(let i=0;i<40;i++){ const s={age:18, name:'x'}; const m=pick(MAJOR_CATEGORIES); const d=pick(MAJOR_DEPARTMENTS[m.key]); enrollInDepartment(s,m.key,d); out.push([m.key,d,s.collegeYearsRequired,s.studentCard.school]); } return JSON.stringify(out); })()`));
A.check("放置代選用的enrollInDepartment：系別屬於該學群、年限正確、有校名", picked.every(([k, d, y, sch]) => depts[k].includes(d) && y === (["醫學", "牙醫", "獸醫"].includes(d) ? 5 : 4) && !!sch));

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
