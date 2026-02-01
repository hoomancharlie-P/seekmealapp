# 建立準確食物資料庫計劃

## 概述

本文檔描述如何建立一個基於香港政府食物安全中心（CFS）數據的準確食物營養資料庫，以提高 AI 餐單生成的準確性。

---

## 1. 資料庫結構設計

### 1.1 Supabase 表結構

```sql
-- 香港食物營養資料庫
CREATE TABLE hk_food_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本信息
  name_zh TEXT NOT NULL,              -- 中文名稱（主要）
  name_en TEXT,                       -- 英文名稱（可選）
  name_variants TEXT[],                -- 名稱變體（例如：沙嗲牛肉麵、沙爹牛肉麵）
  category TEXT,                      -- 食物類別（例如：麵食、飯類、飲品）
  
  -- 每 100g 的營養素（來自政府資料庫）
  calories_per_100g INTEGER NOT NULL,
  protein_per_100g DECIMAL(5,2) NOT NULL,
  carbs_per_100g DECIMAL(5,2) NOT NULL,
  fat_per_100g DECIMAL(5,2) NOT NULL,
  fiber_per_100g DECIMAL(5,2) DEFAULT 0,
  
  -- 其他營養素（可選，來自政府資料庫）
  sugar_per_100g DECIMAL(5,2),
  saturated_fat_per_100g DECIMAL(5,2),
  sodium_per_100g DECIMAL(5,2),
  
  -- 標準份量對照表（JSON 格式）
  -- 格式：{"1碗": 300, "1碟": 350, "1杯": 250}
  -- 單位：克（g）或毫升（ml，對於液體）
  standard_portions JSONB DEFAULT '{}',
  
  -- 元數據
  source TEXT DEFAULT 'CFS',         -- 資料來源（CFS = 食物安全中心）
  source_url TEXT,                    -- 資料來源 URL（可選）
  confidence_level TEXT DEFAULT 'high', -- 信心等級（high/medium/low）
  last_verified_at TIMESTAMP,         -- 最後驗證時間
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 建立索引以提高查詢速度
CREATE INDEX idx_hk_food_name_zh ON hk_food_database USING gin(to_tsvector('simple', name_zh));
CREATE INDEX idx_hk_food_category ON hk_food_database(category);
CREATE INDEX idx_hk_food_name_variants ON hk_food_database USING gin(name_variants);

-- 更新時間觸發器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_hk_food_database_updated_at 
  BEFORE UPDATE ON hk_food_database 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
```

### 1.2 數據示例

```json
{
  "name_zh": "沙嗲牛肉麵",
  "name_en": "Satay Beef Noodles",
  "name_variants": ["沙爹牛肉麵", "沙嗲牛麵"],
  "category": "麵食",
  "calories_per_100g": 150,
  "protein_per_100g": 8.5,
  "carbs_per_100g": 18.0,
  "fat_per_100g": 4.2,
  "fiber_per_100g": 1.5,
  "standard_portions": {
    "1碗": 300,
    "1碟": 350,
    "小碗": 250,
    "大碗": 400
  },
  "source": "CFS",
  "confidence_level": "high"
}
```

---

## 2. 數據來源和收集方法

### 2.1 主要數據來源

**香港食物安全中心（CFS）**
- 網址：https://www.cfs.gov.hk/tc_chi/nutrient/search1.php
- 包含：24 個食物類別，18 種營養素
- 格式：每 100g 的營養素數據

### 2.2 數據收集方法

#### 方法 A：手動輸入（推薦，最安全）

**優先級 1：最常見的香港食物（50-100 個）**
- 茶餐廳常見食物
- 港式料理
- 快餐店食物
- 常見飲品

**優先級 2：擴展到 200-300 個**
- 更多餐廳食物
- 家常菜
- 小食

**優先級 3：完整資料庫（500+）**
- 所有常見食物
- 特殊食物

#### 方法 B：網頁爬取（需謹慎）

**注意事項：**
1. 檢查 CFS 網站的服務條款
2. 遵守 robots.txt
3. 不要過度請求（rate limiting）
4. 標註數據來源

**技術實現：**
```typescript
// 示例：使用 Puppeteer 或 Cheerio 爬取
// 注意：需要遵守法律和倫理規範
```

#### 方法 C：官方 API（如果有）

- 查詢 CFS 是否提供公開 API
- 如果有，使用 API 獲取數據

---

## 3. 份量轉換邏輯

### 3.1 問題說明

政府資料庫提供的是「每 100g」的營養素數據，但實際使用時需要：
- 用戶描述：「1碗沙嗲牛肉麵」
- 需要轉換：1碗 = ? 克
- 計算：實際卡路里 = (卡路里/100g) × 實際克數

### 3.2 標準份量對照表

建立「常見份量描述 → 實際克數」的對照表：

```typescript
// 示例：標準份量對照
const STANDARD_PORTIONS = {
  '沙嗲牛肉麵': {
    '1碗': 300,      // 1碗 = 300g
    '1碟': 350,
    '小碗': 250,
    '大碗': 400,
  },
  '牛油多士': {
    '1片': 30,
    '2片': 60,
    '1份': 30,
  },
  '熱奶茶': {
    '1杯': 250,      // 1杯 = 250ml（約 250g）
    '1杯（少甜）': 250,
    '大杯': 350,
  },
  // ...
}
```

### 3.3 轉換函數

```typescript
/**
 * 根據食物名稱和份量描述，計算實際營養素
 * @param foodName 食物名稱（例如：「沙嗲牛肉麵」）
 * @param portion 份量描述（例如：「1碗」）
 * @returns 實際營養素數據，如果找不到則返回 null
 */
async function calculateNutritionFromDatabase(
  foodName: string,
  portion: string
): Promise<{
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
} | null> {
  // 1. 查找食物（支持名稱變體）
  const { data: food } = await supabase
    .from('hk_food_database')
    .select('*')
    .or(`name_zh.ilike.%${foodName}%,name_variants.cs.{${foodName}}`)
    .limit(1)
    .single()
  
  if (!food) return null
  
  // 2. 查找份量對照
  const portions = food.standard_portions || {}
  const grams = portions[portion]
  
  if (!grams) {
    // 如果沒有對應的份量，嘗試使用默認份量或返回 null
    return null
  }
  
  // 3. 計算實際營養素
  const ratio = grams / 100
  
  return {
    calories: Math.round(food.calories_per_100g * ratio),
    protein: Math.round(food.protein_per_100g * ratio * 10) / 10,  // 保留一位小數
    carbs: Math.round(food.carbs_per_100g * ratio * 10) / 10,
    fat: Math.round(food.fat_per_100g * ratio * 10) / 10,
    fiber: Math.round(food.fiber_per_100g * ratio * 10) / 10,
  }
}
```

---

## 4. 實施步驟

### 階段 1：基礎建設（第 1 週）

1. **建立 Supabase 表**
   - 執行 SQL 創建表結構
   - 建立索引
   - 測試查詢性能

2. **建立標準份量對照表**
   - 定義常見食物的標準份量
   - 建立 JavaScript/TypeScript 對象或 JSON 文件

3. **建立數據驗證函數**
   - 實現 `calculateNutritionFromDatabase` 函數
   - 實現模糊匹配邏輯（處理名稱變體）

### 階段 2：數據收集（第 2-3 週）

1. **手動輸入優先級 1 食物（50-100 個）**
   - 茶餐廳常見食物（20-30 個）
   - 港式料理（20-30 個）
   - 常見飲品（10-20 個）
   - 快餐店食物（10-20 個）

2. **建立數據輸入工具**
   - 創建簡單的數據輸入界面或腳本
   - 驗證數據格式

### 階段 3：API 整合（第 4 週）

1. **在 AI 生成 API 中整合**
   - 在 `smart-meal-recommendation` API 中加入驗證邏輯
   - 在 `analyze-food-text` API 中加入驗證邏輯
   - 實現「資料庫優先，AI 備用」的策略

2. **驗證和修正邏輯**
   ```typescript
   // 偽代碼
   for (const food of aiGeneratedFoods) {
     const dbData = await calculateNutritionFromDatabase(food.name, food.portion)
     if (dbData) {
       // 使用資料庫數據
       food.calories = dbData.calories
       food.protein = dbData.protein
       // ...
     } else {
       // 使用 AI 估算（當前做法）
     }
   }
   ```

### 階段 4：擴展和優化（第 5-8 週）

1. **擴展資料庫**
   - 增加到 200-300 個食物
   - 持續收集用戶反饋

2. **優化匹配邏輯**
   - 改進模糊匹配算法
   - 處理更多名稱變體

3. **建立維護機制**
   - 定期驗證數據準確性
   - 更新過時的數據

---

## 5. 優先級食物列表（建議）

### 優先級 1：最常見的 50-100 個食物

#### 茶餐廳常見食物（30 個）
- 沙嗲牛肉麵
- 餐蛋麵
- 牛腩麵
- 雲吞麵
- 星洲炒米
- 乾炒牛河
- 白切雞飯
- 叉燒飯
- 燒鴨飯
- 雞扒飯
- 豬扒飯
- 魚蛋河粉
- 魚蛋米粉
- 通粉（番茄、清湯）
- 公仔麵
- 即食麵
- 碟頭飯
- 焗飯
- 炒飯
- 炒麵
- 湯飯
- 粥（白粥、皮蛋瘦肉粥）
- 多士（牛油、奶醬、花生醬）
- 西多士
- 煎蛋
- 炒蛋
- 烚蛋
- 灼菜
- 白飯
- 炒菜

#### 常見飲品（15 個）
- 熱奶茶
- 凍奶茶
- 熱檸檬茶
- 凍檸檬茶
- 熱咖啡
- 凍咖啡
- 熱鴛鴦
- 凍鴛鴦
- 熱檸檬水
- 凍檸檬水
- 可樂
- 無糖可樂
- 豆漿
- 無糖豆漿
- 檸檬水

#### 港式點心（10 個）
- 蝦餃
- 燒賣
- 叉燒包
- 流沙包
- 腸粉
- 鳳爪
- 排骨
- 牛肉球
- 春卷
- 蘿蔔糕

#### 其他常見食物（15 個）
- 白切雞
- 燒鴨
- 叉燒
- 燒肉
- 白切雞
- 蒸蛋
- 蒸水蛋
- 蒸魚
- 白切雞
- 其他...

---

## 6. 數據驗證和質量控制

### 6.1 數據驗證規則

1. **營養素一致性檢查**
   - 卡路里 = 蛋白質×4 + 碳水化合物×4 + 脂肪×9（誤差 ±10 卡）

2. **份量合理性檢查**
   - 標準份量應該在合理範圍內（例如：1碗麵 200-400g）

3. **數據來源標註**
   - 所有數據必須標註來源
   - 記錄信心等級

### 6.2 質量控制流程

1. **輸入驗證**
   - 檢查必填字段
   - 驗證數據格式
   - 檢查營養素一致性

2. **人工審核**
   - 優先級 1 食物需要人工審核
   - 檢查份量對照是否合理

3. **定期更新**
   - 每季度檢查數據準確性
   - 根據用戶反饋更新數據

---

## 7. API 整合策略

### 7.1 「資料庫優先，AI 備用」策略

```typescript
async function getFoodNutrition(foodName: string, portion: string) {
  // 1. 優先使用資料庫
  const dbData = await calculateNutritionFromDatabase(foodName, portion)
  if (dbData) {
    return {
      source: 'database',
      data: dbData
    }
  }
  
  // 2. 如果資料庫沒有，使用 AI 估算
  const aiData = await estimateNutritionWithAI(foodName, portion)
  return {
    source: 'ai',
    data: aiData
  }
}
```

### 7.2 在現有 API 中整合

**`/api/smart-meal-recommendation`**
- AI 生成餐單後，檢查每個食物是否在資料庫中
- 如果在，用資料庫數據替換 AI 估算
- 驗證營養素一致性

**`/api/analyze-food-text`**
- 分析文字後，檢查識別的食物是否在資料庫中
- 如果在，用資料庫數據替換 AI 估算

---

## 8. 維護和更新

### 8.1 數據維護

1. **定期檢查**
   - 每月檢查數據使用情況
   - 識別缺失的常見食物

2. **用戶反饋**
   - 建立用戶反饋機制
   - 收集「數據不準確」的報告
   - 優先修復高頻問題

3. **數據更新**
   - 如果 CFS 更新數據，同步更新
   - 根據實際使用情況調整份量對照

### 8.2 版本控制

- 記錄數據變更歷史
- 保留舊版本數據（用於回滾）
- 標註數據版本號

---

## 9. 預期效果

### 9.1 準確性提升

- **當前**：AI 估算，準確率約 70-80%
- **目標**：資料庫 + AI，準確率提升到 85-95%

### 9.2 覆蓋率

- **階段 1**：50-100 個食物，覆蓋 60-70% 的常見場景
- **階段 2**：200-300 個食物，覆蓋 80-85% 的常見場景
- **階段 3**：500+ 個食物，覆蓋 90%+ 的常見場景

### 9.3 用戶體驗

- 更準確的卡路里估算
- 更可靠的營養素數據
- 減少「明顯不準確」的投訴

---

## 10. 風險和挑戰

### 10.1 技術挑戰

1. **名稱匹配**
   - 處理名稱變體（例如：沙嗲 vs 沙爹）
   - 處理不同寫法（例如：簡體 vs 繁體）

2. **份量標準化**
   - 不同餐廳的「1碗」可能不同
   - 需要建立合理的標準

### 10.2 維護成本

1. **數據輸入**
   - 手動輸入耗時
   - 需要持續維護

2. **數據更新**
   - 需要定期檢查和更新
   - 需要處理數據變更

### 10.3 法律風險

1. **數據使用**
   - 確保遵守 CFS 的使用條款
   - 標註數據來源

2. **版權問題**
   - 避免直接複製數據庫結構
   - 使用數據而非結構

---

## 11. 下一步行動

### 立即行動（本週）

1. ✅ 建立 Supabase 表結構
2. ✅ 建立標準份量對照表（JavaScript 對象）
3. ✅ 實現 `calculateNutritionFromDatabase` 函數

### 短期行動（2-4 週）

1. 手動輸入 50-100 個優先級 1 食物
2. 在 API 中整合驗證邏輯
3. 測試和優化

### 中期行動（1-2 個月）

1. 擴展到 200-300 個食物
2. 建立用戶反饋機制
3. 持續優化匹配邏輯

---

## 附錄

### A. 參考資源

- 香港食物安全中心營養資料查詢：https://www.cfs.gov.hk/tc_chi/nutrient/search1.php
- 營養標籤計算器：https://www.cfs.gov.hk/tc_chi/programme/programme_nifl/nlc-user_guide.html

### B. 數據輸入模板

```json
{
  "name_zh": "食物中文名稱",
  "name_en": "Food English Name",
  "name_variants": ["變體1", "變體2"],
  "category": "食物類別",
  "calories_per_100g": 150,
  "protein_per_100g": 8.5,
  "carbs_per_100g": 18.0,
  "fat_per_100g": 4.2,
  "fiber_per_100g": 1.5,
  "standard_portions": {
    "1碗": 300,
    "1碟": 350
  },
  "source": "CFS",
  "confidence_level": "high"
}
```

### C. SQL 查詢示例

```sql
-- 查找食物（支持模糊匹配）
SELECT * FROM hk_food_database
WHERE name_zh ILIKE '%沙嗲%'
   OR '沙嗲' = ANY(name_variants);

-- 計算實際營養素
SELECT 
  name_zh,
  calories_per_100g,
  standard_portions->>'1碗' as portion_grams,
  (calories_per_100g::DECIMAL / 100) * (standard_portions->>'1碗')::INTEGER as actual_calories
FROM hk_food_database
WHERE name_zh ILIKE '%沙嗲牛肉麵%';
```

---

**文檔版本：** 1.0  
**最後更新：** 2026-01-23  
**維護者：** SeekMeal Development Team
