// 2026-09-27：八、8.7 副業三選一的後續差異（全程假上游，不打真實API）
import fs from "fs";
import path from "path";
import * as H from "./harness.mjs";
const A = H.makeAsserter("8.7 副業後續差異");
let lastBody = null;
H.installUpstream(H.makeFakeAnthropic({ turnOverride: (p) => { lastBody = p; return {}; } }));
const g = await H.loadGame({ useMock: false, env: H.makeEnv(), key: "sidebiz001" });
await H.startNewLife(g);
await H.playTurn(g);
const ev = g.ev;
const doc = g.win.document;

// 收入計算
ev(`state.businessStatus=null; state.interestCandidates=[
  {id:'a',category:'藝術創作',status:'active',investment:50,sideBusinessStatus:'kept'},
  {id:'b',category:'手作工藝',status:'active',investment:50,sideBusinessStatus:'gig'},
  {id:'c',category:'商業交易',status:'active',investment:50,sideBusinessStatus:'formal',sideBusinessSince:state.turnCount}]`);
A.check("保持0＋零星3＋正式6＝每月9", ev("computeSideBusinessIncome(state)") === 9);
ev("state.interestCandidates[1].status='dormant'");
A.check("興趣淡成背景：該副業收入停止", ev("computeSideBusinessIncome(state)") === 6);
ev("state.interestCandidates[2].sideBusinessUpgradeOffered=true; state.businessStatus='經營中'");
A.check("正式副業已升級成事業：不重複給副業收入", ev("computeSideBusinessIncome(state)") === 0);
ev("state.businessStatus=null; state.interestCandidates[2].sideBusinessUpgradeOffered=false");

// 月結算有算進去
ev("state.interestCandidates=[{id:'b',category:'手作工藝',status:'active',investment:50,sideBusinessStatus:'gig'}]");
await H.playTurn(g);
const withGig = ev("state.lastSettlement && state.lastSettlement.income");
ev("state.interestCandidates=[]");
await H.playTurn(g);
const without = ev("state.lastSettlement && state.lastSettlement.income");
A.check("月結算收入含副業收入(+3)", withGig - without === 3, { withGig, without });

// 彈窗選擇 → 下一回合告訴AI，之後清掉
ev("state.interestCandidates=[{id:'z',category:'藝術創作',status:'active',investment:45,sideBusinessOffered:true}]");
ev("renderSideBusinessModal('z')");
doc.querySelector('.side-business-btn[data-key="gig"]').click();
doc.getElementById("btn-side-business-confirm").click();
A.check("選零星案：卡片記gig", ev("state.interestCandidates[0].sideBusinessStatus") === "gig");
await H.playTurn(g);
const body = JSON.stringify(lastBody || "");
A.check("下一回合payload帶side_business_event_now與interest_status.side_business", body.includes("side_business_event_now") && /side_business_event_now[^}]*gig/.test(body.replace(/\\"/g, '"')) && /side_business[^,]*gig/.test(body.replace(/\\"/g, '"')));
A.check("用過就清掉", ev("state.sideBusinessEventLog") === null);

// prompt
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt不再要求在choices列三個方向", !prompt.includes("讓玩家在choices裡看到三個方向") && prompt.includes("不要在choices裡列出這三個方向"));
A.check("prompt說明正式副業的時間壓力", prompt.includes("真的佔掉時間"));

A.check("整段沒有jsdom錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
const ok = A.report();
process.exit(ok ? 0 : 1);
