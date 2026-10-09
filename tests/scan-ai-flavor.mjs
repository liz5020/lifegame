// 掃描遊戲正文的AI味（1.2.9.19）：用法 node scan-ai-flavor.mjs <正文文字檔>
// 只列出可疑處給人判斷，不判對錯。「沉穩撐接壓」要人看是實際動作還是比喻。
import fs from "node:fs";
const t = fs.readFileSync(process.argv[2], "utf8");
const rules = [
  ["這不是…而是…", /這不是[^。！？\n]{0,30}而是/g],
  ["不是…而是…", /不是[^。！？\n]{1,30}[，,]?而是/g],
  ["破折號", /[—─－]{1,}|--/g],
  ["沉/穩/撐/接住/壓", /沉|穩|撐|接住|壓/g],
];
for (const [name, re] of rules) {
  const hits = [...t.matchAll(re)];
  console.log(`\n【${name}】${hits.length} 處`);
  for (const m of hits.slice(0, 40)) {
    const a = Math.max(0, m.index - 14), b = Math.min(t.length, m.index + m[0].length + 14);
    console.log("  …" + t.slice(a, b).replace(/\n/g, "⏎") + "…");
  }
}
