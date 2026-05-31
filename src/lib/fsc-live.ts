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
  sendBuzz: (team: 'a' | 'b') => void | Promise<void>
  submitISAnswer: (team: 'a' | 'b', problemIndex: number, answer: string[]) => void
} {
  let lastSig = ''
  let destroyed = false

  const deliver = (s: FSCState) => {
    if (destroyed) return
    const sv = stateSig(s)
    if (sv === lastSig) return
    lastSig = sv
    cb(s)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = (supabase.channel(FSC_CHANNEL) as any)
    .on('broadcast', { event: 'state' }, (msg: { payload: FSCState }) => {
      deliver(msg.payload)
    })
    .subscribe()

  const fetchAndDeliver = async () => {
    if (destroyed) return
    const s = await getMatchState()
    if (!s || destroyed) return
    deliver(safeForViewers(s))
  }

  // Fetch immediately on subscribe so the page is never blank
  fetchAndDeliver()

  // Poll every 1 000 ms (fast enough to feel live; halved from 2 000 ms)
  const poll = setInterval(fetchAndDeliver, 1000)

  // Re-sync instantly when the user switches back to this tab
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchAndDeliver()
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible)
  }

  return {
    unsubscribe: () => {
      destroyed = true
      supabase.removeChannel(ch)
      clearInterval(poll)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible)
      }
    },

    /** Write buzz directly to DB + broadcast — no admin tab required */
    sendBuzz: async (team: 'a' | 'b') => {
      if (destroyed) return
      const s = await getMatchState()
      // Bail if question is no longer showing (another team buzzed first)
      if (!s || s.bz_phase !== 'showing') return
      const newState: FSCState = {
        ...s,
        bz_phase: team === 'a' ? 'buzzed_a' : 'buzzed_b',
        bz_buzz_start: Date.now(),
      }
      await saveMatchState(newState)
      const safe = safeForViewers(newState)
      // Broadcast to all viewers (including admin) immediately
      ch.send({ type: 'broadcast', event: 'state', payload: safe })
      // Also update this page right away
      deliver(safe)
    },

    submitISAnswer: (team, problemIndex, answer) => {
      saveISAnswer(team, problemIndex, answer).catch(() => {})
    },
  }
}
