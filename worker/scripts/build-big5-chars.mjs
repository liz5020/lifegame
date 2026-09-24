// 一、1.2.9.14（2026-09-24新增）：產生Big5字集檔(big5-chars.js)，供s2t.js判斷「這個字本來就是正常繁體字，不要動」。
// Cloudflare Workers的TextDecoder不保證支援big5，所以在本機用Node預先產生成靜態檔，一起部署。只有要更新字集時才需要重跑。
import { writeFileSync } from "node:fs";
const dec = new TextDecoder("big5");
const chars = new Set();
for (let a = 0x81; a <= 0xfe; a++) {
  for (let b = 0x40; b <= 0xfe; b++) {
    const ch = dec.decode(new Uint8Array([a, b]));
    if (ch.length === 1 && ch !== "�" && /\p{Script=Han}/u.test(ch)) chars.add(ch);
  }
}
const out = "// 自動產生，請勿手動編輯（見scripts/build-big5-chars.mjs）\nexport const BIG5_HAN_CHARS = " + JSON.stringify([...chars].join("")) + ";\n";
writeFileSync(new URL("../big5-chars.js", import.meta.url), out);
console.log("Big5漢字數：", chars.size);
