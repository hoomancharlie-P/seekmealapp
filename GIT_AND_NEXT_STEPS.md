# Part 3: Git 處理

## 建議：選 **選項 A**（刪除舊 Git，建立新倉庫）

**原因：**

- seekmeal-app 是「從 Web 複製出來、要獨立發展的 Mobile 專案」，與 Web 版 (seekmeal) 分開維護較清楚。
- 新專案用全新 Git 歷史，之後要推到新 repo（例如 `seekmeal-app`）時不會帶一整段 Next.js 的 commit。
- Web 備份已完整保留在 `../seekmeal`，不需要靠 seekmeal-app 的 Git 來保留歷史。

**在 seekmeal-app 目錄執行：**

```bash
cd seekmeal-app

# 刪除舊 Git，建立新的
rm -rf .git
git init
git add .
git commit -m "Initial commit - Mobile app project"
```

---

## 何時才考慮選項 B（保留 Git 歷史）

- 若你希望 **同一個 repo 裡** 同時有 Web 與 Mobile，用分支區分（例如 `main` = Web，`mobile-app` = RN），可選 B。
- 若 seekmeal-app 會是 **獨立的 GitHub/GitLab repo**，建議用選項 A。

---

# Part 4: 驗證複製成功

在 seekmeal-app 目錄執行：

```bash
chmod +x verify-setup.sh
./verify-setup.sh
```

或：

```bash
bash verify-setup.sh
```

通過後會看到「✅ 專案複製成功！可以開始轉換。」

---

# Part 5: 下一步準備（轉換到 React Native）

以下為轉換時會用到的清單，可逐步執行。

## 1. 需要安裝的新依賴（React Native 相關）

| 套件 | 用途 |
|------|------|
| `react-native` | RN 核心 |
| `react-native-safe-area-context` | 安全區域（劉海、底欄） |
| `react-native-screens` | 原生導航畫面 |
| `@react-navigation/native` | 導航核心 |
| `@react-navigation/native-stack` | 堆疊導航 |
| `@react-navigation/bottom-tabs` | 底部 Tab（對應現有 BottomNav） |
| `react-native-gesture-handler` | 手勢（導航依賴） |
| `react-native-reanimated` | 動畫（可選，替代 framer-motion） |
| `@supabase/supabase-js` | 保留，Supabase 客戶端（RN 用同一套） |
| `react-native-dotenv` 或 `react-native-config` | 環境變量（替代 Next 的 process.env） |

**若用 Expo：**

- 可改為 `npx create-expo-app` 或 `expo init` 後再把業務代碼遷入，依賴會由 Expo 管理（如 `expo`、`expo-status-bar` 等）。

## 2. 需要移除的 Web / Next 專用依賴

| 套件 | 原因 |
|------|------|
| `next` | Web 框架，RN 不用 |
| `react-dom` | Web 渲染，RN 用 react-native 渲染 |
| `@supabase/ssr` | 服務端用，RN 僅需客戶端 |
| `eslint-config-next` | Next 專用 ESLint 設定 |
| `recharts` | 依賴 DOM/Canvas，需改用 RN 圖表（如 `react-native-chart-kit`、`victory-native`） |
| `framer-motion` | 主要為 Web，RN 改用 `react-native-reanimated` |
| `react-hot-toast` | Web DOM，RN 改用 `react-native-toast-message` 或類似 |
| `canvas-confetti` | Web Canvas，RN 需找替代或暫不實作 |
| `autoprefixer`、`postcss`、`tailwindcss` | 若不用 NativeWind，可移除；若用 NativeWind 則保留部分設定 |

**建議**：先建立 RN 專案骨架並能跑起來，再分批移除上述套件、替換成 RN 版。

## 3. 需要新增的配置檔案

| 檔案 | 用途 |
|------|------|
| `metro.config.js` | Metro bundler 設定（RN 預設有，必要時改） |
| `babel.config.js` | Babel 設定（RN 預設有；若用 reanimated 需加 plugin） |
| `app.json` 或 `app.config.js` | 若用 Expo：App 名稱、版號、圖示等 |
| `react-native.config.js` | 若用純 RN CLI：原生專案路徑、資源等 |
| `index.js` | RN 入口（註冊 App 根元件） |
| `App.tsx` | 根元件（導航、主題等） |

## 4. 建議執行順序

1. **驗證**：執行 `./verify-setup.sh`，確認複製與清理成功。
2. **Git**：在 seekmeal-app 執行選項 A（刪除 .git → `git init` → 第一個 commit）。
3. **建立 RN 專案**：  
   - 若用 **Expo**：可 `npx create-expo-app@latest seekmeal-rn --template tabs`，再把 app、components、lib 等逐步遷入。  
   - 若用 **React Native CLI**：`npx @react-native-community/cli init SeekMealApp`，再遷入代碼。
4. **依賴**：在 RN 專案中安裝上面「新依賴」、之後再逐步移除「Web 專用依賴」。
5. **配置**：依選用的 RN/Expo 範本補上或調整上述配置檔案。

完成 Part 3（Git）和 Part 4（驗證）後，就可以按 Part 5 清單開始轉換。
