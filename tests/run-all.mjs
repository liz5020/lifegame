// 跑測試檔，任一失敗就回傳非0
// 用法：node run-all.mjs            全套（commit前必跑）
//       node run-all.mjs --quick    略過長程模擬(SLOW清單)，改到一半時用
//       node run-all.mjs 38 16b     只跑檔名含這些字串的測試（語法檢查一律先跑）
// 2026-09-28：改成平行執行(同時JOBS個)，每檔印耗時
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
const args = process.argv.slice(2);
const quick = args.includes("--quick");
const filters = args.filter(a => !a.startsWith("--"));
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
if (filters.length) files = files.filter(f => filters.some(k => f.includes(k)));
if (quick) files = files.filter(f => !SLOW.includes(f));
// 最慢的先開跑，總時間才不會被它拖在最後
files.sort((a, b) => SLOW.includes(b) - SLOW.includes(a));

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
const syntax = await run("check-syntax.mjs"); report(syntax);
const timedOutList = [];
const failed = syntax.err ? ["check-syntax.mjs"] : [];
const queue = [...files];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) { const r = await run(queue.shift()); report(r); done++; if (r.err) { failed.push(r.f); if (r.timedOut) timedOutList.push(r.f); } }
}));
// 平行時機器較忙，用固定毫秒sleep的測試(如test-31)偶爾等不夠；失敗的檔在最後單獨重跑一次，明確標示不吞掉
const flaky = [];
clearInterval(beat);
const timedOutFiles = new Set(timedOutList);
for (const f of failed.filter(f => f !== "check-syntax.mjs" && !timedOutFiles.has(f))) {
  const r = await run(f);
  if (!r.err) { flaky.push(f); failed.splice(failed.indexOf(f), 1); console.log(`↻ ${f}：平行時失敗、單獨重跑通過 (${r.sec}s)——若常出現要把該測試的固定sleep改成等條件`); }
}
const skipped = quick ? `（--quick：略過${SLOW.join("、")}，commit前要跑全套）` : "";
console.log(`\n共${files.length + 1}檔，${((Date.now() - t0) / 1000).toFixed(0)}秒` + skipped);
if (timedOutList.length) console.log("逾時：" + timedOutList.join("、"));
console.log(failed.length ? "未通過：" + failed.join("、") : "全部通過");
process.exit(failed.length ? 1 : 0);
