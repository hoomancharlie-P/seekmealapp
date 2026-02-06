# 重新開展 Supabase Database 完整指示

適用於 **seekmeal-app** 與 **SeekMealApp** 使用的 Supabase 專案。可選擇：**全新 Supabase 專案** 或 **在現有專案內重建表結構**。

---

## 一、建立全新 Supabase 專案（若你要全新開始）

### 1.1 建立專案

1. 前往 [Supabase Dashboard](https://supabase.com/dashboard) 並登入。
2. 點 **New Project**。
3. 填寫：
   - **Name**：例如 `seekmeal` 或 `seekmeal-new`。
   - **Database Password**：設一組強密碼並**記下來**（之後無法再查完整密碼）。
   - **Region**：選離你較近的（例如 Singapore）。
4. 點 **Create new project**，等專案建立完成。

### 1.2 取得連線資訊

1. 左側選 **Project Settings**（齒輪圖示）。
2. 選 **API**：
   - **Project URL** → 之後填到 `NEXT_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`。
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`。
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY`（僅後端使用，勿放進 App）。

---

## 二、在 Supabase 建立表結構與 RLS

在 **SQL Editor** 裡依序執行下面兩段 SQL。

### 2.1 啟用 UUID 擴展（若尚未啟用）

在 SQL Editor 執行：

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 2.2 建立所有表與 RLS（一次執行）

把下面整段複製到 **SQL Editor**，按 **Run** 執行：

```sql
-- ========== profiles（用戶資料，與 auth.users 對應）==========
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  calorie_target INTEGER NOT NULL DEFAULT 2000,
  protein_target INTEGER NOT NULL DEFAULT 150,
  carbs_target INTEGER NOT NULL DEFAULT 200,
  fat_target INTEGER NOT NULL DEFAULT 65,
  fiber_target INTEGER NOT NULL DEFAULT 25,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  dietary_restrictions TEXT[] DEFAULT '{}',
  dietary_habit TEXT DEFAULT 'none',
  allergies TEXT[] DEFAULT '{}',
  gender TEXT DEFAULT 'male',
  age INTEGER,
  height NUMERIC,
  weight NUMERIC,
  activity_level TEXT DEFAULT 'sedentary',
  goal TEXT DEFAULT 'maintain'
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 註冊時自動建立 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========== meals ==========
CREATE TABLE IF NOT EXISTS public.meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('breakfast','lunch','dinner','snack')),
  emoji TEXT NOT NULL DEFAULT '🍽️',
  calories INTEGER NOT NULL DEFAULT 0,
  protein INTEGER NOT NULL DEFAULT 0,
  carbs INTEGER NOT NULL DEFAULT 0,
  fat INTEGER NOT NULL DEFAULT 0,
  fiber INTEGER NOT NULL DEFAULT 0,
  consumed BOOLEAN DEFAULT false,
  consumed_at TIMESTAMPTZ,
  is_special_event BOOLEAN DEFAULT false,
  special_event_type TEXT,
  special_event_description TEXT,
  special_event_calories INTEGER,
  special_event_ai_suggestions JSONB,
  is_adjusted BOOLEAN DEFAULT false,
  adjusted_from INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meals_user_date ON public.meals(user_id, date);
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own meals" ON public.meals;
CREATE POLICY "Users can manage own meals" ON public.meals FOR ALL USING (auth.uid() = user_id);

-- ========== foods ==========
CREATE TABLE IF NOT EXISTS public.foods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories INTEGER NOT NULL DEFAULT 0,
  protein INTEGER NOT NULL DEFAULT 0,
  carbs INTEGER NOT NULL DEFAULT 0,
  fat INTEGER NOT NULL DEFAULT 0,
  fiber INTEGER,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foods_meal_id ON public.foods(meal_id);
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage foods via meals" ON public.foods;
CREATE POLICY "Users can manage foods via meals" ON public.foods FOR ALL
  USING (EXISTS (SELECT 1 FROM public.meals WHERE meals.id = foods.meal_id AND meals.user_id = auth.uid()));

-- ========== travel_plans ==========
CREATE TABLE IF NOT EXISTS public.travel_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  cuisine TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  return_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_plans_user_active ON public.travel_plans(user_id, active);
ALTER TABLE public.travel_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own travel plans" ON public.travel_plans;
CREATE POLICY "Users can view own travel plans" ON public.travel_plans FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own travel plans" ON public.travel_plans;
CREATE POLICY "Users can create own travel plans" ON public.travel_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own travel plans" ON public.travel_plans;
CREATE POLICY "Users can update own travel plans" ON public.travel_plans FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own travel plans" ON public.travel_plans;
CREATE POLICY "Users can delete own travel plans" ON public.travel_plans FOR DELETE USING (auth.uid() = user_id);

-- ========== weight_logs ==========
CREATE TABLE IF NOT EXISTS public.weight_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  weight DECIMAL(5,2) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON public.weight_logs(user_id, date DESC);
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own weight logs" ON public.weight_logs;
CREATE POLICY "Users can view own weight logs" ON public.weight_logs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own weight logs" ON public.weight_logs;
CREATE POLICY "Users can insert own weight logs" ON public.weight_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own weight logs" ON public.weight_logs;
CREATE POLICY "Users can update own weight logs" ON public.weight_logs FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own weight logs" ON public.weight_logs;
CREATE POLICY "Users can delete own weight logs" ON public.weight_logs FOR DELETE USING (auth.uid() = user_id);
```

若專案**已存在** `profiles` / `meals` / `foods` 表，而你想**完全重建**，可先執行（會清空資料）：

```sql
-- 僅在要「清空並重建」時執行，會刪除所有資料
DROP TABLE IF EXISTS public.foods;
DROP TABLE IF EXISTS public.meals;
DROP TABLE IF EXISTS public.weight_logs;
DROP TABLE IF EXISTS public.travel_plans;
DROP TABLE IF EXISTS public.profiles;
-- 然後再執行上面的 CREATE TABLE 整段
```

---

## 三、啟用 Auth（Email / 密碼）

1. 左側選 **Authentication** → **Providers**。
2. 確認 **Email** 已啟用。
3. （可選）**Authentication** → **URL Configuration**：設 **Site URL** 為你的網址（例如 `https://xxx.vercel.app` 或 `http://localhost:3000`），**Redirect URLs** 可加同一網址。

---

## 四、更新本機與 App 的 .env

### 4.1 seekmeal-app（Next.js）

編輯 **seekmeal-app** 的 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://你的專案ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_anon_public_金鑰
SUPABASE_SERVICE_ROLE_KEY=你的_service_role_金鑰
```

### 4.2 SeekMealApp（Expo）

編輯 **SeekMealApp** 的 `.env`：

```env
EXPO_PUBLIC_SUPABASE_URL=https://你的專案ID.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=你的_anon_public_金鑰
EXPO_PUBLIC_API_URL=https://你的Next後端網址.vercel.app
```

**注意**：`SUPABASE_SERVICE_ROLE_KEY` 只放在 **seekmeal-app** 後端，不要放進 SeekMealApp。

---

## 五、驗證

1. **seekmeal-app**：`npm run dev` → 註冊新帳號 → 登入後能進主頁、能生成餐單。
2. **SeekMealApp**：`npx expo start` → 同帳號登入 → 主頁能讀到餐單。

若舊專案已有用戶，**新專案**需重新註冊；舊資料不會自動搬過去。

---

## 六、可選：只重建表、不建新專案

若你只想在**現有 Supabase 專案**裡清空並重建表：

1. 在該專案 **SQL Editor** 先執行上面的 `DROP TABLE IF EXISTS ...` 那段。
2. 再執行整段 **CREATE TABLE + RLS + trigger**。
3. 不需改 .env（URL 與 key 保持不變）。

這樣會清空該專案內 `profiles` / `meals` / `foods` / `travel_plans` / `weight_logs` 的資料並重建結構。
