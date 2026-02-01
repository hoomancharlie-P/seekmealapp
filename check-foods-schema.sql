-- ================================================
-- Part 1: 檢查 foods 表結構
-- ================================================
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'foods' 
ORDER BY ordinal_position;

-- ================================================
-- Part 2: 檢查 RLS 策略
-- ================================================
SELECT 
  policyname,
  cmd,
  qual::text,
  with_check::text
FROM pg_policies 
WHERE tablename = 'foods';

-- ================================================
-- Part 3: 暫時禁用 RLS（測試用）
-- ================================================
-- 執行此命令來暫時禁用 RLS，測試插入是否成功
-- ALTER TABLE foods DISABLE ROW LEVEL SECURITY;

-- ================================================
-- Part 4: 重新啟用並創建正確的策略（測試成功後）
-- ================================================
-- 1. 重新啟用 RLS
-- ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

-- 2. 刪除舊策略
-- DROP POLICY IF EXISTS "Users can insert their own foods" ON foods;
-- DROP POLICY IF EXISTS "Users can view their own foods" ON foods;
-- DROP POLICY IF EXISTS "Users can update their own foods" ON foods;
-- DROP POLICY IF EXISTS "Users can delete their own foods" ON foods;

-- 3. 創建新策略
-- CREATE POLICY "Users can insert their own foods"
-- ON foods FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   EXISTS (
--     SELECT 1 FROM meals 
--     WHERE meals.id = foods.meal_id 
--     AND meals.user_id = auth.uid()
--   )
-- );

-- CREATE POLICY "Users can view their own foods"
-- ON foods FOR SELECT
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM meals 
--     WHERE meals.id = foods.meal_id 
--     AND meals.user_id = auth.uid()
--   )
-- );

-- CREATE POLICY "Users can update their own foods"
-- ON foods FOR UPDATE
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM meals 
--     WHERE meals.id = foods.meal_id 
--     AND meals.user_id = auth.uid()
--   )
-- )
-- WITH CHECK (
--   EXISTS (
--     SELECT 1 FROM meals 
--     WHERE meals.id = foods.meal_id 
--     AND meals.user_id = auth.uid()
--   )
-- );

-- CREATE POLICY "Users can delete their own foods"
-- ON foods FOR DELETE
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM meals 
--     WHERE meals.id = foods.meal_id 
--     AND meals.user_id = auth.uid()
--   )
-- );
