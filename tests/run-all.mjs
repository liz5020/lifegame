// 依序跑所有測試檔，任一失敗就回傳非0
import { execFileSync } from "child_process";
import fs from "fs";
const files = ["check-syntax.mjs", ...fs.readdirSync(".").filter(f => /^test-.*\.mjs$/.test(f)).sort()];
let failed = [];
for (const f of files) {
  try { const out = execFileSync("node", [f], { encoding: "utf8", maxBuffer: 1 << 26 }); const head = out.split("\n").find(l => l.startsWith("===") || l.startsWith("語法")); console.log(head || f + " 完成"); }
  catch (e) { failed.push(f); console.log("✗ " + f + "\n" + (e.stdout || "").split("\n").filter(l => /^===|^未通過/.test(l)).join("\n")); }
}
console.log(failed.length ? "\n未通過：" + failed.join("、") : "\n全部通過");
process.exit(failed.length ? 1 : 0);
