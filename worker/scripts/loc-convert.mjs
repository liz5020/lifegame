// 十、10.8.2：把測試鑰匙換算成門牌，供重新寫入AP_TEST_KEYS(名單改為只存門牌)。給使用者在「自己的終端機」執行：
//   node worker/scripts/loc-convert.mjs
// 流程：①輸入位置密鑰(SAVE_LOCATION_SECRET，從密碼管理工具貼上) ②一行一把輸入測試鑰匙，空白行結束 ③結果(門牌，逗號分隔)直接放進剪貼簿
// 輸入時畫面不顯示任何字(貼上也一樣)，輸出只印「換算了幾把」，不印金鑰、密鑰、門牌。跟worker/location.js同一個算法(統一格式→HMAC-SHA256→64碼十六進位)。
import crypto from "crypto";
import fs from "fs";
import { spawnSync } from "child_process";

const normalizeKey = (k) => String(k == null ? "" : k).toUpperCase().replace(/[\s-]+/g, "");
const locOf = (secret, key) => crypto.createHmac("sha256", secret).update(normalizeKey(key)).digest("hex");

// 不回顯地讀一行(終端機)；不是終端機(測試、管線)時照一般方式讀
function makeReader() {
  const lines = []; let waiting = null, buf = "", ended = false;
  const push = (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else lines.push(l); };
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      for (const ch of chunk) {
        if (ch === "\u0003") { process.stdout.write("\n已取消\n"); process.exit(130); }
        if (ch === "\r" || ch === "\n") { const l = buf; buf = ""; process.stdout.write("\n"); push(l); }
        else if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else if (ch >= " ") buf += ch; // 不回顯
      }
    });
  } else {
    let all = ""; process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => { all += c; });
    process.stdin.on("end", () => { ended = true; for (const l of all.split(/\r?\n/)) push(l); if (waiting) { const w = waiting; waiting = null; w(null); } });
  }
  return () => new Promise((res) => { if (lines.length) res(lines.shift()); else if (ended) res(null); else waiting = res; });
}

const secretOk = (s) => typeof s === "string" && s.length >= 32;
async function main() {
  const read = makeReader();
  process.stdout.write("貼上位置密鑰(SAVE_LOCATION_SECRET)，按Enter(畫面不會顯示)：");
  const secret = (await read()) || "";
  if (!secretOk(secret)) { console.log("位置密鑰是空的或太短(正常是64個字元)，已停止，沒有換算。"); process.exit(1); }
  console.log("一行貼一把測試鑰匙，貼完按Enter；全部貼完後，在空白行再按一次Enter結束：");
  const locs = [];
  for (;;) {
    process.stdout.write("鑰匙" + (locs.length + 1) + "：");
    const k = await read();
    if (k === null || k.trim() === "") break;
    if (!normalizeKey(k)) { console.log("(這一行是空的，略過)"); continue; }
    const l = locOf(secret, k);
    if (!locs.includes(l)) locs.push(l);
  }
  if (!locs.length) { console.log("沒有輸入任何鑰匙，已停止。"); process.exit(1); }
  const out = locs.join(",");
  // LOC_CONVERT_TEST_OUT：只給自動測試用，寫到指定檔案而不動剪貼簿
  const r = process.env.LOC_CONVERT_TEST_OUT ? (fs.writeFileSync(process.env.LOC_CONVERT_TEST_OUT, out), { status: 0 }) : process.platform === "darwin" ? spawnSync("pbcopy", { input: out }) : { status: 1 };
  if (r.status !== 0) { console.log("沒辦法放進剪貼簿，已停止(不會把結果印在畫面上)。"); process.exit(1); }
  console.log("已換算 " + locs.length + " 把，結果(門牌，逗號分隔)已放進剪貼簿，可以直接貼到 AP_TEST_KEYS。");
  process.exit(0);
}
main();
