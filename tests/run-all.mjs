// 跑測試檔，任一失敗就回傳非0
// 用法：node run-all.mjs            全套（commit前必跑）
//       node run-all.mjs --quick    略過長程模擬(SLOW清單)，改到一半時用
//       node run-all.mjs 38 16b     只跑檔名含這些字串的測試（語法檢查一律先跑）
// 2026-09-28：改成平行執行(同時JOBS個)，每檔印耗時
import { execFile } from "child_process";
import fs from "fs";
const args = process.argv.slice(2);
const quick = args.includes("--quick");
const filters = args.filter(a => !a.startsWith("--"));
// 長程模擬：test-16-playstyle約3.5分鐘、test-6-book約1分鐘
const SLOW = ["test-16-playstyle.mjs", "test-6-book.mjs"];
// test-16-playstyle約需2GB記憶體，同時跑太多會搶記憶體，4個剛好
const JOBS = Number(process.env.JOBS) || 4;
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
  execFile("node", ["--max-old-space-size=4096", f], { encoding: "utf8", maxBuffer: 1 << 26 }, (err, stdout, stderr) => {
    resolve({ f, err, out: stdout || "", errOut: stderr || "", sec: ((Date.now() - t0) / 1000).toFixed(0) });
  });
});
const report = ({ f, err, out, errOut, sec }) => {
  if (!err) { const head = out.split("\n").find(l => l.startsWith("===") || l.startsWith("語法")); console.log(`${head || f + " 完成"}  (${sec}s)`); }
  else console.log(`✗ ${f}  (${sec}s)\n` + out.split("\n").filter(l => /^===|未通過|✗/.test(l)).join("\n") + (errOut ? "\n" + errOut.split("\n").slice(0, 8).join("\n") : ""));
};

const t0 = Date.now();
const syntax = await run("check-syntax.mjs"); report(syntax);
const failed = syntax.err ? ["check-syntax.mjs"] : [];
const queue = [...files];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) { const r = await run(queue.shift()); report(r); if (r.err) failed.push(r.f); }
}));
// 平行時機器較忙，用固定毫秒sleep的測試(如test-31)偶爾等不夠；失敗的檔在最後單獨重跑一次，明確標示不吞掉
const flaky = [];
for (const f of failed.filter(f => f !== "check-syntax.mjs")) {
  const r = await run(f);
  if (!r.err) { flaky.push(f); failed.splice(failed.indexOf(f), 1); console.log(`↻ ${f}：平行時失敗、單獨重跑通過 (${r.sec}s)——若常出現要把該測試的固定sleep改成等條件`); }
}
const skipped = quick ? `（--quick：略過${SLOW.join("、")}，commit前要跑全套）` : "";
console.log(`\n共${files.length + 1}檔，${((Date.now() - t0) / 1000).toFixed(0)}秒` + skipped);
console.log(failed.length ? "未通過：" + failed.join("、") : "全部通過");
process.exit(failed.length ? 1 : 0);
