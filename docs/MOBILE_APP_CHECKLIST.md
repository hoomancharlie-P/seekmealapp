# Mobile App 後續發展：應記錄與易漏項目

> 之後根據現有文件繼續發展 **SeekMealApp**（React Native / Expo）時，以下項目若尚未寫進 AGENT_INSTRUCTIONS / API_SPEC / WHAT_TO_RECORD，建議補上或對照此清單，避免遺漏。

---

## 一、專案與工作目錄（易混淆）

| 項目 | 說明 |
|------|------|
| **文件與後端所在** | **seekmeal-app**（Next.js）。AGENT_INSTRUCTIONS、API_SPEC、WHAT_TO_RECORD 等都在此專案。 |
| **Mobile App 所在** | **SeekMealApp**（Expo），與 seekmeal-app 同層目錄（如 `../SeekMealApp`）。 |
| **開發時** | 做 App 功能請在 **SeekMealApp** 目錄開專案／開 Agent；後端與文件在 seekmeal-app 可當「單一來源」對照。 |
| **兩邊同步** | 型別、API 合約、env 變數名應兩邊對齊；API 改動時同步更新 `docs/API_SPEC.md`。 |

---

## 二、App 目錄與路由結構（Expo Router）

目前 SeekMealApp 使用 **expo-router**，結構如下（供 Phase 6–9 對應）：

| 路徑 | 用途 | Phase |
|------|------|-------|
| `app/(tabs)/_layout.tsx` | Tab 導航（主頁、進度、教練、設定） | — |
| `app/(tabs)/index.tsx` | **主頁**（日期 Tab、餐單、Cat、進度環、所有 BottomSheet） | 4–5 ✅ |
| `app/(tabs)/progress.tsx` | 進度頁（待實作：streak、本週圖、體重、歷史） | 7 |
| `app/(tabs)/coach.tsx` | AI 教練（待實作：對話 + POST /api/coach/chat） | 8 |
| `app/(tabs)/settings.tsx` | 設定頁（待實作：個人資料、營養目標、旅遊模式） | 6 |
| `app/_layout.tsx` | 根 layout（Auth 導向、SafeArea 等） | 3 ✅ |

**元件**：`components/BottomSheet.tsx`、`MealCard.tsx`、`MealOptionsModal.tsx`、`Cat.tsx`、`Toast.tsx` 等；主頁選單**一律使用 BottomSheet**（不再用置中 Modal）。

---

## 三、App 環境變數與本地開發

| 變數 | 必填 | 說明 |
|------|------|------|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | 與 Web 的 NEXT_PUBLIC_SUPABASE_URL 相同。 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 與 Web 的 NEXT_PUBLIC_SUPABASE_ANON_KEY 相同。 |
| `EXPO_PUBLIC_API_URL` | ✅ | Next 後端網址。**本機開發**：真機/模擬器要打到電腦時用 `http://<本機IP>:3000`（與電腦同一 WiFi），勿用 localhost。 |

**本地同時跑**：終端 1 在 seekmeal-app 跑 `npm run dev`；終端 2 在 SeekMealApp 跑 `npx expo start`；真機 Expo Go 掃 QR 後，若 API 打不通請檢查防火牆與 EXPO_PUBLIC_API_URL 是否為本機 IP。

---

## 四、Auth 與 API 請求（易漏）

- App 呼叫 Next API 時，**必須帶** `Authorization: Bearer <supabase_access_token>`。
- **實作位置**：SeekMealApp `lib/meals.ts` 內 **fetchWithAuth**：每次請求前 `await supabase.auth.getSession()`，取 `session.access_token` 放進 header。
- **注意**：Supabase 客戶端需用 **AsyncStorage** 持久化 session，否則重啟 App 後 getSession() 可能為空、導致 401。見 `lib/supabase.ts` 註解。
- 若新增其他呼叫後端的函數，請一律經 **fetchWithAuth**（或同機制），勿直接 fetch 不帶 token。

---

## 五、型別與 API 回傳對齊

- App 型別（如 `MealWithFoods`、`Profile`、`GeneratedMealOption`）應與 **API 回傳結構** 及 **DB 欄位** 一致。
- API 改欄位或新增欄位時，需同步改 SeekMealApp 的 `types/` 與 `lib/meals.ts` 等處。
- **數字欄位**：calories、protein、carbs、fat、fiber 一律**整數**；前端組 payload 時 toInt/Math.round，避免 DB 錯誤。

---

## 六、主頁 state 與流程（建議補文件）

主頁（`app/(tabs)/index.tsx`）關鍵 state 與關閉時機，建議另建 `docs/HOME_FLOWS.md` 或於 AGENT_INSTRUCTIONS 主頁小節簡表記錄，例如：

| State | 用途 | 關閉／清空時機 |
|-------|------|----------------|
| `mealOptionsMealId` | 呢一餐選單顯示哪一餐 | 選完選項、取消、或選了「記錄實際」等後設為 null |
| `mealForReplace` | 生成新一餐 BottomSheet | 取消或生成完成並選完餐單後 |
| `mealForLogActual` | 記錄實際 BottomSheet | 取消或提交成功後 |
| `mealForEditFoods` | 修改單項食物 BottomSheet | 取消或儲存成功後 |
| `showSpecialEventModal` | 特殊活動 BottomSheet | 取消或確定後 |
| `logActualStep` | 記錄實際步驟（choose / direct / text / photo） | 返回、關閉或提交後重置 |

新增主頁彈窗或流程時，記得對應 state 與 onClose 清空時機，避免殘留。

---

## 七、錯誤與離線（建議統一約定）

- **網路錯誤／超時**：目前 `lib/meals.ts` 有 FETCH_TIMEOUT_MS、AbortController；錯誤回傳給呼叫端後，由 UI 顯示 Toast（如「請檢查網絡」）。
- **API 回傳 4xx/5xx**：解析 body.error 或 body.message，Toast 顯示給使用者；按鈕在 loading 時 disabled，避免重複送出。
- **離線／無 EXPO_PUBLIC_API_URL**：`isApiUrlConfigured()` 為 false 時，各函數直接 return `{ success: false, error: 'EXPO_PUBLIC_API_URL 未設定' }`，UI 可提示「請設定 API 網址」。
- 若之後要支援離線快取或重試策略，建議在 **docs/ERROR_HANDLING.md** 寫一節「App 錯誤與離線約定」。

---

## 八、圖片上傳（記錄實際 － 拍照）

- **API**：POST `/api/analyze-food-image`，body 為 `{ image: base64 字串, mimeType: 'image/jpeg' }`（**不要**帶 `data:image/...;base64,` 前綴）。
- **建議**：若照片過大，前端可先壓縮或縮小再轉 base64，避免 413 或逾時；可記錄「圖片最大邊 ≤ 1024px 或檔案 < 2MB」等約定於 API_SPEC 或此文件。

---

## 九、Phase 6–9 實作對照（待做時可勾）

| Phase | 頁面／入口 | 主要 API／Supabase | Web 參考 |
|-------|------------|---------------------|----------|
| 6 設定頁 | `app/(tabs)/settings.tsx` | profiles 讀寫、GET/POST/PUT/DELETE /api/travel-mode | seekmeal-app `app/settings/page.tsx` |
| 7 進度頁 | `app/(tabs)/progress.tsx` | useStreak、本週數據、體重、歷史；圖表用 chart-kit 或 victory-native | `app/progress/page.tsx`、WeeklyProgressChart、WeightPredictionChart |
| 8 其餘 | `app/(tabs)/coach.tsx`、Onboarding（若有） | POST /api/coach/chat；旅遊等待/完成可併入主頁或設定 | `app/coach/page.tsx`、travel-* 頁 |
| 9 測試與收尾 | 全 App | 驗收清單、token 與 EXPO_PUBLIC_API_URL 檢查 | AGENT_INSTRUCTIONS §九 |

---

## 十、尚未建立但建議補的檔案（對照 WHAT_TO_RECORD）

| 文件 | 用途 |
|------|------|
| `docs/DATA_MODEL.md` | DB 欄位、前端型別對應、數字欄位約定。 |
| `docs/HOME_FLOWS.md` | 主頁 state 清單、流程步驟（呢一餐 → 記錄實際 → …）、何時呼叫 API。 |
| `docs/ERROR_HANDLING.md` | 網路錯誤、驗證錯誤、已知限制、App 離線/重試約定。 |
| `docs/GLOSSARY.md` | 呢一餐、記錄實際、特殊活動、豐富版/標準版 等詞彙。 |
| `docs/CONVENTIONS.md` | 函數命名（handle*、fetch*）、檔案命名、日期格式。 |
| `docs/DEPLOYMENT.md` 或擴充 SETUP | App 建置（如 EAS Build）、TestFlight／Play 內測、環境區分。 |

---

## 十一、建置與發佈（預留）

- **Expo**：目前為 Expo 專案；之後若要上架，會用到 **EAS Build**、**EAS Submit**（或手動上傳）。
- **環境**：開發用 EXPO_PUBLIC_API_URL 指向本機或測試後端；正式版指向正式後端 URL。
- 具體步驟可於真正要發佈時再補進 `docs/DEPLOYMENT.md` 或 SeekMealApp 的 README。

---

## 小結：優先補哪些？

- **必備（繼續開發前建議有）**：專案與目錄說明（§一）、App 路由與 Phase 對照（§二、§九）、環境與 Auth（§三、§四）。
- **強烈建議**：型別與 API 對齊（§五）、主頁 state/流程（§六）、錯誤/離線約定（§七）。
- **可隨實作補**：圖片上傳約定（§八）、DATA_MODEL、HOME_FLOWS、ERROR_HANDLING、GLOSSARY、CONVENTIONS、DEPLOYMENT（§十、§十一）。

本文可與 **AGENT_INSTRUCTIONS**、**docs/WHAT_TO_RECORD.md**、**docs/API_SPEC.md** 一併使用，作為「繼續發展 Mobile App 時還需記錄／對照」的檢查清單。
