import { createClient } from '@supabase/supabase-js'

export const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

// Broadcast room — all 4 screens share this name
export const BROADCAST_ROOM = 'quiz-live'

// ── Types ─────────────────────────────────────────────────────────────────────

export type LiveQuestion = {
  id: string
  question: string
  options: string[]
  correct_answer: number
  category: string
}

export type LivePhase = 'idle' | 'showing' | 'revealed'
export type LastResult = null | 'correct_a' | 'correct_b' | 'wrong'

export type QuizLiveState = {
  id: string
  team_a_name: string
  team_b_name: string
  score_a: number
  score_b: number
  questions: LiveQuestion[]
  current_index: number
  phase: LivePhase
  last_result: LastResult
}

export const LIVE_ID = 'default'
export const POINTS   = 10

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getLiveState() {
  const { data, error } = await getSupabase()
    .from('quiz_live_state')
    .select('*')
    .eq('id', LIVE_ID)
    .maybeSingle()
  return { data: data as QuizLiveState | null, error }
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function saveLiveState(patch: Partial<Omit<QuizLiveState, 'id'>>) {
  const { data, error } = await getSupabase()
    .from('quiz_live_state')
    .upsert({ id: LIVE_ID, ...patch }, { onConflict: 'id' })
    .select()
    .single()
  return { data: data as QuizLiveState | null, error }
}

// ── Subscribe (Broadcast — bypasses RLS, works for all viewers) ───────────────
//
// Admin sends: channel.send({ type:'broadcast', event:'quiz_state', payload: state })
// Viewers receive here.  Initial state is always fetched from DB via getLiveState().

export function subscribeToLive(cb: (s: QuizLiveState) => void): () => void {
  const sb = getSupabase()
  const channel = sb
    .channel(BROADCAST_ROOM)
    .on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'broadcast' as any,
      { event: 'quiz_state' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => cb(payload.payload as QuizLiveState)
    )
    .subscribe()
  return () => { sb.removeChannel(channel) }
}
