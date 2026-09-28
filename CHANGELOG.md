# 人生草稿——開發/測試異動紀錄

> 這份文件記錄每一次對 `index.html` 或資料夾結構的實際改動。設計規則本身的異動記錄在
> `life-sim-design/00-總覽.md` 的「全域更新日誌」，兩份文件分開維護，不要混在一起寫。
> （2026-09-20更正：原本寫的是拆檔前的`life-sim-full-design-doc.md`「1.3 更新日誌」，該檔案已封存到`archive/`。）
>
> 每筆記錄格式：日期 / 身分（開發部・測試部・整理）/ 做了什麼 / 對應設計文件章節（如適用）/ 驗證方式。
>
> **這份檔案只保留最近的紀錄。2026-09-14～2026-09-25（含所有「續」）已搬到 `CHANGELOG-archive.md`**（2026-09-28整理時把9/20～9/25也搬過去）——內容還是有效、可查證，只是平常同步近況用不到，先切開避免每次都要讀過全部歷史。之後如果這份檔案本體又累積到一定長度，會再往`CHANGELOG-archive.md`續補（同一份封存檔案往下加，不再另開新檔）。

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

## 2026-09-27（續十三：兩份草稿定案）

**〔整理〕**
- 使用者確認：七、7.7.6人生特質六種白話描述、十、10.6.10放置代活彈窗代選對應表，設計文件由【待確認】改為【定案】；index.html對應註解同步。10.6.9傾向標籤表的數字維持【草案】測試參數
- 只改文件與註解，程式行為不變

---

## 2026-09-27（續十二：第五節文件矛盾拍板，使用者回覆「全部照建議」）

**〔整理〕設計文件**
- 03（3.4.7以天數結算為準、3.9與12.13的關係、3.4.11子女18~22歲扶養費）、06（6.2破格只由系統判定）、07（7.3.2生育大方向由程式掌管）、11（機率保密只適用非明牌節點）、12（12.13收窄為職涯收入、12.10不退休類別對照八大類）、13（13.6原生家庭房產）、04（4.1信任/熟悉/虧欠這版不做）、01（411行待確認指向7.3.2）、15（人生之書全章改為【定案】）；`00-總覽.md`更新日誌、QA手冊34.8狀態與34.8.5同步

**〔開發部〕**
- 3.4.11：`childSupportAmount()`在18~22歲照國小到高中那一級計算（`CHILD_SUPPORT_COLLEGE_MAX_AGE`）
- 12.13：`one_time_transaction`裡標籤像薪水/獎金/年終/分紅/營收/退休金的正數收入不入帳，記`career_income_blocked`待確認旗標
- 7.3.2：新增`applyFertilityTurn()`(呼叫AI前執行)：有伴侶且行動提到想生小孩/備孕/試管時，依`computeFertilityProbability()`(年齡基礎×健康×財務)擲骰，懷上後270天出生；領養需財務健康度≥40；`fertility_event_now`、`pregnant`送AI。new_characters的is_child只在出生/領養那回合採用，AI沒建就程式用暫名補一張
- 13.6：`ensureFamilyHome()`依家境決定原生家庭有沒有房子(價值＝家庭月收入×120)，`settleFamilyHomeInheritance()`在最後一位同住家長過世時繼承(和在世手足平分)，計入房產淨值並寫履歷；`home_share`送AI
- `worker/prompt.js`：防壓抑第(2)點改成破格只看breakthrough_event_now；生育段改為系統判定；one_time_transaction不回報職涯收入；home_share說明。**要重新部署Worker才會生效**

**〔測試部〕**
- 新增`tests/test-27-section5.mjs`：18/18通過，連跑3次穩定
- 全套回歸：27個測試檔、595項全部通過
- 需要真實API才能驗證、**未測試**：AI是否照fertility_event_now寫、是否還會自行宣告破格或回報職涯收入

---

## 2026-09-27（續十一：部分修正項目補完，使用者授權Claude全權判斷）

**〔開發部〕**
- 13.5.2：照顧彈窗新增「自己想辦法安排」自訂輸入；跟手足分工改依關係值分支援/衝突(`sibling_tone`送AI)；`startCaregiving()`／`applyCaregivingTurn()`／`endCaregivingIfDone()`：自己照顧時在職者減工時(月收入×0.8，照顧結束恢復)，照顧期間每回合健康−0.5，`caregiving_now`送AI；放置代活的「顧家」與照顧負荷共用同一個狀態
- 13.3.4：prompt補上徵兆期「要不要去檢查」的寫法。**要重新部署Worker才會生效**

**〔測試部〕**
- 新增`tests/test-26-caregiving.mjs`：9/9通過，連跑3次穩定
- 全套回歸：26個測試檔、577項全部通過

---

## 2026-09-27（續十：第三節第五批，十、10.6放置代活＋11.4＋6.5，使用者授權Claude全權判斷）

**〔開發部〕Worker**（**要重新部署Worker**）
- `ap.js`：`postCharge()`成功時記`lastActionDate`；`offlineDaysBetween()`／`claimIdle()`(完整離線天數×5，最多35，領過就歸零)；`preIdleSummary()`(每次放置最多3次摘要)；`chargeIdleRollback()`(扣5點、每次放置一次)
- `worker.js`：新路由`POST /idle-claim`、`POST /idle-rollback`；AI請求新類型`kind:"idle_summary"`(驗證素材、不扣點、遙測記在idle類別)；一般回合遙測多記最後一回合的emotional_tone
- `prompt.js`：新增`IDLE_SUMMARY_SYSTEM_PROMPT`與`IDLE_SUMMARY_TOOL`(retrospect/fragments/new_characters)
- `usage.js`：類別新增idle；每條人生metadata加最後活動日與最後語氣；`/usage-summary`新增`churn`流失分析(6.5)

**〔開發部〕前端**
- 放置引擎：`idleTagWeights()`(10.6.9權重＋安全規則)、`pickIdleTag()`(75%性格／25%隨機)、`applyIdleTag()`、`nextIdleLine()`、`simulateIdleRound()`、`runIdleRounds()`；放置期間`s.idleMode`讓死亡、新的重大疾病、父母與配偶過世都不判定
- 彈窗代選：`idleResolvePendingPopups()`處理21種彈窗，對應表`IDLE_POPUP_MAP`(【待確認】，已寫進設計文件10.6.10)；每個決定前存回溯快照(含還沒決定的彈窗)
- 回來流程：遊戲畫面下方「放置代活：開／關」；`maybeRunIdle()`→`claimIdleRounds()`(mock本機算／真實模式問Worker)→跑完放置→`writeIdleSummary()`(AI一次或mock)→建新角色(只來自新朋友回合、最多2位)→摘要寫進日記→`renderIdleSummaryModal()`(回顧、關鍵片段、數值變化、展開每回合、可回到此處)
- 回溯：`rollbackIdleDecision()`扣5點、還原快照、作廢回合標「已改寫」、重新跳出那個彈窗；放置結束後悔棋快照清掉
- 重構：月結算抽成`applyMonthlySettlement()`、回合結束的彈窗分派抽成`dispatchPendingModals()`(內容不變，一般回合照舊)
- 修正：新寫的權重抽選函式一開始叫`weightedPick`，蓋掉開局抽家庭結構用的同名函式，全套回歸抓到後改名`pickByWeightMap`

**〔測試部〕**
- 新增`tests/test-25-idle.mjs`：36/36通過，連跑3次穩定（Worker路由與天數、摘要額度、回溯扣點、遙測；mock放置35回合不死亡、彈窗代選與回溯點；回來流程與回溯；真實模式Worker算天數＋AI摘要）；`harness.mjs`的假上游加上submit_idle_summary
- `test-8`：父母過世那段改成直接放一張父母卡(開局抽到隔代教養時沒有父母，測試會偶發失敗)
- 全套回歸全部通過
- 需要真實API才能驗證、**未測試**：AI摘要的寫法品質、新角色名字與性別是否相符

---

## 2026-09-27（續九：第三節第四批，七、7.7人生特質，使用者授權Claude全權判斷）

**〔開發部〕**
- `classifyLifeTrait()`：依playStyle六型分類(門檻【測試參數】)，計數不足回「這一生還看不太出特定樣子」；死亡時存`state.lifeTrait`，傳承時再判定一次存進`familyChronicle`
- 人生回顧(`renderArchiveView`)新增「看看這一生的樣子」：`renderLifeTraitModal()`特質卡(SVG五條長條) → 六選一猜測 → 揭曉描述＋編年史兩三筆(`lifeTraitEvidence()`)＋猜中/猜錯收尾；看不太出時直接顯示那句話、不猜
- 分享卡：`renderShareCardPicker()`勾選編年史事件，`drawShareCard()`用canvas畫成PNG下載；瀏覽器不支援時顯示提示
- 家族年表：`renderFamilyChronicleModal()`每一代一格，點開是那一代的特質卡
- 下一代開局：`prevGenerationEventTitles`只在傳承後的開場回合以`previous_generation_events`送AI；計數器與特質描述不送AI(7.7.2)
- 7.7.6六種白話描述先寫草稿，寫進設計文件並標【待確認】
- `worker/prompt.js`：previous_generation_events的寫法說明。**要重新部署Worker才會生效**

**〔測試部〕**
- 新增`tests/test-24-life-traits.mjs`：22/22通過（jsdom不支援canvas，那一筆「Not implemented」不算錯誤；真實瀏覽器存圖**未測試**）
- 全套回歸全部通過

---

## 2026-09-27（續八：第三節第三批，使用者授權Claude全權判斷）

**〔開發部〕**（數字皆為【測試參數】）
- 12.2：`checkJobSearchTrigger()`改成開一段求職期(`jobSearchPhase`，第一次5~6回合、之後3~5回合)，最後一回合結束才排入投遞彈窗；`job_search_phase`送AI寫混合內容
- 12.9：`workplaceRelationCategory()`把職場說法歸成同事/主管/下屬/客戶或合作對象；創業彈窗改寫：依`partnerOptionProb()`(團隊值)出現「找某人合夥」選項(`findBusinessPartnerCandidate()`)，合夥時資金×0.5、事業收入×0.7(`businessIncomeFactor()`)、營運成功率+5；補上「先不創業」按鈕(原本現金足夠時只能按啟動)
- 12.10：退休彈窗新增「自己決定怎麼安排」自訂輸入(視同繼續工作，文字送AI)；`retirementTenureAdjustment()`依`careerYearsWorked`微調替代率(±6個百分點)；`canHandOverBusiness()`／`handoverHeirCandidate()`：自營者可交棒給成年子女，世代傳承選到繼承人時`familyBusinessFromPrevLife`，下一世出社會先跳接手家業彈窗
- 既有問題順手修正：自營者一般退休後事業原本仍是「經營中」，年度營運判定會繼續改寫月收入；改為退休時事業收起
- `worker/prompt.js`：求職期寫法、職場關係用詞、合夥與退休自訂/交棒說明。**要重新部署Worker才會生效**

**〔測試部〕**
- 新增`tests/test-23-batch3c.mjs`：26/26通過，連跑3次穩定
- 說明：mock長程測試的自動點擊只點彈窗第一顆按鈕、不會按投遞，所以mock人生本來就找不到工作；這項改成只確認有進入求職期
- 全套回歸全部通過
- 需要真實API才能驗證、**未測試**：AI是否照求職期混合寫法、是否用四種職場關係用詞

---

## 2026-09-27（續七：第三節第二批，使用者授權Claude全權判斷）

**〔開發部〕**（數字皆為【測試參數】）
- 4.3.1／13.8：`MILESTONE_DEFS`新增divorce、child_left_home、retirement、major_illness_diagnosed、became_caregiver、parent_death、widowed，全部auto；`completeMilestone()`掛在各事件發生處；`ensureMilestoneDefs()`替舊存檔補欄位；履歷文字補上離婚/離家/退休/照顧
- 4.2.2：parent_retirement改auto，`checkParentRetirements()`(年度)依父母卡年齡判定(65歲，自營業者70歲)，自營業者退休照舊觸發接手家業；`parent_retirement_event_now`送AI；prompt改成AI只回報3個里程碑
- 13.7.2：`rollSpouseAnnualDeath()`(年度)：配偶用7.1.5年齡基礎機率判定，喪偶後配偶卡widowed/已故、收入歸零、喪偶里程碑與履歷、第1層提示、當回合幸福感heavy；結婚時補配偶年齡；關係標籤「已故的配偶」；`spouse_death_event_now`送AI
- 7.6.3：離婚8回合後`checkDivorceRecoveryNode()`跳「一個人的生活」彈窗，`resolveDivorceRecovery()`三選一分別接自主感(`autonomyExtraChosen`)、自我實現、友情與歸屬；`divorce_recovery_event_now`送AI
- `worker/prompt.js`：里程碑回報清單、四種新事件的敘事說明。**要重新部署Worker才會生效**
- 測試修正：`test-11`、`test-12`清父母卡時一併清掉隔代教養的祖父母卡（開局隨機抽到隔代教養時會被當成另一位家長，造成偶發失敗；是測試資料問題，不是遊戲bug）

**〔測試部〕**
- 新增`tests/test-22-batch3b.mjs`：29/29通過，連跑3次穩定（含mock長程最多700回合）
- 全套回歸全部通過
- 需要真實API才能驗證、**未測試**：AI是否照喪偶、父母退休、離婚後重新開始寫敘事，是否還會自己回報parent_retirement

---

## 2026-09-27（續六：第三節第一批，使用者授權Claude全權判斷）

**〔開發部〕**（數字皆為【測試參數】）
- 3.4.2：`applyPartTimeWork()`在時間推進後、呼叫AI前執行：沒有正職的人行動提到打工/兼職/家教/接案等，依時薪(一般0.2、家教/技術0.3~0.5)×時數(每週12小時×本回合週數，至少4小時)入帳，`part_time_event_now`送AI；第一次打工里程碑改由程式完成。prompt要求AI不要再用one_time_transaction回報打工收入
- 3.2.3：`applyLogicGrowth()`：行動關鍵字(辯論/數理/程式/解題/策略/理財等)或科技邏輯興趣正向投入，邏輯＋1.5套邊際遞減
- 3.6：AI新欄位`style_signal`，`applyPersonalityStyleSignal()`累積，另一種風格≥8次且領先4次才換，換了寫履歷、`personality_style_changed_now`送AI
- 8.4：`applyInterestCost()`依類別扣材料費(學生存款不足不扣)，體能競技10%小傷、科技邏輯10%熬夜；下一回合以`interest_cost_last_turn`告訴AI
- 9.4：`checkNonLeaveGraduationDelay()`：大學期末考沒過＋(準備期興趣≥3次或財務長期偏低)＋額度夠 → 回到這學期開頭重跑、delay+0.5、halfYearCarry記半年、行事曆接續；`university_recent_event`告訴AI
- 13.3.5：重大疾病新增類型(`rollMajorIllnessType()`，五種)，排除相鄰年齡帶得過的類型；`major_illness_type`送AI
- `worker/prompt.js`：style_signal schema與說明、打工收入、延畢事件。**要重新部署Worker才會生效**
- 設計文件03、08、09、13補上判斷說明；`00-總覽.md`更新日誌、QA手冊34.8同步

**〔測試部〕**
- 新增`tests/test-21-batch3a.mjs`：28/28通過，連跑3次穩定（含mock連續400回合）
- 全套回歸全部通過
- 需要真實API才能驗證、**未測試**：AI是否正確回報style_signal、是否照打工金額/延畢/疾病類型寫敘事

---

## 2026-09-27（續五：第二節C批後七項，使用者授權Claude全權判斷）

**〔開發部〕**（每項各自一個commit，數字皆為【測試參數】）
- 3.3：新增`looksModifier()`／`refreshAppearance()`：顏值先天值不變，加上氣色（健康<30扣5、<15扣10）與保養（出社會後財務健康度≥75加3、≥90加5），都會隨狀態恢復。`annualTemperamentGrowth()`：每滿一歲氣質+1，財務健康度≥60那年再+1；關鍵事件揭露+2、性格破格+2
- 3.2.4：讀書/興趣次數只在期中/期末準備期累計（`inPrepPhaseThisTurn`）；`rollFinalExamCheck()`加入興趣拖累（轉系呼叫不受影響）；每次考試記入`examHistory`；帳本下方新增`renderTracks()`：課業（上次考試分數、準備期次數）與興趣（文字級距，不顯示數字）
- 3.8.2：`computeCareerIdentity()`由職涯狀態換算職涯認同；AI新欄位`club_activity`由`applyClubActivity()`累積社團參與（+8套邊際遞減，12回合沒活動起每回合−1）。兩者都跟原輸入取較高：友情與歸屬＝人脈×0.6＋max(非親密關係值,社團)×0.4；自我實現＝才識×0.5＋max(興趣,職涯認同)×0.5
- 7.1.1：AI新欄位`risky_activity`累積`riskyHobbyScore`（每次+1、每年−1，≥2算習慣），`riskyAnnualBonus()`讓危險職業與極限運動習慣各自加2個百分點，死亡與疾病機率共用
- 7.6.2：新增`marriageCrisisArc`／`advanceMarriageCrisisArc()`：觸發後浮現、攤牌各一回合（payload `marriage_crisis_arc`，語氣軌克制），攤牌結束才跳岔路彈窗；彈窗文案改成承接攤牌
- 12.3：`rollJobRiskSubtype()`錄取時依類別擲高風險工種（勞力/服務30%、長期不在身邊40%、軍公教/警消40%、自由/創作5%），`jobRiskSubtype`送AI（`job_risk_subtype`）；離職時清掉
- 13.7.2：`computeOldAgeTheme()` 60歲以後依比重表抽主軸＋骨幹素材送AI（`old_age_theme`）；`recentTones`記最近語氣，前兩回合都是unsettling/heavy時標記`need_breather`且不抽身體與醫療
- `worker/prompt.js`：club_activity、risky_activity的schema與說明；marriage_crisis_arc、job_risk_subtype、old_age_theme的敘事說明。**要重新部署Worker才會生效**
- 設計文件03、07、12、13補上判斷說明；`00-總覽.md`全域更新日誌同步；QA手冊34.8對應列改為已修正

**〔測試部〕**
- 新增`test-14-appearance`（13項）、`test-15-tracks`（10項）、`test-16b-happiness-inputs`（12項）、`test-17-risky-hobby`（8項）、`test-18-marriage-crisis`（10項）、`test-19-job-risk`（9項）、`test-20-old-age-theme`（10項），各連跑3次都穩定
- 全套回歸（20個測試檔）全部通過
- 需要真實API才能驗證、**未測試**：AI是否正確回報club_activity/risky_activity、是否照浮現/攤牌分段寫、是否照old_age_theme與need_breather調整、是否寫出高風險工種的感覺
- 舊存檔：新欄位都有預設值；舊存檔在職者的riskyLifestyle沿用舊的整類判定，下次換工作時才改用工種判定

---

## 2026-09-27（續四：第二節C批前三項，使用者授權Claude全權判斷）

**〔開發部〕**
- 7.4.2：`succeedAsChild()`提前算出繼承的教養風格；過世的上一代主角、在世配偶兩張家長卡的traits都以該風格的`parentTrait`開頭（配偶後面接自己原本的個性），關係值照舊延續；state新增`inheritedParentingStyle`
- 5.2.6：`newRoll()`單親離異時，`DIVORCED_PARENT_CONTACT_PROB`(0.6)建「父親／母親（不同住）」角色卡：不同住、自己骰教養風格與職業（不抽政治人物）、好感度依自己的風格區間−10；其餘長期失聯不建卡。不同住的一方不影響依附/社交起點與三餐資格；13.6「另一位家長照顧負荷」不套用在他身上。prompt補上「不同住＝探視見面、沒有卡＝長期失聯」
- **既有bug修正**：`rollParentHealthStageAdvance()`原本排除active===false的父母，但父母搬離或不同住後12回合沒互動就會被降為背景角色，從此不再老化、不會需要照顧也不會過世（服刑家長從第13回合起就是如此，105歲硬上限也判不到）。改為只排除deceased
- 8.7：新增`computeSideBusinessIncome()`，零星案每月+3、正式副業每月+6（【測試參數】），併入月結算收入；興趣淡成背景就停，正式副業升級成事業後不重複給。副業彈窗的選擇記成`sideBusinessEventLog`，下一回合以`side_business_event_now`送AI；`interest_status`每張卡帶`side_business`
- `worker/prompt.js`：副業三選一改由彈窗處理，AI不在choices重複列出；零星案/正式副業的敘事寫法（正式副業要寫出佔掉時間）；單親離異另一方的說明。**要重新部署Worker才會生效**
- 設計文件：05（5.2.6）、07（7.4.2）、08（8.7）補上判斷說明，`00-總覽.md`全域更新日誌同步

**〔測試部〕**
- 新增`tests/test-11-inherit-style.mjs`（7項）、`test-12-divorced-parent.mjs`（9項，含3000次開局統計）、`test-13-side-business.mjs`（10項），各連跑3次都穩定
- 全套回歸（12個測試檔）全部通過
- 需要真實API才能驗證、**未測試**：AI是否照家長卡語氣寫教養方式、是否把不同住家長寫成探視見面、是否寫出正式副業的時間壓力、是否還會在choices列副業三選項
- 不影響舊存檔：新欄位都有預設值；舊存檔已被降級的父母，下一次年度判定起就會恢復老化

---

## 2026-09-27（續三：四、4.1 NPC性別欄位）

**〔開發部〕**
- 4.1／1.2.5：角色卡新增`gender`（"男"/"女"/null）。AI建卡時在new_characters回傳gender（schema新增enum欄位）；enum外的值不採用。家人卡（父母、祖父母、服刑家長、手足、傳承後的家人）建立時由`withRelationGenders()`依稱謂記下；AI沒給、稱謂也推不出（例如「同學」「鄰居」）時維持null，不猜
- 性別一旦記錄就不變：character_updates不處理gender
- 送AI的active_characters每個角色帶gender；`ensureCharacterGenders()`在組payload時替舊存檔補上能從稱謂推得的性別
- 世代傳承：在世配偶轉成新主角的另一位家長時，稱謂改依配偶卡的性別（原本一律假設跟過世的一方相反，同性伴侶會被標錯）
- mock新角色的名字與性別成對產生
- `worker/prompt.js`：new_characters的gender schema、【NPC姓名與性別一致性】補上「gender已記錄就必須一致、null時不要自己改」。**要重新部署Worker才會生效**
- NPC詳細頁不顯示性別：4.1.1定案的顯示內容清單裡沒有這一項

**〔測試部〕**
- 新增`tests/test-10-npc-gender.mjs`：14/14通過，連跑3次穩定（含100次開局與mock 200回合）
- 全套回歸全部通過
- 需要真實API才能驗證、**未測試**：AI是否每次都填gender、名字是否跟性別相符
- 不影響舊存檔：缺gender時自動依稱謂補上

---

## 2026-09-27（續二：第二節2B批，使用者回覆「全部照建議」）

**〔整理〕設計文件**
- 15項建議做法寫進各章【定案，2026-09-27使用者同意Claude建議】（數字標測試參數）：03（3.2.2）、04（4.3）、05（5.2.4）、07（7.3.5.4、7.6.3）、09（9.5.1、9.5.3）、12（12.5、12.6、12.8.1、12.8.2、12.10）、13（13.2、13.3.2、13.3.4、13.6）；`00-總覽.md`全域更新日誌同步

**〔開發部〕**
- 3.2.2：milestone上限的人生階段改用`chronicleLifeStageKey()`（8段）
- 12.5：新增`resetLevelPeriod()`／`trackLevelPeriod()`，升遷看這個職級期間自律、責任感的最低值，以及有沒有負面事件（申請轉職被拒、連續兩次升遷失敗）；上任、升遷時重新起算
- 4.3：`refreshMilestoneLocks()`在同居未婚時把marriage_decision設成active，不再同居就回到available
- 5.2.4：照顧者型在同儕位置偏離取得當時的數值超過`PEER_SPECIAL_RELEASE_DRIFT`(20)時解除
- 12.6：第二次以後的轉職寫一句進履歷
- 7.6.3：離婚時把監護狀態記在每個子女身上；`parentingNodeOptionsFor()`讓非主要照顧者看到探視／電話／金錢支持的選項
- 9.5.1：轉系候選擲骰（50%＋(才識−50)×0.5＋(自律−50)×0.3）；轉系結果改用`rollFinalExamCheck()`，≥60分算成功，彈窗照期末考格式列出明細
- 9.5.3：財務面改看`computeFinancialHealthForState()`＜20連續4回合，達門檻後60%擲骰（沿用`lowCashStreak`欄位名，舊存檔相容）
- 12.8.2：營運成長的一年扣健康3×成就倍率；虧損改扣啟動資金×(10%＋規模×5%)
- 12.8.1：選正式副業不再當下創業，改由`checkSideBusinessUpgrade()`在滿24回合後排入創業彈窗
- 12.10：55～59歲每年跳退休彈窗（該年齡不顯示準時退休）；`canRetireEarly()`要求財務健康度≥50；重大疾病治療期觸發被迫退休；被迫退休彈窗只有半退休／專心療養，預設專心療養
- 13.3.2：急性病扣1個月基本生活開銷，之後3回合每回合健康＋2（`applyAcuteRecovery()`，不超過健康上限）
- 13.3.4：治療期每回合扣0.5個月開銷；進入治療期時配偶與子女好感＋2，並立刻做被迫退休判定
- 13.6：父母過世時依手足關係值標記協商/衝突（`siblings_estate`）；另一位在世家長的健康階段提前一階，並排入照顧決策（同一年不再推進）。抽出`queueEldercareDecision()`共用
- 7.3.5.4：子女的character_updates改讀`child_interaction`（closer/neutral/strained→+3/0/−3），不採用affinity_delta；mock同步產生這個欄位
- `worker/prompt.js`：child_interaction的schema與說明、siblings_estate/other_parent的敘事說明。**要重新部署Worker才會生效**
- **未做**：13.6父母房產遺產（家庭財務沒有房產欄位，需要先定義）；13.3.4徵兆期「要不要去檢查」的prompt指示

**〔測試部〕**
- 新增`tests/test-9-gapfix-2b.mjs`：42/42通過，連跑8次穩定（含mock連續500回合）
- `test-7`、`test-8`各有一項照舊規則寫的測試（休學必定成立、milestone階段key、轉系必定成立）改為固定骰值、照新規則驗證
- 過程中修掉三個測試不穩定的原因：開局隨機抽到隔代教養時祖父母卡沒清掉、`sweepUniversityState()`內部也會擲候選骰、疾病機率×健康倍率可能小於1；都是測試寫法的問題，不是遊戲bug
- 全套回歸全部通過
- 需要真實API才能驗證、**未測試**：AI是否正確填child_interaction、是否照siblings_estate/other_parent寫敘事
- 舊存檔：新欄位都有預設值；職級期間從讀檔後第一次檢查開始算

---

## 2026-09-27（續：掃描收尾＋第二節2A批）

**〔整理〕掃描收尾**
- `CLAUDE.md`「上次掃描記錄」改為2026-09-26全章掃描；`qa/人生草稿_QA_測試手冊_v1.md`新增34.8：完整收錄81條清單、複查結果與處理狀態（第一節、2A已修正的都有標記）
- 已套用的`2026-09-27-8.9-interest-career.patch`移到`archive/`

**〔開發部〕第二節「有做但不完整」2A批：規則明確、可直接做的項目**
- 3.2.2：`rollKnowledgeRawValue()`在milestone達階段上限時改算intensive（原本給0），AI回傳enum以外的值時降級為ordinary；同一event_id重複仍給0
- 3.4.11：子女扶養費改算所有在世的子女（原本只算active，非主要照顧者的子女被降級後扶養費就停了）
- 4.2：新增`recordMilestoneChronicle()`，結構化里程碑完成時自動寫一句進履歷（`milestoneChronicled`去重；舊存檔已完成的不補記）；prompt告訴AI這些不用再填major_event_summary
- 1.1.2：出社會時記`careerEntryAge`，標籤改成「入職第X年・上/下半年」
- 7.4.2：傳承家境改用現金＋房產淨值
- 9.5.1：轉系候選先檢查年齡門檻（連4年制都不可行就不成立），log加`candidate`、`ageFeasible`
- 12.4：錄取後可以接受或婉拒offer（保底offer也可以），彈窗加兩顆按鈕；拆成`applyJobHire()`／`acceptJobOffer()`／`declineJobOffer()`，重新整理後會補出決定彈窗。婉拒不算求職失敗，在職時婉拒會套轉職冷卻
- 11.2：求職、升遷、轉系的明牌彈窗列出屬性加成明細（`hireProbabilityBreakdown()`／`promotionProbabilityBreakdown()`，跟判定用的是同一份計算；轉系公式本身沒改）
- 12.3：失業、創業、收攤、退休時清除`riskyLifestyle`
- 12.8.1：新增`detectStartupIntent()`，自由輸入想創業就排入創業彈窗
- 12.6.1：新增`detectOverseasIntent()`／`checkOverseasTransferCandidate()`：自由輸入想出國/外派/移居時走海外型轉職，現金不足回報`overseas_blocked`給AI；海外錄取後解除原生家庭（父母/隔代/手足）的同住標記，配偶與子女不動（文件沒規定，Claude判斷）
- 13.6：父母過世的回合幸福感一律用heavy計算，不看AI回傳的emotional_tone
- 13.5.2：兩位父母同時需要照顧時排隊依序跳彈窗（原本第二位會被略過）；沒有手足時隱藏兩個手足選項，預設改成聘僱照服員/機構
- 4.1.1：日記裡的角色名可以點開詳細頁（只在遊戲畫面的日記啟用，人生之書與封存回顧不加）
- `worker/prompt.js`：12.7裁員不歸因玩家、2.2準備期混合內容、2.3假期活動選單、1.2.8.4.1關鍵事件前溫暖日常／事件後摘要、5.2.6喪親忌日回憶、8.6背景興趣用敘事記憶喚醒、`overseas_blocked`說明。**要重新部署Worker才會生效**

**〔測試部〕**
- 新增`tests/test-8-gapfix-2a.mjs`：41/41通過（含彈窗點擊與mock連續400回合）
- 全套回歸：語法檢查＋批次1/2/3/4/6＋十六＋9/27兩批全部通過
- 需要真實API才能驗證、**未測試**：新增的prompt敘事指示（假期選單、關鍵事件寫法、喪親回憶、背景興趣喚醒、裁員歸因）AI是否遵守
- 舊存檔：新增欄位都有預設值或相容處理（`careerEntryAge`缺時沿用22歲、`milestoneChronicled`缺時不補記）

---

## 2026-09-27（9/26落差掃描第一節：程式bug修正）

**〔整理〕9/26落差掃描**
- 用workflow（3個代理分章核對＋1個代理複查，只讀檔案）掃描`life-sim-design/`全部【定案】對照代碼：回報81條落差/未實作，複查後確認80條、存疑1條（7.3.2生育機率），誤判0條。完整清單在對話紀錄，尚未寫進QA手冊（等使用者確認）

**〔開發部〕第一節程式bug，16條全部修完**
- 3.4.8/3.4.10：新增`isStudentPhase(s)`（依`studentStatus`判斷），取代`computeBaseLivingCost()`、存款下限、學生消費不發生、payload `is_student`這四處的`!occupationCategory`判斷。畢業未就業或收攤的人改用居住狀態分級計算開銷，不再是0，也不會被當成學生
- 12.6：升遷擲骰失敗時`promotionDeclineStreak`+1（原本從來沒有累加，被動轉職永遠不會觸發）；玩家主動拒絕不計入
- 12.6：跨類別/海外轉職的`jobLevel`從直接歸零改為降一級（不低於新人）
- 12.5：`computeAutonomyRaw()`把升遷合併算成一項可跳過事件：遇過升遷候選就算進分母，拒絕過至少一次就算chosen
- 9.5.2：拒絕雙主修後記`dualMajorOfferDeclined`，不再重複跳彈窗
- 9.5.3：休學彈窗選「撐下去」後冷卻`WITHDRAWAL_STREAK_TRIGGER`回合（`withdrawalOfferCooldown`），不動`lowHealthStreak`
- 12.10：新增`RETIREMENT_DELAY_MAX_AGE=70`；70歲以後送出delay會改成準時退休，彈窗預設值改為準時退休。順便修正反灰按鈕的style屬性重複、排版失效
- 12.7/12.8.2/12.13：`rollAnnualCareerChecks()`把裁員前兆(`layoff_foreshadow`)、裁員(`layoff`)、創業年度結果(`business_annual`+outcome)寫進`careerEventLog`隨本回合送給AI；同回合已有彈窗事件時放在`annual`欄位，不覆蓋
- 7.4.1：有子女就顯示傳承選項，不再看AI的`succession_available`
- 1.1.3：子女教養彈窗的自訂輸入拿掉`maxlength`，加上即時字數，超過字數時擋下送出並提示
- 5.2.2：父母好感度起點不再額外加±8，確保落在教養風格區間內
- 4.1.1：結婚當回合、離婚後承接的那一回合加上第1層關係提示（離婚先暫存在`pendingRelationshipHints`）
- 2.2.2：出社會後的`currentLabel`比照學生期，非跳過回合用`fromLabel`，每年最後一回合不再提前顯示新年齡
- `worker/prompt.js`：achievement_probability_modifier_pp改成「系統已套用，AI不能自行決定升遷/創業結果」（12.13，原本和第99行矛盾）；career_event_now補上三種年度事件的說明；succession_available改成只照實填、不影響判斷。**要重新部署Worker才會生效**
- 13.2（使用者指示先用測試參數）：新增`settleHealthyYear()`，掛在`rollAnnualHealthChecks()`開頭。出社會後每回合累計「健康經營回合」（AI回報的健康增量>0，跟13.3.3慢性病控制良好用同一個訊號），一年內佔比≥`HEALTH_CAP_BONUS_YEAR_RATIO`(0.25，【測試參數】)才算健康經營年，連續`HEALTH_CAP_BONUS_STREAK_TRIGGER`(8)年就永久取得cap+5。用比例而不是固定次數，是因為各年齡帶每年的回合數不同（32→5）
- 8.7/8.9/12.4/12.8.2：套用網頁版的設計patch（`2026-09-27-8.9-interest-career.patch`，用`git apply`，改`00-總覽.md`、`08-興趣系統.md`、`12-職涯系統.md`）。代碼新增`INTEREST_OCCUPATION_MATCH`（7×8對應表）、`computeInterestHireBonusPp()`（投入度÷10捨去，上限+10，只算active卡、同一類取最高），接進`computeHireProbability()`；`rollAnnualBusinessCheck()`的興趣修正改成只看對應自營/家庭事業類的active卡（手作工藝、商業交易）。移除從來沒被呼叫的`computeInterestCareerWeightBonus()`

**〔測試部〕**
- 新增`tests/test-7-gapfix-0927.mjs`（已納入run-all）：45/45通過，涵蓋上面16條（直接呼叫函式＋jsdom彈窗點擊＋假上游跑回合）
- 全套回歸：語法檢查＋批次1/2/3/4/6＋十六＋本批全部通過（含批次4的mock連續300回合長程）
- 需要真實API才能驗證、**未測試**：AI收到`layoff_foreshadow`/`business_annual`後的敘事是否得當；改過的prompt在升遷/創業時是否還會自行宣布成敗
- 不影響舊存檔：新增欄位都有預設值（`dualMajorOfferDeclined`、`withdrawalOfferCooldown`、`pendingRelationshipHints`、`healthyYearStreak`等）

---

## 2026-09-26（套用雲端批次patch；十六、playStyle隱性計數；十、10.6放置代活寫入設計文件）

**〔整理〕**
- 把雲端完成的`lifegame-2026-09-25-batch.patch`（批次0～7＋收尾，8個commit）用`git am`套進本機；本機重跑`tests/run-all.mjs`：語法檢查、批次1/2/3/4/6全部通過（批次5瀏覽器測試本機沒裝Chromium，**未測試**，雲端已通過10/10）
- `queue.md`：本機新寫的內容合併到patch版本之後，2026-09-26那段第0～7項打勾（雲端已完成）

**〔開發部〕十六、16.2 隱性行為傾向追蹤`playStyle`（建議一，【草案】）**
- 新增`state.playStyle`（每一世一組，新人生與世代傳承都重新建立；舊存檔第一次計數時自動補上；反悔時跟著還原）。六個維度：面對風險、規則與自由度、人際與界線、面對錯誤(重來/轉向/休息)、效率與控制感(跳過次數)、長期關注(持續最久的興趣)
- 掛在既有結構化節點上：職級封頂岔路、升遷、求職投遞、轉系、休學/肄業、創業啟動、連續虧損、關係投入節點、婚姻危機、時間跳過、興趣事件、期末考明牌檢定未過、裁員、收攤。計數規則見`life-sim-design/16-這一生像什麼遊戲.md` 16.2.2/16.2.3
- **只記錄**：不影響任何判定、不送給AI、不顯示給玩家；不分析自由輸入文字
- 16.3～16.5（判定遊戲類型、先猜再揭曉、分享卡）**未實作**：與七、7.1.4.1「死亡結局不輸出任何標籤」定案衝突，等使用者拍板
- 只改`index.html`，沒有動Worker/prompt；不影響舊存檔

**〔測試部〕**
- 新增`tests/test-16-playstyle.mjs`（已納入`run-all.mjs`）：41/41通過。逐一呼叫各節點驗證計數規則（35項）、反悔還原、payload不含playStyle、沒有判定邏輯讀取它、舊存檔自動補上，另外用三種自動玩法（每個彈窗都選第一個選項／最後一個選項／隨機，各2條人生、最多900回合）跑mock長程模擬
- 模擬結果：跳過次數跟著玩法明顯分開（常跳過的玩法約60次、從不跳過的0次）；其他維度一條人生只累積0～3次（風險0～3次、偏離0～1次、面對錯誤0～2次），人際維度0次（mock的AI不會產生戀愛/婚姻，**未測試**）；mock的興趣永遠是同一類，長期關注在mock裡沒有鑑別度。結論：資料很薄，16.3要分六類目前不可行，需要真實遊玩資料（詳見設計文件16.2.4）
- 全套回歸：語法檢查＋批次1/2/3/4/6＋十六全部通過
- 順帶發現：長程模擬第一版在24歲左右報錯，**查明是自動點擊腳本的問題，不是遊戲bug**：腳本在升遷彈窗先點「維持現狀」（彈窗已關閉），又去點同一個彈窗的「爭取升遷」，真人做不到這個操作。改動前的版本用同一個腳本也會出同樣的錯，確認跟這次改動無關；測試裡的點擊腳本已修正

**〔整理〕設計文件**
- 新增`life-sim-design/16-這一生像什麼遊戲.md`（全章【草案】）、`10-存檔與帳號系統.md`新增10.6放置代活機制（【暫定】，不實作），`00-總覽.md`檔案對照表、目錄、全域更新日誌同步

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
