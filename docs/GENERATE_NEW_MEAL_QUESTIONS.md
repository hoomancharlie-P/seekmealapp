# 「生成新一餐」問題列表（4 題，對齊 smart-meal-recommendation API）

入口：餐卡 → 「生成新一餐」  
共 4 題，菜系可選「其他」並搭配輸入欄。

**UI 要求：所有問題放在同一頁、同一選單，一選完就送 API；不要「下一步」分步。**

---

## 問題 1：外食／自煮？（必選，單選）

| 選項文案 | 傳給 API 的參數 |
|----------|-----------------|
| **外食** | `location: 'eating_out'` |
| **自己煮** | `location: 'home_cook'` |

---

## 問題 2：想吃甚麼菜式？（必選，單選；選「其他」時顯示輸入欄）

| 選項文案 | 傳給 API 的參數 |
|----------|-----------------|
| **港式** | `cuisines: ['hk']` |
| **韓式** | `cuisines: ['korean']` |
| **日式** | `cuisines: ['japanese']` |
| **西式** | `cuisines: ['western']` |
| **泰式** | `cuisines: ['thai']` |
| **其他** | `cuisines: ['other']`，並傳 `customInput: '<用戶輸入>'` |

選「其他」時：顯示一欄文字輸入，內容傳給 API 的 `customInput`。

---

## 問題 3：你現在的心情／口味？（必選，單選）

| 選項文案 | 傳給 API 的參數 |
|----------|-----------------|
| **輕盈健康** | `style: 'healthy'`, `taste: 'light'` |
| **豐富飽足** | `style: 'filling'`, `taste: 'heavy'` |
| **暖心療癒** | `style: 'comfort'` |
| **試新嘢** | `style: 'explore'` |
| **隨便** | `style: 'random'`, `taste: 'random'` |

---

## 問題 4：主食類型想點？（必選，單選）

| 選項文案 | 傳給 API 的參數 |
|----------|-----------------|
| **飯類** | `foodType: 'rice'` |
| **麵類** | `foodType: 'noodles'` |
| **湯類** | `foodType: 'soup'` |
| **輕食** | `foodType: 'light'` |

---

## API 參數彙總

- **mode**: `'quick'`
- **mealType**: 從餐卡帶入
- **location**: 問題 1
- **cuisines**: 問題 2（選「其他」時 `['other']`，並用 `customInput` 傳用戶輸入）
- **style**, **taste**: 問題 3
- **foodType**: 問題 4
- **customInput**: 僅問題 2 選「其他」時有值
