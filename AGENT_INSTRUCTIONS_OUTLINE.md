# 給新 Cursor 專案 Agent 的詳細指示 — 大綱

> 目標：將 Web 版（seekmeal-app）的現有功能、設計、邏輯及資料庫，全部轉化成 iOS/Android App 可用的產品。  
> 本檔先列出「指示內應有的資料」，供一起優化後再產出完整指示。

---

## 一、專案與來源說明（Context）

指示內應寫明：

| 項目 | 應含內容 |
|------|----------|
| **來源專案** | seekmeal-app（Next.js 14，已從 seekmeal 複製並重命名）。路徑：與新專案同層或可參考的 `../seekmeal-app`。 |
| **目標** | 建立 React Native（Expo）App，iOS + Android，功能、設計、邏輯、資料庫與 Web 版一致。 |
| **架構** | RN App 前端 + **沿用現有 Next.js API**（不重寫後端）+ **同一 Supabase**（同一 DB、同一 Auth）。 |
| **工作目錄** | 新 Cursor 專案為 **SeekMealApp**（Expo），或先建 Expo 再開該資料夾。 |

---

## 二、產品功能清單（Feature Inventory）

指示內應列出 Web 版「所有功能」，方便 Agent 逐項對應到 App：

| 功能區塊 | 功能點 | Web 對應（路徑/檔案） |
|----------|--------|------------------------|
| **登入 / 註冊** | 登入、註冊、登出、AuthGuard | `app/auth/page.tsx`、`components/AuthGuard.tsx`、`app/hooks/useAuth.ts` |
| **Onboarding** | 首次使用流程 | `app/onboarding/page.tsx` |
| **主頁** | 今日/明/後天餐單、Cat 表情、進度環、記錄/更換餐、特殊活動、手動記錄、智能推薦 | `app/page.tsx`、`components/MealCard.tsx`、`components/Cat.tsx`、`components/ProgressRing.tsx`、`lib/cat/` |
| **進度** | 連續達標天數、本週卡路里圖、體重記錄、體重預測、歷史記錄 Tab | `app/progress/page.tsx`、`components/WeeklyProgressChart.tsx`、`components/WeightPredictionChart.tsx`、`app/hooks/useStreak.ts` |
| **AI 教練** | 對話式 AI | `app/coach/page.tsx` |
| **設定** | 個人資料、營養目標、飲食偏好、旅遊模式設定、啟動/結束旅遊 | `app/settings/page.tsx` |
| **旅遊模式** | 設定計劃、啟動、進行中、未來行程、等待生成、完成 | `app/settings/page.tsx`（設定）、`app/travel-*` 各頁、`app/api/travel-mode/*` |
| **底部導航** | 主頁、進度、AI 教練、設定（無獨立歷史，歷史在進度內） | `components/BottomNav.tsx` |

可再細化：例如「主頁」下列出「讀取餐單、生成餐單、記錄已食、更換單餐、特殊活動彈窗、手動輸入食物、智能推薦彈窗」等。

---

## 三、資料庫與 Supabase（Database）

指示內應寫明：

| 項目 | 應含內容 |
|------|----------|
| **不改 Schema** | App 使用**同一 Supabase 專案、同一 Tables**，不新增/改表。 |
| **Tables 清單** | `profiles`、`meals`、`foods`、`travel_plans`、`weight_logs`（及若有其他）。 |
| **RLS** | 沿用現有 RLS；App 用同一 `anon` key + 用戶登入後的 session。 |
| **Auth** | Supabase Auth（Email/Password 或 OAuth）；RN 用 `@supabase/supabase-js` 的 `signIn/signUp/signOut`。 |
| **參考** | 可參考 Web 的 `lib/supabase.ts`、`lib/supabase/client.ts`、`.env.example` 的變量名稱。 |

---

## 四、後端 API（Next.js，保留不重寫）

指示內應列出**所有 API 路由**及用途，讓 Agent 在 App 內用 `fetch(API_BASE + path)` 呼叫：

| 方法 | 路徑 | 用途 |
|------|------|------|
| GET | `/api/meals` | 取得餐單（日期範圍） |
| POST | `/api/generate-meals` | 生成餐單（Gemini） |
| POST | `/api/regenerate-meal` | 單餐重新生成 |
| GET/POST/PUT/DELETE | `/api/travel-mode` | 旅遊模式查詢/啟動/更新/結束 |
| POST | `/api/travel-mode/generate-day` | 單日旅遊餐單生成 |
| POST | `/api/coach/chat` | AI 教練對話 |
| POST | `/api/analyze-food-text` | 文字分析食物 |
| POST | `/api/analyze-food-image` | 圖片分析食物 |
| POST | `/api/smart-meal-recommendation` | 智能餐單推薦 |

應註明：請求需帶 `Authorization: Bearer <supabase_access_token>`，與 Web 一致。

---

## 五、檔案對應表（Web → App）

指示內應有對照表，方便 Agent 複製/改寫：

| 類型 | Web（seekmeal-app） | App（SeekMealApp） |
|------|---------------------|--------------------|
| **Supabase 客戶端** | `lib/supabase.ts` 或 `lib/supabase/client.ts` | `lib/supabase.ts`（用 `createClient` + `EXPO_PUBLIC_*`，不用 `@supabase/ssr`） |
| **餐單/資料** | `lib/meals.ts` | `lib/meals.ts`（`fetch` 改為 `API_BASE + '/api/...'`） |
| **業務邏輯** | `lib/adjustMealPlan.ts`、`lib/ai-json.ts`、`lib/cat/*` | 複製到 `lib/`，移除 DOM/Node 依賴 |
| **類型** | `types/database.ts`、`types/meal.ts`、`types/cat.ts` | 複製到 `types/` |
| **Hooks** | `app/hooks/useAuth.ts`、`app/hooks/useStreak.ts` | `hooks/useAuth.ts`、`hooks/useStreak.ts`（Supabase 改用 RN 的 client） |
| **頁面 → 畫面** | `app/page.tsx` | `app/(tabs)/index.tsx` 或 `screens/HomeScreen.tsx` |
| **頁面** | `app/auth/page.tsx` | `screens/AuthScreen.tsx` |
| **頁面** | `app/settings/page.tsx` | `screens/SettingsScreen.tsx` |
| **頁面** | `app/progress/page.tsx` | `screens/ProgressScreen.tsx`（含歷史 Tab） |
| **頁面** | `app/coach/page.tsx` | `screens/CoachScreen.tsx` |
| **頁面** | `app/onboarding/page.tsx` | `screens/OnboardingScreen.tsx` |
| **元件** | `components/MealCard.tsx` | `components/MealCard.tsx`（改為 View/Text/Pressable） |
| **元件** | `components/BottomNav.tsx` | 用 `@react-navigation/bottom-tabs` 取代 |
| **元件** | `components/Cat.tsx` | `components/Cat.tsx`（改為 RN 可用的動畫，如 Reanimated） |
| **元件** | `components/ProgressRing.tsx`、`GlowingProgressBar.tsx` | 用 RN 的 SVG 或現成 ring 元件重做 |
| **元件** | `WeeklyProgressChart.tsx`、`WeightPredictionChart.tsx` | 用 `react-native-chart-kit` 或 `victory-native` 重做 |
| **元件** | Modal 類（EditMealModal、SpecialEventModal 等） | RN `Modal` + 相同邏輯 |

可再細化到「每個頁面內的主要子區塊」對應到哪個 RN 元件。

---

## 六、設計與 UI 規範（Design）

指示內應寫明要保留的設計元素：

| 項目 | 應含內容 |
|------|----------|
| **主色/語意色** | primary（綠系）、成功/警告/錯誤色、背景漸層（如主頁綠到白）。可從 `tailwind.config`、`globals.css`、現有 class 擷取色碼。 |
| **字體與層級** | 標題、內文、輔助文字大小與粗細（Web 用 Arial/Helvetica，App 可用系統或指定字體）。 |
| **Cat 角色** | 表情與狀態對應（lib/cat/expressions.ts、stateCalculator.ts），動畫意圖（breathe、bounce、nod 等）用 Reanimated 或 Lottie 重現。 |
| **圓角、間距** | 卡片圓角（如 rounded-2xl）、padding/margin 習慣，轉成 StyleSheet 或 NativeWind 數值。 |
| **Toast/提示** | Web 用 react-hot-toast；App 用 react-native-toast-message 或 Expo 的 toast，行為一致（成功/錯誤/一般）。 |

可附上 Web 的 `tailwind.config.ts`、`app/globals.css` 的關鍵片段或擷取後的設計 token 表。

---

## 七、依賴與環境（Dependencies & Env）

指示內應列出：

| 項目 | 應含內容 |
|------|----------|
| **App 端必須安裝** | `expo`、`@supabase/supabase-js`、`@react-navigation/native`、`@react-navigation/native-stack`、`@react-navigation/bottom-tabs`、`react-native-screens`、`react-native-safe-area-context`、`react-native-gesture-handler`；圖表、動畫、Toast 等見下方替換表。 |
| **Web 專用、不在 App 安裝** | `next`、`react-dom`、`@supabase/ssr`、`eslint-config-next`、`recharts`、`framer-motion`、`react-hot-toast`、`canvas-confetti` 等。 |
| **替換對應** | recharts → react-native-chart-kit 或 victory-native；framer-motion → react-native-reanimated；react-hot-toast → react-native-toast-message；Tailwind → StyleSheet 或 NativeWind。 |
| **環境變量** | `EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_ANON_KEY`、`EXPO_PUBLIC_API_URL`（Next 後端網址）。說明從 Web 的 `.env.local` 對應過來。 |

---

## 八、執行順序（Phase Order）

指示內應規定 Agent 的建議執行順序，例如：

1. **Phase 1**：建立 Expo 專案、安裝依賴、設定 `.env` 與 `lib/supabase.ts`。  
2. **Phase 2**：複製並改寫 `lib/`（除 server）、`types/`、`hooks/`。  
3. **Phase 3**：實作 Auth 畫面與 AuthGuard、導航結構（未登入 → Auth/Onboarding；已登入 → Tab）。  
4. **Phase 4**：主頁（讀餐單、顯示 Cat、進度環）、接 API 生成餐單。  
5. **Phase 5**：MealCard、記錄/更換/特殊活動/手動記錄、智能推薦。  
6. **Phase 6**：設定頁（個人資料、營養目標、旅遊模式設定與啟動/結束）。  
7. **Phase 7**：進度頁（連續達標、本週圖表、體重、歷史 Tab）。  
8. **Phase 8**：AI 教練、Onboarding、旅遊流程畫面（travel-waiting/future/completed 等）。  
9. **Phase 9**：測試、修正、清單勾選。

可再細化每 Phase 的「輸入檔案清單」與「產出檢查項」。

---

## 九、測試與驗證清單（Acceptance）

指示內應包含「完成後需驗證」的項目，例如：

- [ ] 登入/註冊/登出正常，AuthGuard 行為與 Web 一致。  
- [ ] 主頁可顯示今日/明/後天餐單，Cat 與進度環顯示正確。  
- [ ] 可成功呼叫「生成餐單」並顯示新餐單。  
- [ ] 記錄已食、更換單餐、特殊活動、手動記錄、智能推薦與 Web 行為一致。  
- [ ] 設定頁可讀寫個人資料與營養目標，旅遊模式可設定/啟動/結束。  
- [ ] 進度頁連續達標、本週圖表、體重記錄與預測、歷史 Tab 正常。  
- [ ] AI 教練可發送/接收訊息。  
- [ ] 所有需後端的操作均帶正確 `Authorization`，且使用 `EXPO_PUBLIC_API_URL`。

---

## 十、其他注意事項

指示內可補充：

- **錯誤處理**：與 Web 一致（如 Toast 錯誤訊息、網路錯誤提示）。  
- **載入狀態**：按鈕 loading、列表 skeleton，與 Web 體驗對齊。  
- **深鏈結 / 導航**：若未來要做 deep link，預留路由命名方式。  
- **參考文件**：若已有 `NATIVE_APP_MIGRATION_PLAN.md`、`GIT_AND_NEXT_STEPS.md`，註明路徑或貼關鍵段落，讓 Agent 可 @ 引用。

---

## 下一步（與你一起優化）

1. **補漏**：上面哪一塊要加「具體檔案路徑、程式碼片段、截圖說明」？  
2. **簡化/合併**：哪些段落要合併成「一個大表」或「一個 Phase 清單」？  
3. **優先級**：是否要標註「Phase 1–3 必須先完成再問我」「圖表可後做」等？  
4. **產出格式**：最終要產出「一份給 Agent 的單一 Markdown」還是「多個小檔（Context.md + Migration.md + Checklist.md）」？

你指定要加強或縮短的段落後，我可以幫你寫成「可直接貼給新 Cursor 專案 Agent 的完整指示」內容。
