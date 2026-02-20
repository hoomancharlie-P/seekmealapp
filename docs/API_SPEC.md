# API 規格：Request / Response JSON 格式

> 供前後端與 App 對接、Agent 實作時對照。所有請求需帶 **Authorization: Bearer \<supabase_access_token\>**。  
> Base URL：環境變量 `EXPO_PUBLIC_API_URL`（App）或同源（Web）。

---

## 1. 取得餐單

**GET** `/api/meals?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

- **Request**：Query 參數 `startDate`、`endDate`（必填）。
- **Response 200**：`{ meals: Meal[] }`（依實際 route 回傳結構，含 `foods` 等）。
- **Error**：400 缺少參數。

---

## 2. 生成餐單（初版／多日）

**POST** `/api/generate-meals`

- **Request body**：
```json
{
  "userId": "uuid",
  "calorieTarget": 2000,
  "proteinTarget": 100,
  "carbsTarget": 250,
  "fatTarget": 65,
  "fiberTarget": 25,
  "days": 3,
  "dietaryRestrictions": [],
  "dietaryHabit": "none",
  "allergies": [],
  "forceReplace": false,
  "startDate": "2025-02-02"
}
```
  - **forceReplace**（可選）：`true` 時先刪除日期範圍內既有餐單再寫入，避免「餐單已存在」導致不寫入。
  - **startDate**（可選）：客戶端「今天」的日期字串（YYYY-MM-DD），用於計算日期範圍，避免時區導致「後天」空白。

- **Response 200**：`{ success: true, mealsCreated, dayStats, ... }`（依 route 實際回傳）。
- **Error**：400 缺少參數；500 生成失敗／限流。

---

## 3. 智能餐單推薦（生成新一餐）

**POST** `/api/smart-meal-recommendation`

- **Request body**：
```json
{
  "userId": "uuid",
  "mealType": "lunch",
  "mode": "quick",
  "targetCalories": 700,
  "targetProtein": 35,
  "targetCarbs": 85,
  "targetFat": 25,
  "targetFiber": 8,
  "preferences": {
    "location": "eating_out",
    "cuisine": "hk",
    "mood": "healthy",
    "mainType": "rice",
    "customInput": ""
  },
  "otherMeals": [],
  "numberOfOptions": 2,
  "secondOptionCalorieMultiplier": 1.3
}
```
  - **preferences**（可選）：可單獨傳或與頂層 `location` / `cuisine` 等並存；後端會合併（`body.preferences` 與頂層欄位）。
  - **numberOfOptions**：可為 1；若 AI 只回 1 個選項，後端會自動生成第二個「豐富版」選項（卡路里 × secondOptionCalorieMultiplier）。

- **Response 200**：
```json
{
  "success": true,
  "data": {
    "options": [
      {
        "label": "標準版",
        "calories": 680,
        "protein": 34,
        "carbs": 82,
        "fat": 24,
        "fiber": 8,
        "foods": [
          {
            "name": "食物名稱",
            "portion": "1碟",
            "calories": 350,
            "protein": 18,
            "carbs": 40,
            "fat": 8,
            "fiber": 2
          }
        ]
      }
    ]
  }
}
```
- **Error**：400 / 422 / 503，`{ success: false, error: "訊息", details?: "..." }`。

---

## 4. 單餐重新生成

**POST** `/api/regenerate-meal`

- **Request body**：依現有 route（mealId、選項等）。寫入時會更新該餐的 `updated_at`。
- **Response**：依現有 route。
- **備註**：替換餐單後前端應刷新列表，並可顯示「已更新」標籤（依 `updated_at` 或業務邏輯）。

---

## 5. 文字分析食物（記錄實際 － 文字描述）

**POST** `/api/analyze-food-text`

- **Request body**：
```json
{
  "text": "半碗白飯、一碟菜心、雲吞麵一碗"
}
```

- **Response 200**：
```json
{
  "success": true,
  "data": {
    "foods": [
      {
        "name": "白飯",
        "portion": "半碗",
        "calories": 130,
        "protein": 2,
        "carbs": 28,
        "fat": 0,
        "fiber": 0
      }
    ],
    "notes": "分析備註（可選）"
  }
}
```
- **Error**：400 輸入為空；422 AI 返回格式錯誤；500/503 分析失敗。  
  Body：`{ success: false, error: "訊息", details?: "..." }`。

---

## 6. 圖片分析食物（記錄實際 － 拍照／上傳照片）

**POST** `/api/analyze-food-image`

- **Request body**：
```json
{
  "image": "base64 編碼字串（無 data URL 前綴）",
  "mimeType": "image/jpeg"
}
```

- **Response 200**：
```json
{
  "success": true,
  "data": {
    "foods": [
      {
        "name": "雞扒飯",
        "portion": "1碟",
        "calories": 600,
        "protein": 35,
        "carbs": 70,
        "fat": 18,
        "fiber": 3,
        "confidence": 0.85,
        "notes": "可選"
      }
    ],
    "warnings": [],
    "suggestions": []
  }
}
```
- **Error**：500 分析失敗。Body：`{ success: false, error: "訊息", details?: "..." }`。
- **前端**：App 使用 `analyzeFoodImage(base64, mimeType)`，取得 `data.data.foods` 後顯示給使用者確認，再呼叫「記錄實際」API。

---

## 7. 記錄實際（寫入該餐實際飲食）

**POST** `/api/meals/[mealId]/log-actual`

- **Request body**：二擇一或同時傳  
  - 整餐總營養：`calories`, `protein`, `carbs`, `fat`, `fiber`（number）。  
  - 食物列表：`foods: Array<{ name, calories?, protein?, carbs?, fat?, fiber?, portion? }>`。

```json
{
  "calories": 650,
  "protein": 32,
  "carbs": 78,
  "fat": 20,
  "fiber": 5
}
```
或
```json
{
  "foods": [
    { "name": "雞扒飯", "portion": "1碟", "calories": 600, "protein": 35, "carbs": 70, "fat": 18, "fiber": 3 }
  ]
}
```

- **Response 200**：`{ success: true }`（或依 route 實際回傳）。
- **Error**：400 缺少參數；403/404 權限或找不到該餐。

---

## 8. 修改單項食物（替換該餐食物列表）

**PUT** `/api/meals/[mealId]/foods`

- **Request body**：
```json
{
  "foods": [
    { "name": "白飯", "portion": "1碗", "calories": 260, "protein": 5, "carbs": 57, "fat": 0, "fiber": 1 }
  ]
}
```
  - 後端會以新列表替換該餐所有食物，並依食物重算餐單總營養與卡路里。  
  - **數字欄位**：寫入 DB 前應為整數（前端/後端需對小數做 `toInt()` 或 `Math.round()`，避免 DB 型別錯誤如 `"0.5"`）。

- **Response 200**：依 route（如 `{ success: true }`）。
- **Error**：400 缺少 `foods` 陣列；403/404。

---

## 9. 錯誤回應共通格式

- **HTTP 4xx/5xx** 時，body 通常為：
```json
{
  "error": "使用者可讀訊息",
  "details": "除錯用詳情（可選）"
}
```
- 部分 API 使用 `success: false` + `error`，與上述並存時以 `error` 為主要訊息。

---

## 10. 記錄實際流程（主頁 － 三種方式）

主頁「呢一餐」→「記錄實際」後，有三種輸入方式，對應 API 如下：

| 方式 | 說明 | 使用 API |
|------|------|----------|
| **直接輸入** | 使用者手動輸入食物名稱、卡路里、P/C/F/纖維 | 無 AI；直接組 `calories` + `foods` 呼叫 **POST /api/meals/[mealId]/log-actual** |
| **文字描述** | 使用者輸入一句描述（如「半碗白飯、一碟菜心」） | 先 **POST /api/analyze-food-text** 取得 `foods`，顯示給使用者確認後，再 **POST /api/meals/[mealId]/log-actual**（body 用 `foods`） |
| **拍照／上傳照片** | 使用者選圖或拍照 | 先 **POST /api/analyze-food-image**（body: `image` base64 + `mimeType`）取得 `foods`，顯示給使用者確認後，再 **POST /api/meals/[mealId]/log-actual**（body 用 `foods`） |

App 端函數（SeekMealApp `lib/meals.ts`）：

- `analyzeFoodText(text)` → `{ success, foods?, error? }`
- `analyzeFoodImage(imageBase64, mimeType)` → `{ success, foods?, error? }`
- `logMealActual(mealId, payload)` → `{ success, error? }`  
  payload 可為 `{ calories, protein, carbs, fat, fiber }` 或 `{ foods: [...] }`。

寫入 DB 時，所有營養數字欄位（calories, protein, carbs, fat, fiber）應為**整數**；前端在組 payload 前建議做 `toInt()`／`Math.round()`，後端寫入前也應做數值正規化，避免 `invalid input syntax for type integer: "0.5"`。
