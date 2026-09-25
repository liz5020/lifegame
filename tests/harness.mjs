// 2026-09-25新增：Node測試共用工具。用jsdom載入整份index.html，fetch導向真的worker/worker.js(記憶體版KV)，
// Worker呼叫Anthropic的部分導向假的上游(fakeAnthropic)，全程不會打到真實API。
// 需要jsdom：cd tests && npm i jsdom（或沿用已安裝的node_modules）
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const ORIGIN = "https://lifegamepage.smile80275.workers.dev";

export function memoryKV() {
  const m = new Map();
  return {
    _m: m,
    async get(k) { return m.has(k) ? m.get(k).v : null; },
    async put(k, v, opt) { m.set(k, { v: String(v), meta: opt && opt.metadata }); },
    async delete(k) { m.delete(k); },
    async list({ prefix, cursor }) {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix || "")).sort().map(k => ({ name: k, metadata: m.get(k).meta }));
      return { keys, list_complete: true };
    }
  };
}

// 假的Anthropic上游：依payload產生一份合法的submit_turn_result，usage可自訂
export function makeFakeAnthropic(opts = {}) {
  const calls = [];
  const fake = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (opts.fail && opts.fail(body, calls.length)) return new Response(JSON.stringify({ error: { message: "fake upstream error" } }), { status: 529 });
    const usage = opts.usage ? opts.usage(body, calls.length) : { input_tokens: 5000, cache_creation_input_tokens: 0, cache_read_input_tokens: 20000, output_tokens: 1200 };
    const toolName = body.tool_choice && body.tool_choice.name;
    let input;
    if (toolName === "submit_chapter") {
      input = opts.chapterInput ? opts.chapterInput(body) : { title: "第一章　夏天的尾巴", text: "你把書包丟在床上。\n\n窗外的蟬聲還沒停。".repeat(40) };
    } else {
      let payload = {};
      try { payload = JSON.parse(body.messages[0].content); } catch (e) {}
      const days = (payload.time_context && payload.time_context.round_days) || 1;
      input = Object.assign({
        action_result: "你照著剛剛的決定做了。", narrative: "隔天早上，你醒得比鬧鐘早。\n\n桌上的課本還攤著。",
        scene_day_offset: Math.min(1, days - 1), scene_summary: "早上，在房間", chapter_subtitle: "普通的一天",
        tone_switch: null, foreshadow_new: [], foreshadow_updates: [], turn_summary: "過了平凡的一天。",
        age_advance: 0, stat_deltas: { health: 0, network: 1, expression: 0 }, event_type: null, event_id: null,
        emotional_tone: "warm", expense_change: [], one_time_transaction: [], housing_choice: null,
        attachment_shift: { anxiety: 0, avoidance: 0 }, peer_position_shift: 0,
        conscientiousness_shift: { selfDiscipline: 0, prudence: 0, achievement: 0, responsibility: 0, teamSolo: 0 },
        interest_event: null, revealed_key_event: false, college_location_choice: null, fertility_stage_update: null,
        milestone_updates: [], new_characters: [], character_updates: [], major_event_summary: null, major_event_type: null,
        choices: ["去上學", "翹課去海邊", "在家讀書"], is_ending: !!payload.forceEnding, life_summary: null, succession_available: false
      }, opts.turnOverride ? opts.turnOverride(payload, body) : {});
    }
    return new Response(JSON.stringify({
      id: "msg_fake", type: "message", role: "assistant", model: body.model, stop_reason: "tool_use", usage,
      content: [{ type: "tool_use", id: "toolu_fake", name: toolName, input }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  fake.calls = calls;
  return fake;
}

let workerModPromise;
export async function loadWorker() {
  if (!workerModPromise) workerModPromise = import(path.join(ROOT, "worker/worker.js"));
  return (await workerModPromise).default;
}

// 讓Worker裡的global fetch打到假上游
export function installUpstream(fake) {
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.anthropic.com/")) return fake(url, init);
    throw new Error("測試環境不允許連外：" + url);
  };
}

export function makeEnv(extra) {
  return Object.assign({ SAVES: memoryKV(), ANTHROPIC_API_KEY: "test-key", USAGE_ADMIN_TOKEN: "admin-secret" }, extra || {});
}

// 直接打Worker（模擬繞過前端的請求）
export async function callWorker(env, { method = "POST", path: p = "/", body, origin = ORIGIN, headers = {}, ctx } = {}) {
  const worker = await loadWorker();
  const h = Object.assign({ "Content-Type": "application/json" }, headers);
  if (origin) h.Origin = origin;
  const req = new Request("https://life-game.smile80275.workers.dev" + p, { method, headers: h, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
  const waits = [];
  const res = await worker.fetch(req, env, ctx || { waitUntil: (pr) => waits.push(pr) });
  await Promise.all(waits);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

// 載入遊戲頁面。useMock=false時前端走真實路徑(callAI→Worker→假上游)
export async function loadGame({ useMock = true, env, key = "testkey123", slot = 0, dev = false, query = "" } = {}) {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", e => errors.push(e));
  vc.on("error", (...a) => errors.push(a.join(" ")));
  const worker = await loadWorker();
  const dom = new JSDOM(html, {
    url: "https://lifegamepage.smile80275.workers.dev/" + (query || (dev ? "?dev=1" : "")),
    runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) {
      win.localStorage.setItem("life_sim_recovery_key", key);
      win.localStorage.setItem("life_sim_active_slot", String(slot));
      if (!useMock) win.localStorage.setItem("lifegame_force_real_api", "yes");
      win.alert = () => {}; win.confirm = () => true;
      win.scrollTo = () => {};
      win.fetch = async (url, init = {}) => {
        // 每個請求給不同的IP，避免長程模擬撞到Worker每小時200次的IP頻率限制(那是真實環境的保險，不是這裡要測的)
        const h = Object.assign({}, init.headers || {}, { Origin: ORIGIN, "CF-Connecting-IP": "10.0." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250) });
        const req = new Request(String(url), { method: init.method || "GET", headers: h, body: init.body });
        const waits = [];
        const res = await worker.fetch(req, env, { waitUntil: (p) => waits.push(p) });
        await Promise.all(waits);
        const text = await res.text();
        return { ok: res.status >= 200 && res.status < 300, status: res.status, statusText: "", headers: { get: () => "application/json" }, text: async () => text, json: async () => JSON.parse(text) };
      };
    }
  });
  const win = dom.window;
  await new Promise(r => setTimeout(r, 30));
  return { dom, win, errors, ev: (code) => win.eval(code) };
}

export function clickModals(win, max = 12) {
  for (let i = 0; i < max; i++) {
    const bd = win.document.querySelector(".modal-backdrop");
    if (!bd) return;
    const btns = [...bd.querySelectorAll("button")].filter(b => {
      let el = b; while (el && el !== bd) { if (el.style && el.style.display === "none") return false; el = el.parentElement; } return true;
    });
    if (!btns.length) { bd.remove(); continue; }
    const b = btns[0];
    const before = bd.innerHTML;
    b.click();
    if (win.document.body.contains(bd) && bd.innerHTML === before) bd.remove();
  }
}

// 建立一條新人生並跑完開場回合
export async function startNewLife(g, { name = "林小晴", gender = "女" } = {}) {
  g.ev(`state = newRoll(null, {name:${JSON.stringify(name)}, gender:${JSON.stringify(gender)}}); state.spendingHabit="普通"; state.mealArrangement=state.mealArrangement||"家裡煮";`);
  await g.ev("startLife()");
  await waitIdle(g);
  clickModals(g.win);
}

export async function waitIdle(g, ms = 5) { await new Promise(r => setTimeout(r, ms)); }

export async function playTurn(g, text) {
  const t = text || g.ev("(state.choices&&state.choices[0])||'繼續過日子'");
  await g.ev(`takeTurn(${JSON.stringify(t)}, AP_COST_PER_TURN)`);
  clickModals(g.win);
}

export function makeAsserter(title) {
  const results = [];
  const check = (name, cond, detail) => { results.push({ name, ok: !!cond, detail }); };
  const report = () => {
    const pass = results.filter(r => r.ok).length;
    console.log(`\n=== ${title}：${pass}/${results.length} 通過 ===`);
    results.forEach(r => console.log(`${r.ok ? "通過" : "未通過"}｜${r.name}${!r.ok && r.detail !== undefined ? "｜" + JSON.stringify(r.detail).slice(0, 300) : ""}`));
    return results.every(r => r.ok);
  };
  return { check, report, results };
}
