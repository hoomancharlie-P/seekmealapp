-- 添加基本資料欄位到 profiles 表
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male',
ADD COLUMN IF NOT EXISTS age INTEGER,
ADD COLUMN IF NOT EXISTS height NUMERIC,
ADD COLUMN IF NOT EXISTS weight NUMERIC,
ADD COLUMN IF NOT EXISTS activity_level TEXT DEFAULT 'sedentary',
ADD COLUMN IF NOT EXISTS goal TEXT DEFAULT 'maintain';

-- 添加註釋
COMMENT ON COLUMN profiles.gender IS '性別: male, female';
COMMENT ON COLUMN profiles.age IS '年齡';
COMMENT ON COLUMN profiles.height IS '身高 (cm)';
COMMENT ON COLUMN profiles.weight IS '體重 (kg)';
COMMENT ON COLUMN profiles.activity_level IS '活動水平: sedentary, light, moderate, active';
COMMENT ON COLUMN profiles.goal IS '目標: lose, maintain, gain';
