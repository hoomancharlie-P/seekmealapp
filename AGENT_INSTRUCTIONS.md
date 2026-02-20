# SeekMeal：Web → React Native App 完整遷移指示

> **對象**：在新 Cursor 專案（SeekMealApp）中執行的 Agent。  
> **目標**：將 Web 版（seekmeal-app）的現有功能、設計、邏輯及資料庫，全部轉化成 iOS/Android App 可用的產品。  
> **架構**：React Native（Expo）前端 + **沿用現有 Next.js API**（不重寫後端）+ **同一 Supabase**（同一 DB、同一 Auth）。

---

## 一、專案與來源

| 項目 | 說明 |
|------|------|
| **來源專案** | **seekmeal-app**（Next.js 14）。路徑：與本專案同層的 `../seekmeal-app`，或你已知的 Web 專案根目錄。 |
| **本專案** | **SeekMealApp**（Expo / React Native），iOS + Android。 |
| **後端** | 不重寫。所有 `app/api/*` 保留在 seekmeal-app，部署為獨立服務（如 Vercel）。App 用 `fetch(EXPO_PUBLIC_API_URL + '/api/...')` 呼叫。 |
| **資料庫** | 同一 Supabase 專案、同一 Tables、同一 RLS。App 用 `@supabase/supabase-js` 直接連 Supabase（Auth、CRUD）。 |

---

## 二、產品功能清單（須全部對應到 App）

### 2.1 登入 / 註冊

- 登入、註冊、登出；未登入時導向登入或 Onboarding。
- **Web 對應**：`app/auth/page.tsx`、`components/AuthGuard.tsx`、`app/hooks/useAuth.ts`。

### 2.2 Onboarding

- 首次使用流程（若 Web 有）。
- **Web 對應**：`app/onboarding/page.tsx`。

### 2.3 主頁（Home）

- 今日 / 明天 / 後天 三個日期 Tab 或區塊。
- 每個日期：餐單列表（早餐、午餐、晚餐、小食）、Cat 角色、當日進度環（卡路里等）。
- 功能：讀取餐單、生成餐單、記錄已食、更換單餐、特殊活動彈窗、手動輸入食物、智能推薦彈窗。
- **Web 對應**：`app/page.tsx`、`components/MealCard.tsx`、`components/Cat.tsx`、`components/ProgressRing.tsx`、`lib/cat/expressions.ts`、`lib/cat/stateCalculator.ts`。

### 2.4 進度（Progress）

- 連續達標天數（🔥 連續 X 天，僅 streak ≥ 1 顯示）。
- 本週卡路里進度圖（柱狀圖、目標虛線、達標/接近/偏離色）。
- 體重記錄與體重預測圖。
- 歷史記錄 Tab（按日期查餐單與統計）。
- **Web 對應**：`app/progress/page.tsx`、`components/WeeklyProgressChart.tsx`、`components/WeightPredictionChart.tsx`、`app/hooks/useStreak.ts`。

### 2.5 AI 教練（Coach）

- 對話式 AI 聊天。
- **Web 對應**：`app/coach/page.tsx`、`app/api/coach/chat/route.ts`（後端保留）。

### 2.6 設定（Settings）

- 個人資料（用戶名等）、營養目標（卡路里、蛋白質等）、飲食偏好與過敏。
- 旅遊模式：設定計劃（出發日、天數、目的地）、啟動、結束；顯示當前計劃與狀態。
- **Web 對應**：`app/settings/page.tsx`。

### 2.7 旅遊模式流程（若進入等待/完成等畫面）

- 設定完成後啟動、等待生成、未來行程、完成等狀態或畫面。
- **Web 對應**：`app/travel-waiting/page.tsx`、`app/travel-future/page.tsx`、`app/travel-completed/page.tsx`、`app/travel-generating/page.tsx`（邏輯可併入主頁或設定，不必獨立多頁）。

### 2.8 底部導航

- 四個 Tab：**主頁**、**進度**、**AI 教練**、**設定**。無獨立「歷史」Tab，歷史在進度頁內。
- **Web 對應**：`components/BottomNav.tsx` → 用 `@react-navigation/bottom-tabs` 實作。

---

## 三、資料庫與 Supabase

- **不改 Schema**：使用與 Web 相同的 Supabase 專案與 Tables。
- **Tables**：`profiles`、`meals`、`foods`、`travel_plans`、`weight_logs`。
- **Auth**：Supabase Auth（Email/Password 或 OAuth）。RN 使用 `@supabase/supabase-js` 的 `signInWithPassword`、`signUp`、`signOut` 等。
- **RLS**：沿用現有 RLS；App 使用同一 `anon` key 與登入後的 session。
- **參考**：Web 的 `lib/supabase.ts`、`lib/supabase/client.ts`、`.env.example`（變量對應見下方「環境變量」）。

---

## 四、後端 API（Next.js，保留不重寫）

所有請求需帶 **Authorization: Bearer \<supabase_access_token\>**，與 Web 一致。  
Base URL 使用環境變量 **EXPO_PUBLIC_API_URL**（例如 `https://your-app.vercel.app` 或 `http://localhost:3000`）。

| 方法 | 路徑 | 用途 |
|------|------|------|
| GET | `/api/meals` | 取得餐單（查參數或 body：日期範圍等，依 Web 實作） |
| POST | `/api/generate-meals` | 生成餐單（Gemini） |
| POST | `/api/regenerate-meal` | 單餐重新生成 |
| GET | `/api/travel-mode` | 查詢當前旅遊模式 |
| POST | `/api/travel-mode` | 啟動旅遊模式 |
| PUT | `/api/travel-mode` | 更新旅遊模式 |
| DELETE | `/api/travel-mode` | 結束旅遊模式 |
| POST | `/api/travel-mode/generate-day` | 單日旅遊餐單生成 |
| POST | `/api/coach/chat` | AI 教練對話 |
| POST | `/api/analyze-food-text` | 文字分析食物（記錄實際 － 文字描述） |
| POST | `/api/analyze-food-image` | 圖片分析食物（記錄實際 － 拍照／上傳照片） |
| POST | `/api/smart-meal-recommendation` | 智能餐單推薦（生成新一餐） |
| POST | `/api/meals/[mealId]/log-actual` | 記錄實際：寫入該餐實際卡路里／營養或食物列表，並標記已食用 |
| PUT | `/api/meals/[mealId]/foods` | 修改單項食物：以新列表替換該餐所有食物，後端重算總營養 |

實作時請對照 **seekmeal-app/app/api/** 下各 `route.ts` 的請求體與回應格式。  
**JSON Request/Response 詳見**：`docs/API_SPEC.md`。

### 4.1 記錄實際流程（主頁 － 三種方式）

主頁「呢一餐」→「記錄實際」後，有三種輸入方式：

| 方式 | 說明 | 使用 API |
|------|------|----------|
| **直接輸入** | 使用者手動輸入食物名稱、卡路里、P/C/F/纖維 | 直接呼叫 **POST /api/meals/[mealId]/log-actual**（body：`calories` 或 `foods`） |
| **文字描述** | 使用者輸入一句描述（如「半碗白飯、一碟菜心」） | 先 **POST /api/analyze-food-text** 取得 `foods`，顯示確認後再 **POST /api/meals/[mealId]/log-actual**（body：`foods`） |
| **拍照／上傳照片** | 使用者選圖或拍照，AI 識別食物與營養 | 先 **POST /api/analyze-food-image**（body：`image` base64 + `mimeType`）取得 `foods`，顯示確認後再 **POST /api/meals/[mealId]/log-actual**（body：`foods`） |

App 端：`lib/meals.ts` 提供 `analyzeFoodText(text)`、`analyzeFoodImage(imageBase64, mimeType)`、`logMealActual(mealId, payload)`。寫入 DB 時，營養欄位（calories, protein, carbs, fat, fiber）須為**整數**（前端/後端需 toInt 或 Math.round，避免 DB 型別錯誤）。

### 4.2 已做優化與 API/函數需求（文件補遺）

以下為目前已實作的優化與約定，文件中未盡之處一併補齊，供維護與擴充時對照。

- **智能餐單推薦（smart-meal-recommendation）**
  - 偏好從 **body.preferences** 讀取（與頂層 location/cuisine 等合併）；支援 `location`、`cuisine`、`mood`、`mainType`、`customInput`。
  - 接受 **1 個選項**：若 AI 只回 1 個選項，後端會自動生成第二個「豐富版」選項（卡路里 × secondOptionCalorieMultiplier）。
  - **validateAndCorrectMeal**：以 foods 為準自動校正總營養素，營養素/卡路里小誤差不再拋錯；驗證放寬（僅對「無食物」或明顯不符」報錯）。

- **生成餐單（generate-meals）**
  - **forceReplace**：可傳 `true`，先刪除日期範圍內既有餐單再寫入，避免「已有餐單」導致不寫入。
  - **startDate**：可傳客戶端「今天」的 YYYY-MM-DD，用於計算日期範圍，避免時區導致「後天」空白。

- **單餐重新生成（regenerate-meal）**
  - 替換餐單時會更新該餐的 **updated_at**，前端可用於顯示「已更新」或排序。

- **營養欄位與 DB**
  - 所有寫入 **foods** 或餐單營養的欄位（calories, protein, carbs, fat, fiber）須為**整數**。前端在照片分析、文字分析、手動輸入、修改食物等流程中，組 payload 前應做 **toInt()**／**Math.round()**，避免 DB 錯誤（如 `invalid input syntax for type integer: "0.5"`）。

- **主頁選單與 UI**
  - 主頁所有選單已改為 **BottomSheet**（從底部滑出）：呢一餐、記錄實際、修改單項食物、特殊活動、生成新一餐、選擇餐單（MealOptionsModal）。載入中「生成餐單」仍使用全螢幕 Modal。

- **記錄實際**
  - 三種方式（直接輸入、文字描述、拍照／上傳照片）中，**文字描述**與**拍照**皆透過 AI（analyze-food-text / analyze-food-image）取得 `foods`，使用者確認後再呼叫 log-actual；直接輸入則由使用者填寫後直接送 log-actual。

---

## 五、檔案對應表（Web → App）

### 5.1 共用邏輯與類型（複製並改寫）

| Web（seekmeal-app） | App（SeekMealApp） | 備註 |
|---------------------|--------------------|------|
| `lib/supabase.ts` 或 `lib/supabase/client.ts` | `lib/supabase.ts` | 使用 `createClient` from `@supabase/supabase-js`，URL/Key 從 `process.env.EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` 讀取。**不要**使用 `@supabase/ssr`。 |
| `lib/meals.ts` | `lib/meals.ts` | 其中 `fetch` 的 base URL 改為 `process.env.EXPO_PUBLIC_API_URL`（例如 `createInitialMeals` 內 `/api/generate-meals` → `API_BASE + '/api/generate-meals'`）。其餘 Supabase 呼叫改用 App 的 `lib/supabase.ts`。 |
| `lib/adjustMealPlan.ts` | `lib/adjustMealPlan.ts` | 純邏輯，複製；若有 DOM/Node 依賴則移除。 |
| `lib/ai-json.ts` | `lib/ai-json.ts` | 純邏輯，複製。 |
| `lib/cat/expressions.ts` | `lib/cat/expressions.ts` | 複製。 |
| `lib/cat/stateCalculator.ts` | `lib/cat/stateCalculator.ts` | 複製。 |
| `types/database.ts`、`types/meal.ts`、`types/cat.ts` | `types/` 下同名 | 直接複製。 |
| `app/hooks/useAuth.ts` | `hooks/useAuth.ts` | Supabase 改用 App 的 client；介面（user、loading、signOut 等）盡量一致。 |
| `app/hooks/useStreak.ts` | `hooks/useStreak.ts` | 同上，Supabase 改用 App 的 client。 |

**不要複製**：`lib/supabase/server.ts`、`lib/supabase-server.ts`（伺服器專用）。  
**不要複製**：`app/api/*`（API 保留在 Web 後端，App 僅用 fetch 呼叫）。

### 5.2 頁面 → 畫面（Screen）

| Web | App |
|-----|-----|
| `app/page.tsx` | 主頁：`app/(tabs)/index.tsx` 或 `screens/HomeScreen.tsx` |
| `app/auth/page.tsx` | `screens/AuthScreen.tsx` |
| `app/settings/page.tsx` | `screens/SettingsScreen.tsx` |
| `app/progress/page.tsx` | `screens/ProgressScreen.tsx`（含歷史 Tab） |
| `app/coach/page.tsx` | `screens/CoachScreen.tsx` |
| `app/onboarding/page.tsx` | `screens/OnboardingScreen.tsx` |
| 旅遊相關頁（travel-*） | 可併入主頁/設定或獨立少量畫面，依流程改寫 |

### 5.3 元件（Component）

| Web | App |
|-----|-----|
| `components/MealCard.tsx` | `components/MealCard.tsx` | 改為 RN：View、Text、Pressable、StyleSheet；邏輯（記錄、更換、特殊活動、手動記錄）保留。 |
| `components/BottomNav.tsx` | 使用 `@react-navigation/bottom-tabs` 取代自製 BottomNav。 |
| `components/Cat.tsx` | `components/Cat.tsx` | 表情與狀態邏輯沿用；動畫改為 `react-native-reanimated` 或 Lottie。 |
| `components/ProgressRing.tsx`、`GlowingProgressBar.tsx` | 用 RN 的 SVG 或現成圓環/進度條元件重做，視覺與 Web 接近。 |
| `components/WeeklyProgressChart.tsx` | 用 `react-native-chart-kit` 或 `victory-native` 重做本週卡路里柱狀圖與目標虛線。 |
| `components/WeightPredictionChart.tsx` | 同上，體重曲線/預測。 |
| `components/EditMealModal.tsx`、`SpecialEventModal.tsx`、`AdjustmentPreviewModal.tsx` 等 | RN `Modal` + 相同業務邏輯。 |
| `components/AuthGuard.tsx` | 改寫為 RN 版：根據 useAuth 決定顯示登入畫面或主內容。 |
| `components/MealCardSkeleton.tsx` | 用 View + 簡單樣式或 RN 的 Skeleton 元件。 |
| Toast（react-hot-toast） | `react-native-toast-message` 或 Expo 的 toast；成功/錯誤/一般行為與 Web 一致。 |

---

## 六、設計與 UI 規範（須保留）

以下色碼與語意來自 Web 的 `tailwind.config.ts`，App 請用 StyleSheet 或 NativeWind 對應。

### 6.1 色彩

- **Primary（主色）**：抹茶綠 — `#C5E1A5`（200）、`#8BC34A`（500）、`#7CB342`（600）、`#689F38`（700）。用於按鈕、進度、重點。
- **Background**：主頁漸層可為綠→白→灰（`#C5E1A5` → `#E8F5E9` → `#FFFFFF` → `#F5F5F5`）；卡片背景 `#FFFFFF`；整體背景 `#F5F5F0`。
- **Text**：主要 `#2C2C2E`，次要 `#757575`。
- **Success**：`#4CAF50`；**Warning**：`#FACC15` / `#F59E0B`；**Error**：紅色系（如 `#EF4444`）。
- **Accent**：`#8B7FD9`（點綴、小 badge）。

### 6.2 圓角與間距

- 卡片圓角：約 16–24px（對應 Web rounded-2xl）。
- 按鈕圓角：約 12px（rounded-xl）。
- 內邊距：卡片 padding 約 16–24px；區塊間距 16–24px。

### 6.3 Cat 角色

- 表情與狀態對應：見 `lib/cat/expressions.ts`（neutral、happy、satisfied、excited、sleepy、curious、indifferent、turned_away 等）。
- 狀態計算邏輯：見 `lib/cat/stateCalculator.ts`（依進度、時段、達標天數等）。
- 動畫意圖：breathe、bounce、nod、stretch、yawn、turn 等；用 Reanimated 或 Lottie 在 RN 中重現，不需與 Web 動畫實作一致，但語意一致。

### 6.4 字體

- Web 使用 Arial/Helvetica；App 可使用系統預設或指定字體，標題與內文層級與 Web 對齊（標題粗、內文常規、輔助字較小）。

---

## 七、依賴與環境

### 7.1 App 端必須安裝

- `expo`、`expo-status-bar`
- `@supabase/supabase-js`
- `@react-navigation/native`、`@react-navigation/native-stack`、`@react-navigation/bottom-tabs`
- `react-native-screens`、`react-native-safe-area-context`、`react-native-gesture-handler`
- `react-native-reanimated`（Cat 與動畫）
- 圖表：`react-native-chart-kit` 或 `victory-native`
- Toast：`react-native-toast-message` 或 Expo 內建
- 環境變量：`react-native-dotenv` 或 Expo 內建 `EXPO_PUBLIC_*`

### 7.2 Web 專用、不在 App 安裝

- `next`、`react-dom`、`@supabase/ssr`、`eslint-config-next`
- `recharts`、`framer-motion`、`react-hot-toast`、`canvas-confetti`
- `tailwindcss`、`postcss`、`autoprefixer`（若不用 NativeWind）

### 7.3 環境變量（.env）

在 App 專案根目錄建立 `.env`（勿提交），與 Web `.env.local` 對應：

- `EXPO_PUBLIC_SUPABASE_URL` ← Web 的 `NEXT_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` ← Web 的 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_URL` ← Next 後端網址（如 `https://xxx.vercel.app` 或 `http://192.168.x.x:3000` 供本機測試）

App 內透過 `process.env.EXPO_PUBLIC_*` 讀取。

---

## 八、執行順序（Phase）

請依下列順序實作，完成一 Phase 再進行下一 Phase。

**當前進度**（依 `docs/WHAT_TO_RECORD.md` 與主頁完成狀態）：
- **Phase 1–5：已完成**（專案與環境、共用程式碼、導航與 Auth、主頁骨架、主頁互動）。
- **Phase 6–9：待實作**（設定頁、進度頁、其餘功能、測試與收尾）。

---

### 已完成（Phase 1–5）

1. **Phase 1：專案與環境** ✅
   - 確認本專案為 Expo（或 React Native CLI）專案；已安裝上述依賴。
   - 建立 `.env` 與 `lib/supabase.ts`（使用 `EXPO_PUBLIC_*`），並可成功連線 Supabase（例如登入測試）。

2. **Phase 2：共用程式碼** ✅
   - 複製並改寫 `lib/meals.ts`、`lib/adjustMealPlan.ts`、`lib/ai-json.ts`、`lib/cat/*`；複製 `types/*`；改寫 `hooks/useAuth.ts`、`hooks/useStreak.ts`。
   - 確保所有 `fetch` 使用 `EXPO_PUBLIC_API_URL`，所有 Supabase 使用 App 的 `lib/supabase.ts`。

3. **Phase 3：導航與 Auth** ✅
   - 實作導航結構：未登入 → AuthScreen（或 OnboardingScreen）；已登入 → Bottom Tabs（主頁、進度、AI 教練、設定）。
   - 實作 AuthScreen（登入/註冊）、AuthGuard 邏輯（依 useAuth 決定顯示哪一層）。

4. **Phase 4：主頁骨架** ✅
   - 主頁：三個日期（今日/明/後天）的餐單列表、Cat、進度環。
   - 讀取餐單（fetchMeals 或 GET /api/meals）、顯示 MealCard 列表；接「生成餐單」API（POST /api/generate-meals），並在成功後刷新列表。

5. **Phase 5：主頁互動** ✅
   - MealCard：記錄已食、更換單餐、特殊活動、手動記錄（記錄實際）、智能推薦（生成新一餐）；邏輯與 Web 一致。
   - 主頁所有選單已改為 **BottomSheet**（從底部滑出）：呢一餐、記錄實際、修改單項食物、特殊活動、生成新一餐、選擇餐單（MealOptionsModal）。
   - 載入狀態（Skeleton）、錯誤與成功 Toast。

---

### 待實作（Phase 6–9）

6. **Phase 6：設定頁**
   - 個人資料、營養目標、飲食偏好與過敏的讀寫（Supabase profiles）。
   - 旅遊模式：設定計劃、啟動、結束；呼叫 GET/POST/PUT/DELETE /api/travel-mode；顯示當前計劃與狀態。

7. **Phase 7：進度頁**
   - 連續達標天數（useStreak，僅 streak ≥ 1 顯示「🔥 連續 X 天」）。
   - 本週卡路里圖（柱狀圖、目標虛線、達標/接近/偏離色）。
   - 體重記錄與體重預測圖。
   - 歷史記錄 Tab（按日期查餐單與統計）。

8. **Phase 8：其餘功能**
   - AI 教練畫面與 POST /api/coach/chat。
   - Onboarding 流程（若需要）。
   - 旅遊流程（等待/完成等）可併入主頁或設定，不強制獨立多頁。

9. **Phase 9：測試與收尾**
   - 依下方「驗收清單」逐項驗證；修正錯誤與 UI；確保所有後端請求帶 `Authorization: Bearer <token>` 且使用 `EXPO_PUBLIC_API_URL`。

---

## 九、驗收清單（Acceptance）

完成遷移後須滿足：

- [ ] 登入、註冊、登出正常；未登入時顯示登入或 Onboarding，已登入顯示 Tab。
- [ ] 主頁可顯示今日/明/後天餐單，Cat 與進度環顯示正確。
- [ ] 可成功呼叫「生成餐單」並顯示新餐單。
- [ ] 記錄已食、更換單餐、特殊活動、手動記錄、智能推薦與 Web 行為一致（含 Toast 與錯誤處理）。
- [ ] 設定頁可讀寫個人資料與營養目標；旅遊模式可設定、啟動、結束，並顯示當前狀態。
- [ ] 進度頁：連續達標（僅 ≥1 顯示）、本週圖表、體重記錄與預測、歷史 Tab 正常。
- [ ] AI 教練可發送與接收訊息。
- [ ] 所有呼叫後端的請求均帶 `Authorization: Bearer <supabase_access_token>`，且使用 `EXPO_PUBLIC_API_URL`。

---

## 十、其他注意事項

- **錯誤處理**：與 Web 一致，網路錯誤、API 錯誤等以 Toast 或內聯提示使用者。
- **載入狀態**：按鈕 loading、列表 Skeleton，與 Web 體驗對齊。
- **參考來源**：實作時請直接對照 **seekmeal-app** 對應檔案（路徑見本文件），以保持邏輯與行為一致。
- 若本專案內有 `NATIVE_APP_MIGRATION_PLAN.md` 或 `AGENT_INSTRUCTIONS_OUTLINE.md`，可一併 @ 引用以補充脈絡。
- 記錄與文件維護可參考 **`docs/WHAT_TO_RECORD.md`**（API 規格、資料模型、狀態流程、詞彙表、測試清單等補充項目）。
- **繼續發展 Mobile App 時**，請一併對照 **`docs/MOBILE_APP_CHECKLIST.md`**：專案與 App 目錄、環境與 Auth、主頁 state、Phase 6–9 實作對照、易漏項目（型別對齊、圖片上傳、錯誤約定等）。

---

**結語**：本文件為 Web → React Native App 的完整遷移指示。請依 Phase 1–9 順序執行，並以第九節驗收清單作為完成標準。後端與資料庫不變，僅前端改為 RN 並透過環境變量與 API 與現有服務對接。
