// 跑測試檔，任一失敗就回傳非0
// 用法：node run-all.mjs            全套（全部通過會寫下通過戳記 .last-pass）
//       node run-all.mjs --quick    略過長程模擬(SLOW清單)，改到一半時用
//       node run-all.mjs 38 16b     只跑檔名含這些字串的測試（語法檢查一律先跑）
//       node run-all.mjs --failed   只重跑上次未通過的檔（清單在 .last-failed）
//       node run-all.mjs --bail     第一支失敗就不再開新的測試，正在跑的跑完就結束
//       node run-all.mjs --verify   不跑測試：比對輸入檔與上次全套通過時是否相同（相同＝免重跑）
//       node run-all.mjs --history  不跑測試：列出每支測試的失敗次數與最近一次日期
// 2026-09-28：改成平行執行(同時JOBS個)，每檔印耗時
// 2026-10-10：--failed、--bail、--verify、--history、最慢10支、失敗歷史(.fail-history)、通過戳記(.last-pass)；規則見協作流程說明-共同基準.md「測試期自動上線規則」
import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
const args = process.argv.slice(2);
const quick = args.includes("--quick");
const failedOnly = args.includes("--failed");
const bail = args.includes("--bail");
const filters = args.filter(a => !a.startsWith("--"));
const ROOT = path.resolve("..");
const LAST_FAILED = ".last-failed", LAST_PASS = ".last-pass", FAIL_HISTORY = ".fail-history"; // 三個都在.gitignore

// ---------- 通過戳記：影響測試結果的輸入檔 ----------
// 新增測試若讀到下面以外的檔，要加進這份清單，否則 --verify 會漏判(2026-10-10查證：harness、各test-*.mjs的readFileSync／import)
const INPUT_FILES = ["index.html", "lunar.min.js", "og.png", "terms.html", "privacy.html", "pricing.html", "build-pages.sh",
  "DEPLOY.md",                                  // test-54：記錄過目前版本號
  "CLAUDE.md",                                  // test-90：沒有舊說法
  "life-sim-design/10-存檔與帳號系統.md",       // test-80：說明頁全文
  "life-sim-design/16-介面與視覺設計.md"];      // test-81：試看花絮
const INPUT_DIRS = ["worker", "tests",
  "比對紀錄_模型比較/_work/records"];           // test-90回放真實AI紀錄(只在本機，不在git)
const SKIP_NAMES = new Set(["node_modules", ".wrangler", ".DS_Store", LAST_FAILED, LAST_PASS, FAIL_HISTORY]);
function listInputs() {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    for (const name of fs.readdirSync(abs).sort()) {
      if (SKIP_NAMES.has(name)) continue;
      const r = rel + "/" + name;
      if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r); else out.push(r);
    }
  };
  INPUT_FILES.forEach(f => { if (fs.existsSync(path.join(ROOT, f))) out.push(f); });
  INPUT_DIRS.forEach(walk);
  return out;
}
function inputHashes() {
  const h = {};
  for (const f of listInputs()) h[f] = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
  let jsdom = "?";
  try { jsdom = JSON.parse(fs.readFileSync("node_modules/jsdom/package.json", "utf8")).version; } catch (e) {}
  h["(環境)Node版本"] = process.version;
  h["(環境)jsdom版本"] = jsdom;
  return h;
}
function diffHashes(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter(k => a[k] !== b[k])
    .map(k => !(k in a) ? `${k}（新增）` : !(k in b) ? `${k}（刪除）` : k);
}
const nowText = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" });

if (args.includes("--verify")) {
  let pass = null;
  try { pass = JSON.parse(fs.readFileSync(LAST_PASS, "utf8")); } catch (e) {}
  if (!pass) { console.log("沒有通過戳記：還沒有一份內容全套通過過，要跑一次全套 node run-all.mjs"); process.exit(1); }
  const diff = diffHashes(pass.hashes, inputHashes());
  if (!diff.length) { console.log(`這份內容已經全套通過，免重跑（${pass.at}，${pass.files}檔，${pass.sec}秒）`); process.exit(0); }
  console.log(`和上次全套通過時（${pass.at}）不同的輸入檔（${diff.length}個），要重跑全套：\n` + diff.map(f => "  " + f).join("\n"));
  process.exit(1);
}
if (args.includes("--history")) {
  let lines = [];
  try { lines = fs.readFileSync(FAIL_HISTORY, "utf8").split("\n").filter(Boolean); } catch (e) {}
  if (!lines.length) { console.log("還沒有失敗紀錄"); process.exit(0); }
  const stat = new Map();
  for (const l of lines) {
    const [at, f, kind] = l.split("\t");
    const s = stat.get(f) || { fail: 0, flaky: 0, last: "" };
    if (kind === "flaky") s.flaky++; else s.fail++;
    if (at > s.last) s.last = at;
    stat.set(f, s);
  }
  console.log("失敗次數（由多到少）｜「平行時失敗」＝平行時失敗、單獨重跑通過，常出現代表測試太脆");
  [...stat].sort((a, b) => (b[1].fail + b[1].flaky) - (a[1].fail + a[1].flaky) || (b[1].last > a[1].last ? 1 : -1))
    .forEach(([f, s]) => console.log(`${String(s.fail + s.flaky).padStart(3)}次  ${f}  （未通過${s.fail}、平行時失敗${s.flaky}；最近 ${s.last}）`));
  process.exit(0);
}

// 長程模擬：test-16-playstyle約3.5分鐘、test-6-book約1分鐘
const SLOW = ["test-16-playstyle.mjs", "test-6-book.mjs"];
// test-16-playstyle約需2GB記憶體，同時跑太多會搶記憶體，4個剛好
// 2026-10-09：依電腦記憶體自動降低同時數(每個約佔3GB估算；8GB的機器=2個)，避免記憶體不夠開始硬碟換頁、整套卡住；可用JOBS=n覆蓋
const JOBS = Number(process.env.JOBS) || Math.max(1, Math.min(4, Math.floor(os.totalmem() / 1024 ** 3 / 3)));
// 2026-10-09：單檔逾時(秒)，超過就強制結束並標「逾時」，不再無限等；長程模擬給長一點；可用TEST_TIMEOUT=秒覆蓋
const timeoutMs = (f) => (Number(process.env.TEST_TIMEOUT) || (SLOW.includes(f) ? 900 : 300)) * 1000;
const running = new Map(); // 檔名→開始時間，給進度提示用
let files = fs.readdirSync(".").filter(f => /^test-.*\.mjs$/.test(f)).sort();
// 需要真的瀏覽器的測試(browser-*.cjs)：設定PW_MODULE(playwright模組路徑)或已安裝playwright時才跑
if (process.env.PW_MODULE || process.env.RUN_BROWSER_TESTS) files.push(...fs.readdirSync(".").filter(f => /^browser-.*\.cjs$/.test(f)).sort());
if (failedOnly) {
  let last = [];
  try { last = fs.readFileSync(LAST_FAILED, "utf8").split("\n").filter(Boolean); } catch (e) {}
  if (!last.length) { console.log("沒有上次失敗紀錄（上次全部通過，或還沒跑過）"); process.exit(0); }
  files = last.filter(f => f !== "check-syntax.mjs" && fs.existsSync(f)); // 語法檢查一律先跑
  console.log("只重跑上次未通過的：" + last.join("、"));
}
if (filters.length) files = files.filter(f => filters.some(k => f.includes(k)));
if (quick && !failedOnly) files = files.filter(f => !SLOW.includes(f));
// 最慢的先開跑，總時間才不會被它拖在最後
files.sort((a, b) => SLOW.includes(b) - SLOW.includes(a));
// 只有不加選項的全套才寫通過戳記；開跑前先算輸入檔雜湊(測的是這一份內容)，跑完再算一次，中途有人改檔就不寫
const fullRun = !quick && !failedOnly && !filters.length;
const hashesAtStart = fullRun ? inputHashes() : null;

// 2026-09-28：test-16-playstyle的長程模擬(6條人生×900回合)在改動前就要約1.87GB，貼著Node預設堆積上限，偶爾記憶體不足；統一放寬到4GB
const run = (f) => new Promise(resolve => {
  const t0 = Date.now();
  running.set(f, t0);
  execFile("node", ["--max-old-space-size=4096", f], { encoding: "utf8", maxBuffer: 1 << 26, timeout: timeoutMs(f), killSignal: "SIGKILL" }, (err, stdout, stderr) => {
    running.delete(f);
    resolve({ f, err, out: stdout || "", errOut: stderr || "", sec: ((Date.now() - t0) / 1000).toFixed(0), timedOut: !!(err && err.killed) });
  });
});
const report = ({ f, err, out, errOut, sec, timedOut }) => {
  if (timedOut) console.log(`⏱ ${f} 逾時被強制結束 (${sec}s)——不是測試判定失敗，是跑太久；單獨跑看看：node ${f}`);
  else if (!err) { const head = out.split("\n").find(l => l.startsWith("===") || l.startsWith("語法")); console.log(`${head || f + " 完成"}  (${sec}s)`); }
  else console.log(`✗ ${f}  (${sec}s)\n` + out.split("\n").filter(l => /^===|未通過|✗/.test(l)).join("\n") + (errOut ? "\n" + errOut.split("\n").slice(0, 8).join("\n") : ""));
};

const t0 = Date.now();
// 每30秒印一次進度，讓你知道沒有當掉、現在卡在哪個檔
const beat = setInterval(() => {
  const now = Date.now();
  const list = [...running].map(([f, t]) => `${f}(${Math.round((now - t) / 1000)}s)`).join("、");
  console.log(`… 已${Math.round((now - t0) / 1000)}秒，完成${done}/${files.length}，正在跑：${list || "無"}`);
}, 30000);
let done = 0;
const times = []; // 每支耗時，最後印最慢10支
const syntax = await run("check-syntax.mjs"); report(syntax);
const timedOutList = [];
const failed = syntax.err ? ["check-syntax.mjs"] : [];
const queue = [...files];
let bailed = false;
const stopNew = () => bail && failed.length > 0;
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length && !stopNew()) { const r = await run(queue.shift()); report(r); times.push([r.f, Number(r.sec)]); done++; if (r.err) { failed.push(r.f); if (r.timedOut) timedOutList.push(r.f); } }
}));
if (stopNew() && queue.length) { bailed = true; console.log(`\n--bail：已有失敗，剩下${queue.length}支沒有開跑`); }
// 平行時機器較忙，用固定毫秒sleep的測試(如test-31)偶爾等不夠；失敗的檔在最後單獨重跑一次，明確標示不吞掉(--bail時不重跑，直接結束)
const flaky = [];
clearInterval(beat);
const timedOutFiles = new Set(timedOutList);
if (!bail) for (const f of failed.filter(f => f !== "check-syntax.mjs" && !timedOutFiles.has(f))) {
  const r = await run(f);
  if (!r.err) { flaky.push(f); failed.splice(failed.indexOf(f), 1); console.log(`↻ ${f}：平行時失敗、單獨重跑通過 (${r.sec}s)——若常出現要把該測試的固定sleep改成等條件`); }
}
const skipped = quick ? `（--quick：略過${SLOW.join("、")}，推之前要有全套通過的戳記）` : "";
const totalSec = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n共${done + 1}檔，${totalSec}秒` + skipped);
const slowest = times.sort((a, b) => b[1] - a[1]).slice(0, 10);
if (slowest.length > 1) console.log("最慢的10支：" + slowest.map(([f, s]) => `${f} ${s}s`).join("、"));
if (timedOutList.length) console.log("逾時：" + timedOutList.join("、"));
console.log(failed.length ? "未通過：" + failed.join("、") : bailed ? "沒有跑完(--bail)" : "全部通過");

// 失敗清單(給--failed)與失敗歷史(給--history)
try { fs.writeFileSync(LAST_FAILED, failed.join("\n") + (failed.length ? "\n" : "")); } catch (e) {}
const at = nowText();
const hist = failed.map(f => `${at}\t${f}\tfail`).concat(flaky.map(f => `${at}\t${f}\tflaky`));
if (hist.length) try { fs.appendFileSync(FAIL_HISTORY, hist.join("\n") + "\n"); } catch (e) {}
// 通過戳記：只有全套、全部通過、而且跑的期間輸入檔沒被改動才寫
if (fullRun && !failed.length && !bailed) {
  const changed = diffHashes(hashesAtStart, inputHashes());
  if (changed.length) console.log("跑的期間這些檔被改動了，不寫通過戳記，要重跑全套：" + changed.join("、"));
  else {
    fs.writeFileSync(LAST_PASS, JSON.stringify({ at, files: done + 1, sec: Number(totalSec), hashes: hashesAtStart }, null, 1));
    console.log("已寫下通過戳記（推之前用 node run-all.mjs --verify 確認內容沒變）");
  }
}
process.exit(failed.length ? 1 : 0);
