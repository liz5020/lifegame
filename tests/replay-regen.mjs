// 2026-10-10（一、1.2.9.18.1驗收第2點）：回放驗證——拿 比對紀錄_模型比較/_work/records/ 的真實AI回合(api.msg.content裡的tool_use.input)，
// 經 normalizeTurnResultText() 後跑新的檢查(程式直接修＋三類分類)，算出需要重寫的比例(目標≤5%)。不呼叫AI、不花錢。
// 這批是比對用的測試紀錄，沒有日曆與約定狀態，所以日期星期、約定類檢查不會跑到(只跑正文本身的檢查)。
// 用法：cd tests && node replay-regen.mjs（以後改檢查規則都可以再跑）；test-90會呼叫replay()
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as H from "./harness.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "比對紀錄_模型比較", "_work", "records");

export async function replay({ quiet = false } = {}) {
  if (!fs.existsSync(DIR)) return { total: 0, regen: 0, pct: 0, reasons: {}, notes: {} };
  const recs = [];
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith(".json")).sort()) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch (e) { continue; }
    const content = d && d.api && d.api.msg && d.api.msg.content;
    const tool = Array.isArray(content) && content.find(b => b && b.type === "tool_use");
    if (!tool || !tool.input) continue;
    recs.push({ f, input: tool.input, action: d.action || "", prologue: /開場/.test(d.kind || "") });
  }
  const g = await H.loadGame({ useMock: true, env: H.makeEnv(), key: "replay0001", integrity: true });
  await H.startNewLife(g);
  g.ev("state.promises = []; state.studentExpense = null;");
  const out = { total: recs.length, regen: 0, pct: 0, reasons: {}, notes: {}, samples: [] };
  for (const r of recs) {
    const res = JSON.parse(g.ev(`JSON.stringify((()=>{ const r = normalizeTurnResultText(${JSON.stringify(r.input)}); const fixes = repairTurnText(r);
      const c = classifyTurnOutput(r, state, { prologue: ${r.prologue}, actionText: ${JSON.stringify(r.action)} });
      return { fixes, c1: c.c1.map(i=>i.code), c3: c.c3.map(i=>i.code), msg: c.c1.map(i=>i.msg) }; })())`));
    if (res.c1.length) { out.regen += 1; out.samples.push({ f: r.f, c1: res.msg }); }
    res.c1.forEach(c => { out.reasons[c] = (out.reasons[c] || 0) + 1; });
    res.fixes.concat(res.c3).forEach(c => { out.notes[c] = (out.notes[c] || 0) + 1; });
  }
  out.pct = out.total ? Math.round(out.regen / out.total * 1000) / 10 : 0;
  g.win.close();
  if (!quiet) {
    console.log(`回放 ${out.total} 筆真實AI回合：需要重寫 ${out.regen} 筆（${out.pct}%，目標≤5%）`);
    console.log("重寫原因：", out.reasons);
    console.log("程式直接修＋只記錄：", out.notes);
    out.samples.forEach(s => console.log("  ", s.f, s.c1.join("；")));
  }
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = await replay();
  process.exit(o.total && o.pct > 5 ? 1 : 0);
}
