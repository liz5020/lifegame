// 依序跑所有測試檔，任一失敗就回傳非0
import { execFileSync } from "child_process";
import fs from "fs";
const files = ["check-syntax.mjs", ...fs.readdirSync(".").filter(f => /^test-.*\.mjs$/.test(f)).sort()];
// 需要真的瀏覽器的測試(browser-*.cjs)：設定PW_MODULE(playwright模組路徑)或已安裝playwright時才跑
if (process.env.PW_MODULE || process.env.RUN_BROWSER_TESTS) files.push(...fs.readdirSync(".").filter(f => /^browser-.*\.cjs$/.test(f)).sort());
// 2026-09-28：test-16-playstyle的長程模擬(6條人生×900回合)在改動前就要約1.87GB，貼著Node預設堆積上限，偶爾記憶體不足；統一放寬到4GB
let failed = [];
for (const f of files) {
  try { const out = execFileSync("node", ["--max-old-space-size=4096", f], { encoding: "utf8", maxBuffer: 1 << 26 }); const head = out.split("\n").find(l => l.startsWith("===") || l.startsWith("語法")); console.log(head || f + " 完成"); }
  catch (e) { failed.push(f); console.log("✗ " + f + "\n" + (e.stdout || "").split("\n").filter(l => /^===|^未通過/.test(l)).join("\n")); }
}
console.log(failed.length ? "\n未通過：" + failed.join("、") : "\n全部通過");
process.exit(failed.length ? 1 : 0);
