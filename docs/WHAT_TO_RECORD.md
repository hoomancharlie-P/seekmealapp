# 專案記錄清單：除了功能與架構，還需要記錄什麼？

> 本文作為「產品功能、功能架構、前後端改動、函數格式要求、介面設計編號及邏輯」之外的**補充記錄指引**，方便日後維護、交接與 Agent 協作。

---

## 你已經在記錄的（對照）

| 類別 | 現有文件／位置 | 說明 |
|------|----------------|------|
| 產品功能 | AGENT_INSTRUCTIONS §二 | 登入、主頁、進度、教練、設定、旅遊等 |
| 功能架構 | AGENT_INSTRUCTIONS §一、四、五 | 專案關係、API 列表、Web↔App 檔案對應 |
| 前端／後端改動 | AGENT_INSTRUCTIONS §五、各 Phase | 元件對應、API 保留在 Next、改寫要點 |
| 介面設計與邏輯 | AGENT_INSTRUCTIONS §六、設計規範 | 色彩、圓角、Cat、字體；可再補「畫面編號／流程」 |
| 函數格式要求 | 若分散在程式註解或個別 doc | 建議集中成「命名與格式」一節或單一文件 |

---

## 建議額外記錄的項目

### 1. API 規格與合約（Request / Response）✅ 已建立

- **目的**：前後端與未來 Agent 對「呼叫方式、欄位、錯誤」有單一依據。
- **已實作**：**`docs/API_SPEC.md`** 已建立，包含：
  - 各端點 Request body 與 Response JSON 格式（meals、generate-meals、smart-meal-recommendation、regenerate-meal、analyze-food-text、analyze-food-image、log-actual、meals/[mealId]/foods）。
  - 錯誤回應格式、記錄實際三種方式（直接輸入、文字描述、**拍照／AI 照片分析**）與對應 API。
- **AGENT_INSTRUCTIONS §4** 已補：API 表加入 `log-actual`、`foods`；§4.1 記錄實際流程（含 AI 照片分析）；§4.2 已做優化與函數需求。
- **後續**：新增或修改 API 時請同步更新 `docs/API_SPEC.md`。

---

### 2. 資料模型與欄位說明

- **目的**：DB 與前端型別一致，減少「欄位漏寫、型別錯誤」。
- **建議內容**：
  - 關鍵 Table：`profiles`、`meals`、`foods` 等欄位清單與型別（含 `created_at`、`updated_at` 等）。
  - 前端型別與後端／DB 對應：例如 `MealWithFoods`、`Profile`、`ProfileWithDefaults` 的差異與使用情境。
  - 數字欄位約定：例如卡路里／蛋白質等「一律存整數」、前端 `toInt()`／`toNumber()` 的使用處。
- **可放位置**：`docs/DATA_MODEL.md` 或擴充 AGENT_INSTRUCTIONS §三。

---

### 3. 狀態與使用者流程（State & User Flows）

- **目的**：除錯、改版時快速理解「某狀態從哪來、會觸發什麼畫面」。
- **建議內容**：
  - **主頁關鍵 state**：例如 `mealOptionsMealId`、`mealForReplace`、`mealForLogActual`、`mealForEditFoods`、`showSpecialEventModal`、`logActualStep` 的用途與誰負責清空。
  - **流程圖或步驟**：例如「呢一餐 → 記錄實際 → 選擇方式（直接／文字／拍照）→ 提交 → 關閉」；「生成新一餐 → 選項 → MealOptionsModal（標準／豐富）→ 寫入」。
  - **何時呼叫 API、何時只改本地 state**（例如取消不改動、選項才寫入）。
- **可放位置**：`docs/HOME_FLOWS.md` 或 AGENT_INSTRUCTIONS 主頁相關小節。

---

### 4. 錯誤處理與邊界情況

- **目的**：統一「網路失敗、驗證失敗、API 回傳異常」的處理方式，避免漏接。
- **建議內容**：
  - 網路錯誤：是否重試、Toast 文案、按鈕是否可再按。
  - 驗證錯誤：例如營養數字 `"0.5"` 導致 DB 錯誤 → 前端一律 `toInt()`／後端接受範圍。
  - 已知限制：例如「僅支援 1 或 2 個選項」「日期格式為 YYYY-MM-DD」。
  - 特殊邏輯：例如「今日其他餐已記錄時，特殊活動的提示文案」。
- **可放位置**：`docs/ERROR_HANDLING.md` 或 AGENT_INSTRUCTIONS §十擴充。

---

### 5. 環境、建置與部署

- **目的**：新人或新機從零到跑起來、部署到預發／正式，有明確步驟。
- **建議內容**：
  - **環境變數清單**：Web（`NEXT_PUBLIC_*`）與 App（`EXPO_PUBLIC_*`）對照；哪些必填、哪些可選。
  - **本地開發**：`npm run dev` / `npx expo start`、`--reset-cache` 使用時機、本機 API URL（如 localhost:3000）。
  - **部署**：Vercel 後端、Expo 建置指令、環境區分（dev / staging / prod）。
- **可放位置**：擴充 `SETUP.md`、`RESTART_GUIDE.md`，或單一 `docs/DEPLOYMENT.md`。

---

### 6. 命名與程式慣例（含函數格式）

- **目的**：函數格式、命名風格一致，方便搜尋與重構。
- **建議內容**：
  - **函數命名**：例如事件處理 `handle*`、API 呼叫 `fetch*` / `create*` / `update*`；回傳 Promise 的 async 函數命名。
  - **檔案與元件**：`PascalCase` 元件、`camelCase` 工具、API 路徑 `/api/kebab-case`。
  - **日期與 ID**：日期字串格式（如 `toDateStr` 輸出）、ID 用 string 還是 number。
  - **多語／文案**：若未來要 i18n，可預留「所有使用者可見字串集中管理」的約定。
- **可放位置**：AGENT_INSTRUCTIONS 新增「命名與格式」一節，或 `docs/CONVENTIONS.md`。

---

### 7. 介面設計編號與畫面對應（可細化）

- **目的**：設計稿或 PRD 有編號時，能對應到實際畫面和元件。
- **建議內容**：
  - **畫面編號**：例如「主頁 = 1、呢一餐選單 = 1.1、記錄實際 = 1.2、特殊活動 = 1.3」。
  - **元件階層**：主頁 → BottomSheet 清單（呢一餐、記錄實際、修改食物、特殊活動、生成新一餐、選擇餐單）。
  - **狀態對應 UI**：例如 `logActualStep === 'choose'` → 顯示三顆按鈕；`logActualStep === 'direct'` → 顯示表單。
- **可放位置**：AGENT_INSTRUCTIONS §六下新增「畫面編號與流程」，或 `docs/UI_SCREENS.md`。

---

### 8. 依賴與版本（可選）

- **目的**：重現建置、升級時知道關鍵依賴與相容性。
- **建議內容**：
  - 主要套件與版本：Next、Expo、React、Supabase、React Navigation 等（可從 `package.json` 擷取）。
  - 重要決策：例如「BottomSheet 自幹不用 @gorilla/bottom-sheet 的原因」「Toast 用哪一庫」。
- **可放位置**：README 或 AGENT_INSTRUCTIONS §七擴充。

---

### 9. 除錯與日誌

- **目的**：快速找到 log、避免被無關錯誤洗版。
- **建議內容**：
  - App：建議用 **Metro 終端** 看 `console.log`，避免 Chrome 除錯的「Unsupported method」雜訊；必要時用篩選「🔍」或關鍵字。
  - 常見錯誤與解法：例如 `window is not defined`（AsyncStorage/SSR）、`@react-native-community/cli` 警告（已加 devDependency）。
- **可放位置**：SeekMealApp 已有 `docs/VIEW_LOGS.md`；可在 seekmeal-app 的 docs 加一筆「除錯方式」索引。

---

### 10. 詞彙表（Glossary）

- **目的**：專案內術語一致，前後端、文件、Agent 理解相同。
- **建議內容**：
  - **呢一餐**：主編輯選單（取消特殊活動、特殊活動、生成新一餐、記錄實際、修改單項食物）。
  - **記錄實際**：使用者實際吃了什麼的記錄流程（直接輸入／文字描述／拍照）。
  - **特殊活動**：火鍋、燒烤、自助餐等，可調整其他餐或僅本餐建議。
  - **豐富版／標準版**：生成新一餐後二選一的餐單選項。
  - **replace / 更換單餐**：同一餐次用新生成的選項取代。
- **可放位置**：AGENT_INSTRUCTIONS 開頭或 `docs/GLOSSARY.md`。

---

### 11. 變更歷程（Changelog / 決策記錄）

- **目的**：日後查「為什麼當時這樣改」、發版時列出改動。
- **建議內容**：
  - 依版本或日期：例如「主頁所有選單改為 BottomSheet」「營養欄位 toInt 避免 0.5 錯誤」「generate-meals 支援 forceReplace、startDate」。
  - 可簡短註明「問題 → 解法」。
- **可放位置**：`CHANGELOG.md` 或 `docs/CHANGES.md`。

---

### 12. 測試與驗證清單（可執行）

- **目的**：每次改動後可快速跑一輪，確保主流程沒壞。
- **建議內容**：
  - 主頁：呢一餐、記錄實際、修改食物、特殊活動、生成新一餐、選擇餐單（標準／豐富）、從底部滑出與關閉。
  - 登入、設定、進度、教練等關鍵路徑。
  - 可勾選的 checklist（與 AGENT_INSTRUCTIONS §九驗收清單呼應）。
- **可放位置**：`docs/TEST_CHECKLIST.md` 或擴充 AGENT_INSTRUCTIONS §九。

---

## 建議的檔案索引（對照用）

若把「要記錄的內容」拆成多個文件，可維護一份索引，方便找到對應文件：

| 主題 | 建議文件名 | 說明 |
|------|------------|------|
| 遷移與架構總覽 | AGENT_INSTRUCTIONS.md | 產品功能、API、檔案對應、Phase、驗收 |
| **Mobile 後續發展檢查清單** | **docs/MOBILE_APP_CHECKLIST.md** | **專案目錄、App 路由、環境/Auth、型別、主頁 state、錯誤約定、Phase 6–9 對照、易漏項目** ✅ 已建立 |
| API 規格 | docs/API_SPEC.md | Request/Response、錯誤、認證；記錄實際三種方式（含 AI 照片分析）✅ 已建立 |
| 資料與型別 | docs/DATA_MODEL.md | DB 欄位、前端型別、數字約定 |
| 主頁狀態與流程 | docs/HOME_FLOWS.md | state 說明、使用者流程 |
| 錯誤與邊界 | docs/ERROR_HANDLING.md | 錯誤處理、已知限制 |
| 環境與部署 | SETUP.md / docs/DEPLOYMENT.md | 環境變數、建置、部署 |
| 命名與格式 | docs/CONVENTIONS.md | 函數、檔案、命名慣例 |
| 介面編號與邏輯 | docs/UI_SCREENS.md | 畫面編號、元件對應、狀態→UI |
| 除錯與日誌 | SeekMealApp/docs/VIEW_LOGS.md | 如何看 log、常見錯誤 |
| 詞彙表 | docs/GLOSSARY.md | 呢一餐、記錄實際、特殊活動等 |
| 變更歷程 | CHANGELOG.md 或 docs/CHANGES.md | 版本／日期、改動摘要 |
| 測試清單 | docs/TEST_CHECKLIST.md | 可勾選的測試步驟 |

---

## 小結

除了你已列的**產品功能、功能架構、前後端改動、函數格式、介面設計編號及邏輯**，建議再補：

1. **API 規格與合約**（Request/Response/錯誤）
2. **資料模型與欄位**（DB + 前端型別 + 數字約定）
3. **狀態與使用者流程**（主頁 state、流程步驟）
4. **錯誤處理與邊界情況**（已知限制、特殊邏輯）
5. **環境、建置與部署**（環境變數、本地／部署步驟）
6. **命名與程式慣例**（函數格式、檔案命名）
7. **介面設計編號與畫面對應**（可細化你現有的介面邏輯記錄）
8. **依賴與版本**（可選）
9. **除錯與日誌**（已有 VIEW_LOGS，可在總索引加一筆）
10. **詞彙表**（專案術語定義）
11. **變更歷程**（Changelog／決策記錄）
12. **測試與驗證清單**（可執行的 checklist）

可依優先順序先補 **API 規格、狀態與流程、詞彙表、測試清單**，其餘再逐步補齊。本文可放在 `docs/WHAT_TO_RECORD.md` 作為「要記錄什麼」的總表，並與 `AGENT_INSTRUCTIONS.md` 互相引用。
