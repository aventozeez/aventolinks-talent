-- =============================================
-- SCHOLARS CHALLENGE QUIZ — Supabase Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Quiz Questions
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct_answer INTEGER NOT NULL CHECK (correct_answer >= 0 AND correct_answer <= 3),
  category TEXT DEFAULT 'General',
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz Sessions
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  round_type TEXT DEFAULT 'standard' CHECK (round_type IN ('standard', 'rapid_fire')),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
  time_per_question INTEGER DEFAULT 30,
  questions_per_round INTEGER DEFAULT 10,
  question_ids JSONB DEFAULT '[]',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- Quiz Participants
CREATE TABLE IF NOT EXISTS quiz_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  is_finished BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz Attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES quiz_participants(id) ON DELETE CASCADE,
  question_id UUID REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_option INTEGER,
  is_correct BOOLEAN DEFAULT FALSE,
  is_passed BOOLEAN DEFAULT FALSE,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ───────────────────────────────────────────
ALTER TABLE quiz_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts    ENABLE ROW LEVEL SECURITY;

-- quiz_questions
DROP POLICY IF EXISTS "Public read active questions" ON quiz_questions;
CREATE POLICY "Public read active questions" ON quiz_questions
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Staff all on questions" ON quiz_questions;
CREATE POLICY "Staff all on questions" ON quiz_questions FOR ALL
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator')
  ));

-- quiz_sessions
DROP POLICY IF EXISTS "Public read sessions" ON quiz_sessions;
CREATE POLICY "Public read sessions" ON quiz_sessions FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Staff all on sessions" ON quiz_sessions;
CREATE POLICY "Staff all on sessions" ON quiz_sessions FOR ALL
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator')
  ));

-- quiz_participants
DROP POLICY IF EXISTS "Public read participants" ON quiz_participants;
CREATE POLICY "Public read participants" ON quiz_participants FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public insert participants" ON quiz_participants;
CREATE POLICY "Public insert participants" ON quiz_participants FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Public update participants" ON quiz_participants;
CREATE POLICY "Public update participants" ON quiz_participants FOR UPDATE USING (TRUE);

-- quiz_attempts
DROP POLICY IF EXISTS "Public read attempts" ON quiz_attempts;
CREATE POLICY "Public read attempts" ON quiz_attempts FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public insert attempts" ON quiz_attempts;
CREATE POLICY "Public insert attempts" ON quiz_attempts FOR INSERT WITH CHECK (TRUE);

-- ── Enable Realtime ────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE quiz_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE quiz_sessions;
