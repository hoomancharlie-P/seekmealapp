# 旅遊模式修復方案（待你同意後執行）

## 問題一：31/1 顯示中式食物、無「中文＋當地語言＋英文」格式

### 現況說明
- **30/1**：有觸發旅遊餐單，食物為日本料理且名稱格式正確（中文、當地語言、英文）。
- **31/1**：日期旁有「日本」標記，但食物為中式，且無當地語言/英文名稱。
- 原因：31/1 **沒有觸發旅遊餐單生成**，可能用了預設的 `createInitialMeals`（港式）或某次載入時 `checkAndGenerateTravelMeals` 未涵蓋該日。

### 旅遊模式食物名稱格式（已存在，不需重寫）
格式與代碼位置如下，之後若要寫 prompt 或文件可直接引用：

- **檔案**：`app/api/travel-mode/route.ts`
- **函數**：`generateTravelMealsForDay`
- **格式說明**：約 **1354–1361 行** 的 prompt 段落「重要：食物名稱格式要求」：
  - 格式：`"用戶語言的食物名稱（當地語言名稱 - 英文名字）"`
  - 例：韓式牛肉粥(소고기죽 - beef congee)
  - 若當地語言為英文：`"用戶語言名稱（當地英文名稱 - 描述性英文名字）"`
  - 例：印式扁豆咖哩(Dal makhani - Lentil Curry)
- **JSON 範例**：約 **1372–1382 行**（`"name": "日式納豆定食(納豆定食 - Natto Teishoku)"`）
- **前端顯示邏輯**：`components/MealCard.tsx` 的 `formatFoodName`（約 42–66 行）負責解析並顯示上述格式。

之後若要「整理旅遊模式食物名稱格式」的 prompt，只需**指出上述代碼位置與段落**，不需重新寫入格式邏輯。

### 31/1 未觸發旅遊餐單的可能原因與後續建議
- 啟動旅遊當下，「未來 3 天」的計算或時區可能未包含 31/1。
- 或主頁某次載入時，31/1 已有預設餐單，`checkAndGenerateTravelMeals` 判定「有餐單」而未重生成。
- **建議**（若你同意一併做）：在主頁 `checkAndGenerateTravelMeals` 中，對「在旅遊期間內但餐單為預設（非旅遊）」的日期，也呼叫 `generate-day` 覆寫，或至少確保「未來 3 天」在旅遊區間內的每一天都會被檢查並在缺餐單時生成。這部分可列為後續優化，不一定要在本次一併實作。

---

## 問題二：移除 travel-waiting 頁面並修正導向

### 現況
- 啟動旅遊模式後，在設定頁**成功修改營養目標**並儲存，會導向舊的旅遊餐單生成頁：
  - `http://localhost:3000/travel-waiting?action=update&destination=日本&startDate=2026-01-30&endDate=2026-01-31&cuisine=japanese&keepExistingMeals=false`
- 此頁與相關流程應移除，不再使用。

### 解決方案（同意後執行）

#### 1. 移除 travel-waiting 相關檔案
- 刪除 `app/travel-waiting/page.tsx`
- 刪除 `app/travel-waiting/api-trigger.ts`
- （若專案內還有其他僅供 travel-waiting 使用的檔案，一併移除或改為不再依賴 travel-waiting）

#### 2. 設定頁：儲存營養目標且為旅遊模式時
- **目前**：`router.push('/travel-waiting?action=update&...')`（約 796–810 行）
- **改為**：
  - 先完成 profile 更新（維持現有邏輯）。
  - 若 `travelMode && travelPlan`：改為呼叫 **`PUT /api/travel-mode`**，body 帶入現有旅遊計劃（destination, startDate, endDate, cuisine）及 `keepExistingMeals: false`（與目前 travel-waiting 觸發的參數一致），**不**導向 travel-waiting。
  - 可選：顯示「正在更新旅遊餐單…」並在 PUT 完成後再 `router.push('/')`；或直接 `router.push('/')` 後由主頁載入，必要時在 API 端非同步更新餐單（需依你現有 PUT 實作決定是否要等完成）。

#### 3. 主頁：旅遊模式但今天無餐單時
- **目前**：`router.push('/travel-waiting?action=update&...')`（約 1327–1340 行）
- **改為**：**不再導向 travel-waiting**。改為 `router.push('/')`（或 `window.location.href = '/'`）強制重新載入，讓主頁再次執行 `checkAndGenerateTravelMeals(loadMeals)` 補齊今日餐單；若仍無餐單，可保留現有錯誤/空狀態提示。

#### 4. 設定頁：`redirectToTravelWaiting` 及「修改旅程」
- **目前**：`redirectToTravelWaiting`（約 475–485 行）會 `window.location.href = '/travel-waiting?...'`。
- **改為**：若 UI 已移除「修改旅程」按鈕且不再使用此流程，可刪除 `redirectToTravelWaiting`，並移除所有呼叫它的地方（例如 `handleUpdateTravel` 內若有呼叫）。若仍有「更新旅程」需求，改為直接呼叫 `PUT /api/travel-mode` 後 `router.push('/')`，不再使用 travel-waiting。

#### 5. 其他引用
- 搜尋並移除或替換所有 `travel-waiting`、`/travel-waiting` 的連結與註解（例如 `app/api/meals/route.ts` 註解若提到 travel-waiting 可改為「主頁或設定頁」）。

---

## 測試檢查清單（執行後建議驗證）

1. **旅遊模式 + 修改營養目標**
   - 設定旅遊計劃並啟動 → 到設定頁修改營養目標並儲存 → 應**不會**進入 travel-waiting，應回到主頁或設定頁，且旅遊餐單會依新目標更新（或主頁重新載入後顯示正確餐單）。

2. **主頁無今日餐單**
   - 旅遊模式開啟但今日無餐單（可手動刪除 DB 今日餐單測試）→ 重新載入主頁 → 應**不會**進入 travel-waiting，應留在主頁並由 `checkAndGenerateTravelMeals` 補齊餐單或顯示錯誤。

3. **travel-waiting 已移除**
   - 直接造訪 `/travel-waiting` 或帶 query 的 travel-waiting URL → 應為 404 或由路由導回首頁（依你路由設定）。

---

## 小結

- **問題一**：已整理旅遊模式食物名稱格式的**代碼位置**（`app/api/travel-mode/route.ts` + `MealCard.tsx`），之後寫 prompt 時只需引用，不需重寫。31/1 未觸發旅遊餐單可列為後續優化（確保旅遊區間內每一天都會被生成/覆寫）。
- **問題二**：移除 travel-waiting 頁面與相關功能；設定頁與主頁改為呼叫 `PUT /api/travel-mode` 或重新載入主頁，不再導向 travel-waiting。

若你同意上述方案，我再依此執行代碼修改。
