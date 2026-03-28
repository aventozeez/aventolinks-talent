import { createClient } from '@supabase/supabase-js'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// =============================================
// TYPES
// =============================================

export type QuizQuestion = {
  id: string
  question: string
  options: string[]
  correct_answer: number
  category: string
  is_active: boolean
  created_at: string
}

export type QuizSession = {
  id: string
  name: string
  round_type: 'standard' | 'rapid_fire'
  status: 'waiting' | 'active' | 'completed'
  time_per_question: number
  questions_per_round: number
  question_ids: string[]
  created_at: string
  started_at?: string
  ended_at?: string
}

export type QuizParticipant = {
  id: string
  session_id: string
  name: string
  score: number
  questions_answered: number
  questions_correct: number
  is_finished: boolean
  joined_at: string
}

// =============================================
// QUESTION HELPERS
// =============================================

export async function getAllQuestions() {
  const { data, error } = await getSupabase()
    .from('quiz_questions')
    .select('*')
    .order('created_at', { ascending: false })
  return { data: data as QuizQuestion[] | null, error }
}

export async function getQuestionsByIds(ids: string[]) {
  if (!ids.length) return { data: [] as QuizQuestion[], error: null }
  const { data, error } = await getSupabase()
    .from('quiz_questions')
    .select('*')
    .in('id', ids)
    .eq('is_active', true)
  return { data: data as QuizQuestion[] | null, error }
}

export async function getRandomActiveQuestions(limit: number) {
  // Fetch more than needed then shuffle client-side (Supabase OSS has no random())
  const { data, error } = await getSupabase()
    .from('quiz_questions')
    .select('*')
    .eq('is_active', true)
    .limit(limit * 3)
  if (!data) return { data: null, error }
  const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, limit)
  return { data: shuffled as QuizQuestion[], error }
}

export async function addQuestion(q: {
  question: string
  options: string[]
  correct_answer: number
  category: string
}) {
  const { data, error } = await getSupabase()
    .from('quiz_questions')
    .insert({ ...q, is_active: true })
    .select()
    .single()
  return { data, error }
}

export async function updateQuestion(id: string, updates: Partial<QuizQuestion>) {
  const { data, error } = await getSupabase()
    .from('quiz_questions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function deleteQuestion(id: string) {
  const { error } = await getSupabase().from('quiz_questions').delete().eq('id', id)
  return { error }
}

// =============================================
// SESSION HELPERS
// =============================================

export async function getAllSessions() {
  const { data, error } = await getSupabase()
    .from('quiz_sessions')
    .select('*')
    .order('created_at', { ascending: false })
  return { data: data as QuizSession[] | null, error }
}

export async function getActiveSession() {
  const { data, error } = await getSupabase()
    .from('quiz_sessions')
    .select('*')
    .in('status', ['waiting', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { data: data as QuizSession | null, error }
}

export async function getSessionById(id: string) {
  const { data, error } = await getSupabase()
    .from('quiz_sessions')
    .select('*')
    .eq('id', id)
    .single()
  return { data: data as QuizSession | null, error }
}

export async function createSession(s: {
  name: string
  round_type: 'standard' | 'rapid_fire'
  time_per_question: number
  questions_per_round: number
  question_ids: string[]
}) {
  const { data, error } = await getSupabase()
    .from('quiz_sessions')
    .insert({ ...s, status: 'waiting' })
    .select()
    .single()
  return { data, error }
}

export async function updateSessionStatus(id: string, status: 'waiting' | 'active' | 'completed') {
  const updates: Record<string, unknown> = { status }
  if (status === 'active') updates.started_at = new Date().toISOString()
  if (status === 'completed') updates.ended_at = new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('quiz_sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function updateSessionQuestions(id: string, question_ids: string[]) {
  const { data, error } = await getSupabase()
    .from('quiz_sessions')
    .update({ question_ids })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function deleteSession(id: string) {
  const { error } = await getSupabase().from('quiz_sessions').delete().eq('id', id)
  return { error }
}

// =============================================
// PARTICIPANT HELPERS
// =============================================

export async function joinSession(sessionId: string, name: string) {
  const { data, error } = await getSupabase()
    .from('quiz_participants')
    .insert({ session_id: sessionId, name, score: 0 })
    .select()
    .single()
  return { data: data as QuizParticipant | null, error }
}

export async function getParticipants(sessionId: string) {
  const { data, error } = await getSupabase()
    .from('quiz_participants')
    .select('*')
    .eq('session_id', sessionId)
    .order('score', { ascending: false })
  return { data: data as QuizParticipant[] | null, error }
}

export async function updateParticipant(
  participantId: string,
  updates: { score?: number; questions_answered?: number; questions_correct?: number; is_finished?: boolean }
) {
  const { data, error } = await getSupabase()
    .from('quiz_participants')
    .update(updates)
    .eq('id', participantId)
    .select()
    .single()
  return { data: data as QuizParticipant | null, error }
}

// =============================================
// ATTEMPT HELPERS
// =============================================

export async function recordAttempt(attempt: {
  session_id: string
  participant_id: string
  question_id: string
  selected_option: number | null
  is_correct: boolean
  is_passed: boolean
}) {
  const { data, error } = await getSupabase()
    .from('quiz_attempts')
    .insert(attempt)
    .select()
    .single()
  return { data, error }
}

export async function getCorrectlyAnsweredIds(participantId: string): Promise<string[]> {
  const { data } = await getSupabase()
    .from('quiz_attempts')
    .select('question_id')
    .eq('participant_id', participantId)
    .eq('is_correct', true)
  return data?.map((a: { question_id: string }) => a.question_id) ?? []
}
