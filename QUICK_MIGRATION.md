# SeekMeal 快速遷移指南（無 Git 版本）

## ✅ 你只需要做兩件事：

### 步驟 1: 在 Finder 中重命名文件夾

1. **打開 Finder**
2. **導航到：** `/Users/charliechan/Desktop/Personal/Projects/`
3. **找到 `sikmeh` 文件夾**
4. **右鍵點擊 → 重新命名（或選中後按 Enter）**
5. **輸入新名稱：** `seekmeal`
6. **按 Enter 確認**

✅ 完成！

---

### 步驟 2: 測試項目運行（在 Terminal 中）

重命名後，打開 Terminal 執行：

```bash
# 進入新目錄
cd /Users/charliechan/Desktop/Personal/Projects/seekmeal

# 更新 package-lock.json（會自動更新項目名稱）
npm install

# 清理舊構建
rm -rf .next

# 啟動開發服務器
npm run dev
```

然後打開瀏覽器訪問：http://localhost:3000

檢查：
- [ ] 瀏覽器標籤頁標題顯示 "SeekMeal - 尋喵餐單"
- [ ] 頁面正常顯示
- [ ] 沒有錯誤訊息

✅ 完成！

---

## 🎉 就這麼簡單！

**不需要做的事情：**
- ❌ Git 初始化（還沒有使用 Git）
- ❌ GitHub 相關操作（還沒有上傳）
- ❌ 創建分支（還沒有 Git）

**之後如果要用 Git：**
- 可以隨時在 `seekmeal` 目錄中執行 `git init`
- 之後再上傳到 GitHub

---

## 總結

1. ✅ Finder 重命名：`sikmeh` → `seekmeal`
2. ✅ Terminal 測試：`cd seekmeal && npm install && npm run dev`

就這兩步！🎯
