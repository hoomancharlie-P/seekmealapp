# 如何執行 Part 5：轉換到 React Native

依照以下順序在終端機執行（都在 **seekmeal-app** 目錄，除非另有說明）。

---

## 前置：讓驗證通過（可選）

`verify-setup.sh` 會檢查 `node_modules` 和 `.next` 已刪除。若你還沒清理：

```bash
cd /Users/charliechan/Desktop/Personal/Projects/seekmeal-app
rm -rf node_modules .next
```

若還沒有 `.env.local`，可從範例複製（驗證會提醒，不擋通過）：

```bash
cp .env.example .env.local
# 再編輯 .env.local 填上真實值
```

---

## Step 1：驗證複製成功

```bash
cd /Users/charliechan/Desktop/Personal/Projects/seekmeal-app
chmod +x verify-setup.sh
./verify-setup.sh
```

看到 **「✅ 專案複製成功！可以開始轉換。」** 即可繼續。

---

## Step 2：Git 重設（選項 A）

在 **seekmeal-app** 目錄執行：

```bash
cd /Users/charliechan/Desktop/Personal/Projects/seekmeal-app
rm -rf .git
git init
git add .
git commit -m "Initial commit - Mobile app project"
```

之後若要推到 GitHub：加 remote、push 即可。

---

## Step 3：建立 React Native 專案（二選一）

### 方式 A：用 Expo（建議，較簡單）

在 **上一層目錄**（不要進 seekmeal-app）建立新專案，例如：

```bash
cd /Users/charliechan/Desktop/Personal/Projects
npx create-expo-app@latest seekmeal-rn --template tabs
cd seekmeal-rn
```

之後照下面 **Step 6 詳解** 把 seekmeal-app 的業務代碼逐步遷入 seekmeal-rn。

### 方式 B：用 React Native CLI

```bash
cd /Users/charliechan/Desktop/Personal/Projects
npx @react-native-community/cli init SeekMealApp
cd SeekMealApp
```

同樣是「新專案 + 逐步遷入代碼」，不是直接在 seekmeal-app 裡改。

---

## Step 4：在 RN 專案中安裝依賴

進入 **Step 3 建立的那個專案目錄**（seekmeal-rn 或 SeekMealApp），然後：

```bash
# 導航與必要套件
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context react-native-gesture-handler react-native-reanimated

# Supabase（與現在相同）
npm install @supabase/supabase-js

# 環境變量（擇一）
npm install react-native-dotenv
# 或: npm install react-native-config
```

若用 **React Native CLI** 而非 Expo，把 `npx expo install` 改成 `npm install` 即可。

---

## Step 5：配置檔案

- **Expo**：會有 `app.json` / `app.config.js`，改 App 名稱、版號等即可。
- **Reanimated**：在 `babel.config.js` 加上 `react-native-reanimated/plugin`（官方文件有說明）。
- 入口：Expo 預設有 `App.tsx` 與 `index.js`；在裡面掛上 React Navigation 與你的畫面。

---

## Step 6 詳解：如何「逐步遷入」並改成 RN 寫法

「逐步遷入」的意思是：**先複製能用的，再一個一個畫面／元件改寫成 RN**，不是一次全部搬過去。建議順序如下。

### 6.1 先搬「幾乎不用改」的

| 來源（seekmeal-app） | 搬到 seekmeal-rn | 要改什麼 |
|----------------------|------------------|----------|
| `types/`             | `types/`         | 通常不用改，TypeScript 型別可直接用。 |
| `lib/supabase/client.ts` | `lib/supabase/client.ts` | 若 RN 用同一套 `@supabase/supabase-js`，可先照搬；環境變量改用 `react-native-dotenv` 讀取。 |
| `lib/meals.ts`、`lib/adjustMealPlan.ts`、`lib/ai-json.ts`、`lib/anthropic/`、`lib/cat/` | 同名路徑 | 先複製；裡面若有 `fetch('/api/...')` 要改成呼叫「真實 API 網址」（見 6.3）。 |

**不要搬**：`lib/supabase/server.ts`、`lib/supabase-server.ts`（Next 服務端用，RN 不需要）。

### 6.2 畫面（app/）→ 對應成 RN 的 Screen

Next 是「一個資料夾一個路由」，Expo + React Navigation 是「一個元件一個 Screen」。對應關係範例：

| Next（seekmeal-app） | RN（seekmeal-rn） |
|----------------------|-------------------|
| `app/page.tsx`       | 首頁 Screen（例如 `screens/HomeScreen.tsx`） |
| `app/auth/page.tsx`  | `screens/AuthScreen.tsx` |
| `app/coach/page.tsx` | `screens/CoachScreen.tsx` |
| `app/history/page.tsx` | `screens/HistoryScreen.tsx` |
| …其他 `app/xxx/page.tsx` | `screens/XxxScreen.tsx` |

**執行方式**：

1. 在 seekmeal-rn 裡建 `screens/` 資料夾（若用 Expo tabs 範本，可能已有類似結構）。
2. 一次選一個 Next 的 `app/xxx/page.tsx`，**複製內容**到對應的 `screens/XxxScreen.tsx`。
3. 在該檔案裡做改寫（見下方「要改什麼」）。

**每個畫面檔要改的**：

- 刪掉 `'use client'`、Next 的 `useRouter`、`Link`。
- 改用 React Navigation：`import { useNavigation } from '@react-navigation/native'`，用 `navigation.navigate('ScreenName')` 取代 `router.push()`。
- 把 **DOM / HTML** 改成 **RN 元件**：
  - `<div>` → `<View>`
  - `<span>`、`<p>` → `<Text>`
  - `<button>`、`<a>` → `<Pressable>` 或 `<TouchableOpacity>`
  - `className="..."`（Tailwind）→ `style={...}` 或 StyleSheet / NativeWind。
- 若有 `recharts`、`canvas-confetti`、`react-hot-toast`，改用 RN 替代（如 `victory-native`、`react-native-toast-message`），或先拿掉該功能再補。

### 6.3 API 路由（app/api/）怎麼辦？

Next 的 `app/api/xxx/route.ts` 是**跑在伺服器上**的，React Native 只是手機 App，**沒有伺服器**。所以有兩種做法：

- **做法 A（建議）**：把現在的 Next 專案（seekmeal）**部署成一個後端**（例如 Vercel），RN App 用 `fetch('https://你的網址/api/...')` 呼叫同一個 API。  
  - 遷入時：從 seekmeal-app 的 `lib/` 或畫面裡，把原本的 `fetch('/api/xxx')` 改成 `fetch('https://你的部署網址/api/xxx')`（網址可放在 `.env`）。
- **做法 B**：另外寫一個後端（Node、Supabase Edge Functions 等），提供同樣的 API，RN 只呼叫那個後端。

也就是說：**app/api/** 不用「搬進」seekmeal-rn，而是「保留在 Web 後端」，RN 透過網路呼叫。

### 6.4 元件（components/）

| 來源 | 做法 |
|------|------|
| `BottomNav.tsx` | 用 React Navigation 的 `bottom-tabs` 取代，不必照抄舊元件。 |
| 其他 `components/*.tsx` | 複製到 seekmeal-rn 的 `components/`，再逐檔把 `<div>` / `className` / Tailwind / `framer-motion` 改成 `<View>` / `style` / Reanimated。 |

一次處理一個元件，改到能編譯、能跑再處理下一個。

### 6.5 建議實際執行順序（清單）

1. 建立 seekmeal-rn（Step 3）、裝好依賴（Step 4）、設好導航與 App.tsx（Step 5）。
2. 複製 `types/`、`lib/supabase/client.ts` 及會用到的 `lib/*.ts`（不含 server）。
3. 決定 API 要放哪（現有 Next 部署網址或新後端），在 RN 裡用環境變量存 API 基底網址。
4. 先遷一個最簡單的畫面（例如登入或首頁）→ 改成 Screen + View/Text/Pressable，能跑起來。
5. 再一個一個加其他畫面、再把用到的 components 搬過去並改寫。
6. 最後處理圖表、動畫、Toast 等需要替換套件的部分。

這樣就是「逐步遷入並改成 RN 寫法」的具體執行方式。

---

## 總結順序

| 順序 | 做什麼 | 在哪裡執行 |
|------|--------|------------|
| 1 | `./verify-setup.sh` | seekmeal-app |
| 2 | 刪除 .git → git init → 第一個 commit | seekmeal-app |
| 3 | create-expo-app 或 react-native init | 上一層目錄（新資料夾） |
| 4 | 安裝 RN / 導航 / Supabase / 環境變量 | 新 RN 專案目錄 |
| 5 | 調整 app.json、babel、App.tsx 等 | 新 RN 專案目錄 |
| 6 | 把 seekmeal-app 的業務代碼遷入並改寫成 RN | 新 RN 專案目錄 |

**注意**：轉換是「新開一個 RN 專案 → 遷入並改寫代碼」，不是直接在 seekmeal-app 裡把 Next 改成 RN。Web 專用依賴（next、react-dom、recharts 等）在**新專案**裡不要裝，在舊的 seekmeal-app 可以保留不動。
