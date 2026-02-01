# SeekMeal 專案設定指南

## 步驟 1: 進入專案目錄

```bash
cd /Users/charliechan/Desktop/Personal/Projects/seekmeal
```

## 步驟 2: 安裝依賴套件

```bash
npm install
```

這會安裝所有必要的套件，包括：
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Supabase 客戶端 (@supabase/supabase-js, @supabase/ssr)
- Claude API SDK (@anthropic-ai/sdk)

## 步驟 3: 設定環境變數

複製環境變數範本檔案：

```bash
cp .env.example .env.local
```

然後編輯 `.env.local` 檔案，填入你的 API 金鑰：

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://qogzodwtrsuuemnoliuq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZ3pvZHd0cnN1dWVtbm9saXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMjg4MDksImV4cCI6MjA4MzYwNDgwOX0.Hkqoeg1Qf2LVi056XKA09gPq8_BXLs9lf0SG8X7J9lU
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZ3pvZHd0cnN1dWVtbm9saXVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAyODgwOSwiZXhwIjoyMDgzNjA0ODA5fQ.zGL8OHy2T25lhigVRCf4sYcoAJ0JL_vPm23sguY7s2M


# Claude API
ANTHROPIC_API_KEY=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
```

### 如何取得 Supabase 金鑰：

1. 前往 [Supabase](https://supabase.com) 並登入
2. 建立新專案或選擇現有專案
3. 進入專案設定 (Settings) > API
4. 複製以下資訊：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (需小心保管，只在服務端使用)

### 如何取得 Claude API 金鑰：

1. 前往 [Anthropic Console](https://console.anthropic.com/)
2. 登入或註冊帳號
3. 進入 API Keys 頁面
4. 建立新的 API Key
5. 複製金鑰 → `ANTHROPIC_API_KEY`

## 步驟 4: 啟動開發伺服器

```bash
npm run dev
```

開啟瀏覽器前往 [http://localhost:3000](http://localhost:3000)

## 步驟 5: (選用) 執行 Lint 檢查

```bash
npm run lint
```

## 專案結構說明

```
seekmeal/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # 根佈局元件
│   ├── page.tsx           # 首頁元件
│   ├── onboarding/        # 引導頁面
│   └── globals.css        # 全域 CSS 樣式
├── lib/                    # 工具函式庫
│   ├── supabase/          # Supabase 客戶端設定
│   │   ├── client.ts      # 瀏覽器端客戶端 (用於客戶端元件)
│   │   └── server.ts      # 伺服器端客戶端 (用於 Server Components/Actions)
│   └── anthropic/         # Claude API 客戶端設定
│       └── client.ts      # Anthropic 客戶端
├── components/             # React 元件目錄
├── types/                  # TypeScript 類型定義目錄
├── public/                 # 靜態資源目錄
├── package.json            # 專案依賴和腳本
├── tsconfig.json           # TypeScript 配置
├── tailwind.config.ts      # Tailwind CSS 配置
├── next.config.mjs         # Next.js 配置
└── .env.example            # 環境變數範本
```

## 下一步開發建議

1. **設定 Supabase 資料庫結構**
   - 建立使用者表 (users)
   - 建立餐單表 (meals)
   - 建立記錄表 (records)
   - 建立貓狀態表 (cat_states)
   - 設定 Row Level Security (RLS) 政策

2. **實作使用者認證**
   - 建立登入/註冊頁面
   - 設定 Supabase Auth
   - 建立認證中介軟體

3. **建立貓角色系統**
   - 設計貓的視覺狀態
   - 實作狀態計算邏輯
   - 建立互動機制

4. **整合 Claude API**
   - 建立 AI 餐單生成功能
   - 實作餐單編輯系統
   - 提供食物識別功能
