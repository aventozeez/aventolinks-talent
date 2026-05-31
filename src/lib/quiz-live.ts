// Uses the existing singleton supabase client so all tabs share the same WS pool
import { supabase } from './supabase'

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = (supabase.channel(BROADCAST_ROOM) as any)
    .on('broadcast', { event: 'quiz_state' }, (msg: { payload: QuizLiveState }) => {
      if (msg.payload.mode) lastMode = msg.payload.mode
      lastSig = _sig(msg.payload)
      cb(msg.payload)
    })
    .subscribe()

  // Polling fallback — merges last known mode so viewers stay mode-aware after refresh
  const poll = setInterval(async () => {
    const { data } = await getLiveState()
    if (!data) return
    const sig = _sig(data)
    if (sig === lastSig) return
    lastSig = sig
    cb({ ...data, mode: lastMode })
  }, 2000)

  return {
    unsubscribe: () => {
      supabase.removeChannel(ch)
      clearInterval(poll)
    },
    /** Teams call this to buzz in. Admin's channel receives the event. */
    sendBuzz: (team: 'a' | 'b') =>
      ch.send({ type: 'broadcast', event: 'buzz', payload: { team } }),
  }
}
