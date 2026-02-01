# 旅遊模式「食物沒有更新」與 429 錯誤分析（僅分析，未改程式）

## 終端日誌摘要

- **POST /api/travel-mode**（啟動旅遊）：`generateInitialTravelMeals` 為 2026-01-29 呼叫 Gemini → 連續 3 次 429（rate limit）→ 拋錯「AI API 請求過於頻繁（已重試 2 次）」→ API 仍回 **200**，並 log「Meal generation partially failed, but continuing...」。
- **POST /api/travel-mode/generate-day**（主頁補單）：為 2026-01-29 呼叫 Gemini → 第 1 次 429 → retry 1 再 429 → retry 2 前等待 1000ms 後**成功**，寫入餐單 → 200。

---

## 可能出錯原因（先不確定，僅列可能）

### 1. 啟動時（POST /api/travel-mode）沒有任何一天成功

- **流程**：`generateInitialTravelMeals` 用 `for (const dateStr of dates)` 依序對 3 天呼叫 `await generateTravelMealsForDay(...)`，**天與天之間沒有延遲**。
- **實際**：第一天（2026-01-29）呼叫 Gemini 就 429，函式內重試 3 次（約 1s、2s）仍 429，最後 **throw**。
- **結果**：錯誤一路從 `generateTravelMealsForDay` → `generateInitialTravelMeals` → POST 的 try/catch。POST 的 catch 發現錯誤訊息**不是**「失敗過多」或「所有日期的餐單生成都失敗」，於是當成「部分失敗」、log「Meal generation partially failed, but continuing...」並回 **200**。
- **結論**：啟動當下**沒有任何一天**有跑完寫入（第一天就拋錯，迴圈沒機會跑第 2、3 天）。旅遊計劃有建立，但 3 天的餐單都是空的。

### 2. 主頁補單只看到「一天」的 log

- **流程**：主頁 `checkAndGenerateTravelMeals` 會找出「未來 3 天且在旅遊區間內、且尚無餐單」的日期，對每個日期呼叫 `generateTravelMealForDate`（即 POST /api/travel-mode/generate-day），且**每次之間有 2 秒延遲**。
- **實際**：日誌裡只看到**一次** generate-day（2026-01-29），且該次在 retry 2（等待約 1000ms）後成功。
- **可能**：
  - 另外兩天（2026-01-30、2026-01-31）的請求在日誌截取範圍之外，或尚未發出／尚未打完。
  - 或 `datesToGenerate` 在當下只包含 2026-01-29（例如查詢邏輯／時區只算到一天），其餘兩天沒被當成「缺餐單」而沒觸發 generate-day。
- **結論**：從現有 log **無法確定** 30、31 是否有被呼叫；只能確定 29 在重試後有成功寫入。

### 3. 為何會 429（僅列可能）

- 啟動時**連續**對多天呼叫 Gemini，天與天之間**無延遲、無退避**，容易在短時間內打滿免費額度。
- 若先前已有其他 Gemini 請求（例如其他頁面或同一 session 其他操作），額度可能已見底，啟動時第一筆就 429。
- 主頁補單時，與剛結束的 POST /api/travel-mode 請求時間接近，quota 尚未恢復，第一次 generate-day 也容易 429；間隔約 1s 後 retry 才成功，符合「稍等再打就過」的現象。

### 4. 「有目的地標示但食物沒更新」的可能對應

- **目的地標示**：來自旅遊計劃（travel_plans）與前端 `isDateInTravel`／`getTravelDestination()`，不依賴當天是否有餐單。
- **食物沒更新**：可能對應到下列其一或組合：
  - 啟動時 3 天都未成功寫入（見 1），所以一開始就沒有旅遊餐單。
  - 主頁只補了部分日期（例如只補了 29，30、31 未補或未在 log 中），所以部分日期仍無餐單或仍是舊的預設餐單。
  - 前端在 generate-day 完成後沒有再次 `loadMeals()` 或沒有觸發重新拉取，畫面上仍顯示舊資料。

---

## 小結（不執行修改）

- **啟動**：`generateInitialTravelMeals` 對多天連續呼叫 Gemini 且**無延遲**，第一天 429 後拋錯，API 仍回 200，導致**啟動當下可能沒有任何一天的餐單被寫入**。
- **主頁**：從 log 只能確認 2026-01-29 經 generate-day 重試後成功；其餘天數是否也有呼叫／成功，需更多 log 或加 log 才能確認。
- **使用者感受**：旅遊日有目的地標示（來自計劃），但部分或全部日期沒有對應的旅遊餐單，看起來就像「食物沒有更新」。

以上為依終端日誌所做的可能原因整理，**尚未對程式做任何修改**。
