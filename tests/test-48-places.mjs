// 2026-09-30：地點名單(十八、18.15)、地點面板(十六、16.15)、副業據點與一起做的人(十六、16.16)（全程假上游，不打真實API）
import path from "path";
import fs from "fs";
import * as H from "./harness.mjs";
const A = H.makeAsserter("地點名單");
let override = () => ({});
let lastPayload = null;
const fake = H.makeFakeAnthropic({ turnOverride: (p, b) => { lastPayload = p; return override(p, b); } });
H.installUpstream(fake);
const env = H.makeEnv();
const g = await H.loadGame({ useMock: false, env, key: "plc0000001" });
await H.startNewLife(g);
const ev = g.ev;
{ const k = "ap:plc0000001:0"; const rec = JSON.parse(await env.SAVES.get(k)); rec.purchased = 100000; await env.SAVES.put(k, JSON.stringify(rec)); ev("state.ap.purchased=100000"); }
const doc = g.win.document;
const js = (x) => { const r = ev(`JSON.stringify(${x})`); return r === undefined ? undefined : JSON.parse(r); };
const flags = () => ev("JSON.stringify((state.reviewFlags||[]).map(f=>JSON.stringify(f)))");
const P = (n) => `state.places.find(p=>p.name===${JSON.stringify(n)})`;

// ---------- 18.15.1 名單 ----------
ev("delete state.places");
const seed = js("ensurePlaces(state)");
A.check("18.15.1 開局預先登記「家」(住處)與「學校」(學校)；舊存檔第一次用到時補上", seed.length === 2 && seed[0].name === "家" && seed[0].category === "住處" && seed[1].name === "學校" && seed[1].category === "學校");
ev("state.reviewFlags=[]");
ev(`applyPlacesResult(state, { location:'小林工作室', location_new:{ category:'外面', feature:'巷子裡，隔壁是麵店，門口常有一隻缺耳朵的橘白貓', owner:'工作室・璟璇' } }, { names:['雅涵','璟璇'] })`);
let p = js(P("小林工作室"));
A.check("18.15.1 新地點由程式登記：類別、特徵、主理人、造訪次數、上次造訪回合、在場的人", p && p.category === "外面" && /缺耳朵/.test(p.feature) && p.owner === "工作室・璟璇" && p.visits === 1 && p.lastTurn === ev("state.turnCount") && p.who["雅涵"] === 1 && p.status === "營業中", p);
ev(`state.turnCount++; applyPlacesResult(state, { location:'小林工作室' }, { names:['雅涵'] })`);
p = js(P("小林工作室"));
A.check("18.15.1 再去一次：次數累加、在場統計累加、沿用名單上的特徵", p.visits === 2 && p.who["雅涵"] === 2 && /缺耳朵/.test(p.feature));
ev(`applyPlacesResult(state, { location:'小林工作室', location_new:{ category:'學校' } }, { names:[] })`);
A.check("18.15.2 回報類別與名單不符：以名單為準並寫入錯誤紀錄", js(P("小林工作室")).category === "外面" && /location_category_mismatch/.test(flags()));
ev("state.reviewFlags=[]");
const cat = ev(`applyPlacesResult(state, { location:'小林工作室' }, { names:[], plan:{ mode:'away', category:'學校' } })`);
A.check("18.15.2 指定類別是學校、旁白寫了外面的地點：回傳名單上的類別並寫入錯誤紀錄", cat === "外面" && /location_plan_mismatch/.test(flags()));
ev("state.reviewFlags=[]");
ev(`applyPlacesResult(state, { location:'無類別小店' }, { names:[], plan:{ mode:'away', category:'別人那裡' } })`);
A.check("18.15.1 新地點沒附合法類別：退回指定類別並寫入錯誤紀錄", js(P("無類別小店")).category === "別人那裡" && /location_no_category/.test(flags()));
ev(`applyPlacesResult(state, { location:'文具行', location_new:{ category:'外面', feature:'老闆娘很兇' }, place_updates:[] }, { names:[] })`);
ev(`applyPlacesResult(state, { location:'家', place_updates:[{ name:'文具行', feature:'頂讓給別人了', status:'已關閉' }] }, { names:[] })`);
A.check("18.15.1 place_updates：特徵與狀態變化(文具行頂讓後改為已關閉)", js(P("文具行")).status === "已關閉" && js(P("文具行")).feature === "頂讓給別人了");

// ---------- 提示：最近造訪的10個地點 ----------
ev(`for(let i=0;i<14;i++){ state.turnCount++; applyPlacesResult(state, { location:'地點'+i, location_new:{ category:'外面', feature:'特徵'+i } }, { names:[] }); }`);
const rp = js("recentPlacesPayload(state)");
A.check("18.15.1 每回合附給旁白最近造訪過的10個地點(名稱、類別、特徵)，已關閉不列", rp.length === 10 && rp[0].name === "地點13" && rp[0].feature === "特徵13" && !rp.some(x => x.name === "文具行"), rp.map(x => x.name));

// ---------- 整回合：location取代scene_category，連續次數依名單類別 ----------
ev("state.places=null; ensurePlaces(state); state.sceneStreak=null; state.focus='study'");
override = () => ({ location: "小林工作室", location_new: { category: "外面", feature: "巷子裡的工作室", owner: "璟璇" } });
await H.playTurn(g, "嗯");
A.check("整回合：旁白回報location→登記新地點、記造訪", ev("!!state.places.find(p=>p.name==='小林工作室')") && ev("state.currentPlace") === "小林工作室" && ev(`${P("小林工作室")}.visits`) === 1);
A.check("整回合：18.3連續次數依地點名單的類別計算", js("state.sceneStreak").cat === "外面" && js("state.sceneStreak").n >= 1, js("state.sceneStreak"));
A.check("整回合：提示含places_recent，且不再要求scene_category", Array.isArray(lastPayload.places_recent) && lastPayload.places_recent.length >= 2);
override = () => ({});
await H.playTurn(g, "嗯");
A.check("整回合(沒填location的舊式回報)：不會壞、不記造訪", g.errors.length === 0);

// ---------- 16.15 地點面板 ----------
ev(`state.places=null; ensurePlaces(state); state.characters.forEach(c=>{ if(c.relation==='母親'||c.relation==='父親') c.cohabiting=true });
applyPlacesResult(state, { location:'家' }, { names:['媽媽'] });
state.turnCount++; applyPlacesResult(state, { location:'小林工作室', location_new:{ category:'外面', feature:'巷子裡的工作室', owner:'工作室・璟璇' } }, { names:['璟璇','璟璇','雅涵','A','B','C'] });
state.turnCount++; applyPlacesResult(state, { location:'小林工作室' }, { names:['璟璇'] });
state.turnCount++; applyPlacesResult(state, { location:'文具行', location_new:{ category:'外面', feature:'老闆娘很兇' } }, { names:[] });
state.turnCount++; applyPlacesResult(state, { location:'家' }, { names:[] });
applyPlacesResult(state, { location:'家', place_updates:[{ name:'文具行', status:'已關閉' }] }, { names:[] });`);
ev("renderPlacesModal()");
const pm = doc.getElementById("places-modal");
A.check("16.15 現況摘要：住在／現在在／常去前3個", /住在：家/.test(pm.textContent) && /現在在：家/.test(pm.textContent) && /常去：家、小林工作室/.test(pm.textContent), pm.textContent.slice(0, 120));
const cards = [...pm.querySelectorAll(".place-card")];
A.check("16.15 地點卡依上次造訪由近到遠、已關閉灰色排最底", cards.length === 3 && /家/.test(cards[0].textContent) && /小林工作室/.test(cards[1].textContent) && /文具行/.test(cards[2].textContent) && /grayscale/.test(cards[2].getAttribute("style")), cards.map(c => c.textContent.slice(0, 20)));
A.check("16.15 地點卡：名稱、主理人、特徵、常在這裡的人(出現最多的前4位)、上次去(月份)", /工作室・璟璇/.test(cards[1].textContent) && /巷子裡的工作室/.test(cards[1].textContent) && /常在這裡的人：璟璇、/.test(cards[1].textContent) && (cards[1].textContent.match(/常在這裡的人：([^\n]*)/)[1].split("、").length) <= 4 && /上次去：\d+月/.test(cards[1].textContent));
A.check("16.15 已關閉的地點沒有「去這裡」按鈕", cards[2].querySelectorAll(".place-go").length === 0 && cards[1].querySelectorAll(".place-go").length === 1);
pm.querySelector('.place-go[data-name="小林工作室"]').click();
A.check("16.15 「去這裡」：只在輸入框填入「去○○，」、不自動送出、面板關閉", doc.getElementById("custom-input").value === "去小林工作室，" && !doc.getElementById("places-modal"));
ev("render()");
A.check("16.15 選單有地點入口與處數", !!doc.getElementById("link-places") && /3處/.test(doc.getElementById("link-places").textContent), doc.getElementById("link-places") && doc.getElementById("link-places").textContent);

// ---------- 16.16 副業據點與一起做的人 ----------
ev(`state.interestCandidates=[{id:'hc',category:'手作工藝',status:'active',investment:50,sideBusinessStatus:'formal',lastEngagedRound:state.turnCount}]`);
ev(`state.characters.push({name:'璟璇',relation:'表姊',gender:'女',traits:'',summary:'',active:true,isChild:false,lastTurn:1,origin:'x',affinity:60})`);
ev(`state.reviewFlags=[]; registerGigPartners(state, [{ name:'璟璇' }, { name:'不存在的人' }])`);
A.check("8.13／16.16 gig_partner_add：登記人物名單上的人，對不到的拒絕並寫入錯誤紀錄", js("state.interestCandidates[0].gigPartners").join() === "璟璇" && /gig_partner_invalid/.test(flags()));
ev(`applyPlacesResult(state, { location:'小林工作室' }, { names:[], gigCardId:'hc' }); applyPlacesResult(state, { location:'小林工作室' }, { names:[], gigCardId:'hc' })`);
ev("renderGigModal()");
const gtxt = doc.getElementById("gig-modal").textContent;
A.check("16.16 副業面板概況：據點(做副業時去最多的地方)與一起做的人(帶出關係)", /據點：小林工作室/.test(gtxt) && /一起做的人：璟璇（表姊）/.test(gtxt), gtxt.slice(0, 150));

// ---------- prompt ----------
const prompt = fs.readFileSync(path.join(H.ROOT, "worker/prompt.js"), "utf8");
A.check("prompt：地點名單規則(location必填、location_new、place_updates、places_recent、gig_partner_add)，scene_category欄位已停用", ["places_recent", "location_new", "place_updates", "gig_partner_add", "不要再回報scene_category"].every(k => prompt.includes(k)) && !/scene_category:\s*\{/.test(prompt));
A.check("沒有前端錯誤", g.errors.length === 0, g.errors.map(String).slice(0, 3));
process.exit(A.report() ? 0 : 1);
