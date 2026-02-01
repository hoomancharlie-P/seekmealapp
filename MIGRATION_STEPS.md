# SeekMeal 遷移手動步驟指南

## 📋 步驟概述

請按照以下順序執行三個步驟：
1. ✅ 目錄重命名
2. ✅ Git 處理（可選）
3. ✅ 測試驗證

---

## 步驟 1: 目錄重命名

### 方法 A：使用 Terminal（推薦）

1. **打開 Terminal（終端機）**

2. **執行以下命令：**

```bash
# 1. 進入 Projects 目錄
cd /Users/charliechan/Desktop/Personal/Projects

# 2. 確認當前目錄中有 sikmeh 文件夾
ls -la | grep sikmeh

# 3. 重命名目錄（從 sikmeh 改為 seekmeal）
mv sikmeh seekmeal

# 4. 確認重命名成功
ls -la | grep seekmeal

# 5. 進入新目錄
cd seekmeal

# 6. 確認當前位置
pwd
# 應該顯示：/Users/charliechan/Desktop/Personal/Projects/seekmeal
```

### 方法 B：使用 Finder（圖形界面）

1. **打開 Finder**
2. **導航到：** `/Users/charliechan/Desktop/Personal/Projects/`
3. **找到 `sikmeh` 文件夾**
4. **右鍵點擊 → 重新命名**
5. **輸入新名稱：** `seekmeal`
6. **按 Enter 確認**

---

## 步驟 2: Git 處理（可選）

### 情況 A：如果你想要使用 Git 版本控制

#### 2.1 初始化 Git 倉庫

```bash
# 確保你在 seekmeal 目錄中
cd /Users/charliechan/Desktop/Personal/Projects/seekmeal

# 初始化 Git 倉庫
git init

# 查看狀態
git status

# 添加所有文件
git add .

# 創建首次提交（保存當前狀態作為 V1 備份）
git commit -m "SikMeh V1 - before migration to SeekMeal"

# 創建 V1 分支（備份當前狀態）
git checkout -b v1-sikmeh

# 回到主分支
git checkout -b main

# 添加遷移後的更改
git add .
git commit -m "SeekMeal v2.0.0 - Migration from SikMeh"
```

#### 2.2 如果需要連接到遠端倉庫（GitHub/GitLab）

```bash
# 方法 1: 重命名現有倉庫
# 先在 GitHub/GitLab 上重命名倉庫為 "seekmeal"
# 然後更新本地遠端 URL
git remote add origin https://github.com/yourusername/seekmeal.git
# 或
git remote set-url origin https://github.com/yourusername/seekmeal.git

# 推送代碼
git push -u origin main
```

```bash
# 方法 2: 創建新倉庫
# 1. 在 GitHub/GitLab 上創建新倉庫 "seekmeal"
# 2. 執行以下命令：
git remote add origin https://github.com/yourusername/seekmeal.git
git push -u origin main
```

### 情況 B：如果暫時不需要 Git

**可以跳過此步驟，之後需要時再初始化。**

---

## 步驟 3: 測試驗證

### 3.1 更新 package-lock.json

```bash
# 確保你在 seekmeal 目錄中
cd /Users/charliechan/Desktop/Personal/Projects/seekmeal

# 運行 npm install（這會自動更新 package-lock.json 中的名稱）
npm install
```

### 3.2 清理舊構建

```bash
# 刪除 .next 目錄（Next.js 構建緩存）
rm -rf .next
```

### 3.3 運行開發服務器

```bash
# 啟動開發服務器
npm run dev
```

### 3.4 驗證檢查清單

打開瀏覽器訪問：http://localhost:3000

檢查以下項目：

- [ ] **頁面標題**：瀏覽器標籤頁應該顯示 "SeekMeal - 尋喵餐單"
- [ ] **控制台無錯誤**：打開瀏覽器開發者工具（F12），Console 標籤應該沒有紅色錯誤
- [ ] **頁面正常顯示**：主頁面正常加載
- [ ] **Onboarding 頁面**：訪問 `/onboarding`，應該顯示 "歡迎使用 SeekMeal"
- [ ] **所有功能正常**：測試主要功能是否正常運作

### 3.5 檢查 package-lock.json

```bash
# 確認 package-lock.json 中的名稱已更新
grep -A 2 '"name"' package-lock.json | head -3
# 應該顯示 "name": "seekmeal"
```

---

## 🎯 完整執行範例（複製貼上）

如果你想一次性執行所有步驟，可以複製以下命令：

```bash
# ============================================
# 步驟 1: 目錄重命名
# ============================================
cd /Users/charliechan/Desktop/Personal/Projects
mv sikmeh seekmeal
cd seekmeal

# ============================================
# 步驟 2: Git 初始化（可選）
# ============================================
git init
git add .
git commit -m "SeekMeal v2.0.0 - Migration from SikMeh"

# ============================================
# 步驟 3: 測試驗證
# ============================================
npm install
rm -rf .next
npm run dev
```

---

## ❓ 常見問題

### Q: 如果 mv 命令失敗（權限問題）？

**A:** 使用 `sudo`（需要管理員密碼）：
```bash
sudo mv sikmeh seekmeal
```

或者使用 Finder 圖形界面重命名。

### Q: 如果 npm install 失敗？

**A:** 檢查以下幾點：
1. 確保 Node.js 已安裝：`node --version`
2. 確保 npm 已安裝：`npm --version`
3. 嘗試清理緩存：`npm cache clean --force`
4. 刪除 node_modules 重新安裝：`rm -rf node_modules && npm install`

### Q: 如果開發服務器無法啟動？

**A:** 
1. 檢查端口 3000 是否被占用
2. 查看錯誤訊息
3. 嘗試使用其他端口：`npm run dev -- -p 3001`

### Q: Git 相關錯誤？

**A:**
- 如果 `git init` 失敗，檢查是否有 `.git` 目錄存在
- 如果推送失敗，檢查遠端 URL 是否正確
- 如果沒有遠端倉庫，可以暫時跳過 Git 步驟

---

## ✅ 完成檢查清單

執行完所有步驟後，確認：

- [ ] 目錄已重命名為 `seekmeal`
- [ ] Git 已初始化（如適用）
- [ ] `npm install` 執行成功
- [ ] `npm run dev` 可以正常啟動
- [ ] 瀏覽器顯示正確的頁面標題
- [ ] 沒有控制台錯誤
- [ ] 所有功能正常運作

---

## 📝 下一步

完成遷移後，可以開始：

1. **Week 2: 貓角色系統開發**
   - 設計貓的視覺狀態
   - 實現基礎組件
   - 整合到主頁面

2. **查看開發計劃**
   - 參考 `MIGRATION.md` 中的時間線
   - 開始 Week 2-3 的開發任務

3. **設置開發環境**
   - 配置 Supabase（如果還沒有）
   - 配置環境變數
   - 設置開發工具

---

**需要幫助？** 如果遇到任何問題，請查看錯誤訊息或參考相關文檔。
