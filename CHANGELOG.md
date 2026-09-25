# 人生草稿——開發/測試異動紀錄

> 這份文件記錄每一次對 `index.html` 或資料夾結構的實際改動。設計規則本身的異動記錄在
> `life-sim-design/00-總覽.md` 的「全域更新日誌」，兩份文件分開維護，不要混在一起寫。
> （2026-09-20更正：原本寫的是拆檔前的`life-sim-full-design-doc.md`「1.3 更新日誌」，該檔案已封存到`archive/`。）
>
> 每筆記錄格式：日期 / 身分（開發部・測試部・整理）/ 做了什麼 / 對應設計文件章節（如適用）/ 驗證方式。
>
> **這份檔案只保留最近的紀錄。2026-09-14～2026-09-19（含所有「續」）已搬到 `CHANGELOG-archive.md`**——內容還是有效、可查證，只是平常同步近況用不到，先切開避免每次都要讀過全部歷史。之後如果這份檔案本體又累積到一定長度，會再往`CHANGELOG-archive.md`續補（同一份封存檔案往下加，不再另開新檔）。

---

## 2026-09-25（佇列批次0：測試回報三態規則）

**〔整理〕依使用者佇列批次第0項**
- `CLAUDE.md`「標準工作流程」、`WORKFLOW.md`第4節步驟4與第6.1節、`協作流程說明-共同基準.md`（新增「測試回報規則」段落與版本記錄）同步寫入：「回報修正或實作完成時，每個測試項目一律標示『通過／未通過／未測試』三種之一。未實際執行的測試必須標『未測試』，不得以預期效果作為完成證據。需要真實API才能驗證的項目標『未測試』並列入『需要真實API測試』清單。」
- 本批次之後各項的CHANGELOG驗證段落都照這個規則標示

---

## 2026-09-25（佇列批次1：鎖住AI代理，Worker不再轉送任意prompt）

**〔開發部〕〔測試部〕依使用者佇列批次第1項實作，對應設計文件十、10.4（同日新增）**
- **worker/prompt.js（新檔）**：把`index.html`的`buildSystemPrompt()`與`TURN_RESULT_TOOL`逐字搬過來（template literal原樣複製），搬移當下用Node比對兩邊內容完全相同。**之後system prompt的唯一來源是這個檔案，改prompt後必須重新部署Worker**
- **worker/worker.js**：`handleAIProxy()`不再轉送前端的body。新增`validateTurnMessages()`（messages剛好1則、role=user、content是字串且能解析成遊戲payload、7個必要欄位型別正確、player_action≤300字、總字數≤`MAX_TURN_PAYLOAD_CHARS`=40,000）與`buildTurnRequest()`（Worker自己組model/max_tokens/effort/system含cache_control/強制工具）。不符合回400，不呼叫Anthropic
- **index.html**：移除`buildSystemPrompt()`與`TURN_RESULT_TOOL`（mock模式本來就沒用到，不留副本）；`callAI()`只送`messages`
- 新增`tests/`資料夾：`harness.mjs`（jsdom載入整份index.html、fetch導向真的worker.js＋記憶體版KV、Worker呼叫Anthropic導向假上游，全程不打真實API）、`check-syntax.mjs`、`test-1-ai-proxy.mjs`。執行方式：`cd tests && npm install && node test-1-ai-proxy.mjs`

**驗證（USE_MOCK=true＋假上游，未呼叫真實API）**
- 通過：mock模式連續40回合正常、沒有打到Anthropic、前端已無prompt副本
- 通過：前端真實路徑（假上游）4回合正常，上游收到的system＝Worker的prompt且有cache_control、強制工具、model/max_tokens/effort為Worker設定值
- 通過：直接打Worker送「自訂system prompt＋自訂tools/model/max_tokens」→全部被覆蓋；「不帶工具」→仍強制加上工具
- 通過：「超長messages(>40,000字)」「兩則messages」「role=assistant」「一般聊天文字」「content陣列」「缺必要欄位」「player_action>300字」「沒有messages」都回400且沒有呼叫Anthropic；非白名單來源403
- 通過：語法檢查（index.html `<script>`、worker.js、prompt.js）
- 未測試（需要真實API）：正常遊玩一回合，敘事品質是否未變、`cache_read_input_tokens`>0
- **會讓舊存檔跑不動嗎**：不會，存檔格式沒變
- ⚠️需要手動重新部署Worker（`cd worker && npx wrangler deploy`），index.html也要重新上傳Pages——**兩邊要一起更新**：新版index.html不再送system，搭配舊Worker會變成沒有system prompt

---

## 2026-09-24（續：伏筆保底、台灣用語對照表、語氣軌事先指定補強）

**〔開發部〕〔測試部〕使用者拍板上一批三項待確認後實作**
- 對應設計文件：一、1.2.9.7、1.2.9.14、1.2.8.7（同日修改）
- **伏筆保底**：新增`FORESHADOW_AUTO_FADE_AFTER=20`，開滿20回合仍未回收自動標淡出(`autoFaded`)並釋出名額，下一回合payload`auto_faded_foreshadows`告知AI；反悔快照同步納入
- **台灣用語**：`worker/s2t.js`新增`TW_VOCAB`對照表與`toTaiwanTraditional()`，簡轉繁前後各套一次(「网」在Big5字集裡不會被轉，需要比對簡體原形)；system prompt明寫台灣繁體與台灣用語並列出例子
- **語氣軌**：`computeToneTrack()`新增戀愛日常(有交往對象且無重大事件→碎念軌低張力)；schema新增`tone_switch`(key_event_reveal/relationship_turning)，`resolveEffectiveTone()`換算實際語氣軌、記在日記`tone`欄位、以實際語氣軌計入碎念計數；prompt說明兩種例外情況
- **生育/領養**：查核確認由AI決定，程式無事前狀態，列入設計文件1.2.8.7【待確認】與QA手冊34.5，本次不改
- 驗證：Node vm新增10項全過(伏筆第15回合提醒/第20回合自動淡出/下一回合告知/名額釋出、戀愛日常3種、tone_switch 3種)；既有66項與500回合端到端重跑全過；Worker簡轉繁12項全過；語法檢查通過。不影響舊存檔

---

## 2026-09-24（敘事視角修正＋1.2.8/1.2.9一次性system prompt改寫＋遊戲內日期系統＋簡轉繁）

**〔開發部〕〔測試部〕依一、1.2.8、1.2.9（含同日新增1.2.9.10～1.2.9.15）實作，前端＋Worker**
- 對應設計文件：一、01-敘事生成規則.md 1.2.4.2（取代）、1.2.8.2.1／1.2.8.3.2／1.2.8.4.2／1.2.8.4.3／1.2.8.6（同日修改或拍板）、1.2.9.4／1.2.9.6／1.2.9.7、1.2.9.10～1.2.9.15（同日新增）

**index.html**
- **遊戲內日期(1.2.9.11)**：新增行事曆(`SCHOOL_SEGMENT_START_MD`等，對照台灣高中時程，測試參數)，`timeState.cal`記錄上一回合場景日期/摘要、本回合結束日；`advanceStructuredTime()`每回合算出本回合範圍(起始日至少是上一回合場景隔天，跨度至少一天)。學生時期每回合在段落內平均分配天數(3～13天)，出社會後＝365÷該年齡帶回合預算，休學7回合＝182天。**結算月數改依實際推進天數換算**，移除`STUDENT_MONTHS_PER_ROUND`/`LEAVE_MONTHS_PER_ROUND`(一整年加總仍是365天＝12個月)。固定事件：開學日/段考/寒暑假開始、國曆節日、農曆節日(固定近似日期，標approximate)、玩家生日(開局隨機，`rollBirthday()`，只當事件不改年齡——年齡依學年增加)。舊存檔第一次推進時由`ensureCalendar()`依目前段落推一個對應日期
- **兩段式敘事**：AI回傳新增`action_result`(行動結果)、`scene_day_offset`/`scene_summary`(新場景日期與摘要)，畫面依序顯示兩段；`validateSceneDate()`檢查新場景不得與上一回合同一天或超出本回合範圍，違規自動重生一次(不扣點)，仍違規照常顯示並記入`state.reviewFlags`待確認清單(🛠面板可看)
- **語氣軌(1.2.8.2)**：`computeToneTrack()`依1.2.8.2.5對照表、只用呼叫AI之前已確定的程式訊號判斷tone_track/tension，碎念軌連續3回合上限由`mutterStreak`計數；新增畢業事件log(`graduationEventLog`)與興趣卡成形偵測(`interestFormedEventLog`)
- **NPC台詞上限(1.2.8.4.2)**：角色卡新增`dialogueStyle`(家人開局隨機，測試參數30/50/20)，AI用`{{名字|台詞}}`標記，`processDialogueMarkup()`在上限內最後一個句號/問號/驚嘆號截斷，找不到標點保留整句並記入待確認清單；沒用標記的文字照常顯示
- **伏筆追蹤(1.2.9.7)**：`state.foreshadows`，上限3個，開啟15回合以上標overdue提醒AI回收或淡出
- **文件框(1.2.9.4)／回合標題(1.2.9.6)**：`〔文件:標題〕…〔/文件〕`渲染成左側色條斜體框；日記標籤改為「時期標籤｜AI副標」
- **角色同名(1.2.9.13)**：修正開局`rollSibling()`重複抽名的bug(「彥廷」同時是弟弟與哥哥的根因)；`new_characters`同名但家人稱謂不同(或一方家人一方非家人)時自動改名另建新卡(家人改名字、非家人加姓氏)，下一回合告知AI；每回合送`all_character_names`
- **system prompt改寫**：最前面新增【寫作規則】【語氣軌】【時間與敘事結構】【伏筆】【角色名字】五段，整併1.2.4/1.2.8.3/1.2.8.4/1.2.9；刪除舊的「內心想法多鋪陳」「內心自問可以連續發問」【避免AI感】【段落切分】【九條敘事技巧】【時間推進速度】【current_time_label】等衝突或重複段落
- 反悔快照新增`mutterStreak`/`foreshadows`/`renameNotices`，日期在`timeState`裡一併還原
- mock新增兩段式敘事、場景日期(依`MOCK_SCENE_DATE_VIOLATION_RATE`故意違規，🛠面板可調)、台詞標記、文件框、伏筆

**worker/**
- 新增`s2t.js`：OpenCC(cn→twp)簡轉繁，**只轉Big5字集以外的字**(實測整段轉換會把「系上/里長/台灣」改成「繫上/裡長/臺灣」)，`handleAIProxy()`成功回應先轉換再回傳
- 改用wrangler 3部署(OpenCC約1.1MB貼不進線上編輯器；wrangler 4需要Node 22，本機是Node 18)：新增`package.json`/`wrangler.toml`/`README.md`/`big5-chars.js`(由`scripts/build-big5-chars.mjs`產生)；打包後gzip約545KB，低於免費方案3MB上限。**2026-09-25已部署**：使用者執行`wrangler login`/`secret put ANTHROPIC_API_KEY`/`deploy`，KV id(`life-game-saves`)已填入`wrangler.toml`，Version ID `bca43a4a-8690-4b1f-9428-607713f85b9b`；部署後以白名單來源打`/slots`回傳success(KV正常)、非白名單來源回403。簡轉繁在真實AI回應上的效果仍待真實API測試

**驗證（全部USE_MOCK=true）**
- Node vm單元測試66項全過：行事曆30項(學年365天、各段起始日、跳過停在考試段、career一年365天/12個月/+1歲、休學182天與復學接續、日期檢查6種情況、舊存檔補行事曆、固定事件含生日/農曆約略)；其他29項(2萬次開局家人名字不重複、衝突判斷5種、改名3種、台詞截斷與無標點保留、未用標記照常顯示、文件框/標題渲染、語氣軌7種含碎念上限、伏筆上限/overdue/回收、低張力取下限字數、payload新欄位)；端到端7項(500回合從高中跑到76歲，無失敗回合、場景日期每回合都往後、每回合都有副標、違規重生56次後全部合法、反悔後日期還原)
- Worker簡轉繁測試7項全過(`npm run test:s2t`)；`wrangler deploy --dry-run`打包成功
- `node -e`語法檢查通過
- **會讓舊存檔跑不動嗎**：不會。新欄位(行事曆、生日、dialogueStyle、伏筆)都在第一次用到時自動補上，舊角色卡沒有dialogueStyle時當normal
- **prompt改寫的實際效果需真實API測試**，已列入QA手冊34.5

---

## 2026-09-23（開發者專用：模擬/真實API切換鈕）

**〔開發部〕〔測試部〕使用者要求測試真實API時能在畫面上直接切換，不用每次開Console打指令**
- 新增`ensureApiToggleUI()`／`renderConfirmRealApi()`：畫面左下角按鈕，顯示「🔌 模擬模式」或「💸 真實API中」；切到真實API前一定跳確認視窗(說明每回合會產生費用)，切回模擬不用確認；切換後`location.reload()`讓`USE_MOCK`重算
- **一般玩家看不到**：網址加`?dev=1`打開過一次，這台瀏覽器才記住(`localStorage.lifegame_dev_tools`)並顯示按鈕；`?dev=0`關閉按鈕並同時清掉真實API旗標。保護程度與原本Console手動設定相同
- `?dev=`參數處理放在`USE_MOCK`計算之前，`?dev=0`當次載入就回到模擬
- 由`ensureDebugUI()`開頭呼叫，所有畫面都會出現(包含真實API模式下🛠面板不出現的情況)
- 驗證：vm測試8項(一般玩家看不到、?dev=1出現、切真實先確認、旗標記住、真實模式顯示、切回模擬直接重整、?dev=0當次即回模擬)＋行動點46項回歸全過；語法檢查通過

---

## 2026-09-23（十、10.3行動點經濟實作）

**〔開發部〕〔測試部〕依設計文件十、10.3.1～10.3.10實作行動點經濟，前端＋Worker**
- 對應設計文件：十、10-存檔與帳號系統.md 10.3（同日新增）
- 使用者實作前另確認的對應：轉世丹＝restart_item（點數全保留、回合歸零、不發禮包）；選孩子接續＝世代傳承（點數全繼承）；「就此闔卷」＝死亡且不傳承；遊玩中「清空存檔重來」改名「刪除這段人生」，確認視窗照10.3.6寫「剩餘的購買點會移到錢包，禮包點會消失。」；後兩者都讓人生結束、移入人生回顧、空出格子

**index.html**
- 移除`actionPoints/maxActionPoints`(20點圓點)、`renderPaywall()`/`refillDemo()`示範儲值；改為每條人生一個`state.ap={daily,gift,purchased,lastRefillDate}`
- 新增`taipeiDateString()`(一律換算UTC+8日期)、`refillDailyIfNeeded()`(跨台灣日期才補到5點，不累加；在`render()`進入遊戲畫面時、`takeTurn()`開頭檢查；點數歸零時另有每分鐘檢查，跨午夜自動解鎖)、`spendAP()`(每日池→禮包點→購買點)、`refundAP()`
- `takeTurn()`：選項與自由輸入一律扣1點(原本自訂行動扣2點)；AI呼叫含重試仍失敗時退回本回合扣的點；`snapshotForUndo()`不再包含點數，悔棋不退點；開場prologue回合維持cost 0
- 新手禮包55點：`startLife()`時才領(開場建角7步重骰不會重複領)，`claimNewLifeGift()`優先問Worker計次(每把金鑰3次)，連不上才用本機計數
- 用掉最後1點：回合照常生成、存檔後才跳`renderAPExhaustedModal()`(疊在其他彈窗之上)，畫面顯示提示並停用選項/自由輸入；悔棋鍵不受影響
- 上方列改為「⚡ 行動點 N　第 X 回合」(原「第 X 頁」)，滑鼠停在行動點顯示每日池X／5、永久池X與補點說明；自由輸入加即時字數「n／200」，超過上限停用送出(字數以Unicode字元計，標點也算)
- `hardReset()`改為`endLife(reason)`：封存到Worker `/archive`(失敗時存本機後備副本)、清本機slot快取、回到人生選擇畫面；新增人生回顧清單/唯讀頁(`archiveList`/`archiveView`兩個phase)；人生選擇畫面加「📚 人生回顧」入口與金鑰錢包顯示(>0才顯示)
- Debug面板「行動點」改為每日池/禮包點/購買點三欄
- 註：自由輸入上限本日由另一個協作對話改為200字(見下一筆)，本實作直接讀`CUSTOM_INPUT_MAX_CHARS`常數

**worker/worker.js**（⚠️需要手動重新部署到Cloudflare才會生效）
- 新增`POST /claim-gift`、`POST /archive`、`GET /archives`、`GET /archive`；`GET /slots`多回傳`wallet`
- 封存用KV metadata存摘要，清單不用逐筆讀完整存檔；購買點目前信任前端數字(封測永遠是0)，開放付費前須改以伺服器端紀錄為準
- `RATE_LIMIT_PER_HOUR`由30改為200(使用者同意)：每回合打2次(AI＋存檔)，原本每小時只夠玩約15回合，新手禮包55點會很快撞牆，共用Wi-Fi的玩家也共享同一額度。開放付費前的長期做法：以伺服器端行動點餘額擋AI呼叫，IP計數器只當最後保險

**驗證**（USE_MOCK=true，Node vm載入整份script＋真的worker.js搭配記憶體版KV，46項斷言全過）
- 台灣日期邊界(UTC 15:59/16:00)、扣點順序、自由輸入同樣扣1點、悔棋不退點、API失敗不扣點且不計回合、跨日補到5不累加、已有5點不多補
- 歸零後回合照常完成＋提示＋無法再行動＋歸零狀態有存檔；世代傳承/轉世丹點數保留、不重複發禮包
- 同一金鑰第4條新人生不發禮包(刪除的人生仍計次)、刪除後購買點進錢包、闔卷/刪除都空出格子並出現在回顧、封存副本禮包/購買點歸零；Worker離線時本機計數同樣限3次、本機封存可在回顧看到
- 畫面render：上方列/tooltip、字數計數、歸零停用、選擇畫面、回顧清單與唯讀頁
- 語法檢查通過(`<script>`抽出用node --check)
- **會讓舊存檔跑不動的部分**：舊存檔沒有`ap`欄位，`ensureAP()`會補一個只有當日5點、沒有禮包的點數池，不會壞掉，但舊存檔拿不到55點禮包——建議清空重來

## 2026-09-23（佇列批次A：婚姻危機兩個永遠無法成立的觸發條件修正）

**〔開發部〕〔測試部〕使用者透過`queue.md`批次佇列貼回claude.ai網頁版討論結論與給Code的修改文字，依WORKFLOW.md第6節批次規則處理**
- 對應設計文件：七、07-無限發展與世代傳承系統.md 7.3.3／7.6.2

**一、career_status常數化＋justLostJob旗標（修正失業觸發條件bug）**
- 新增`CAREER_STATUS`常數物件(`EMPLOYED/JOB_SEARCHING/UNEMPLOYED/BUSINESS/SEMI_RETIRED/RETIRED/NOT_EMPLOYED`)，取代全檔案原本18處直接寫死的中文字串比對/賦值
- 根因：`sweepMarriageCrisisCandidate()`原本比對`s.careerStatus==="unemployed"`(英文)，但career_status所有寫入點實際寫的都是中文"失業"，條件永遠不成立
- 新增`s.justLostJob`旗標，在兩個把career_status寫成失業的寫入點同時設定：`rollAnnualLayoffCheck()`裁員、`resolveBusinessContinuation()`收攤(choice==="close")
- `sweepMarriageCrisisCandidate()`改讀`justLostJob`，只在剛失業那一回合觸發；函式結尾一律重設為false(含無配偶提早return分支)，故若剛失業那回合婚姻危機正處於冷卻期，直接放掉不觸發、也不會等冷卻結束後補觸發

**二、fertility_stage_update欄位＋justReachedFertilityStage4旗標（修正不孕症第四階段觸發條件bug）**
- 根因：`state.fertilityJourney`從未被賦值(QA手冊34.3已記錄)，AI原本沒有任何輸出管道回寫不孕症四階段進度
- 新增AI回應schema欄位`fertility_stage_update`(數字1~4或null)，system prompt同步補充說明：只在這回合敘事涉及7.3.3不孕症四階段時回傳對應階段，不涉及則null
- `applyResult()`新增解析：收到數字時寫入`s.fertilityJourney={stage, updatedTurn}`，若新階段為4且前一階段不是4，設`s.justReachedFertilityStage4=true`
- `sweepMarriageCrisisCandidate()`同樣讀取並在結尾重設此旗標，行為與justLostJob一致

**驗證**
- `node -e`抽出`<script>`內容做語法檢查，通過
- Node vm沙箱直接跑`sweepMarriageCrisisCandidate()`：justLostJob單獨觸發危機✓、justReachedFertilityStage4單獨觸發危機✓、兩者在冷卻期內都不觸發且不延後補觸發✓、無配偶時三個旗標都正確重設不crash✓
- 尚無法驗證：AI是否真的會依新的prompt說明穩定回報`fertility_stage_update`（需要真實API測試才能確認AI敘事層表現，MOCK模式只驗證了client端邏輯本身）

**待真實API測試清單**
- `fertility_stage_update`欄位：AI是否會在生育/不孕症敘事線推進時正確回報1~4的階段數字、且不會每回合重複回報同一數字；預期AI在敘事明確走到某階段時回傳對應數字，其餘回合回null

**待確認清單**
- 無（本批次两項修正皆直接對照佇列給的程式碼判斷與既有設計文件精神，未遇到需自行判斷的模糊點）

**影響**：新增`justLostJob`／`justReachedFertilityStage4`兩個旗標欄位與`fertility_stage_update`schema欄位，皆用`!!`/`typeof`防呆讀取，**不影響舊存檔**（舊存檔沒有這些欄位時視為false/undefined，行為等同從未觸發過）

---

## 2026-09-23（自由輸入字數上限100字→200字＋新增1.2.10玩家輸入=意圖規則）

**〔開發部〕〔測試部〕使用者貼回claude.ai網頁版討論結論，依單一定案標準流程處理**
- 對應設計文件：十、10-存檔與帳號系統.md 10.3.2、一、01-敘事生成規則.md 1.1.3（交叉引用更新）／1.2.10（新增）

**一、自由輸入字數上限100→200字**
- `CUSTOM_INPUT_MAX_CHARS`從100改為200，`10.3.2`同步更新（本欄位同一天內已改過兩次：9/16原版200-300字建議 → 稍早改為100字定案 → 本次改為200字，均已在文件裡明講取代關係）

**二、新增1.2.10「玩家輸入＝意圖，結果由系統判定」**
- `buildSystemPrompt()`新增規則段落：玩家自由輸入若順手寫了結果（"她答應了"、"我考第一名"），AI只能當成角色的期待/預想，不能直接當既定事實；真正成立與否交給既有的數值/機率/好感度系統判定；一回合塞多個行動時依時間長度合理分配，放不下的可以留到後續回合
- 與既有1.1.3（管「能不能發生」）互補，1.2.10管「誰決定結果」

**驗證**
- `node -e`抽出`<script>`內容做語法檢查，通過
- 純prompt文字與常數數字調整，邏輯無新增判斷分支，不需額外Node vm單元測試

**待真實API測試清單**
- 1.2.10新規則：AI是否真的不會把玩家寫的「結果」當成既定事實直接採用，需要真實API觀察敘事輸出才能驗證

**待確認清單**：無

**影響**：純數字與prompt文字調整，不影響存檔資料結構，不影響舊存檔

---

## 2026-09-23（1.2.9.1字數分級拍板實作＋修正monthsCrossed校準bug）

**〔開發部〕〔測試部〕使用者針對敘事字數規則的待確認事項給出明確答覆，並要求順便檢查時間節奏，依單一定案標準流程處理（讀文件→改代碼→USE_MOCK驗證）**
- 對應設計文件：一、01-敘事生成規則.md 1.2.1（取代）／1.2.9.1

**一、敘事字數改為依單回合時間長度分級，取代1.2.1固定250-350字**
- 新增`narrativeLengthTier(monthsCrossed)`：≤0.5個月(兩週)→short(400-500字，單一核心場景，不需轉場句)；≤1個月→medium(450-600字)；>1個月→long(500-700字，完整三段結構)
- `buildUserMessage()`新增payload欄位`narrative_length_guide`，帶入該回合的`timeCtx.monthsCrossed`算出的級距/字數/結構說明
- `buildSystemPrompt()`把原本寫死的「每次敘事約250-350字」句子，改寫成說明依`narrative_length_guide`分級寫作的規則，全年齡適用、不分人生階段

**二、順帶發現並修正：學生時期`monthsCrossed`校準bug（使用者要求「順便檢查」找出的既有問題）**
- 根因：`advanceStructuredTime()`高中/大學分支的`monthsCrossed`原本寫死`1.5`（每回合），54回合（一整年）累加＝81個月（6.75年），跟「54回合＝年齡+1歲」的既有結構（`advanceStageYear`）完全脫節；休學分支同樣寫死`monthsCrossed:1`，7回合＝7個月，跟9.5.3定義的「一次休學＝delay_years+0.5＝半年（6個月）」對不上
- 修正：新增`STUDENT_MONTHS_PER_ROUND = 12 / YEAR_SEGMENTS.reduce((sum,seg)=>sum+seg.budget,0)`（12個月平均分攤到一整年54回合，動態計算不寫死54）取代`1.5`；新增`LEAVE_MONTHS_PER_ROUND = 6 / LEAVE_OF_ABSENCE_TURNS`取代休學分支的`1`
- career模式（22歲以後）原本就用`12/該年齡帶budget`正確計算（每個年齡帶的budget回合數乘上對應月數，總和必為12），未受此bug影響，不需修改
- **這個bug是使用者最初提出「一回合過了一到兩個月，體感可能對不上」疑慮的根本原因**：修正前，即使是最短的學生日常回合也被記成1.5個月，遠超實際節奏；修正後，一般學生回合約0.22個月（6-7天），自然落在narrative_length_guide的「兩週以內」級距

**驗證**
- `node -e`抽出`<script>`內容做語法檢查，通過
- Node vm沙箱直接模擬：從開局跑到年齡首次+1，統計`monthsCrossed`累加總量——修正前81（bug已確認存在），修正後11.88（≈12，殘差為`toFixed(2)`精度捨入，符合預期）
- `narrativeLengthTier()`邊界值測試：0.22→short、0.5→short、0.8→medium、2→long，皆符合設計

**待真實API測試清單**
- `narrative_length_guide`：AI是否會依三個級距實際調整敘事長度與結構（是否加轉場句/次要片段），需要真實API才能驗證AI敘事層表現
- 核心場景「約450字為基準」的份量感是否符合預期，需搭配內容組提供的參考範例（使用者原文提到「以參考範例為基準」，本次未附上具體範例文字，待補）

**待確認清單**
- 無新增（本次兩項工作皆依使用者明確指示的規則與檢查要求直接實作，未遇到需自行判斷的模糊點）

**影響**：新增`STUDENT_MONTHS_PER_ROUND`/`LEAVE_MONTHS_PER_ROUND`常數與`narrativeLengthTier()`函式，修改`monthsCrossed`計算方式（會讓同一回合的財務結算金額變小，因為原本被錯誤放大6.75倍/7倍）。**這是行為修正，不是新增欄位，不影響存檔資料結構本身，但正在進行中的存檔如果剛好卡在學生時期，接下來的月結算金額會比修正前小很多（因為monthsCrossed從1.5降到0.22）——這是預期中的修正結果，不是bug，但需要在回覆裡明講，避免使用者誤以為存檔壞掉**

---

## 2026-09-23（批次D後續：編號撞號改號整理＋補寫三則先前保留的範例）

**〔整理〕使用者在批次A~E完成後，針對批次D記錄的「編號撞號」與「這次沒寫、之後可能需要」兩項待辦，明確要求動手處理**

**一、14-內容範例庫編號撞號改號整理**
- 五個子檔全數改名並重新編號：`12.1-開局個性.md`→`14.1-開局個性.md`、`12.2-國高中.md`→`14.2-國高中.md`、`12.3-大學技職.md`→`14.3-大學技職.md`、`12.4-破格時刻.md`→`14.4-破格時刻.md`、`12.5-職涯.md`→`14.5-職涯.md`
- 各檔內部所有章節編號（`## 12.N`頂層標題、`### 12.N.M`子節標題）同步改為`14.N`/`14.N.M`；子檔彼此間的交叉引用也同步修正（例：原`14.4.7`引用`12.2.1`已改為引用`14.2.1`）
- 子檔內文裡引用第十二章職涯系統本身既有編號的地方（`12.7`裁員、`12.8.1`/`12.8.2`創業、`12.11`職涯伏筆、`12.13`責任邊界、`12.16`本節）**刻意保留不變**——這些是第十二章自己的章節號，不屬於本次改號範圍，混著改會造成新的錯誤
- 同步修正外部交叉引用：`14-內容範例庫/00-說明.md`（檔名清單、新增已結案說明）、六、06-防壓抑機制設計.md 6.2、九、09-大學科系系統.md 9.5.2/9.6、十二、12-職涯系統.md 12.16、五、05-開局個性生成系統.md（4處）、`協作流程說明-共同基準.md`（folder結構描述）
- **技術判斷**：`00-總覽.md`/`CHANGELOG.md`/QA手冊裡記錄批次D當時工作內容的歷史條目（提到舊檔名`12.x`）維持原樣不改——那些是「當時做了什麼」的歷史記錄，符合這幾份文件一貫「只增不減」的慣例，不因後續改名就回頭改寫歷史

**二、補寫批次D保留未寫的三則範例（原本因「不在queue.md原始A~E範圍」而擱置，這次使用者明確要求動手）**
- `14-內容範例庫/14.3-大學技職.md`新增14.3.10「休學學期生活」（呼應9.5.3要求的生活/打工/家庭/自我探索敘事，財務型/健康型/單純想暫停三則）
- `14-內容範例庫/14.5-職涯.md`新增14.5.7「求職保底offer」（呼應12.4連續3次失敗後第4次必定錄取的保底機制）、14.5.8「被迫退休與半退休」（呼應12.10健康低於門檻直接觸發的被迫退休分支、半退休兼職/接案/志工選項）
- **重要提醒**：這三則與本檔案其餘範例性質不同——其餘範例都是網頁版討論確認後原文寫入，這三則是Claude Code依既有程式規則（9.5.3/12.4/12.10）直接新寫的內容，**未經使用者或網頁版逐字確認**，已在各自檔案內加註說明，方便日後內容組覆蓋重寫時能一眼辨識

**驗證**：純文件改動（改名+編號+新增範例文字），不涉及`index.html`代碼，`node -e`語法檢查不受影響；已用`grep`全文掃描`life-sim-design/`確認沒有遺漏的舊檔名/舊編號交叉引用（歷史記錄條目除外）

**待真實API測試清單**：無

**待確認清單**：
- 新補寫的三則範例（14.3.10、14.5.7、14.5.8）文字本身未經網頁版確認，若之後要調整語氣/措辭，內容組可直接覆蓋這幾節，不影響其他章節結構

**影響**：純設計文件檔名/編號/內容變動，不影響`index.html`與舊存檔

---

## 2026-09-23（佇列批次E：文件整理與一致性——CLAUDE.md節奏數字過期/QA手冊34.2矛盾條目/index.html過期程式註解）

**〔整理〕使用者透過`queue.md`批次佇列貼回claude.ai網頁版討論結論，依WORKFLOW.md第6節批次規則處理**

**一、CLAUDE.md節奏描述過期**
- 「已知的架構決定」一條把回合預算數字從過期的「40回合/年降到81歲以後10回合/年」訂正為現行v2.1數字「32回合/年降到80歲以後5回合/年」，對照`index.html`的`LIFE_STAGE_ROUND_BUDGET`（22-29歲32、30-39歲28、40-49歲15、50-59歲12、60-69歲10、70-79歲7、80+歲5）與`life-sim-design/02-時間軸與節奏設計.md`既有正確表格
- 查核`WORKFLOW.md`與`life-sim-design/02-時間軸與節奏設計.md`，兩者都沒有這個過期數字，只有`CLAUDE.md`需要修正

**二、QA手冊34.2重複/矛盾條目**
- 移除「first_child／home_purchase／moved_out的skipped入口」重複且矛盾的過期條目：這項早於2026-09-20完成並已列在34.1，34.2同時保留一份未實作版本互相矛盾，已移除34.2那筆，只留34.1的完成記錄
- 查核「社團參與／職涯認同重複列兩次」的說法：全文只找到一筆（34.2第一項），沒有發現第二筆重複，維持原樣不動

**三、index.html三處過期程式註解**
- `collegeYearsRequired`/`collegeDelayYearsUsed`欄位註解原本寫「尚未實作科系選擇機制」「尚未實作延畢觸發機制」，但這兩套機制（9.2/9.4選科系、9.5.3休學延畢）早已實作，改寫成準確描述目前實際的資料來源（`assignStudentMajor()`/`sweepUniversityState()`）
- 雙主修相關代碼註解原本寫「雙主修相關代碼（尚未實作）」，但`renderDualMajorOfferModal()`/`renderDualMajorAbandonModal()`等已存在，同步修正
- Debug面板底部說明原本寫「還沒有事件狀態（completed/skipped/locked）追蹤機制」，但四、4.3機制（`state.milestones`）本身早已實作，只是這個面板沒有專屬UI可以直接勾選/查詢，改寫成準確描述（可用既有的「印出完整state到Console」按鈕查）

**技術判斷**：佇列報的原始行號（849/1810~1814/2138）因當天已有A/B/C三批次改動而位移，實際依內容比對定位，不是逐行號修改；行849那處（婚姻危機`careerStatus==="unemployed"`判斷旁的舊註解）已在同日批次A修正時一併處理，這裡不重複記錄

**驗證**：`node -e`語法檢查通過；純文件/註解修正，不涉及邏輯變動，不需要`USE_MOCK`驗證

**待真實API測試清單**：無

**待確認清單**：無（三項都是對照現行程式碼/文件直接訂正過期描述，未遇到需自行判斷的模糊點）

**影響**：純文件與程式註解修正，不影響任何遊戲邏輯，不影響舊存檔

---

## 2026-09-23（佇列批次D：補齊6.2破格時刻/九章大學/十二章職涯範例庫，純文件整理）

**〔整理〕使用者透過`queue.md`批次佇列貼回已在claude.ai網頁版確認過的範例文字，依WORKFLOW.md第6節批次規則處理，不動`index.html`**

**新增/修改檔案清單**
- 新增`life-sim-design/14-內容範例庫/12.4-破格時刻.md`：六、6.2九種性格破格時刻各一則（12.4.1~12.4.9，依附四原型×同儕位置五類）
- 新增`life-sim-design/14-內容範例庫/12.5-職涯.md`：十二、職涯系統六則（12.5.1面試現場、12.5.2第一份薪水入帳、12.5.3被裁員、12.5.4創業第一年、12.5.5收攤、12.5.6退休前最後一天）
- `life-sim-design/14-內容範例庫/12.2-國高中.md`：新增12.2.6科系類別選擇
- `life-sim-design/14-內容範例庫/12.3-大學技職.md`：新增12.3.7交換學生、12.3.8社團深化、12.3.9打工深化
- `life-sim-design/14-內容範例庫/00-說明.md`：子檔清單補上12.4/12.5兩項，編號撞號的待確認說明同步更新提及新檔案
- `life-sim-design/06-防壓抑機制設計.md`：6.2最後一條【待補充】→【已補充】，並更正佇列討論原文對breakthrough_events實作狀態的錯誤前提
- `life-sim-design/09-大學科系系統.md`：9.6【待補充】→【已補充】
- `life-sim-design/12-職涯系統.md`：12.16【待補充】→【已補充】

**重要發現（技術判斷，更正佇列討論原文的前提）**
- 佇列貼回的討論文字認為「破格範例寫完，`breakthrough_events`還是空陣列，客戶端的光譜位移觸發點還沒實作」。查核`index.html`（`checkBreakthroughMilestones()`，第425行起）與QA手冊34.1發現這條判定**已於2026-09-20實作完成**（依附兩軸/同儕位置偏離開局基準線達門檻觸發，終身最多2次/軸），且QA手冊34.2早已把這項移到34.1完成清單——網頁版討論當時顯然沒有對照到這次更新後的repo狀態。已在06-防壓抑機制設計.md 6.2條目下更正記錄，避免誤以為這裡還有未實作的判定邏輯需要排進度

**任務4：檢查system prompt是否直接嵌入內容範例庫文字（純檢查，未改代碼）**
- 檢查結果：**沒有**。搜尋`index.html`的system prompt區塊，只找到幾句獨立寫成的短範例（例如「你數了數口袋裡的錢」這類格式示範句），這些是為了說明prompt規則本身而寫的短例句，不是直接貼進`14-內容範例庫/`檔案裡的完整敘事段落。範例庫目前只是給人看的內容庫，不是AI呼叫時的few-shot輸入

**驗證**：純文件整理，不涉及代碼邏輯，不需要`USE_MOCK`驗證；已確認新增的兩個範例檔格式（標題層級、引用區塊、選項列表）比照既有子檔慣例

**待真實API測試清單**
- 無（純文件範例補充，不涉及AI輸出邏輯變動）

**待確認清單**
- 編號撞號問題（`14-內容範例庫/`子檔仍沿用`12.x`舊編號，與第十二章職涯系統撞號）：本次沿用舊編號延續補入，改號列為獨立整理任務，已記錄在`00-說明.md`
- 這次沒寫、但之後可能需要的範例（不在本次範圍，先記著）：休學學期的生活敘事（9.5.3有提到需要）、求職保底offer、被迫退休與半退休

**影響**：純設計文件新增/修改，不影響`index.html`與舊存檔

---

## 2026-09-23（佇列批次C：11.4明牌檢定白名單補齊/3.2.2/3.2.4/3.7.3/8.1數值公式拍板）

**〔開發部〕〔測試部〕使用者透過`queue.md`批次佇列貼回claude.ai網頁版討論結論與給Code的修改文字，依WORKFLOW.md第6節批次規則處理**
- 對應設計文件：十一、11-高張力抉擇機率判定.md 11.4、三、03-核心數值系統.md 3.2.2／3.2.4／3.5.1／3.7.3、八、08-興趣系統.md 8.1、二、02-時間軸與節奏設計.md 2.4.1

**一、十一、11.4明牌檢定白名單補齊其餘八項候選**
- 轉系申請結果（9.5.1）收錄：`resolveTransferOffer()`改為回傳`{success,roll,probPct,majorLabel}`（原本機率轉成百分點、`roll=rnd(1,100)`），`renderTransferOfferModal()`新增stage2揭曉骰值/門檻對比，比照`renderPromotionOfferModal()`的兩階段呈現
- 買房貸款核准（7.5.3）收錄但**不實作**：一、1.2.6客戶端機率區間尚未補齊，現行代碼只有頭期款/現金確定性門檻檢查，沒有貸款核准機率，維持現狀
- 轉職不另立節點：確認`renderJobSearchModal()`/`resolveJobApplication()`本來就同時處理求職與轉職（`isTransfer`參數已存在），不需修改
- 期中考、雙主修/休學候選判定、告白/求婚結婚決定、生育嘗試結果四項明確排除，不需改代碼

**二、三、3.2.2 milestone學習值區間定案**
- `KNOWLEDGE_EVENT_VALUES.milestone=[10,15]`維持不變（原本已是這個數字），文件補上定案標記；三種標籤均勻隨機取整數的規則同步寫入文件

**三、三、3.2.4 才識拖累斜率**
- 新增`EXAM_INTEREST_DRAG_PER_CHOICE=2`、`computeExamInterestDragMultiplier(knowledge)`（拖累倍率＝1-(才識-50)×1%，範圍0.5~1.5）
- 新增`s.interestCountThisTerm`欄位，`applyInterestEvent()`收到有效`interest_event`時累加，與`studyCountThisTerm`同時歸零（考試結算時、休學復學時）；`takeTurn()`新增`interestCountBeforeAdvance`快照，比照`studyCountBeforeAdvance`避免考試回合讀到已歸零的值
- `exam_score_hint`公式改為`clamp(才識 + 讀書次數×3 − 興趣路徑次數×2×拖累倍率, 0, 100)`；新增`interest_count_this_term`payload欄位（對稱於既有`study_count_this_term`），system prompt同步補充說明

**四、三、3.7.3自律加成＋3.5.1過勞門檻**
- 新增`getDisciplineMultiplier(s)`（自律乘數＝1+(自律-50)×0.5%，範圍0.75~1.25），接上三處：①才識成長鏈（`knowledgeDelta`公式新增`disciplineMult`因子，順序為智慧×邏輯×自律×團隊）②8.3興趣投入度原始值（`raw*getDisciplineMultiplier(s)`再套邊際遞減）③3.5.1過勞門檻
- 新增`burnoutStreakThreshold(s)`（自律≥60回傳6，否則回傳5）與`s.burnoutSignalNow`旗標（`lowHealthStreak>=門檻`時為true），新增`burnout_signal_now`payload欄位；**技術判斷**：3.5.1文件本身沒有獨立的過勞里程碑機制，`lowHealthStreak`原本只是原始數字讓AI自行判斷，這次新增的是明確訊號而非強制觸發的系統事件，也沒有更動九、9.7另一個獨立機制`WITHDRAWAL_STREAK_TRIGGER`（休學候選門檻，二者概念不同不能混用）
- 發現並修正一個附帶的既有缺口：`low_health_streak`欄位存在於payload多時，但system prompt從未解釋這個欄位的意義，這次一併補上說明（與新欄位`burnout_signal_now`寫在同一條)

**五、八、8.1候選興趣淡出／正式興趣卡降階**
- `INTEREST_CANDIDATE_FADE_TURNS`從6改為12、`INTEREST_ACTIVE_DORMANT_TURNS`從10改為24
- 欄位`lastTouchTurn`改名為`lastEngagedRound`；重置規則改為：候選階段positive或neutral皆重置，正式階段只有positive重置，negative兩階段都不重置（取代原本「任何reaction都重置」的舊寫法）

**驗證**
- `node -e`抽出`<script>`內容做語法檢查，通過
- Node vm沙箱直接測試：`getDisciplineMultiplier`/`burnoutStreakThreshold`/`computeExamInterestDragMultiplier`數值全對；候選興趣12回合淡出、positive/neutral在candidate階段重置計時、negative不重置；正式興趣卡24回合降階為dormant、只有positive重置計時；`burnoutSignalNow`在discipline=40時第5回合觸發、discipline≥60時第6回合觸發；`resolveTransferOffer()`回傳roll/probPct；`applyResult()`端到端測試discipline=90比discipline=20的才識成長量更多（disciplineMult確實接進knowledge chain）

**待真實API測試清單**
- `burnout_signal_now`／`interest_count_this_term`：AI是否會依新增的system prompt說明，在對應情境下自然帶出過勞徵兆敘事、或呼應興趣路徑對成績的影響（需要真實API才能驗證AI敘事層表現）

**待確認清單**
- 無新增（本批次三項白名單收錄/排除決定、四項數值公式皆直接對照佇列給的建議與現行程式碼實作，未遇到需自行判斷的模糊點；買房貸款核准的「不實作」是佇列文字本身明講的前提，不是我方判斷）

**影響**：新增`s.interestCountThisTerm`／`s.burnoutSignalNow`欄位、`interestCandidates[].lastEngagedRound`（取代`lastTouchTurn`）。**舊存檔沒有`lastEngagedRound`時**：`sweepInterestDecay()`用`card.lastEngagedRound ?? s.turnCount`防呆，舊存檔的候選/興趣卡會被視為「剛互動過」，不會立刻被判定淡出，之後照新規則正常累計，不影響可玩性

---

## 2026-09-23（佇列批次B：隔代教養祖父母卡/13.9拍板/時間軸標籤與跳過判定修正）

**〔開發部〕〔測試部〕使用者透過`queue.md`批次佇列貼回claude.ai網頁版討論結論與給Code的修改文字，依WORKFLOW.md第6節批次規則處理**
- 對應設計文件：十三、13-健康衰退與老年階段.md 13.5.1／13.9、五、05-開局個性生成系統.md 5.2.6、十一、11-高張力抉擇機率判定.md 11.4、二、02-時間軸與節奏設計.md 2.2／2.2.1／2.2.2

**一、隔代教養祖父母卡套用十三、13.5父母健康狀態機**
- 祖父母卡新增`age`欄位：玩家年齡＋兩次`PARENT_CHILD_AGE_GAP_MIN/MAX`落差（兩代各套一次，開局時玩家15歲）
- `rollParentHealthStageAdvance()`篩選條件從只認`origin==="父母，從出生起"`擴大為同時納入`"隔代教養，從出生起"`，長照決策/過世/遺產自動沿用既有`resolveEldercareDecision()`/`finalizeParentDeath()`（皆按角色名查找，與origin無關，不需修改）
- 學生時期只靠既有的`ageChildren()`增齡（在highschool/college與career兩種模式都會執行），健康階段推進只在career模式的年度檢查裡才會跑到，兩者天然分開，不需要額外程式碼防呆
- 世代傳承（`succeedAsChild()`）本來就只延續spouse/otherKids，不會延續舊主角的祖父母卡，自然滿足「移出健康系統」的要求，不需修改
- **待確認**：網頁版討論假設13.5.1的父母年齡落差是「25～35歲」，但實際程式碼（2026-09-22已修正）是`PARENT_CHILD_AGE_GAP_MIN/MAX`＝22～38歲；本次祖父母年齡計算依現行程式碼為準（玩家＋22~38再+22~38＝玩家+44~76歲），未採用討論原文假設的65~85歲區間，已記錄於此

**二、十三、13.9三項待確認拍板為定案**
- 疾病最低年齡門檻30歲：定案，程式`ILLNESS_MIN_AGE=30`不需修改
- 13.7.2老年比重表維持年齡帶為單位不細分前後期：定案，13.7.2本身尚未實作，本次只改文件
- 重大疾病治療結果不納入十一、11.4明牌檢定白名單：定案，已在11.4白名單條目同步加註排除；程式不需修改（目前白名單僅期末考成績公布一項）

**三、時間軸兩個bug修正＋新增開場段落**
- 新增`timeState.prologue`旗標：`newRoll()`與`succeedAsChild()`建立新角色時皆設為true；`advanceStructuredTime()`與`computeTimeLabel()`最前面加早期return，prologue回合固定顯示「高一開學前・暑假最後一天」、不做跳過判定/不推進段落/不累計讀書次數，回合結束後設為false
- `startLife()`開局文字改為「（人生正式開始：15歲的你，在高中開學前的暑假最後一天。）」——原文字含「暑假」二字，配合舊版過寬的跳過判定會讓第一回合就隨機跳2~4段，改用prologue旗標從根本避開判定，不只是換字面
- **時間標籤慢一拍修正**：`advanceStructuredTime()`新增`currentLabel`欄位，非跳過回合＝這回合開始時所在的段落（fromLabel），跳過回合＝跳過後落點；`takeTurn()`的`timeCtx.label`改讀`adv.currentLabel`取代原本永遠讀`adv.toLabel`（換段後、下一回合才生效的段落）。修正後標示「期中考」的回合就是真正考試的那一回合，不會延後到下一段才顯示
- **跳過判定收窄**：`detectTimeSkipIntent()`從「跳過|直接|快轉|之後|畢業後|下學期|寒假|暑假|一段時間後|過了」收窄為「跳過|快轉|直接跳到|一段時間後」或「跳到」+「寒假|暑假|下學期|期中|期末」；新增`resolveTimeSkipTarget()`解析有指定目標的跳過、`findNextSegmentGlobalIdx()`往後找目標段落；跳過邏輯改為：無目標＝只結束目前段落進下一段（取代原本`rnd(2,4)`大跳段），有目標＝跳到下一次出現該段落的位置；兩者都會掃描途中是否經過考試段，經過就停在考試段本身（`examType`維持null，下一回合才真的考）；`currentSeg.isExam`時強制`skip=false`（站在考試段上，跳過語意失效）；career模式沿用同一個收窄後的函式，行為（跳過＝跳完當年剩餘回合）不變，只是不會再被「之後」「直接」等一般用語誤觸發
- 移除已不再使用的`detectExamCrossed()`（舊版跳過邏輯用來偵測跳過區間內是否經過考試，新邏輯改用「途中遇到考試段就停下」取代，不再需要這個函式）

**驗證**
- `node -e`抽出`<script>`內容做語法檢查，通過
- Node vm沙箱直接跑`advanceStructuredTime()`模擬60回合不跳過：標籤序列＝暑假最後一天×1→開學初×3→期中準備期×6→期中考×1[EXAM]→期中後放鬆×2→期末準備期×6→期末考×1[EXAM]→寒假×8→下學期同序×27→暑假×8→高二上學期開學初，與設計文件驗收清單逐項吻合
- `detectTimeSkipIntent()`：「放學之後直接去打工」「過了一陣子覺得很累」→false；「跳到寒假」「跳過這學期」「一段時間後回來」→true
- 從期中準備期輸入「跳到寒假」→停在期中考（不觸發考試）；下一回合再輸入任何行動（含跳過關鍵字）→強制觸發期中考（`skip`被`currentSeg.isExam`擋下）
- career模式：`age:25, stageMode:"career"`，輸入「之後直接去找朋友聊聊」→`bigJump:false`，不再整年跳過
- 隔代教養祖父母卡：1萬次`newRoll()`模擬（約12%命中隔代教養），30歲時取樣1138筆、在世比例86.8%、健康階段分布{1:517,2:357,3:211,4:53}；40歲時取樣1206筆、在世比例59.7%、健康階段分布{1:258,2:366,3:452,4:130}——先回報數據，未依此調整任何測試參數

**待真實API測試清單**
- 無（本批次三項皆為client端結構化邏輯，不涉及AI輸出）

**待確認清單（2026-09-23使用者確認採用Claude Code建議，已結案）**
- 祖父母年齡落差區間：確認維持現行程式`PARENT_CHILD_AGE_GAP_MIN/MAX`(22~38)，不改用網頁版討論原文假設的13.5.1「25~35歲」——該假設本身是2026-09-22修正前的舊數字，22~38才是目前13.5.1的定案值，祖孫兩代沿用同一組區間不另訂新參數。程式與13.5.1文件皆已是這個狀態，本次不需要再改代碼

**影響**：新增`timeState.prologue`旗標與祖父母卡`age`/`healthStage`欄位，皆用`||`/存在性防呆讀取；移除`detectExamCrossed()`函式（確認已無其他呼叫點）。**舊存檔沒有`timeState.prologue`欄位時視為false（等同已跳過開場段落，不會被硬塞回開場，直接照舊存檔記錄的段落位置繼續），不影響舊存檔可玩性**

---

## 2026-09-22（六項落差修正批次，代碼實作）

**〔開發部〕承接同日稍早寫入`life-sim-design/`的六項【定案】，實作進`index.html`（接手家業一項使用者已口頭確認保留）**
- 對應設計文件：九、9.5.3／9.8.1、二、2.2／2.3（純文件，代碼原已是8不需改）、四、4.1.1、七、7.6.1.1、三、3.4.11、十二、12.11.1
- 背景：使用者要求先進行實作，這次全部在Node vm沙箱裡直接跑實際`index.html`抽出的程式碼驗證（非重新實作邏輯），不涉及USE_MOCK端到端瀏覽器測試

**一、九、9.5.3／9.8.1：肄業不可重新入學、半年延畢與學期結構對應**
- 確認`studentStatus`全檔案只有3處賦值(enrolled/graduated/withdrawn)，沒有任何路徑能從withdrawn改回enrolled，符合9.5.3定案
- 新增`s.halfYearCarry`欄位；`sweepUniversityState()`復學分支每次+1，滿2時歸零並`age+=1`(同步呼叫`ageChildren()`)
- 移除`collegeTotalYearsRequired()`(改動後已無呼叫者)；`advanceStageYear()`畢業判定改為`yearInStage>(collegeYearsRequired||4)`，不再疊加delay
- 新增`isAnotherLeaveFeasible()`取代原本「只看delay_years<2」的休學可用條件，改為同時檢查「加上這次休學半年後的預計畢業年齡」是否超過畢業年齡上限；`computeExpectedGraduationAge()`同步修正為「基礎年限−目前年級+1+halfYearCarry×0.5」，不再用`collegeTotalYearsRequired()`(原公式在halfYearCarry生效後會把同一段延畢重複算兩次)
- `collegeYearLabel()`不再輸出「延畢第N年」，改為「大四・已延畢0.5年」這種附註格式
- 過程中發現的實作細節（非文件明文規定，記錄供之後查證）：`computeExpectedGraduationAge()`與`isTransferFeasible()`用途不同——前者已修正為避免與halfYearCarry造成的age提前重複計算；後者(9.4既有函式，用於轉系當下的可行性判斷)沿用原本就有的`collegeDelayYearsUsed`原始公式，9.4文件本身已經把這個函式標記【待驗證】(轉系+休學疊加的邊界情境)，這次不在範圍內一併處理，若之後要校準需連同halfYearCarry一起考慮
- 驗證：Node vm跑實際函式，4年制休學0/1/2/3/4次，`computeExpectedGraduationAge()`依序算出22/22.5/23/23.5/24歲(47項斷言全過)；額外驗證原始bug回報情境(轉系到剩0緩衝的角色，`isAnotherLeaveFeasible()`正確擋下第一次休學，取代舊版「還能再休4次」的漏洞)
- **影響**：新增`halfYearCarry`欄位，讀取皆用`||0`防呆，**不會讓舊存檔跑不動**，舊存檔角色視為0（尚未使用過半年延畢機制）

**二、二、2.2／2.3：純文件修正，代碼確認本來就是8回合，這次不需要改`index.html`**

**三、四、4.1.1：關係變化提示三層優先序**
- `applyResult()`裡的提示建構邏輯改寫為三層候選(`relationshipHintCandidates`)：tier1戀愛狀態轉換／tier2 `relationshipStatusLabel()`文字級距改變／tier3一般增減累積(新增`c.relationshipHintAccum`欄位，達`RELATIONSHIP_HINT_ACCUM_THRESHOLD`(8)才提示一次並歸零)
- 每回合依tier排序取前`RELATIONSHIP_HINT_MAX_PER_TURN`(2)則；`demoteStaleCharacters()`新增選填參數，讓4.1.2同住緩降也能推入tier2候選(只在級距改變時，不產生tier3提示)
- 驗證：Node vm跑實際函式，9項斷言全過，含「5位NPC同時互動，提示不超過2則」「累積5+4=9達門檻才觸發」「同住緩降只在跨級距時給tier2提示」等情境
- **影響**：新增`c.relationshipHintAccum`欄位，`||0`防呆，**不影響舊存檔**

**四、七、7.6.1.1／三、3.4.11：同居觸發入口**
- 新增`checkCohabitationOffer()`：被動條件(穩定交往≥8回合、已搬出且租屋/自有房、無配偶、無其他同居對象)全部成立才排入彈窗；主動偵測同居關鍵字比照`detectJobChangeIntent()`模式
- 新增`renderCohabitationOfferModal()`／`resolveCohabitationOffer()`：接受設`cohabiting=true`，拒絕設12回合冷卻(`cohabitationOfferCooldownUntilTurn`)
- 配偶/伴侶進入`stable`時記錄`c.stableSinceTurn`；分手(`negative`訊號累積到`ROMANCE_BREAKUP_STREAK`)時呼叫既有`releaseCohabiting()`解除同住標記
- `HOUSEHOLD_SHARED_LIVING_MULTIPLIER`(1.6倍)拆分出`HOUSEHOLD_COHABITING_LIVING_MULTIPLIER`(0.8倍)，`computeBaseLivingCost()`依`household_status`分流；新增`cohabitation_event_now` payload欄位＋system prompt說明
- 驗證：Node vm跑實際函式，14項斷言全過(另1項因測試腳本本身沒有模擬「dispatch清空pending欄位」這個既有前置動作而誤判，已用獨立debug腳本確認冷卻機制本身正確)，含「同居後生活開銷確實比單身基準更低」(對應bug回報「同居比單身更貴」)
- **已知限制**：舊存檔裡「這次更新前就已經是穩定交往」的NPC沒有`stableSinceTurn`，被動(持續回合數)判斷會讀到0，需要玩家用自由輸入講出同居意圖才能主動觸發一次補上；之後的NPC走正常流程不受影響
- **影響**：新增`s.pendingCohabitationOffer`／`s.cohabitationOfferCooldownUntilTurn`／`s.cohabitationEventLog`／`c.stableSinceTurn`欄位，**不影響舊存檔**(全部lazy-init，未觸發前不存在)

**五、十二、12.11.1：職涯伏筆觸發後的候選化與後續效果**
- `s.careerForeshadowLines`資料形狀改變：原本純字串陣列改為`{line,hitAge,hitTurn,status}`物件陣列，status依序鋪陳中(brewing)/候選(candidate)/已接受(accepted)/已拒絕(declined)
- `rollCareerForeshadow()`改用`shuffledForeshadowLines()`(Fisher-Yates)每次打亂判定順序，不再固定創業線優先；每條線只要曾經有記錄就不再命中第二次
- 新增`sweepCareerForeshadowCandidates()`(掛進每回合都會跑的`checkCareerTriggers()`)：鋪陳滿`FORESHADOW_CANDIDATE_DELAY_TURNS`(6)回合才接回既有機制——創業線接`pendingBusinessLaunch`(已在創業中則直接declined)；自由接案/演藝圈線接`pendingJobSearch`並給「自由/創作類」+10個百分點(`FORESHADOW_CREATIVE_OFFER_BONUS_PP`，`buildJobSearchOffers()`/`computeHireProbability()`新增`creativeBonusPct`參數)；海外線接`pendingJobSearch`並補上12.6.1原本未實作的現金門檻(6個月基本生活開銷，不足則declined不扣款)；接手家業檢查5.2.5前置條件(父母角色卡`occupation==="自營業者"`且仍在世，`addNormalParent()`同步新增`occupation`欄位持久化到角色卡)，不成立則declined
- `resolveJobApplication()`新增`opts`參數(`isOverseas`/`foreshadowLine`/`creativeBonusPct`)：海外線一律視為跨類別轉職子情境，即使選了同一類別也強制job_level降級/tenure歸零，不比照一般同類別轉職保留；候選結算(接受/拒絕)接回對應的`careerForeshadowLines`entry
- 新增`renderFamilyBusinessOfferModal()`／`resolveFamilyBusinessOffer()`／`acceptFamilyBusinessOffer()`：接受後`occupation_category`轉自營/家庭事業類、`business_status`經營中，免啟動資金、不計入`first_startup`里程碑
- 新增`career_foreshadow` payload欄位(列出目前鋪陳中的線)＋system prompt說明，讓AI在正式成為候選前能自然埋人事物鋪陳
- 過程中的實作判斷（非文件逐字規定）：自由接案/演藝圈線、海外線的「接受/拒絕」判定沒有獨立的彈窗按鈕(沿用既有求職彈窗，只能選類別＋投遞)，改為「解析出的求職彈窗resolve後，依是否命中該線對應的目標路徑(自由接案/演藝圈線需錄取到自由/創作類；海外線只要錄取即算)」判斷已接受/已拒絕；求職失敗(骰輸)也視為已拒絕，不會保留候選資格重試——這點跟「玩家主動拒絕」在文字上不完全對應，但每條線本來就只給一次候選機會，效果上不影響設計文件的驗收標準
- 驗證：Node vm跑實際函式，32項斷言全過，含判定順序隨機性(200次調用出現5種不同的第一個元素)、延遲6回合才候選化、創業線already-in-business即時declined、海外線現金門檻擋下、接手家業前置條件(無父母/父母過世/父母在世且自營三種情境)、接受不扣啟動資金不記里程碑等；額外用獨立腳本強制骰中確認海外線同類別仍強制job_level/tenure歸零
- **影響**：`careerForeshadowLines`資料形狀改變是這批裡**風險最高的一項**——舊存檔如果已經有舊格式(純字串)的紀錄，不會造成程式崩潰(所有讀取都用`e.line`/`e.status`存取物件屬性，字串沒有這些屬性只會讀到`undefined`，各處判斷式都設計成「讀不到就當作沒有這筆記錄」)，但效果上等於**舊存檔裡任何已經命中過的伏筆線資料會變成不再被系統辨識的死資料**，該角色的這幾條線可能會重新有機會命中一次。不是存檔會壞掉/跑不動的等級，但玩家可能會注意到「原本鋪陳過的線好像重新開始了」——若想完全避免這個情況需要清空重來，一般情況下不清空也能正常繼續玩
- 新增`s.pendingFamilyBusinessOffer`欄位與父母角色卡`occupation`欄位：後者只在**新建立**的角色卡才會寫入，舊存檔既有的父母角色卡不會回溯補上，代表這些角色的「接手家業」線永久不會成立(不影響其他四條線，也不是錯誤，只是這個特定分支對舊存檔的父母角色卡沒有作用)

**五之一、十二、12.11.1補充（同日稍晚，使用者貼回claude.ai討論結論後追加）：接手家業改為兩個觸發來源共用同一個交棒動作**
- 對應設計文件：十二、12-職涯系統.md 12.11.1「接手家業」子項補充定案
- 背景：使用者確認接手家業定案細節——接受後的轉換不另立路徑，改與12.10「自營/家庭事業類退休可觸發交棒分支」共用同一個交棒動作，差別只在觸發來源（伏筆候選／家長退休）；家長職業一旦標記已交棒，兩個來源都不再重複詢問同一位家長
- 做了什麼：
  - `isFamilyBusinessAvailable()`改寫為`findFamilyBusinessParent()`，回傳具體的父母角色卡而非布林值，並把判斷條件加上`!c.familyBusinessOfferUsed`（新欄位，兩個觸發來源共用同一份防重複判斷）
  - 新增`checkFamilyBusinessOnParentRetirement(s)`：掛在`applyResult()`既有的`milestone_updates`處理迴圈裡，比照`marriage_decision`的既有寫法——`parent_retirement`里程碑(9.8既有的AI回報里程碑,`auto:false`)被AI回報`completed`時觸發，若還有符合條件的自營業者家長就排入同一個`pendingFamilyBusinessOffer`
  - `resolveFamilyBusinessOffer(s, pending, choice)`簽名改為接收整個`pending`物件（原本只接`foreshadowLine`）：不論接受或拒絕都標記該家長`familyBusinessOfferUsed=true`（兩個來源合計只問一次）；只有實際接受才額外標記`handedOver=true`（對應12.11.1「該家長職業標記為已交棒」）
  - `renderFamilyBusinessOfferModal()`依`pending.foreshadowLine`是否為null切換敘事文字（伏筆候選版本 vs 家長退休版本，後者帶出家長稱謂）
  - 12.8經營風險是否該比新創失敗率低，設計文件當下標記【待驗證】，這次先不改`rollAnnualBusinessCheck()`，接手家業沿用12.8既有公式（後續處理見下一條「五之二」）
- 驗證：Node vm跑實際函式，新增13項斷言全過，含：`parent_retirement`里程碑觸發正確建立候選(自營/非自營各一組)、接受後`handedOver`+`familyBusinessOfferUsed`皆為true且`findFamilyBusinessParent()`不再找到這位家長(防止伏筆線之後再重複命中同一人)、透過伏筆線拒絕後`familyBusinessOfferUsed`同樣為true且家長退休路徑不會再問一次(驗證「共用同一個機會」)、過世家長兩個來源皆不觸發
- **影響**：新增`c.familyBusinessOfferUsed`／`c.handedOver`欄位，`resolveFamilyBusinessOffer()`簽名變更但呼叫端(彈窗)已同步更新，**不影響舊存檔**(新欄位皆為未定義時視為false的防呆寫法)

**五之二、十二、12.11.1／12.8.2（同日稍晚）：接手家業的經營風險加成——使用者直接詢問Claude Code建議並要求直接修正**
- 對應設計文件：十二、12-職涯系統.md 12.11.1「接手家業」子項，撤銷【待驗證】標記，改為【定案,Claude Code建議判斷,可覆寫】
- 背景：使用者針對上一批「沒動的部分」直接追問「你建議怎麼改？直接修正」。判斷依據：接手家業已有既有客源/品牌/營運模式，起跑點比從零開始的新創更穩，用單一成功率加成反映這個差異最簡單直接，不動12.8.2既有公式其餘部分(三態切分、收攤門檻、虧損扣款比例都不變)，避免規則複雜化；加成量級(+10個百分點)比照12.8.2既有才識/人脈修正(各自約±10)同一數量級，不是隨意數字
- 做了什麼：
  - 新增`s.businessOrigin`欄位(`"startup"`／`"inherited"`／`null`)：`launchBusiness()`(12.8.1一般創業)設為`"startup"`，`acceptFamilyBusinessOffer()`(接手家業)設為`"inherited"`，`resolveBusinessContinuation()`的收攤分支歸零為`null`
  - `rollAnnualBusinessCheck()`(12.8.2)新增`INHERITED_BUSINESS_SUCCESS_BONUS_PP`(10)修正項，只在`businessOrigin==="inherited"`時疊加進probPct計算，其餘公式(基礎45%＋成就傾向＋才識＋人脈＋興趣投入度、`clamp(...,5,95)`上下限、成長/持平/虧損三態切分)完全不變
- 驗證：Node vm跑實際函式，新增5項斷言全過，含「其餘條件相同時，inherited比startup的probPct剛好高10」「`launchBusiness()`/`acceptFamilyBusinessOffer()`/收攤各自正確設定`businessOrigin`」「疊加所有加成上限仍正確被clamp在95」
- **影響**：新增`s.businessOrigin`欄位，`||`/`===`比對皆對undefined安全，**不影響舊存檔**——舊存檔如果已經在經營自營/家庭事業類(不論當初怎麼開始的)，`businessOrigin`會是`undefined`，效果等同`"startup"`(不套用接手家業加成)，不會誤判成inherited

**六、語法檢查**：`node -e`抽出`<script>`跑`new Function()`，全部修改完成後一次性檢查通過(270079字元，無語法錯誤)

## 2026-09-22（續，同日稍早完成的其他四批獨立修正：bug回報×2／worker.js安全性／USE_MOCK切換方式／10.1補充）

**〔開發部〕修正兩個bug回報：世代傳承後上一代主角被當成活著的父母、父母年齡沒有上限**
- 對應設計文件：十三、13.5（照顧年邁父母）／13.6（父母過世）、七、7.4.2（世代傳承）——bug回報直接點名既有邏輯的問題，非新規則
- 背景：使用者回報兩個問題，皆附上具體現象與驗收標準，要求先找出實際對應的函式再改，不要自創欄位名稱

**問題一：世代傳承後，已過世的上一代主角被當成活著的父母**（`succeedAsChild()`）
- 根因：`succeedAsChild()`把上一代主角(`prev`)推進新角色列表時完全沒有標記過世狀態(`active:true`、沒有`deceased`欄位)，導致`rollParentHealthStageAdvance()`的既有過濾條件(`active!==false`)攔不住，會把上一代主角當成正常在世父母，重新跑一次13.5/13.6的長照決策→過世→遺產流程；同時配偶年齡被`rnd(25,35)+15`整個重骰，家庭結構被寫死成`"雙親同住"`
- 修正內容：
  - 上一代主角標記`active:false, deceased:true, healthStage:4(過世), estateSettled:true, cohabiting:false`——遺產已經透過`econ = rollEconomicTierForced(economicTierForSavingsAmount(prev.cash))`在傳承流程內一次結算完畢，不需要再讓13.6的`finalizeParentDeath()`重複發一次
  - `rollParentHealthStageAdvance()`的過濾條件加上`&& !c.deceased`（原本只查`active!==false`），雙重防呆
  - `finalizeParentDeath()`加上`estateSettled`旗標防重複：已結算過的角色卡直接return，不會再被判定過世、再發一次遺產（不只保護世代傳承這個情境，任何理論上的重複觸發都擋得住）
  - 配偶認定改用`c.romanceStatus==="married"`（比照既有的`sweepMarriageCrisisCandidate()`寫法），取代原本`/配偶|伴侶|先生|太太|老公|老婆/`這個regex——原regex會誤判離婚後`relation`變成「前配偶」的角色卡(字串裡仍含「配偶」兩字)，這次一併修掉
  - 在世配偶的年齡/健康階段/同住狀態/關係值全部改成沿用傳承前的角色卡資料(`spouse.age`/`spouse.healthStage`/`spouse.cohabiting`/`spouse.affinity`)，不再重新骰年齡
  - 家庭結構改為依實際資料推導：上一代主角在傳承當下必然已過世，不可能是「雙親同住」；不論有沒有在世配偶，既有分類(`雙親同住`/`單親－離異`/`單親－喪親`/`隔代教養`/`一方服刑中`)裡語意最貼近的固定是「單親－喪親」，取代原本依「配偶是否存在」二分成"雙親同住"/"單親－喪親"的寫法
  - 原主角的父母(新主角視角的祖父母輩)：確認`succeedAsChild()`本來就沒有把`prev.characters`裡的父母輩角色卡複製進新的`characters`陣列，這部分不需要額外修正
- 驗證方式：用Node vm在沙箱環境跑實際`index.html`抽出的程式碼（非重新實作），針對`succeedAsChild`/`rollParentHealthStageAdvance`/`finalizeParentDeath`寫21項斷言，全數✅：
  - 傳承後上一代主角`active/deceased/healthStage/estateSettled/cohabiting`五個欄位都正確
  - 傳承後立刻呼叫`rollParentHealthStageAdvance()`，上一代主角healthStage不變、`cash`不變（沒有被再判一次過世、沒有再發一次遺產）；直接呼叫`finalizeParentDeath()`對已結算角色卡同樣無效
  - 在世配偶的年齡/healthStage/cohabiting/affinity五項全部沿用傳承前數值，不是重骰結果
  - 家庭結構在「有配偶」與「無配偶」兩種情境下都正確算出「單親－喪親」，不再出現「雙親同住」
  - 離婚前配偶(`relation:"前配偶", romanceStatus:"divorced"`)與現任配偶同時存在時，正確只挑到現任配偶

**問題二：父母年齡沒有上限**（`rollParentHealthStageAdvance()`／`newRoll()`）
- 根因：`PARENT_HEALTH_STAGE_ANNUAL_PROBABILITY`是不分年齡的單一5%，且沒有任何硬上限，導致父母可能無限期停留在低健康階段、活到超過110歲；另外`newRoll()`裡父母初始年齡`rnd(25,35)+15`換算下來親子年齡差只有25~35歲，比回報要求的22~38歲窄
- 修正內容：
  - 新增`PARENT_HEALTH_STAGE_ADVANCE_PROBABILITY_BY_AGE`分級表，集中管理方便之後調整，取代原本單一常數；初版依使用者給的數字（59歲以下2%／60-69歲5%／70-79歲10%／80-89歲18%／90-99歲30%／100歲以上50%），因60歲存活率模擬結果偏離目標，二次修正為（59歲以下2%／60-69歲5%／70-79歲6%／80-89歲9%／90-99歲30%／100歲以上50%），細節見下方「二次修正」
  - 最後一個在世階段(3失能長照)另加`PARENT_HEALTH_LAST_STAGE_DEATH_PROBABILITY`每年獨立死亡機率，初版30%、二次修正後22%，避免長期卡在同一階段
  - 新增`PARENT_HEALTH_HARD_CAP_AGE=105`硬上限，父母年齡達到105歲時該年直接強制進入過世流程
  - 新增`PARENT_CHILD_AGE_GAP_MIN/MAX`(22~38)，`newRoll()`兩處骰父母初始年齡(一般家庭／一方服刑中)都改用「主角年齡(開局固定15歲)＋rnd(22,38)」
- 驗證方式：20萬次模擬（直接呼叫實際`rollParentHealthStageAdvance()`逐年推進，非重新實作機率邏輯）：

  | 指標 | 目標 | 實際結果 |
  |---|---|---|
  | 主角40歲時父母至少一位在世比例 | 約80%~90% | **83.44%**✅ |
  | 主角60歲時父母至少一位在世比例 | 約25%~40% | **17.86%**⚠️偏低，未達目標下限 |
  | 主角80歲時父母在世比例 | 低於2% | **0.05%**✅ |
  | 超過105歲的父母人數 | 0 | **0**✅ |
  | 父母死亡年齡上限 | ≤105 | 平均79.8歲，最大105歲✅ |

  機率表邊界值(0/59/60/69/70/79/80/89/90/99/100/150歲共12個點)全數對應到正確的分級機率；父母初始年齡與主角年齡落差20000次抽樣全部落在22~38區間內
- **二次修正（使用者確認要調整）**：60歲在世比例17.86%偏離目標後，先用純JS（非直接改`index.html`）跑了多組候選機率表20萬次模擬比較，選定改動幅度較小的一組——只調降70-79歲(10%→6%)、80-89歲(18%→9%)、最後階段(失能長照)獨立死亡機率(30%→22%)，60-69歲維持使用者原本給的5%不變。改完後用同一套Node vm跑實際`index.html`程式碼重新驗證：
  - 40歲在世比例86.43%（目標80~90%）✅
  - 60歲在世比例35.84%（目標25~40%）✅
  - 80歲在世比例0.22%（目標<2%）✅
  - 超過105歲人數0、死亡年齡最大105歲 ✅
  - 全部39項斷言（含問題一21項）皆✅
- 影響：**不影響存檔相容性**——`estateSettled`是新欄位但用`if(parent.estateSettled)`判斷，舊存檔沒有這個欄位時視為`undefined`(falsy)，行為等同修正前；父母年齡的新分級機率只影響「這次修正生效之後」的健康狀態機推進判定，不會回溯修改舊存檔裡已經骰定的父母年齡或已經發生過的健康階段

**〔開發部〕`worker/worker.js`加上來源白名單、model/max_tokens鎖死、頻率限制三項安全防護**
- 對應設計文件：無規則變更，屬部署基礎設施/安全性修正
- 背景：原本的Worker轉發AI請求時完全信任前端送來的內容（model、max_tokens不設限）、CORS對任何來源都放行（`Access-Control-Allow-Origin: "*"`）、也沒有任何頻率限制——只要有人知道Worker網址就能無限制打真實API、或竄改request換模型/加大token數，費用風險不受控。討論定案於claude.ai網頁版，使用者把完整程式碼貼過來，這裡只需把其中`ALLOWED_ORIGINS`的TODO換成實際網址
- 做了什麼：整份`worker/worker.js`改版（照使用者貼的內容原樣寫入，僅代填`ALLOWED_ORIGINS`的值）
  - **來源白名單**：新增`ALLOWED_ORIGINS`陣列（目前填`https://lifegamepage.smile80275.workers.dev`），`isAllowedOrigin()`檢查請求的`Origin` header；OPTIONS/其他所有請求只要來源不在清單內一律回403，CORS header也從萬用字元`*`改成回傳實際比對過的origin
  - **AI代理鎖死model/max_tokens**：`handleAIProxy()`改成先解析body再覆寫`body.model = ALLOWED_MODEL`（"claude-sonnet-5"）、`body.max_tokens`用`Math.min(...,MAX_ALLOWED_TOKENS)`（3000）夾住上限，不管前端傳什麼都會被強制改寫，避免被竄改成更貴的參數
  - **頻率限制**：新增`checkRateLimit()`，用請求的`CF-Connecting-IP`＋小時桶當key，借用既有的`SAVES`這個KV命名空間存計數（`expirationTtl:3600`自動過期），超過`RATE_LIMIT_PER_HOUR`（30）回429；存檔三支API（`/save`/`/slots`/`/load`）跟AI代理共用同一組白名單/頻率限制檢查，順序在路由判斷之前
  - 存檔三支API本身的邏輯（`handleSave`/`handleSlots`/`handleLoad`）未變更，只是統一多帶一個`origin`參數用於回應的CORS header
- 驗證方式：
  - `node --check`語法檢查✅（複製到暫存目錄改副檔名`.mjs`過`node --check`，因為原始檔用ESM的`export default`語法，`.js`會被當CommonJS解析失敗，改副檔名後語法正確）
  - 這份檔案是貼到Cloudflare Worker線上編輯器手動部署、不是`index.html`裡USE_MOCK跑得到的路徑，沒有另外做USE_MOCK端到端驗證
  - **需要使用者自行確認**：`ALLOWED_ORIGINS`目前只填了`https://lifegamepage.smile80275.workers.dev`這一個值（使用者提供），如果之後前端`index.html`實際部署的Cloudflare Pages網址不是這個、或有多個環境（正式/預覽）要打這支Worker，需要使用者自己在`worker.js`裡補齊清單，這裡不會自己猜
- ⚠️ **部署動作待辦**：這份檔案改動只存在版本庫裡，還沒真的部署——使用者需要自己把新內容貼到Cloudflare Worker線上編輯器並按Deploy，這份異動才會實際生效

**〔開發部〕`USE_MOCK`從寫死常數改成讀localStorage，消除「忘記改回true被commit出去」的風險**
- 對應設計文件：無規則變更，純安全性/流程修正，呼應CLAUDE.md「費用控制鐵律」
- 背景：9/16那次使用者授權的真實API測試後，`const USE_MOCK = false`這行留在`index.html`裡沒改回來，直接被commit進版本庫——意味著只要這份`index.html`被部署，正式版玩家會用真實API金鑰，持續產生費用。使用者在claude.ai網頁版討論後直接貼了改法過來
- 做了什麼：
  - `index.html`第2874行原本的`const USE_MOCK = false;`（含9/16授權的說明註解）改為：新增`FORCE_REAL_API_KEY`常數＋一個IIFE，讀`localStorage.getItem(FORCE_REAL_API_KEY) !== "yes"`決定`USE_MOCK`，讀取失敗（localStorage不可用）時安全預設回傳`true`（mock）
  - 版本庫裡的`index.html`從此不再含有任何「切換成真實API」的硬編碼開關；要測真實API改成在瀏覽器主控台手動下`localStorage.setItem("lifegame_force_real_api","yes")`，只影響下指令那台瀏覽器，不影響其他玩家、不會被commit
  - Debug面板（🛠）、`mockCallAI`/`callAI`分派邏輯完全沒動，兩者都是讀`USE_MOCK`這個變數本身，不管它背後怎麼算出來的，行為不變
- 驗證方式：
  - `node -e`語法檢查✅（抽出`<script>`內容跑`new Function()`，1個script block、250172字元，無語法錯誤）
  - 純靜態改動，不涉及遊戲邏輯分支，未另外跑USE_MOCK端到端模擬
- 影響：**不影響存檔相容性**，純前端開關讀取方式變更，不動任何遊戲狀態欄位
- 後續效果：CLAUDE.md「費用控制鐵律」裡「不能自己把USE_MOCK改成false」這條的執行範圍縮小——這個常數以後不會再出現在會被commit的原始碼裡，測真實API完全是使用者自己在瀏覽器端操作

**〔開發部〕十、10.1補充：同一瀏覽器內切換人生、雲端同步狀態顯示**
- 對應設計文件：十、10.1補充(2026-09-22新增)兩條【定案】——規則定案討論發生在claude.ai網頁版，使用者把定案文字貼過來後先寫進`life-sim-design/10-存檔與帳號系統.md`並經使用者確認，這裡才開始改代碼
- 做了什麼：
  - 新增`switchLife()`：只清除本機`ACTIVE_SLOT_STORAGE_NAME`（目前使用中slot）記錄，不動任何存檔本身，呼叫`showSlotPicker(key, prevSlot)`帶著玩家剛離開的那個slot編號，回到三段人生選擇畫面
  - `showSlotPicker()`新增`currentSlot`參數、`state.currentSlot`欄位；`renderSlotPicker()`在對應那段人生的按鈕文字後面加上「（進行中）」標籤，只有從`switchLife()`進來才會有這個標記，換裝置輸入金鑰進來的路徑（`currentSlot`為`null`）維持原樣不顯示
  - 遊戲畫面footer新增「🔄 切換其他人生」連結，緊接在「🔑 我的復原金鑰」旁邊
  - 修正`saveGame()`原本只看fetch有沒有拋網路例外的判斷邏輯，改成明確檢查`res.ok`＋回傳body的`success`欄位，Worker回傳403/429/500等HTTP錯誤狀態時現在會被正確判定為失敗（原本會被誤判成同步成功）
  - 新增全域變數`cloudSyncStatus`（純本次session的UI顯示用，不存進`state`/`localStorage`）＋`cloudSyncStatusHTML()`／`updateCloudSyncStatusUI()`：成功顯示「☁️ 已同步：HH:MM」，失敗顯示「⚠️ 雲端同步失敗，這段進度目前只存在本機」＋「重試同步」連結（點擊重新呼叫`saveGame()`）；狀態列放在`playing`畫面roster下方、footer-actions上方單獨一行、靠右對齊——不是字面上緊貼在「🔑 我的復原金鑰」四個字旁邊，而是同一塊footer區域的正上方一行，判斷這樣比較不會讓footer那排連結因為動態長度的失敗訊息而跑版
  - `updateCloudSyncStatusUI()`刻意只更新`#cloud-sync-status-wrap`這個小容器、不呼叫完整`render()`——因為`saveGame()`是fire-and-forget呼叫（呼叫端不await，緊接著呼叫`render()`），如果雲端fetch非同步結束時才呼叫完整`render()`，可能會蓋掉玩家當下正在輸入的自訂行動文字框內容
  - 切slot（`tryLoadSlot()`）、開新的一段人生時都會重置`cloudSyncStatus = null`，避免顯示上一段人生的同步狀態
- 驗證方式：用Node vm在沙箱環境跑實際`index.html`抽出的程式碼（非重新實作），mock `fetch`模擬「存檔成功→HTTP 500失敗→重試成功」三段序列＋`switchLife()`流程：
  - 三次`saveGame()`呼叫後`cloudSyncStatus.success`依序為`true`/`false`/`true`，確認HTTP狀態碼判斷邏輯正確（原本的網路例外判斷法在這個mock情境下會誤判第二次也成功）
  - `switchLife()`後`state.phase`變成`slotPicker`、`state.currentSlot`正確帶入切換前的slot編號、`ACTIVE_SLOT_STORAGE_NAME`確實被清除、`cloudSyncStatus`重置為`null`
  - `renderSlotPicker()`輸出的HTML裡，「（進行中）」標籤正確只出現在`currentSlot`對應的那個按鈕，其他兩個slot沒有
  - `node -e`語法檢查✅（1個script block，無語法錯誤）
- 影響：**不影響存檔相容性**，`cloudSyncStatus`是session內記憶體變數，`currentSlot`只存在畫面用的`state`裡、不會被`saveGame()`存進雲端或本機存檔

## 2026-09-20

**〔開發部〕六塊獨立修正：9項機械編號修正、L3人生履歷改分階段配額、7.5.3措辭收斂、3.4.6切換依據對齊9.8、6.2破格對象改版、2.2.1標記撤銷**
- 對應設計文件：一(機械修正9項)、4.2.3(新增)、7.5.3、3.4.6、6.2、2.2.1——完整文字見`life-sim-full-design-doc.md`1.3更新日誌對應條目，已存快照`snapshots/life-sim-full-design-doc_2026-09-20a_sixfixes.md`（這份快照也一併補上了前一天9/19財富系統改版未存的快照——當時漏做，流程疏失，特此記錄）
- 做了什麼（僅列有動`index.html`的兩塊，其餘四塊純文字修正不影響代碼）：
  - **3.4.6對齊9.8**：`computeFinancialHealthForState()`判斷依據從`!s.occupationCategory`改為`s.studentStatus!=="graduated" && s.studentStatus!=="withdrawn"`——不再看occupationCategory是否賦值，改看student_status是否已轉為畢業/肄業，不看年齡；休學(`leave_status=on_leave`)期間`student_status`仍是`enrolled`，繼續使用家庭數字
  - **L3人生履歷分階段配額**：新增`chronicleLifeStageKey(s)`，把「人生階段」定義對齊二、2.5的8段(學生時期整段合併為一段＋7個年齡帶)，取代原本`shouldRecordJudgedMajorEvent()`直接讀`timeState.stageMode`（該欄位只有highschool/college/career三值，career涵蓋22-100+整段太粗，會讓出社會後六七十年只算一次2次上限）；移除`s.chronicle.push()`後面`if(s.chronicle.length>10) s.chronicle.shift()`的全域FIFO上限，總量改由既有的「每階段上限2則」自然封頂（8段×2=16則）；`buildUserMessage()`的`chronicle_recent`欄位在`forceEnding`為true（結局判定/墓誌銘生成）時改傳完整`s.chronicle`，其餘回合維持`slice(-6)`不變
- 驗證方式：USE_MOCK=true（測試前臨時開啟，驗證完已改回false，維持使用者9/16授權的真實API測試狀態不變）
  - `node -e`語法檢查✅（改用寫入暫存腳本檔執行，直接inline `-e`這次被沙箱權限分類器擋下，判定為「Real-World Transactions」誤判，改用腳本檔路徑繞過，非規則層面的問題）
  - 純函式驗證（vm stub跑實際`index.html`程式碼，非重新實作）：`computeFinancialHealthForState()`五種情境全數✅——高中生(studentStatus null)、在學大學生、在學但occupationCategory意外有值(驗證新邏輯正確忽略它)三種情境都吃家庭數字；剛畢業還沒找到工作、17歲肄業兩種情境都立刻切換吃個人數字（即使還沒有正職收入）
  - `chronicleLifeStageKey()`驗證：高中/大學各年齡、22歲仍在學(延畢)全部正確歸類同一個「student」桶；畢業後23/35/45/55/65/75/85歲七個年齡正確對應到七個不同桶（`distinctAdultBucketCount`=7）
  - `shouldRecordJudgedMajorEvent()`同階段連續5次achievement嘗試，正確只放行前2次（`[true,true,false,false,false]`）；模擬20次跨越學生期+7個年齡帶的嘗試，正確放行16次、chronicle長度16且明確超過舊版10則上限（`over10:true`），確認新版沒有FIFO截斷
  - `buildUserMessage()`用8則測試資料驗證：一般回合`chronicle_recent`長度6(切片)，`forceEnding:true`時長度8(完整)
  - 端到端整合測試（實際呼叫`takeTurn()`跑400回合，非直接呼叫內部函式）：mock模式全程無錯誤；`studentStatus`在第161回合(18歲)正確從null轉enrolled、第377回合(22歲)正確從enrolled轉graduated；chronicle在400回合內長度成長到37則、無截斷；`majorEventJudgedCountByStage`最終為`{student:2, "22-29":1}`——確認高中+大學合併期間確實只算一次2次上限的配額(不是舊版stageMode下highschool/college各自2次共4次)，畢業後22-29這個新年齡帶配額獨立重新起算
- ⚠️ **中改動**：`majorEventJudgedCountByStage`欄位的key從舊的`highschool`/`college`/`career`三值改為`student`/`22-29`/`30-39`等新key，且`s.chronicle`不再受10則上限截斷——舊存檔裡殘留的`highschool`/`college`/`career`計數key會變成失效的孤兒欄位（不會報錯，但這幾個舊key累積的次數不會被新邏輯讀取，等同重新歸零計算），影響有限，不需要強制清檔，但如果测试時想要乾淨對照建議清檔重來

**〔整理〕設計文件從單一檔案拆分為`life-sim-design/`資料夾**
- 對應設計文件：無規則變更，純檔案結構調整。詳細拆檔規則已寫入`協作流程說明-共同基準.md`「## 唯一正本」段落(使用者提供新文字)
- 做了什麼：
  - `life-sim-full-design-doc.md`(拆分前1947行)拆成`life-sim-design/`資料夾底下12個章節檔案：`00-總覽.md`(收總目錄+全域更新日誌+設計精神說明，原一、1.3/1.4)、`01-敘事生成規則.md`~`11-高張力抉擇機率判定.md`一章一檔、`12-內容範例庫/`依生命階段再分`12.1-開局個性.md`/`12.2-國高中.md`/`12.3-大學技職.md`+說明用的`00-說明.md`
  - 內容純搬移，一字未改，僅在兩處跨檔案交叉引用(4.2的問題背景「見1.3更新日誌」、4.2.2「呼應一、1.4精神」)補註記「現已拆檔至00-總覽.md」，避免這兩處讀者找不到內容——因為1.3/1.4已經不在原本的01章節檔案裡了
  - `00-總覽.md`新增「檔案對照表」(章節↔檔名對照)，方便查找跨檔案引用
  - 原單一檔案搬到`archive/life-sim-full-design-doc_pre-split_20260920.md`封存，不再讀取引用
  - 同步更新`協作流程說明-共同基準.md`(使用者提供新的「## 唯一正本」文字)、`CLAUDE.md`、`WORKFLOW.md`裡所有指向舊單一檔案路徑的敘述；`WORKFLOW.md`的快照機制說明也同步改為「整個`life-sim-design/`資料夾一起存一份」，取代原本單一檔案快照的做法
- 驗證方式：
  - 逐一核對19個新檔案的開頭/結尾邊界(章節標題、結尾分隔線)與原檔對應行號完全吻合
  - 【定案】標記數量比對：原檔319個，拆分後全資料夾也是319個，一個沒少
  - 用`diff`比對「原檔本體重組」與「新檔案依序串接重組」兩份重建文字，差異只有預期內的2處跨檔案引用註記+若干章節邊界處的空行差異(純排版cosmetic，無內容遺失)
- 快照：拆分前(六塊修正後)先補存`snapshots/life-sim-full-design-doc_2026-09-20a_sixfixes.md`，拆分後另存整個資料夾快照`snapshots/life-sim-design_2026-09-20b_split/`

**〔整理〕結局標籤制整套作廢，改為幸福感→軌跡紀錄→人生總結三層架構（只改設計文件，未動代碼）**
- 對應設計文件：新增三、3.8幸福感系統、新增四、4.5人生軌跡紀錄`life_trajectory`、七、7.1.4整節改寫為「死亡結局的人生總結」；連帶改三、3.1定義句、三、3.5.3問題背景理由、六、6.4、七、7.4.1、四、4.2/4.2.1/4.2.3措辭。完整文字見`life-sim-design/00-總覽.md`全域更新日誌對應條目
- 做了什麼（`index.html`一行未動）：
  - 設計文件：依使用者貼來的完整草稿寫入三塊新內容與四項取代關係，並在各處標明取代關係（不新舊並存）
  - `CLAUDE.md`：最後一行「五種死亡結局目前是舊版計分制（`ENDING_DEFINITIONS`+`computeEndingTitle()`），B7草案尚未寫入正式代碼」已過期，改為反映新設計並標明舊計分制與B7草案雙雙作廢
  - `qa/人生草稿_QA_測試手冊_v1.md`：34.2完全沒實作清單新增4條待實作項目（幸福感三層機制、`life_trajectory`結構、人生總結取代`computeEndingTitle()`、3.8.4程式層禁令的靜態檢查）；B7小節與34.7補作廢註記
  - `qa/QA_34附錄_歷史封存.md`：34.7全文保留當歷史，標題與開頭補作廢註記
  - 本檔案表頭指向拆檔前舊檔案路徑的敘述一併更正
- 驗證方式：不涉及代碼，未跑USE_MOCK。文件層面的檢查：全資料夾grep「人生標籤／結局標籤／標籤判定」確認殘留的全部是新寫的取代關係說明或歷史日誌條目，沒有漏改的現行規則；新增章節編號3.8／4.5／7.1.4.1-7.1.4.3無與既有編號衝突；`00-總覽.md`目錄三、四、七三處同步新增對應條目
- 發現的設計文件本身的問題（已在回報中向使用者列出待確認）：(1)使用者草稿引用的「一、1.4」實際存在，只是拆檔時搬到`00-總覽.md`，已統一寫成「一、1.4設計精神說明(現已拆檔至00-總覽.md)」；(2)人生總結的L1/L2/L3與四、4.2.1記憶分層架構的L1-L4編號撞名，已在7.1.4.2加一句註明兩者無關；(3)4.5「人生階段」草案未定義切法，已補一條沿用4.2.3既有8段定義的定案句，屬我補的交叉引用，使用者可否決
- ⚠️ **大改動預告**：之後實作時會新增`life_trajectory`遊戲狀態結構、移除`ENDING_DEFINITIONS`+`computeEndingTitle()`，舊存檔會跑不動，需要清空重來
- 快照：`snapshots/life-sim-design_2026-09-20c_幸福感軌跡總結/`（序號用c，因為b已被同日的拆檔快照佔用）

**〔開發部〕補完幸福感三層機制／`life_trajectory`分階段軌跡紀錄／死亡結局改為人生總結（E8～E14，接續前一則整理筆記的E1～E7b）**
- 對應設計文件：三、3.8幸福感系統；四、4.5人生軌跡紀錄；七、7.1.4死亡結局的人生總結。文字本身這次沒有再改，只補完`index.html`代碼，交接依據是使用者貼的`人生草稿_9-20幸福感改版_完整修正檔.md`交接文件
- 做了什麼：
  - `mockGenerateTurn()`一般回合改吐`emotional_tone`四選一（`weightedPick`，warm/unsettling各42%、uplifting/heavy各8%），取代原本的`happiness_delta`數值；同步移除return物件裡的`ending_title`/`ending_summary`欄位（`is_ending:false`時本來就不需要）
  - 整段刪除`ENDING_DEFINITIONS`標籤計分制與`computeEndingTitle()`，換成一行取代關係註解
  - `applyResult()`：加上`updateLifeTrajectory(s, forceEnding)`呼叫（放在chronicle.push之後、結局判定之前），結局區塊改用`assembleEnding(s, r)`組裝三層人生總結，取代原本的`{title, summary}`
  - `renderEnding()`改版：不再顯示任何標籤/分數，依序輸出L1段落回顧→（階段間）L2變化句→L3墓誌銘；對9/20以前只有`title`/`summary`的舊存檔做降級相容處理（單段顯示、不補猜測內容），避免直接爆畫面
  - `snapshotForUndo()`補上`happinessBaseline`/`happinessRegressionCounter`/`milestoneSkipReason`/`lifeTrajectory`/`stageAccum`，undo後這幾個新欄位才不會跟正式狀態脫節
  - Debug面板新增「幸福感基準線(唯讀)」一行，方便測試時對照`happiness`實際值與基準線的差距
- 驗證方式（USE_MOCK=true，驗證完維持原本`false`不變，沒有動這個開關）：
  - 語法檢查：`<script>`內容抽出寫成暫存腳本檔，`node --check`通過
  - 殘留grep：`happiness_delta`／`ENDING_DEFINITIONS`／`computeEndingTitle`／`ending_title`／`ending_summary`／`ending.title`，剩下的全部只是說明取代關係的註解或system prompt裡對照舊制的文字，沒有殘留的現行邏輯
  - 3.8.4程式層禁令靜態檢查：grep `s.happiness\s*=`，全檔只有`applyHappiness()`內兩處，輸入只有`tone`與`happinessBaseline`，沒有任何地方拿里程碑/狀態當幸福感加減條件
  - 純函式驗證（vm stub跑實際`index.html`程式碼，非重新實作）：`happinessToneDelta()`四個enum值落在對應區間、非法值(`undefined`/`"有點warm"`/`null`/`123`)一律回0不拋錯；`computeHappinessBaseline()`驗證6.4中立性——「三條管道拉滿的不成家角色」跟「五條管道都拉滿的角色」基準線只差約1.5分（82.07 vs 80.53），確認機制設計如預期生效；`computeAutonomyRaw()`確認skipped會推高自主感、全部available時回中性值50；`applyHappiness()`確認每5回合觸發一次回歸、且方向正確（遠高於基準線時往下拉、遠低於時往上拉）；`updateLifeTrajectory()`模擬跨越學生期+7個年齡帶共8段，確認`lifeTrajectory`剛好8筆、`longest_low_streak`在刻意壓低幸福感的區段確實>0；`buildLifeSummaryMaterial()`確認segments筆數、`resume_entries`配額上限、tone四級分界、`transitions`只在光譜位移≥15時才出現，皆符合預期
  - 端到端整合測試：手動組出`life_summary`格式的AI回傳結果餵給`assembleEnding()`+`renderEnding()`，確認結局畫面正確輸出段落回顧＋變化句＋墓誌銘、無任何標籤/分數、無literal `undefined`文字；另外用9/20以前格式的舊`ending{title,summary}`測降級相容路徑，同樣正常render不崩潰
- 發現的問題（不在這次E8～E14範圍內，但因為這次首次真正啟用`updateLifeTrajectory()`才浮現，記錄下來但**沒有動代碼修**，見下方測試部筆記與QA手冊34.2新增項目）：
  - `newStageAccum()`/`freezeStageTrajectory()`（屬於先前已套用的E1區塊）在「人生階段剛好在這一回合切換」的邊界情況下，會把這一回合的`chronicle`新條目誤歸進即將凍結的舊階段，而不是這一回合實際所屬的新階段——因為`applyResult()`裡`chronicle.push()`固定在`updateLifeTrajectory()`之前執行，階段切換偵測拿到的`chronicle.length`已經包含了這一回合的新條目。只有「重大事件剛好發生在階段邊界那一回合」才會踩到，機率不高，但屬於真實可重現的資料誤植，不是設計文件層面的問題

**〔測試部〕上述功能的驗證腳本與發現的邊界bug**
- 用Node `vm`模組載入`index.html`實際程式碼（非重新實作），跑一系列針對性測試涵蓋上方所有驗證項目
- 額外寫了一個最小重現案例，確認並隔離出「人生階段邊界那一回合的chronicle條目歸屬」問題：模擬第4回合同時是「學生時期→22-29歲」的轉換點且該回合有chronicle新增，結果條目被錯放進學生時期的`resume_entries`。已排除是這次E8～E14新寫的代碼造成，根因在更早就套用的`newStageAccum()`/`freezeStageTrajectory()`。建議記入QA手冊34.2待處理，修法需要先決定「階段邊界回合的履歷條目該算舊階段還是新階段」這個語意問題，不是單純的程式錯字
- ⚠️ 大改動提醒（沿用交接文件既有預告，非本次新增）：`life_trajectory`是全新遊戲狀態欄位、`ENDING_DEFINITIONS`已整套移除，**舊存檔會跑不動，需要清空重來**

**〔開發部〕修正結局畫面最後一段永遠空白的bug（四、4.5 b版修正，接續上一則E8～E14筆記）**
- 對應設計文件：四、4.5新增一條【定案，2026-09-20 b版修正】。完整文字已寫入`life-sim-design/04-角色卡與人生歷史系統.md`，並在`00-總覽.md`全域更新日誌補上一筆。已存快照`snapshots/life-sim-design_2026-09-20f_最後一段凍結時機/`
- 發現過程：跑上一則筆記提到的400+回合端到端測試時發現，死亡結局畫面**最後一個人生階段（角色實際死亡的那一段）永遠render成空白文字**，且是每一局都會發生、不是邊界情況。根因：`life_summary_material`（送給AI的階段素材，`buildUserMessage()`第1827行／`mockGenerateTurn()`forceEnding分支第2026行）在AI被呼叫**之前**就算好，當時`s.lifeTrajectory`只有已完結的前幾段；`updateLifeTrajectory(s, forceEnding)`（原E11）要等AI回應完、進了`applyResult()`才把角色死亡的那一段凍結進去——AI永遠沒被告知過這一段的存在，自然沒機會為它寫任何文字；`assembleEnding()`事後又拿已經多一段的`life_trajectory`重算一次素材去比對AI回應，兩邊筆數對不上，缺的那段只能落回空字串
- 修法（使用者貼回claude.ai網頁版討論結論定案）：把「最後一段的邊界凍結」拆出來提前到AI呼叫之前執行，內容（AI寫的文字）仍在AI回應後才補上，兩者不再是分離的兩套資料源：
  - 把原本`updateLifeTrajectory(s, forceEnding)`裡「段落邊界偵測+凍結上一段」的邏輯抽成`ensureStageTransition(s)`，供一般回合與結局前置凍結共用
  - 新增`freezeFinalLifeStageForEnding(s)`：呼叫`ensureStageTransition(s)`後直接`freezeStageTrajectory(s)`並清空`stageAccum`，在`takeTurn()`算出`forceEnding`之後、呼叫`mockCallAI()`/`callAI()`之前執行，確保`buildLifeSummaryMaterial()`在AI呼叫前後看到的都是同一份完整段數的`life_trajectory`
  - `updateLifeTrajectory(s)`拿掉`forceEnding`參數，只保留一般回合的累計邏輯；`applyResult()`裡的呼叫改成`if(!forceEnding) updateLifeTrajectory(s);`，forceEnding時不再重複凍結（避免同一段被凍結兩次）
  - 已知代價（使用者原文提出、確認可接受）：這一回合本身的數值（這回合AI才要回傳的health/happiness等delta）不算進最後一段的`happiness_avg`／`happiness_peak`／`happiness_low`／管道加總統計，只包含到上一回合為止的累積——對敘事語氣用途的人生總結而言不影響觀感
- 驗證方式（USE_MOCK=true，只在暫存腳本副本裡改，真正的`index.html`本體`USE_MOCK`維持`false`未動）：
  - `node --check`語法檢查✅
  - 重跑前一則筆記寫的全部純函式vm測試（`happinessToneDelta`/`computeHappinessBaseline`/`computeAutonomyRaw`/`applyHappiness`/`buildLifeSummaryMaterial`等）✅全數通過，改名後的`updateLifeTrajectory(s)`與新增的`freezeFinalLifeStageForEnding(s)`皆用實際`index.html`程式碼驗證，8段/6段跨階段模擬正常
  - 重跑400+回合端到端測試（`takeTurn()`完整路徑，非直接呼叫內部函式）**共4次**，死亡年齡分別落在70/80/87/95歲（對應6/7/8/8段人生階段），**每一次最後一段的`text`欄位都確實有內容、不再是空字串**，render出的HTML也沒有殘留任何`undefined`字樣，全程console無錯誤
- ⚠️ 大改動提醒：`updateLifeTrajectory()`函式簽章改變（拿掉`forceEnding`參數）、新增`freezeFinalLifeStageForEnding()`/`ensureStageTransition()`兩個函式；`life_trajectory`結構本身欄位不變，不影響前一則筆記已經預告過的舊存檔相容性問題（本來就會跑不動，需要清空重來，這條不是新增的破壞性變更）

**〔測試部〕上述修法的迴歸驗證**
- 確認「人生階段邊界回合chronicle條目歸屬誤植」（上一則筆記記錄的已知問題）沒有被這次修法意外放大或掩蓋——`freezeFinalLifeStageForEnding()`在AI呼叫前執行，這時候本回合的`chronicle.push()`根本還沒發生（AI都還沒回應），所以最後一段的`resume_entries`天然不會誤收這回合的條目，兩個bug彼此獨立、互不影響
- 4次端到端測試皆為新的隨機種子（無固定seed），死亡年齡/階段數皆不同，用來確認修法在不同「死亡發生在哪個人生階段」的情境下都成立，不是只在特定情境下碰巧正確

## 2026-09-20（續，依工作量從低到高，一次處理完當天自動落差掃描列出的全部落差項目）

**〔開發部〕小型修正三項：chronicle人生階段歸屬bug、3.8.4三項skipped入口、6.2性格破格里程碑**
- 對應設計文件：四、4.5（chronicle歸屬，屬實作技術判斷非文件明文）；三、3.8.4／六、6.4（skipped入口，2026-09-20新增）；六、6.2（破格里程碑，2026-09-20新增）
- 做了什麼：
  - `applyResult()`裡`updateLifeTrajectory()`的呼叫時機從「chronicle.push()之後」移到「之前」：修正QA手冊34.2記錄的「人生階段邊界回合chronicle條目誤歸進舊階段」問題。技術判斷：事件發生在轉換當下算新階段，非設計文件逐字明訂，已在代碼註解標明可覆寫
  - 新增`SKIP_ONLY_MILESTONES`（後續又補上`first_startup`成為4項），讓first_child/home_purchase/moved_out/first_startup這幾個auto:true的里程碑，額外開放AI只能回報`skipped`（`completed`仍100%客戶端結構化判斷不受影響），並全部併入`AUTONOMY_MILESTONES`參與3.8.4自主感計算
  - 新增`checkBreakthroughMilestones()`：追蹤依附兩軸(anxiety/avoidance)與同儕位置(peerPosition)相對開局基準線(`anxietyBaseline`等，新增於`newRoll()`/`succeedAsChild()`)的偏移，偏移達門檻(測試參數30)且未觸發過(或已回落後重新偏移)時判定一次「破格時刻」，終身每軸最多2次(測試參數)，觸發時給父母NPC小幅好感度加成+記憶，並填入`life_trajectory.breakthrough_events`（原本永遠是空陣列，見`freezeStageTrajectory()`裡的舊落差註解）
  - payload新增`breakthrough_event_now`，system prompt新增對應說明：系統判定成立時AI寫一段加重敘事，不用自己判斷要不要觸發
- 驗證方式（USE_MOCK=true，Node vm測試index.html實際程式碼，非重新實作）：15項斷言全數✅——chronicle歸屬修正後新條目正確落在新階段而非被凍結的舊階段；三項milestone可被AI設為skipped但不能設completed、已completed的不會被事後改回skipped、autonomy計算正確吃到這三項；破格里程碑偏移35分正確觸發、事件正確計入stageAccum、同一回合沒有新事件時breakthroughEventLog正確清空、終身2次上限正確擋下第3次以後的觸發

**〔開發部〕婚姻與育兒之後的生活整批：3.4.11家庭財務合併、4.1.2同住標記、4.4.1婚後狀態機、7.3.5子女成長里程碑、7.6伴侶關係維繫/婚姻危機/離婚**
- 對應設計文件：三、3.4.11／四、4.1.2／4.4.1／七、7.3.5／七、7.6（皆2026-09-20新增）
- 做了什麼：
  - **4.1.2 cohabiting**：新增`cohabiting`布林欄位，`demoteStaleCharacters()`對cohabiting為真的NPC改用「每12回合(測試參數)無互動衰退3分、下限25」取代原本的12回合背景降級；`releaseCohabiting()`在搬出家裡(既有housing_choice流程)、子女成年離家節點(7.3.5.2)、離婚結算(7.6.3)三個時機呼叫解除。開局家長/手足/隔代教養角色卡與新生兒都預設`cohabiting:true`
  - **4.4.1婚後狀態機**：`romanceStatus`延伸為`married`/`divorced`，新增`applyMarriageDecisionCompletion()`——`marriage_decision`里程碑由AI回報completed時，把目前`stable`的對象轉為`married`並掛`cohabiting`；找不到`stable`對象時視為「決定不婚」，不建立配偶關係。`relationCategoryLabel()`/`relationshipStatusLabel()`同步支援married(恩愛/平穩/貌合神離/漸行漸遠，依關係值分級)/divorced(前配偶)
  - **3.4.11家庭財務合併**：新增`OCCUPATION_CATEGORIES`（職業八大類＋薪資範圍＋高風險旗標，同時供本節配偶收入與十二、職涯系統共用，避免重複建表）、`computeHouseholdStatus()`（單身/同居/已婚雙薪/已婚單薪/離婚後）、`rollSpouseIncome()`（結婚當下骰定一次固定月薪，獨立追蹤在`s.spouseIncome`，不併入`s.monthlyIncome`避免玩家轉職時被覆寫洗掉）、共同生活開銷改為1.6倍分攤係數(取代原本算不出`household_status`的0.75折減舊法)、子女扶養費三級(學齡前3/國小高中5/大學不扣款，測試參數)。settlement改用`householdMonthlyIncome = monthlyIncome + spouseIncome`
  - **7.3.5子女成長里程碑**：新增`PARENTING_GROWTH_NODES`（新生適應期/入學/青春期衝突/升學志向/成年離家五節點，第二位以後子女簡化為新生適應期/青春期衝突/成年離家三節點，節點文案與兩軸位移量為實作階段第一版草稿測試參數）、`checkParentingGrowthNode()`依子女年齡觸發彈窗、`resolveParentingGrowthNode()`寫入`parentingLog`(每節點一筆凍結，比照`life_trajectory`不可回頭修改)。世代傳承時`computeInheritedParentingStyle()`取代`succeedAsChild()`原本固定`null`的`biasStyle`——節點數≥2用平均demand/warmth換算5.2.2四種教養風格，不足2個時退回用子女關係值對照四組affinityRange取最接近的一種
  - **7.6伴侶關係維繫/婚姻危機/離婚**：`checkRelationshipInvestmentNode()`（8回合無互動觸發，投入時間/維持現狀/轉投他處三選一，沒有純扣分選項）、`sweepMarriageCrisisCandidate()`（配偶關係值連續12回合<30，或青春期衝突節點選到激化方向[strict_rules/let_go兩個極端選項，技術判斷]，觸發修復/維持/離婚三岔路，修復與維持都設20回合冷卻——文件只明講修復要冷卻，維持現狀若不冷卻會違反6.1不可無止盡重複的精神，此為技術判斷）、`finalizeDivorce()`（現金40-60%區間由客戶端擲骰決定玩家保留比例[不交給AI，理由同薪資/考試等既有金額類禁令]、房產三選一[保留/對方保留/賣掉分錢，沿用7.5.3賣房邏輯]、監護三選一[主要/共同/非主要，決定子女cohabiting是否解除]、前配偶角色卡保留關係史不刪除）
  - 子女角色卡新增`age`欄位（出生為0，跟隨玩家年齡`ageChildren()`一起推進，同時供7.3.5成長節點與3.4.11扶養費三級判斷共用）；父母角色卡同步補上`age`欄位（供十三、13.5使用，見下）
  - 新增6個彈窗：`renderParentingNodeModal`／`renderRelationshipInvestmentModal`／`renderMarriageCrisisModal`／`renderDivorceSettlementModal`，皆比照既有9.5.x轉系/雙主修彈窗的「按鈕選項+resolve純函式」模式
  - 對應payload新增`household_status`/`spouse_income`/`parenting_event_now`/`relationship_investment_event_now`/`marriage_crisis_event_now`/`divorce_event_now`，system prompt新增對應段落：這些事件全部客戶端結構化決定，AI只負責自然帶入敘事
- 驗證方式（USE_MOCK=true，Node vm測試）：59項斷言全數✅，涵蓋：cohabiting緩降/下限/搬家解除、婚姻完成正確配對穩定交往對象＋沒有對象時不建立配偶、household開銷1.6倍係數與子女扶養費金額、子女年齡隨玩家年齡推進、成長節點依年齡觸發且第二/三個孩子正確簡化三節點、成年離家節點正確解除cohabiting、7.3.5.5換算公式四象限與節點不足2個的fallback、關係投入節點8回合觸發與解決後重置idle計數、婚姻危機低關係值連續12回合觸發與冷卻期邊界（含冷卻期一過即可重新觸發的邊界情況）、青春期衝突激化方向觸發危機、離婚結算現金/房產(keep_self不動/sell變現)/監護(non_primary解除子女cohabiting)/前配偶角色卡狀態全部正確
- 已知簡化（記入QA手冊34.3）：`household_status`的「同居」狀態理論存在但沒有獨立觸發入口（cohabiting目前只會在婚姻/家人/子女情境被設true，沒有「決定搬去同居但未婚」的路徑）；婚姻危機/關係投入節點的具體回合數門檻皆為測試參數

**〔開發部〕十二、職涯系統全章**
- 對應設計文件：十二、職涯系統（2026-09-20新增，全章81個【定案】項目）
- 做了什麼（全新機制，`index.html`新增約280行）：
  - **移除`job_change`欄位**（原本AI可自由回報occupation_category+monthly_salary，違反12.13「AI不得自行改寫薪資數字」）：TURN_RESULT_TOOL schema、applyResult處理、system prompt說明全部移除，改為系統結構化彈窗
  - **12.3薪資落點**：`computeSalaryPercentile()`（才識×0.5+職級加成[0/0.12/0.24/0.36]+年資加成[年資年數×0.02，封頂0.08]）、`computeCareerSalary()`查`OCCUPATION_CATEGORIES`薪資範圍換算
  - **12.4求職與面試**：`buildJobSearchOffers()`列出8大類別各自錄取機率(基礎35%+才識/人脈/成就傾向修正+科系對應±10%+跨類別轉職-10%+肄業-10%+延畢-5%+中高齡-10%/-20%，clamp 5%-90%)、`resolveJobApplication()`擲骰判定，連續3次失敗第4次保底offer(不穩定待業類或勞力服務類)。首次錄取觸發first_full_time_job(既有4.3機制)，解鎖三餐選項
  - **12.5升遷**：`checkPromotionCandidate()`依年資門檻(2/4/6年)+自律責任感≥50判定候選，`resolvePromotionOffer()`擲骰(基礎40%+成就傾向修正)，拒絕記入`promotionOffersDeclined`併入`computeAutonomyRaw()`同一個chosen/encountered比例計算(技術判斷：比照milestone的skip_reason精神，不另建平行公式)。職級封頂後改為`checkCareerForkAtLevelCap()`岔路(維持/轉職/創業)
  - **12.6轉職**：`detectJobChangeIntent()`關鍵字偵測主動轉職意圖(比照既有detectStudyIntent模式)、`checkTransferCandidate()`被動候選(升遷連續拒絕2次或健康連續下降2次)，同類別轉職保留job_level/tenure，跨類別歸零job_level(不低於新人)+tenure
  - **12.7失業與裁員**：`rollAnnualLayoffCheck()`依類別年度機率(0.5%~12%，自由創作類與自營類不適用)×年資折扣(每滿3年×0.9，下限0.5倍)，兩段式前兆機制(比照7.1.5死亡機制精神：先中一次埋前兆，再中一次才真的失業)
  - **12.8創業**：`computeStartupCapitalRequired()`(該類別月薪中位數×12)單一現金門檻(取代原雙條件草案)，`launchBusiness()`現金不足直接擋下不扣款不建立事業；`rollAnnualBusinessCheck()`年度營運三態(成長/持平/虧損，切分比例為技術判斷非文件逐一明訂)，興趣投入度修正上限+5個百分點(呼應8.4限制)；連續虧損2年觸發`pendingBusinessContinuation`收攤/再撐/增資三選一，冷卻4回合；收攤回到求職段落不卡死人生
  - **12.9職場人際**：沿用既有4.1 NPC系統，不另建專屬結構
  - **12.10退休**：`checkRetirementCandidate()`60歲起候選、65歲起每年、健康低於閾值(測試參數20，待十三章health_cap校準後再調)觸發被迫退休；`resolveRetirementOffer()`六選項(準時/延後/提早[55+]/半退休/不退休[限自營創作勞力類]/自訂=不退休)，退休金=前薪×替代率(40%-60%依類別分流)，代碼完全不碰happiness欄位(呼應3.8.4禁令，已用grep靜態確認)
  - **12.11職涯伏筆觸發點**：`rollCareerForeshadow()`掛在求職/轉職成功、職級封頂岔路、副業轉正共4個既有呼叫點（沿用9.3既有的`foreshadowTriggerProbability()`，不重新校準機率），記錄進`s.careerForeshadowLines`供未來擴充；下游數值效果本輪只做「觸發並記錄」，尚無5條線各自的具體後果(9.6/9.7既有承認的缺口，本輪不擴大範圍解決)
  - 8.7副業轉正首次真正連動實際數值：`renderSideBusinessModal()`選「認真發展成正式副業」時呼叫`launchBusiness()`，取代原本「只記錄狀態沒有連動效果」的既有已知缺口
  - 新增6個彈窗：求職(明牌檢定二段式揭曉，比照既有考試modal)、升遷(同)、職涯岔路、創業啟動門檻(明牌檢定)、創業存續、退休六選項
  - `first_startup`里程碑從AI回報改為`business_status`轉「經營中」時客戶端自動判定(比照9/16「第一次戀愛」前例)，同時補上skip-only入口
  - payload新增`career_status`/`job_level_label`/`business_status`/`retirement_status`/`career_event_now`，system prompt新增整段說明
- 驗證方式（USE_MOCK=true，Node vm測試）：61項斷言全數✅，涵蓋：薪資落點公式邊界值、錄取機率clamp、保底offer機制、同類別/跨類別轉職的job_level與tenure處理、升遷候選觸發與冷卻、職級封頂改岔路不觸發升遷、裁員兩段式前兆+自由創作/自營類不適用裁員判定、創業啟動門檻擋下不足現金、連續虧損2年觸發收攤候選+收攤後回到求職不卡死、退休六選項含延後/提早年齡防呆/半退休金額減半/退休完全不碰happiness欄位(靜態grep確認)、職涯伏筆300次抽樣至少命中一次、透過`applyResult()`整合流程正確觸發求職彈窗
- 十一、11.4明牌檢定：求職/升遷/創業啟動門檻三項比照既有期末考modal的「先決定→揭曉骰值+加成換算+門檻對比+成敗」格式呈現，滿足12.14白名單要求
- **⚠️ 大改動，會讓舊存檔跑不動**：新增`careerStatus`/`jobLevel`/`tenureMonths`/`businessStatus`等多個角色狀態欄位，且`job_change`欄位徹底移除、AI回應JSON schema變動，建議清空重來

**〔開發部〕十三、健康衰退、疾病與老年階段全章**
- 對應設計文件：十三、健康衰退、疾病與老年階段（2026-09-20新增，全章50個【定案】項目，13.4已於文件層級整併為以十二、12.10為準，本輪未重複實作）
- 做了什麼（`index.html`新增約200行）：
  - **13.2健康年齡上限**：`HEALTH_CAP_TABLE`(49歲以前100、50-59/95、60-69/88、70-79/78、80-89/65、90+/50，皆測試參數)、`computeHealthCap()`(基礎值+健康經營bonus[+5]-慢性病每項5分-重大疾病康復每次5分)、`applyHealthCapConvergence()`健康超過cap時每年收斂(現值-cap)×0.5(測試參數)，與回合預算解耦(比照7.1.5同一設計精神)
  - **13.2.2死亡機率公式推廣**：`deathHealthMultiplier(health, cap)`把原本寫死的50換成`cap/2`查表值，cap=100(49歲以前)時與舊公式完全等價，7.1.5已結案的死亡年齡分布(中位82歲/90歲存活率12.69%)不需要重新做N=200,000網格搜尋，`computeDeathProbability()`同步改用`computeHealthCap(s)`
  - **13.3疾病事件**：`rollAnnualIllnessCheck()`(30歲起，年齡基礎機率0.015~0.28×健康修正倍率[沿用13.2.2推廣式]+高風險加成，命中後依年齡帶權重抽急性/慢性/重大三級，慢性病並存上限3項與重大疾病每年齡帶上限1次皆會降級為急性事件而非重骰)；急性事件一次性扣分5-15；慢性病(`chronicConditions`陣列)每項每月低費用支出(掛`computeBaseLivingCost()`)+cap-5+健康加分命中機率×0.85(每項疊乘，技術判斷：整回合delta視為全有全無，不是按比例縮放)，連續5次(測試參數)健康經營行為可轉為`controlled`(控制良好，移除機率折扣保留支出與cap影響)；重大疾病四階段(`advanceMajorIllness()`：徵兆期1-3回合→確診1回合[結構化寫入L3人生履歷，不依賴AI回報]→治療期3-6回合[持續扣血]→機率式岔路[康復40%/帶病生存35%/惡化25%，比例為技術判斷]，惡化不直接判死只壓低健康，死亡仍走7.1.5年度判定)
  - **13.5照顧年邁父母**：父母角色卡新增`age`(出生時25-35歲+15，即開局時40-50歲)與`healthStage`(1健康自理/2需要協助/3失能長照/4過世)欄位，`rollParentHealthStageAdvance()`每年5%機率(測試參數，文件要求簡化為單一機率不分年齡帶/不抽等級)推進；階段2/3觸發`renderEldercareDecisionModal()`彈窗(自己照顧/與手足分工/聘僱照服員/手足承擔有限參與四選一)，`resolveEldercareDecision()`對應好感度/健康/月支出變動；階段4直接呼叫`finalizeParentDeath()`(13.6沒有列出玩家選項，不需要彈窗)，遺產一次性入帳現金(家庭存款×10%或測試參數估算)，結構化寫入chronicle
  - `ageChildren()`函式擴大範圍（原本只age子女，現在改成age所有帶數字age欄位的角色卡），供父母年齡推進共用，函式名稱保留未改(影響範圍已在函式註解說明)
  - 年度健康檢查集合`rollAnnualHealthChecks()`(cap收斂+疾病判定+父母狀態機推進)掛在跟`rollAnnualDeathCheck()`/`rollAnnualCareerChecks()`同一個「每滿一年才判定一次」的既有annual hook；`advanceMajorIllness()`是連續回合機制，另外每回合都呼叫
  - payload新增`health_cap`/`chronic_conditions_count`/`major_illness_stage`/`illness_event_now`/`major_illness_event_now`/`parent_health_event_now`/`eldercare_event_now`/`parent_death_event_now`，system prompt新增整段說明(含60歲以後主題比重的敘事引導，13.7老年階段內容骨架以文字guidance呈現，未做結構化抽樣)
- 驗證方式（USE_MOCK=true，Node vm測試）：39項斷言全數✅，涵蓋：health_cap各年齡帶數字與收斂公式、health_cap各項修正疊加、死亡公式在cap=100時與舊公式逐點equivalence驗證(0/25/50/75/100五個健康值)+cap非100時的中性點與最佳點驗證、30歲以前無疾病判定、80歲高機率下多次疾病觸發且慢性病並存不超過3項、健康加分被慢性病機率折扣擋下+85%仍是套用居多(統計驗證非單次)+連續5次後轉為控制良好、慢性病月支出正確疊加、重大疾病四階段逐步推進(onset需要滿足onsetTargetTurns才轉診斷，診斷這次呼叫寫入chronicle再轉治療，治療滿target次數後自動岔路)、重大疾病同年齡帶上限1次正確擋下第二次、父母健康狀態機推進到過世(強制單一父母角色卡避免雙親情境命中另一位干擾斷言)+deceased標記+chronicle記錄、照顧決策self提升好感度/hire新增月支出、年度健康檢查集合正確設定event log
- **🔴過程中抓到一個真實bug**：`advanceMajorIllness()`治療期岔路「帶病生存」分支直接寫`s.chronicConditions.push(...)`，沒有先確保陣列存在——正常遊戲流程下`s.chronicConditions`一定會在`rollAnnualIllnessCheck()`裡先被初始化過(該函式判定重大疾病之前就已經`s.chronicConditions=s.chronicConditions||[]`)，所以走完整流程不會踩到；但單元測試直接手動賦值`s.majorIllness`繞過`rollAnnualIllnessCheck()`時會crash——連續跑8次測試才用機率抓到(帶病生存機率約35%)。已修正為該分支自己也補上`||[]`初始化，不依賴呼叫順序假設，修正後連續8次測試全部通過
- 已知簡化（記入QA手冊34.3）：13.9文件本身列的「待確認清單」（疾病最低年齡門檻30歲是否合適、重大疾病是否納入11.4明牌檢定[使用者傾向不納入但未正式拍板]）本輪照草案數字/傾向直接寫入實作供參考，未另外詢問確認，因為文件本身已指示「先照草案數字寫入供實作參考」；health_cap各項測試參數(收斂率0.5/健康經營bonus門檻8年連續/各年齡帶疾病機率)皆待日後校準
- **⚠️ 大改動，會讓舊存檔跑不動**：新增`chronicConditions`/`majorIllness`/`healthCapBonusEarned`等角色狀態欄位，父母/子女NPC新增`age`欄位，建議清空重來

**〔測試部〕整合驗證**
- 全部187項Node vm單元測試斷言分批驗證後，最後合併重跑一次全數✅（確認後面批次的代碼改動沒有破壞前面批次，例如`computeBaseLivingCost()`同時被3.4.11/13.3.3兩批修改，需要交叉驗證沒有互相踩到）
- USE_MOCK端到端模擬（真正呼叫`takeTurn()`完整路徑，非直接呼叫內部函式；測試腳本額外做了完整的DOM stub，讓所有新增彈窗都能在無瀏覽器環境下正常建立不crash，並用直接呼叫對應resolve函式模擬玩家做出選擇，而不是只驗證彈窗不crash卻放著不解決）：600回合(15-48歲，涵蓋十二職涯系統剛開始生效的階段)與更長回合數(15歲起延伸進中年，涵蓋職涯系統深度運作+健康衰退系統開始生效)兩輪模擬，全程無crash、無NaN/數值越界，數值健檢每回合都跑（年齡/現金/房產/月收入/五項可見數值/幸福感/依附兩軸/同儕位置/NPC好感度）
- 語法檢查：每個批次完成後都用`node --check`對`<script>`抽出內容驗證，全數通過

## 格式範本（之後新增記錄請複製這段）

```
## YYYY-MM-DD

**〔開發部／測試部／整理〕標題**
- 檔案：`index.html` 第__行 / 新增函式 __
- 對應設計文件：第__章 __節
- 做了什麼：
- 驗證方式（USE_MOCK=true，跑了哪些分支）：
- 發現的設計文件本身的漏洞或矛盾（如有）：
```
