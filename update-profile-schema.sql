-- ================================================
-- Part 1: 加入飲食偏好欄位
-- ================================================
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS dietary_habit TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS allergies TEXT[] DEFAULT '{}';

-- ================================================
-- Part 2: 加入註釋
-- ================================================
COMMENT ON COLUMN profiles.dietary_restrictions IS '不吃的食物類別，例如: ["beef", "pork", "seafood"]';
COMMENT ON COLUMN profiles.dietary_habit IS '飲食習慣: none, vegetarian, low_carb, keto';
COMMENT ON COLUMN profiles.allergies IS '過敏食物，例如: ["peanuts", "shellfish"]';

-- ================================================
-- Part 3: 檢查是否成功
-- ================================================
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('dietary_restrictions', 'dietary_habit', 'allergies');

-- 應該顯示 3 個新欄位
