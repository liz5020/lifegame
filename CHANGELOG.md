# 人生草稿——開發/測試異動紀錄

> 這份文件記錄每一次對 `index.html` 或資料夾結構的實際改動。設計規則本身的異動記錄在
> `life-sim-design/00-總覽.md` 的「全域更新日誌」，兩份文件分開維護，不要混在一起寫。
> （2026-09-20更正：原本寫的是拆檔前的`life-sim-full-design-doc.md`「1.3 更新日誌」，該檔案已封存到`archive/`。）
>
> 每筆記錄格式：日期 / 身分（開發部・測試部・整理）/ 做了什麼 / 對應設計文件章節（如適用）/ 驗證方式。
>
> **這份檔案只保留最近的紀錄。2026-09-14～2026-09-27（含所有「續」）已搬到 `CHANGELOG-archive.md`**（2026-09-28整理時把9/20～9/25也搬過去，2026-09-29再搬9/26～9/27）——內容還是有效、可查證，只是平常同步近況用不到，先切開避免每次都要讀過全部歷史。之後如果這份檔案本體又累積到一定長度，會再往`CHANGELOG-archive.md`續補（同一份封存檔案往下加，不再另開新檔）。

---

## 2026-10-10 首頁常見問題加「要付費嗎？」

- `index.html`的`HOME_FAQ`新增第八題，白話說明可免費玩、之後預計推出點數包、購買功能準備中，連到`/pricing`；不寫價格。`test-31`改為八題並檢查連結（單支通過）。設計文件16.10.6同步補入。開放購買時這題要改。

## 2026-10-10 餘額不足暫停提示（未發佈）

- `worker/worker.js`：`callAnthropic()`遇到上游400／402帶credit balance／billing字樣時，改回503 `credit_exhausted`（帶`daily_cap:true`），不洩漏上游原文；狀態碼與原因照舊寫進Workers Logs與failures計次。新增`isCreditExhaustedError()`。
- `index.html`：`isDailyCapResponse()`同時認`credit_exhausted`，沿用每日上限的暫停流程；新增`capIsCredit`，這種情況的跳窗、輸入列小字、開場回合訊息、章節與回顧的錯誤字都不提「午夜」，改「稍後恢復」。
- 設計文件10.9.3.1補一條【待使用者確認】。新增`tests/test-95-credit-exhausted.mjs`（6項通過）；test-59、60、79、84、56單支通過；全套未跑。

- 餘額用完通知信：`worker.js`在餘額用完時把失敗類型記為`credit_exhausted`，`gate.js`計數器當天設`creditOut`並照既有通知機制（每天一封、寄失敗最多重試3次、午夜重算）交給`mail.js`新增的`creditOut`信件（主旨「人生草稿：Anthropic 餘額用完了」，寫明玩家看到什麼與去哪儲值）。`test-95`擴為9項通過、test-59通過；全套未跑。需部署Worker。

- 後台新增「回本估算」分頁（`worker/dashboard.js`，純前端算術、不改任何設定、不影響玩家）：帶入近7天實測（每位新玩家平均回合、每回合成本含重試、玩家數、隔天回來比例、AI餘額），可改假設（明天新玩家數、緩衝、購買比例、點數包），算出明天預估花費、建議再儲值金額、三種點數包每包盈虧（點數包價格依10.9.9.3、手續費暫用3%）、回收已花的錢要賣幾包、明天購買收入對照。新增`tests/test-96-breakeven-page.mjs`（9項通過）；test-92、94單支通過；全套未跑。需部署Worker。

## 2026-10-10 發佈：版本2026.10.10-j

- 內容：後台自由書寫比例等、重寫統計修正與舊分頁新版本提醒、重寫原因分類圖表（補回）、每回合花費卡片；test-15修正。細節見下面各條。
- 玩家畫面：多一個舊分頁新版本小提示，其餘沒有變化；舊存檔照常可玩。
- 需部署Worker（`cd worker && npx wrangler deploy`或由GitHub自動建置）。

## 2026-10-10 合併雲端兩分支＋補回重寫原因分類圖表

- 合併`claude/clever-brahmagupta-dh1wpk`（自由書寫比例等）與`claude/practical-euler-udk0dz`（重寫統計修正）；worker四處重疊手動解開，兩邊欄位（`fi`、`rk`、`pv`）都保留。
- 新版重寫區補回「重寫原因分類（前五名）」圖表與最常見原文：`rewriteBlock()`多回傳`cats`（一筆重寫只算一類，例句取原因白話），`dashboard.js`加`catsBlock()`。`test-93`新增C1、C2。
- 後台新增「每回合花費」卡片（花了多少錢區）：全部／單一人生第1～100回合／第101回合以後，各列含重寫平均、不含重寫平均、重寫多花（元與幾成）、每次重寫平均，樣本少於30回合標註；也寫進「下載重寫狀況」。`play-stats.js`的`summary.turn_cost`，`test-93`新增D1～D3。只支援今天／昨天／近7天。後續細分：「重試」拆成自動重寫／連線重試／再試一次／未分類，各列次數與每次平均（卡片下半「重試拆開看」，下載檔也有）；`test-93`加D4。
- `test-15`：檢查投入度不外露前先去掉期中考分數（分數隨機，擲到55會誤判）。
- 尚未跑全套、尚未改版本號、尚未推上線。

## 2026-10-10 後台：自由書寫比例、離開停在哪每10回合、瀏覽平均分攤、重寫區塊可捲動、名冊摘要

- **開發部**（`worker/`有改，要部署）：
  - **自由書寫比例**：前端每回合送出時帶`input_source`（`choice`／`free`，只有標記、不含內容，開場不帶）→ `worker.js`的`turnNoteMeta`只收這兩個值 → `gate.js`逐筆明細的一般回合第一筆記`fi`（重試不重複算）→ `play-stats.js`算自己寫回合比例、有自己寫過的人生比例 → 網頁新增「自己寫的比例」區塊（今天／昨天／近7天；近30天只提示看不到明細）。10/10改版之前的回合沒有標記，不算進分母。
  - **離開時停在第幾回合**：`STOP_BUCKETS`改成只有開場、第2、3～4、5～9，之後每10回合一格到第100回合以上；尾端沒有人的格子截掉（前4格固定，白話說明要讀前兩格）；卡片改可捲動。
  - **今天每小時瀏覽**：每小時紀錄開始前的瀏覽合計（原本一根「前」大柱子），改為平均分攤到第一筆紀錄之前的各小時，畫成淺色估計柱並加說明（不是實際每小時數字）；沒有「前面的空小時」可分攤時維持原本的「前」。
  - **重寫區塊**：重寫原因分類、重寫原因表、離開時停在哪都改成固定高度可捲動。
  - **名冊**：上方新增摘要——綁信箱人數、有玩過人數、平均回合數（只算有玩過的與全部兩種）、回合數中位數／最多、有留信箱候補人數與各狀態人數。
- `index.html`只多送一個欄位`input_source`，玩家畫面沒有變化。
- 問答記錄（不改程式）：「每50或100回合不用快取、重新抓全部資料」——後台資料本來就每次讀取都是即時現算（`no-store`），沒有快取；遊戲送給AI的提示快取（Anthropic prompt caching，5分鐘就過期）只影響費用與速度，不影響AI看到的內容，所以定期關掉快取不會減少失誤，只會多花錢。
- **測試**：新增`tests/test-94-dashboard-extras.mjs`（14項）。

## 2026-10-10 日記記下「點選項／自由輸入」＋推估腳本

- **開發部**：`index.html`日記每則新增`inputSource`（`choice`／`free`，開場回合沒有行動不帶）；管理端可讀文字（`worker/save-admin.js`）在行動後面帶〔選項〕／〔自由輸入〕。舊日記沒有這欄，所以舊局的自由書寫比例只能推估。這是日記欄位新增，舊存檔照常能讀，不用清空重來；每則多幾個字元（上傳時gzip壓縮）。
- **推估腳本**：`qa/estimate-free-text.mjs`（唯讀，只輸出統計數字，不輸出日記內容）：用現在畫面上的選項長度當已知樣本，推估舊日記的自由輸入比例範圍；有標記的新回合直接精確計數。要自己帶管理密碼在本機跑。
- 儀表板上的「自由書寫比例」卡片還沒做（要動`worker/`統計與部署，待使用者決定）。
- **測試**：新增`tests/test-93-input-source.mjs`（5項）。

## 2026-10-10 重寫統計修正、版本提醒、除夕放寬（獨立資料夾處理，尚未發佈、尚未改版本號）

- 依claude.ai網頁版同日定案（5題＋摘要）。設計文件：十、新增10.14.7.2／10.14.7.3／10.13.7.14.1／10.17.12；一、1.2.9.18.1、.2、.6、.8；十八、18.10.7補一句；`00-總覽.md`日誌一行與目錄。
- Worker：前端每次回合呼叫帶`retry_kind`（重寫／連線／再試，第一次不帶）與`app_version`（回合、開場、章節、放置摘要、回顧這一生都帶）；明細列多`rk`、`v`；每天各種重試次數另存`rk:日期`（永久），`rw_since`＝新算法起算日。同一回合第二次以後沒帶種類＝未分類（判斷方式不變，看最近明細有沒有同一個turn_nonce）。回應`lifegame.worker_version`＝目前Worker版本。
- 重寫比例只算自動重寫：`play-stats.js`新增`rewriteBlock()`，重寫原因只認代碼（整句舊原因整句歸「改版前格式」，不用「、」切開），「佔重寫」分母＝自動重寫總次數；`/stats-play`回傳`rewrite.all`與`rewrite.latest`（頁面版本＝目前Worker版本）。移除`ai_usage.regen_today`與`retry_cats`／`retry_reasons`。
- CSV（新欄位一律接在最後，原有欄位順序不動，既有測試的欄位位置不衝突）：逐筆明細加`retry_kind,page_version`；每小時總表加`連線重試,再試一次,未分類`（「重寫」只算自動重寫）；每日總表加`連線重試,再試一次`，新算法起算日起重寫次數／比例改用新算法，之前保留原數字。`/stats-daily`帶`rw_since`。
- 數據網頁：重寫那一節併入原「今天的自動重寫」，加「全部／只看最新版」切換（預設全部）、次數表、原因前5名（白話＋佔重寫）、上回合紀錄前5名、每小時／每天明細表；下載重寫狀況註明範圍；長期趨勢重寫比例加「從某日起只算自動重寫」小字。近30天不適用「只看最新版」。
- 前端：重試種類在`takeTurn`標記（再試／連線／重寫）；舊分頁新版本提醒（`checkUpdateNotice()`，回合套用並存檔後才出現，示範模式與本機存檔失敗時不顯示，按×後同一分頁不再出現，版本比較`appVersionNewer()`）；除夕／大年初N依離範圍多遠分類（`FESTIVAL_NEAR_DAYS=14`，14天內第3類「節日附近」，超過第1類「節日」，年份取前一年、當年、下一年最近者）。重寫後挑版本邏輯不變，只把註解改為定案。
- 測試：新增`test-93-rewrite-stats.mjs`（30項）；更新test-66／88／90／92。未改遊戲狀態結構，不需要清空舊存檔。
- 實作前確認的三件事：①CSV欄位順序——新欄位接在最後，無衝突（每小時總表表頭字串的測試因新增三欄已更新）；②Worker版本號放在`lifegame.worker_version`，只多一個欄位，行動點、錢包、遙測讀法不變；③開場有turn_nonce（重試會正確分類），章節／放置摘要／回顧這一生沒有turn_nonce，不會被誤算成未分類（test-93 U1）。

## 2026-10-10 發佈：版本2026.10.10-i

- 收-h之後8個commit：後台數據網頁整理(a18b5e2、8a9f389、3b6b37f、9499dbc、ef7dffa)、上線規則改寫與run-all.mjs新選項(212aee7)、4支測試修正(93455eb、d34c003)。`index.html`只換版本號與更新說明，`WORKER_VERSION`同步。玩家畫面沒有變化。
- 發佈前全套時`test-44-relationship`隨機失敗(約1/6)：測試角色「小雨」「阿凱」偶爾跟開局隨機產生的家人撞名，按名字找到別人。改用名字庫沒有的「芷瑄」「劭謙」，連跑48次全過。程式沒有壞。

## 2026-10-10 測試部：修正4支太脆的測試（分支test-speedup）

- `test-89-housing`：舊存檔住處重設那項，排除關係寫「不同住」的家人(父母離異時那一位本來就不掛回，`migrateHousing`)；修正前48次失敗5次，修正後連跑48次全過。
- `test-45-focus-events`：8.12.1情況二那一回合暫停8.8.2自然興趣種子(約8%擲中時程式改用自己抽的類別，是設計行為)；修正前48次失敗3次，修正後連跑60次全過。
- `test-66-stats-dashboard`、`test-71-usage-detail`：CSV改成依欄位名稱找位置，不寫死欄位順序與整行表頭。
- 刻意不改：test-31、test-60、test-56逐字比對畫面文字，用途是確保文案與定案一致。
- 驗證：全套96檔通過(299秒)，`--verify`免重跑。遊戲程式沒有改。

## 2026-10-10 測試部：run-all.mjs 縮短重跑時間（分支test-speedup）

- `tests/run-all.mjs`新增：`--failed`（只重跑上次未通過的檔，清單`tests/.last-failed`）、`--bail`（第一支失敗就不開新的，正在跑的跑完結束，不做最後的單獨重跑）、`--verify`（不跑測試，比對輸入檔雜湊與上次全套通過時是否相同）、`--history`（每支測試的失敗次數與最近日期，紀錄`tests/.fail-history`，「平行時失敗、單獨重跑通過」另外計）；每次跑完印最慢10支。
- 通過戳記`tests/.last-pass`：只有不加選項的全套、全部通過、而且跑的期間輸入檔沒被改動才寫。輸入檔＝`index.html`、`lunar.min.js`、`og.png`、三個說明頁、`build-pages.sh`、`DEPLOY.md`、`CLAUDE.md`、設計文件10與16章、`worker/`、`tests/`（排除node_modules與三個紀錄檔）、`比對紀錄_模型比較/_work/records/`，加Node與jsdom版本；新增測試讀到別的檔要加進清單。三個紀錄檔加進`.gitignore`。
- 不加選項時跑測試的方式不變；只多了跑完寫紀錄檔、印最慢10支、全過時寫戳記。
- 決定：快速通道是戳記規則的例外；純文件隨時可推；CHANGELOG平常照記、發佈時整理（共同基準、WORKFLOW、CLAUDE同步）。

## 2026-10-10 整理：上線規則改寫、兩份流程圖（分支test-speedup，純文件）

- `協作流程說明-共同基準.md`「測試期自動上線規則」依使用者定案改寫成六條：全套測試每份要上線的內容通過一次（以通過戳記`--verify`判斷）、commit勤push少（含快速通道：只跑`54`加`--quick`）、版本號與更新說明只在推之前改一次、失敗先分類、版本以發佈為單位（一天2～3次，時間由使用者決定）、緊急件可單獨上線；版本記錄加一行。`WORKFLOW.md`第4節步驟7與「測試沒過時的重跑順序」、`CLAUDE.md`git與測試兩條、`DEPLOY.md`發佈步驟與紀錄表（一個版本一行、註明含幾個commit）同步。
- `qa/送出到回合結束_流程圖.md`現況版依10.17與1.2.9.18(10/10)實作後重寫，行號重新grep，舊圖「不確定的地方」4項逐項結論；設計版不動。
- 新增`qa/開發與測試流程圖.md`：圖A現在的流程（含迴圈2真正原因的查證）、圖B建議流程、圖C發佈到上線、三份文件落差、慢的來源（8GB電腦實測全套96檔305秒、`--quick`94檔162秒）。
- 驗證：`--quick`全部通過（見回報）。`--verify`、`--failed`、`--history`等工具在第二部分實作。

---


## 2026-10-10 開發部：數據網頁改成報告式版面（十、10.13.7.14；尚未上線，版本號上線前再換）

- `worker/dashboard.js`整頁重寫：分頁「報表／長期趨勢／名冊」。報表最上方固定「名額與人流（即時）」(今天每小時瀏覽與開局、名額與候補表、調整名額的後台設定值說明)；下面可切今天／昨天／近7天／近30天：程式套句型的結論句、「需要注意」(要處理／留意／正常，門檻寫在頁面常數)、重點數字兩排三格、六個問題小節(每張圖附白話)、AI花費明細表、下載三個檔案、數字怎麼算。近30天的漏斗與花費改用每日總表，明細才有的項目顯示「只看得到每日總數」。長期趨勢：從第一天起的折線(瀏覽／開局人生／回合／花費／重寫比例)與每日總表。
- `worker/play-stats.js`：`computePlayStats`加`yesterday`範圍、前一天比較(`prev`)、到第3／20回合、每條人生與到第10回合人生的平均花費、快取比例、一次遊玩時長、兩回合間隔、AI等待(一般／開場／重寫)、隔天回來、重寫原因白話(`REGEN_REASON_LABELS`)；新增`dailyExtrasFromRows`、`hourlyFromRows`。
- `worker/gate.js`(UsageCounter)：瀏覽人次另記每小時(`ph:`)；新增`hours`、`dextra`、`rollup`；`rollup`把明細彙整成每小時(`hr:`)與每日新欄位(`dx:`，只重算最近6天)並記今天的名額／候補／餘額快照，刪掉超過90天的每小時資料。
- `worker/worker.js`：`/stats-play`接受`range=yesterday`並附瀏覽人次；新增`GET /stats-daily`、`GET /hourly.csv`；`/daily.csv`加寬(開局人生、玩到第3／10／20回合、重寫、重寫比例、AI平均等待、名額、候補、綁信箱新增、估計餘額，接在原本六欄後面、呼叫次數前面)；每小時排程加`runStatsRollup`；名額摘要加後台設定值、今天新增候補、通知後入場、通知超過一天。`worker/account.js`：`player_stats`回傳`bound_by_date`；`entry_stats`回傳上述候補數字。
- 測試：新增test-92(23＋8項，含jsdom實際打開網頁切每個範圍與長期趨勢)；test-66更新兩項(每日總表表頭、網頁字樣)。新欄位與每小時瀏覽從上線當天起才有，之前的日子空白。不改遊戲狀態結構，舊存檔不受影響。

## 2026-10-10 開發部：下載全部資料、逐筆明細上限30,000筆、總覽卡片兩排（十、10.13.7.13、10.14.7；版本2026.10.10-g）

- `worker/worker.js`新增`GET /daily.csv`每日總表(從第一天起，含BOM與中文檔名)；`worker/gate.js` `USAGE_DETAIL_MAX_ROWS` 5,000→30,000。
- `worker/dashboard.js`：上方〔下載全部資料〕依序下載每日總表與逐筆明細，取代AI區塊的下載按鈕；總覽卡片第一排免費／活躍／瀏覽，第二排綁定與人生段數。
- 測試：test-66加4項(/daily.csv密碼、表頭、數字、BOM與檔名)。順手修正四個測試檔永遠回報成功的問題(test-70、71、73、74改成照結果回報)，並更新兩項過時檢查(test-70工具必填欄位多了`action_result`、test-71逐筆明細CSV多三欄)——這兩項在線上版本就已經不通過，只是被吞掉。

## 2026-10-10 開發部：數據網頁分成三頁、新增「玩家怎麼玩」（十、10.13.7.12；版本2026.10.10-g）

- 新增`worker/play-stats.js`：`computePlayStats(rows, now, range)`從AI逐筆明細(`urows`)算重點數字、進場漏斗、每關繼續比例、離開停在哪裡、每時段表、花費結構、重寫原因前5名。`worker/worker.js`新增`GET /stats-play?range=today|7d`(兩組管理密碼皆可，不存資料、不碰KV)。
- `worker/dashboard.js`：分頁改成總覽／玩家怎麼玩／名冊；總覽把「總耗費」「每回合平均花費」併進「AI 花費」(台幣大字、美元小字)，綁定信箱人數、開啟人生段數、沒綁信箱的人生段數移到玩家那一列並加說明，付費玩家累計0時不顯示；「今天的自動重寫」移到玩家怎麼玩。玩家怎麼玩只在打開該頁時才抓，可切今天／近7天，自己畫直條圖(滑過看數字)。
- 驗證：用10/10 13:03真實逐筆明細在本機算，今天122條人生、玩到第10回合35條、重寫比例58%，與封測人流報告一致；jsdom模擬打開三頁沒有錯誤。test-66加7項(/stats-play密碼、範圍、匿名、computePlayStats各項)，網頁字樣檢查改新標題。

## 2026-10-10 開發部：數據網頁名冊加「回合數」＋綁信箱人生對應修正（十、10.15.6、10.13.7.11；版本2026.10.10-g）

- `index.html`：四處雲端上傳的存檔摘要(meta)加`turns: turnCount`。
- `worker/save-admin.js`：存檔索引記`turns`；`/admin/dashboard-roster`每個帳號加`turns`＝名下人生(lives＋everLids)最後一次存檔的回合數加總。`worker/location-migrate.js`重建索引時同樣帶`turns`。`worker/dashboard.js`名冊表格加「回合數」欄。
- 修正：回合請求的`life_id`是存檔的`s.lifeId`，帳號裡登記的是`s.acct.lid`，兩者不同，`opPlayerStats`把綁了信箱的人生仍算成未綁。`worker/account.js` `opWalletPre`把`life_id`記進`everLids`；`opRoster`回傳`ever_lids`。舊的已玩人生要再用帳號出一回合才會對上。
- 測試：test-66加5項(真實情況兩組代號不同、補記後沒綁信箱段數歸0、名冊回合數取最後一次存檔、沒綁帳號的存檔不算)、網頁有回合數欄；test-75名冊欄位清單加`turns`。
- 舊存檔不需清空。


## 2026-10-10 候補當天補位（十、10.15.4／10.15.11）
- `worker/account.js`：`_entryDay()`拆出`_fillQueue()`，當天名額有空位、候補隊伍有人就立即依序補位（每次名額相關請求與每小時排程都檢查；不超過檢查點剩餘人數；過期收回仍加隔天）。12:00以後分到位子的候補，下一次整點排程就寄通知信（原本`opWlDue`的判斷已涵蓋，不用改）。`WORKER_VERSION`→2026.10.10-g。只動`worker/`，不改遊戲狀態結構。
- 新測試`tests/test-91-waitlist-topup.mjs`：16項通過；全套95檔通過。真實Cloudflare／Resend實際補位與寄信：未測試。

## 2026-10-10 開發部：AI回合自動重新產生降頻（一、1.2.9.18.0～1.2.9.18.8、十、10.14.7.1、10.17.11；版本2026.10.10-f，分支regen-reduce）

- 起因：10/10封測開放日重寫約佔AI呼叫三分之一、花費約30%，主因是10.10-b的正文完整性檢查(18.10.7)太嚴，冒號接台詞也被誤判。
- `index.html`：不合格分三類——`repairTurnText()`程式直接修(標點、冒號、舞台指示、補引號、記錄大括號)；`classifyTurnOutput()`分出第1類(重寫)與第3類(只記錄)；`takeTurn()`把場景日期與品質檢查合併成一次重寫(最多1次，連線失敗重試另計)，`pickTurnVersion()`挑版本、兩版都讀不了就照10.17.7退回回合；約定兩條件判定與`regenTried`；本回合必辦清單`buildMustDoList()`→payload最後的`turn_must_do`；等待畫面重寫時加一行小字；`state.lastTurnNotes`下一回合以`prev_turn_notes`帶給Worker；上游403不重打。
- `worker/prompt.js`：選項統一4個、【寫作規則】E交稿前檢查7條(章節共用規則切掉這段)、冒號接台詞與引號成對、「下週三」寫法、必辦清單說明；工具定義`action_result`必填。
- `worker/worker.js`、`worker/gate.js`：逐筆明細加重寫原因、上回合紀錄、結束原因(CSV三欄)，上游403也記一筆(`403@機房代碼`)，每日依代碼計次(`uq:`)；`/stats-summary`多`regen_today`。`worker/dashboard.js`加「今天的自動重寫」小表。機房代碼在門牌換算前先取。
- 測試：新增`tests/test-90-regen.mjs`(50項)與`tests/replay-regen.mjs`(回放208筆真實紀錄：重寫2.9%)；`harness.mjs`的`integrity:true`改為示範模式也檢查、可模擬`request.cf`；test-41、53、84、88依新分類更新。
- 驗證：見回報。舊存檔不需清空。

---

## 2026-10-10 開發部：開場同意頁第2點措辭（十、10.13.2／10.16.5）

- `index.html`開場同意頁第2點改為「你的選擇與輸入的文字會由 AI 來產生下一段劇情。」；`tests/test-63-consent.mjs`同步。同意版本不調。
- 驗證：見下方測試結果。

---

## 2026-10-10 開發部：名額發完時顯示今日發出的名額數（版本2026.10.10-e，與-d人生之書15.9一起上線）

- `index.html`：`updateHomeEntryLine()`在名額真的發完(`reason==="full"`、剩0)時顯示「今日 N 個名額已全數發出，可留信箱候補」，N取伺服器回報的今日上限；檢查點關閉或有候補排隊時維持原句。`tests/test-76-entry-ui.mjs`對應更新。
- 驗證：本機相關測試(76、54、語法檢查)通過；上線前跑`--quick`。

---

## 2026-10-10 開發部：人生之書改「玩家按了才寫、每章3點」（十五、15.9；版本2026.10.10-d，分支feedback-yeye-150-193）

- 設計文件：`15`新增15.9、舊規則加刪除線；`10`的10.3.13加「人生之書每章3點」、重新打開雲端存檔檢查清單更新；`16`的16.18加玩法與圖例條目；`00-總覽`日誌與目錄。`pricing.html`只寫「每回合1點」、沒有用途清單，故不動。
- `worker/ap.js`：移除每10回合1章額度(`addChapterUnit`、`CHAPTER_TURN_UNITS`)，改`preChapter(holder,wallet,id,today)`(檢查餘額＋同一章每台灣日最多5次)與`chargeChapter`(AI成功才扣3點、同一章`chapterPaid`只扣一次)。
- `worker/account.js`：帳號DO新增`chapter_pre`／`chapter_post`兩個動作；`worker/worker.js`：有KV路徑(`handleChapter`)與帳號錢包路徑(`handleAIProxyNoKV`)都在伺服器扣點、失敗不扣、餘額在生成期間被花掉時不交付；不碰KV又沒登入的路徑點數在玩家瀏覽器，與一般回合相同無法由伺服器驗證。**動到worker，需重新部署（WORKER_VERSION 2026.10.10-d）。**
- `worker/prompt.js`：章節prompt補15.9.8三條(首次出場交代身分、依時間先後與日期、避免重複用詞)，素材多帶每則摘要日期與人物`origin`。
- `index.html`：換階段只新增空白章(`status:"blank"`)；`requestWriteChapter`確認視窗→`generateChapter`(成功才`payForChapter`、章節`paid:true`)；依序寫、點數不足／每日5次按鈕變灰；`remindBlankChapters`在世代傳承前、就此闔卷前提醒一次(可選「現在寫」依序寫完)；`ensureBook`把舊存檔排隊中／失敗／寫到一半的章節轉空白章，沒有`paid`的已寫好章節照舊免費；反悔保留已寫好或正在寫的章節、同階段再收章不重寫(`closeBookDraft`)；`normalizeBookPunct`存檔前統一標點；「玩法與圖例」加人生之書；階段封存包(`stagePackReady`)空白章也一起封存。移除`processBookQueue`／`retryChapter`／`waitForBook`。
- **章節資料結構有變動**：狀態新增`blank`、寫好的章節新增`paid`、空白章保留`items`／`events`；舊存檔相容（缺欄位視為免費、排隊中轉空白章）。
- 測試：重寫`test-6-book.mjs`；新增`test-90-book-wallet.mjs`(帳號錢包路徑)；`test-28`、`test-42`配合調整。
- 第7節調查（葉夜第1世第一章漏掉高三下）：見對話回報，沒有改規則。

## 2026-10-10 開發部：自動重新產生原因寫進Workers Logs（版本2026.10.10-c，與住處選擇同版）
- 起因：AI用量明細CSV顯示10/9晚與10/10早「失敗重試／重新生成」約25%（同一個turn_nonce第2次以後的呼叫都算，不一定是出錯）；要查是哪一項檢查（場景日期、正文完整性、簡體字等）擋下最多。
- `index.html`：自動重新產生時帶`regen_reason`（短字串，最多60字：「場景日期違規」或品質檢查原因）；`worker/worker.js`兩條路徑（KV、帳號錢包）收到就`console.log`「自動重新產生原因：…（第N回合）」，不含人生代號與劇情內容。不影響規則與存檔。
- 人生之書付費章節（十五、15.9）本機另有未完成的修改，這次**刻意不上線**。

---

## 2026-10-10 開發部：大學住處選擇實作（版本2026.10.10-c，分支feedback-yeye-150-193）
- 依：設計文件九、9.11（claude.ai網頁版定案、使用者確認），連動1.2.22、2.6、3.4.10、4.1.2、5.5.5、7.5.1、7.6.1.1。**遊戲狀態新增欄位（見9.11.9），依定案舊存檔不需清空。**
- `index.html`：新增住處區塊（`housingTypeOf`／`detectHousingIntent`／`housingChoiceDue`／`applyHousingNext`／`applyHousingType`／`ensureRoommate`／`queueGraduationHousing`／`renderHousingChoiceModal`／`migrateHousing`）；學生期基本需求依住處25／28／30；高三選完科系後先選住處、9月生效；宿舍建室友；搬出解除原生家庭同住、搬回掛回；不住家裡自動改自己打理並反灰家裡包辦；租屋算搬出家裡；畢業／肄業跳住處彈窗；學生時期不採用旁白`housing_choice`；舊存檔開學第一回合補跳、被舊回報改成租屋的學生存檔載入時重設。
- `worker/prompt.js`：【房屋里程碑】刪「外縣市／出國分支」並補學生時期不回報`housing_choice`；住處條補不得寫回家裡日常、不另生室友。**動到worker，需重新部署（WORKER_VERSION 2026.10.10-c），未推送。**
- 測試：新增`tests/test-89-housing.mjs`；`harness.mjs`加自動選住家裡（`__housingManual`可關）。全套結果見回報。

---

## 2026-10-10 開發部：葉夜第1世第150～193回合回饋實作（版本2026.10.10-b，分支feedback-yeye-150-193）
- 依：設計文件九、9.10、八、8.8.5、十八、18.10.7／18.13、一、1.2.21／1.2.22與交接文件第三節（A～F）。**遊戲狀態新增欄位`tryNewCont`；依定案舊存檔不需清空。**
- 九、9.10：`index.html`新增`majorSelectionDue()`（高三下學期、日期到5月、還沒選系，放暑假或跳過指令跨過5月也算）；`takeTurnInner`在呼叫AI前`askMajorSelectionFirst()`先彈選科系（標題「○歲・選填志願」）；`advanceStageYear`進大一時已選過系就不再跳（學生證入學年齡改為實際年齡），沒選過才補跳；高中畢業事件改在高三下學期期末考那一回合送出；暑假標籤「準大一・暑假」（`highSchoolYearLabel`）；給旁白的`university_status`以主修系名為主、5～9月帶`admitted`；雙主修選「申請」後自己選系（`renderMajorSelectionModal({mode:"dual"})`，不能選主修同系與5年制系別）。
- 八、8.8.5：`tryNewContinuation()`／`recordTryNewContact()`，按鈕小字「繼續試試：○○」；旁白回報`player_named`＋`item`時以玩家為準、種子作廢；payload加`known_interests`。
- 十八、18.10.7與第三節A～C：新增`detectNarrativeIntegrity()`（回應段／新場景缺漏與過短、沒寫到玩家動作、舞台指示、選項不足4個、星期與日期對不上、大年初N、考前倒數、約定到期沒交代、旁白評論自己用字→走1.2.9.18重新產生；兩段重複、倒回只記`narrative_integrity_advisory`）；`worker/prompt.js`補對話講完、約500字、不發明病症、不改住處、不忘約定等規則，新增`health_reason`欄位（健康下降時顯示「健康 -2（感冒）」）；payload加`residence`；名冊標「（同住）」。
- D1：`worker/s2t.js`新增`FORCE_SIMPLIFIED`（Big5字集其實收了「气么机确赶」等簡體字，原判斷漏轉）與「手里／这里」等詞彙對照。D2：`fixHalfWidthPunct()`，中文字後的半形逗號轉全形。
- B6：回合標題月份改以新場景日期為準。E2：玩家剛決定的學生期花費，AI另外回報的同類支出不入帳。F2：下載檔附錄標題改為「有開測試工具時記錄的回合」。
- 查明不改程式：E3（社交表演24回合沒有案子）＝8.13設計如此，學生時期只有重心選到那張副業卡的回合才擲詢問；B3（連停大年初二）＝程式的日期本來就往後走，是旁白自己寫錯，已加大年初N檢查；E1＝2026.10.09-l已有「沒寫到就重寫」。
- 測試：新增`tests/test-88-yeye-150-193.mjs`（85項）；`harness.mjs`自動按選科系、完整性檢查預設關（`loadGame({integrity:true})`開）；改`test-33`（標題）、`test-82`（連點延續）。全套結果見回報。

## 2026-10-10 開發部／整理：清理雲端測試存檔、第一次雲端存檔提早、數據網頁加一格（版本2026.10.10-a）
- 整理（使用者同意）：用管理端`POST /admin/save/delete`刪除5筆舊格式測試存檔(勞爾、尤力、小豬、容×2，皆15歲；who＝Claude Code，已寫存取紀錄)；保留葉夜(第1世)與3段已綁信箱的人生。
- `index.html`：10.13.3新增`AUTO_SAVE_FIRST_MS`(1分鐘)——這段人生還沒成功存過雲端(`lastAutoCloudAt`沒有值)時，`autoSaveDue()`的門檻用1分鐘，之後照舊10分鐘。
- `worker/account.js`、`worker/worker.js`、`worker/dashboard.js`：10.13.7.11新增`lives_unbound`(從沒綁進任何帳號的人生代號數，今天／近7天／累計)，數據網頁加一格「沒綁信箱的人生段數」。
- 發現：沒綁信箱的人生存到雲端時，存檔索引不帶人生代號(`lid`只在帳號人生才送)，所以管理端存檔清單上這類存檔只顯示`code`，不容易跟數據總覽對上。本次未改，記下待決定。
- `tests/test-83-job-table.mjs`修偶發失敗：開局抽到「隔代教養」時沒有父母卡，家長職業那幾項找不到人而當掉(約3次1次)；改成重抽到有父母卡的開局再測。遊戲本身沒問題。連跑30次全過。
- 測試：test-64(第一次1分鐘、存過後1分鐘不夠)、test-66(lives_unbound累計1／今天0／近7天1)、test-54；全套見下。

## 2026-10-09 開發部：AI呼叫失敗原因寫進紀錄（版本2026.10.09-n）
- 起因：10/9後台「今日名額」用了6個、「開啟人生段數」今天只有1；線上數據顯示今天只有1個開場成功，且AI呼叫114次中28次失敗(沒有回報用量)，中繼站沒有留下失敗原因。
- `worker/worker.js`：`callAnthropic()`收到非200時讀錯誤內容，`console.warn`一行「AI呼叫失敗：狀態碼、錯誤類型、訊息(前300字)、呼叫類型／開場／回合／耗時」(不含人生代號與玩家內容)；連線錯誤同樣寫一行。`/usage-today`多`failures`欄位(今天依錯誤類型計次，例`529:overloaded_error`、`network`)。
- `worker/gate.js`：`countAICall()`多一個失敗類型參數，計數器當天的`fails`分類加1(跨日歸零)。
- `worker/wrangler.toml`：加`[observability] enabled = true`，部署時才不會把後台打開的Workers Logs蓋掉。
- 驗證：`tests/test-79-spend-actual.mjs`加5項(失敗計次、紀錄內容、不含玩家內容、沒失敗時為空、toml有開)；全套見回報。

## 2026-10-09 開發部：「不扣行動點」測試開關擴及帳號錢包（版本2026.10.09-m）
- 依設計文件10.3.12（2026-10-09使用者同意）：原本登入帳號用帳號錢包玩時，開關一律無效、選單也沒提示。
- `worker/worker.js`：新增`apTestAccounts(env)`讀secret `AP_TEST_ACCOUNTS`(逗號分隔信箱)；錢包路徑的`wallet_pre`在前端送`ap_test_free`時一併轉名單，回應帶`lifegame.ap_test_free`。`worker/account.js`：`opWalletPre`帳號信箱在名單上就不預扣、不記nonce(`wallet_post`找不到預扣紀錄就不動錢包)。
- `index.html`：新增`apTestFreeServerDecides()`(雲端打開或真實模式帳號錢包＝伺服器決定)；`apTestFreeRefused`只依有回報`ap_test_free`欄位的回應更新；測試選單在帳號錢包被拒時顯示「這個帳號不是測試帳號，開關無效（照常扣點）」。
- 新增`tests/test-87-ap-test-account.mjs`(10/10通過)。上線前要在Cloudflare設`AP_TEST_ACCOUNTS`。

## 2026-10-09 開發部：版本號連點5下打開測試選單（版本2026.10.09-m）
- 起因：從手機桌面圖示打開的遊戲沒有網址列，不能加`?dev=1`；iPhone桌面圖示的資料又跟Safari分開，Safari開了也看不到桌面圖示那邊的成本紀錄。
- `index.html`：首頁底部版本號(`#home-ver`)、遊戲中「更新紀錄」裡的版本行(`#updates-ver`)標`data-dev-tap`，連點5下(每下間隔1.5秒內)＝寫入`DEV_TOOLS_KEY`，效果同`?dev=1`；文字改為「已打開測試選單」並重畫(遊戲中保留輸入框的字，AI寫作中不重畫)。關閉照舊用`?dev=0`或測試選單。更新紀錄只寫一句籠統說明，不對玩家公開這個開關。
- `tests/test-38`補5條(點4下不開、第5下打開、首頁出現🧪、間隔過長重新計算)，41/41通過；`worker/worker.js`的`WORKER_VERSION`同步換版號(Worker程式沒改)。全套89檔通過。
## 2026-10-09（整理）掃描紀錄與日誌更正
- `CLAUDE.md`「上次掃描記錄」補上2026-10-09設計文件一致性檢查，並註明10/4以後的定案以提交紀錄與全套測試為準、未逐條比對程式碼（使用者同意）。
- `00-總覽.md`日誌8.8.4那行：「尚未定案，程式未動」更正為程式已實作（版本2026.10.09-k）。純文件改動。

## 2026-10-09（整理）測試啟動檔防卡住
- `tests/run-all.mjs`：同時數依記憶體自動決定(8GB機器=2個，`JOBS=n`可覆蓋)；單檔逾時強制結束並標「逾時」(一般300秒、長程模擬900秒，`TEST_TIMEOUT=秒`可覆蓋)；每30秒印進度(完成幾個、正在跑哪些)。
- `tests/test-84-turn-flow.mjs`：C6、C9改為等條件成立再判定，避免同時跑時偶發失敗。
- 驗證：全套89檔通過(254秒)。

## 2026-10-09 開發部：學生期花費事件觸發條件（版本2026.10.09-l，只在beta分支預覽，未上正式）

- 依設計文件17.3.6.9（2026-10-09使用者確認）：`prepareStudentExpense`每種事件加前因——朋友小聚／小禮物要好感≥40的朋友；出遊要寒暑假＋好感≥50同行朋友；演唱會要好感≥40朋友或表演類興趣卡；社團活動要有社團參與度；手機或電腦升級、電腦壞了要距上次升級≥40回合（新欄位`studentExpense.lastGadgetTurn`）；考駕照限寒暑假；「補習班費用」改名「補習或參考書費用」（最近6回合讀書≥3＋準備期，新欄位`focusKeyLog`，進快照清單）；學費差額只在開學初第0回合；沒有合格事件就不提出。彈窗情境句、提示詞、「寫了才算數」字眼同步調整。
- `tests/test-86`補18條觸發條件檢查（94/94通過）。驗收模擬（17.3.6.8）重跑結果見回報。真實AI未測。

## 2026-10-09 開發部：興趣每個項目各自成卡（版本2026.10.09-k，只在beta分支預覽，未上正式）

- 依設計文件8.8.4（2026-10-09使用者確認）：
  - `index.html`：興趣卡身分＝類別＋項目。`findInterestCard(s,category,item)`、新增`resolveInterestCardForEvent`（指定`cardId`＞程式種子項目＞AI回報且在8.8.1清單內的項目＞該類別最近投入的卡）；`applyInterestEvent`依此找卡或開新卡（新卡id撞號加`b`）；種子`rollInterestSeed`不抽已擁有的項目、該類別項目都有就換類別；重心項目帶`interestCardId`／`interestLabel`／`gigLabel`，重心投入改用`cardId`記到指定卡；重心按鈕、選單、工作選單、副業彈窗、興趣等級變動通知、興趣面板一行、人生重開丹（類別去重）、訂單簿payload與`order_new`對照（`sideGigCardByName`：先對「類別・項目」，再退回類別第一張）都改顯示「類別・項目」；`turn_focus`新增`interest_item`。
  - `worker/prompt.js`：`order_new.category`改照抄「類別・項目」；興趣段加「同類別可有多張卡，interest_event要回報item」。**尚未部署Worker**。
  - 存檔：卡片欄位沒有新增；舊卡沒有`item`視為「該類別・未指定項目」繼續用，不需清空存檔。
  - `tests/test-82`改「同類別再接觸其他項目」為新卡，補14條8.8.4檢查；`test-86`等待彈窗改為最長30秒（平行跑時不會誤判）。
- 驗證：全套89檔通過；真實AI未測。
- 另：設計文件17.3.6.9（學生期花費事件觸發條件）已草擬，待使用者確認，程式未動。

## 2026-10-09 開發部：學生期花費改「先選完再寫」＋「寫了才算數」檢查（版本2026.10.09-j，只在beta分支預覽，未上正式）

- 依設計文件17.3.6.1／17.3.6.4／17.3.6.5／17.3.6.6、8.8.2（2026-10-09使用者同意）；起因：葉夜第1世第131～135回合，補習費出一半與正文對不上、換手機正文沒提、指定的新興趣（影像剪輯、代購）正文沒寫。
  - `index.html`：花費彈窗改在`takeTurnInner`呼叫AI之前跳出（`askStudentExpenseFirst`），選完才記次數、扣款、留下`resultNow`給**同一回合**的旁白；彈窗內文最前面加一句程式組的情境（`studentExpenseSceneLine`）；payload移除`student_expense_scene`；`commitStudentExpense`改為舊流程相容用、回合成功後不再呼叫。新增`detectMissingRequiredMentions`，花了的事與指定興趣項目沒寫進正文就走1.2.9.18自動重寫（示範模式不檢查）。
  - `worker/prompt.js`：(7)花費改寫成「結果已定、寫進同一回合、choices依結果」；重心段加興趣項目一定要寫進正文。**尚未部署Worker**。
  - `tests/`：`harness.mjs`加彈窗自動按〔不花〕（`win.__sxManual`可關）；`test-86`改成新流程並補「AI失敗還原」「寫了才算數」；`sim-student-savings.mjs`改在回合進行中決定。
- 沒做（設計文件也寫了）：重新整理頁面時保留玩家剛打的行動文字——目前重新整理等於這一回合沒送出，需重新選一次（點數不會扣）。
- 存檔：沒有新增欄位，舊存檔不需清空。

## 2026-10-09 整理：CLAUDE.md新增「這個遊戲的目的與底線」、遊戲正文去AI味（進行中）

- `CLAUDE.md`在開頭介紹與「檔案結構」之間新增6條「目的與底線」；`協作流程說明-共同基準.md`的根目錄檔案結構描述與版本記錄同步補上。純文件改動。
- `worker/prompt.js`：把會被撰稿人學進正文的「接住」等說法換掉（自傷安全規則兩處只換字、意思不變；人際衝突線三處；emotional_tone一處）。尚未部署Worker。
- 驗證：`--quick`見回報。

## 2026-10-09 開發部：副業與打工報酬調整、驗收重跑（版本2026.10.09-i，只在beta分支預覽，未上正式）

- 依設計文件8.13.3、8.11.2、3.4.2、3.4.10、17.3.6.8（2026-10-09驗收未通過後的報酬調整）：
  - `index.html`：`ORDER_SPEC`報酬基準35／70／140→18／35／70；訂單登記時記下`base`（新增訂單欄位），`orderReward`用`o.base`，舊存檔沒有`base`的訂單沿用`ORDER_BASE_LEGACY`(35／70／140)，進行中訂單不重算。`PART_TIME_SHARES` 2→1（只影響學生期；待業、半退休、出社會後打工的時薪算法不變）。打工入帳（學生期與出社會後）也記進`sideIncomeLog`（欄位名沿用，內容改為副業＋打工的工作收入紀錄，新增`workIncomeAbs`），`computeSideBusinessIncome`＝近3個月工作收入平均。月結算的收入仍不加平均、`computeBasicLivingCost`不變。版本`2026.10.09-i`＋`RELEASE_NOTES`（不含數字）。
  - `tests/`：`test-21`、`test-41`、`test-47`改新數字；`test-47`補「進行中訂單不重算」「等級乘數報酬」；`test-86`補打工份數與打工進平均；`tests/sim-student-savings.mjs`新增「全力打工」玩法（參數 `gig`／`part`／`both`）。
- 驗收重跑：小康全力副業22歲存款平均1,646、全力打工900，都≤3,000，**通過**（報告`qa/學生期存款驗收模擬_2026-10-09_重跑.md`；清寒全力打工約133，只回報）。
- 沒動`worker/`（只換`WORKER_VERSION`）。新增存檔內容：訂單物件多一個可省略的`base`欄位，舊存檔不需要清空。

## 2026-10-09 開發部：學生期自付大額花費、副業收入進生活開銷、三餐提示（版本2026.10.09-h，只在beta分支預覽，未上正式）

- 依設計文件17.3.6、3.4.10（2026-10-09）、5.5.4.1：
  - `index.html`：新增`prepareStudentExpense`／`commitStudentExpense`／`resolveStudentExpense`／`renderStudentExpenseModal`（狀態欄位`studentExpense`：上一件朋友的回合、學期想要的大件件數、學年家裡出不起件數、考駕照旗標、`pending`、`resultNow`）。回合開始前只擲骰不改狀態，`applyResult`成功後才記帳並排定彈窗；彈窗不佔回合、不扣行動點，重新整理後會再跳出；同回合結算出別的彈窗就不排、下一回合旁白帶過（`skipped`）。選「花」用`noteCashEntry`記名稱、朋友小聚／小禮物／約會加好感＋2（同人同階段第二次減半，沿用`giftCounts`）；payload新增`student_expense_scene`（不含金額）與`student_expense_result_now`。
  - 副業收入進生活開銷：`computeSideBusinessIncome`改回傳近3個月（`DAYS_PER_MONTH`×3天）交件入帳總額÷3（新增`sideIncomeLog`，交件時由`advanceOrder`記錄、超過3個月修剪）。**月結算的收入（`householdMonthlyIncome`）不再呼叫它**，避免交件入帳後又重複加；只有`computeBaseLivingCost`與`monthlyBudget`（生活方式小卡、手頭狀態）用平均。`computeBasicLivingCost`不變。
  - 三餐提示：`prepareMealHint`／`commitMealHint`／`mealHintPayload`，狀態`mealHint={arr,lastAbs}`，每3個月（`DAYS_PER_MONTH`×3）排一次，A正文一句帶過／B放進選項各一半，payload欄位`meal_hint_now`。
  - `SNAPSHOT_EXTRA_KEYS`加入`studentExpense`、`sideIncomeLog`、`mealHint`。註解「真實NT$」改為遊戲幣單位。版本`2026.10.09-h`＋`RELEASE_NOTES`。
- `worker/prompt.js`：外表與購物加(7)學生期自付大額花費寫法（寫到猶豫那一刻就停、不寫金額、下一回合依`student_expense_result_now`帶過）；三餐條目後加`meal_hint_now`（建議不是命令）。**上正式時必須重新部署Worker。** `worker/worker.js`只換`WORKER_VERSION`。
- 設計文件：17.3.6、3.4.10補充、5.5.4.1、8.13.3與`CLAUDE.md`的貨幣單位更正、3.4.6加註、00-總覽日誌（已確認）。
- `tests/test-86-student-expense.mjs`（62項）；`tests/sim-student-savings.mjs`（驗收模擬，不打真實API）。驗證結果與驗收數字見QA手冊34.33與`qa/`報告。
- 這次新增存檔欄位（`studentExpense`、`sideIncomeLog`、`mealHint`），預設為空，舊存檔不需要清空。

## 2026-10-09 開發部：頂部三排與首頁排版（版本2026.10.09-g，只在beta分支預覽，未上正式）

- 依設計文件16.3.1、新增16.10.12：頂部改為頭像右邊三排（階段標題＋進度「N/M」小灰字＋雲端膠囊／角色名第N世第N回合／行動點與存款）；原獨佔一排的「進度＋存款」拿掉；`.tb-sub`只剩示範模式／未同步標籤，沒有標籤時整排不佔位。
- 首頁說明文字改三段（每行`white-space:nowrap`，文字內容不變）；三顆按鈕包進`.home-btns`，間距用`--home-btn-gap`(12px)、高度用`--home-btn-h`；雲端那顆字級13px、兩行平均換行；「已登入…登出」移到免註冊小字下方。未登入時「已有帳號？用信箱登入」仍在按鈕組內（文件沒提到，維持原有功能）。
- `wrapHomeText()`：`.home-lead`單組文字也包成`.nb`。`test-52`改檢查新結構。DEPLOY.md記beta預覽那一行。
- 驗證：相關測試與全套跑過（結果見回報）；實機手機寬度排版：未測試。

## 2026-10-09 整理：常見問題與1.2.20改為文件說法一致（不改程式）

- `life-sim-design/01-敘事生成規則.md` 1.2.20「說明」段與上方「未修改」那條，把「與1.2.20不一致」改為「常見問題是給玩家看的簡短說法、不是規則全文，規則以1.2.20為準，不衝突」；常見問題程式與文字不動（使用者確認維持）
- 只動文件；驗證：`--quick`全過

## 2026-10-09 整理：WORKFLOW.md第4節第7步補「測試沒過時的重跑順序」（先跑單支、再跑相關／`--quick`、推上線前才跑一次全套）

- 只動文件，無程式碼異動；驗證：`--quick`見回報

---

## 2026-10-09 開發部：首頁往下翻提示與按鈕間距（版本2026.10.09-f）

- `index.html`：第一屏高度改`100svh - 56px`（露頭）；第一屏底部加「往下翻翻看」按鈕（`#home-more`，浮動、往下滑約40淡出、頁面不能捲動時隱藏、點了捲到下一區塊）；第一屏以下區塊進入畫面淡入（`.home.fx .reveal`，程式啟動後才先隱藏，減少動態時不啟用）；名額行移到「開始一段人生」上方，三顆按鈕間距統一10px，空名額行不佔位。新增`setupHomeScrollHint()`
- `worker/worker.js`：只換`WORKER_VERSION`（`test-54`要求兩邊一致）
- `index.html`（同版本）：頂部狀態列拿掉副業膠囊；`renderFocusBar()`選到副業項目（興趣／工作下拉）時在提示行上面多一行「項目名稱：狀態」（`.focus-side`），不做提醒圓點。`test-41`的A3改成新行為並補檢查
- 設計文件：新增16.10.11（原交接稿編號16.10.N，依實際接在16.10.10後）；10.15.8註記位置；00-總覽日誌；QA手冊34.31
- `tests/test-31-homepage.mjs`：新增提示、名額行順序、先隱藏時機、減少動態樣式檢查
- 驗證：見回報

## 2026-10-09 開發部：存檔說明文字改為符合實際（版本2026.10.09-e）

- `index.html`：首頁小字、常見問題「存檔會不見嗎？」、手動存到雲端成功視窗（「每10回合」→「每隔約10分鐘」）三處文字改為符合10.13.3十分鐘自動備份的實況；舊的RELEASE_NOTES歷史條目不動。設計文件16.10.1、16.10.6、對比度表同步，`tests/test-31-homepage.mjs`更新
- 驗證：全套測試見回報

## 2026-10-09 開發部：一、1.2.20 違法行為與內容底線＋support_flag求助資訊

- 設計文件：新增一、1.2.20（原稿編號1.2.11與親密關係章節撞號，使用者確認改編1.2.20）；1.2.11.1「另案討論」那句改為指向1.2.20；00-總覽目錄與日誌各加一行
- `worker/prompt.js`：每回合prompt在「玩家輸入只是故事裡的行動」那句之後加四段規則＋「重大後果不寫成失去工作、退學或入獄」一句（該句不變）；人生之書章節、放置摘要、回顧這一生另附`RECAP_CONTENT_LIMITS`；`submit_turn_result`新增`support_flag`(布林，非必填)。**改了prompt，要重新部署Worker**
- `index.html`：`support_flag`為true的回合，日記存`supportFlag:true`，`renderEntryBody()`在旁白下方小字顯示求助資訊(`SUPPORT_NOTE_TEXT`)；舊回合收合時一起收合。不改遊戲狀態結構，舊存檔照常讀取
- 未修改：常見問題「什麼路都能走嗎？」(玩家端簡短說法，不是內容底線規則全文，與1.2.20不衝突，使用者確認維持)、服務條款第四條
- 驗證：新增`tests/test-85-content-limits.mjs`（16項）
## 2026-10-09 首頁文字修訂：斷句、用詞統一、常見問題、對比度（claude.ai網頁版定案，十六、16.10.10）

- `index.html`：「說書人」→「撰稿人」2處；~~`HOME_FAQ`「什麼路都能走嗎？」改為「大多數都能…走不通的有兩種…」~~（2026-10-09合併上線時使用者決定維持舊句，已改回，test-31同步）；新增`wrapHomeText()`（`bindHome()`呼叫）把首頁內文依「，、；。？！」切成不可拆的`.nb`詞組，副標／置中短句`text-wrap:balance`、內文`text-wrap:pretty`；副標改`#3E1912`、`.home-note`改`#4D3E35`（對比度4.5以上）
- `life-sim-design/16`：16.10.1、16.10.3、16.10.6改字（舊句刪除線），新增16.10.10（斷句、用詞、對比度色碼、今日封測名額出處）；`tests/test-31-homepage.mjs`更新並加三項檢查；QA手冊新增34.30
- 同日另：已刪除每回合下方「AI生成 X.X 秒（測試模式）」顯示（只剩存檔欄位`genMs`）
- 驗證：語法檢查與全套測試結果見回報；Chromium模擬320／375／390寬度逐行檢查斷句與取樣背景算對比度。沒有改版本號與玩家更新說明（上傳前再換，見DEPLOY.md）

## 2026-10-09 整理：設計文件一致性檢查回覆（claude.ai網頁版定案）

- 共同基準「真實API使用規則」：正式網址改為`draftmylife.com`、`lifegame-6an.pages.dev`兩個（網址完全相同才算），版本記錄加一行；同步十、10.9.2第三批與`CLAUDE.md`兩處
- 程式確認（未改程式）：`index.html`的`isOfficialHost()`用`OFFICIAL_HOSTS.includes(location.hostname)`，已經是完全相同比對，`www.draftmylife.com`與預覽網址不會被當成正式網址
- `費用記錄/`加進`.gitignore`並解除追蹤（`git rm -r --cached`，本機8個CSV仍在；不改寫git歷史）；十、10.14.4與費用文件的存放位置文字修正
- 00-總覽：目錄補十、10.17，日誌加一行；10.17.10九項技術判斷改為定案
- 十六、16.10.6／16.10.9改照程式現行點數文字；三、3.9.2、一、1.2.16（補「副業:X」列）、四、4.4.1、十三、13.7.2、十四、14.5.8及多處舊句加註取代
- `CLAUDE.md`：回合編號上限9次、快照`SNAPSHOT_EXTRA_KEYS`維護提醒；專案現況簡介更正1234～1404回合的說法；QA手冊新增34.29錢包結構整理（含「三段人生」舊文字）
- 驗證：`node run-all.mjs --quick`（Node 20）85檔全部通過

### 2026-10-09（整理）10.13.4分享形式與暱稱定案寫入
- `life-sim-design/10-存檔與帳號系統.md` 10.13.4：新增三條【定案】（只產生圖片卡與網址、不做官方轉貼；卡片不顯示暱稱；16.7.0維持現行）並改寫【取代】條；`00-總覽.md`加日誌一行、10.13目錄行補註。純文件，沒改程式、不換版本號
- 分支整理：刪除已併入的雲端分支8條；`claude/serene-noether-1s1dnv`（9/30草稿）內容已由10/1版取代，不合併；清掉2筆舊stash；併入QA「六題追問答覆」
- 測試：見回報。

---

### 2026-10-09（開發部）首頁背景色塊隨螢幕縮放（2026.10.09-b）
- `index.html` 16.1暖陽顆粒背景：`.blob`模糊改`blur(max(38px,5vmax))`，四顆色塊寬高改`max(原px, 32～38vmax)`；手機維持原樣，電腦放大到互相重疊。只改CSS與版本號，不動遊戲狀態、存檔、Worker程式。
- `WORKER_VERSION`同步→2026.10.09-b（Worker程式本身沒改，test-54要求兩邊一致）。已取代PR #19（分支`claude/landing-bg-desktop`）的做法，PR關閉不合併。
- 測試：見回報。

---

### 2026-10-09（開發部）prompt稽核修正（2026.10.09-a，尚未上線）
- 起因：使用者執行`/claude-api prompt-audit`，稽核`worker/prompt.js`、`worker/worker.js`請求組裝與根目錄`CLAUDE.md`，使用者同意後依序處理。
- `worker/prompt.js`：①必填欄位清單補上`location`（原本與工具定義的`required`不一致）；②拿掉七處「務必遵守」「絕對不能」等加重語氣；③清掉十一處新舊版本對照說明（「取代原本」「已移除」「不再」等，含`job_change`、`happiness_delta`、`ending_title`、`scene_category`的沿革句）；④姓名性別一致性改寫、刪掉「柏勳」事件紀錄；⑤`achievement_health_cost_multiplier`改成「參考輕重」，不再要AI自己乘；⑥章節成書補一句說明：段落清單那條規則不適用，章節用`\\n\\n`分段；⑦刪除「不要用純文字回覆、不要自己寫JSON」（請求本來就強制用工具）；⑧`turn_summary`、`attachment_shift`、`peer_position_shift`、`conscientiousness_shift`補上`description`；另補一個漏掉的句號。
- `worker/worker.js`：`WORKER_VERSION`→2026.10.09-a（prompt有改，**需重新部署Worker**才生效）；`index.html`：`APP_VERSION`同步→2026.10.09-a並加一筆玩家看得懂的更新說明（test-54要求兩邊版本一致）。
- `CLAUDE.md`：舊的掃描紀錄搬到`qa/QA_34附錄_歷史封存.md`新章節；清掉兩處刪除線殘留；部署說明改成與`build-pages.sh`一致（og.png、lunar.min.js由腳本放進`dist/`）。
- 測試：`test-48`拿掉已刪句「不要再回報scene_category」的比對（仍檢查欄位已停用）；`test-71`更新CSV表頭（上一版加了`elapsed_ms`欄時沒跟著改，與這次修改無關，先前就失敗）。
- 未測試（需真實API）：prompt修改後AI實際寫出的敘事品質、`location`是否每回合都回報、章節分段是否正常。
- 稽核提醒、未動：`max_tokens: 3000`是否偏緊（建議先看線上`stop_reason`紀錄）；若日後換成Sonnet 5.5，四處強制`tool_choice`會400，要改寫。

---

### 2026-10-08（開發部）十、10.17回合流程與出錯處理(2026.10.08-j，尚未上線)
- 起因：使用者貼網頁版定案的「回合流程與出錯處理」，已寫進設計文件10.17（commit `cdee9ba`），這次實作。
- `index.html`：①`callAI`加`AbortController`逾時(`AI_TIMEOUT_MS`90秒)，逾時不自動重打；等待超過`AI_SLOW_HINT_MS`30秒加一句「撰稿人還在寫，請稍等一下」；非逾時錯誤等`AI_RETRY_DELAY_MS`2秒再重打。②「再試一次」沿用失敗那回合的`turn_nonce`(失敗log帶`retryNonce`，請求帶`retry:true`)，Worker回429(上限)就放掉編號；按鈕文字「再試一次」(每日上限暫停仍是「重新送出」)。③帳號錢包失敗：向`account/me`查最新餘額為準，查不到記待校正、下次收到錢包時記一筆「點數校正」。④本機存檔失敗(`writeLocalState`)：頂部狀態列常駐提示、失敗當下補存一次雲端(`emergencyCloudSave`，補存失敗不連續重打)，取代`notifyLocalSaveFailed`只提示一次。⑤快照新增`extra`(`SNAPSHOT_EXTRA_KEYS`89個欄位，快照當時不存在的還原時刪掉)，反悔一併還原；舊存檔的快照沒有`extra`則維持現狀。版本2026.10.08-j與更新說明。
- `worker/ap.js`：`MAX_CALLS_PER_TURN_NONCE`5→9；`preCharge`／`postCharge`認`retryOfFailed`(上一次已扣點的再試不重複扣、又失敗退回那一筆)。`worker/worker.js`、`account.js`、`account-routes.js`：傳遞`retry`旗標；`callAnthropic`量耗時，`gate.js`逐筆明細新增`ms`，`/usage-detail.csv`新增`elapsed_ms`欄。`worker/prompt.js`：每回合補防護句，章節／放置摘要／回顧這一生補改寫版防護句。`WORKER_VERSION`→2026.10.08-j。
- 測試：新增`tests/test-84-turn-flow.mjs`(41項，含逾時、慢提示、重打間隔、再試一次與伺服器扣退點、上限9次、耗時欄位、本機存檔失敗提示與補存、180次失敗還原比對、帳號錢包校正、防護句)；`harness.mjs`的fetch改成認`AbortSignal`；`test-2`／`test-58`上限5→9、`test-56`按鈕文字。全套測試通過(87檔，Node 20)。**未測試(需真實API／實機)**：真實Anthropic的實際耗時與90秒是否合適(先用起點，累積耗時資料再調)、慢提示與常駐存檔提示在手機版的排版、瀏覽器空間真的滿了的情況。
- ⚠️這次改了遊戲狀態結構(快照多一個`extra`)與`worker/`，推上線前要問使用者。舊存檔可繼續玩，不需清空。

### 2026-10-08（開發部）封存包寫入計數也由每小時排程清除(10.16.15補，2026.10.08-i，尚未上線)
- 起因：使用者決定（待辦清單一、1）：封存包寫入頻率限制的來源雜湊計數（`r:小時:來源雜湊`）原本只在「同一個DO有新寫入」時順便清舊，沒人寫入時會留超過2小時；改程式、說明頁不動。
- `worker/account.js`：`opPurgeAbuse`新增清除所有小時早於「現在這一小時」的`r:`計數（回傳`purged.pack_rate`）；每小時排程已會呼叫`purge_abuse`，不用改`entry.js`。計數只在寫入當小時有用，最長保留＝寫入當小時結束＋到下一次整點排程，**不超過2小時**，與10.16.15一致。
- `worker/worker.js`：`WORKER_VERSION`→2026.10.08-i（網頁版同步-i）。
- 測試：`test-65`新增3項（當下這一小時保留、兩小時後無人寫入時被清、清掉後同一人生封存包重送仍回existed）。
- ⚠️推上線前要問使用者：動到`worker/`。

### 2026-10-08（開發部）共用職業細表(2026.10.08-h，尚未上線)
- 起因：使用者要求父母與玩家共用一張具體職業細表（方案2），並拍板：高風險併進細表、玩家自己挑具體職缺、具體職業不影響數值。設計文件五、5.2.5／十二、12.3／12.4／三、3.4.3／四、4.9／九、9.2。
- `index.html`：新增`OCCUPATION_JOBS`（八類共8～4個職業，權重、高風險旗標）與`jobsOfCategory`／`isValidJob`／`jobIsHighRisk`／`rollJobInCategory`／`PARENT_LABEL_CATEGORY`／`backfillOccupationJobs`；移除`HIGH_RISK_JOB_SUBTYPES`與`rollJobRiskSubtype`（高風險改由職業旗標決定，舊的工種名稱加字尾：工地→工地工人等）；家長卡新增`occupationJob`、配偶`spouseOccupationJob`、手足子女`path.job`、玩家`jobTitle`；`resolveJobApplication`／`applyJobHire`／`acceptJobOffer`帶職缺；求職彈窗選類別後列出職缺（高風險標註）、錄取畫面顯示職缺；payload新增`job_title`；「關於我」加職稱；轉職履歷加職稱；舊存檔載入時補擲。版本2026.10.08-h與更新說明。
- `worker/prompt.js`：新增`job_title`說明（照職稱寫、不自己編）；`worker/worker.js`：WORKER_VERSION 2026.10.08-h（prompt有改，需重新部署Worker）。
- 驗證：新增`tests/test-83-job-table.mjs`（24項：細表權重與高風險比例、家長／配偶／手足、玩家挑職缺、不屬類別改抽、保底改類別、退休清除、彈窗、舊存檔補擲）；`test-19`、`test-56`改配合新機制。**未測試（需真實API／實機）**：AI是否照`job_title`寫職稱、求職彈窗職缺按鈕在手機版的排版。舊存檔可直接繼續玩（載入時補擲）。

### 2026-10-08（開發部）家長職業加權(2026.10.08-g，尚未上線)
- 起因：使用者確認父母職業機率清單；原本`pick()`平均抽，政治人物每位家長12.5%（雙親家庭約23%有政治人物家長，連動鎖定富裕家境）。設計文件五、5.2.5。
- `index.html`：`PARENT_OCCUPATIONS`每項加`weight`（30/25/15/10/8/5/5/2，測試參數）；新增`rollParentOccupation(excludePolitician)`（用既有`weightedPick`，排除政治人物時其餘按比例放大），三處抽職業（雙親在場、離異不同住／失聯／已故）改用；版本2026.10.08-g與更新說明。不改遊戲狀態結構，舊存檔不受影響；`worker/`沒動。
- 驗證：`tests/test-56-occupation.mjs`新增4項（10000次比例、政治人物約2%、排除版不出現政治人物、權重合計100）。

### 2026-10-08（開發部）興趣多元化(2026.10.08-f，尚未上線)
- 起因：使用者回饋興趣玩幾次都是手作居多；查核程式端沒有任何出現機率，類別全由AI挑，prompt範例也偏手作。設計文件八、8.8.1～8.8.3（claude.ai網頁版定案）。
- `index.html`：新增`INTEREST_ITEMS`／`rollInterestSeed`／`prepareInterestSeed`／`interestCardLabel`；每回合在timeCtx算一次種子(重新生成沿用)；payload新增`turn_focus.try_new_suggestion`、`interest_seed_now`、`interest_status[].item`；種子回合AI類別不符改回種子並記`interest_event_mismatch`；興趣卡`item`欄位(選填，舊卡無)；興趣面板與人生回顧顯示「類別・項目」；版本2026.10.08-f與更新說明。
- `worker/prompt.js`：要求照種子的類別與項目寫、沒種子不自己發明類別、訂單範例各類輪流舉例；`worker/worker.js`：WORKER_VERSION 2026.10.08-f（prompt有改，需重新部署Worker）。
- 設計文件：`08-興趣系統.md`新增8.8.1～8.8.3、8.1補註，`00-總覽.md`日誌一行。
- 驗證：新增`tests/test-82-interest-seed.mjs`(35項：抽選比例、已有類別減半、七類恢復均等、5000次無連續同類、已有類別改抽其他項目、何時擲／不擲、嘗試新的與自然種子接進回合、類別不符處理、項目不覆蓋、舊存檔相容)，全部通過；全套85檔中只有test-54-version一項未通過(DEPLOY.md還沒有2026.10.08-f的上線紀錄，上線後依慣例補一行)。**未測試(需真實API)**：AI是否真的照指定類別與項目寫、範例改後是否更多元、自然種子8%的手感。不改既有欄位，舊存檔可直接繼續玩。

### 2026-10-08（開發部）網頁版討論回覆實作(2026.10.08-e，尚未上線)
- 起因：網頁版討論回覆定案(設計文件commit `03e1098`)。
- `worker/account.js`：新增`purge_abuse`——寄驗證信的IP紀錄(`li:`)、寄信次數紀錄(`le:`)寫入後1小時到期、過期驗證碼紀錄一併清；每小時排程(`entry.js`)先清除、再分配、再寄信；`wallet_spend`加tag=keep(10點)記退還憑證、新增`wallet_refund`(`account-routes.js`的`refund_keep`)，伺服器驗證憑證才退。
- `index.html`：條款隱私版本1.1；指定NPC候選排除已故與失聯、必定登場(`maybeFireReunionNpc`／`noteReunionAppeared`／`settleReunionNotAppeared`)，整個學生時期沒登場退10點並跳訊息；試看花絮6句改寫；沒有候選時顯示灰色「沒有可以指定的人」。重新產生`terms.html`／`privacy.html`(第二條補4項、第五條補1行)。
- 設計文件已改：10.3.13／10.15.11／10.16.13判斷轉定案、10.16.14帳號刪除手動清單、10.16.15防濫用紀錄過期、10.16.16另外處理、7.4.3.4、16.7.2.3、10.9.1、`CLAUDE.md`(同意頁版本提醒)；QA 34.28。
- 測試：新增`test-81`(34項)；`test-78`、`test-80`補項。
- 全專案搜尋5項舊寫法殘留（奇幻人生已購買標記、首購優惠、月費、玩完一生多少錢、回顧這一生的倍數檢查）：已確認無殘留，命中的都是新規則或已劃掉的舊句。
- ⚠️推上線前要問使用者：動到`worker/`。

### 2026-10-08（開發部）說明頁面三頁(十、10.16，2026.10.08-d，尚未上線)
- 起因：網頁版定案(2026-10-08)三份交接文件的第三份；設計文件已寫入10.16(commit `a3ed913`)。
- 新增`terms.html`、`privacy.html`、`pricing.html`(根目錄，純靜態)與產生腳本`design-assets/build-legal-pages.py`(從設計文件全文區塊逐字產生)；`build-pages.sh`放進`dist/`；`CLAUDE.md`、`DEPLOY.md`、`WORKFLOW.md`的檔案清單同步。
- `index.html`：首頁最下方預告＋三連結、錢包頁三行連結、開場同意頁條款連結(`CONSENT_VERSION`=2、`CONSENT_MIN_ACCEPTED`=1，舊玩家不重新同意)、`LEGAL_DOCS_VERSION`／`LEGAL_DOCS_UPDATED`設定值；各處「隱私說明」連結改連`/privacy`(刪除短版彈窗)。
- 10.16.9核對隱私頁資料項目：6項不符或沒列出(IP、人生代號清單、存檔索引、同意紀錄、寄信次數紀錄、刪除帳號缺工具)，見10.16.13第7點，沒有改頁面文字。
- 測試：新增`test-80`(33項)；`test-63`調整。QA手冊34.27。

### 2026-10-08（開發部）付費周邊(十、10.3.13、7.4.3.4、16.7.2.1、10.9.3.1a補充二，2026.10.08-c，尚未上線)
- 起因：網頁版定案(2026-10-08)三份交接文件的第一份，設計文件已寫入(commit `a3ed913`)。
- 反悔：每一世免費5次(`UNDO_FREE_PER_LIFE`)，用完每次扣1點並跳確認視窗(`requestUndo()`)，舊存檔補2次(`ensureUndoRule()`)；扣點共用`paySinglePoints()`(帳號人生扣帳號錢包、其他扣本機點數)。
- 人生重開丹(新功能)：轉世與傳承都先出現`openLifeKeepPanel()`，10點三選一；`applyLifeKeep()`套用數值起點、興趣天賦(`applyInterestEvent`建卡時投入度20)、指定NPC(轉世`maybeFireReunionNpc()`排程登場並送`reunion_npc_now`給AI，傳承直接建卡)；`worker/prompt.js`加登場規則。
- 回顧這一生：60點(前端`LIFE_REVIEW_COST`、`worker/ap.js`、帳號錢包扣點與`wallet_can_afford`，`account.js`單次扣點上限50→100)；試看花絮改程式組句(`buildOpeningTeaser()`，不送AI；`worker/prompt.js`刪除`teaser_tidbit`欄位與說明)。
- 全站花費上限：`worker/gate.js`成功呼叫記實際花費(美元×32)、失敗呼叫照預估；呼叫前用「當日花費＋預估」判斷；預估＝近7天實際平均，少於`SPEND_ESTIMATE_MIN_CALLS`(後台，預設100)次用固定估價；`worker/worker.js`、`mail.js`(金額兩位小數)同步。
- 測試：新增`test-77`(34項)、`test-78`(8項)、`test-79`(12項)；調整`test-31/34/56/58/59/60/61/66`(新數字與新規則)、`harness.mjs`加`ONE_TWD_USAGE`。全套82檔通過。
- ⚠️推上線前要問使用者：動到`worker/`(花費計算、prompt、單次扣點)。不改遊戲狀態結構的必要欄位(新增`undoRule`、`lifeKeep`、`reunionNpc`皆為選用)，舊存檔可直接讀。

### 2026-10-08（開發部）封測名額與候補(十、10.15，2026.10.08-b，尚未上線)
- 起因：網頁版定案(2026-10-04)交接文件，公開招募前限制每日新玩家人數，滿了可留信箱候補。設計文件已寫入10.15(commit `3cb9208`)。
- `worker/account.js`：帳號資料庫新增名額帳(`en`)、累計(`cum`)、候補隊伍(`wq`)、持有位子清單(`wh`)與操作`entry_status`／`entry_claim`／`wl_join`／`wl_direct`／`wl_requeue`／`wl_due`／`wl_mail_result`／`entry_stats`／`cp_result`；當天第一次有人碰到就自動做過期收回與分配；`life_add`加候補入場(領25＋30點)；`/account/me`帶`wl`狀態。
- `worker/entry.js`(新)：每小時排程寄候補通知信(分配當天12:00起、失敗每小時重試最多3次)與檢查點通知信。`mail.js`加兩種信；`gate.js`加兩個設定值(`DAILY_NEW_PLAYER_CAP`可為0、`BETA_PLAYER_CHECKPOINT`)；`account-routes.js`加`/entry/status`、`/entry/claim`、`/waitlist/join|direct|requeue`；`save-admin.js`加`/admin/dashboard-roster`(自動寫存取紀錄)；`worker.js`：`/stats-summary`加`entry`區塊、三個數據網址也接受`SAVE_ADMIN_TOKEN`、`scheduled`分兩個排程；`dashboard.js`加名額卡片與名冊分頁；`wrangler.toml`加排程`0 * * * *`。
- `index.html`：開始畫面名額顯示、按開始前檢查名額、`startLife()`在未綁啟程禮實際發出前扣名額、第9～13則訊息、留信箱候補流程(帳號流程新模式`waitlist`)；旗標`lifegame_entry_quota`(示範模式預設不檢查)。版本2026.10.08-b。
- 測試：新增`test-75-entry-quota`(Worker端52項)、`test-76-entry-ui`(前端26項)。詳見QA 34.25。實作判斷十二項記在10.15.11待確認。
- ⚠️推上線前要問使用者：`worker/wrangler.toml`新增排程(動到部署設定)。不影響舊存檔(沒有改遊戲狀態結構)。

### 2026-10-08（開發部）近況改回3回合原文、訂單現況以訂單簿為準(十、10.14.8補充第八節；八、8.13.1，2026.10.08-a)
- 起因：網頁版定案(2026-10-08)，依葉夜第125回合三版比對：-a保留；近況縮減(-b)不上線、不跑退路；訂單前後不一致改補規則，第三輪驗證通過才推。
- `index.html`：`RECENT_FULL_TEXT_TURNS`預設改回3(送出的近況跟2026.10.05-a相同)，縮減程式保留。
- `worker/prompt.js`：近況說明改回2026.10.05-a的寫法；【八、8.13副業訂單簿】加「訂單現況以本回合side_gig_orders為準、沒有的訂單視為已結束不可寫成還在趕或重新登記、order_new只限新客人／新詢問或玩家行動寫明」。
- 版本：2026.10.05-b沒有上線，RELEASE_NOTES那筆換成2026.10.08-a。
- 測試：`test-74`改成預設檢查3回合原文、明確設1才檢查縮減；`test-47`加2項訂單規則。全套77檔通過(test-31平行時失敗、單獨重跑通過)。第三輪真實API驗證未測試。
- 第三輪驗證後續(2026-10-08網頁版定案)：條件②通過、條件①判定為訂單簿上線前舊存檔的問題，不再改規則，兩個改動照常上線。RELEASE_NOTES改兩句(不再重新記成新訂單、舊人生可寫「把○○的訂單交給她」收尾)；`公告草稿_已知狀況.md`加5.5；8.13.1加舊存檔收尾說明；QA 34.24第27項改判定、加第31項上線後觀察。

### 2026-10-05 續（開發部）近況縮減(十、10.14.8補充，2026.10.05-b，尚未推上線)
- 起因：網頁版定案10.14.8補充(後期目標改NT$1.15、近況縮減)。使用者拍板：第三、四步(750c4e7)已上線，第一輪比對改上線後補驗、改版前照定案用-m版；10.14.8.8門檻改NT$1.15。
- `index.html`：新增`RECENT_CONTEXT_TURNS`(3)；`RECENT_FULL_TEXT_TURNS`改為`let`、預設1(退路2、舊做法3)。最近3回合只有上一回合送原文，前第2、3回合併進`recent_turns_summary`(依時間順序，沒有摘要送原文)；更早6則摘要範圍不變。
- `worker/prompt.js`：兩句「recent_turns_full＝最近3回合原文」的說明改成「上一回合原文、前兩回合看摘要清單最後兩則」(說明要跟送的內容一致；固定規則有改，第一次呼叫會重新寫入暫存)。
- 測試：新增`test-74-recent-slim`(11項)。全套77檔通過。兩輪真實API比對未測試(每次先問使用者)。

### 2026-10-05（開發部）每回合費用再降(十、10.14.8，2026.10.05-a)
- 起因：網頁版定案10.14.8(後期每回合≤NT$0.9)。10.14.8.2人物卡只送出場者本次不做(與18.7焦點角色輪替衝突，使用者拍板)。
- `worker/prompt.js`：工具定義刪`age_advance`；scene_summary、summary_add、plot_new.text、new_clue、lie.content說明改40字；規則補「payload沒出現的欄位＝空值」、新角色名字改對照名冊。turn_summary不限(人生之書素材，使用者拍板)。
- `worker/worker.js`：`STABLE_PAYLOAD_KEYS`加`home_purchase_min_down_payment_pct`、`player_pronoun`。
- `index.html`：`compactTurnPayload()`空值欄位不送(第一層＋time_context、narrative_rhythm內層，Worker必填照送)；刪`current_time_label`、`word_range`；`all_character_names`只在名冊超過`ROSTER_MAX`(80)時送；`C_SUMMARY_MAX`(40)截斷C類摘要；逐筆紀錄正文字數改為也算段落清單(原本一律0)。
- 量測(示範模式第100～701回合)：每回合不進暫存的資料約6,090字→3,460字，估計少約850 token(約NT$0.05)。結果與估算見`qa/AI費用實測與瘦身計畫_2026-10-04.md`第九節、QA手冊34.24。
- 測試：新增`test-73-cost-slim2`(19項)；8個測試改成「沒出現＝空值」。全套76檔通過。需要真實API的項目未測試。


### 2026-10-04 續（開發部）出社會後的重心：技術判斷確認(2026.10.04-p)
- 使用者確認2.6.7五項【技術判斷】改為【定案】，並補充：才識只靠進修照舊(實測留意上班族才識不成長的手感，本版不調整)；60歲起休息排入名次且發生時同樣算健康經營(原本程式已是如此，補測試)；副業進度畫面不出現小數。
- `index.html`：`orderProgressText`(給旁白的訂單進度)改為整數格(無條件捨去)，畫面進度條原本就取整數。WORKER_VERSION同步換成2026.10.04-p(版本檢查要求兩邊一致，Worker內容沒改)。
- 十三、13.7.2排除表維持現狀。設計文件同步改【定案】。
- 測試：`test-72`新增3項(進度整數格、休息排名次發生／沒發生)，60項通過。

### 2026-10-04 續（開發部）出社會後的重心(二、2.6.7＋補充定案，2026.10.04-o)
- 起因：claude.ai網頁版定案〈出社會後的重心〉與〈補充定案〉，設計文件已於commit `84ae88c`寫入。
- `index.html`：
  - 重心延續到出社會後(`focusModeActive`改為只看放置代活)；學生時期專屬的部分仍看`isStudentPhase`：18.2～18.4場景擲骰(`buildScenePlan`)、學期背景事件。測試參數集中在「二、2.6.7出社會後的重心」常數區(`FOCUS_RANK_*`、`FOCUS_RATIO_BONUS_PP`、`FOCUS_HUSTLE_HEALTH`、`FOCUS_PUSH_AFFINITY`)。
  - 讀書改稱進修；「工作」依職涯狀態展開(`adultWorkOptions`)：在職＝本業拚一點、求職／待業＝找工作＋打工、經營事業＝顧事業、半退休＝兼職、完全退休＝只列副業(沒有就不顯示)。`syncFocusState()`處理畢業那一回合預設工作、職涯狀態改變時子項換成第一項(重心不是工作就不換)、60歲生日改排序(撰稿人訊息)。
  - 新按鈕小字(補充定案)；照顧期間家人按鈕改「家人：照顧媽媽」、對象預設被照顧的人(不自動選)。
  - 結算：休息健康＋2不超過健康年齡上限；本業拚一點挑主管或同事一位關係＋1；比例計數`state.focusRatio`(職級期間／求職期／這一年，分母只算有結算重心的回合，60歲起只看第1名)；升遷、錄取、創業營運加分算在原本範圍內(5～95／5～90／5～95)；每年的年度判定時(與裁員、營運同一個時點)依本業拚一點＋顧事業比例扣健康−3／−1，日記加一行說明(`focusNote`)。
  - 打工入帳(三、3.4.2)：出社會後只看重心，文字不觸發；`applyPartTimeWork`的第4個參數改為名次比例。
  - 60歲起排序前三：點選排序、再點拿掉(工作、興趣在清單裡拿掉)；第2名60%、第3名30%擲骰；打工、兼職收入與副業訂單進度依名次比例、不擲骰(訂單進度可為小數，進度條取整數格)；副業的興趣投入照比例打折；社交有發生才算3.5.5。
  - 一、1.2.16：出社會後的場景指令、`no_part_time_income`、60歲起只寫進時間流逝段(`ranked_items`)且不加字數(18.14)。
  - 十三、13.7.2：依重心第1名排除老年題材(`OLD_AGE_THEME_EXCLUDE`)；目前題庫沒有退休、遠行題材，規則先建好。
  - 遊玩說明重心段補兩小段；更新說明一筆。
  - 【實作判斷】①回應評價(2.6.5)與「AI的stat_deltas只收負數、才識來自進修」也延伸到出社會後(依2.6.7.1「沿用學生時期做法」)；②「每年生日的年度結算」對應到既有的年度判定時點(出社會年度滿一年，裁員／營運同一處)，不另外在生日那天結算；③選休息的回合也算13.2健康經營回合(否則出社會後健康經營年再也達不到)；④「這段求職期」＝從開始求職到錄取，錄取時歸零。
- `worker/prompt.js`：回合結構段落改為整個人生適用，新增出社會後的重心與60歲起排序的寫法。改prompt要重新部署Worker(合併進master自動部署)。WORKER_VERSION 2026.10.04-o。
- 測試：新增`test-72-adult-focus.mjs`(58項)；`test-39`出社會後兩項、`test-7`健康經營一項依新規則改寫。全套75檔除test-54的DEPLOY.md紀錄(部署後補)外全部通過(Node 20)。
- 存檔：只新增欄位(`focusRatio`、`focusRank`、`focusAdultInit`、`focusWorkStatus`)，舊存檔照常可玩；已出社會的舊存檔第一次進來時重心預設為「工作」的第一項。


### 2026-10-04 續（開發部）伺服器端AI實際用量紀錄(10.14.7，2026.10.04-n)
- 起因：開放別人測試後，玩家本機的逐筆呼叫紀錄撈不到。使用者拍板：每日依呼叫類型加總四種用量與實際美元、逐筆明細附匿名人生代號(最近7天、最多5,000筆)、數據總覽加區塊並可下載CSV；「整段重寫次數」「前期後期」從明細事後算。寫進設計文件10.14.7。
- `worker/gate.js`：`UsageCounter`新增`detail`(記一筆)、`udays`(每日加總)、`urows`(明細)；`recordAIUsage()`把人生代號與turn_nonce各雜湊成8碼再送進計數器(不存原文)。同一個turn_nonce第二次以後記為「失敗重試／重新生成」，開場看`is_prologue`。存放`ua:日期`(永久)、`ud:時間:序號`(每次寫入時清掉超過7天或超過5,000筆的最舊幾筆)、`ud_count`。
- `worker/worker.js`：`callAnthropic()`多一個meta參數，成功回應後在背景(`ctx.waitUntil`)讀出usage記進計數器，不影響回應；五個呼叫點(一般回合KV／非KV、放置摘要、回顧這一生、章節)都帶meta。新增`GET /usage-detail.csv`(USAGE_ADMIN_TOKEN，UTF-8 BOM、台灣時間、中文類型、距同一段人生上一次呼叫的分鐘數)；`/stats-summary`新增`ai_usage`(今天／近7天／累計的呼叫數、依類型次數、四種用量、美元、每回合平均＝總花費÷既有每日回合數、快取讀取比例)。
- `worker/dashboard.js`：新增「AI 實際用量（Anthropic 回報）」區塊與「下載逐筆明細 CSV」按鈕(用登入時的密碼下載，不把密碼放進網址)。
- 每次AI呼叫對計數器多1次請求、約3～4筆寫入(加總、明細、筆數，偶爾刪最舊一筆)，不碰KV。
- `tests/harness.mjs`的假Durable Object補上`list`的`reverse`／`limit`。新增`test-71-usage-detail.mjs`(19項)。全套74檔通過(Node 20)。

---

### 2026-10-04 續（開發部）快取區塊順序調整(10.14.3補充，2026.10.04-m)
- 起因：使用者在-l玩後期第126～129回合，逐筆紀錄顯示沒進快取的輸入少約2,400 token，但人物卡與名冊幾乎每回合都變，每回合多付1,589～3,257 token的快取寫入，送進去的部分反而比改版前略貴約3%(QA手冊34.21.5)。使用者拍板兩項都做。
- `worker/worker.js`的`turnUserContent()`：區塊改為【少變資料】→【名冊】→本回合資料；`NPC_PAYLOAD_KEYS`移除，`active_characters`留在本回合資料。`worker/prompt.js`分段說明同步改為「【少變資料】、【名冊】」(固定規則全站重寫快取一次)。
- 設計文件10.14.3補一條【定案】(取代「移到名冊之後」)、`00-總覽.md`日誌一行。
- 測試：`test-70`改為新順序、人物卡在最後一段；`test-44`的名冊區塊改為找名冊那一段，不再假設是第一段。

---

### 2026-10-04 續（開發部）AI費用控制 目標一(10.14，2026.10.04-l)
- 起因：使用者貼來「定案交接：AI費用瘦身（目標一）與後台花費設定」(claude.ai Project定案)。先把定案寫進`life-sim-design/10-存檔與帳號系統.md`新小節10.14與`00-總覽.md`目錄、日誌；實作與量測如下。
- **固定規則分學生版／完整版：不拆**(依10.14.2.4先量再拆)。學生版拿掉職涯、健康衰退與老年、人生總結(含工具定義`life_summary`欄位)只少約4,595字，換算約3,900 token，低於5,000門檻。拆分程式寫過一版量測後已還原，沒有進版本庫；量測保留在`test-70`。換算比例用實測「61,012字≈51,372 token」，不是真實token計數。
- **快取保留時間：維持5分鐘版、不開1小時版**(10.14.4先算再開)。用`~/Downloads/呼叫成本紀錄_20261004-1015.csv`24筆逐筆重算：實際US$1.7361、若固定規則用1小時版約US$1.9622(貴約13%)；8次快取失效只有2次距上一次呼叫在60分鐘內。數字與但書(單一玩家、停頓長)記在QA手冊34.21.1，並列入公測前檢討清單。
- **少變資料與人物卡移進快取**(10.14.3第1項)：`worker/worker.js`的`turnUserContent()`改為4段：【名冊】→【少變資料】(`STABLE_PAYLOAD_KEYS`：`milestone_status`、`milestone_skip_reason`、`character_appearance`、`family_structure`、`family_background`、`key_event`、`is_politician_child_hidden_flag`、`stat_delta_limits`、`intimacy_mode`、`chronicle_recent`)→【人物卡】(`active_characters`)→本回合資料，前三段設快取(連固定規則共4個斷點，剛好是上限)，欄位內容一字不變。挑選依據：示範模式25回合量每欄位字數與變動次數，加上欄位本身的意義(終身不變或只在事件時改)；`conscientiousness`、`attachment_axes`、`places_recent`、`purchase_price_guide`等字數小或可能常變的不放(放進去反而讓整段常失效)。`active_characters`實測紀錄約3,000字、會隨好感度變，但區塊排在少變資料之後，它變動只重算它自己與後面。`tests/harness.mjs`的`turnPayloadFromBody()`同步併回新區塊。
- **規則與工具定義去重複**(第2項)：只刪工具定義裡跟system prompt逐字重複的描述(`action_result`、`scene_day_offset`、`scene_summary`、`turn_summary`、`stat_deltas`、`one_time_transaction`、`life_summary`頂層、`response_rating.approach`／`approach_type`)，同一條規則留在system prompt；欄位與`required`沒動。兩邊逐句比對後逐字重複的本來就少，工具定義少約530字。system prompt另加兩處小說明：訊息分【名冊】【少變資料】【人物卡】幾段送來；開場的`scene_day_offset`填0要輸出。
- **開場固定重試一次**(第3項)：推測原因——system prompt【回傳資料精簡】要AI把值為0的欄位省略，開場的`scene_day_offset`本來就是0，AI照做後`validateSceneDate()`判「沒回傳整數」→自動重生成(9/30、10/4兩次都剛好一次)。修正：`index.html`的`validateSceneDate(r, win, prologue)`開場回合沒寫offset視為合法(套用時本來就當0)，並在規則裡註明0要輸出；一般回合沒寫照舊算違規。`test-70`用假上游驗證：舊程式開場呼叫2次、新程式1次。**這個原因沒有用真實API確認**，若真AI開場還是多一次，看測試選單待確認清單裡開場那筆的原因。
- 後台設定：`設定說明_帳號與寄信.md`表格改為`AI_CALL_COST_ESTIMATE`＝3、`DAILY_SPEND_CAP`＝300(程式內建預設值沒動，後台設定值優先)；實際修改要使用者在Cloudflare後台做。
- 版本：`index.html`／`worker/worker.js`都換成2026.10.04-l，加RELEASE_NOTES一筆。
- 上線後真實API驗證(使用者同意，腳本自動玩，6次呼叫合計US$0.1559)：開場只呼叫1次；第3回合起快取讀取多出約1,700 token(新區塊命中)；連續玩每回合約US$0.024～0.027；停6.5分鐘後固定規則仍命中全站共用快取，所以「快取完全失效那一回合」沒測到。細節見QA手冊34.21.4。
- 測試：新增`test-70-cost-slim.mjs`(16項通過)。全套(Node 20)73檔：72檔通過，只有`test-54-version`的「DEPLOY.md記錄過目前頁面版本號」未通過——這是上線後才補的紀錄行(使用者說上傳／部署後補)，不是程式問題，補完`DEPLOY.md`那一行就會過。

---

### 2026-10-04 續（開發部）正式網域draftmylife.com(2026.10.04-j)
- 起因：draftmylife.com已能開啟遊戲(當時線上為-h)，但Worker對`Origin: https://draftmylife.com`回403，新網址連不到AI；且新網址不在`OFFICIAL_HOSTS`，會預設示範模式。
- `worker/worker.js`：`ALLOWED_ORIGINS`加入`https://draftmylife.com`(舊的兩個保留)。`index.html`：`OFFICIAL_HOSTS`加入`draftmylife.com`；`og:url`、`og:image`、`SHARE_URL`改為`https://draftmylife.com/`。`www.draftmylife.com`目前沒有解析，未加入。版本與Worker版本同步換-j(原本排-i，但-i已由遊玩說明那批先上線)，RELEASE_NOTES加一筆，DEPLOY.md白名單說明更新。
- 測試：`test-54-version`新增兩個來源都放行的檢查；`test-62-unbound-rules`新增draftmylife.com預設真AI且分享連結為新網域；`test-31-homepage` og:image改新網域。
- 驗證：`cd tests && node run-all.mjs`全套(Node 20)。

### 2026-10-04 續（開發部）回合進行中的操作防護(2026.10.04-k)
- 起因：test-43修正時發現，`takeTurn()`在等旁白回應(await)後寫回的是全域`state`；回合進行中玩家若從選單切換或刪除人生，結果會寫進別段人生，或在首頁畫面出錯(`state.log`不存在)。使用者同意照建議處理。
- `index.html`：①`takeTurn()`改為外層計數(`turnsInFlight`／`turnBusy()`，try/finally，成功、失敗、點數不足都會解除)，原本內容移到`takeTurnInner()`，行為不變；②`blockIfTurnBusy(what)`：進行中時顯示「撰稿人還在寫這一回合，寫完才能○○。」並擋下——`switchLife()`、`renderConfirmReset()`(刪除人生)、`manualCloudSave()`(選單與上方雲端存檔狀態列共用)、`openAccountFlow()`(綁定／登入／換綁)、錢包裡的登出與「轉進帳號」按鈕；③存檔・設定面板在旁白書寫中(`aiWritingNow`)把切換／刪除人生變灰(`.menu-item.off`、`aria-disabled`)並加一行說明。不動存檔結構；`worker/`只換版本號。
- 實作判斷：存到雲端也擋(否則會存到扣了點、還沒有內容的半個回合)；帳號綁定／登入／登出／轉入也擋(回合失敗退點時要看這段人生是否用帳號錢包)；放置代活開關、看金鑰、錢包、各種翻閱面板不擋。
- 測試：新增`test-69-turn-guard.mjs`(假上游卡住模擬進行中)。

### 2026-10-04 續（測試部）test-43平行跑時失敗修正
- 原因：按「睜開眼睛」(生活方式確認)、讀檔、存雲端等按鈕會在背後跑非同步流程(開場回合要等假上游回應)，測試只固定等30～120毫秒就往下走；平行跑時電腦忙，開場回合還沒寫完，測試就把state換成首頁／金鑰畫面，回合回來寫錯誤訊息時`state.log`不存在→TypeError。8份同時跑可穩定重現(8/8失敗)。
- 修正：只改測試。按鈕後的固定等待改為`waitFor(條件)`(開場回合寫進日記、進入playing、拿到雲端格子、存檔視窗出現等，上限8秒)；已await的呼叫後面的短暫等待不動。
- 驗證：8份同時跑8/8通過(各44項)；全套71檔通過(Node 20)；再跑一次全套複查，沒有任何檔案需要自動重跑。
- 附帶發現(未處理，已回報使用者)：遊戲本身在AI書寫中(`aiWritingNow`)沒有擋「切換其他人生」等換state的操作，回合回來時會寫進當下的state。

### 2026-10-04 續（測試部）test-52人物大格人數時好時壞修正
- 原因：開局本來就可能有已故家人(例如單親家庭，抽樣12次出現1次)，舊斷言假設開局全員在世(`總人數＝在世＋1`)，碰到就失敗。改為記下加人之前的在世人數，斷言人物大格＝那個數字＋1(新增的失聯者算、已故者不算)。只改測試，遊戲不變。
- 驗證：test-52連跑8次通過；全套71檔通過(Node 20)。

### 2026-10-04 續（開發部）遊玩說明：一回合怎麼玩、第一次開局說明、重心小標題(2026.10.04-i)
- 依十六、16.18.1／16.18.2、二、2.6.3（2026-10-04 claude.ai定案；重心段刪「出社會以後就沒有這排按鈕」一句，使用者於Claude Code對話修改）。
- `index.html`：①`renderLegendModal()`最前面加「一回合怎麼玩」(回應／重心／一個人生有多長，照定案原文)，原「這段時間想做什麼」改名「興趣和副業怎麼選」排在其後，末句改為「你寫的內容會優先寫進故事，成長的部分還是看你選的重心。」；②新增`maybeShowIntroModal()`：`startLife()`領完啟程禮、進入playing後跳出精簡版說明(只有「開始」鈕)，開場回合照常在背後產生；按開始記`localStorage` `lifegame_intro_seen=1`，每台裝置一次；世代傳承(`familyChronicle`有內容)不跳；本機存取失敗時照常跳、照常關；③`renderFocusBar()`按鈕列上方加小標題「這段時間的重心」(`.focus-hint.focus-title`)，跟按鈕一起只在有重心時出現。不動存檔結構；`worker/`只換版本號(與頁面同步-i)。
- 實作判斷：跳窗時機＝建角流程完成、第一回合故事出來之前(使用者同意)；繼續玩既有人生不跳，要在這台裝置開新人生才看到(使用者同意)；轉世丹(再寫一次人生)不是世代傳承，這台裝置沒看過時會跳。
- 測試：新增`test-68-intro.mjs`；`tests/harness.mjs`的`loadGame`新增`intro`選項(預設視為已看過，避免既有測試多一個跳窗)；`test-39`按鈕下方小字的選擇器排除小標題。

### 2026-10-04 續（整理）首頁年齡註解更新(2026.10.04-h)
- `index.html`：16.10.0那段程式註解原寫「『適合幾歲的人』的說明文字照舊」，改為現況(常見問題已無年齡題)；只改註解，行為不變。版本與Worker版本同步換-h。
- 驗證：`cd tests && node run-all.mjs`全套(Node 20)。

### 2026-10-04 續（整理＋開發部）說明檔與設計文件一致性修正(2026.10.04-g)
- 依2026-10-04一致性檢查報告(A1～A16、B1～B11、C1～C11)與使用者定案的修正規格，只修正報告列出的項目，不新增規則；舊條文一律保留並加刪除線、註明取代來源。
- 步驟1 費用鐵律(A13)：先改`協作流程說明-共同基準.md`「真實API使用規則」(本機與自動測試預設示範、正式網址預設真AI、Claude Code自己測試不開真AI除非使用者該次明確同意)，再同步CLAUDE.md與WORKFLOW.md第1、3節。
- 步驟2 第十章(A1～A11、B1～B5)：turn_nonce上限改依1.2.9.18(5次)；啟程禮55點／15點／每把金鑰3次等舊寫法改依10.9.2第三批與10.12.5第三批；10.3.3／10.3.5／10.3.7／10.3.10／10.10.2加「只適用未登入、未綁定的本機人生」；`AP_TEST_KEYS`改依10.8.2只存門牌；10.13.6／10.13.7.7／10.13.7.9改依門牌改版；10.13.3「15或20回合」改為拉長分鐘數；10.1帳號系統、10.8各條(Worker不碰KV、隱藏金鑰畫面等)、10.9.1、10.9.2第三批、10.13.7.1雲端暫停的寫法改依10.13.3；10.13開頭實作狀態更正；00-總覽10/04日誌補記已實作。
- 步驟3：CLAUDE.md(10.8條改寫為10.13.3現況、人脈閒置衰退改依3.5.4、上次掃描記錄刪除重複段落、snapshots說明)；三、3.5.3；`worker/README.md`補`SAVE_LOCATION_SECRET`、`RESEND_API_KEY`，`SAVE_INDEX_SECRET`註明即將退場；十一、11.4；八、8.7；WORKFLOW.md(Pages自動部署、第5節第6步改用git比對不再存快照)；QA手冊34.10、34.16.1。
- 步驟4 年齡規則(A15)：五、5.6只保留「AI產生內容的尺度以成人玩家為對象」；16.10.0、16.10.6、1.2.11開頭、10.1第5條加刪除線；**`index.html`首頁常見問題刪除「適合幾歲的人？」**(八題→七題)，`tests/test-31-homepage.mjs`改為七題並新增「不出現年齡題」檢查；`APP_VERSION`／`WORKER_VERSION`換2026.10.04-g(Worker只換版本號)，RELEASE_NOTES加一筆，DEPLOY.md先加一行「尚未上線」(版本檢查測試要求)。
- 步驟5 目錄／編號／引用(C1～C10)：00-總覽目錄補漏(1.2.10、1.2.11、3.5.5、4.2.3、5.5、5.6、8.9、10.8.2、10.13.7、18.14)與狀態更新、4.6排序、1.2.19縮排；3.5.5、4.2.3、16.17.1移到正確位置(內容不變)；重複標題加a(10.9.3.1a、10.9.3.2a、QA手冊34.15a、34.15.1a)；全域日誌照日期由新到舊排序(同日期維持原相對順序)、移除中間分隔線；16章標題日期改09-28；10.3.12不再指向不存在的資安文件；刪除步驟0舊檔名；`node run-all.mjs`統一為`cd tests && node run-all.mjs`；WORKFLOW內部引用編號更正。
- 驗證：每步後`cd tests && node run-all.mjs --quick`全部通過(Node 20)；步驟4另跑全套70檔全部通過(test-43平行時失敗一次、單獨重跑通過，既有的不穩定)。首頁實機畫面未測試。

### 2026-10-04 續（開發部）雲端存檔狀態列移到標題月份後面(2026.10.04-f)
- `index.html`：`#cloud-save-tag-wrap`從`tb-sub`移進`tb-stage`標題後方，樣式微調；QA手冊新增34.18。版本與Worker版本同步換-f。畫面實機未測試。

### 2026-10-04（開發部）雲端自動存檔改為時間制＋存檔狀態列（十、10.13.3）
- `index.html`：`AUTO_SAVE_EVERY_TURNS`(10回合)改為`AUTO_SAVE_EVERY_MS`(10分鐘)；`autoSaveDue()`改為「距上次成功存雲端滿10分鐘 且 回合有推進」，新增`state.lastAutoCloudAt`／`cloudClockStart`(第一次檢查才起算)；人生結束存一次、失敗隔60秒重試、手動存成功重新計時照舊；讀檔規則(10.2.3)不動。新增頂部存檔狀態列(`cloudSaveTagHTML()`：X分鐘前／剛剛／小時前／失敗醒目文字，點一下＝`manualCloudSave()`)，只在真實API且雲端暫停(自動存檔模式)時出現。
- `tests/test-64-autosave.mjs`改為時間制(用把計時撥前10分鐘模擬)，新增「時間到但回合沒推進不存」「狀態列文字／失敗文字」。
- 新增欄位`lastAutoCloudAt`／`cloudClockStart`，舊存檔缺欄位時從第一次檢查起算，不影響舊存檔。尚未換`APP_VERSION`、未上線。
- 驗證：`node run-all.mjs`全套70檔通過(Node 20)；狀態列畫面(手機版面、深色模式、失敗醒目色)未測試，需實機。

## 2026-10-04 開發部（續三）：10.8.2存放位置改用金鑰的單向雜湊「門牌」（版本2026.10.04-d，尚未部署、尚未搬遷）

- 新增`worker/location.js`：門牌＝HMAC-SHA256(`SAVE_LOCATION_SECRET`, 統一格式後的金鑰)64碼；統一格式＝大寫、去掉空白與連字號(伺服器端)。Worker入口(`fetch`)把請求裡的`key`換成門牌，後面所有處理函式(存檔、行動點、用量…)的名稱組法不用改；沒帶金鑰的請求原樣放行；位置密鑰沒設或短於32字元＝存檔類／AI請求／綁定一律503；統一格式後是空字串回400
- 搬遷保險期(`withLocation`)：讀不到門牌位置時用請求原本的金鑰組出舊名稱再讀(含清單、刪除兩邊都刪)，每次改讀記在帳號DO的`loc:fb`；寫入只寫門牌位置；清理完成後DO旗標`loc:off`關閉保險功能
- 帳號DO：「金鑰→帳號」對照改`kl:門牌`(綁定時`account-routes.js`算好門牌傳進去，保險期內舊的`k:金鑰原文`也擋重複綁定)；管理端索引改`y:門牌:格子`(不再有內部代號與加密參照)；新增搬遷狀態、舊索引時間查詢、帳號金鑰列表(只給Worker算門牌)等操作
- 新增`worker/location-migrate.js`＋`save-admin.js`三個端點：`POST /admin/location-migrate`(必先試算；不覆蓋；衝突以格式正確那份為準、另一份列入清單；每次最多`LOCATION_OP_BUDGET`(預設100)次操作，做不完回partial可重跑；對帳通過後停用並起算保險期)、`POST /admin/location-cleanup`(保險期滿7天且改讀舊位置為0、對帳仍吻合才能執行；刪舊名稱、舊索引、舊對照、關保險功能)、`GET /admin/location-status`。報告與紀錄只有類型與門牌前8碼
- 管理端：查看／刪除改用門牌定位(`code`＝門牌前8碼.格子)；查看時改以「20碼十六進位金鑰格式」遮蔽(伺服器不再知道原文)；刪除存檔時保險期內舊名稱那份一併刪(避免從舊位置復活)；不再需要`SAVE_INDEX_SECRET`(只剩搬遷時讀舊索引時間用，清理後移除)
- `AP_TEST_KEYS`改存門牌(`isApTestKey`比對請求入口換好的門牌；名單若還放金鑰原文就不認)；新增`worker/scripts/loc-convert.mjs`(使用者在自己終端機執行，不回顯輸入、結果直接進剪貼簿、畫面不印金鑰／密鑰／門牌)
- 孤兒封存包每日清理：門牌名稱與舊名稱(算出門牌後)都比對主存檔；位置密鑰沒設好就不清
- 前端`index.html`只換版本號與RELEASE_NOTES(「內部整理，玩起來沒有不同」，依10.8.2不另行公告)
- 測試：`harness.mjs`預設帶測試用位置密鑰並提供同步版`H.loc(key)`；20個既有測試檔的KV名稱改用`H.loc`；`test-65`改寫成門牌版管理端；新增`test-67-location.mjs`(45項＋換算工具3項)
- 驗證：全套70檔通過（Node 20）；上線後(commit `742a373`，建置success、`/version`與頁面都是-d)：試算21筆無衝突→使用者確認→正式搬遷。
- **上線後發現**：Cloudflare KV的清單功能有延遲(剛寫入的新名稱約一分鐘內列不出來)，所以第一次正式搬遷複製成功、但同一次執行的對帳與索引重建掃描不到新名稱，回報「對帳未通過」(實際資料已在)；等清單同步後再執行一次，索引7筆、帳號對照2筆補齊，對帳通過。搬遷本來就可重複執行，不用改程式，但操作時要知道：**第一次正式搬遷後等一分鐘再跑第二次**。對帳通過：2026-10-03T18:47:45Z(台灣10/04 02:47)，保險期到台灣10/11 02:47

## 2026-10-04 開發部（續二）：10.13.7.11花費、回合、綁定與人生段數統計（版本2026.10.04-c）

- **設計文件**：新增10.13.7.11、00-總覽日誌（使用者在對話拍板：固定估價、花費與回合分開、今天／近7天以活躍玩家為分母、加每回合平均花費／綁定信箱人數／開啟人生段數）。10.13.7.3不變，不記個人累計。
- **用量計數器**（`worker/gate.js`）：每日回合數`tn:`、每日耗費`co:`（隨`add`累加，含失敗呼叫）、起算日`us_since`；`pvstats`一併回傳。回合數在回合成功時由`recordLidSeen`加1。
- **帳號DO**（`player_stats`）：新增綁定信箱人數（帳號建立日期）、開啟人生段數（人生代號第一次出現日期）。
- **端點／畫面**：`/stats-summary`新增`usage`、`accounts_bound`、`lives_started`、`daily[].turns/cost`；`/dashboard`第二排七張卡片，分母為0顯示「—」。
- **已知**：累計平均略偏低（老帳號沒玩也在分母）；價格調降時舊累計不重算。
- **測試**：`test-66`擴充到47項。

## 2026-10-04 開發部（續）：數據網頁「立即更新」加倒數提示（版本2026.10.04-b）

- `worker/dashboard.js`：按下後停用1分鐘的規則不變，停用期間按鈕顯示「N 秒後可再更新」。`test-66`對應檢查改看這段文字。

## 2026-10-04 開發部：十、10.13.7數據總覽（Worker／網頁版本2026.10.04-a）

- **設計文件**：新增10.13.7（10.13.7.1～10.13.7.10），連動10.13.6、10.13.2，00-總覽日誌「補充三」（commit `a01c783`已推）。
- **人生代號清單**（`worker/account.js`）：帳號DO新增`p:<lid>`（只記第一次／最後一次出現日期，同日不重複寫）、帳號`everLids`（曾綁過的人生代號，只增不減，綁定／併入／轉入／開新人生時加入）；`lid_seen`、`player_stats`兩個操作。玩家數每次查詢現算。
- **記錄時機**（`worker/worker.js`）：回合成功回應且不是開場才記（KV路徑與不碰KV路徑都有）；失敗只寫警告、不影響回合。
- **瀏覽人次**（`worker/gate.js` UsageCounter）：`POST /pv`只加每日總數＋開始計數日，來源白名單＋不經KV頻率限制；`index.html`載入時送一次（失敗不影響載入）。
- **端點**：`GET /stats-summary`（USAGE_ADMIN_TOKEN、不碰KV、no-store）；`GET /dashboard`（`worker/dashboard.js`，單頁、SVG折線圖、無外部資源、noindex、no-store）。
- **判斷（規格沒寫到）**：①「上線前就綁好的帳號」用帳號DO第一次運作時記下的`ledger_start`時間區分：之前建立且無人生代號紀錄的算玩家（建立日期為開始日），之後建立、沒玩過的不算；②活躍玩家以人生代號最後出現日期判斷（只存最後一次日期，足夠回答今天／近7天）；③儀表板「今日花費」讀`/usage-today`的`est_cost_twd`與`daily_spend_cap_twd`；④折線圖用藍(瀏覽)／珊瑚(新增)兩色＋實線／虛線＋圖例，未跑色盲驗證工具（該工具與Node 18不相容，且兩色另有線型區分）。
- **測試**：新增`tests/test-66-stats-dashboard.mjs`34項通過；全套（Node 20）見回報。
- **未測試**：`/dashboard`在真瀏覽器的畫面（只測了標頭與頁面內容字串，未實際渲染）、部署後盤點（10.13.7.10）。

## 2026-10-03 開發部（補充二）：封存包頻率限制與孤兒封存包每日清理（Worker／網頁版本2026.10.03-b；-a未上線，一併併入）

- **設計文件**：10.13.3「封存包寫入限制」改為五項，取代原三道限制（金鑰格式合規不要求已有主存檔、單包大小、每階段1次、每來源每小時60次、孤兒封存包7天清理）；00-總覽日誌加一行。
- **頻率限制**（`worker/worker.js` `stagePackRateOk`＋`worker/account.js` `opPackRate`）：同一來源（IP雜湊成16碼存放，不存原文）每小時最多寫入`STAGE_PACK_RATE_PER_HOUR`次（預設60），超過回429、不寫入；已存在的封存包重送不吃額度；計數放帳號Durable Object、不放KV，過去小時的計數順便清掉；沒有DO（測試）或計數服務出錯一律放行。
- **孤兒清理**（`cleanupOrphanStagePacks`，`export default.scheduled`每日呼叫，`wrangler.toml`新增`[triggers] crons = ["0 19 * * *"]`＝台灣03:00）：封存包寫入時記`at`；超過`STAGE_PACK_ORPHAN_DAYS`天（預設7）且這把金鑰三個格子都沒有主存檔就刪；**舊封存包沒有`at`**：第一次看到時補記現在時間、不當場刪（從那天起算7天）；清理後該階段可再傳一次；結果寫進執行紀錄「孤兒封存包清理：檢查N個，刪除M個」。兩個設定值只放Cloudflare後台Variables。
- **玩家端**：被429擋下時既有的失敗處理就夠用（自動存檔不跳窗、手動存到雲端會告知失敗），前端程式沒改，只換版本號。
- **驗證**：`tests/test-65-save-admin.mjs` 43/43通過（新增：第61次被擋且沒寫入、換來源／重送不吃額度、過一小時重算、上限與保留天數是設定值、計數不在KV、清理的各種情況、`scheduled`入口寫紀錄）。**未測試**：真實Cloudflare上排程是否照時間觸發、真實KV `list`分頁（測試替身一次回完全部）。

## 2026-10-03 開發部：10.13.3／10.13.6／10.12.5定案落實（Worker版本2026.10.03-a，只動`worker/`，網頁版不變）

- **設計文件**：10.13.3自動存檔細節、10.13.6管理端、10.12.5第三批啟程禮文字轉為【定案】，取代三則【待確認】；10.13.2補「同意頁不加管理端告知」；00-總覽日誌加一行。
- **封存包每階段只寫1次**（`worker/worker.js` `handleStagePackSave`）：已存在就不覆蓋、回`{success:true, existed:true}`，前端照常標成已上傳。暫停期間封存包與主存檔本來就開放寫入（`MANUAL_SAVE_PATHS`），沒有改；兩者都只寫KV、不呼叫AI。
- **管理端**（`worker/save-admin.js`）：`GET /admin/roster`改為必填who／reason、先寫存取紀錄，只回信箱、人生代號、綁定日期、最後存檔時間（不再回啟程禮與同意狀態）；`GET /admin/saves`只回lid與最後存檔時間（缺lid的舊存檔才多給內部代號`code`當查看把手）；查看／刪除改成可用`lid`指定；查看結果多回`text`＝依人生階段整理的可讀文字（已上傳的封存包從KV讀回接在前面，每階段附日記），加`&raw=1`才附原始state，文字裡的復原金鑰一律遮蔽；存取紀錄新增`action:"roster"`。
- **手動「存到雲端」成功／失敗告知**：原本就有（`manualCloudSave`的成功／失敗視窗），沒改。**啟程禮文字**：程式裡四段已是「再領30點」，全專案搜尋沒有殘留的「補到55點」；唯一保留的是10.13.2規定的綁定頁一句「綁定後會收到啟程禮」。
- **密鑰**：`wrangler secret list`確認`SAVE_ADMIN_TOKEN`、`SAVE_INDEX_SECRET`都已在Cloudflare設定（只看名稱）；程式碼、`wrangler.toml`、README、設定說明裡只有名稱沒有值。
- **驗證**：`tests/test-65-save-admin.mjs`改寫並新增封存包只寫一次、依階段的可讀文字、名冊必填who與reason並留紀錄等項目，33/33通過。**注意**：本機Node 18沒有全域`crypto`，跑這支測試要加`NODE_OPTIONS=--experimental-global-webcrypto`（改動前就是如此，與本次無關）。需要真實Cloudflare部署／真實KV驗證的項目：未測試。

## 2026-10-01
**〔續33：Worker /version直接用瀏覽器網址列查得到（版本2026.10.01-c）〕**原本`/version`排在來源白名單檢查之後，網址列直接打開沒有Origin標頭會回「來源不被允許」；改成沒有Origin標頭的GET /version放行(只回版本號、不碰KV)，有Origin但不在白名單的請求照舊回403。`tests/test-54-version.mjs`新增對應檢查；網頁只換版本號與一則更新說明(內部整理)。DEPLOY.md的查法同步改正。Worker有改，要部署。

**〔續32：十、10.13.6管理端＋存檔索引（併入版本2026.10.01-b，尚未部署）〕**Worker新增`worker/save-admin.js`：存檔寫入KV後(`handleSave`)順便把索引寫進帳號Durable Object(內部代號＝HMAC-SHA256(`SAVE_INDEX_SECRET`, 金鑰|格子)前24碼；指回存檔的參照用AES-GCM加密，索引／回應／存取紀錄都沒有復原金鑰原文；沒設密鑰就不建索引、管理端503；舊存檔下次寫入時補建，不回填)；管理網址`/admin/roster`、`/admin/saves`、`/admin/save`(必填who與reason、先記錄再給看、內容遮蔽復原金鑰)、`/admin/save/delete`、`/admin/access-log`(DO儲存、保留180天)，獨立密碼`SAVE_ADMIN_TOKEN`；`account.js`新增對應DO操作。玩家端存讀檔路徑沒變。`tests/harness.mjs`的假DO補`list`；新增`tests/test-65-save-admin.mjs`；設定步驟寫進`設定說明_帳號與寄信.md`與`worker/README.md`。**Worker有改，要先設兩個secret再部署**。`/admin/usage`沒另做，用量沿用`/usage-today`、`/usage-summary`。管理端目前只有API，沒有網頁介面。

**〔續31：十、10.13.3自動存檔＋取消進站年齡確認（版本2026.10.01-b）〕**`index.html`：新增`AUTO_SAVE_EVERY_TURNS`(10，【測試參數】)／`autoSaveDue()`／`autoCloudSave()`／`autoCloudSaveOnce()`／`ensureCloudHome()`(手動存與自動存共用的雲端位置)；`saveGame()`在雲端暫停時，若這段人生距上次自動存已滿10回合、或進入ending且還沒存過，就在背景存一次(同一格覆蓋；失敗不跳窗，`AUTO_SAVE_RETRY_MS`後的下一次存檔再試；示範模式、沒有同意紀錄、雲端全面打開時不走這條)；`cloudUploadState()`上傳前先補傳已結束階段的封存包(長壽人生才不會超過1MB，手動存也一起受惠)；`ensureArchivedContent()`在暫停期間改看這段人生的雲端位置，換裝置拿回後能補回封存包；手動存的提示文字改成「也會每10回合自動存」。取消進站年齡確認視窗(使用者指示)：移除`renderAgeGate()`、`ageConfirmed()`與相關CSS／綁定，`tests/test-31-homepage.mjs`對應改寫。Worker：暫停期間的開放網址表`MANUAL_SAVE_PATHS`改成每個網址可有多個方法，新增開放`/stage-pack`(POST、GET)。新增`tests/test-64-autosave.mjs`。**Worker有改，要部署**；沒有新增存檔欄位以外的結構變動(`lastAutoCloudTurn`、`autoSavedEnding`)，舊存檔照常可讀。管理端(10.13.6)尚未實作；首頁常見問題「存檔會不見嗎」「免註冊，進度自動存在這台裝置」文案尚未改(文案屬16.10，待使用者定案)。

**〔續30：十、10.13.2開場同意頁（版本2026.10.01-a）〕**`index.html`：新增`CONSENT_VERSION`(1)／`getConsent()`／`hasValidConsent()`／`recordConsent()`／`showConsentGate()`／`renderPrivacyModal()`；`initApp()`進站時沒有有效同意紀錄(不存在、壞掉、版本低於目前)就擋一頁，按〔不同意〕留在本頁提示，〔同意並開始〕記`{v,at}`到localStorage(`lifegame_consent`)並在`saveGame()`／`saveLocalOnly()`寫進`state.consent`隨存檔上傳；選單新增「隱私說明」、綁定說明頁縮成一句話＋連結、用信箱登入／換綁只放一行連結。Worker：新增`POST /account/consent`(`account.js`的`opConsent`，`account.me`回`consent`)，已綁信箱者同意紀錄另記在帳號資料；前端在同意後與`refreshAccount()`成功後自動補送一次(同一份紀錄只送一次)。`tests/harness.mjs`新增`consent`選項(預設視為已同意，`consent:false`＝全新玩家)，新增`tests/test-63-consent.mjs`。**Worker有改，要部署**；遊戲狀態多一個`state.consent`欄位，舊存檔不受影響(沒有就當沒同意，下次開啟會先看到同意頁)。自動存檔(10.13.3)與管理端(10.13.6)尚未實作。

## 2026-10-02
**〔10.2.3衝突整理定案落實（版本2026.10.02-a，十、10.2.3.1）〕**設計文件：claude.ai網頁版討論拍板，新增`10-存檔與帳號系統.md` 10.2.3.1(A1～A4、B1～B3、C)，10.2.3「待使用者確認」全部清除，10.9.2／10.9.3標題改「封測期間生效」、10.9.3.2未綁啟程禮15點改25點、10.9.2補第9點(A2)，`00-總覽.md`日誌一行。**程式**：①A3`worker/worker.js` `callAnthropic()`——Anthropic回傳失敗(非2xx)或連線失敗也計入每日花費(玩家端失敗照舊不扣點、不算回合，沒改)；②B2`index.html` `acctCloudSaveAccepted()`——示範模式(`USE_MOCK`)綁定／登入併入時不上傳存檔；③B1併入上限本來就是每段60點(每日池5＋一般點55)、累計120點，只改文件；④A2程式本來就成立(`unboundFullNotice()`數本機人生)，只補測試。**測試**：`test-59`失敗呼叫改為計入(2次＝2元、後續門檻數字跟著調)；`test-61`新增示範模式綁定不上傳2項(確認拿掉修正會失敗)；`test-60`新增A2登出後保留人生且不能開新人生1項。版本2026.10.02-a(頁面與Worker，內容為玩家看不出差異)。**未測試**：真實Cloudflare上失敗呼叫的計數、真實API。舊存檔不受影響、不需清空。

## 2026-09-30
**〔續29：綁定信箱入口更直覺（版本2026.09.30-i，十、10.12.5）〕** 錢包「綁定信箱」改獨立按鈕、說明在旁邊、「用信箱登入」也改按鈕；上方「行動點」加虛線底線；「存檔・設定」新增帳號一列（未綁→綁定說明頁／已綁→錢包含登出、換綁）。改動：`index.html`、`tests/test-60`（通過）、設計文件10.2.3附近、`DEPLOY.md`；`worker.js`只換版本號。


**〔續28：第三批——未綁25點、綁定+30、正式網址預設真AI（版本2026.09.30-h）〕**使用者決定：未綁信箱仍可玩，啟程禮改**25點**(每台裝置／金鑰只領1次、同時只能1段人生)；綁定信箱改為再領**30點**(25＋30＝55，取代第二批「補到55點」)；帳號開第2段人生的第2份維持+55；封測直接開放(雲端存檔維持暫停)；正式網址預設真AI。節奏對照：上學期27回合的寒假從第20回合開始，25點用到寒假倒數第2回合、55點約一學年。**程式**：`worker/ap.js`新增`AP_UNBOUND_GIFT=25`／`AP_BIND_BONUS=30`／`AP_SECOND_LIFE_GIFT=55`／`AP_LEGACY_GIFT_MAX=55`(封測舊人生併入上限)、`AP_GIFT_CLAIMS_PER_KEY`與`worker.js`的`GIFT_CLAIMS_PER_KEY`改1；`account.js`第1份改固定+30(移除「補到55、增加0不占份數」特例，一定占用當天份數)、第2份+55；`index.html`同步常數、`startLife()`／首頁FAQ／四則訊息(第2/3/7則與綁定說明頁：「再領30點」「多了30點」)，新增`unboundFullNotice()`＋`newLifeBlockedNotice()`(未綁且已有1段→擋新人生、選格子畫面也擋)，`USE_MOCK`改依網址：旗標`lifegame_force_real_api`＝yes真／no示範優先，沒旗標時`lifegame-6an.pages.dev`＝真AI、其他＝示範(`setApiMode()`配合開發者切換，正式網址切回示範要寫no)；`RELEASE_NOTES`加-h，`WORKER_VERSION`／`APP_VERSION`＝2026.09.30-h。**文件**：10.3.4、10.9.2第2/3/5點(保留原規則註記)、新增「10.9.2第三批補充」「10.12.5第三批補充」、10.2.3兩條判斷標為已取代；`00-總覽.md`日誌；`公告草稿_已知狀況.md`啟程禮說明、`設定說明`、`DEPLOY.md`加開放封測前檢查清單。**測試**：改test-1／2／31／43／54(錢包)／55／56／58／60／61的數字與文字；新增`test-62-unbound-rules.mjs`17項(未綁25點、只領1次、同時1段、綁定+30、正式網址預設真AI、旗標優先、切換寫旗標)；harness的`loadGame`加`host`參數。**順手發現**：test-60的花費上限段原本靠「重設測試時鐘」讓計數歸零，系統時鐘跨過台灣午夜就會失效，已改成「上限＝目前花費＋1」，不再依賴時鐘。全套結果見下方驗證。**未測試**：正式網址的真實AI呼叫(要使用者上線後自己玩，或同意才呼叫)、真實Resend。舊存檔相容：不需清空；已領過55點的封測玩家不追回，多段人生保留。

**〔續27：十、10.2／10.9.2／10.9.3／10.12.5第二批實作——帳號系統、寄信、共用錢包、綁定、啟程禮、花費上限擋人（版本2026.09.30-g）〕**設計文件(claude.ai網頁版定案，全部寫入)：`10-存檔與帳號系統.md`改寫10.2(信箱登入：6位數驗證碼、10分鐘、輸錯5次作廢、登入90天)、新增10.2.1驗證信防濫用／10.2.2寄信服務與設定(原10.2.1準備清單由它與新檔取代，保留一行「原規則」註記)／10.2.3實作判斷與交件回報(待使用者確認)；10.9.2第5、6點改寫並加「10.9.2補充」，10.9.3加「10.9.3補充(啟程禮發放與排隊)」「10.9.3.1補充(花費上限)」「10.9.3.2補充(從未購買過)」，10.12.5加「第二批上線訊息」(第2/3/4/7則取代文字，保留原文字)；`00-總覽.md`目錄與日誌各一行(日誌用規格的原文)。新檔`設定說明_帳號與寄信.md`＝給擁有者的Resend／DNS／Worker secret／後台變數逐步說明。**Worker**(版本2026.09.30-g)：新增`account.js`(Durable Object `AccountStore`，全站單一實例：帳號、驗證碼、寄信次數、工作階段、共用錢包、啟程禮每日份數與排隊)、`account-routes.js`(`POST /account/send-code|bind|login|logout|change-email|lives|wallet`、`GET /account/me`、`GET /gate`)、`mail.js`(Resend寄信、驗證信與四種管理通知信內容)、`gate.js`(`UsageCounter`擴充：每次成功AI呼叫記估價、上限閘門、80%／上限／啟程禮15份／發滿四種通知，寄成功才記已通知、失敗於下一次AI呼叫重試最多3次)、`http.js`；`worker.js`：AI代理最前面先過花費上限閘門(碰到上限→503 `daily_cap_reached`，不扣點、不呼叫AI；有購買紀錄的帳號放行)，body帶`wallet:true`＋登入token時走帳號錢包預扣(同一turn_nonce只扣一次、開場免費、失敗退點，回顧這一生成功才扣5點)，CORS允許`Authorization`標頭，設定名稱`DAILY_SPEND_CAP`(舊`DAILY_SPEND_CAP_TWD`仍認得)／`DAILY_GIFT_CAP`／`DAILY_VERIFY_EMAIL_CAP`／`AI_CALL_COST_ESTIMATE`／`ADMIN_NOTIFY_EMAIL`／secret `RESEND_API_KEY`，`GET /usage-today`加花費(累計，不是呼叫次數×估價)、啟程禮份數、通知狀態、今日驗證信數與寄信設定是否齊全；`wrangler.toml`加`ACCOUNTS`綁定與migration v2(`AccountStore`)。**每回合KV寫入次數：沒有增加**(帳號、錢包、計數全在Durable Object，封測期間平常KV仍是0次)。**前端**(`index.html`，版本2026.09.30-g)：新增帳號用戶端(`acct`、`acctFetch`、登入token存本機、90天沒用才失效)；「帳號人生」＝存檔有`acct:{aid,lid}`且這台裝置登入同一帳號，行動點改用帳號共用錢包(`totalAP/spendAP/refundAP/refillDailyIfNeeded`加錢包分支，mock模式改由`POST /account/wallet`扣)；綁定／登入／換綁流程視窗(說明頁→信箱→驗證碼，重寄鈕倒數60秒、〔信箱打錯了〕、各種錯誤文字、綁到已有帳號→拒絕並提供〔改用這個信箱登入〕)；登入併入(未綁人生依序收進帳號最多2段、超額留在原金鑰、點數併入錢包)、手動〔轉進帳號〕、登出(本機帳號人生退回本機點數池且從0開始)、換綁信箱；開新人生時登記進帳號(第一次開到第2段發第2份啟程禮)、帳號滿2段不能開新人生、人生結束／刪除通知伺服器空出格子(沒登入先記著)；撰稿人第2則(點數用完，未綁信箱)、第3則(錢包常駐一行)、第4則(花費上限暫停，每個台灣日跳窗一次＋輸入列上方小字＋文字保留＋開場回合〔重新送出〕)、第7則(三種文字，按鈕〔繼續寫〕)；`accountEmailBound()`依實際綁定狀態；點數明細加「啟程禮補發」「啟程禮（第 2 份）」「帳號併入」；首頁加「已有帳號？用信箱登入」與「拿回雲端的人生」；`RELEASE_NOTES`加一筆。**交件回報①：同時遊玩以最後一次存檔為準**——寫入端原本就是最後寫入者贏(`/save`直接覆蓋)；讀取端有缺口(`mergeCloudWithLocal`只比回合數、`restoreFromCloud`一律用雲端蓋掉本機)，已補：每次存檔記`savedAt`，合併兩邊都有時間就比時間、舊存檔才比回合數，手動拿回時本機比雲端新就先問過再覆蓋。**交件回報②：花費計數存放**——Durable Object(SQLite)，理由是同一實例一次只處理一件事、加1是原子的，KV是最後寫入者贏會漏算，且不增加KV寫入。**測試**(全程假上游＋假Resend，沒有打真實API、沒有寄真信)：新增`test-57-account-auth.mjs`39項(驗證碼規則、90天、多裝置登出、防濫用數值、寄信內容、信箱正規化)、`test-58-account-wallet.mjs`63項(首次綁定／綁到已有帳號被拒／登入併入／併入超過2段／第2份啟程禮／每日補點／錢包扣點與退點／換綁／啟程禮每日上限與排隊補發)、`test-59-spend-cap.mjs`42項(**`DAILY_SPEND_CAP`暫調為1**：暫停、80%與上限通知信、午夜恢復、當天調高立刻解除、通知失敗重試3次、有購買紀錄放行；**`DAILY_GIFT_CAP`暫調為1**：排隊、隔天補發、15份／發滿通知)、`test-60-account-ui.mjs`57項與`test-61-account-ui2.mjs`36項(前端四種綁定情境、第2/3/4/7則訊息、錢包模式、換裝置拿回人生、最後存檔為準、換綁)；更新test-54(版本／錢包)與test-56(第2則取代第1則的語境)。全套64檔通過(402秒；test-31在平行跑時偶爾失敗、單獨重跑通過，是原本就有的時間相依)。**前端測試順手抓到的bug**：`syncWallet`存的是伺服器回報物件本身，`refundAP`就地改動它，失敗退點會多退1點——已改成複製一份；「撰稿人休息中」小字消失時重畫會清掉輸入框——已改成保留草稿。**未測試(需要真實服務)**：真的Resend寄出驗證信與管理通知信(DNS驗證、寄件網域、垃圾信匣)、Cloudflare上的Durable Object migration與`ACCOUNTS`綁定、正式環境的花費上限暫停(需真實AI呼叫，要先問過使用者)、真實瀏覽器的驗證碼輸入(手機自動帶入)。**舊存檔相容**：存檔多了選填欄位`acct`與`savedAt`，舊存檔照常讀、不需要清空；沒有綁定的玩家行為完全不變。**使用者要做的事**：照`設定說明_帳號與寄信.md`設定Resend、DNS、`RESEND_API_KEY`與後台變數，再合併上線；設定完成前，「寄送驗證碼」會顯示「現在寄不出驗證碼」。

### 續25（開發部）修正「拿回雲端進度」畫面的「回首頁」沒反應
- 原因：`bindSlotPicker()`在`state.fromCloud`時先`return`去綁`bindCloudPicker()`，`btn-slot-home`沒綁到。改成先綁回首頁再判斷fromCloud。
- 版本2026.09.30-g（`APP_VERSION`／`WORKER_VERSION`，Worker只換版本號）。
- 驗證：全套測試見回報。

**〔續26：十、10.9.2／10.9.3／10.10.6改寫＋10.12撰稿人＋第一批實作（版本2026.09.30-f）〕**設計文件(claude.ai網頁版定案，全部規格寫入、程式只做第一批)：`10-存檔與帳號系統.md`改寫10.9.2(帳號共用錢包、每日補點沿用「補到上限」＝5點×人生數、綁定與合併規則)、10.9.3(每日花費上限500元、啟程禮每日20份，兩個都是後台可調設定值，取代原1,000元與IP／30份上限)並拆10.9.3.1～10.9.3.4、10.10.5(轉點取消)、10.10.6(只留兩個提示時機)，新增10.12撰稿人(八則訊息、10.12.6連線失敗不扣點、10.12.7分批說明)；`00-總覽.md`目錄與日誌各一行；10.3.8、10.7.4加註「文字依10.12」。**程式第一批**(`index.html`)：①點數用完跳窗改第1則文字，按鈕〔打開錢包〕〔好的〕(所有玩家一律用這則，第2、3則等帳號系統)，畫面底部用完提示同改；②第5則存檔失敗小條(本機空間不夠與雲端同步沒成功共用，附〔再試一次〕＝重新存)；③第6則連線失敗(日記錯誤那則、畫面錯誤條、回顧這一生失敗)，按鈕改〔重新送出〕；④第8則每日補點提示(`showDailyRefillToast()`，`apLogAdd`記到「每日補點」才出現，餘額已達上限不補就不出現，4秒收起)；⑤10.12.6確認：前端失敗一律`refundAP()`、Worker失敗一律`postCharge(...,false)`退點，原本就不扣點，沒有要修；前端沒有另設逾時計時器(瀏覽器自己逾時才會走到失敗)。舊提示：程式裡本來就沒有「啟程點剩5點以下」提醒，也沒有點數用完的綁定說明，沒有東西要移除。Worker(`worker/worker.js`，版本2026.09.30-f)：新增全站當天用量計數——**Durable Object(SQLite) `UsageCounter`**，不是KV，所以不增加每回合KV寫入、雲端存檔關閉時也照計；`callAnthropic()`每次成功呼叫計1次(估計1元)，台灣時間午夜歸零；新增`GET /usage-today`(同`USAGE_ADMIN_TOKEN`，回傳日期／次數／估計花費／兩個設定值／佔上限比例)；`DAILY_SPEND_CAP_TWD`、`DAILY_GIFT_CAP`從後台環境變數讀(預設500／20)，`wrangler.toml`只加DO綁定與migrations、**不寫這兩個數字**。測試：新增`test-56-writer-messages.mjs`21項；更新test-2、test-42對應文字。**需要使用者到Cloudflare後台做的事**：Settings→Variables新增`DAILY_SPEND_CAP_TWD`=500、`DAILY_GIFT_CAP`=20(不新增也能跑，用預設)；部署後確認Bindings有`USAGE_COUNTER`。**未測試**：真的Cloudflare上DO是否部署成功(只用記憶體假DO在node測過)；手機實機看小條與按鈕。第二批(帳號系統後)：共用錢包、綁定與合併、啟程禮發放與排隊、寄信、花費上限真正擋人、第2／3／4／7則訊息。舊存檔不受影響。

**〔續25：十、10.10.3.1 續22補充（版本2026.09.30-e）〕**設計文件：`10-存檔與帳號系統.md`新增10.10.3.1(啟程禮命名、錢包欄位改看帳號、失敗回合、時間格式)，`00-總覽.md`目錄與日誌各一行。程式(`index.html`)：`giftClaimedFor()`改成「這條人生領過 或 這台裝置這把金鑰的本機領取計數>0」＝已領(帳號系統前帳號＝這台裝置，不寫死份數)；`apLogTurn()`註解補上兩台裝置／每日補點會混入差值的提醒；其餘4項(舊名無殘留、一次送出一筆、變動＝餘額差、台灣時間月/日 時:分)先前已符合。版本2026.09.30-e(頁面與Worker，Worker只換版本號)。測試：test-55新增2項(裝置領過＝已領、沒領過＝未領)；全套58檔通過(test-54補DEPLOY.md紀錄後)。舊存檔不受影響、不需清空。

**〔續24：四、4.9 人物的職業／就學欄＋單價查詢日期（版本2026.09.30-d）〕**設計文件：`04-角色卡與人生歷史系統.md`新增4.9(使用者於Claude Code討論定案)，`00-總覽.md`目錄與日誌各一行。程式(`index.html`)：原本的`npcAffiliation()`改寫成`npcOccupationText()`一套規則，人物詳細頁(`renderNpcDetailModal`)在「目前關係」下方加「職業：」(`npcOccupationLabel()`，沒資料寫「未知」)，傳給AI的`school_or_job`用同一套(`npcAffiliation()`，未知不傳)：劇情交代的`affiliation`優先→父母開局職業(已退休「已退休（原本是○○）」、已故保留、「長期不在身邊」寫「在外地工作」，**父母職業原本每回合都沒送給AI，現在會送**)→兄弟姊妹、子女依年齡「還沒上學／讀國小／讀國中／讀高中」、18歲起看人物卡新欄位`path`→配偶`spouseOccupationCategory`→同學(只有關係本身就是同學才算，修正「同學的姊姊」被當成同校)→同事主管下屬「跟你同公司」→關係裡的老師／教授。`updateFamilyPath()`：滿18歲擲讀大學80%(`FAMILY_COLLEGE_RATE`【測試參數】)或工作＋職業類別(不含從政)，讀大學的滿22歲畢業擲職業類別；在`syncBirthdayAge()`跨過生日時、`migrateLoadedState()`讀舊存檔時、`buildUserMessage()`每回合送出前執行。職業類別顯示名稱`OCCUPATION_DISPLAY_NAMES`(4.9.4)。存檔多一個人物卡欄位`path`，舊存檔載入時自動補，**不用清空重來**。另外處理續23待辦：`worker/usage.js`的`PRICE_CHECKED_ON`改成2026-09-30、註解補上優惠價已轉正式價(單價不變)。版本號頁面與Worker都換成2026.09.30-d，`RELEASE_NOTES`加一筆，`DEPLOY.md`補一行。測試：新增`test-56-occupation.mjs`；`test-41`弟弟的就學由「國中」改為「讀國中」、`test-3`單價查詢日期改檢查2026-09-30。全套58檔通過。

**〔續23：十、10.9.7第3項單價核對（純查核，程式未動）〕**2026-09-30晚間查Anthropic官網定價頁，Claude Sonnet 5單價與`worker/usage.js`完全一致(輸入$2、5分鐘快取寫入$2.50、快取讀取$0.20、輸出$10／每百萬token)；官網註記原本「到8/31的上市優惠價」已轉為正式價，9/1漲到$3／$15的計畫取消。**`PRICE_CHECKED_ON`仍是2026-09-25、尚未改**：使用者決定等下次本來就要改Worker時順便改成2026-09-30並在註解補上「優惠價已轉正式價」(避免只為改日期就換版本號、多一筆沒內容的更新紀錄)。

**〔續22：十、10.11玩家回報機制＋10.10.3第二版點數紀錄＋「啟程禮」改名（claude.ai網頁版2026-09-30第二批定案）〕**
設計文件：`10-存檔與帳號系統.md`新增10.11(兩份Google表單、回報帳務問題兩步流程與複製內容格式、回報遊戲問題)；10.10.3改寫(記全部點數異動含每回合扣點與開場、新增「結果」欄、失敗回合記「0｜回合｜失敗」)；10.10.4整節由10.11.3取代(舊條文用刪除線保留)；10.9.4補「先查核現有匯出、報告逐筆記錄有效起點」、10.9.7新增第5項；10.8重新打開前檢查清單新增「人生之書章節額度」；全章、16.10.6首頁FAQ、公告草稿「新手禮包／禮包點／見面禮」改「啟程禮／啟程點」(第一次出現處加註改名)；`00-總覽.md`目錄與日誌補一行。
程式(`index.html`)：①`apLogAdd()`改記「時間、實際最終變動、原因、結果(`ok`)」，新增`apLogTurn()`：`takeTurn()`每次送出只寫一筆，成功＝實際扣的點(開場0)、失敗＝「扣點後退回」的淨變動(通常0，若伺服器端真的扣了卻沒內容會是-1，對帳用)；送出期間伺服器端剛好補點的量另記「每日補點」、不算進這一筆；測試不扣點期間不寫入；舊存檔紀錄沒有`ok`欄一律當成功、「新手禮包」顯示為「啟程禮」；②錢包紀錄每筆顯示「月/日 時:分　原因　變動　結果」，變動用「+5／-1／0」(ASCII減號)；③10.11：`REPORT_FORM_URLS`(兩個表單連結集中在一處)、`openReportForm()`(新分頁、noopener、網址不帶參數)、「回報帳務問題」在錢包內(`copyToClipboardNow()`在點按事件裡同步複製→`renderBillingReportModal()`提示「已複製，請到表單貼在『問題說明』欄」＋「前往表單」按鈕；複製失敗或瀏覽器沒有剪貼簿功能改跳唯讀文字框、內容已全選、旁邊同樣有「前往表單」)、`walletReportText()`依10.11.4格式(複製時間、目前餘額、信箱、啟程禮、最近補點、最近5筆，全用台灣時間，只讀點數與紀錄，不碰復原金鑰、信箱、故事正文；沒有每日補點紀錄時整行不寫；沒有紀錄寫「目前沒有紀錄」)；選單「存檔・設定」新增「回報遊戲問題」(與「行動點錢包」並列，直接開遊戲問題表單新分頁，不複製、畫面不動)；原本的`BILLING_REPORT_FORM_URL`空字串(沒設網址按鈕不出現)已移除；④玩家可見文字改名：錢包「啟程點」、首頁FAQ「啟程禮」(原「見面禮」)、刪除人生確認視窗「啟程點會消失」、測試面板；程式內部欄位名稱(`ap.gift`、`AP_NEW_LIFE_GIFT`、Worker的`/claim-gift`)不改，舊存檔照常可玩；⑤更新紀錄(`RELEASE_NOTES`)2026.09.30-a補兩條(點數錢包與啟程禮、兩顆回報按鈕；頁面版本仍是`2026.09.30-a`，因為這一版還沒上傳Pages)；⑥新增`state.giftGranted`(這條人生領過啟程禮，轉世／傳承沿用)，只用來寫「啟程禮：已領／未領」。**舊存檔可繼續玩**。**沒有改Worker**(Worker程式註解裡仍有「禮包」字樣，不是玩家可見文字，未改)。
測試：新增`test-55-player-report.mjs`38/38通過(含失敗回合只留一筆「0｜回合｜失敗」、雲端暫停本機先扣再退、複製內容格式與不含金鑰、複製失敗備案文字框全選、兩顆按鈕開對的表單、台灣時間換算、10.9.7第4項不呼叫AI)；更新test-54(錢包)與test-31(首頁FAQ)對應斷言；全套57檔通過(378秒；test-31在平行跑時偶爾失敗、單獨重跑通過，是原本就有的時間相依)。
**10.9.4查核結果(回報使用者)**：沿用了什麼＝現有「這一世累計」(`state.devUsage`)、上一回合用量、Worker回傳的`lifegame.usage`、測試選單的下載工具；現有的下載只有故事Markdown、沒有逐筆用量。補了什麼＝續19的逐筆呼叫紀錄與CSV匯出(本批沒有再補欄位)。**逐筆記錄從什麼時間點開始有效**：從玩家的瀏覽器載入含續19程式的`index.html`(頁面版本2026.09.30-a，尚未上傳Pages)之後、第一次真實API呼叫起；在這之前的呼叫(包含使用者實測的130次)沒有逐筆資料；紀錄只在該瀏覽器本機，換瀏覽器或清資料就沒有。
**10.9.7查核結果**：①章節額度：**沒有檢查**(封測期間走`handleAIProxyNoKV`不呼叫`preChapter`，前端也沒有另外限制)，已列入10.8重新打開前檢查清單；②130次比124回合多出的6次：**仍查不出是哪一種**(沒有逐筆類型資料，只知道「這一世累計」每次AI呼叫都+1，含開場、章節、放置摘要、回顧這一生、失敗重試、日期重新生成、品質重新產生)；累計數字**有**包含不扣點呼叫；之後有逐筆紀錄就能拆；③`worker/usage.js`模型`claude-sonnet-5`與`worker.js`的`ALLOWED_MODEL`一致，**單價查詢日期沒有更新**(本環境不能上官網核對，需要使用者確認單價後再改日期)；④開啟回憶錄、人生之書閱讀頁、行動點錢包都不呼叫AI＝**通過**(test-55，假上游呼叫數不變)；⑤現有匯出與紀錄功能：原本只有故事Markdown下載，無逐筆用量；現在有逐筆呼叫紀錄CSV(欄位見`callLogCSV()`：時間、回合、類型、四種token、估計花費、送出各區塊字數、輸出旁白／其他欄位字數)。
**10.11.7自我確認**：1 兩顆按鈕各開對的表單＝通過(test-55，jsdom攔截`window.open`看網址)；2 複製內容不含復原金鑰與信箱＝通過；3 複製失敗文字框出現且已全選＝通過；4 沒有每日補點紀錄沒有「最近補點」行＝通過；5 沒有紀錄顯示「目前沒有紀錄」＝通過；6 失敗回合「0｜回合｜失敗」、同一次送出的重試只留一筆＝通過；7 時間為台灣時間＝通過(UTC 6:12→9/30 14:12、UTC 16:05→10/1 00:05)。**未測試**：手機瀏覽器實機的剪貼簿權限(iOS Safari／LINE內建瀏覽器等)、實機上Google表單在新分頁開啟與返回遊戲、錢包紀錄在小螢幕的排版、真實API下伺服器端扣點後失敗會不會出現「-1｜回合｜失敗」(需真實API，只有假上游測過0)。
**實作判斷(請使用者確認)**：①「見面禮」也改成「啟程禮」；②封測期間「信箱」固定寫「未綁」、「啟程禮」寫已領／未領(以這條人生有沒有領到為準)，帳號系統上線後再改「已領 N／2 份」；③「同一個turn_nonce合併」實作為同一次送出只寫一筆，玩家事後按「再試一次」是新的一回合，失敗那筆保留、再試成功另寫一筆(已寫進10.10.3的【實作說明】)；④伺服器端模式下失敗回合的變動＝結束後餘額－扣點前餘額，所以真的被扣卻沒內容時會如實記「-1｜回合｜失敗」；⑤錢包每筆顯示「月/日 時:分」而不是只有日期，方便對帳。

**合併整理(續22補記)**：分支併入最新master時，CHANGELOG兩邊都叫「續21」，本段改編號續22；更新說明原本被寫進已上線的2026.09.30-a，改拆成新版2026.09.30-c(`APP_VERSION`換-c、`RELEASE_NOTES`最前面新增一筆、`DEPLOY.md`補一行；Worker只換`WORKER_VERSION`為-c、邏輯沒動，因為test-54要求兩邊版本一致)。

**〔續21：玩家網址改為 lifegame-6an.pages.dev〕**Pages改連GitHub自動部署(`build-pages.sh`只放index.html/og.png/lunar.min.js進`dist/`)、Worker改由Cloudflare Builds自動部署；`index.html`的`og:url`/`og:image`/`SHARE_URL`換成新網址，Worker白名單已含新舊兩個網址，版本號頁面與Worker同為2026.09.30-b，`RELEASE_NOTES`加一筆。`test-31`的og:image預期值同步改。驗證：全套56檔通過、語法檢查通過(平行跑時test-31偶發失敗、單獨重跑通過，非本次改動造成)。未測試：新網址實機分享圖(需使用者實機確認)。

**〔續20：修 test-41「B3 AI還在寫期中考」〕**原因是真的程式問題，不只是測試不穩：期中考分數等正文淡入完才公布的計時器(`playTurnEffects`)，沒有記住自己是替哪一筆分數排的；前一回合留下的計時器在約1秒後到期，會把下一回合「還在寫」的分數提早公布(快速連按或機器快時才撞到，所以時好時壞)。修法：計時器排定當下記下等待中的分數(標籤＋類型＋分數)，`revealPendingExams(s, kind, onlyKeys)`只公布那幾筆。驗證：test-41單獨連跑3次108/108通過，全套55檔通過(329秒)。

**〔續19：十、10.9.4 逐筆成本量測＋10.10 行動點錢包實作〕**`index.html`：①10.9.4：`recordCallLog()`每次真實AI呼叫(一般回合／開場／放置摘要／人生之書章節／結局／失敗重試或重新生成／另加「回顧這一生」)逐筆記到瀏覽器本機`life_sim_call_log`(不碰KV、不進存檔本體所以不增加雲端存檔大小)，只留最近500筆；每筆有時間、回合數、類型、四種token、估計花費、送出內容各區塊字數(固定規則＝Worker回傳的`sys_chars`、角色數值、NPC卡、前情提要、近期回合、玩家輸入)與AI輸出字數(旁白正文／其他欄位)；同一個`turn_nonce`第二次起記為「失敗重試／重新生成」；測試選單(`?dev=1`)新增「匯出逐筆呼叫紀錄(CSV)」；「這一世累計」原樣不變；②10.10：`renderWalletModal()`行動點錢包——點上方「行動點」數字或選單(存檔・設定)「行動點錢包」開啟；內容：合計(測試不扣點時顯示∞測試中)、每日池X／5、永久池(禮包點／購買點)、補點小字、其他進行中的人生(讀本機其他格子存檔)、最近點數紀錄、資料截至(台灣時間)；沒有內容的區塊不出現；封測期間不放帳號狀態、共用購買點、購買按鈕；「回報帳務問題」按鈕**尚未出現**(`BILLING_REPORT_FORM_URL`空字串，等使用者提供表單網址；按下時會複製點數明細＋最近5筆紀錄再開表單，不帶復原金鑰)；③10.10.3 `state.apLog`最近30筆：新手禮包、每日補點(只記實際補的量，本機與伺服器端兩種模式)、傳承繼承(永久池)、回溯重大決定−5、回顧這一生−5，一般回合扣點不記，測試不扣點期間不寫入；舊存檔沒有這欄照常開錢包；世代傳承／轉世丹沿用同一份紀錄。`worker/worker.js`：`callAnthropic()`回傳的Response附上固定規則字數，五個回應路徑的`lifegame.sys_chars`(**需重新部署Worker**，沒部署時錢包與紀錄照常運作，只是「固定規則」字數欄位記0)。**舊存檔可繼續玩**(新欄位選填)。測試：新增`test-54-wallet-calllog.mjs`37/37通過；全套55檔除`test-41`外通過(`test-44`平行跑失敗、單獨通過)。**test-41「B3 AI還在寫期中考」在本次改動前也會失敗**(還原成上一個commit後連跑3次都失敗，分數欄位顯示已公布的上次期中考)，與本批無關，是原本就存在的時間相依問題，本批未處理。10.9.7第4項現在有測試：開啟錢包不呼叫AI＝通過；回憶錄、人生之書閱讀頁不呼叫AI＝**未測試**。**未測試**：真實API下逐筆紀錄的實際數字與快取命中；表單回報按鈕的實機行為；錢包在手機小螢幕的版面。

**〔續18：十、10.9／10.10 寫入設計文件＋10.9.7實作前查核〕**設計文件(claude.ai網頁版定案)：`10-存檔與帳號系統.md`新增10.9(開放大眾成本控管與帳號額度)、10.10(行動點錢包)，10.1、10.2、10.3.3、10.3.4、10.3.7～10.3.11依指示加註(被取代的舊字用刪除線保留)；`00-總覽.md`目錄與日誌各補一行。**程式尚未動**(10.9.4成本量測、10.10錢包待使用者確認後實作)。10.9.7查核結果：①**沒有檢查**——章節額度`preChapter`(`ap.js`)只在有KV的路徑執行，10.8暫停期間走`handleAIProxyNoKV`，人生之書章節不受每10回合1章限制，應列入10.8重新打開前的檢查清單(封測期間只靠前端自己控制)；②130次比124回合多的6次：現有「這一世累計」(`addDevUsage`)每一次AI呼叫都加1(一般回合、章節、放置摘要、回顧這一生、重試、日期重生成都算，開場也算)，所以累計**有**包含不扣點呼叫，但現在沒有逐筆類型紀錄，**無法回頭查出那6次是哪一種**，需10.9.4逐筆記錄做完後才查得到；③`worker/usage.js`單價常數(Input $2／快取寫入$2.5／快取讀取$0.2／Output $10)的模型是`claude-sonnet-5`，與`worker.js`的`ALLOWED_MODEL`一致；查詢日期仍是2026-09-25，**我這裡無法上官網核對，未更新日期**，需使用者或有網路時確認；④回憶錄、人生之書閱讀頁、行動點錢包不呼叫AI：錢包尚未存在，**未測試**。

**〔續17：版本標記與玩家可見的更新紀錄〕**目的：使用者擔心分不清線上是哪一版、新舊檔案對錯。`index.html`：新增`APP_VERSION`(格式`YYYY.MM.DD-字母`，目前`2026.09.30-a`)與`RELEASE_NOTES`(玩家看得懂的更新說明，由新到舊，已寫9/30與9/29兩筆)；選單抽屜「其他」組新增「更新紀錄」(顯示版本號，沒看過這一版時本項與選單鈕都有小紅點，開啟視窗後以localStorage`lifegame_seen_version`記已讀)；視窗最上面顯示頁面版本，正式模式另外查Worker版本(測試模式不查)；首頁頁尾也顯示版本號與日期。`worker/worker.js`：新增`WORKER_VERSION`與`GET /version`(不碰KV，雲端暫停時也可查，仍受來源白名單限制)。新增`DEPLOY.md`(部署步驟與每次上傳紀錄表，最新在上)。測試：新增`test-54-version.mjs`22/22，會檢查頁面版本、Worker版本、更新紀錄最新一筆、`DEPLOY.md`四處對得上；test-52、31同時通過。**這次改了`worker/worker.js`，要重新部署Worker才會有`/version`**(不部署只是更新紀錄視窗的伺服器版本顯示「查不到」，不影響遊戲)。**實作判斷**：①更新說明由我依CHANGELOG改寫成玩家用語，需使用者確認；②第一次進來的新玩家也會看到一次小紅點；③commit編號無法寫進自己的commit，所以用手動版本號＋`DEPLOY.md`對應commit。**未測試**：實機手機上紅點與視窗的排版；線上Worker實際回傳`/version`(要部署後才能驗證)。

**〔續16：使用者確認交往門檻與貌合神離〕**①分手好感門檻維持40，註解與文件寫明40＝「認識不深／普通朋友」分界(與`relationshipStatusLabel()`、關係程度圓點同一組數字)；②新增「已分手」狀態`romanceStatus:"ended"`(`relationshipStatusLabel`＝已分手、`relationCategoryLabel`＝前任)：分手場面寫完才進入(原本場面會把狀態設成`breakup`＝貌合神離，兩件事混在一起，這次拆開)；③`breakup`(貌合神離，淡出或失聯造成)維持`BREAKUP_SCENE_AFTER_TURNS`＝12回合未挽回，`prepareRelationScene()`自動排一個明確的分手場面(提示說明要有電話、訊息或當面說開，不能不了了之)，失聯者同樣，狀態不會被程式默默改成分手；貌合神離開始的回合記在`breakupSinceTurn`(舊存檔沒有這欄就從第一次檢查起算)；④`relationship_facts`對貌合神離附註「還沒有結束、不要寫成已經分手」，`worker/prompt.js`補同樣說明(**需重新部署Worker**)；⑤貌合神離的提示文字改「漸漸冷了下來」(原本「分開了」)；⑥已分手的對象可再走告白場面復合。文件：四、4.8補兩條【定案】、00-總覽日誌、QA手冊34.15.1第9項。測試：test-50共45項(新增貌合神離不算分手、排場面、失聯、復合、門檻等)；全套54檔通過(test-41在平行跑時偶爾失敗，單獨重跑5次都過，與時間相依有關)。**未測試**：真實AI寫得出「一通電話、一則訊息」式的收尾場面。

**〔續15：使用者回覆實作判斷清單後的6處調整〕**①`labelWithMonth()`所有回合標題都加月份：沒有階段名稱時直接接月份(「高二・暑假・7月」「23歲・7月」「入職第2年・上半年・7月」「大二・休學中・月」)，已有月份不重複，`memoirGroupOf()`同步；②放置期間暫停交期：`simulateIdleRound()`不再呼叫`prepareOrderTurn()`(逾期取消)，改成每回合把所有進行中訂單的`due`往後延1，做完的按準時價入帳；③交期月份：新增`futureTurnMonth()`依`cal.sched`(學生時期)／`careerAnchor`(出社會後)換算第N個未來回合的月份，日期用完、休學、開場才退回原本的估算；④人物大格人數不算已故(失聯仍算)；⑤圖示改用官方套件`lucide-static 1.49.0`(ISC)的`icons/*.svg`路徑(`chart-column`、`circle-help`、`undo-2`、`flask-conical`、`network`、`triangle-alert`、`rotate-cw`等)，樣式仍細線條；⑥`detectGenderTitleMismatch()`：人名＋親屬稱謂(或反過來)與名單性別矛盾就寫`gender_title_mismatch`錯誤紀錄，只記錄不擋遊戲(男稱謂17個／女稱謂20個，名字要緊貼稱謂才算，中間有字不算)。設計文件同步：十五、15.8、八、8.13.4、十六、16.17.1、一、1.2.19、00-總覽日誌與目錄、QA手冊34.15.1第8項。測試：更新test-46、52，新增放置、交期月份、人數、性別檢查斷言(test-47共62項、52共37項、53共24項)；**全套54檔通過**(test-41仍有平行跑偶發失敗)。**未測試**：官方圖示在實機手機上的視覺；性別檢查在真實AI輸出上的命中率(需真實API)。

**〔續14：QA 34.15第1、4、5、6項——prompt層修正〕**`index.html`：①(#5)關係提示用詞：新增`labelChangeHint()`／`relLabelRank()`，級距往上寫「和○○的關係更近了，現在是「…」」、往下寫「退了一步，現在只是「…」」、對不上級距表用中性「有了變化」，不再出現「好像不一樣了」；第一次認識的新角色提示「認識了○○」；②(#4)選項只用已知人名：新角色`name_known:false`存成`nameKnown＝false`、`names_revealed`解除(同時提示「認識了○○」)、payload人物名單標`name_known:false`、`sanitizeChoiceNames()`把選項裡提前出現的未知名字換成「那個女生／男生／人」並寫入錯誤紀錄`choice_unknown_name`；③(#6)`detectOutputQualityIssues()`加系統用語偵測(`SYSTEM_TERM_RE`：正式副業、投入度、好感度、行動點、訂單簿、接單上限、興趣卡、興趣等級、這／本／上／下／每回合、重心選／重心按鈕／把重心、存檔、數值面板／變化)，偵測到走原本「自動重新產生最多2次」；「身體重心」「生活重心」這類一般用法不會誤殺；④(#1)性別鎖定本來就有(`gender`鎖定＋`gender_fill`)，這次只在prompt補「以名單為準、玩家自由輸入用錯代名詞或稱謂不改寫」。`worker/prompt.js`：新增四段規則與`name_known`／`names_revealed`欄位(**需重新部署Worker**)。測試：新增`test-53-prompt-fixes.mjs`20/20；`--quick`51檔通過。**未測試**：真實AI是否遵守(性別、名字、系統用語都靠AI自律，程式只能事後擋選項名字與偵測系統用語)；性別錯亂沒有程式端偵測(只加prompt規則，因為判斷代名詞是否錯誤需要語意，程式做不準)。**實作判斷**：①系統用語詞表只挑幾乎不可能是一般口語的詞，寧可漏抓也不誤殺；②`name_known`預設true(舊存檔與沒填的角色一律視為已知)。

**〔續13：2026-09-30定案文件第4批——底部選單抽屜、線條圖示、無紫色與emoji、玩法與圖例、帳務(十六、16.17／16.18)〕**`index.html`：①頂部列移除右上角四顆圓鈕，只留年齡圓章、大標題(含月份)、小字進度行、行動點、存款；輸入框左側加珊瑚紅圓形選單鈕(`#btn-drawer`，開啟時圖示變叉叉)，按下從底部升起暖色毛玻璃抽屜(`renderDrawer()`／`setDrawer()`，抽屜位置貼在輸入區上方)；②抽屜三組(組名下珊瑚短底線)：我的人生＝屬性／興趣／副業(有副業才有)／人生之書／回憶錄／我的東西／學生證／家族年表，身邊的世界＝人物／地點／帳務，其他＝玩法與圖例／存檔・設定／關於我(橫長條)；大格＝圓形淺珊瑚底座線條圖示＋名稱＋一行即時資訊(才識、最近興趣與等級、進行中訂單數、第幾世、則數、件數、人數、處數、存款)，小紅點：人物(上一回合新人物)、副業(訂單交期剩1回合或已逾期)；分組原則寫在程式註解，之後新功能照此分組；③原「選單」面板改為「存檔・設定」(放置代活、復原金鑰、存到雲端、金鑰錢包、切換人生、刪除人生)；?dev=1的「測試」格中性灰放在其他組；④新增`renderLedgerModal()`帳務(存款、最近10回合收支明細可點開、開銷說明)與`renderLegendModal()`玩法與圖例(月份、地點、重心取捨、訂單、曖昧與在一起、「衝突背後，通常有一件沒說出口的在意」，白話、不出現好感度／投入度／重心)；⑤圖示改用內嵌的Lucide風格細線條圖示(`ICON_PATHS`／`icon()`，路徑是照Lucide手工內嵌、沒有外部相依，平常暖棕、按下或選中珊瑚紅)；玩家看得到的emoji(⚡、➤、↺、☁、⚠、📚、👛、🔑、☰等)全部換成圖示或刪除；⑥紫色全部移除：回應數值標記增加＝淺珊瑚底深珊瑚字、減少＝淺灰棕底深灰字(仍保留正負號，`cap resp`／`cap resp neg`)，「想找」標籤、測試鈕改色。測試：新增`test-52-drawer.mjs`35/35；更新test-6(人生之書大格顯示第幾世)、28、38、42、43對應斷言；**全套53檔通過**(test-41在平行跑時偶爾失敗、單獨重跑通過，是原本就有的時間相依，非本批造成)。`?dev=1`的Debug面板(只在模擬模式、給開發者)與測試選單內部的少數符號(🛠、✕、☐☑)沒有改，玩家看不到。`tests/browser-16-ui.cjs`(瀏覽器版UI檢查，不在run-all內)仍寫舊的圓鈕，已過時、本批未更新。**實作判斷**：①既有選單項目歸位照使用者補充拍板(回憶錄→我的人生、關於我→其他)；我的東西、學生證、家族年表依分組原則放我的人生；放置代活放存檔・設定；②「人物」大格的人數＝人物名單全部人數；③抽屜不加暗色背景遮罩(選單鈕要一直可按)；④帳務只列最近10回合。**未測試**：實機手機版面、抽屜在小螢幕的高度、毛玻璃效果(jsdom看不到)。

**〔續12：2026-09-30定案文件第3批——地點名單、選擇偏離、關係里程碑、人際衝突線(十八、18.15／18.16、一、1.2.17、四、4.8、十六、16.15)〕**`index.html`：①地點名單(`ensurePlaces()`開局登記家／學校、`applyPlacesResult()`登記新地點與類別特徵主理人、記造訪次數／上次造訪／在場的人、`place_updates`、`recentPlacesPayload()`最近10個地點附給旁白)，取代`scene_category`：18.3連續次數改依名單類別；名單類別與旁白回報或指定類別不符以名單為準並寫入錯誤紀錄；地點面板`renderPlacesModal()`(住在／現在在／常去、地點卡、已關閉灰色排底、「去這裡」只填「去○○，」)；副業面板加「據點」(做副業那幾回合去最多的地方，`card.gigPlaces`)與「一起做的人」(`gig_partner_add`→`registerGigPartners()`)；入口暫放現行選單「我去過的地方」。②選擇偏離`rollChoiceDeviation()`15%，不擲：前一回合已偏離、自由輸入、回應告白、考試／程式事件／固定事件、開場；payload`choice_deviation_now`。③關係里程碑：交往成立改為告白場面＋玩家點頭(`confession_from_npc`→下一回合選項強制含答應／還不確定／拒絕`enforceConfessionChoices()`；`confession_from_player`→80%／40%／10%擲骰、下一回合交給旁白)，`startDating()`記開始月份、每回合`relationship_facts`(「你們從○月開始交往」)、`relationship_scene_now`(成立／被拒／還不確定／被婉拒／分手場面)、提示與場面同一回合；曖昧中維持累積3次正向，負向2次解除；訊號不再自動升「交往中」；NPC主動提分手須好感<40或有「裂痕」，改為排入下一回合的分手場面(狀態場面結束才改)，玩家寫「分手」當回合就寫場面。④人際衝突線：`plot_new`加`conflict_event`／`unspoken_need`／`resolve_condition`(登記鎖定，缺欄位降為一般衝突並寫入錯誤紀錄)、`conflict_stage`四階段只前進或停留、碰觸滿4次要求收尾或升級冷戰(`escalate_cold`，只一次)、`response_rating.approach`靠近／推遠累計給旁白、`plot_resolved`改`{id,outcome}`(和好+5並在人物卡加「他在意的，其實是○○」、各退一步+2、裂痕−5並記`rift`標記；舊格式字串id照常)、已收尾的線每回合`conflict_closed`「此事已落幕」。`worker/prompt.js`：新增`location`(必填)／`location_new`／`place_updates`／`gig_partner_add`／`confession_from_*`／`conflict_*`欄位與對應規則(**需重新部署Worker**)。測試：新增test-48(22)、49(13)、50(35)、51(28)；更新test-10、37、40(交往改走告白成立函式、required多`location`)；`--quick`50檔通過。**實作判斷(待使用者確認)**：①「交往門檻」文件沒寫數字，暫定好感<40才可能由NPC主動提分手；②12回合無互動淡出、失聯仍直接改「貌合神離」(沒有分手場面，因為不是單方面提出，是自然淡出)；③告白回應只有一回合有效，選了別的事視為「還不確定」；④自由輸入判斷答應／拒絕用關鍵字(拒絕、不確定優先於答應)；⑤`location`列為必填，但沒回報時程式不擋、只是不記造訪；⑥副業「據點」用做副業回合去最多的地方推定(文件只寫連結地點名單)；⑦人際衝突線的`outcome`缺漏時當「各退一步」；⑧升級冷戰時階段重設為「攤牌」。**未測試**：真實AI是否照規則登記三欄、階段不倒退、台詞自然不教科書、告白／分手場面寫得出來、地點沿用名單特徵、選擇偏離的敘事效果(需真實API)。**已知未做**：QA 34.15第1、4、5、6項(性別鎖定確認、選項只用已知人名、關係提示用詞、系統用語不入台詞)是prompt層修正，留到第4批之後一併處理。

**〔續11：2026-09-30定案文件第2批——副業訂單簿、「工作」重心、副業面板(八、8.13／二、2.8.2／十六、16.16)〕**`index.html`：①新訂單簿模組(`ORDER_SPEC`、`orderTier()`、`prepareOrderTurn()`逾期延遲／取消／通知／新詢問擲骰、`registerOrders()`、`advanceOrder()`、`applyOrderResult()`、`idleOrderRound()`)取代舊的`prepareSideGigTurn()`／`applySideGigDeliveries()`／`side_gig_delivery`／30%主角自己的案子／排定機會間隔；訂單存在副業卡`gigOrders`(進行中＋最近12筆已結束)、`gigSeq`、`gigIncome`，舊存檔`gigOpenOrders`／`gigNextOfferTurn`在下一回合丟棄(訂單簿從空白開始)；②報酬35/70/140×等級乘數(精通1.4／熟練1.0／投入<40 0.8)，延遲×0.7，單位沿用8.11.2直接入存款，結算標籤依類型「接案收入」／「副業收入」(`SETTLEMENT_GROUP_ORDER`加「副業收入」)；③「打工」重心按鈕改「工作」(展開＝打工＋每個副業，`state.focusWorkId`、`currentWorkChoice()`)，副業重心：場景指令「實際處理訂單」、興趣投入一半(`applyInterestEvent(…, 0.5)`)、日記重心標籤「工作：X」；④payload新增`side_gig_orders`／`order_notices`／`order_inquiry_now`／`turn_focus.gig_category`，移除`side_gig_offer_now`／`side_gig_open_orders`；⑤副業面板`renderGigModal()`(概況、訂單簿依交期排序含進度格與警示色、「趕這單」填輸入框並切重心不送出、交件紀錄最近5筆＋累計收入)，入口暫放現行選單「我的副業」(16.17抽屜第4批再搬)；⑥放置模式只推進已有訂單。`worker/prompt.js`：`side_gig_delivery`欄位與兩條舊規則換成訂單簿規則，新欄位`order_new`／`order_target`／`order_work`(**需重新部署Worker**)。測試：新增`test-47-order-book.mjs`53/53；舊test-41／44／45中對應舊機制的檢查已刪或改寫並註明；`--quick`46檔通過。**實作判斷(待使用者確認，已列QA手冊34.15.1)**：①`order_new`加`category`欄位(文件只寫{client,via,item,size}，多副業時需要它決定記在哪本訂單簿，只有一個副業可省略)；②出社會後沒有重心，新詢問改為每回合擲一次(正式30%／偶爾15%)，否則出社會後副業不會再有新單；③「投入降到40以下」取<40，偶爾接案報酬乘數用1.0；④副業重心的場景類別「跟重心相關」寫成「處理副業訂單的地方(工作室、店面、家裡的工作角落)」；⑤面板「交期(月份)」是依目前日期＋剩餘回合×最近一回合天數的估算；⑥副業面板的「據點」「一起做的人(`gig_partner_add`)」依賴地點名單，留到第3批；⑦入口先放現行選單。**未測試**：真實AI是否照規則登記／不越過接單上限／不說系統用語(需真實API)。

**〔續10：2026-09-30定案文件第1批——月份與基礎欄位〕**設計文件已寫入(二、2.8、一、1.2.17／1.2.18、四、4.8、八、8.13、十五、15.8、十六、16.14～16.18、十八、18.15／18.16，00-總覽日誌兩行，QA手冊34.15；三項補充拍板已修改對應條文)。本批程式：①`computeMonthTitle()`大標題改「年級・學期・月份」(月份取本回合真實日期範圍中點，`cal.lastWinStart`)，小字進度行只留階段名(`progress.shortLabel`)；②`labelWithMonth()`日記／人生之書／下載紀錄的回合標題加月份(出社會後與寒暑假標題不加)；③`time_context.month_range`(`monthRangeText()`)＋prompt「不得寫出超出此範圍」；④`response_rating.approach／approach_type`(schema、prompt、`normalizeResponseRating()`，衝突線效果留第3批)；⑤`interest_event`有reaction沒category寫入錯誤紀錄(`interest_event_no_category`)；⑥1.2.18一律省略空欄位：prompt本來就有1.2.9.17，只改字眼。**用量顯示(`?dev=1`每回合輸入/輸出/快取寫入/快取讀取＋金額)早已存在，未新增**；prompt caching是否生效需真實API，未測試。**改了`worker/prompt.js`，需重新部署Worker**。新測試`test-46-month-title.mjs`12/12通過，`--quick`45檔通過(全套未跑)。舊存檔不受影響(不改存檔結構)。

**〔續9〕2026-09-30**：QA 34.14第1項修正——`index.html`副業標籤(約第10513行)原本只列active副業卡，久未投入(dormant)就整個消失，現在一併顯示並標「・久未投入」；第2、3項已由續8實作，只剩真實API回歸(未測試)。續8測試45/39/31與`--quick`44檔皆通過

## 2026-09-29（續8：重心與興趣調整＋NPC背景事件表，一、1.2.16／十八、18.14／八、8.12／三、3.5.5／四、4.7／十六、16.12～16.13）

**〔整理〕設計文件**：一、1.2.16重心必須寫進劇情(取代十八、18.10.5「重心只在新場景開頭兩三句」)、十八、18.14字數與填充描寫、八、8.12投入歸屬／副業交件類別／五級興趣等級(改寫8.10)、三、3.5.5社交回合效果與朋友帶來的機會、四、4.7 NPC背景事件表(含完整事件清單)、十六、16.12人脈說明小視窗、16.13興趣面板；00-總覽日誌與目錄；QA手冊34.14(三項修正清單，尚未處理)。快照`snapshots/life-sim-design_2026-09-29g_重心興趣與背景事件`(09-29e移到`archive/snapshots/`)

**〔開發部〕**
- `index.html`：
  - 1.2.16：`focusSceneDirective()`把重心指令放進`turn_focus.scene_directive`(考試等程式事件回合降為有空檔才帶到)；18.14：有重心的回合`narrative_length_guide`加100字(`focus_extra_words`)，`recent_ambient_categories`＝最近5回合正文用關鍵字比對出已用過的環境描寫類別(`AMBIENT_CATEGORIES`)
  - 8.12.1：`applyFocusSettlement(s, focus, r)`——重心指定的興趣卡直接記投入，AI的category忽略、只讀reaction(沒回報視為positive)；8.12.2：`applySideGigDeliveries`類別對不上玩家的副業就拒絕計酬並記`side_gig_category_mismatch`錯誤紀錄，重心「興趣：X」且有X類接案副業時每回合擲30%安排主角自己的案子(`prepareSideGigTurn(s, focus)`，`own_project`)；8.12.3：`INTEREST_LEVELS`五級，等級變動的回合日記加`levelNotes`並顯示在結算區
  - 3.5.5：`applySocialTurnExtras`(scene_characters裡的非家人隨機一位好感+2；社交回合每滿3次擲機會，`friendOpportunityProb`)、`takeFriendOpportunity`(優先有已得知【機】事件的角色，否則熟悉的朋友以上)
  - 4.7：`BG_EVENT_TABLE`完整事件表、`maybeRollBackgroundEvents`(學生時期假期第一回合、出社會後跨入新年第一回合)、`rollBackgroundEventForCharacter`(分級機率、年齡段、條件／互斥、關聯權重×1.5、過世另擲)、人物卡`events`(已得知／未得知)與`bgTags`(married／has_child／retired／widowed／partnered)、`left_circle`；`takeFriendNews`(熟悉朋友的轉折／重大事件一回合一件)、`takeInviteChoice`(【邀】選項只出現一回合)、滑到動態揭曉事件、重逢／聯繫上時一次揭曉、出場時給旁白看過的事件標為已得知；人物卡詳細頁「動態」(最近10筆，更早可展開)
  - 16.12：人脈說明改為條列實際影響的項目(`.stat-tip`加`white-space:pre-line`)；16.13：選單「我的興趣」(`renderInterestsModal`：等級名稱、距離下一級進度條、副業狀態，不顯示分數)
- `worker/prompt.js`：重心場景指令、填充描寫規則、興趣投入歸屬、`own_project`、背景事件(`new_events`／`friend_news_now`／`left_circle`／`events_while_apart`)、朋友帶來的機會。**需要重新部署Worker**
- `tests/test-45-focus-events.mjs`新增75項；test-39(興趣投入歸屬新規則、家人重心對象改成扣掉已故失聯)、test-31(等回合寫完再換state、模擬旁白不延遲)配合修改

**〔測試部〕** 見本次回報；舊存檔可以繼續玩(新欄位都是選填)

---

## 2026-09-29（續7：關係面板與角色狀態，四、4.6；一、1.2.14／1.2.15；十六、16.11；QA 34.13程式面）

**〔整理〕git**：10.8那批(`481ab23`)本來就在master上，補一筆`8105a8c`10.8快照整理(09-29d快照、09-29c移到archive)；分支`relationship-system-0929`改從它之後開始(`git reset master`，工作區不動，事前`git stash store`留備份)。10.8與關係系統可各自revert
**〔整理〕設計文件**：四、4.6.3改為「疏遠期間好感不變動」(刪保底)、4.6.6失聯成功率改50/65/80、4.6.2新增家人與四種狀態(＋【技術判斷】開局失聯／已故家長建卡內容)、4.6.5／4.6.6加註、五、5.2.6加註；00-總覽日誌與目錄。快照`snapshots/life-sim-design_2026-09-29f_關係系統`(09-29d移到archive)

**〔開發部〕**
- `index.html`：
  - 四、4.6：`characterState()`四種狀態(一般／漸行漸遠＝不活躍的非家人／已故／失聯)；通訊錄改單一清單(`sortedRosterCharacters`：好感降冪、同分最近互動在前，已故再失聯排最後)，副標題顯示狀態，漸行漸遠圓點淡色(`.dots5.faded`，取代灰色)
  - 4.6.4重逢：去找漸行漸遠的人、或出現在`scene_characters`都算互動(`markCharacterInteracted`)；payload`relationship_event_now`帶`reunion_tone`(熟悉的朋友以上一見如故，以下生疏)與`turns_apart`；名冊上漸行漸遠者附重逢語氣
  - 4.6.5已故：詳細頁按鈕改「回憶」、輸入框上方「回憶：X」，回想回合(`mode:"recall"`)所有好感變化忽略
  - 4.6.6失聯：`contact_lost`(`applyContactLost`，名字要在名冊上、已故不行；戀愛中對象視為分手)；去找失聯者送出時擲骰`lostContactFindProb`(家人50%，朋友50/65/80)，成敗都照常花這回合的行動點；失聯、已故好感凍結，不走緩降與降級
  - 4.6.7近況`recentStatus`(`character_updates[].recent_status`截30字)，詳細頁顯示、active_characters帶出；4.6.8滑到動態`social_feed_now`(每10回合最多1位)
  - 5.2.6開局：離異沒有音訊的一方、喪親過世的一方都建卡(`addAbsentParent`)，一開始就是失聯／已故；失聯者不進13.5健康狀態機、不算照顧負荷／退休／家業／三餐等家長；已故者年齡不再增加(`ageChildren`)
  - 1.2.14精簡名冊`character_roster`(`buildCharacterRoster`，依建卡順序、每人一行)；1.2.15程式產生的一次性收支一律記名稱(`noteCashEntry`：醫療費、治療費、創業資金、事業虧損／增資、遺產、賣房、頭期款、興趣花費)，超過存款一成的放進`program_expenses_now`
  - 16.11結算明細：`buildSettlementItems`每項附`details`、extras第三欄是歸屬項目(打工收入／接案收入／購物／其他收支)；`settlementHtml`滑鼠移上去或點一下打開小視窗、點別處關閉；收入／開銷明細只留最近30則日記(`pruneSettlementDetails`)
  - QA 34.13#1：同一回合才排定的接案訂單不能交件(當回合新訂單不列在`side_gig_open_orders`)，訂單加`order_id`，交過就移除；#2：購物金額改在接案入帳之後才量(原本接案收入被算成「購物 +X」再用「其他收支 −X」抵銷)；#16：通訊錄列的class「bg」撞到全域背景層`.bg{position:fixed}`，改`st-*`；#17：頂端狀態列`flex-wrap`
- `worker/prompt.js`：新增【精簡名冊與角色狀態】段(名冊規則1～4、contact_lost、重逢氣氛、找人結果、回想、近況、滑到動態)；1.2.15大筆支出規則；家庭結構描述改依4.6.2；schema新增`contact_lost`、`character_updates[].recent_status`、`side_gig_delivery.order_id`，`one_time_transaction`的label必填
- `worker/worker.js`：`turnUserContent()`把名冊拆成第一個content block並設`cache_control`(system＋工具＋名冊這段前綴可快取)。**需要重新部署Worker**
- `tests/harness.mjs`：`turnPayloadFromBody()`還原拆開的payload；`test-44-relationship.mjs`新增55項；test-12(離異40%改建失聯卡)、test-39(已故按鈕改回憶)、test-41(訂單要前幾回合接下才能交件)配合修改

**〔測試部〕** 見本次回報；舊存檔可以繼續玩(新欄位都是選填；舊存檔的喪親／離異失聯家長沒有卡，不補建)

---

## 2026-09-29（續6：手動存到雲端，十、10.8.1）

**〔整理〕設計文件**：十、新增10.8.1(使用者在Claude Code直接定案並確認)；00-總覽日誌與目錄。快照`snapshots/life-sim-design_2026-09-29e_手動存到雲端`(09-29c移到`archive/snapshots/`)

**〔開發部〕**
- `index.html`：
  - 選單「🔑 我的復原金鑰」恢復顯示；雲端暫停期間旁邊多「☁️ 存到雲端」(`manualCloudSave()`)：先存本機，再把不含反悔快照、壓縮過的存檔`/save`一次；成功跳出「已存到雲端」＋金鑰＋說明，失敗(含429連按太快)提示本機進度都還在
  - 雲端位置記在`state.cloudHome={key,slot}`：第一次存用這台裝置的金鑰＋目前格子；從別台拿回的人生沿用原位置，之後再存存回同一把金鑰
  - 換裝置：首頁「切換其他人生」沒有金鑰→輸入金鑰畫面(暫停期間不再隱藏，只隱藏開新人生時的金鑰畫面)；已有金鑰→人生選擇畫面多「🔑 輸入金鑰，拿回存到雲端的進度」。輸入金鑰→`showCloudPicker()`列出雲端的人生→`restoreFromCloud()`：同一段人生已在這台裝置就覆蓋那格，否則放進空格；三格都滿就提示；全新裝置直接用這把金鑰，已有金鑰的裝置金鑰不變；行動點跟著存檔走
  - 選單金鑰視窗暫停期間顯示這段人生的雲端金鑰(`cloudHome.key`)與換裝置說明
- `worker/worker.js`：暫停期間仍開放`POST /save`、`GET /slots`、`GET /load`(`MANUAL_SAVE_PATHS`)，其他雲端網址維持503；頻率限制照樣走不經KV的`RATE_LIMITER`
- `tests/test-43-cloud-paused.mjs`：新增M1～M16(手動存檔寫入1次、存完再玩不同步、429提示、新裝置輸入金鑰拿回、行動點跟著走、已有人生的裝置放空格且再存回原金鑰、打錯金鑰提示、其他網址仍關閉)

**驗證**：test-43 44/44通過；全套44檔通過(test-31平行時失敗、單獨重跑通過)
**KV用量**：平常遊玩0次；玩家每按一次「存到雲端」寫1次；換裝置拿回時讀4～5次(/slots讀3格＋錢包、/load讀1次)

---

## 2026-09-29（續5：封測期間暫停雲端存檔，十、10.8）

**〔整理〕設計文件**（claude.ai網頁版定案交接，使用者2026-09-29確認）：十、新增10.8、10.1開頭加註暫停；00-總覽日誌與目錄；QA手冊新增34.12 KV用量調查(只查不改，修正方案A～F待使用者確認)。SECURITY.md依交接指示不動
**〔查核〕**實測(測試工具、假上游、記憶體KV)真實API模式每回合KV寫入7.1次、讀取5.0次；mock玩線上網站每回合寫入2.2次。Claude Code自己的測試不連線上KV

**〔開發部〕**
- `index.html`：
  - 開關`CLOUD_SAVE_ENABLED`(預設`CLOUD_SAVE_DEFAULT=false`；比照USE_MOCK，localStorage旗標`lifegame_cloud_save`="on"/"off"可覆寫，測試用)；`SERVER_AP`＝真實API且雲端打開，其餘情況行動點全在本機算(扣點、失敗退點、跨日補點、放置天數、放置回溯與回顧這一生的5點、「不扣行動點」測試開關直接生效)
  - 關閉時：`saveGame()`只存本機、不同步；讀檔、人生選擇三格(`localSlotsMeta()`)、新人生找空格都只看本機；新人生禮包只用本機計數(每台裝置3次)；人生結束直接存本機人生回顧，**壓縮後**存(`{id,meta,enc,z}`，讀取時解壓，舊的未壓縮格式照讀)；傳承的上一代人生之書整本留在存檔；不下載封存包
  - 恢復金鑰畫面隱藏：開始人生時金鑰在背景產生(當作本機存檔的編號)、不顯示金鑰畫面；首頁「切換其他人生」沒有金鑰時不進輸入金鑰畫面；選單拿掉「我的復原金鑰」與雲端同步狀態；首頁說明與FAQ裡金鑰的句子改成本機說法(見回報待確認)
  - 本機存檔寫入失敗(瀏覽器空間不足)時提示一次「這台裝置的儲存空間不夠，剛剛的進度沒有存到」(關閉期間本機是唯一的一份)
- `worker/worker.js`：`cloudEnabled(env)`(wrangler.toml `CLOUD_SAVE_ENABLED`，只有"true"才打開)。關閉時完全不碰KV：存檔類路徑回503 `cloud_disabled`、`/usage-summary`回503、AI代理改走`handleAIProxyNoKV()`(驗證payload、Worker決定system/工具、簡轉繁照舊；不檢查行動點、不記成本遙測)；頻率限制改用Cloudflare Rate Limiting綁定`RATE_LIMITER`(同一IP每60秒30次，不經KV)
- `worker/wrangler.toml`：`[vars] CLOUD_SAVE_ENABLED="false"`、`[[unsafe.bindings]] RATE_LIMITER`(`wrangler deploy --dry-run`通過)
- `tests/harness.mjs`：`makeEnv()`預設雲端打開、`loadGame()`預設設旗標on(既有測試驗證的是雲端行為)；新增`cloud`、`storage`(模擬重新整理)選項，`key:null`＝全新瀏覽器
- 新增`tests/test-43-cloud-paused.mjs`(28項)

**驗證**：test-43 28/28通過；全套44檔通過(test-31、39、41平行時各有1項隨機失敗、單獨重跑通過，與本次無關)

**⚠️部署**：要**同時**重新部署Worker(`cd worker && npx wrangler deploy`)並重新上傳`index.html`到Pages。只上傳index.html時，舊Worker仍會在AI請求時讀寫KV；只部署Worker時，舊index.html呼叫存檔網址會拿到503(本機仍有存檔)
**舊存檔**：不影響，本機存檔格式沒變；目前沒有雲端存檔需要搬移

---

## 2026-09-29（續4：雲端存檔瘦身，十、10.7）

**〔整理〕設計文件**（claude.ai網頁版定案交接）：十、新增10.7(10.7.1～10.7.4)；00-總覽日誌與目錄；QA手冊34.10雲端存檔大小問題結案(34.11的附註同步標結案)；使用者確認續3回報的10項「需要確認」全部照建議，記在00-總覽續3那一行。快照`snapshots/life-sim-design_2026-09-29c_雲端存檔瘦身`(09-29a移到`archive/snapshots/`)
**〔查核〕**1MB是`worker/worker.js`自訂的`MAX_STATE_BYTES`，不是Cloudflare平台限制(KV單值25MiB、請求本體100MB)

**〔開發部〕**
- `index.html`：
  - 雲端上傳改用`buildCloudState()`：不含反悔快照；已上傳封存包的日記移出(`logOffset`＝前面省略幾則)、人生之書章節只留目錄
  - `packForCloud()`／`unpackFromCloud()`：瀏覽器原生gzip＋base64(不支援時退回不壓縮)；/save、人生結束的/archive都送`{enc, z}`
  - 人生階段封存包：`stageKeyOfEntry()`依時期標籤或年齡判定每則日記的階段(同`bookStageOf()`劃分，舊存檔也能補做)；`planStagePacks()`把已結束的階段列進`state.stagePacks`，那一段的人生之書章節都寫完才打包，`uploadReadyStagePacks()`依序上傳、成功才標記uploaded；失敗不算同步失敗、那段照舊留在主存檔
  - 新裝置：`ensureArchivedContent()`在回憶錄、人生之書、下載故事、人生結束封存、傳承保存上一代的書第一次打開時下載封存包並補回本機存檔
  - 讀檔`mergeCloudWithLocal()`：同一段人生本機一樣新或較新就用本機(並自動重新同步)；雲端較新就用雲端，封存掉的日記本機有就直接補回，反悔按鈕呈不可用＋「在這台裝置上還沒有可以回到的時間點」(`undoUnavailableHere`，下一次存快照時解除)；選單回憶錄則數含省略的部分
  - 同步失敗：底部小條提示(沿用人生之書提示樣式)同一段失敗期間只跳一次；狀態列下一行小標籤「☁ 未同步」(滑過／點開提醒先別換裝置)，成功自動消失；本機記`life_sim_sync_pending:slot`，重新開啟時自動重試
  - 雲端同步改成一次只跑一個，期間有新存檔就結束後再同步一次(修正較舊內容晚到會蓋掉較新進度的既有競態)
- `worker/worker.js`：/save、/archive收`{enc, z}`(舊格式照收)，上限以上傳內容(壓縮後)計算，不解壓原樣存；/load、GET /archive原樣回傳；新增`POST/GET /stage-pack`
- `tests/harness.mjs`：jsdom補上Node內建的CompressionStream/DecompressionStream
- **要部署**：`worker/`有改，必須`cd worker && npx wrangler deploy`(而且要跟index.html一起更新：新版前端送的壓縮存檔舊Worker不認得)；index.html重新上傳Pages
- 存檔相容：不用清空。舊存檔第一次同步就補做封存、雲端快照移除

**〔測試部〕**
- 新增`tests/test-42-cloud-save.mjs` 36/36通過(連跑3次)：1雲端不含快照(通過)；2換裝置反悔按鈕不可用＋說明、新裝置玩一回合後可反悔(通過)；3上傳有gzip、解壓與原本一致(通過)；4高中結束產生封存包、日常同步不含該段、封存包只上傳一次(通過)；5新裝置第一次開回憶錄才下載、第二次不下載、章節內文補回(通過)；6封存包上傳失敗時內容留在主存檔、不算同步失敗、下次成功才移出(通過)；7合成約1300回合舊長存檔(含快照約2.0MB)第一次同步補做5包、雲端快照移除、壓縮後約10KB(通過)；8同步失敗提示只跳一次、遊戲可繼續、標示出現、每回合重試、重新開啟重試成功後標示消失不另跳提示(通過)；9日常同步大小只跟目前階段有關(老年後段約10KB、只有高中時約9KB)(通過)；另測Worker以壓縮後大小擋上限、舊格式照收(通過)
- 修改既有測試：test-6讀人生封存時先解壓
- 全套`run-all` 43檔通過(test-31平行時失敗、單獨重跑通過，既有的時間相依不穩定)
- 需要真實API測試：無(本次都是存讀檔與畫面，mock可完整驗證)；真實瀏覽器(Safari等)的CompressionStream未實測，以jsdom＋Node內建實作驗證

## 2026-09-29（續3：葉夜第1世測試回饋 B1～B9、A1～A14）

**〔整理〕設計文件**（claude.ai網頁版定案交接，使用者不用重新確認）：一、1.2.9.15人稱改寫、新增1.2.9.18／1.2.12／1.2.13，1.2.9.11.1.1加刪除線；二、新增2.4.2、2.7，2.4.1加刪除線、2.6.4加註；三、新增3.5.4(3.5.3閒置衰退加刪除線)、3.4.2／3.4.7／3.2.4加註；四、新增4.1.5、4.1加兩條；八、新增8.11(8.7每月副業收入加刪除線)；十一、11.4加註；十四、14.2新增日常題材池；十六、新增16.3.2.1；十八、新增18.11～18.13(18.8第一條加刪除線)；00-總覽日誌與目錄；QA手冊新增34.11(B1～B9原因與處理)。快照`snapshots/life-sim-design_2026-09-29b_葉夜第1世回饋`(09-28b移到`archive/snapshots/`)

**〔開發部〕**
- **A8真實日曆＋B1年齡依生日**：`timeState.cal`升級為v2——絕對日0＝2026/8/30，換算成真實年月日星期；學期行事曆(上學期9/1前後最近週一開學、寒假1/20前後最近週三起至少21天且含除夕～初五、下學期到6/30)、期中考(第9週週二～週四)、期末考(最後一週的前一週)每年計算，撞國定假日順延(期末無法順延就提前)，一學年的段落日期存進`cal.sched`；段落回合數不變。農曆用新增的`lunar.min.js`(lunar-javascript 1.7.7，MIT，terser壓縮)，沒載入退回Intl農曆再退回約略日期。payload的`time_context`日期附星期、新增`year`、`dates_by_offset`、`exam_countdown`(考前7天內才給精確天數)，節日清單改每年計算。轉世從上一世結束後下一個開局日、傳承從孩子15歲那年開局。年齡改為跨過生日那天+1(`syncBirthdayAge()`，家人子女同一天+1)，`advanceStageYear()`與出社會年度不再加歲、休學半年不再湊兩次加一歲；出社會一年的回合預算年初定好(`careerYearBudget`)。休學算到下一個真實學期、延畢重跑從下一個真實學期開學。讀檔`migrateLoadedState()`：舊行事曆換算、年齡依生日重算
- **B2結算**：收入、開銷各自取整數再相減；結算欄逐項列出(零用錢/收入、生活開銷、打工收入、接案收入、一次性收支、購物、其他收支)，保證上回合存款＋結餘＝本回合存款；存款見底時開銷改列實際付出的金額。日記只存結算的精簡副本(`compactSettlementForLog()`)
- **A2＋B3考試**：`rollExamScore()`期中期末都用(預期＝才識、擲骰−15～+15、讀書比例±5，新計數`prepTurnsThisTerm`)；期末考明牌畫面改攤開三項，期中考不跳畫面、日記加一行分數組成；`exam_score_hint`停用。分數先存`pending`，期中考等正文動畫播完、期末考等明牌畫面按「知道了」才出現在數值面板。轉系判定維持舊算法
- **A14＋B4**：`detectOutputQualityIssues()`(引號沒關、段落以冒號/逗號/沒收尾結束、出現大括號或"key":)→自動重新產生最多2次(同turn_nonce不扣點；Worker `MAX_CALLS_PER_TURN_NONCE` 3→5)，仍不合格記`reviewFlags`；台詞標記轉換後清掉落單的`}}`／`{{名字|`
- **A3＋A4＋B5＋B7副業與打工**：8.7每月副業收入停用(`computeSideBusinessIncome`回傳0)；選副業等級後日記顯示一句說明(你/妳)、頂部標籤「副業：偶爾接案／正式經營」、程式排定第一次機會(1～3／1～2回合)與之後間隔(6～10／3～5回合)，payload`side_gig_offer_now`；AI用新欄位`side_gig_delivery`回報交件大小，程式依2～4／5～8／10～15份×投入度加乘入帳(沒有等待中的訂單不入帳、偶爾接案最多中單)；學生打工改固定2份。日記與下載的故事記下重心(`focusLabel`)，選擇行旁顯示「重心：打工」；prompt要求打工回合一定寫到打工。放置期間照樣接單交件
- **A5＋B6人脈**：`applyNetworkInteractionRules()`取代舊閒置衰退(連續6回合沒和非家人互動、也沒有任何關係變化才扣1並重算；認識新角色、關係升一級各+1套邊際遞減)
- **A6**：劇情線新增追查計數、原地踏步(8回合：有追查→`must_advance`，迴避→暫停5回合不送AI)、已揭露線索(最多5條，滿了併進摘要)、謊言紀錄；沿用`plot_touched`加`investigated`／`new_clue`／`lie`／`lie_exposed`
- **A7**：新欄位`scene_characters`，最近10回合出場滿6次的非家人不列焦點候選(`appearance_capped`，玩家指名除外)；`long_unseen_characters`；滾動10回合獨處場景不足3個→`daily_scene_now`(日常題材池抽主題、10回合不重複)並把scene_plan改成daily
- **A9＋A12**：家人的`romantic_signal`忽略；payload角色加`is_family`、`family_role`；家人關係標籤改「疏遠／有距離／普通／親近／很親」
- **A10**：約定`promise_new`／`promise_results`，依日曆記到期日，到期回合送`promises_due_now`，同一角色超過3筆最舊的轉淡出、角色出場後移除
- **A11＋B8**：角色卡新增`affiliation`、`links`(新角色建卡填、`affiliation_update`／`link_add`更新)，payload加`school_or_job`(家人依年齡推算就學階段)、`links`；重要物品`item_moves`→`keyItems`(最多10項)；`avoid_phrases`(最近5回合重複句型＋耳朵紅/耳根紅/臉紅)。開局手足卡補年齡(哥姊+1～4、弟妹−1～4)
- **A13**：等待旁白時舊回合摘要照樣可以點開(`aiWritingNow`期間render維持等待畫面，收合動畫只播一次)
- **A1**：payload加`player_pronoun`，prompt人稱規則改寫
- `worker/prompt.js`：以上各項的寫法規則(人稱、家人分寸、敘事一致性、主線推進、反常反應、約定、出場頻率與日常、選項多樣化、考試倒數與日期、考試分數、接案、打工)與工具欄位
- 其他：`startLife()`回傳開場回合的promise(測試await時等到寫完)；`activeCharacters()`在state被換掉時不丟錯；反悔快照補上考試紀錄、準備期計數、興趣卡、人脈計數、出場紀錄、約定、重要物品
- **要部署**：`worker/`有改(prompt、工具欄位、重新生成上限)，必須`cd worker && npx wrangler deploy`；Pages要**一起上傳新的`lunar.min.js`**(跟index.html放同一層)
- **存檔相容**：舊存檔不用清空——讀檔時行事曆自動換算、年齡依生日重算(可能＋1歲)、考試鎖定解除；改版前選了副業的從下一回合起排第一次接案機會

**〔測試部〕**
- 新增`tests/test-41-yeye-feedback.mjs` 117/117通過(連跑5次通過)：A8 2026～2030學年春節都在寒假內、寒假≥21天週三起週一開學、期中第9週週二、期末最後一週前一週、不撞國定假日、2031端午撞期末提前一週、節日日期；開場2026/8/30、payload附星期/西元年/考試倒數(7天內才精確)；B1生日當天+1、家人一起+1、舊存檔遷移重算；B2連玩20回合每回合存款與各項對得上且全是整數、打工收入單獨一行；B5重心記在日記/畫面/下載；A2分數公式與讀書比例、擲骰範圍；B3期中考寫稿中面板不顯示、期末考看完明牌才顯示；A14各種偵測與自動重新產生；B4殘留大括號清理；A3第一次機會時機/說明句/標籤；A4份數、加乘、大單降級、沒訂單不入帳、接案收入單獨一行；A5衰退/歸零/成長；A12家人標籤；A9家人訊號忽略與payload標示；B8手足年齡與學校；A11關係欄位/物品/避用句型；A10約定全流程；A6追查/揭露/謊言/原地踏步；A7出場上限/指名例外/日常場景/主題不重複/冷落名單；A13等待中展開；prompt與schema內容
- 修改既有測試(規則改了)：test-2(同一回合上限5次)、test-13(每月副業收入停用)、test-15(期中考分數改浮動＋先鎖住)、test-21(打工固定2份、延畢從下一個真實學期重跑)
- 全套`run-all` 42檔通過(test-31、test-39平行時各失敗一次、單獨重跑通過：test-39是隨機到「單親離異另一方不同住」的家庭結構，屬既有的不穩定)
- 未測試(需要真實API)：A1人稱、A6主線推進敘事效果、A7出場多樣性與日常場景、A9家人互動寫法、A10反常反應與約定兌現、A11一致性與避用句型效果、B5打工內容是否出現在正文，以及AI是否照A3/A4回報交件、照A8日期與倒數書寫、A14重新產生後是否寫完整
- 發現的既有問題(未處理)：QA手冊34.10記錄的雲端存檔大小——`/save`送出含反悔快照的完整狀態，長壽人生超過1MB會同步失敗；這次新增欄位讓人生之書測試的封存一度超過1MB，已把日記裡的結算改成精簡副本，封存回到上限內

## 2026-09-29（續2：每回合段落結構、轉銜文字、測試模式、AI回傳資料精簡）

**〔整理〕設計文件**（claude.ai網頁版定案交接）：十八、新增18.10每回合段落結構(18.2～18.4提到「這段時間」段落處加註)；一、新增1.2.9.17回傳資料精簡，1.2.9.11.3／1.2.9.16.3被取代的字數條文加刪除線；二、2.6.2回覆順序加刪除線；十六、16.5輪播計時改寫、16.3.1補測試模式生成秒數與不扣點開關；十、新增10.3.12；00-總覽日誌與目錄。使用者同日確認：回應段篇幅另加在總字數上；1～4、6條全人生、第5條只限學生時期；SECURITY.md專案內不存在、資安部分先不處理但開關照做。快照`snapshots/life-sim-design_2026-09-29a_…`(09-28a移到`archive/snapshots/`)

**〔開發部〕**
- `worker/prompt.js`：【時間與敘事結構】回應段改4-6短段、動作不可被時間跳躍切斷、新場景須接得上(a/b兩種)、選項只針對新場景、敘事品質三條；【回合結構】取消「這段時間」段落，重心改在新場景開頭兩三句帶出；【敘事節奏】過渡文字改指新場景開頭；結尾新增【回傳資料精簡】。`submit_turn_result`的required從14個減為7個(narrative、scene_day_offset、scene_summary、chapter_subtitle、turn_summary、emotional_tone、choices)，stat_deltas／attachment_shift／conscientiousness_shift的子項不再必填
- `index.html` `fillOmittedTurnFields()`：AI沒輸出(或輸出null)的欄位一律補成空值(null／[]／0／false)，數值物件只補沒寫的項目；接在`normalizeTurnResultText()`，mock與真實路徑都經過
- `narrativeLengthTier()`：回應段`action_result_words`改為200-350字(4-6短段，【測試參數，暫定】`RESPONSE_WORDS_MIN/MAX`)，新增`scene_words`＝原總字數的2/3～3/4，`target_total_words`＝兩者相加
- 16.5轉銜文字：前3秒只有三個小點，之後第一句隨機(不與上一回合第一句重複)，接著照清單順序輪播、每句8-10秒隨機、輪完從頭；移除10秒固定句。AI回來時計時器照舊全部清掉
- 測試模式生成秒數：takeTurn記下這回合AI實際花的時間(含重試、重新生成)存在日記`genMs`，只有`?dev=1`瀏覽器在最新一回合卡片顯示「⏱ AI生成 X 秒（測試模式）」
- 10.3.12測試：不扣行動點：測試選單新增開關(localStorage `lifegame_ap_test_free`，只有開過`?dev=1`才生效)；開啟時本機不扣點、點數0也不停用選項、頂部顯示「⚡ 行動點 ∞ 測試中」，回合數照常+1。真實模式送`ap_test_free:true`給Worker，Worker只在金鑰列在secret `AP_TEST_KEYS`(逗號分隔)時生效：不預扣、不退點、不記nonce，最後行動日／章節額度／用量遙測照常；不在名單上就照常扣點並回`ap_test_free:false`，前端改回顯示數字、測試選單提示「開關無效」
- **要部署**：`worker/`有改(prompt與扣點)，必須`cd worker && npx wrangler deploy`；要用開關的話先`npx wrangler secret put AP_TEST_KEYS`填入自己的金鑰。index.html要重新上傳Pages
- 存檔相容：只新增欄位(日記`genMs`)，舊存檔不用清空

**〔測試部〕**（使用者指定本次只測兩項）
- 新增`tests/test-40-slim-apfree.mjs` 30/30通過：假上游只回7個必填欄位(開場不回action_result)、只回部分數值、欄位給null，真實路徑跑7回合＋mock路徑刪掉所有非必填欄位跑6回合，全部成功、無錯誤回合、無jsdom錯誤、數值無NaN；不扣點開關：測試鑰匙伺服器端與本機都不扣、nonce沒被記、顯示∞ 測試中、點數0照玩、關掉後照扣；非測試鑰匙照扣且顯示數字＋提示無效；直接打Worker(沒設名單／名單外)照扣；沒有?dev=1時開關不生效
- 全套`run-all` 41檔通過(test-31首頁平行時失敗一次、單獨重跑通過，為既有的固定sleep不穩定，單獨連跑6次都通過)
- 未測試（本次指定跳過）：18.10敘事規則、轉銜文字計時、生成秒數顯示——需真實API實玩
- 注意：`tests/browser-16-ui.cjs`(真瀏覽器手動跑，不在run-all裡)還是檢查舊的4秒輪播／10秒固定句，下次要跑時需改成新計時

---

## 2026-09-29（續：文件瘦身與整理）

**〔整理〕**（使用者同意Claude提出的整理方案；只搬不刪，除下列說明外內容一字未改）
- `life-sim-design/00-總覽.md`全域更新日誌：2026-09-26（含）以前的條目（9/12～9/26，已被9/26全章掃描涵蓋）搬到新檔`life-sim-design/00-總覽-更新日誌封存.md`，主檔116KB→34KB；新條目照舊只寫在`00-總覽.md`
- QA手冊34.8（9/26全章掃描81條，9/27已全部處理完）整段搬到`qa/QA_34附錄_歷史封存.md`「主檔34.8（2026-09-29移入）」，標題層級各降一級；主檔留指引，只剩34.9、34.10
- CHANGELOG 2026-09-26～09-27共15筆搬到`CHANGELOG-archive.md`（由舊到新接在後面），封存檔標題日期改為9/14～9/27
- 刪除空資料夾`content-team/`
- `協作流程說明-共同基準.md`：唯一正本補15～18章、說明日誌主檔／封存檔分法；待實作追蹤改指QA手冊34節附錄；QA報告命名補註目前用法；分工補註子代理個案例外；真實API規則補上現行開關方式，並把「直到正式測試階段為止」統一成「正式測試階段也每次都問」(跟CLAUDE.md/WORKFLOW.md一致)。**需同步給claude.ai Project**
- `CLAUDE.md`：USE_MOCK鐵律與Debug面板改寫成現行做法（localStorage旗標＋`?dev=1`測試選單）；檔案結構補`tests/`、`CHANGELOG-archive.md`、公告草稿、git推送規則；交接流程縮成指引＋三個重點；掃描記錄只留最新一次；語法檢查改指`tests/check-syntax.mjs`；架構決定去掉「取代原本…」的歷史敘述，刪掉9/20「187項斷言」過時條目
- `WORKFLOW.md`第1節資料夾樹更新（補15～18章、日誌封存檔、worker/、tests/、og.png、design-assets/、公告草稿）；第3節鐵律措辭同步
- SECURITY.md／資安檢查相關不動（使用者指示先不做）
- 驗證：以git HEAD逐行比對，搬移前的每一行都還在主檔或封存檔（只有刻意改寫的兩行說明／標題例外）；只動.md，未改程式碼

---

## 2026-09-29（二、2.6回合結構＋十八、敘事節奏實作；補充定案之二寫入文件）

**〔整理〕設計文件**：十八章補充定案之二寫入18.5.2(舊伏筆狀態對應、AI回報拆成「本回合碰到」「上回合玩家反應」)、16.3.3(重心按鈕最多6顆)、1.2.9.7(交叉引用18.9)、00-總覽日誌、QA手冊34.10

**〔開發部〕`index.html`**
- 二、2.6：學生時期(含延畢、休學；放置代活除外)輸入框上方加6顆重心按鈕(預設沿用上一回合，整局第一回合休息)、一行小字提示；興趣只有一顆(有正式興趣卡時寫名稱，再點一次切換，含「嘗試新的」)；沒有可聯絡的家人時不顯示家人。輸入框改三行textarea與新提示文字
- 重心結算全部由程式：讀書→才識(保證至少ordinary)＋準備期讀書次數；興趣→指定卡直接算一次喜歡投入(8.10，不讀AI的interest_event)＋準備期興趣次數；社交人脈+2(團隊倍率＋邊際遞減，重置閒置衰退)；休息健康+2；打工→3.4.2入帳(學生時期改看重心，非學生維持文字偵測)；家人+2(同住家人，沒有就原生家庭父母手足，文字提到某位只加那位)。跳過指令的回合不結算。`detectStudyIntent`不再用於讀書次數
- 2.6.5回應評價：AI回`response_rating`(出色/不錯/平常/失言＋表達力或人脈＋對象)，程式查表；點選項最高不錯；學生時期AI的stat_deltas只收負數(突發事件)；才識只來自讀書重心(milestone不變)；評價對象的關係值照表取代AI的affinity_delta
- 數值標記依來源上色(重心橘、回應紫)，日記存`focusMarks`
- 十八、場景(學生時期)：程式事前給`scene_plan`(相關／換到別處＋抽到的類別／覆寫：考試、畢業、上學期開學典禮、程式事件、玩家指名或想找)，AI回報`scene_category`計連續次數，滿3回合下一回合直接換到別處並排除該類；去處被擋下時告訴AI
- 十八、劇情線(整個人生)：`state.plotLines`取代`state.foreshadows`(舊資料依對應表轉換)；AI回報plot_new/plot_touched(light/ask/omen)/plot_reactions/plot_resolved/plot_reopened；程式記閃開、帶過、變形(依相處風格抽，不連續同一種)、推到眼前、8回合浮現、擱置16回合待回歸、超額擱置、擱置3次放下、角色淡出擱置與再登場恢復、過世收尾；18.9優先順序
- 十八、角色輪替：焦點角色紀錄、同一人連續2回合上限、滾動6回合至少3位、活躍非家人少於4位時要求新角色；四、4.1相處風格`style`(建卡時AI給、舊卡`style_fill`回填一次)
- 十六、16.3.4：角色詳細頁「去找他/她」→輸入框上方「想找：某某 ×」，只作用於下一次送出，淡出的角色重新活躍，過世的不顯示
- 反悔快照加入劇情線、場景連續次數、焦點紀錄

**〔開發部〕`worker/prompt.js`**：刪除【伏筆】段落，新增【回合結構】【敘事節奏】兩段與對應工具欄位(response_rating、scene_category、focus_character、plot_*、style、style_fill)；A段補「台詞稱呼玩家也用你」。**需要重新部署Worker**

**〔測試部〕**新增`tests/test-39-focus-rhythm.mjs`(83項)：通過。更新test-4(學生時期正向stat_deltas不採用)、test-15(讀書/興趣次數改看重心)、test-21(打工改看重心)、harness預設回傳。全套40檔：通過(test-31、test-34平行時各失敗一次、單獨重跑通過)

**會讓舊存檔跑不動嗎**：不會。新欄位都有預設值，舊伏筆自動轉成劇情線；舊角色沒有相處風格，下次出場由AI補上

---

## 2026-09-28（續十八：回合結構＋敘事節奏寫入設計文件）

**〔整理〕**只改設計文件，`index.html`與`worker/`未動：二、新增2.6回合結構(回應與重心)；新增`life-sim-design/18-敘事節奏.md`(含同日補充定案18.9)；一、1.2.9.7伏筆追蹤改依十八章、1.2.9.11.3「這段時間」篇幅；三、3.2.2～3.9.2、四、4.1相處風格、八、新增8.10、十六、16.3.3/16.3.4連動；00-總覽目錄與日誌、CLAUDE.md檔案結構同步。尚未實作，待辦與小問題見QA手冊34.10

**〔測試部〕**未測試(本次無代碼改動)

## 2026-09-28（續十七：測試加速）

**〔整理〕**`tests/run-all.mjs`
- 改成平行跑(同時4個，`JOBS`環境變數可調)，最慢的先開跑；每檔印耗時。全套由約6.5分鐘降到約4.5分鐘(瓶頸是test-16-playstyle單檔約3.5～4.5分鐘)
- 新增`--quick`(略過test-16-playstyle、test-6-book兩個長程模擬，約45秒)與檔名篩選(`node run-all.mjs 38 16b`)，改到一半用；commit前仍跑全套
- 失敗的檔在最後單獨重跑一次，重跑通過標「↻ 平行時失敗、單獨重跑通過」(test-31首頁用固定毫秒sleep，平行負載下出現過一次失敗，壓力下重跑3次未重現)；失敗時一併印stderr前8行

**〔測試部〕**全套平行：通過(test-31該次失敗、單獨重跑通過)；--quick：通過；篩選模式：通過

---

## 2026-09-28（續十六：數值說明改浮動小框、下載故事加選項與旁白原始資料、截圖）

**〔開發部〕**`index.html`
- 16.3.4數值說明：原本小框插在列與列之間、把下面的項目往下推，看完第一項很難移到第二項。改成浮在該列下方、不推擠版面、不擋滑鼠(pointer-events:none)，加小箭頭、陰影、半透明模糊底；標籤加虛線底線提示可以看說明；滑出面板底部加留白讓最後一項的小框有地方顯示
- 下載故事：每則日記存下這回合給的選項(`options`)，匯出時列出選項並標「✔ 選了這個」，自己打字的另外註明；測試瀏覽器(?dev=1)另外保留旁白完整回傳資料最新10回合(`state.devAiLog`，不含正文)，匯出在附錄(使用者指定10回合)
- 開過?dev=1的瀏覽器不再顯示右側浮動🛠(會壓到正文，入口已在測試選單)

**〔測試部〕**
- `test-38`補4項：36/36通過(選項與✔、自己打字註明、旁白資料只留10回合且不含正文、沒有?dev=1不留)
- `node run-all.mjs`：全部通過
- 瀏覽器截圖(暫存目錄的Node 20＋playwright-core＋本機快取Chromium，不進專案)：手機390×844與電腦1280寬共7張，頁面無錯誤；確認數值說明可以從一項直接移到下一項、選項在正文最後、手機一欄電腦兩欄、測試選單

---

## 2026-09-28（續十五：親密開關不顯示、測試選單、數值說明）

**〔整理〕設計文件**
- 十六、16.3.7：選單開關與「隨時切換」加刪除線，一律完整呈現(欄位與淡化寫法保留)；16.3.4新增數值說明【定案】；16.3.1補說明：測試選單為開發用、正式上線前刪除；00-總覽日誌補一筆

**〔開發部〕**`index.html`
- 16.3.7：拿掉選單「💞 親密場景」；payload與章節素材一律送`intimacy_mode:"full"`(舊存檔存過fade也不再生效)。`worker/prompt.js`不動，不用重新部署
- 測試選單(整段以「測試選單(正式上線刪除)」標記包起來)：只在`?dev=1`瀏覽器出現；遊戲畫面在頂部列📊左邊加紫色🧪滑出面板，首頁/結局等畫面固定在右上角開彈窗。內容：模擬/真實API切換、上一回合用量、這一世累計用量(`state.devUsage`，一般回合＋章節＋放置摘要＋回顧這一生，反悔不退)、下載這一世故事(Markdown)、Debug面板入口。取代原本左側浮動的切換鈕與用量小框
- 16.3.4數值說明(`STAT_TIPS`)：存款、房產淨值、五項能力；滑鼠移過去／手機點一下顯示半透明小框(用在哪裡／怎麼增減)。內容對照程式實際用途寫：才識→考試、錄取、薪水、自營事業；人脈→錄取、自營事業、歸屬感；健康→疾病與壽命、被迫退休、生育、氣色；表達力與外表目前只給旁白當素材
- 16.3.8.2補強：開場回合即使AI回了行動結果也不顯示(假上游測試發現)

**〔測試部〕**
- 新增`tests/test-38-story-devmenu.mjs`：32/32通過(字面\n清理、段落清單、選擇行與分隔線、開場回合沒有、單一字串備用拆段、3則舊回合摘要與展開、選項在正文、反悔、親密開關不顯示、測試選單顯示條件、累計用量、下載故事內容、數值說明點開收起)
- `test-37`：偏好開關那段改成「選單沒有開關、舊存檔fade仍送full」
- `test-3-usage`：用量面板改到測試選單(`dev-usage-last`)，選擇器跟著改
- `run-all.mjs`：每個測試檔用`--max-old-space-size=4096`跑。`test-16-playstyle`長程模擬在今天改動之前(00d0690)就要約1.87GB，貼著Node預設上限，今天的正文多了一點文字就偶爾記憶體不足
- `node run-all.mjs`：語法檢查＋全部測試檔通過(USE_MOCK＋假上游，未打真實API)
- 瀏覽器實機(hover顯示、🧪顏色位置、下載檔案)：未測試

---

## 2026-09-28（續十四：故事正文易讀性改版——段落清單、選擇行、選項移進正文）

**〔整理〕設計文件**
- 一、新增1.2.9.16正文交稿格式(段落清單)；十六、新增16.3.8故事正文排版(換行清理／回合呈現排版／選項與底部輸入列／自動捲動／反悔)。使用者規格指定的`lifegame_ui_redesign_spec.md`專案內不存在，改寫在十六章16.3主畫面之下(小節內註明)
- 使用者同意Claude建議：與1.2.9.5「3-4句」並存(哪個先到先換段)；文件框可跨多個段落項目
- 使用者改定16.3.2：主畫面＝最新一回合完整卡片＋更早3回合一行摘要(取代同日「只留上一回合」)；16.3.3「選項兩欄」加刪除線
- 00-總覽：全域更新日誌補一筆、目錄16.3補上16.3.7／16.3.8

**〔開發部〕**
- `worker/prompt.js`：`action_result`／`narrative`改為字串陣列；【寫作規則】加段落清單寫法(約80字、開口另起一段、不寫\n)、文件框各行一段、開場回合填空陣列。**要重新部署Worker才會生效**
- `worker/ap.js`：`isUsableTurnResponse()`同時接受字串與字串陣列
- `index.html`：
  - `cleanNarrativeText()`／`narrativeParagraphs()`：字面「\n」「\\n」轉換段、連續換行合併、頭尾空白去掉；呈現時套用(舊存檔也生效，存檔不改)
  - `normalizeTurnResultText()`：AI回傳後先清理段落清單，再接成以空行分隔的字串，下游(台詞處理、recent_turns、人生之書)照舊
  - 日記新增`action`(玩家選的選項或自由輸入，開場回合為null)與`sceneAt`(新場景在`text`裡的起點)；`text`仍存合併全文。原本另存`resultText`/`sceneText`兩份，全文重複存三次，`test-16-playstyle`長程模擬記憶體不足，改成只存起點
  - 卡片：選擇行→時期標籤→行動結果→分隔線(四成寬、置中)→新場景→數值與結算；段距1em；舊日記沒有分段欄位時照原本整段顯示
  - 主畫面保留3回舊回合摘要，可各自展開(`expandedOldEntries`)；選項移到正文最後(手機一欄、768px以上兩欄)；底部只留輸入、送出、反悔、字數
  - 新回合自動捲到選擇行，開場回合捲到卡片開頭
  - mock：正文交段落清單，15%機率交回含字面「\n」的單一字串(`MOCK_LITERAL_NEWLINE_RATE`)

**〔測試部〕**
- 語法檢查：通過(使用者代跑`node run-all.mjs`內建檢查)
- `node run-all.mjs`第一次：31組通過、`test-16-playstyle`記憶體不足(原因見上，已改`sceneAt`)；改完後單獨重跑`test-16-playstyle`：41/41通過(6條長程人生最多901回合皆無錯誤)；全套在續十五一併重跑，全部通過
- 段落清單拆段、字面\n清理、選擇行/分隔線、3則舊回合摘要、自動捲動：沒有專屬測試，未測試
- **需要真實API測試**：AI是否交字串陣列、段落是否約80字且開口另起一段、是否還出現字面\n、文件框是否各行一段

**舊存檔**：可以繼續玩；舊日記呈現時會清理字面\n，但沒有選擇行與分隔線(當時沒存)

---

## 2026-09-28（續十三：一、1.2.11敘事尺度(親密關係)實作）

**〔整理〕設計文件**
- 一、1.2.11.7 npc_id條目由【待確認】改【定案】(使用者確認文件時一併同意：npc_id＝角色姓名)，補實作說明

**〔開發部〕**
- `index.html`：
  - 4.1.4年齡欄位：`inferNpcAgeFromRelation()`(同學＝主角同齡、學長姐＋1～2、學弟妹−1～2)、`resolveNewCharacterAge()`(其餘用AI建卡回報的整數)；`character_updates.age_fill`只對沒有年齡的角色回填一次；既有的`ageChildren()`已讓所有有年齡的角色每年＋1
  - 1.2.11.7：`romanceAgeFlags()`(both_adult／any_minor／age_gap_cross，生日跨線延續中視為any_minor)、`romanceSignalAllowed()`(沒年齡、一方成年一方未成年、未滿12歲、兩人未成年差超過2歲都不處理)接在`applyRomanceSignal()`開頭；進入曖昧時寫`beganAsMinors`；`ensureRomanceAgeMarks()`舊存檔補標記
  - 1.2.11.3.2：同居彈窗、搬去一起住、結婚都要兩人皆滿18歲(`romanceBothAdult()`)
  - payload：角色卡帶`age`、`romance_flags`、`intimacy_mode`；人生之書章節素材同樣帶旗標與偏好
  - 16.3.7：選單設定區「💞 親密場景：完整呈現／淡化帶過」，存在存檔(`state.intimacyMode`)，下一回合起生效
- `worker/prompt.js`：【親密場景寫法】整段放進【寫作規則】(章節成書共用)，補npc_id對應、親密選項門檻、性暴力、超出尺度輸入、新角色年齡的說明；schema加`new_characters.age`、`character_updates.age_fill`。**要重新部署Worker才會生效**

**〔測試部〕**
- 新增`tests/test-37-intimacy-scale.mjs`：38/38通過(年齡推算與AI回報、age_fill回填一次後固定、每年＋1、三種旗標、未成年可交往到stable、年齡差、未滿12歲、跨線不處理、沒年齡不處理、began_as_minors與生日跨線延續、同居與結婚須皆成年、兩人成年後自動切換、romance_flags、既有存檔補標記、偏好開關與存檔、章節素材、prompt整段與不附範例、schema)
- `test-10`、`test-7`：測試裡的戀愛對象補上成年年齡(新規則下沒有年齡不能進入戀愛狀態)
- `node run-all.mjs`全部通過(USE_MOCK＋假上游，未打真實API)；過程中`test-6-book`偶發失敗一次，單獨重跑與全套重跑都通過
- **需要真實API測試**：AI是否依旗標書寫(未成年只到牽手、跨線不寫戀愛)、淡化帶過是否寫到擁吻即轉場、成年組是否有意願確認與轉場輪替、是否不主動推進親密場景、新角色是否回報年齡、age_fill是否回填、超出尺度輸入是否自然帶過

**舊存檔**：可以繼續玩；沒有年齡的舊角色要等AI下次讓他登場回填年齡後才能推進戀愛關係；已經在曖昧以上的關係依現在的年齡補`beganAsMinors`

---

## 2026-09-28（續十二：待確認事項1～8定案實作——命運的骰子、結局頁與回顧這一生(F批)、傳承時間線、學生證章；敘事尺度寫入設計文件）

**〔整理〕設計文件**
- 回覆待確認事項1～8(使用者原文)：十六、新增16.7.0；16.7.2.5四類全記＋花絮層；七、7.1.4.1補充、新增7.4.3.3.1～7.4.3.3.3；十三、13.5加註；十六、16.8學號與轉系/雙主修章；00-總覽日誌(使用者指定標題)。寫入時的處理(不中斷詢問)：開始下一世＝選一個孩子接著寫/再寫一次人生；翻開人生之書、闔上這份草稿放在第8項下方；L1/L2不在結局頁顯示；封測期間回顧這一生維持5點
- 敘事尺度(親密關係)：一、新增1.2.11；四、新增4.1.4年齡欄位；五、新增5.6；十六、新增16.3.7偏好開關、16.10.0交叉引用；十、10.1交叉引用；十四、14.6.10～14.6.11範例；00-總覽日誌。**依指示只寫文件，等使用者確認後才實作**

**〔開發部〕**（commit 2c56bb6、3f767a0、9cd7da5、c902459＋本次）
- 命運的骰子：`recordFateRoll()`接在重大疾病治療、生育嘗試、年度營運、年度裁員四處；每階段4筆/總20筆依意外程度淘汰；`isFateTidbitEligible()`花絮層(≤30%成功、≥70%失敗，生育只收成功)；悔棋快照補`fateRolls`與`chronicleSeen`
- 結局頁16.7.0：結局標題→定稿印章→人生總結→墓誌銘→雷達圖＋最終存款→重要的人→回顧這一生→分享/開始下一世；人生總結與試看花絮在結局那次AI呼叫一起產生(payload帶人生特質)，失敗時`composeLifeOverviewFallback()`程式組句；新增`occupationMonths`、`openingProfile`；花絮素材`buildTidbitMaterials()`
- F批：回顧這一生解鎖(`unlockLifeReview()`，kind=`life_review`)、人生軌跡/人生花絮兩分頁、試看一則(優先命運的骰子)；Worker新增`handleLifeReview`、`LIFE_REVIEW_SYSTEM_PROMPT/TOOL`、用量類別review
- 分享這一生：canvas圖片分享卡(1080×1350)，系統分享附圖與網址，不支援時下載圖片並複製網址
- 傳承時間線：上一代開局時在世(孩子到上一世享年那年過世)、固定遺產(現金＋房產淨值，最低0，子女平分)、13.5狀態機對他停用死亡、孩子未滿15歲時開局即遺產事件；payload`prev_life`、`succession_opening_event`、`parent_death_event_now.same_illness_as_prev_life`
- 學生證：轉系「○年級轉入○○系」、雙主修「雙主修○○系」加蓋章(系別由程式代選)
- **需要重新部署Worker**：`worker/prompt.js`(人生總結、試看花絮、回顧這一生、傳承上一代規則)、`worker/worker.js`、`worker/ap.js`、`worker/usage.js`

**〔測試部〕**
- 新增`test-35-fate-rolls`(18)、`test-36-succession-timeline`(20)；`test-34-ending`改寫(34)；`test-33`補9項(36)；`test-11`、`test-23`改用`prevLifeProfile`找上一代卡(舊規則是開局已故)；harness假上游支援`submit_life_review`
- `node run-all.mjs`全部通過(USE_MOCK與假上游，未打真實API)；真實Chromium截圖檢查結局頁、回顧這一生、分享卡與下載
- **需要真實API測試**：人生總結是否符合100–150字與禁用詞、是否與人生特質一致；試看花絮與回顧這一生的寫法(不寫出隱藏機率數字、不寫遺憾句)；上一世角色當父母時的對話一致性；過世時是否提到同一種病；開局遺產事件的開場寫法

**舊存檔**：可以繼續玩；舊存檔沒有`fateRolls`(命運的骰子花絮不出現)、沒有`occupationMonths`(備案組句少一項)；已經傳承過的人生不受新時間線影響

---

## 2026-09-28（續十：E批結局人生回顧頁(16.7新結構)、免費轉世不保留數值(7.4.3.2)）

**〔開發部〕**
- `index.html`：`renderEnding()`改為16.7定案結構——結局卡(「N歲・定稿」印章、「人生草稿・第N世」、名字、L3墓誌銘＋「旁白為這一生留下的話」、角落「分享這一生」)→人生回顧(L1/L2直接展開)→「翻開人生之書」→下一步按鈕(有子女時「選一個孩子接著寫」與「再寫一次人生」並列同樣式，按下前者展開子女清單；無子女只有後者)→「闔上這份草稿」(取代「就此闔卷」，次要樣式)。拿掉舊的六格數值(含隱藏的福緣、羈絆人數)
- `shareThisLife()`：手機叫出系統分享；不支援時複製文字；不放玩家自由輸入的內容
- `reincarnate()`：依七、7.4.3.2取消轉生隨機一項數值加成；交給旁白的前世素材改成「說不上來的熟悉感」，不直接寫前世；點數照10.3.6保留
- 待確認沿用Claude建議實作：結局卡標題；雷達圖/重要的人/付費人生軌跡入口先不放；傳承流程(7.4.3.3)維持現行做法，等時間線確認再改

**〔測試部〕**
- 新增`tests/test-34-ending.mjs`：18/18通過(區塊順序、結局卡內容、分享按鈕、L1/L2展開、翻開人生之書、兩顆按鈕同樣式、闔上這份草稿、不顯示福緣、子女清單展開、無子女、分享複製、轉世不帶數值、點數保留、敘事痕跡不說前世、闔上後收進人生回顧)
- `tests/browser-16-ui.cjs`三處改為不受mock隨機性影響(沒有數值變化時補一組、購物彈窗先收掉、場景日期重生時縮短延遲)：連續三次38/38通過
- `node run-all.mjs`全部通過(USE_MOCK，未打真實API)

**舊存檔**：可以繼續玩；已經在結局頁的存檔會直接換成新版面

---

## 2026-09-28（續九：D批大學科系學生證(16.8)）

**〔開發部〕**
- `index.html`：新增`MAJOR_DEPARTMENTS`(9.2正式系別清單，醫藥類含牙醫、獸醫)、`FIVE_YEAR_DEPARTMENTS`(醫學、牙醫、獸醫)、`MAJOR_CAREER_INFO`/`SERVICE_DEPT_CAREER`(背面的職業類型與職業，服務/社工/餐旅類照9.2依科系細分)、`SCHOOL_NAMES`(16.8.5十二所)、`makeStudentId()`、`MAJOR_ICON_PATHS`(八個學群的線條圖示，內嵌SVG)、`enrollInDepartment()`(寫入學群、系別、修業年限，建立`state.studentCard`)
- `renderMajorSelectionModal()`改為16.8選系畫面：「N歲・大學入學」、八個學群按鈕、學生證(正面：珊瑚紅色帶校名＋學號、名字首字大頭照、姓名/學群/系別/入學年齡、系徽；背面：未來方向＋系名、對應職業類型、可能的職業)、左右箭頭切換同學群科系與「目前/總數」、點學生證翻面、「就讀這個科系」→翻回正面蓋「入學」章(400ms)後關閉。取代原本的學群＋5年制子選項。減少動態模式下不翻轉只切換、印章只淡入
- 選單「這段人生」加「🎓 學生證」(`renderStudentCardModal()`)，有學生證才出現
- 放置代活(10.6)代選科系改為代選到系別
- 修正A批：狀態列印章在「大學／技職」這類較長的階段名稱時擠出圓框→縮小字級並允許換行
- 16.8.5學號的「入學年份」與轉系後學生證要不要換，寫進文件標【待確認】

**〔測試部〕**
- 新增`tests/test-33-student-card.mjs`：27/27通過(9.2清單與範例一致、5年制三系、校名規則、標題與提示、八個學群含圖示、正面欄位、切換學群、左右箭頭與繞回、背面依科系細分、翻面、確認後翻回正面與入學章、寫入狀態與修業年限、校名學號即畫面上那組、學號格式、藥學4年制、選單學生證、沒有學生證不顯示、放置代選)
- 真實Chromium截圖檢查(選系、背面、入學章、選單學生證、狀態列印章)：無頁面錯誤
- `node run-all.mjs`全部通過(USE_MOCK，未打真實API)

**舊存檔**：可以繼續玩；已經上大學的舊存檔沒有學生證(選單不顯示)，也沒有系別

---

## 2026-09-28（續八：結局頁/轉世傳承/花絮資料來源/系別清單寫入設計文件；C批回憶錄時間軸(16.6)）

**〔整理〕設計文件**（claude.ai網頁版定案批次，回應QA手冊34.9的Q7～Q9；寫入後待使用者確認，尚未實作）
- 16：16.7結局頁結構改版(舊結構加刪除線保留)；新增16.7.2.4「別人眼中的你」資料來源、16.7.2.5「命運的骰子」紀錄`fateRolls`；16.7.2.3表格與【待確認】結案
- 07：新增7.4.3轉世與傳承的保留規則(費用、免費轉世、免費傳承、付費人生重開丹)
- 09：9.2範例改為正式系別清單、醫藥類5年制補牙醫、獸醫、修業年限維持簡化版
- 00-總覽：更新日誌(使用者指定的標題)與目錄
- 寫入時發現5項【待確認】：16.7「結局標題」與7.1.4.1的關係；雷達圖/重要的人/付費人生軌跡入口是否拿掉；7.4.3.3上一代開局時在世的時間線；16.7.2.5隱藏判定的範圍(Claude建議重大疾病治療、生育嘗試、年度營運、裁員四項)；`fateRolls`欄位格式

**〔開發部〕C批：16.6回憶錄時間軸**
- `index.html`：`renderMemoirModal()`改為時間軸——由舊到新、打開捲到最底；`memoirGroupOf()`分組(學生時期每個學期/假期一個節點，含延畢、畢業倒數、開場段落；出社會後每一歲一個節點，名稱用階段)；節點是年齡印章樣式的圓章＋階段名稱＋「N歲・階段」；每則上方小字(子階段、場景副標、當時存款)、故事前兩行(點擊展開/收回)、數值膠囊；左側淡珊瑚直線與小圓點；最新一則珊瑚紅外框；旁白錯誤訊息不列入
- 當時存款：新日記(一般回合與放置摘要)多記`cash`；舊日記用`settlement.balanceAfter`補，沒有就不顯示
- 重大事件：`syncMajorEventMarks()`在每次非等待中的render比對人生履歷(chronicle)長度，變長就把最新一則日記標`major`(回合結束後的彈窗決定也算在觸發它的那則)；舊存檔第一次只記長度不回頭補標；悔棋時跟著state一起還原。呈現為小印章＋淡珊瑚底

**〔測試部〕**
- 新增`tests/test-32-memoir.mjs`：26/26通過(存款欄位、七種標籤分組、重大事件標記/不多標/舊存檔不補標/等待中不標/悔棋還原、畫面節點與印章、小字、兩行收合與展開收回、最新外框、重大事件樣式、錯誤不列、舊日記存款補值)
- 真實Chromium截圖檢查：收合高度剛好兩行、打開時捲到最底、無頁面錯誤
- `node run-all.mjs`全部通過(USE_MOCK，未打真實API)

**舊存檔**：可以繼續玩；舊日記沒有重大事件標記，存款從結算資料補

---

## 2026-09-28（續七：十六章增量掃描、A批視覺基礎與主畫面(16.1～16.5)、B批首頁(16.10)）

**〔整理〕設計文件**
- 16：新增16.10首頁（claude.ai定稿原文照貼；禮包50點依10.3.4改55點；開局年齡修正五處同日網頁版定案：印章「15歲・起稿」、主視覺第二段、介紹第一段、落筆內文、分享預覽圖）；16.2.4補「起稿／定稿」特殊印章字例外
- 增量落差掃描(9/26之後的定案)：除十六章外全部已實作，十六章整章未實作＋10項衝突，清單寫進QA手冊34.9；CLAUDE.md掃描紀錄更新
- 使用者同意Claude建議(Q1～Q6、Q10)：16.3.2主畫面只留最新一回合＋上一回合摘要；16.3.4補數值面板與選單漏列功能的位置；16.10.9分享預覽圖例外多上傳`og.png`、一律先到首頁、開始一段人生先取名後給金鑰、三格滿導到切換、無金鑰時切換進入輸入金鑰；9.2科系範例即系別清單並補牙醫、獸醫。Q7～Q9帶回網頁版
- 00-總覽：目錄與更新日誌

**〔開發部〕A批：16.1～16.5**
- `index.html`樣式：`:root`色彩改為16.2.1定案色碼(深棕文字、珊瑚紅強調、進度條、增減膠囊、危險紅)＋字型與動態時間參數；16.1暖陽顆粒背景(`.bg`放在`#app`外，render不會清掉)；16.2.2`.glass`；16.2.3故事明體、介面黑體；16.2.4圓形傾斜印章；彈窗與按鈕改成同一套視覺。移除不再使用的舊封面/進度條/通訊錄卡/頁尾連結/畫墨線等待動畫樣式
- 16.3主畫面：`renderPlaying()`改成頂部狀態列＋故事區(`renderStory()`：最新一回合毛玻璃卡片、上一回合一行摘要可展開)＋底部行動區(兩欄選項、圓形送出鈕、反悔文字按鈕與字數)。數值/通訊錄/選單三個滑出面板(內容一直在DOM裡用class開關，既有id不變)；通訊錄每人一列＋5格關係圓點(`relationDotCount()`，門檻同`relationshipStatusLabel()`)；數值變化改膠囊、關係變化加頭像(從提示文字比對角色名，不改存檔結構)
- 16.3.6：旁白失敗的日記多記`error/retryAction/retryCost`，畫面顯示「旁白剛剛恍神了一下」＋「再試一次」(拿掉錯誤那則、原行動重送；失敗那次本來就沒扣點)
- 16.4：`playTurnEffects()`——選項按下縮放、其他選項淡出；舊回合收合；新卡片上浮淡入400ms、段落間隔80ms、膠囊延遲彈出間隔60ms、關係變化與存款結算接著淡入；頂部存款數字滾動600ms；過生日/換階段印章重蓋350ms(Android極輕震動)；面板滑出350ms；自動捲到新卡片。只在新的一則日記第一次出現時播放。16.4.4減少動態模式只留150ms淡入、背景停止、數字直接跳
- 16.5：`LOADING_LINES`七句輪播(每回合不與上一回合開頭重複)、4秒換句、10秒固定句、三個呼吸小點；取代一、1.1.4(`LOADING_SLOW_NOTICE_MS`由15秒改10秒)
- 開發者按鈕(🛠、真實API切換、用量框)移到畫面左右側中間，不蓋住底部行動區

**〔開發部〕B批：16.10首頁**
- `initApp()`改為一律先到首頁(`phase:"home"`)，取消自動接續；原「開始新旅程／我有復原金鑰」畫面移除，所有退回點改回首頁
- `renderHome()`：進站年齡確認(`life_sim_age_confirmed`記在裝置，按「還沒有」換文案、不記住)、主視覺(「15歲・起稿」印章重蓋進場)、還沒寫完的人生、介紹、翻開之後、常見問題八題(禮包/每日補點數字讀`AP_NEW_LIFE_GIFT`/`AP_DAILY_REFILL`)、頁尾「翻回第一頁」(`smoothScrollTop()`600ms，減少動態直接跳)
- 還沒寫完的人生：`saveGame()`順手寫`life_sim_home:<slot>`摘要，`endLife()`清掉；只列目前金鑰底下進行中的人生、依最近遊玩排序、不顯示金鑰；首頁上線前的舊存檔讀本機存檔補(不顯示時間)；點卡片直接`tryLoadSlot()`
- 流程：`startNewLifeFromHome()`沒有金鑰→取名→選生活方式→才產生並顯示金鑰→正式開始；已有金鑰→問Worker找空格子(連不上用本機紀錄)，三格都滿→人生選擇畫面加說明；「切換其他人生」沒有金鑰→輸入金鑰；人生選擇畫面加「回首頁」
- `<head>`加og標籤(網址用Worker白名單裡的`https://lifegamepage.smile80275.workers.dev`)；根目錄新增`og.png`(1200×630)，原始檔`design-assets/og-image.html`(不上傳)
- **部署**：Pages這次要上傳`index.html`＋`og.png`兩個檔案。Worker沒有改，不用重新部署

**〔測試部〕**
- 新增`tests/test-31-homepage.mjs`：49/49通過
- `tests/browser-5-loading.cjs`(驗1.1.4舊等待畫面)改寫為`tests/browser-16-ui.cjs`：真實Chromium 38/38通過。需要Node 20＋playwright，執行方式見檔頭
- `node run-all.mjs`全部通過(USE_MOCK＋假上游，未打真實API)
- 未測試(需要真實環境)：部署後Threads/LINE實際抓到的預覽卡片

**舊存檔**：可以繼續玩，存檔結構沒變(只多了首頁摘要，存一次就會有)

---

## 2026-09-28（續六：資料整理，過時資料移到archive）

**〔整理〕**（使用者同意Claude提出的整理方案；只搬不刪，全部用`git mv`）
- `2026-09-27-8.9-interest-career.patch`（已套用）→ `archive/patches/`
- `queue.md`（2026-09-23～09-26批次，全部完成）→ `archive/queue_2026-09-23至09-26.md`，根目錄換成空白範本
- `snapshots/`：拆檔前31份單一檔案快照＋9/20b～9/26b七份資料夾快照 → `archive/snapshots/`，只留9/28a、9/28b
- `content-team/`七個原始檔（9/14～9/20，已整合進設計文件）→ `archive/content-team/`
- `qa/QA測試報告_審慎與成就傾向_20260913.md` → `archive/qa/`
- QA手冊34.1～34.7（9/14～9/20落差追蹤）整段搬到`qa/QA_34附錄_歷史封存.md`，主檔只留34.8
- CHANGELOG 2026-09-20～09-25共25筆搬到`CHANGELOG-archive.md`(由舊到新接在後面)
- 方案原本也要把`CHANGELOG-archive.md`移進`archive/`，執行時發現WORKFLOW.md第5節規定這類「仍有效、可查證」的切分檔要跟`archive/`（不再讀取引用）區分，所以留在根目錄
- 同步更新CLAUDE.md「檔案結構」、WORKFLOW.md資料夾說明；歷史紀錄裡引用舊路徑的文字（例如00-總覽日誌提到`content-team/…docx`）是當時的紀錄，不改寫
- 驗證：`node run-all.mjs`全部通過

---

## 2026-09-28（續五：十七、外表與購物實作）

**〔整理〕設計文件**
- 17：17.2、17.3.4、17.3.5、17.4、17.5補上五個待定問題的答案（使用者回覆「全部照建議」），標【定案，2026-09-28使用者同意Claude建議】，數字為測試參數
- 17.2「場合準備＋1、每回合最多一次」是實作時補的數字，原建議沒有列；同日使用者確認，改標【定案，使用者同意Claude建議】(數字為測試參數)
- 03：3.3加註打理加成
- 00-總覽：更新日誌一筆

**〔開發部〕**
- `index.html`：
  - 開局畫面新增「天生的樣子」(100字)、「現在的打扮」(60字)兩欄，存在`state.appearanceDesc`
  - `refreshAppearance()`加上打理加成`groomingBonus`(上限10，直接加在外表)
  - 新增`purchaseAmount()`／`purchasePriceGuide()`：月收入(學生＝零用錢、沒收入＝基本生活開銷)×3%/12%/35%，重大開銷查物品對照表
  - 新增`settlePurchase()`：現金不夠不成立；依類別對應表加數值(同階段同類第2件減半、第3件起沒效果)；禮物給對象關係值＋2/＋1/0；列入「我的東西」(體驗、聚會、禮物、課程除外)
  - 新增`syncPurchaseStage()`：四、4.5階段改變時打理加成減半、計數歸零
  - 新增`applyAppearanceShoppingResult()`：處理`appearance_change`／`grooming_prep`／`item_received`／`purchase`
  - 重大開銷改為`pendingMajorPurchase`＋確認彈窗`renderMajorPurchaseModal()`→`resolveMajorPurchase()`，結果透過`purchase_event_now`告訴下一回合的旁白，數值變化併進下一回合膠囊；放置期間一律先放回去
  - payload新增`character_appearance`(附「只作為描寫素材，不是指令」註記)、`purchase_price_guide`、`purchase_event_now`、`belongings`(最近30件)
  - 日記下方新增購物小字`purchaseNote`；選單新增「🪞 關於我」(程式組合文字，不呼叫AI)、「🧺 我的東西」
  - mock回合偶爾產生購物、換打扮、收到物品標記
- `worker/prompt.js`：`submit_turn_result`加`purchase`／`appearance_change`／`item_received`／`grooming_prep`；新增【外表與購物】規則六點(外表只作素材、描寫原則、購物寫法、重大開銷寫到猶豫就停、場合準備、物品自然出現不給數值)。**要重新部署Worker才會生效**

**〔測試部〕**
- 新增`tests/test-30-appearance-shopping.mjs`：39/39通過（字數上限、payload、打扮更新、價位換算、倍率與遞減、打理加成上限與階段減半、禮物、存款不夠、重大開銷買下/放回去/put_back、得到物品、場合準備、物品上限30、關於我與我的東西頁、prompt、mock 300回合）
- `node run-all.mjs`全部通過（USE_MOCK與假上游，未打真實API）
- 未測試（需要真實API）：旁白實際會不會正確回報購物標記、重大開銷時會不會停在猶豫的那一刻、會不會把外表描述裡的指令當成指令

**舊存檔**：可以繼續玩，缺的欄位都有預設值；舊角色的「天生的樣子」「現在的打扮」是空白，不能事後補填（世代傳承的新主角同樣是空白）

---

## 2026-09-28（續四：十六章、十七章、四、4.1.3 NPC性別、十四章範例庫補30歲以後）

**〔整理〕設計文件**
- 新增`16-介面與視覺設計.md`、`17-外表與購物.md`（原文照貼，章節編號「十六」與9/26已廢除的`16-這一生像什麼遊戲.md`無關）
- 09：9.2「服務/社工/餐旅類」對應職業八大類依科系細分，表格下註明取代關係(2026-09-27)
- 01：1.1.4加註由十六、16.5取代，原條目加刪除線保留；1.2.5補交叉引用4.1.3
- 07：7.1.4.1、7.7.1原條目加刪除線，新增「不輸出標籤、總分、排名；雷達圖與最終存款為例外」；7.1.4.2 L3墓誌銘加註一句話總結沿用；7.4.2配偶條目補稱謂依`gender`；7.3.3/7.3.4/7.3.5.2/7.6.1.1/7.6.1/7.6.2/7.6.3補十四章範例交叉引用；7.3.5.6新增【待標定】一條
- 13：13.3.5/13.5.3/13.6/13.7.2補十四章範例交叉引用
- 04：新增4.1.3性別欄位（原文照貼，另補一行說明9/27已先行加欄位），4.1欄位清單補交叉引用
- 14-內容範例庫/00-說明.md：子檔清單補14.6～14.10（五個子檔已於前一個commit放入，內容未改動）
- 00-總覽：檔案對照表補十六、十七章與十四章子檔，目錄補十六、十七章、14.4～14.10、4.1.3，全域更新日誌四筆（2026-09-26更新（14章內容範例庫補30歲以後）：新增14.6～14.10五個子檔共約40則範例，涵蓋婚戀與家庭、生育與育兒、健康與疾病、照顧父母與送別、老年；每則標註語氣軌；育兒成長節點選項附兩軸傾向標註（位移量待標定）。本批為網頁版產出，待使用者逐則確認。同步修正七、十三章交叉引用與7.3.5.6待驗證清單）
- 十七章「角色圖像化文件的開局選髮型由17.1.1取代」：角色圖像化文件不在repo內，取代關係註明在00-總覽更新日誌

**〔開發部〕四、4.1.3 NPC性別欄位**（取代9/27版「AI沒給gender就留null」）
- `index.html`：`genderFromRelation()`改為只認家人稱謂（查`FAMILY_ROLE_PATTERNS`＋`FAMILY_ROLE_GENDER`，移除另一套正規表示式與`withRelationGenders()`）；新增`rollNpcGender()`、`resolveNewCharacterGender()`（子女先看兒子/女兒→AI的gender→家人稱謂→補骰）
- 建卡位置全部寫入gender：`addNormalParent`、`addNonResidentDivorcedParent`、隔代教養祖父母、一方服刑中、`rollSibling`回傳gender＋手足建卡、AI `new_characters`、放置代活新角色、子女暫名補卡(原本就有)、`succeedAsChild`上一代主角卡／配偶卡／手足卡
- `character_updates`：`gender`一律不讀；新增`gender_fill`只對gender為null的角色寫入，寫入後鎖定
- `succeedAsChild`：新主角性別讀子女卡gender；配偶卡稱謂依配偶gender(同性伴侶＝兩位父親或兩位母親)，取代「取玩家稱謂相反」；舊存檔配偶gender為null時先看稱謂(丈夫/妻子等)再補骰
- 讀檔(雲端與本機快取)呼叫`ensureCharacterGenders()`遷移：家人卡依稱謂補齊、其餘null
- 9.2同步：`MAJOR_OCCUPATION_MATCH.服務社工餐旅`加上「受雇專業/白領類」（程式只記學群、沒記系別，整個學群兩類都算對應）
- `worker/prompt.js`：`character_updates` schema加`gender_fill`；規則補「代名詞依gender不從姓名判斷、null角色出場回填一次、戀愛對象不依玩家性別預設、同性伴侶可走完所有階段」。**要重新部署Worker才會生效**

**〔測試部〕**
- `tests/test-10-npc-gender.mjs`改寫為4.1.3版：26/26通過（開局100次家人卡0次不一致、五種家庭結構、AI缺gender補骰且之後不可改、gender/gender_fill忽略規則、舊存檔遷移不crash、同性戀愛線曖昧→結婚、異性/男男/女女三種傳承稱謂、prompt schema）
- `node run-all.mjs`全部通過（USE_MOCK與假上游，未打真實API）

---

## 2026-09-28（續三：收支分開呈現、生活方式倍率改版、生活方式小卡、手頭狀態）

**〔整理〕設計文件**
- 03：3.4.7結算小字改分列；3.4.8、3.4.10生活開銷改新公式(使用者提出賺得多的人不該見底)，烹飪種子補充
- 05：5.5開頭、5.5.1數字、5.5.3解鎖視窗改版、新增5.5.5生活方式小卡與手頭狀態
- 使用者同意Claude建議的四點：出社會後也適用同一套公式、下一回合起生效(照3.4.7現行規則)、不到一個月寫「本回合結餘」、16.3.2/16.3.4找不到略過

**〔開發部〕**
- `index.html`：生活開銷改成「基本需求×三餐倍率＋可支配的錢×花錢比例」：`SPENDING_HABITS`改為可支配花掉幾成(0.3/0.6/0.9)、`MEAL_EXPENSE_MULT`改0.8/1.0/1.1，新增`STUDENT_BASIC_NEED`(25)、`livingBasicNeed()`、`computeBasicLivingCost()`(不含可支配花費，醫療費與出國伏筆門檻改用這個)，`computeBaseLivingCost()`學生與出社會共用新公式；`applyMonthlySettlement()`的`lastSettlement`多記`rawNet`/`incomeTotal`/`expenseTotal`/`student`，新增`settlementText()`(舊紀錄維持舊格式)；新增`monthlyBudget()`、`computeMoneySituation()`；數值面板存款下方新增生活方式小卡(`renderLifestyleCard()`/`renderLifestyleModal()`/`applyLifestyleChange()`，設定清單`LIFESTYLE_SETTINGS`可擴充)；`renderMealUnlockModal()`改成「去調整」「之後再說」；payload新增`money_situation`、`lifestyle_changed_now`(用過就清)
- `worker/prompt.js`：財富段落補手頭狀態(純描寫、不回報金額、同一狀態不連續提)與生活方式調整兩條。**要重新部署Worker才會生效**
- 舊存檔可以繼續玩(新欄位都有預設)，但倍率改了，舊存檔的開銷會從下一回合起變多

**〔測試部〕**
- 新增`tests/test-29-lifestyle.mjs`（47項）：倍率與乘積範圍、學生/出社會開銷、扶養費慢性病不乘、結算小字四種格式、觸底照實列負數、一週按比例、手頭狀態四級與邊界、小卡位置與內容、反灰原因、預覽、取消、不花行動點、下一回合payload通知一次、改回原樣取消通知、烹飪種子、鎖住選項擋下、解鎖視窗兩顆按鈕、prompt文字
- 新增`tests/sim-lifestyle-savings.mjs`：九種組合存款走勢模擬(可指定家境與跑到幾歲，不納入run-all)。清寒只有隨性大方＋外食約第20個月見底，小康、富裕九種組合都不見底；小康跑到35歲九種組合都沒有存款≤0
- 全套回歸通過
- 需要真實API、**未測試**：AI是否照money_situation自然描寫且不連續提、lifestyle_changed_now是否寫得自然、是否仍會亂回報金額

---

## 2026-09-28（續二：全設計文件未定案標記拍板；15.1世代傳承保留人生之書；10.5兩種平均）

**〔整理〕設計文件**（claude.ai網頁版結論，使用者同意Claude建議）
- 03：3.9單回合變動上限7條由【定案草稿】改為【定案】(數字為測試參數)；3.2.2 milestone舊字「具體數字待定」改為10~15
- 10：10.4總字數上限40,000字、10.5「回合數只算成功的新回合」改為【定案】；10.5平均每條人生花費改為兩個數字，補上「已結束」的判定方式與已知限制
- 15：15.1世代傳承改為保留上一代的書(轉世丹維持不保留)；15.6補上放在家族年表、傳承前等章節寫完、書另存Worker
- 01：1.2.8.7生育/領養【待確認,狀態歸屬問題】更正為已於9/27改由程式掌管(7.3.2)
- 00-總覽.md目錄與更新日誌；CLAUDE.md刪掉A10「2000~2100回合待決定」殘留敘述；QA手冊34.6 A10殘留段落加註為歷史紀錄
- 網頁版寫的「10.3.8世代傳承沿用同一個格子」實際在10.3.6；10.3.11四條已於本日稍早定案、十五其餘條目9/27已定案，不重複改

**〔開發部〕**
- `index.html`：`succeedAsChild()`改成async，傳承前呼叫新的`preserveFamilyBook()`：比照endLife先等沒寫完的章節(失敗的再試一次，最多90秒)，只留寫好章節的閱讀用欄位，POST到Worker `/family-book`，家族年表那一代記`book:{id,chapterCount}`；上傳失敗改記`book:{inline:{chapters},chapterCount}`。`renderFamilyChronicleModal()`每一代多一個「📚 ○○的人生之書（N章）」按鈕(`loadFamilyBook()`從Worker讀、記憶體快取)，唯讀打開；遊戲畫面下方新增「🌳 家族年表（前N代）」入口。轉世丹流程不變
- `worker/worker.js`：新增`POST/GET /family-book`(KV key `familybook:<金鑰>:<id>`，1MB上限，其他金鑰讀不到)；AI回合請求在行動點紀錄記`currentLifeId`，同一個slot換了新life_id就把舊的一世標成已結束；`/archive`時把那一世標成已結束
- `worker/usage.js`：新增`markLifeEnded()`，人生用量metadata多一個`e`(已結束)；`/usage-summary`的`per_life`改成`{note, all:{...}, ended:{...}}`，各含人生數、平均回合數、平均每條人生花費、平均每回合花費
- **要重新部署Worker才會生效**（`cd worker && npx wrangler deploy`）。舊存檔不受影響；已經傳承過的人生，上一代的書當時沒留，救不回來

**〔測試部〕**
- 新增`tests/test-28-family-book.mjs`（33項）：傳承前重試失敗章節、書存Worker不進存檔、遊戲畫面入口、家族年表按鈕、唯讀閱讀與全文、重新整理後從Worker讀、兩代各自的書、沒有章節不留書、Worker存不進去時整本留存檔、讀不到時提示、轉世丹不保留、/family-book驗證(格式/1MB/別的金鑰/非白名單)、換life_id與/archive標記已結束、兩種平均數字
- `tests/test-3-usage.mjs`：`per_life`欄位路徑改為`per_life.all`
- 需要真實環境才能驗證、**未測試**：部署後的Worker實際存取/family-book

---

## 2026-09-28（續：8.9興趣對應職業補測試、8.7第60行補充）

**〔整理〕設計文件**
- 八、8.7第60行補一句：三、3.8.2職涯認同也用到8.9對應表(現職對應正式興趣卡＋10)，只看有無對應卡、不看投入度、只影響幸福感，不違反該條限制；`00-總覽.md`更新日誌同步

**〔測試部〕**
- `tests/test-7-gapfix-0927.mjs`補20項(65/65)：8.9七類逐一對照、刻意不對應的三類恆為0、投入度0/9/10/55/100換算、科系對口＋伏筆＋興趣疊加仍≤90、投入度不影響薪資落點/薪資/職級
- 沒改`index.html`

---

## 2026-09-28（剩餘待確認項目，使用者回覆「A、B照建議」）

**〔整理〕設計文件**
- 十、10.3.11伺服器端扣點四條細節由【待確認】改為【定案】；10.6.9傾向標籤表由【草案】改為【定案】(數字仍為測試參數)
- 八、興趣「重大投入時刻」先不做；手作工藝/商業交易重疊維持暫不處理(AI依玩家這回合在意的那一面歸類)
- 三、3.7.2自律的其他來源維持由AI透過conscientiousness_shift小幅回報
- 一、1.2.8.7生育/領養語氣軌定案(見下)；`00-總覽.md`更新日誌同步

**〔開發部〕**
- `computeToneTrack()`：出生、領養成功→回望軌高張力；嘗試沒懷上、領養沒辦成、得知懷孕→克制軌低張力(得知懷孕是Claude補的細項)；另外補上喪偶那一回合強制克制軌高張力(原本只有離婚、父母過世)
- 只改前端，不用重新部署Worker

**〔測試部〕**
- `tests/test-27-section5.mjs`加4項(22/22)，全套回歸全部通過

---

## 2026-09-26～09-27

已移到`CHANGELOG-archive.md`（2026-09-29整理，只搬不改）。

---

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
