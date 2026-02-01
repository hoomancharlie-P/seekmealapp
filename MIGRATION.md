# SeekMeal 項目遷移記錄

## 遷移日期
2025年1月

## 遷移內容

### ✅ 已完成的步驟

1. **代碼文件更新**
   - ✅ `package.json` - 名稱從 "sikmeh" 更新為 "seekmeal"，版本更新為 "2.0.0"
   - ✅ `app/layout.tsx` - metadata 標題和描述已更新
   - ✅ `README.md` - 完整的品牌信息更新
   - ✅ `SETUP.md` - 設定指南已更新
   - ✅ `app/onboarding/page.tsx` - "SikMeh" 文本已更新為 "SeekMeal"

2. **品牌信息更新**
   - 英文名稱：SeekMeal
   - 中文名稱：尋喵餐 / 尋喵
   - Slogan：同 Cat Cat 一齊尋喵你嘅完美餐單
   - 版本：2.0.0

### ⚠️ 需要手動完成的步驟

#### 1. Git 倉庫處理（如果使用 Git）

由於項目目前沒有 Git 倉庫，建議：

**選項 A：初始化 Git 並創建 V1 分支**
```bash
cd /Users/charliechan/Desktop/Personal/Projects/sikmeh

# 初始化 Git
git init
git add .
git commit -m "SikMeh V1 - initial version"

# 創建 V1 分支
git checkout -b v1-sikmeh
git checkout -b main  # 或 master

# 如果已有遠端倉庫，重命名後推送
git remote set-url origin <new-repo-url>
```

**選項 B：備份當前版本**
```bash
# 複製項目到備份目錄
cd /Users/charliechan/Desktop/Personal/Projects
cp -r sikmeh sikmeh-v1-backup
```

#### 2. 重命名項目目錄

```bash
cd /Users/charliechan/Desktop/Personal/Projects
mv sikmeh seekmeal
cd seekmeal
```

#### 3. 更新 package-lock.json

運行以下命令會自動更新 package-lock.json：

```bash
cd seekmeal
npm install
```

#### 4. 測試項目運行

```bash
# 清理構建
rm -rf .next

# 運行開發服務器
npm run dev
```

驗證以下內容：
- [ ] 頁面標題顯示 "SeekMeal - 尋喵餐單"
- [ ] 沒有控制台錯誤
- [ ] 所有功能正常運作
- [ ] Onboarding 頁面顯示 "SeekMeal"

#### 5. Git 遠端倉庫（如果使用）

如果在 GitHub/GitLab 上需要重命名倉庫：

1. 在 GitHub/GitLab 上重命名倉庫為 `seekmeal`
2. 更新本地遠端 URL：
```bash
git remote set-url origin https://github.com/yourusername/seekmeal.git
git push -u origin main
```

## 遷移檢查清單

- [x] package.json 已更新
- [x] app/layout.tsx 已更新
- [x] README.md 已更新
- [x] SETUP.md 已更新
- [x] app/onboarding/page.tsx 已更新
- [ ] 項目目錄已重命名為 `seekmeal`
- [ ] package-lock.json 已更新（運行 npm install 後）
- [ ] Git 倉庫已處理（如適用）
- [ ] 項目可以正常運行
- [ ] 所有測試通過

## 後續步驟

1. 完成手動步驟（目錄重命名、Git 處理）
2. 測試項目運行
3. 開始 Week 2 開發：貓角色系統

## 注意事項

- package-lock.json 中的 "name" 字段會在下一次運行 `npm install` 時自動更新
- 如果使用第三方服務（如分析工具），可能需要更新應用名稱
- 檢查環境變數文件（.env.local）是否有應用名稱相關的配置需要更新
