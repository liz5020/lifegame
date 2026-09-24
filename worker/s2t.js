// 一、1.2.9.14（2026-09-24新增）：AI回傳的文字在Worker端做簡轉繁(OpenCC，台灣用語模式cn→twp)，不載入到前端。
//
// ⚠️實測發現：OpenCC整段直接轉換會改壞原本就正確的繁體字——有些字同時是簡體字也是正常繁體字，
// 例如「系上」→「繫上」、「里長」→「裡長」、「台灣」→「臺灣」。AI的輸出絕大多數本來就是繁體，
// 所以這裡只處理「Big5字集裡不存在的漢字」(＝只可能是簡體字)：
//   1. 整段沒有這種字→原封不動回傳(絕大多數情況，不做任何轉換)
//   2. 有的話，只轉換含有這種字的那一小句(以標點切開)，而且那一句裡本來就在Big5字集的字一律保留原字
// 代價：①簡繁同形的字(例如「后来」的「后」)不會被轉；②「軟件→軟體」這類詞彙層級的台灣用語替換，
// 只有當整個詞都是簡體字時才會生效(「软件」→「軟件」，件字本來就是繁體所以保留)。
import * as OpenCC from "opencc-js/cn2t";
import { BIG5_HAN_CHARS } from "./big5-chars.js";

const BIG5 = new Set(Array.from(BIG5_HAN_CHARS));
const HAN = /\p{Script=Han}/u;
const converter = OpenCC.Converter({ from: "cn", to: "twp" });

function isSimplifiedOnly(ch) {
  return HAN.test(ch) && !BIG5.has(ch);
}

export function toTraditional(text) {
  if (typeof text !== "string" || !text) return text;
  if (!Array.from(text).some(isSimplifiedOnly)) return text;
  return text.replace(/[^，。！？、；：「」『』（）\n]+/g, (seg) => {
    const orig = Array.from(seg);
    if (!orig.some(isSimplifiedOnly)) return seg;
    const conv = Array.from(converter(seg));
    if (conv.length === orig.length) {
      return conv.map((ch, i) => (BIG5.has(orig[i]) ? orig[i] : ch)).join("");
    }
    // 詞彙轉換讓字數變了，無法逐字對齊：退回逐字轉換，只動非Big5的字
    return orig.map((ch) => (isSimplifiedOnly(ch) ? Array.from(converter(ch))[0] || ch : ch)).join("");
  });
}

// 一、1.2.9.14（2026-09-24定案）：簡轉繁之後再套一份小型詞彙對照表，補上面「只轉Big5以外的字」漏掉的部分：
// ①「后」是簡繁同形字不會被轉，常見詞改成「後」；②台灣用語。同時列出轉換前(簡體)與轉換後(繁體字形)兩種寫法，
// 因為例如「视频」經過上面的轉換會變成「視頻」、「屏幕」兩個字本來就是繁體所以原封不動。對照表之後可視試玩結果增補
export const TW_VOCAB = [
  ["之后", "之後"], ["然后", "然後"], ["最后", "最後"], ["以后", "以後"], ["后来", "後來"], ["后來", "後來"], ["背后", "背後"],
  ["软件", "軟體"], ["軟件", "軟體"],
  ["视频", "影片"], ["視頻", "影片"],
  ["信息", "訊息"],
  ["质量", "品質"], ["質量", "品質"],
  ["网络", "網路"], ["網絡", "網路"],
  ["屏幕", "螢幕"]
];
export function applyTwVocab(text) {
  if (typeof text !== "string" || !text) return text;
  let out = text;
  for (const [from, to] of TW_VOCAB) if (out.includes(from)) out = out.split(from).join(to);
  return out;
}
// 簡轉繁前後各套一次：轉換前先比對簡體原形(例如「网络」的「网」剛好在Big5字集裡、不會被轉)，轉換後再比對繁體字形(軟件/視頻/質量…)
export function toTaiwanTraditional(text) {
  return applyTwVocab(toTraditional(applyTwVocab(text)));
}

// 遞迴轉換物件/陣列裡所有字串值(不動key)
export function convertDeep(value) {
  if (typeof value === "string") return toTaiwanTraditional(value);
  if (Array.isArray(value)) return value.map(convertDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) out[k] = convertDeep(value[k]);
    return out;
  }
  return value;
}

// Anthropic Messages API回應：tool_use區塊的input與text區塊的text都轉換，其餘(thinking等)不動
export function convertAnthropicResponse(data) {
  if (!data || !Array.isArray(data.content)) return data;
  data.content = data.content.map((b) => {
    if (b && b.type === "tool_use" && b.input) return { ...b, input: convertDeep(b.input) };
    if (b && b.type === "text" && typeof b.text === "string") return { ...b, text: toTaiwanTraditional(b.text) };
    return b;
  });
  return data;
}
