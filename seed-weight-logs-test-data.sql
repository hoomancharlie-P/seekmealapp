-- ================================================
-- 體重記錄測試數據生成腳本
-- ================================================
-- 使用方法：
-- 1. 替換 YOUR_USER_ID 為實際的用戶 ID
-- 2. 在 Supabase Dashboard → SQL Editor 執行
-- ================================================

-- 方法1：生成過去30天的模擬數據（模擬減重趨勢）
-- 從 70kg 開始，每天減 0.1kg
INSERT INTO weight_logs (user_id, weight, date)
SELECT 
  'YOUR_USER_ID'::uuid,  -- 替換為實際用戶 ID
  70.0 - (ROW_NUMBER() OVER (ORDER BY date) * 0.1),  -- 從70kg開始，每天減0.1kg
  date::date
FROM generate_series(
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE,
  '1 day'
) AS date
ON CONFLICT (user_id, date) DO UPDATE SET
  weight = EXCLUDED.weight,
  created_at = NOW();

-- 方法2：生成過去7天的數據（快速測試用）
-- 從 68kg 開始，每天減 0.15kg
INSERT INTO weight_logs (user_id, weight, date)
SELECT 
  'YOUR_USER_ID'::uuid,  -- 替換為實際用戶 ID
  68.0 - (ROW_NUMBER() OVER (ORDER BY date) * 0.15),  -- 從68kg開始，每天減0.15kg
  date::date
FROM generate_series(
  CURRENT_DATE - INTERVAL '7 days',
  CURRENT_DATE,
  '1 day'
) AS date
ON CONFLICT (user_id, date) DO UPDATE SET
  weight = EXCLUDED.weight,
  created_at = NOW();

-- 方法3：生成隨機波動的數據（更真實）
-- 過去30天，體重在 68-70kg 之間波動，整體趨勢下降
INSERT INTO weight_logs (user_id, weight, date)
SELECT 
  'YOUR_USER_ID'::uuid,  -- 替換為實際用戶 ID
  ROUND((70.0 - (ROW_NUMBER() OVER (ORDER BY date) * 0.05) + (RANDOM() * 0.5 - 0.25))::numeric, 1),  -- 整體下降 + 隨機波動
  date::date
FROM generate_series(
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE,
  '1 day'
) AS date
ON CONFLICT (user_id, date) DO UPDATE SET
  weight = EXCLUDED.weight,
  created_at = NOW();

-- ================================================
-- 查詢測試數據
-- ================================================
-- SELECT * FROM weight_logs 
-- WHERE user_id = 'YOUR_USER_ID' 
-- ORDER BY date DESC 
-- LIMIT 10;

-- ================================================
-- 清理測試數據（可選）
-- ================================================
-- DELETE FROM weight_logs WHERE user_id = 'YOUR_USER_ID';
