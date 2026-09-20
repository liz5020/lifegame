# 人生草稿——專案總覽

這是一款 AI 即時生成劇情的現代人生模擬文字遊戲。這份檔案是 Claude Code 每次啟動時會自動讀到的專案背景，不用每次重講。

## 檔案結構

- `index.html`：遊戲本體，單一 HTML 檔（前端 + 呼叫 AI 的邏輯），部署到 Cloudflare Pages
- `docs/life-sim-full-design-doc.md`：**唯一的設計正本**。所有規則以這份文件裡的【定案】標記為準；文件最上方有更新日誌，改動時務必同步更新日誌與【定案】標記，若新規則推翻舊規則要明講取代關係
- `qa-reports/`：QA 測試報告存放處，檔名格式 `QA-XXXX_主題_日期.md`

## 與 claude.ai Project 的交接流程（這段文字跟 claude.ai Project 知識庫裡的流程說明是同一份，兩邊要一起改，不要只改一邊）

這個專案的規則發想/定案發生在 claude.ai 的一個 Project 裡（不動程式碼），實作與測試在這裡（Claude Code）進行，兩邊透過檔案交接：

- claude.ai 那邊討論出東西後，使用者會先在對話裡看過文字版（review用），確認後才會存進一份 `docs/handoff-queue.md`
- `handoff-queue.md` 只裝「還沒做」的項目；`dev` 子代理處理完一項，就要把該項目從這份檔案移除（不是留著打勾，是真的刪掉），保持這份檔案永遠是「待辦清單」而不是「歷史紀錄」
- 使用者測試完（不管是 Claude Code 這邊測，還是回 claude.ai 那邊討論），有新的 bug 或決定，會重複上述流程
- **安全規則**：不能自己決定把 `USE_MOCK` 關掉去真的呼叫 Anthropic API 測試——每一次要用真AI測試，都必須重新徵求使用者同意，不能沿用之前批准過一次就當作永久授權，直到使用者明確說已經進入正式測試階段為止

## 工作流程

1. 設計討論與規則拍板永遠先發生在 `docs/life-sim-full-design-doc.md`，不要讓程式碼裡出現文件沒寫的規則
2. 實作前先讀最新版設計文件，找出【定案】但 `index.html` 裡還沒做的部分（也要檢查 `docs/handoff-queue.md` 有沒有待處理項目）
3. 改完 `index.html` 後跑一次語法檢查（`node --check`，先用 python 抽出 `<script>` 內容）
4. 大改動（尤其是遊戲狀態結構有變動）要在回覆裡明講「這次會讓舊存檔跑不動，需要清空重來」

## 已知的架構決定（避免重新踩坑）

- 財富已改為真實台幣金額制（`savings`/`monthlyIncome`/`monthlyExpenses`），不是 0-100 分數
- 15-29 歲的時間推進由前端結構化算好（`timeState`），AI 的 `age_advance` 在這個區間一律視為 0；30 歲以後才由 AI 自行判斷 `age_advance`
- 依附風格是「焦慮軸/迴避軸」兩軸連續模型，不是固定標籤
- 意外死亡機制有雙重防呆：19 歲以下不接受、沒有前兆（`deathForeshadowed`）不接受，寫在 `applyResult()` 裡，不能只依賴 system prompt
- 審慎、成就傾向兩條做事態度光譜，目前是「算好倍率/修正值丟給AI參考」的架構，不是本地擲骰；責任感、團隊vs單打獨鬥則是寫死在 `applyResult()` 的本地公式
- `USE_MOCK` 開關控制要不要真的呼叫 AI（`false` 時呼叫 `WORKER_URL`，一個 Cloudflare Worker 中繼站，金鑰不在前端）

## 兩個子代理

- `dev`：負責讀設計文件、實作/修改 `index.html`
- `qa`：負責測試、寫測試報告到 `qa-reports/`，區分「程式碼bug」「設計係數問題」「prompt缺漏」三種性質

一般工作流程：`dev` 做完一批功能 → 呼叫 `qa` 驗證 → `qa` 產出報告 → 回頭給 `dev` 看報告決定下一步。兩邊共用同一個 git 歷史，不會有對話串之間的時間差問題。
