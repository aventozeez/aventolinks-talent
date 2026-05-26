// Uses the existing singleton supabase client so all tabs share the same WS connection pool
import { supabase } from './supabase'

// ── Broadcast room ─────────────────────────────────────────────────────────────
// All 4 screens (admin, audience, team-a, team-b) must use the EXACT same name.
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
export const POINTS  = 10

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getLiveState() {
  const { data, error } = await supabase
    .from('quiz_live_state')
    .select('*')
    .eq('id', LIVE_ID)
    .maybeSingle()
  return { data: data as QuizLiveState | null, error }
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function saveLiveState(patch: Partial<Omit<QuizLiveState, 'id'>>) {
  const { data, error } = await supabase
    .from('quiz_live_state')
    .upsert({ id: LIVE_ID, ...patch }, { onConflict: 'id' })
    .select()
    .single()
  return { data: data as QuizLiveState | null, error }
}

// ── Subscribe (Broadcast + polling fallback) ──────────────────────────────────
//
// Primary:  Supabase Broadcast — instant, no RLS dependency.
// Fallback: polls DB every 2 s, only fires cb when volatile fields actually change.
//           Guarantees updates even if WebSocket never connects in production.

const _sig = (d: QuizLiveState) =>
  `${d.phase}|${d.current_index}|${d.score_a}|${d.score_b}|${d.last_result}`

export function subscribeToLive(cb: (s: QuizLiveState) => void): () => void {
  let lastSig = ''

  // 1 ── Broadcast (instant when WebSocket works)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = (supabase.channel(BROADCAST_ROOM) as any)
    .on('broadcast', { event: 'quiz_state' }, (msg: { payload: QuizLiveState }) => {
      lastSig = _sig(msg.payload)   // keep poll in sync to avoid double-fire
      cb(msg.payload)
    })
    .subscribe()

  // 2 ── Polling fallback (≤ 2 s lag, always works)
  const poll = setInterval(async () => {
    const { data } = await getLiveState()
    if (!data) return
    const sig = _sig(data)
    if (sig === lastSig) return     // nothing changed — skip
    lastSig = sig
    cb(data)
  }, 2000)

  return () => {
    supabase.removeChannel(channel)
    clearInterval(poll)
  }
}
