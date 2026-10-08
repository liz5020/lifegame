// 2026-10-08 十、10.3.13 付費周邊（前端，示範模式）：反悔每一世5次＋超過每次1點、人生重開丹10點（興趣天賦／數值起點／指定NPC，轉世與傳承）、
// 點數紀錄名稱、點數不足的停用（不花錢，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("付費周邊：反悔／人生重開丹");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "paidkey01" });
const ev = g.ev, doc = g.win.document;
ev("MOCK_AI_DELAY_MS = 0; MOCK_CHAPTER_DELAY_MS = 1");
await H.startNewLife(g, { name: "林小晴" });
const txt = sel => (doc.querySelector(sel)?.textContent || "").replace(/\s+/g, " ").trim();

// ================= 反悔 =================
A.check("新人生：每一世免費反悔 5 次（undosLeft=5，規則版本2）", ev("state.undosLeft") === 5 && ev("state.undoRule") === 2);
await H.playTurn(g, "嗯"); await sleep(10);
A.check("按鈕文字：反悔上一步（剩 5 次）", txt("#btn-undo") === "反悔上一步（剩 5 次）" || /反悔上一步（剩 5 次）/.test(txt("#btn-undo")), txt("#btn-undo"));
const apFree0 = ev("totalAP(state)"), turnFree0 = ev("state.turnCount");
doc.getElementById("btn-undo").click(); await sleep(10);
A.check("免費反悔：剩 4 次、不扣點、回合退回上一步", ev("state.undosLeft") === 4 && ev("totalAP(state)") === apFree0 && ev("state.turnCount") === turnFree0 - 1, [ev("state.undosLeft"), ev("totalAP(state)"), apFree0, ev("state.turnCount"), turnFree0]);
// 用完免費次數
ev("state.undosLeft = 0; state.ap.daily = 3; state.ap.gift = 0; state.ap.purchased = 0"); await H.playTurn(g, "再來一回合"); await sleep(10);
const ap0 = ev("totalAP(state)"), turn0 = ev("state.turnCount");
A.check("免費次數用完：按鈕改為「反悔上一步（扣 1 點）」", /反悔上一步（扣 1 點）/.test(txt("#btn-undo")) && !doc.getElementById("btn-undo").disabled, txt("#btn-undo"));
doc.getElementById("btn-undo").click(); await sleep(10);
const m = txt("#undo-pay-modal");
A.check("每次都跳確認視窗（撰稿人口吻，沒有「不要再提醒」）", m.includes("這一世的免費反悔用完了。") && m.includes("這次反悔要扣 1 點，扣了不退。") && doc.getElementById("btn-undo-pay-ok").textContent === "反悔" && doc.getElementById("btn-undo-pay-no").textContent === "先不要" && !/不要再提醒/.test(m), m);
doc.getElementById("btn-undo-pay-no").click(); await sleep(10);
A.check("按〔先不要〕：不扣點、不反悔、視窗關閉", ev("totalAP(state)") === ap0 && ev("state.turnCount") === turn0 && !doc.getElementById("undo-pay-modal"));
doc.getElementById("btn-undo").click(); await sleep(10);
doc.getElementById("btn-undo-pay-ok").click(); await sleep(30);
A.check("按〔反悔〕：扣 1 點、回合退回、免費次數維持 0", ev("totalAP(state)") === ap0 - 1 && ev("state.turnCount") === turn0 - 1 && ev("state.undosLeft") === 0, [ev("totalAP(state)"), ap0, ev("state.undosLeft")]);
A.check("點數紀錄名稱：「反悔（超過 5 次）」−1", ev("state.apLog.some(e=>e.type==='反悔（超過 5 次）' && e.n===-1 && e.ok!==false)"));
// 點數不足
await H.playTurn(g, "又一回合"); await sleep(10);
ev("state.ap.daily = 0; state.ap.gift = 0; state.ap.purchased = 0; render()");
A.check("點數 0：按鈕變灰不能按", !!doc.getElementById("btn-undo") && doc.getElementById("btn-undo").disabled === true && /扣 1 點/.test(txt("#btn-undo")));
// 舊存檔
ev("state.undoRule = undefined; state.undosLeft = 1; state.ap.daily = 2; render()");
A.check("舊存檔（沒有規則版本、只剩 1 次）：補上新增的 2 次→3 次，不重置已用掉的", ev("state.undosLeft") === 3 && ev("state.undoRule") === 2);
ev("state.undoRule = undefined; state.undosLeft = 3; render()");
A.check("舊存檔剛開始（3 次）→5 次", ev("state.undosLeft") === 5);
A.check("首頁常見問題：每一世免費 5 次，用完每次扣 1 點", /每一世可以免費反悔 5 次，轉世或傳承後重新計算。用完之後還想反悔，每次扣 1 點。/.test(ev("HOME_FAQ.map(x=>x[1].join('')).join('|')")));

// ================= 人生重開丹 =================
const setEnding = (kids) => ev(`
  state.age = 78; state.ap.daily = 0; state.ap.gift = 12; state.ap.purchased = 0; state.apLog = [];
  state.ending = { successionAvailable:true, epitaph:'x', overview:'y', segments:[], transitions:[], teaser:null };
  state.characters = state.characters.filter(c=>!c.isChild);
  state.characters.push({name:'阿哲',relation:'同學',gender:'男',affinity:80,active:true,traits:'愛開玩笑',summary:'',lastTurn:5,age:30});
  ${kids ? "state.characters.push({name:'小安',relation:'女兒',gender:'女',isChild:true,age:40,affinity:70,active:true,traits:'',summary:'',lastTurn:0,parentingLog:[]});" : ""}
  state.interestCandidates = [{id:'手作工藝_1',createdTurn:1,category:'手作工藝',status:'active',investment:55,positiveStreak:0,candidateProgress:0,lastEngagedRound:3}];
  state.phase = 'ending'; render();`);
setEnding(false);
doc.getElementById("btn-reincarnate").click(); await sleep(10);
const km = txt("#life-keep-modal");
A.check("轉世畫面出現人生重開丹：三選一（興趣天賦、數值起點、指定的人），價格 10 點，一次只能選一項", km.includes("人生重開丹") && km.includes("用 10 點，換一份帶到下一世的東西。一次只能選一項。") && km.includes("興趣天賦") && km.includes("數值起點") && km.includes("指定的人"), km);
A.check("三組選項都有按鈕：興趣、才識／人脈、前世認識的人", !!doc.querySelector('#life-keep-modal [data-keep*="手作工藝"]') && doc.querySelectorAll('#life-keep-modal [data-keep*=\'"stat"\']').length === 2 && !!doc.querySelector('#life-keep-modal [data-keep*="阿哲"]'));
A.check("點數 12 點夠：選項可按；還有〔不帶，直接轉世〕", ![...doc.querySelectorAll("#life-keep-modal [data-keep]")].some(b => b.disabled) && doc.getElementById("btn-keep-skip").textContent === "不帶，直接轉世");
doc.querySelector('#life-keep-modal [data-keep*="knowledge"]').click(); await sleep(10);
const cm = txt("#life-keep-confirm");
A.check("選好一項後跳確認視窗：「用 10 點換這份人生重開丹，帶到下一世。」〔確定〕〔再想想〕", cm.includes("用 10 點換這份人生重開丹，帶到下一世。") && doc.getElementById("btn-keep-ok").textContent === "確定" && doc.getElementById("btn-keep-back").textContent === "再想想", cm);
doc.getElementById("btn-keep-back").click(); await sleep(5);
A.check("〔再想想〕：不扣點、回到選擇畫面", ev("totalAP(state)") === 12 && !doc.getElementById("life-keep-confirm") && !!doc.getElementById("life-keep-modal"));
const knowBefore = ev("state.stats.knowledge");
doc.querySelector('#life-keep-modal [data-keep*="knowledge"]').click(); await sleep(5);
doc.getElementById("btn-keep-ok").click(); await sleep(40);
A.check("數值起點（轉世）：扣 10 點（紀錄「人生重開丹」）、新的一世才識起點＋5、點數全部由下一世承接", ev("totalAP(state)") === 2 && ev("state.apLog.some(e=>e.type==='人生重開丹' && e.n===-10)") && ev("state.reincarnations") === 1 && ev("state.lifeKeep.type") === "stat" && ev("state.phase") === "setup", [ev("totalAP(state)"), ev("state.reincarnations")]);
A.check("才識起點比不帶時高 5（上限 100）", ev("state.stats.knowledge") >= 5);
// 點數不足：變灰、可免費轉世
await H.startNewLife(g, { name: "林小晴" }); setEnding(false);
ev("state.ap.gift = 9; render()");
doc.getElementById("btn-reincarnate").click(); await sleep(10);
A.check("點數不足 10 點：三組選項全部變灰並寫「需要 10 點」", [...doc.querySelectorAll("#life-keep-modal [data-keep]")].every(b => b.disabled) && /需要 10 點/.test(txt("#life-keep-modal")));
doc.getElementById("btn-keep-skip").click(); await sleep(30);
A.check("點數不足仍可免費轉世，不扣點、不卡住", ev("state.reincarnations") === 1 && ev("totalAP(state)") === 9 && !ev("state.lifeKeep"), [ev("state.reincarnations"), ev("totalAP(state)")]);

// 興趣天賦：下一世該興趣卡一建立就從 20 起始
await H.startNewLife(g, { name: "林小晴" }); setEnding(false);
doc.getElementById("btn-reincarnate").click(); await sleep(10);
doc.querySelector('#life-keep-modal [data-keep*="手作工藝"]').click(); await sleep(5);
doc.getElementById("btn-keep-ok").click(); await sleep(40);
A.check("興趣天賦（轉世）：記下要帶的興趣，扣 10 點", ev("state.lifeKeep.type") === "interest" && ev("state.lifeKeep.category") === "手作工藝" && ev("state.apLog.some(e=>e.type==='人生重開丹')"));
ev(`applyInterestEvent(state, { category:'體能競技', reaction:'neutral' }, 1)`);
A.check("別的興趣不受影響（從 0 起始）", ev("state.interestCandidates.find(c=>c.category==='體能競技').investment") === 0);
ev(`applyInterestEvent(state, { category:'手作工藝', reaction:'neutral' }, 1)`);
A.check("帶來的興趣第一次建立卡片：投入度從 20 起始（neutral 不增加）", ev("state.interestCandidates.find(c=>c.category==='手作工藝').investment") === 20 && ev("state.lifeKeep.used") === true);

// 指定NPC（轉世）：第一個人生階段內以新身份宿緣重逢
await H.startNewLife(g, { name: "林小晴" }); setEnding(false);
doc.getElementById("btn-reincarnate").click(); await sleep(10);
doc.querySelector('#life-keep-modal [data-keep*="阿哲"]').click(); await sleep(5);
doc.getElementById("btn-keep-ok").click(); await sleep(40);
const rn = JSON.parse(ev("JSON.stringify(state.reunionNpc)"));
A.check("指定NPC（轉世）：排定在第一個人生階段內登場（第 6～24 回合），新身份不是原本的關係，還沒建卡", rn && rn.name === "阿哲" && rn.triggerTurn >= 6 && rn.triggerTurn <= 24 && rn.relation !== "同學" || (rn && ["同學","鄰居","補習班同學","社團同學"].includes(rn.relation)), rn);
A.check("(還沒到登場回合：沒有這個人、payload 沒有 reunion_npc_now)", !ev("state.characters.some(c=>c.name==='阿哲')") && ev("(maybeFireReunionNpc(state), state.reunionNow)") === null);
ev(`state.turnCount = state.reunionNpc.triggerTurn; state.timeState = Object.assign({}, state.timeState, { stageMode:'highschool' }); maybeFireReunionNpc(state)`);
const card = JSON.parse(ev("JSON.stringify(state.characters.find(c=>c.name==='阿哲'))"));
A.check("到了登場回合：建卡（好感度從一般新角色的起點 50、來歷寫熟悉感）並通知 AI 自然登場", card && card.affinity === 50 && /熟悉/.test(card.origin) && ev("state.reunionNow.name") === "阿哲" && ev("state.reunionNpc.done") === true);
const payload = JSON.parse(ev("buildUserMessage('去上學', false, {structured:true,label:'x'})"));
A.check("payload 帶 reunion_npc_now；下一回合不再重複", payload.reunion_npc_now && payload.reunion_npc_now.name === "阿哲" && ev("(maybeFireReunionNpc(state), state.reunionNow)") === null);
ev("state.reunionNpc.done = false; state.reunionNpc.cardName = '阿哲'; state.snapshot = null"); // 反悔掉登場那回合的情境：卡片不在名冊
ev("state.characters = state.characters.filter(c=>c.name!=='阿哲'); state.snapshot = JSON.parse(JSON.stringify({age:state.age})); state.reunionNpc.done = true; applySnapshot()");
A.check("反悔掉登場那一回合：登場重新排程，不會永遠消失", ev("state.reunionNpc.done") === false);

// 傳承：三選一（血緣說法）＋指定NPC也帶到孩子這一世
await H.startNewLife(g, { name: "林小晴" }); setEnding(true);
doc.getElementById("btn-succeed-open").click();
doc.querySelector(".choice-btn[data-child='小安']").click(); await sleep(10);
const sm = txt("#life-keep-modal");
A.check("傳承畫面也出現人生重開丹，文字改用血緣說法（從小跟著爸媽接觸、家裡的教育資源）", sm.includes("從小跟著爸媽接觸") && sm.includes("家裡的教育資源") && sm.includes("不帶，直接接著寫"), sm);
doc.querySelector('#life-keep-modal [data-keep*="阿哲"]').click(); await sleep(5);
doc.getElementById("btn-keep-ok").click(); await sleep(60);
const aj = JSON.parse(ev("JSON.stringify(state.characters.find(c=>c.name==='阿哲'))"));
A.check("指定NPC（傳承）：直接帶到孩子這一世，來歷改從孩子的角度（爸媽的舊識）；主角是小安；扣 10 點", aj && /爸媽的舊識/.test(aj.origin) && ev("state.name") === "小安" && ev("state.apLog.some(e=>e.type==='人生重開丹' && e.n===-10)") && ev("totalAP(state)") === 2, [aj, ev("state.name")]);
A.check("傳承後反悔次數也重新計算為 5", ev("state.undosLeft") === 5);
// 傳承不帶也照常
await H.startNewLife(g, { name: "林小晴" }); setEnding(true);
doc.getElementById("btn-succeed-open").click();
doc.querySelector(".choice-btn[data-child='小安']").click(); await sleep(10);
doc.getElementById("btn-keep-skip").click(); await sleep(60);
A.check("傳承不帶：照常傳承、不扣點", ev("state.name") === "小安" && !ev("state.lifeKeep") && ev("totalAP(state)") === 12);
A.check("整段沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
