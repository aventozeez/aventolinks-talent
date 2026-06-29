import { supabase } from './supabase'
import { wsSubscribe, wsBroadcast } from './ws-sync'

// ── Constants ─────────────────────────────────────────────────────────────────
export const BROADCAST_ROOM = 'quiz-live'
export const POINTS         = 10

// ── Types ─────────────────────────────────────────────────────────────────────
export type GameMode   = 'rapid_fire' | 'buzzer' | 'innovation_sprint'
export type LivePhase  = 'idle' | 'showing' | 'buzzed_a' | 'buzzed_b' | 'revealed'
export type LastResult = null | 'correct_a' | 'correct_b' | 'wrong' | 'pass'

export type LiveQuestion = {
  id:             string
  question:       string
  options:        string[]
  correct_answer: number
  category:       string
  answer_key?:    string   // plain-text answer shown to admin only
}

export type QuizLiveState = {
  id:            string
  /** Broadcast-only — not persisted to DB (no schema change needed) */
  mode?:         GameMode
  team_a_name:   string
  team_b_name:   string
  score_a:       number
  score_b:       number
  questions:     LiveQuestion[]
  current_index: number
  phase:         LivePhase
  last_result:   LastResult
}

export const LIVE_ID = 'default'

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
  // Strip `mode` — it's broadcast-only; not a DB column.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { mode: _m, id: _id, ...dbPatch } = patch as QuizLiveState
  const { data, error } = await supabase
    .from('quiz_live_state')
    .upsert({ id: LIVE_ID, ...dbPatch }, { onConflict: 'id' })
    .select()
    .single()
  return { data: data as QuizLiveState | null, error }
}

// ── Subscribe ─────────────────────────────────────────────────────────────────
//
// Used by viewer screens (audience, team-a, team-b).
// Returns { unsubscribe, sendBuzz } — teams call sendBuzz() for buzzer mode.
//
// Primary:  Supabase Broadcast — instant.
// Fallback: polls DB every 2 s, only fires when something actually changed.

const _sig = (d: QuizLiveState) =>
  `${d.phase}|${d.current_index}|${d.score_a}|${d.score_b}|${d.last_result}`

export function subscribeToLive(cb: (s: QuizLiveState) => void): {
  unsubscribe: () => void
  sendBuzz: (team: 'a' | 'b') => void
} {
  let lastSig  = ''
  let lastMode: GameMode = 'rapid_fire'   // remembered across polls

  // Seed with DB state immediately
  getLiveState().then(({ data }) => {
    if (!data) return
    lastSig = _sig(data)
    cb({ ...data, mode: lastMode })
  })

  const unsubState = wsSubscribe(BROADCAST_ROOM + ':state', (payload) => {
    const s = payload as QuizLiveState
    if (s.mode) lastMode = s.mode
    lastSig = _sig(s)
    cb(s)
  })

  return {
    unsubscribe: unsubState,
    sendBuzz: (team: 'a' | 'b') => wsBroadcast(BROADCAST_ROOM + ':buzz', { team }),
  }
}
