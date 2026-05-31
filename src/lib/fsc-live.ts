import { supabase } from './supabase'

// ── Constants ─────────────────────────────────────────────────────────────────
export const FSC_CHANNEL    = 'fsc-live'
export const FSC_ID         = 'default'

export const RF_Q_COUNT     = 10
export const RF_TIME_MS     = 60_000   // 60 s per team
export const RF_CORRECT_PTS = 10

export const BZ_Q_COUNT     = 10
export const BZ_CORRECT_PTS = 10
export const BZ_PENALTY_PTS = 5       // first buzzer wrong → -5
export const BZ_TIME_MS     = 10_000  // 10 s countdown after buzz

export const IS_PROB_COUNT  = 2
export const IS_TIME_MS     = 60_000  // 60 s to arrange
export const IS_STEP_PTS    = 10      // per correct step (5 steps max = 50)
export const IS_BONUS_PTS   = 20      // bonus if ALL steps correct

// ── Types ─────────────────────────────────────────────────────────────────────
export type FSCRound  = 'idle' | 'rapid_fire' | 'buzzer' | 'innovation_sprint' | 'finished'
export type RFPhase   = 'idle' | 'a_playing' | 'break' | 'b_playing' | 'done'
export type BZPhase   = 'idle' | 'showing' | 'buzzed_a' | 'buzzed_b' | 'second_chance' | 'revealed' | 'done'
export type ISPhase   = 'idle' | 'working' | 'collecting' | 'revealed' | 'done'
export type BZResult  = null | 'correct_a' | 'correct_b' | 'penalty_a' | 'penalty_b' | 'skip'

export type FSCQuestion = {
  id: string
  question: string
  answer: string   // admin-only
  category: string
}

export type ISProblem = {
  id: string
  statement: string
  steps: string[]           // correct order (admin only — strip before broadcasting)
  steps_shuffled: string[]  // shown to teams
}

export type FSCState = {
  team_a_name: string
  team_b_name: string
  round: FSCRound

  // Scores (cumulative per round)
  rf_score_a: number; rf_score_b: number
  bz_score_a: number; bz_score_b: number
  is_score_a: number; is_score_b: number

  // ── Rapid Fire ──
  rf_phase: RFPhase
  rf_q_index: number          // 0-9, which question is showing
  rf_questions: FSCQuestion[]
  rf_timer_start: number | null   // ms timestamp
  rf_correct_a: number
  rf_correct_b: number

  // ── Buzzer ──
  bz_phase: BZPhase
  bz_q_index: number
  bz_questions: FSCQuestion[]
  bz_buzz_start: number | null    // ms timestamp when team buzzed
  bz_second_chance_team: 'a' | 'b' | null
  bz_last_result: BZResult

  // ── Innovation Sprint ──
  is_phase: ISPhase
  is_problem_index: number    // 0 or 1
  is_problems: ISProblem[]
  is_timer_start: number | null
  is_team_a_answer: string[] | null
  is_team_b_answer: string[] | null
}

export const makeDefaultState = (a = 'Team A', b = 'Team B'): FSCState => ({
  team_a_name: a, team_b_name: b,
  round: 'idle',
  rf_score_a: 0, rf_score_b: 0,
  bz_score_a: 0, bz_score_b: 0,
  is_score_a: 0, is_score_b: 0,
  rf_phase: 'idle', rf_q_index: 0, rf_questions: [],
  rf_timer_start: null, rf_correct_a: 0, rf_correct_b: 0,
  bz_phase: 'idle', bz_q_index: 0, bz_questions: [],
  bz_buzz_start: null, bz_second_chance_team: null, bz_last_result: null,
  is_phase: 'idle', is_problem_index: 0, is_problems: [],
  is_timer_start: null, is_team_a_answer: null, is_team_b_answer: null,
})

/** Strip correct step order before broadcasting to viewers */
export const safeForViewers = (s: FSCState): FSCState => ({
  ...s,
  rf_questions:  s.rf_questions.map(q => ({ ...q, answer: '' })),
  bz_questions:  s.bz_questions.map(q => ({ ...q, answer: '' })),
  is_problems:   s.is_problems.map(p => ({ ...p, steps: [] })),
})

// ── DB ────────────────────────────────────────────────────────────────────────
export async function getMatchState(): Promise<FSCState | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('fsc_match_state').select('data').eq('id', FSC_ID).maybeSingle()
  return (data?.data as FSCState) ?? null
}

export async function saveMatchState(state: FSCState): Promise<FSCState | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('fsc_match_state')
    .upsert({ id: FSC_ID, data: state, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('data').single()
  return (data?.data as FSCState) ?? null
}

// ── Buzz pending (written by team page, polled by admin) ─────────────────────
const FSC_BUZZ_ID = 'bz_pending'
export type BuzzPending = { team: 'a' | 'b'; q_index: number; time: number }

/** Team page calls this when they buzz — writes a lightweight record to DB */
export async function saveBuzzPending(team: 'a' | 'b', qIndex: number): Promise<void> {
  const payload: BuzzPending = { team, q_index: qIndex, time: Date.now() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('fsc_match_state')
    .upsert({ id: FSC_BUZZ_ID, data: payload, updated_at: new Date().toISOString() }, { onConflict: 'id' })
}

/** Admin polls this to detect a buzz */
export async function getBuzzPending(): Promise<BuzzPending | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('fsc_match_state').select('data').eq('id', FSC_BUZZ_ID).maybeSingle()
  return (data?.data as BuzzPending) ?? null
}

/** Admin calls this after processing a buzz (or when showing the next question) */
export async function clearBuzzPending(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('fsc_match_state').delete().eq('id', FSC_BUZZ_ID)
}

/** Save team IS answer to dedicated table so admin can read it for grading */
export async function saveISAnswer(team: 'a' | 'b', problemIndex: number, answer: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('fsc_is_answers').upsert(
    { match_id: FSC_ID, team, problem_index: problemIndex, answer, submitted_at: new Date().toISOString() },
    { onConflict: 'match_id,team,problem_index' }
  )
}

/** Admin reads submitted IS answers for a problem */
export async function getISAnswers(problemIndex: number): Promise<{ a: string[] | null; b: string[] | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('fsc_is_answers')
    .select('team,answer')
    .eq('match_id', FSC_ID)
    .eq('problem_index', problemIndex)
  const rows = (data || []) as { team: string; answer: string[] }[]
  return {
    a: rows.find(r => r.team === 'a')?.answer ?? null,
    b: rows.find(r => r.team === 'b')?.answer ?? null,
  }
}

// ── Change signature (poll dedup) ─────────────────────────────────────────────
export const stateSig = (s: FSCState) =>
  [s.round, s.rf_phase, s.rf_q_index, s.rf_correct_a, s.rf_correct_b,
   s.bz_phase, s.bz_q_index, s.bz_last_result,
   s.is_phase, s.is_problem_index,
   s.rf_score_a, s.rf_score_b, s.bz_score_a, s.bz_score_b, s.is_score_a, s.is_score_b,
   s.is_team_a_answer?.length ?? -1, s.is_team_b_answer?.length ?? -1,
  ].join('|')

// ── Subscribe (viewers) ───────────────────────────────────────────────────────
export function subscribeToMatch(cb: (s: FSCState) => void): {
  unsubscribe: () => void
  sendBuzz: (team: 'a' | 'b', qIndex?: number) => void
  submitISAnswer: (team: 'a' | 'b', problemIndex: number, answer: string[]) => void
} {
  let lastSig = ''
  let lastKnownState: FSCState | null = null  // tracks latest delivered state
  let destroyed = false
  let channelReady = false                    // true once SUBSCRIBED
  let buzzRetry: ReturnType<typeof setInterval> | null = null
  const mountTime = Date.now()

  const deliver = (s: FSCState) => {
    if (destroyed) return
    const sv = stateSig(s)
    if (sv === lastSig) return
    lastSig = sv
    lastKnownState = s
    // If buzz was acknowledged (phase no longer 'showing'), stop retrying
    if (s.bz_phase !== 'showing' && buzzRetry) {
      clearInterval(buzzRetry)
      buzzRetry = null
    }
    cb(s)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = (supabase.channel(FSC_CHANNEL) as any)
    .on('broadcast', { event: 'state' }, (msg: { payload: FSCState }) => {
      deliver(msg.payload)
    })
    .on('broadcast', { event: 'reload' }, () => {
      // Admin sent a resync signal — reload this viewer page.
      // Guard: ignore if the page just loaded (< 3 s ago) to prevent newly-
      // opened tabs from immediately reloading when admin sends the signal.
      if (Date.now() - mountTime > 3000) {
        if (typeof window !== 'undefined') window.location.reload()
      }
    })
    .subscribe((status: string) => { channelReady = status === 'SUBSCRIBED' })

  const fetchAndDeliver = async () => {
    if (destroyed) return
    const s = await getMatchState()
    if (!s || destroyed) return
    deliver(safeForViewers(s))
  }

  // Fetch immediately on subscribe so the page is never blank
  fetchAndDeliver()

  // Poll every 300 ms — keeps viewer pages in sync even when broadcast lags
  const poll = setInterval(fetchAndDeliver, 300)

  // Re-sync instantly when the user switches back to this tab
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchAndDeliver()
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible)
  }

  // ── Buzz backup processor ────────────────────────────────────────────────
  // The admin page polls every 200 ms to process buzzes. This runs every
  // 500 ms as a fallback so buzzes register even if the admin tab is closed.
  // It only acts after the buzz has been pending for >1 s (giving admin first shot).
  const buzzBackup = setInterval(async () => {
    if (destroyed) return
    if (!lastKnownState || lastKnownState.bz_phase !== 'showing') return

    const pending = await getBuzzPending()
    if (!pending || destroyed) return
    if (pending.q_index !== lastKnownState.bz_q_index) return

    // Admin processes within ~200 ms; only step in if still unprocessed after 1 s
    const age = Date.now() - pending.time
    if (age < 1000) return

    // Re-read full state from DB (preserves admin-only fields like answers/steps)
    const fullState = await getMatchState()
    if (!fullState || destroyed) return
    if (fullState.bz_phase !== 'showing') return      // admin already processed it
    if (fullState.bz_q_index !== pending.q_index) return

    const buzzedPhase = pending.team === 'a' ? 'buzzed_a' : 'buzzed_b'
    const updated: FSCState = { ...fullState, bz_phase: buzzedPhase, bz_buzz_start: pending.time }
    await saveMatchState(updated).catch(() => {})
    await clearBuzzPending().catch(() => {})
    deliver(safeForViewers(updated))
  }, 500)

  return {
    unsubscribe: () => {
      destroyed = true
      if (buzzRetry) { clearInterval(buzzRetry); buzzRetry = null }
      supabase.removeChannel(ch)
      clearInterval(poll)
      clearInterval(buzzBackup)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible)
      }
    },

    sendBuzz: (team: 'a' | 'b', qIndex?: number) => {
      if (destroyed) return
      // Clear any previous retry for a prior question
      if (buzzRetry) { clearInterval(buzzRetry); buzzRetry = null }
      // Prefer qIndex from caller (React state) over lastKnownState which may lag.
      const qIdx = qIndex ?? lastKnownState?.bz_q_index ?? 0
      const payload: BuzzPending = { team, q_index: qIdx, time: Date.now() }

      const attemptSend = () => {
        if (destroyed) return
        // Stop retrying if phase is no longer 'showing' (buzz was acknowledged)
        if (lastKnownState && lastKnownState.bz_phase !== 'showing') {
          if (buzzRetry) { clearInterval(buzzRetry); buzzRetry = null }
          return
        }
        // 1. Broadcast via Realtime (instant; no RLS; admin receives on same channel)
        if (channelReady) ch.send({ type: 'broadcast', event: 'buzz', payload })
        // 2. DB write as backup (admin 200ms poll + viewer backup processor)
        saveBuzzPending(team, qIdx).catch(() => {})
      }

      attemptSend()
      // Retry every 400 ms until the admin acknowledges (phase changes from 'showing')
      buzzRetry = setInterval(attemptSend, 400)
    },

    submitISAnswer: (team, problemIndex, answer) => {
      saveISAnswer(team, problemIndex, answer).catch(() => {})
    },
  }
}
