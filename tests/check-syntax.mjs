// 抽出index.html的<script>內容，用node --check做語法檢查（CLAUDE.md標準流程第6步）
import fs from "fs"; import { execFileSync } from "child_process"; import { ROOT } from "./harness.mjs";
const html = fs.readFileSync(ROOT + "/index.html", "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
fs.writeFileSync("/tmp/lifegame-index-script.js", m[1]);
execFileSync("node", ["--check", "/tmp/lifegame-index-script.js"]);
for (const f of ["worker/worker.js", "worker/prompt.js"]) execFileSync("node", ["--check", ROOT + "/" + f]);
console.log("語法檢查：通過（index.html <script>、worker/worker.js、worker/prompt.js）");
