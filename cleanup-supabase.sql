-- 清理 Supabase 餐單數據
-- 注意：這會刪除所有 meals 和 foods 記錄

-- 1. 先刪除 foods（因為有外鍵約束）
DELETE FROM foods;

-- 2. 再刪除 meals
DELETE FROM meals;

-- 3. 確認刪除結果（可選）
SELECT COUNT(*) as meals_count FROM meals;
SELECT COUNT(*) as foods_count FROM foods;
