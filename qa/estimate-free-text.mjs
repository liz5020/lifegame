// 推估「玩家自己輸入文字」的回合比例（唯讀，只輸出統計數字，不輸出任何日記內容）。
// 為什麼是推估：舊存檔的日記沒有記「這回合是點選項還是自由輸入」，所以只能用長度分布推算。
// 做法：每份存檔現在的 choices（AI給的選項）是已知的選項樣本，量出選項長度的分布；
//       再看玩家歷來的行動文字有多少比選項明顯更長，換算成自由輸入比例的範圍。
//
// 用法（在自己的電腦跑，密碼只放環境變數，不要貼到對話裡）：
//   WORKER_URL=https://<你的worker網址> SAVE_ADMIN_TOKEN=<管理密碼> \
//   WHO="你的名字" REASON="統計自由書寫比例" node qa/estimate-free-text.mjs
// 注意：每讀一份存檔，Worker 都會寫一筆存取紀錄（10.13.6），122局＝122筆，屬正常。
const BASE = (process.env.WORKER_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.SAVE_ADMIN_TOKEN || "";
const WHO = process.env.WHO || "", REASON = process.env.REASON || "";
if (!BASE || !TOKEN || !WHO || !REASON) {
  console.error("請設定環境變數 WORKER_URL、SAVE_ADMIN_TOKEN、WHO、REASON");
  process.exit(1);
}
const H = { Authorization: "Bearer " + TOKEN };
const len = (s) => [...String(s)].length;
const pctile = (arr, p) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };

const listRes = await fetch(BASE + "/admin/saves", { headers: H });
if (!listRes.ok) { console.error("讀存檔列表失敗", listRes.status); process.exit(1); }
const saves = (await listRes.json()).saves || [];
console.log("存檔份數：" + saves.length);

let markedFree = 0, markedChoice = 0; // 新版日記每則有 inputSource 標記（管理端文字尾端的〔自由輸入〕／〔選項〕），有標記的直接精確計數
const optionLens = [];          // 現在畫面上的選項長度（已知是「選項」）
const perLife = [];             // 每局的行動長度
let failed = 0;
for (const sv of saves) {
  const q = new URLSearchParams({ who: WHO, reason: REASON, raw: "1" });
  if (sv.lid) q.set("lid", sv.lid); else q.set("code", sv.code);
  let j;
  try {
    const r = await fetch(BASE + "/admin/save?" + q, { headers: H });
    if (!r.ok) { failed++; continue; }
    j = await r.json();
  } catch (e) { failed++; continue; }
  const st = j.state || {};
  for (const c of st.choices || []) if (typeof c === "string" && c.trim()) optionLens.push(len(c.trim()));
  const acts = [];
  for (const line of String(j.text || "").split("\n")) {
    const m = line.match(/^〔玩家的選擇〕(.*)$/);
    if (!m) continue;
    let t = m[1].trim();
    if (t.endsWith("〔自由輸入〕")) { markedFree++; continue; }
    if (t.endsWith("〔選項〕")) { markedChoice++; continue; }
    if (t) acts.push(len(t));
  }
  if (acts.length) perLife.push(acts);
}
if (failed) console.log("讀取失敗：" + failed + " 份（未納入統計）");

if (markedFree + markedChoice) console.log("\n【有標記的回合（新版日記，精確）】自由輸入 " + markedFree + "、選項 " + markedChoice + "，自由輸入占 " + (markedFree / (markedFree + markedChoice) * 100).toFixed(1) + "%\n以下是沒有標記的舊回合，用長度推估。");
const all = perLife.flat();
if (!all.length || !optionLens.length) { console.log("資料不足，無法推估"); process.exit(0); }

console.log("\n【選項長度（現在畫面上的選項，共 " + optionLens.length + " 個）】");
console.log("中位數 " + pctile(optionLens, 0.5) + "字　90百分位 " + pctile(optionLens, 0.9) + "字　95百分位 " + pctile(optionLens, 0.95) + "字　最長 " + Math.max(...optionLens) + "字");
console.log("\n【玩家歷來行動文字（共 " + all.length + " 回合，" + perLife.length + " 局）】");
console.log("中位數 " + pctile(all, 0.5) + "字　90百分位 " + pctile(all, 0.9) + "字　最長 " + Math.max(...all) + "字");
const bins = [[0, 10], [11, 20], [21, 30], [31, 40], [41, 60], [61, 100], [101, 9999]];
for (const [a, b] of bins) {
  const n = all.filter(x => x >= a && x <= b).length;
  console.log(String(a).padStart(3) + "～" + (b === 9999 ? "∞" : String(b)).padEnd(4) + " 字：" + String(n).padStart(5) + " 回合（" + (n / all.length * 100).toFixed(1) + "%）");
}

// 推估：T＝選項長度的95百分位。選項約有 5% 比 T 長；超過 T 的行動，扣掉這 5% 的選項後視為自由輸入。
// 自由輸入裡比 T 長的占比 g 不知道，抓 50%～100% 兩端：g=100% 給出最低值，g=50% 給出較高值。
const T = pctile(optionLens, 0.95);
const over = all.filter(x => x > T).length / all.length;
const f = (g) => Math.max(0, Math.min(1, (over - 0.05) / (g - 0.05)));
console.log("\n【推估自由輸入比例】門檻 T＝" + T + " 字（選項95百分位）；行動超過 T 的占 " + (over * 100).toFixed(1) + "%");
console.log("全部回合：約 " + (f(1) * 100).toFixed(0) + "%～" + (f(0.5) * 100).toFixed(0) + "%（下限假設自由輸入全都比 T 長，上限假設只有一半比 T 長）");
const livesWithLong = perLife.filter(a => a.some(x => x > T)).length;
console.log("至少有一次明顯自由輸入的局數：" + livesWithLong + "／" + perLife.length + "（" + (livesWithLong / perLife.length * 100).toFixed(0) + "%）");
console.log("\n提醒：這是推估。短的自由輸入（例如「去找她」）會被當成選項，所以真實比例通常落在範圍的偏上端或更高。");
