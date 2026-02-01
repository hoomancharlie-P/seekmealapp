-- 確保 weight_logs 表存在
CREATE TABLE IF NOT EXISTS weight_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  weight DECIMAL(5,2) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date 
ON weight_logs(user_id, date DESC);

ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own weight logs" ON weight_logs;
CREATE POLICY "Users can view own weight logs"
ON weight_logs FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own weight logs" ON weight_logs;
CREATE POLICY "Users can insert own weight logs"
ON weight_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own weight logs" ON weight_logs;
CREATE POLICY "Users can update own weight logs"
ON weight_logs FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own weight logs" ON weight_logs;
CREATE POLICY "Users can delete own weight logs"
ON weight_logs FOR DELETE
USING (auth.uid() = user_id);
