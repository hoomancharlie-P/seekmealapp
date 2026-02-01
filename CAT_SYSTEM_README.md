# 貓角色系統開發文檔

## 📋 Week 2 開發進度

### ✅ 已完成的功能

#### 1. 基礎架構
- ✅ **類型定義** (`types/cat.ts`)
  - CatState: 4 個狀態（initial, familiar, intimate, partner）
  - CatExpression: 10 個表情
  - CatInteractionType: 互動類型

- ✅ **表情系統** (`lib/cat/expressions.ts`)
  - 10 個基礎表情配置
  - 每個表情包含：emoji、動畫、持續時間、描述
  - 根據互動類型自動選擇表情

- ✅ **狀態計算** (`lib/cat/stateCalculator.ts`)
  - 活躍度分數計算（基於記錄頻率、達標情況、使用頻率、使用時長）
  - 狀態自動判定（根據活躍度分數）
  - 各種分數計算函數

#### 2. 組件實現
- ✅ **Cat 組件** (`components/Cat.tsx`)
  - 支持 3 種尺寸（sm, md, lg）
  - 動畫系統（CSS animations）
  - 表情自動切換
  - 點擊互動

- ✅ **useCat Hook** (`hooks/useCat.ts`)
  - 狀態管理
  - 表情管理
  - 互動觸發
  - 自動計算貓的狀態

#### 3. 頁面整合
- ✅ **主頁面整合** (`app/page.tsx`)
  - Header 區域顯示貓（右上角）
  - Sticky Bar 顯示貓（滾動時）
  - 記錄餐單時觸發互動
  - 達到目標時觸發互動

---

## 🎨 貓的表情系統

### 10 個基礎表情

| 表情 | Emoji | 觸發條件 | 動畫 |
|------|-------|---------|------|
| neutral | 🐱 | 默認狀態 | 呼吸動畫 |
| happy | 😸 | 記錄一餐後 | 舔爪子（3秒） |
| satisfied | 😌 | 達到目標後 | 伸懶腰（4秒） |
| excited | 😻 | 連續達標3天 | 主動靠近（5秒） |
| sleepy | 😴 | 晚上時段 | 打哈欠（持續） |
| curious | 🤔 | 編輯餐單時 | 觀察（3秒） |
| indifferent | 😑 | 輕微超标 | 打哈欠（3秒） |
| turned_away | 😾 | 嚴重超标 | 轉身（4秒） |
| reminder | 👀 | 忘記記錄 | 看時鐘（4秒） |
| missing | 😿 | 長時間不打開 | 回頭看（5秒） |

---

## 📊 狀態系統

### 4 個狀態階段

1. **initial（初見）** - 活躍度 0-30
   - Day 1-3
   - 被動，觀察為主

2. **familiar（熟悉）** - 活躍度 31-60
   - Day 4-14
   - 開始有主動互動

3. **intimate（親密）** - 活躍度 61-90
   - Day 15-30
   - 主動互動，表情豐富

4. **partner（伙伴）** - 活躍度 91-100
   - Day 30+
   - 健康狀態，精神飽滿

### 活躍度計算公式

```
總活躍度 = (記錄頻率 × 40%) + (達標情況 × 30%) + (使用頻率 × 20%) + (使用時長 × 10%)
```

---

## 🔧 使用方式

### 在組件中使用

```typescript
import Cat from '@/components/Cat'
import { useCat } from '@/hooks/useCat'

// 在組件中
const {
  catState,
  currentExpression,
  triggerInteraction,
  isOverGoal,
  overGoalPercentage
} = useCat({
  meals,
  consumedCalories: consumedNutrition.calories,
  calorieTarget,
  lastLoginAt: null,
  averageSessionDuration: 0
})

// 顯示貓
<Cat
  state={catState}
  expression={currentExpression}
  size="md"
  onClick={() => triggerInteraction('open-app')}
/>
```

### 觸發互動

```typescript
// 記錄餐單後
triggerInteraction('record-meal')

// 達到目標後
triggerInteraction('reach-goal', {
  isOverGoal: false,
  overGoalPercentage: 100
})

// 編輯餐單時
triggerInteraction('edit-meal')
```

---

## 📁 文件結構

```
seekmeal/
├── types/
│   └── cat.ts                    # 類型定義
├── lib/
│   └── cat/
│       ├── expressions.ts        # 表情配置
│       └── stateCalculator.ts   # 狀態計算邏輯
├── components/
│   └── Cat.tsx                   # 貓組件
├── hooks/
│   └── useCat.ts                 # 貓狀態管理 Hook
└── app/
    └── page.tsx                   # 主頁面（已整合）
```

---

## 🚀 下一步開發（Week 3）

### 待完成功能

1. **互動增強**
   - [ ] 編輯餐單時的互動（curious）
   - [ ] 忘記記錄時的提醒（reminder）
   - [ ] 長時間不打開的互動（missing）

2. **狀態持久化**
   - [ ] 保存貓狀態到 localStorage
   - [ ] 從數據庫讀取歷史數據
   - [ ] 計算連續達標天數

3. **動畫優化**
   - [ ] 更流暢的動畫效果
   - [ ] 自定義動畫（CSS keyframes）
   - [ ] 性能優化

4. **視覺優化**
   - [ ] 不同狀態的視覺差異（體型、顏色）
   - [ ] 更精緻的表情設計
   - [ ] 響應式適配

---

## 🐛 已知問題

- 連續達標天數目前是簡化版，需要從數據庫獲取真實數據
- 使用時長追蹤需要實現會話追蹤功能
- 動畫效果可以進一步優化

---

## 📝 測試建議

1. **功能測試**
   - 記錄餐單，檢查貓是否顯示 happy 表情
   - 達到目標，檢查貓是否顯示 satisfied 表情
   - 超標，檢查貓是否顯示 turned_away 表情

2. **狀態測試**
   - 記錄多個餐單，檢查狀態是否提升
   - 連續使用多天，檢查狀態變化

3. **動畫測試**
   - 檢查動畫是否流暢
   - 檢查動畫持續時間是否正確
   - 檢查動畫結束後是否恢復正常狀態

---

**開發狀態：** ✅ Week 2 基礎功能已完成  
**下一步：** Week 3 - 互動增強和優化
