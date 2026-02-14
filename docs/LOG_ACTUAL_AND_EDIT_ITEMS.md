# 記錄實際 & 餐卡內修改單項食物

**專案分工**：後端 API 在 **seekmeal-app**（本專案）；「記錄實際」與「修改單項食物」的 **UI 與流程** 實作在 **mobile app**：`Projects/SeekMealApp`（Expo，expo-router），不是 seekmeal-app。

---

## 1）記錄實際

**入口**：餐卡（該餐）→「記錄實際」

**功能**：記錄用戶實際吃下的食物與整餐營養，支援三種輸入方式（可並用）：

| 方式 | 說明 |
|------|------|
| **拍照** | 上傳食物照片，由後端/視覺辨識解析為食物與營養（若專案有對應 API）。 |
| **文字** | 用戶輸入文字描述（例如「半碗白飯、一碟菜心」），由 API 解析為食物列表與營養。 |
| **直接輸入** | 用戶直接輸入整餐的卡路里／蛋白質／碳水／脂肪（可選），或逐項輸入食物與營養。 |

**後端 API（已實作）**

- **POST** `/api/meals/[mealId]/log-actual`
- **Auth**：`Authorization: Bearer <supabase_access_token>`（與 GET /api/meals 相同）
- **Body**（JSON）：
  - `calories?`（number）整餐卡路里
  - `protein?`, `carbs?`, `fat?`, `fiber?`（number）整餐營養
  - `foods?`（array）實際食物列表，每項：`name`, `calories?`, `protein?`, `carbs?`, `fat?`, `fiber?`, `portion?`
- 可只傳整餐總量、或只傳 `foods`（後端會加總）、或兩者都傳。會更新該餐的 `meals` 欄位、可選替換 `foods` 表，並設 `consumed: true`、`consumed_at: now`。
- **文字解析**：App 可先呼叫現有 **POST /api/analyze-food-text**（body: `{ text }`）取得 `foods`，再傳入本 API。

---

## 2）餐卡內「修改單項食物」→ 編輯模式（增／刪單項）

**入口**：餐卡（該餐）→「修改單項食物」

**行為**：
- 進入**編輯模式**，顯示該餐目前的食物列表。
- **刪除**：可刪除單項食物。
- **新增**：可新增單項食物（名稱、份量、卡路里／營養等，依現有資料結構）。
- 儲存後更新該餐的 `foods` 與總營養／卡路里（後端依新列表重算）。

**後端 API（已實作）**

- **PUT** `/api/meals/[mealId]/foods`
- **Auth**：`Authorization: Bearer <supabase_access_token>`
- **Body**（JSON）：`{ "foods": [ { "name": "食物名稱", "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0, "portion": "可選" } ] }`
- 以新列表**整份替換**該餐的 `foods`（增＝在陣列加一項、刪＝從陣列移除該項），後端會刪除舊食物、插入新列表，並依新列表重算餐單總卡路里與營養後寫回 `meals`。
