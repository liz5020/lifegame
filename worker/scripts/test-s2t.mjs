// 一、1.2.9.14 簡轉繁單元測試：node scripts/test-s2t.mjs
import { toTraditional, toTaiwanTraditional, convertAnthropicResponse } from "../s2t.js";
let fail = 0;
function eq(input, expected) {
  const got = toTraditional(input);
  const ok = got === expected;
  if (!ok) fail++;
  console.log((ok ? "✓ " : "✗ ") + JSON.stringify(input) + " → " + JSON.stringify(got) + (ok ? "" : "（預期 " + JSON.stringify(expected) + "）"));
}
eq("你不记得办过这张证件。", "你不記得辦過這張證件。");
eq("他住在這裡，里長來了，系上的面試。台灣的夜市。", "他住在這裡，里長來了，系上的面試。台灣的夜市。");
eq("你記得那天，雨下得很大。", "你記得那天，雨下得很大。");
eq("她皺著眉頭，你还是没说话。", "她皺著眉頭，你還是沒說話。");
eq("{{阿翔|走了啦，别迟到。}}", "{{阿翔|走了啦，別遲到。}}");
eq("着急", "著急");
function eqTw(input, expected) {
  const got = toTaiwanTraditional(input);
  const ok = got === expected;
  if (!ok) fail++;
  console.log((ok ? "✓ " : "✗ ") + "[詞彙] " + JSON.stringify(input) + " → " + JSON.stringify(got) + (ok ? "" : "（預期 " + JSON.stringify(expected) + "）"));
}
eqTw("后来你才知道，最后他还是走了。", "後來你才知道，最後他還是走了。");
eqTw("之后再说吧。背后有人。", "之後再說吧。背後有人。");
eqTw("他下载了一个软件，看视频看到半夜。", "他下載了一個軟體，看影片看到半夜。");
eqTw("你收到一条信息。网络断了，屏幕一片黑。质量不太好。", "你收到一條訊息。網路斷了，螢幕一片黑。品質不太好。");
eqTw("皇后。系上。里長。台灣。", "皇后。系上。里長。台灣。");
const resp = convertAnthropicResponse({ content: [
  { type: "thinking", thinking: "这是思考" },
  { type: "tool_use", name: "submit_turn_result", input: { narrative: "你不记得了。", choices: ["回家吧", "再坐一会"], stat_deltas: { health: 1 } } }
] });
const inp = resp.content[1].input;
const ok2 = inp.narrative === "你不記得了。" && inp.choices[1] === "再坐一會" && inp.stat_deltas.health === 1 && resp.content[0].thinking === "这是思考";
if (!ok2) fail++;
console.log((ok2 ? "✓ " : "✗ ") + "Anthropic回應tool_use欄位遞迴轉換、thinking不動：" + JSON.stringify(inp));
console.log(fail ? `失敗 ${fail} 項` : "全部通過");
process.exit(fail ? 1 : 0);
