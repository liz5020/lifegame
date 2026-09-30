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
// 一、1.2.14（2026-09-29）：Worker把名冊拆成快取的第一個content block，其餘payload是第二個；這裡還原成單一payload物件
export function turnPayloadFromBody(body) {
  const c = body && body.messages && body.messages[0] && body.messages[0].content;
  if (typeof c === "string") return JSON.parse(c);
  const blocks = Array.isArray(c) ? c : [];
  const payload = JSON.parse(blocks[blocks.length - 1].text);
  const roster = blocks.find(b => /^【名冊】/.test(b.text || ""));
  if (roster) payload.character_roster = roster.text.split("\n").slice(1).filter(Boolean);
  return payload;
}
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
    } else if (toolName === "submit_life_review") { // 十六、16.7.2回顧這一生(2026-09-28)
      let payload = {};
      try { payload = JSON.parse(body.messages[0].content); } catch (e) {}
      input = opts.reviewInput ? opts.reviewInput(payload, body) : {
        trajectory: (payload.stages || []).map(g => ({ stage: g.stage, text: g.stage_label + "的那幾年，你一直在路上。" })),
        tidbits: (payload.tidbits || []).map((t, i) => ({ i, text: "你一直不知道的事：" + t.category + "。" }))
      };
    } else if (toolName === "submit_idle_summary") { // 10.6.4放置摘要(2026-09-27)
      let payload = {};
      try { payload = JSON.parse(body.messages[0].content); } catch (e) {}
      const friend = (payload.idle_rounds || []).find(r => r.new_friend);
      input = opts.idleInput ? opts.idleInput(payload, body) : {
        retrospect: "你不在的這段時間，日子照樣過。",
        fragments: (payload.key_rounds || []).map(i => ({ i, text: "那天傍晚，你在公園坐了很久。" })),
        new_characters: friend ? [{ name: "陳郁婷", gender: "女", relation: "朋友", traits: "健談", origin: "放置期間的聚會", i: friend.i }] : []
      };
    } else {
      let payload = {};
      try { payload = turnPayloadFromBody(body); } catch (e) {}
      const days = (payload.time_context && payload.time_context.round_days) || 1;
      input = Object.assign({
        action_result: "你照著剛剛的決定做了。", narrative: "隔天早上，你醒得比鬧鐘早。\n\n桌上的課本還攤著。",
        scene_day_offset: Math.min(1, days - 1), scene_summary: "早上，在房間", chapter_subtitle: "普通的一天",
        tone_switch: null, turn_summary: "過了平凡的一天。",
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

// 讓Worker裡的global fetch打到假上游。resend：假的Resend(寄信)，沒傳就不允許寄信(會丟錯，Worker寄信函式會當成失敗)
export function installUpstream(fake, resend) {
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.anthropic.com/")) return fake(url, init);
    if (resend && String(url).startsWith("https://api.resend.com/")) return resend(url, init);
    throw new Error("測試環境不允許連外：" + url);
  };
}

// 2026-09-30（十、10.2第二批）：假的Resend。fake.sent＝寄出的信[{to,subject,text,from}]；fake.failNext(n)＝接下來n封寄失敗
export function makeFakeResend() {
  const sent = []; let failures = 0;
  const fake = async (url, init) => {
    const body = JSON.parse(init.body);
    if (!/^Bearer .+/.test((init.headers || {}).Authorization || "")) return new Response("{}", { status: 401 });
    if (failures > 0) { failures--; return new Response(JSON.stringify({ message: "fake resend error" }), { status: 500 }); }
    sent.push({ to: (body.to || [])[0], subject: body.subject, text: body.text, from: body.from });
    return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  };
  fake.sent = sent;
  fake.failNext = n => { failures = n; };
  fake.lastCode = (to) => { // 最近一封寄給to的驗證信裡的6位數驗證碼
    const m = sent.filter(x => x.to === to && /驗證碼/.test(x.subject)).pop();
    const mm = m && m.subject.match(/(\d{6})$/);
    return mm ? mm[1] : null;
  };
  fake.notices = () => sent.filter(x => !/^人生草稿 驗證碼/.test(x.subject));
  return fake;
}

// 假的Durable Object命名空間(記憶體)：get/put時複製一份，行為跟真的一樣不會共用物件參照；ns._store可直接看／改資料
export function makeFakeDO(Cls) {
  const store = new Map();
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const st = { storage: { get: async k => clone(store.get(k)), put: async (k, v) => { store.set(k, clone(v)); }, delete: async k => { store.delete(k); } } };
  const inst = new Cls(st);
  return { _store: store, idFromName: n => n, get: () => ({ fetch: (u, init) => inst.fetch(new Request(u, init)) }) };
}

// 帳號系統測試用的環境：帳號DO、用量計數DO、寄信金鑰、管理通知信地址；時間可用env.TEST_NOW_MS控制
export async function makeAccountEnv(extra) {
  const w = await import(path.join(ROOT, "worker/worker.js"));
  return makeEnv(Object.assign({
    ACCOUNTS: makeFakeDO(w.AccountStore), USAGE_COUNTER: makeFakeDO(w.UsageCounter),
    RESEND_API_KEY: "re_test_key", ADMIN_NOTIFY_EMAIL: "admin@example.com", TEST_NOW_MS: String(Date.parse("2026-09-30T03:00:00Z"))
  }, extra || {}));
}

export function makeEnv(extra) {
  // 十、10.8（2026-09-29）：既有測試驗證的是雲端打開時的行為，預設打開；測雲端暫停的測試傳{CLOUD_SAVE_ENABLED:"false"}
  return Object.assign({ SAVES: memoryKV(), ANTHROPIC_API_KEY: "test-key", USAGE_ADMIN_TOKEN: "admin-secret", CLOUD_SAVE_ENABLED: "true" }, extra || {});
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
export async function loadGame({ useMock = true, env, key = "testkey123", slot = 0, dev = false, query = "", cloud = true, storage = null, host = "lifegamepage.smile80275.workers.dev" } = {}) {
  // 二、2.7（2026-09-29）：index.html用<script src="lunar.min.js">載入農曆套件，jsdom不抓外部檔，這裡直接內嵌
  const lunarSrc = fs.readFileSync(path.join(ROOT, "lunar.min.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .replace('<script src="lunar.min.js"></script>', () => "<script>" + lunarSrc + "</script>");
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", e => errors.push(e));
  vc.on("error", (...a) => errors.push(a.join(" ")));
  const worker = await loadWorker();
  const dom = new JSDOM(html, {
    url: "https://" + host + "/" + (query || (dev ? "?dev=1" : "")),
    runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) {
      // storage：模擬「重新整理頁面」時帶入上一個頁面的localStorage；key為null＝全新瀏覽器(還沒有金鑰)
      if (storage) for (const [k, v] of Object.entries(storage)) win.localStorage.setItem(k, v);
      else if (key !== null) {
        win.localStorage.setItem("life_sim_recovery_key", key);
        win.localStorage.setItem("life_sim_active_slot", String(slot));
      }
      if (!useMock) win.localStorage.setItem("lifegame_force_real_api", "yes");
      win.localStorage.setItem("lifegame_cloud_save", cloud ? "on" : "off"); // 十、10.8：版本庫預設關閉，既有測試打開雲端
      win.alert = () => {}; win.confirm = () => true;
      // 十、10.7（2026-09-29）：雲端存檔用瀏覽器原生gzip，jsdom沒有，借Node內建的
      win.CompressionStream = globalThis.CompressionStream; win.DecompressionStream = globalThis.DecompressionStream;
      if (!win.TextEncoder) win.TextEncoder = globalThis.TextEncoder;
      if (!win.TextDecoder) win.TextDecoder = globalThis.TextDecoder;
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
