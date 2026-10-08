// 2026-10-08 網頁版討論回覆：防濫用紀錄1小時到期與排程清除（10.16.15）、排程先分配再寄信（10.15.11）、舊存檔反悔次數換算（10.3.13）、
// 指定NPC候選排除已故與失聯／必定登場／整階段沒登場退10點（7.4.3.4）、試看花絮14句逐字（16.7.2.3）（不打真實API）
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("討論回覆：防濫用紀錄／排程／指定NPC／花絮");
const resend = H.makeFakeResend(); H.installUpstream(H.makeFakeAnthropic(), resend);
const worker = await H.loadWorker();
const HOUR = 3600 * 1000, MIN = 60000, TW0 = Date.parse("2026-10-10T00:00:00+08:00");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ================= Worker：防濫用紀錄 =================
let env = await H.makeAccountEnv({ TEST_NOW_MS: String(TW0 + 11 * HOUR), CLOUD_SAVE_ENABLED: "false", DAILY_NEW_PLAYER_CAP: "5" });
const at = ms => { env.TEST_NOW_MS = String(TW0 + ms); };
const tick = async () => { const w = []; await worker.scheduled({ cron: "0 * * * *" }, env, { waitUntil: p => w.push(p) }); await Promise.all(w); };
const keys = p => [...env.ACCOUNTS._store.keys()].filter(k => k.startsWith(p));
await H.callWorker(env, { path: "/account/send-code", body: { email: "abuse@example.com" }, headers: { "CF-Connecting-IP": "7.7.7.7" } });
A.check("寄驗證碼後：有IP與寄信次數紀錄（li:/le:）", keys("li:").length === 1 && keys("le:").length === 1 && keys("c:").length === 1);
await H.callWorker(env, { path: "/account/send-code", body: { email: "abuse@example.com" }, headers: { "CF-Connecting-IP": "7.7.7.7" } });
A.check("(60秒內再寄被擋，頻率限制照常運作)", resend.sent.filter(m => /驗證碼/.test(m.subject)).length === 1);
at(11 * HOUR + 30 * MIN); await tick();
A.check("30分鐘後排程醒來：紀錄還沒到期，不清除（仍計入限制）", keys("li:").length === 1 && keys("le:").length === 1);
at(11 * HOUR + 61 * MIN);
await H.callWorker(env, { path: "/account/send-code", body: { email: "fresh@example.com" }, headers: { "CF-Connecting-IP": "8.8.8.8" } });
A.check("過了1小時：舊紀錄不再計入限制（同一信箱又能寄）", (await H.callWorker(env, { path: "/account/send-code", body: { email: "abuse@example.com" }, headers: { "CF-Connecting-IP": "7.7.7.7" } })).status === 200);
// 再等：新寄的abuse紀錄已被更新，fresh那筆在1小時後被清
at(11 * HOUR + 61 * MIN + 61 * MIN); await tick();
A.check("下一次排程醒來：寫入超過1小時的紀錄（IP原文、信箱）全部清掉，驗證碼紀錄也一起清", keys("li:").length === 0 && keys("le:").length === 0 && keys("c:").length === 0, [keys("li:"), keys("le:"), keys("c:")]);
A.check("(最長保留時間)紀錄寫入後最晚在下一個整點排程清除：寫入後最多1小時＋排程間隔1小時＝2小時，沒有超過", true);
// 實測：任何時間點寫入，下一個整點排程後（距寫入不到2小時）已清掉
at(14 * HOUR + 20 * MIN); await H.callWorker(env, { path: "/account/send-code", body: { email: "w@example.com" }, headers: { "CF-Connecting-IP": "6.6.6.6" } });
at(15 * HOUR); await tick(); const still1 = keys("li:").length;
at(16 * HOUR); await tick(); const still2 = keys("li:").length;
A.check("實測：14:20寫入→15:00排程還在（未滿1小時）→16:00排程已清（距寫入1小時40分，不超過2小時）", still1 === 1 && still2 === 0, [still1, still2]);

// ================= 排程先分配再寄信（沒有任何人打開遊戲）=================
env = await H.makeAccountEnv({ TEST_NOW_MS: String(TW0 + 11 * HOUR), CLOUD_SAVE_ENABLED: "false", DAILY_NEW_PLAYER_CAP: "1" });
await H.callWorker(env, { path: "/entry/claim", body: { key: "RAN-A" } });
let ip = 0;
const join = async (email, key) => { await H.callWorker(env, { path: "/account/send-code", body: { email }, headers: { "CF-Connecting-IP": "5.5.5." + (++ip) } }); return H.callWorker(env, { path: "/waitlist/join", body: { email, code: resend.lastCode(email), key } }); };
const w1 = await join("auto@example.com", "AUTO-1");
A.check("(前置) 名額用完、一位候補排隊中", w1.status === 200 && w1.json.result.position === 1);
const mailsBefore = resend.notices().length;
at(24 * HOUR + 12 * HOUR + 5 * MIN); await tick(); // 隔天中午過幾分，這之間沒有任何人打開遊戲、沒有人呼叫名額相關網址
A.check("隔天整天沒有人碰名額：排程醒來先分配、再寄信，候補玩家仍收到通知信", resend.notices().length === mailsBefore + 1 && resend.notices().at(-1).to === "auto@example.com" && resend.notices().at(-1).subject === "人生草稿：輪到你了", resend.notices().map(m => m.to));

// ================= 帳號錢包：人生重開丹退還憑證（伺服器驗證）=================
const e2 = await H.makeAccountEnv({ TEST_NOW_MS: String(TW0 + 11 * HOUR), CLOUD_SAVE_ENABLED: "false", DAILY_NEW_PLAYER_CAP: "5" });
await H.callWorker(e2, { path: "/account/send-code", body: { email: "tk@example.com" }, headers: { "CF-Connecting-IP": "4.4.4.4" } });
const bound = (await H.callWorker(e2, { path: "/account/bind", body: { email: "tk@example.com", code: resend.lastCode("tk@example.com"), key: "TKKEY-0001", lives: [{ lid: "lifetk0001", pool: { daily: 5, gift: 30 } }] } })).json;
const auth = { Authorization: "Bearer " + bound.token };
const tot = async () => (await H.callWorker(e2, { method: "GET", path: "/account/me", headers: auth })).json.account.wallet.total;
const t0 = await tot();
let r = await H.callWorker(e2, { path: "/account/wallet", body: { op: "refund_keep" }, headers: auth });
A.check("沒有人生重開丹憑證：不能自己要求退點（409），錢包不變", r.status === 409 && (await tot()) === t0, r.json);
r = await H.callWorker(e2, { path: "/account/wallet", body: { op: "spend", n: 10, tag: "keep" }, headers: auth });
A.check("扣10點並記下憑證", r.status === 200 && (await tot()) === t0 - 10);
r = await H.callWorker(e2, { path: "/account/wallet", body: { op: "refund_keep" }, headers: auth });
A.check("憑證退還一次：錢包＋10", r.status === 200 && (await tot()) === t0 && r.json.events.some(e => e.type === "人生重開丹（退還）" && e.n === 10), r.json);
r = await H.callWorker(e2, { path: "/account/wallet", body: { op: "refund_keep" }, headers: auth });
A.check("憑證用掉就不能再退（第二次409）", r.status === 409 && (await tot()) === t0);
r = await H.callWorker(e2, { path: "/account/wallet", body: { op: "spend", n: 5, tag: "keep" }, headers: auth });
A.check("只有10點的人生重開丹才有憑證（扣5點不給憑證）", (await H.callWorker(e2, { path: "/account/wallet", body: { op: "refund_keep" }, headers: auth })).status === 409);

// ================= 前端 =================
const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "disc00001" });
const ev = g.ev, doc = g.win.document;
ev("MOCK_AI_DELAY_MS = 0; MOCK_CHAPTER_DELAY_MS = 1");
await H.startNewLife(g, { name: "林小晴" });
// 舊存檔反悔次數
for (const [left, want] of [[3, 5], [1, 3], [0, 2], [2, 4]]) {
  ev(`state.undoRule = undefined; state.undosLeft = ${left}; render()`);
  const once = ev("state.undosLeft"); ev("render(); render()");
  A.check(`舊存檔剩 ${left} 次 → ${want} 次，且重複載入／重畫不再加`, once === want && ev("state.undosLeft") === want && ev("state.undoRule") === 2, [once, ev("state.undosLeft")]);
}
// 試看花絮14句逐字
const lines = fs.readFileSync(new URL("../life-sim-design/16-介面與視覺設計.md", import.meta.url), "utf8");
const sec = lines.slice(lines.indexOf("【定案,2026-10-08討論回覆】試看花絮固定句型"));
const expected = [...sec.slice(0, sec.indexOf("「同儕位置」兩句")).matchAll(/[①②]「([^」]+)」/g)].map(m => m[1]);
const actual = JSON.parse(ev("JSON.stringify([].concat(...Object.values(TEASER_FAMILY_SENTENCES), ...Object.values(TEASER_TRAIT_SENTENCES)))"));
A.check("試看花絮 14 句與設計文件 16.7.2.3 逐字一致（含本次改寫的 6 句）", expected.length === 14 && JSON.stringify(expected.slice().sort()) === JSON.stringify(actual.slice().sort()), { expected: expected.length, missing: expected.filter(x => !actual.includes(x)) });
A.check("每種開局都從高中入學年齡（15歲）起算（「剛進高中」句型成立）", ev("newRoll(null,{name:'a',gender:'男'}).age") === 15 && ev("(function(){var c=newRoll(null,{name:'a',gender:'男'}); return c.timeState.stageMode})()") === "highschool");

// 指定NPC：候選排除已故與失聯
const setEnding = () => ev(`
  state.age = 78; state.ap.daily = 0; state.ap.gift = 30; state.ap.purchased = 0; state.apLog = [];
  state.ending = { successionAvailable:true, epitaph:'x', overview:'y', segments:[], transitions:[], teaser:null };
  state.characters = state.characters.filter(c=>c.isChild || /父|母/.test(c.relation||""));
  state.characters.push({name:'活著的阿哲',relation:'同學',gender:'男',affinity:80,active:true,traits:'',summary:'',lastTurn:5,age:30},
    {name:'已故的老李',relation:'同事',gender:'男',affinity:90,active:true,deceased:true,traits:'',summary:'',lastTurn:5,age:60},
    {name:'失聯的小美',relation:'朋友',gender:'女',affinity:85,active:true,lost:true,traits:'',summary:'',lastTurn:5,age:30});
  state.phase = 'ending'; render();`);
setEnding();
doc.getElementById("btn-reincarnate").click(); await sleep(10);
const names = [...doc.querySelectorAll("#life-keep-modal [data-keep*='npc']")].map(b => b.textContent);
A.check("指定的人：只列活著、聯絡得上的（已故、失聯排除）", names.length === 1 && names[0].startsWith("活著的阿哲"), names);
// 一位都沒有：變灰
ev("state.characters = state.characters.filter(c=>c.name==='活著的阿哲'? false : !/老李|小美|阿哲/.test(c.name)); render()");
doc.getElementById("btn-keep-cancel").click(); doc.getElementById("btn-reincarnate").click(); await sleep(10);
const none = [...doc.querySelectorAll("#life-keep-modal button")].find(b => b.textContent === "沒有可以指定的人");
A.check("沒有候選時：這一項變灰並寫「沒有可以指定的人」，其他項目與免費轉世照常", !!none && none.disabled === true && doc.getElementById("btn-keep-skip") && !doc.getElementById("btn-keep-skip").disabled);
doc.getElementById("btn-keep-cancel").click();

// 必定登場：第24回合後每回合給指令，直到敘事出現；登場後不再給
const fresh = async () => { await H.startNewLife(g, { name: "林小晴" }); setEnding(); doc.getElementById("btn-reincarnate").click(); await sleep(10); doc.querySelector('#life-keep-modal [data-keep*="阿哲"]').click(); await sleep(5); doc.getElementById("btn-keep-ok").click(); await sleep(40); };
setEnding();
await H.startNewLife(g, { name: "林小晴" });
ev(`state.characters.push({name:'阿哲',relation:'同學',gender:'男',affinity:80,active:true,traits:'愛開玩笑',summary:'',lastTurn:5,age:30}); state.age=78; state.ap.gift=30; state.ap.daily=0;
  state.ending={successionAvailable:true,epitaph:'x',overview:'y',segments:[],transitions:[],teaser:null}; state.phase='ending'; render()`);
doc.getElementById("btn-reincarnate").click(); await sleep(10);
doc.querySelector('#life-keep-modal [data-keep*="阿哲"]').click(); await sleep(5);
doc.getElementById("btn-keep-ok").click(); await sleep(40);
ev("state.reunionNpc.triggerTurn = 10; state.turnCount = 10; maybeFireReunionNpc(state)");
A.check("排定回合：建卡並給場景指令", ev("state.reunionNow && state.reunionNow.name") === "阿哲" && ev("state.reunionNpc.done") === true);
for (const [turn, want] of [[11, null], [20, null], [24, null], [25, "阿哲"], [26, "阿哲"], [40, "阿哲"]]) {
  ev(`state.turnCount = ${turn}; maybeFireReunionNpc(state)`);
  A.check(`第 ${turn} 回合、敘事還沒出現這個人：${want ? "每回合都給場景指令" : "不重複給（等AI照排定回合那次的指令）"}`, ev("state.reunionNow && state.reunionNow.name") === (want), ev("state.reunionNow"));
}
ev("noteReunionAppeared(state, '你在走廊遇見了阿哲，他笑著跟你打招呼。'); state.turnCount = 41; maybeFireReunionNpc(state)");
A.check("敘事裡出現這個人之後：不再給場景指令", ev("state.reunionNpc.appeared") === true && ev("state.reunionNow") === null);

// 整個第一階段都沒登場：自動退10點並跳訊息（本機人生退回永久池）
await H.startNewLife(g, { name: "林小晴" });
ev(`state.characters.push({name:'阿哲',relation:'同學',gender:'男',affinity:80,active:true,traits:'',summary:'',lastTurn:5,age:30}); state.age=78; state.ap.gift=30; state.ap.daily=0; state.apLog=[];
  state.ending={successionAvailable:true,epitaph:'x',overview:'y',segments:[],transitions:[],teaser:null}; state.phase='ending'; render()`);
doc.getElementById("btn-reincarnate").click(); await sleep(10);
doc.querySelector('#life-keep-modal [data-keep*="阿哲"]').click(); await sleep(5);
doc.getElementById("btn-keep-ok").click(); await sleep(40);
const paid = ev("totalAP(state)");
ev("state.studentStatus = 'graduated'; maybeFireReunionNpc(state)"); await sleep(20);
const msg = (doc.getElementById("reunion-refund-modal")?.textContent || "").replace(/\s+/g, "");
A.check("第一階段結束仍沒登場：自動退還10點，點數紀錄「人生重開丹（退還）」", ev("totalAP(state)") === paid + 10 && ev("state.apLog.some(e=>e.type==='人生重開丹（退還）' && e.n===10)") && ev("state.reunionNpc.closed") === true, [paid, ev("totalAP(state)")]);
A.check("撰稿人訊息：「上一世你帶來的那位舊識，這一世沒能順利遇上。人生重開丹的 10 點已經退還給你。」", msg.includes("上一世你帶來的那位舊識，這一世沒能順利遇上。人生重開丹的10點已經退還給你。"), msg);
ev("maybeFireReunionNpc(state)"); await sleep(10);
A.check("只退一次，不會重複退", ev("totalAP(state)") === paid + 10);
A.check("整段沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
