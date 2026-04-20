-- ============================================================
-- SCHOLARS CHALLENGE — Competition Tables Migration
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- 1. Teams registered for the competition
CREATE TABLE IF NOT EXISTS sc_teams (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_name   TEXT NOT NULL,
  school      TEXT DEFAULT '',
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'eliminated', 'winner')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Questions for Rapid Fire and Buzzer rounds
CREATE TABLE IF NOT EXISTS sc_questions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_text TEXT NOT NULL,
  answer_key    TEXT NOT NULL DEFAULT '',
  round_type    TEXT NOT NULL DEFAULT 'rapid_fire' CHECK (round_type IN ('rapid_fire', 'buzzer')),
  subject       TEXT DEFAULT '',
  difficulty    TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sprint (Innovation Sprint) multi-step problems
CREATE TABLE IF NOT EXISTS sc_sprint_problems (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title      TEXT NOT NULL,
  statement  TEXT NOT NULL,
  step1      TEXT DEFAULT '',
  step2      TEXT DEFAULT '',
  step3      TEXT DEFAULT '',
  step4      TEXT DEFAULT '',
  step5      TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Named question pools / sets per round type
--    pool_type: 'rapid_fire' | 'buzzer' | 'sprint'
--    pool_number: used for RF pools (1-30), 0 for buzzer/sprint sets
--    problem_ids: JSON array of sprint problem IDs (sprint sets only)
CREATE TABLE IF NOT EXISTS sc_question_pools (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  pool_type   TEXT DEFAULT 'rapid_fire' CHECK (pool_type IN ('rapid_fire', 'buzzer', 'sprint')),
  pool_number INTEGER DEFAULT 0,
  problem_ids TEXT,   -- JSON array, used by sprint sets
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Junction table linking questions to pools (RF and Buzzer)
CREATE TABLE IF NOT EXISTS sc_pool_questions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id     UUID REFERENCES sc_question_pools(id) ON DELETE CASCADE,
  question_id UUID REFERENCES sc_questions(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0
);

-- ── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE sc_teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sc_questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sc_sprint_problems  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sc_question_pools   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sc_pool_questions   ENABLE ROW LEVEL SECURITY;

-- Open policies (restrict to admin/moderator in production if needed)
DROP POLICY IF EXISTS "open sc_teams"           ON sc_teams;
DROP POLICY IF EXISTS "open sc_questions"       ON sc_questions;
DROP POLICY IF EXISTS "open sc_sprint_problems" ON sc_sprint_problems;
DROP POLICY IF EXISTS "open sc_question_pools"  ON sc_question_pools;
DROP POLICY IF EXISTS "open sc_pool_questions"  ON sc_pool_questions;

CREATE POLICY "open sc_teams"           ON sc_teams           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open sc_questions"       ON sc_questions       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open sc_sprint_problems" ON sc_sprint_problems FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open sc_question_pools"  ON sc_question_pools  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open sc_pool_questions"  ON sc_pool_questions  FOR ALL USING (true) WITH CHECK (true);

-- ── Done ────────────────────────────────────────────────────────────────────
-- After running this, go to /dashboard/staff/competition to start using
-- the Competition Manager.
