// 2026-10-04：回合進行中(送出到結果寫回)擋下會換掉或存下目前人生的操作——切換人生、刪除人生、存到雲端、帳號綁定／登入／登出／轉入
// （test-43修正時發現：回合的await回來時寫的是全域state，中途換掉會寫進別段人生或首頁畫面）（全程假上游，不打真實API）
import * as H from "./harness.mjs";
const A = H.makeAsserter("回合進行中的操作防護");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(15); } return false; };

const fake = H.makeFakeAnthropic({});
let gate = null; // 有值時假上游卡住，直到放行
H.installUpstream(async (...a) => { if (gate) await gate.p; return fake(...a); });
const hold = () => { let r; gate = { p: new Promise(x => r = x) }; gate.release = () => { const g = gate; gate = null; r(); }; };

const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "guard00001" });
await H.startNewLife(g);
const ev = g.ev, doc = g.win.document;
const lifeId = ev("state.lifeId"), turns0 = ev("state.turnCount"), log0 = ev("state.log.length");
const toast = () => (doc.getElementById("writer-toast") || {}).textContent || "";

// ---------- 回合進行中 ----------
hold();
const turn = ev(`takeTurn("跟同學聊天", AP_COST_PER_TURN)`);
await waitFor(() => ev("aiWritingNow"));
A.check("回合送出後、旁白回來前：判定為進行中", ev("turnBusy()") === true && ev("aiWritingNow") === true);
ev("render(true)");
const sw = doc.getElementById("link-switch-life"), rs = doc.getElementById("link-reset");
A.check("選單的切換／刪除人生變灰並標示暫停", sw && sw.classList.contains("off") && sw.getAttribute("aria-disabled") === "true" && rs && rs.classList.contains("off")
  && doc.getElementById("panel-menu").textContent.includes("撰稿人寫完這一回合後，才能切換或刪除人生。"));
await ev("switchLife()");
A.check("切換其他人生被擋下：還在同一段人生、有提示", ev("state.phase") === "playing" && ev("state.lifeId") === lifeId && toast().includes("寫完才能切換其他人生"), { phase: ev("state.phase"), t: toast() });
ev("renderConfirmReset()");
A.check("刪除這段人生被擋下：不出現確認視窗", !doc.getElementById("confirm-modal") && toast().includes("寫完才能刪除這段人生"));
await ev("manualCloudSave()");
A.check("存到雲端被擋下：不出現存檔視窗", !doc.getElementById("manual-save-modal") && toast().includes("寫完才能存到雲端"));
ev(`openAccountFlow("bind")`);
A.check("綁定信箱被擋下", ev("acctFlow===null || acctFlow===undefined") && toast().includes("寫完才能綁定或登入"), ev("JSON.stringify(acctFlow)"));
ev(`openAccountFlow("change")`);
A.check("換綁信箱被擋下", ev("acctFlow===null || acctFlow===undefined") && toast().includes("寫完才能換綁信箱"));

// ---------- 放行 ----------
gate.release();
await turn; await H.waitIdle(g); H.clickModals(g.win);
A.check("回合正常寫完，寫進原本這段人生", ev("state.lifeId") === lifeId && ev("state.turnCount") === turns0 + 1 && ev("state.log.length") === log0 + 1 && !ev("state.log[state.log.length-1].error"));
A.check("寫完後不再是進行中", ev("turnBusy()") === false && ev("aiWritingNow") === false);
ev("render()");
A.check("選單恢復可按、暫停說明消失", !doc.getElementById("link-switch-life").classList.contains("off") && !doc.getElementById("link-reset").classList.contains("off") && !doc.getElementById("panel-menu").textContent.includes("撰稿人寫完這一回合後"));
ev("renderConfirmReset()");
A.check("寫完後刪除確認視窗照常出現", !!doc.getElementById("confirm-modal"));
doc.getElementById("confirm-modal").remove();
await ev("switchLife()"); await H.waitIdle(g);
A.check("寫完後切換其他人生照常", ev("state.phase") === "slotPicker", ev("state.phase"));

// ---------- 回合失敗也會解除 ----------
{
  const g2 = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "guard00002" });
  await H.startNewLife(g2);
  H.installUpstream(async () => new Response("boom", { status: 500 }));
  await g2.ev(`takeTurn("跟同學聊天", AP_COST_PER_TURN)`); await H.waitIdle(g2);
  A.check("旁白失敗(已退點)後也解除進行中", g2.ev("turnBusy()") === false && g2.ev("state.log[state.log.length-1].error") === true);
  H.installUpstream(fake);
}

const errs = g.errors.map(String).filter(e => !/第一次呼叫失敗|重試後仍失敗/.test(e));
A.check("沒有JS錯誤", errs.length === 0, errs);
process.exit(A.report() ? 0 : 1);
