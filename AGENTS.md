# AGENTS.md

JLPT N3 刷題網站。`n3-sprint/dist/` 是發佈物本身：純靜態、無 build、無相依套件，維持這樣。介面與解析用繁體中文（台灣用語），日文用新字體。

## 推上 main 就是上線

`main` 上任何動到 `n3-sprint/dist/**` 的 push 都會立刻發佈到 GitHub Pages。使用者要求時才 commit、push。

## 改完必跑（在 `n3-sprint/` 下，都要通過）

```sh
node tools/manifest.mjs        # 動過題庫或注音檔就要跑；沒變時不會改檔
node tools/validate.mjs
node tools/furigana.mjs check
node tools/smoke.mjs
```

## 題目 id 是使用者進度的鑰匙

id 同時是瀏覽器裡複習紀錄與注音檔的 key，上線後視為永久。

- `Bank.group` 的 id 由列的順序產生（`prefix-01`、`prefix-02`…）：新題一律**加在陣列最後**，或另開新的 prefix／新檔案。
- 要汰換某題就原地改寫內容，保留它的位置。
- 進度存在 `localStorage` 的 `study-sprint.v2.jlpt-n3`；改動儲存結構時在 `dist/store.js` 寫遷移。

## 注音檔是題庫的鏡像

`dist/ruby/<檔名>.js` 逐字複製 `dist/data/<檔名>.js` 的文字，只多了 `{漢字|かな}` 標記。鏡像與原文差一個字，App 就整段退回純文字顯示（不報錯），所以：

- 改了題庫的任何日文或解析，同一次修改就更新對應的鏡像條目。
- 新增題庫檔後執行 `node tools/furigana.mjs template data/<檔名>.js` 產生待標註的鏡像檔，再跑 `node tools/manifest.mjs`。
- 讀音逐句依上下文判斷後手寫；規則見 `tools/FURIGANA.md`。
- 語音朗讀永遠使用題庫原文。

## 題庫是按需載入的：新增／修改題庫後重產索引

`dist/index.html` 開站只載入 App 與 `dist/manifest.js`（索引：每個題庫檔有哪些題目 id、題型、文章組與筆記，以及對應的注音檔）。`data/*.js`、`knowledge.js`、`reading.js` 與 `ruby/*.js` 由 App 在需要時動態插入 `<script>` 載入，**不要**把它們加回 index.html。

- 新增、刪除題庫檔，或增減、搬移題目與筆記後，執行 `node tools/manifest.mjs` 重產索引（產生檔，要一起提交，不要手改）。
- `validate.mjs` 會比對索引與題庫，不一致就報 ERROR 要你重跑。
- 新檔案放在 `data/` 下即可被工具找到；`knowledge.js`、`reading.js` 是舊格式，在檔尾自行呼叫 `Bank.legacy(...)`。

## 寫題目

動筆前讀 `tools/AUTHORING.md`（格式、各題型題幹寫法、品質要求）。兩條最容易踩的：

- 正解永遠寫在第一個選項，App 出題時洗牌；因此解析一律**引用選項內容**來指稱選項。
- 每題只能有一個正解。新題寫完要**盲測**：另派一個沒看過原始檔的 agent，用 `node tools/quiz.mjs export data/<檔>.js` 匯出、作答、再 `grade`，不吻合的題逐一判定是否有歧義。讀解題加跑 `--no-passage` 匯出的猜題測試，猜對率應接近隨機。

日文欄位寫完跑 `node tools/scan-kyujitai.mjs`，確認沒有混入繁體字形。

## 改 App

- 原生 JS、無框架是刻意的選擇。每個路由回傳一段 HTML 字串，`app.js` 每次都整個重繪 `#app`，事件用委派掛在容器上：狀態一律放在 `store.js` 的進度或各頁的模組變數，重繪後需要的焦點要重新設定。
- 顯示任何題庫文字都經過 `Ruby.html(原文, 標註)`，它回傳已 escape 的 HTML 並處理注音開關。
- 題目與筆記的內文是按需載入的：`App.questions`／`App.byId`／`App.notes` 只是索引（id、題型、文章組、所在檔），統計與選題只用它們；要取內文（`App.question(id)`、`App.note(id)` 的題幹、選項、正解、解析、本文、音訊、筆記內容）之前必須先載入。頁面在 `App.needs[頁名](args)` 回傳要顯示的 id，router 會先 `App.load(ids)`（＝`Bank.ensure`，注音開著時一併載入注音檔）再畫，期間顯示「載入中…」、失敗時顯示重試；動作處理裡也要先確認 `App.question(id)` 存在。
- `dist/bank.js` 的 `Bank.*`／`Ruby.*` 是資料檔與 App 之間的契約；改它等於同時改所有資料檔與注音檔的介面。
- 新增一種題型：在 `bank.js` 的 `TYPES` 登記，並在 `ruby/instructions.js` 補上指示句的注音。
- 視覺是極簡、內容優先的工具型介面：米白底＋深灰字、單一藍綠強調色（`style.css` 的 CSS 變數；只有淺色模式）、系統黑體、無插圖與裝飾；作答區最突出。手機寬度（390px）要檢查橫向溢出。
- 要實機驗證時用系統 Chrome 的 headless 模式；測試腳本與假資料放在 repo 外（如 `/tmp`）。
