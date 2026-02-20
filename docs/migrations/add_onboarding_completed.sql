-- Onboarding 流程：profiles 新增 onboarding_completed
-- 在 Supabase Dashboard → SQL Editor 執行

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- 為現有用戶設為 true（避免重複 Onboarding）
UPDATE profiles
SET onboarding_completed = TRUE
WHERE onboarding_completed IS NULL;

COMMENT ON COLUMN profiles.onboarding_completed IS '是否已完成 Onboarding 流程';

-- 驗證（可選）
-- SELECT id, onboarding_completed FROM profiles LIMIT 5;
