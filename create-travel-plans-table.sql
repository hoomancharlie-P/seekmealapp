-- 創建 travel_plans 表
CREATE TABLE IF NOT EXISTS travel_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  destination VARCHAR(100) NOT NULL,
  cuisine VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  return_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_plans_user_active 
ON travel_plans(user_id, active);

CREATE INDEX IF NOT EXISTS idx_travel_plans_dates 
ON travel_plans(start_date, end_date);

-- RLS policies
ALTER TABLE travel_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own travel plans" ON travel_plans;
CREATE POLICY "Users can view own travel plans"
ON travel_plans FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own travel plans" ON travel_plans;
CREATE POLICY "Users can create own travel plans"
ON travel_plans FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own travel plans" ON travel_plans;
CREATE POLICY "Users can update own travel plans"
ON travel_plans FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own travel plans" ON travel_plans;
CREATE POLICY "Users can delete own travel plans"
ON travel_plans FOR DELETE
USING (auth.uid() = user_id);
