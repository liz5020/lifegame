// 2026-10-08 十、10.3.13 付費周邊（帳號人生）：反悔超過免費次數、人生重開丹、回顧這一生都扣帳號錢包（伺服器端一次性扣點）。
// jsdom＋真的worker.js＋假Resend，不打真實API
import * as H from "./harness.mjs";
const A = H.makeAsserter("付費周邊：帳號錢包扣點");
const resend = H.makeFakeResend(); H.installUpstream(H.makeFakeAnthropic(), resend);
const env = await H.makeAccountEnv({ TEST_NOW_MS: undefined, CLOUD_SAVE_ENABLED: "false" });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return v; await wait(15); } return false; }
const g = await H.loadGame({ useMock: true, env, key: "paidw0000001", cloud: false });
const ev = g.ev, doc = g.win.document;
ev("MOCK_AI_DELAY_MS = 0; MOCK_CHAPTER_DELAY_MS = 1");
await H.startNewLife(g, { name: "帳號人" }); await H.playTurn(g, "嗯");
// 綁定信箱（帶這段人生進帳號）
ev(`openAccountFlow('bind')`);
doc.getElementById("btn-acct-start").click();
doc.getElementById("acct-email").value = "paid@example.com";
doc.getElementById("btn-acct-send").click();
await until(() => doc.getElementById("acct-code"));
doc.getElementById("acct-code").value = resend.lastCode("paid@example.com");
doc.getElementById("btn-acct-verify").click();
await until(() => doc.getElementById("bind-result-modal")); H.clickModals(g.win); await wait(60);
const rawAcct = () => { for (const [k, v] of env.ACCOUNTS._store) if (k.startsWith("a:") && v.email === "paid@example.com") return [k, v]; };
const setWallet = (n) => { const [k, v] = rawAcct(); v.wallet.gift = n; v.wallet.daily = 0; v.wallet.purchased = 0; env.ACCOUNTS._store.set(k, v); };
const serverTotal = () => { const v = rawAcct()[1]; return v.wallet.gift + v.wallet.daily + v.wallet.purchased; };
A.check("(前置) 這段人生已經是帳號人生", ev("walletActive(state)") === true);
setWallet(100); await ev("refreshAccount()");
A.check("(前置) 錢包 100 點，畫面與伺服器一致", ev("totalAP(state)") === 100 && serverTotal() === 100, [ev("totalAP(state)"), serverTotal()]);

// 反悔超過免費次數：扣帳號錢包
ev("state.undosLeft = 0"); await H.playTurn(g, "再一回合"); await wait(20);
const w0 = serverTotal();
ev("requestUndo()"); await wait(10);
doc.getElementById("btn-undo-pay-ok").click(); await wait(80);
A.check("帳號人生：超過免費次數的反悔扣帳號錢包 1 點（伺服器與畫面都扣）", serverTotal() === w0 - 1 && ev("totalAP(state)") === w0 - 1, [serverTotal(), ev("totalAP(state)"), w0]);
A.check("點數紀錄：「反悔（超過 5 次）」−1", ev("state.apLog.some(e=>e.type==='反悔（超過 5 次）' && e.n===-1)"));

// 人生重開丹：扣帳號錢包 10 點，下一世沿用同一個帳號人生格子
setWallet(100); await ev("refreshAccount()");
ev(`state.age = 78; state.ending = { successionAvailable:true, epitaph:'x', overview:'y', segments:[], transitions:[], teaser:null }; state.phase = 'ending'; render();`);
doc.getElementById("btn-reincarnate").click(); await wait(10);
doc.querySelector('#life-keep-modal [data-keep*="network"]').click(); await wait(5);
doc.getElementById("btn-keep-ok").click(); await wait(100);
A.check("帳號人生：人生重開丹扣帳號錢包 10 點（伺服器 90），新的一世仍是帳號人生、人脈起點＋5", serverTotal() === 90 && ev("walletActive(state)") === true && ev("state.lifeKeep.stat") === "network" && ev("state.reincarnations") === 1, [serverTotal(), ev("state.reincarnations")]);

// 回顧這一生：60 點（示範模式由錢包端點扣）
await H.startNewLife(g, { name: "帳號人" });
ev(`state.acct = acct && { aid: acct.aid, lid: acct.lives[0].lid }`);
setWallet(59); await ev("refreshAccount()");
ev(`state.age = 78; state.ending = assembleEnding(state, { life_summary:{ segments:[], transitions:[], epitaph:'x', overview:'y' } }); state.phase='ending'; render();`);
A.check("錢包 59 點：回顧這一生按鈕變灰、寫「需要 60 點」", doc.getElementById("btn-review-unlock").disabled && /需要 60 點/.test(doc.getElementById("end-review").textContent));
setWallet(100); await ev("refreshAccount()"); ev("render()");
doc.getElementById("btn-review-unlock").click(); await until(() => ev("!!state.ending.review"));
A.check("錢包 100 點：回顧這一生扣 60 點（伺服器 40）", serverTotal() === 40 && ev("totalAP(state)") === 40, [serverTotal(), ev("totalAP(state)")]);
A.check("整段沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
