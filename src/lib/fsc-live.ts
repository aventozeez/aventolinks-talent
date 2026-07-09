import { supabaseAdmin as supabase } from './supabase'
import { wsSubscribe, wsBroadcast } from './ws-sync'

// ── Constants ─────────────────────────────────────────────────────────────────
export const FSC_CHANNEL    = 'fsc-live'
export const FSC_ID         = 'default'

export const RF_Q_COUNT     = 10
export const RF_TIME_MS     = 60_000   // 60 s per team
export const RF_CORRECT_PTS = 10

export const BZ_Q_COUNT            = 10
export const BZ_CORRECT_PTS        = 10
export const BZ_PENALTY_PTS        = 5   // first buzzer wrong → -5
export const BZ_SECOND_CHANCE_PTS  = 5   // opponent answers correctly on second chance → +5
export const BZ_TIME_MS            = 10_000  // 10 s countdown after buzz

export const IS_PROB_COUNT  = 2
export const IS_TIME_MS     = 60_000  // 60 s to arrange
export const IS_STEP_PTS    = 10      // per correct step (5 steps max = 50)
export const IS_BONUS_PTS   = 20      // bonus if ALL steps correct

// ── Types ─────────────────────────────────────────────────────────────────────
export type FSCRound  = 'idle' | 'rapid_fire' | 'buzzer' | 'innovation_sprint' | 'mystery_chain' | 'audio_visual' | 'finished'
export type RFPhase   =
  | 'idle'
  | 'announce_a'
  | 'a_playing'
  | 'score_a'
  | 'announce_b'
  | 'b_playing'
  | 'score_b'
  | 'compare'
  | 'done'
export type BZPhase   = 'idle' | 'showing' | 'buzzed_a' | 'buzzed_b' | 'second_chance' | 'revealed' | 'done'
export type ISPhase   = 'idle' | 'working' | 'collecting' | 'solution' | 'revealed' | 'compare' | 'done'
export type BZResult  = null | 'correct_a' | 'correct_b' | 'penalty_a' | 'penalty_b' | 'bonus_a' | 'bonus_b' | 'skip'
export type MCPhase   = 'idle' | 'story' | 'a_playing' | 'b_playing' | 'c_playing' | 'done'
export type AVPhase   = 'idle' | 'a_playing' | 'break' | 'b_playing' | 'done'

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

export type MysteryPuzzle = {
  id: string
  clue: string
  scrambled: string
  answer: string
  story: string
  image_url?: string
}

export type FSCState = {
  team_a_name: string
  team_b_name: string
  team_c_name?: string          // 3-Team Final only
  round: FSCRound

  // Scores (cumulative per round)
  rf_score_a: number; rf_score_b: number
  bz_score_a: number; bz_score_b: number
  is_score_a: number; is_score_b: number

  // Carried scores (from previous matches)
  carried_score_a?: number
  carried_score_b?: number
  carried_score_c?: number

  // ── Rapid Fire ──
  rf_phase: RFPhase
  rf_q_index: number
  rf_questions: FSCQuestion[]
  rf_questions_b: FSCQuestion[]
  rf_timer_start: number | null
  rf_correct_a: number
  rf_correct_b: number

  // ── Buzzer ──
  bz_phase: BZPhase
  bz_q_index: number
  bz_questions: FSCQuestion[]
  bz_buzz_start: number | null
  bz_second_chance_team: 'a' | 'b' | null
  bz_last_result: BZResult

  // ── Innovation Sprint ──
  is_phase: ISPhase
  is_problem_index: number
  is_problems: ISProblem[]
  is_timer_start: number | null
  is_team_a_answer: string[] | null
  is_team_b_answer: string[] | null
  is_step_results_a: boolean[] | null
  is_step_results_b: boolean[] | null
  // Per-problem grades so the final comparison screen can show each problem
  // side-by-side. Index N holds the score awarded on problem N (0-indexed).
  is_problem_scores_a: number[]
  is_problem_scores_b: number[]

  // ── Mystery Chain (3-Team Final) ──
  mc_phase: MCPhase
  mc_scenario_title: string
  mc_opening_story: string
  mc_puzzles_a: MysteryPuzzle[]
  mc_puzzles_b: MysteryPuzzle[]
  mc_puzzles_c: MysteryPuzzle[]
  mc_q_index: number            // current puzzle index for active team
  mc_timer_start: number | null
  mc_correct_a: number
  mc_correct_b: number
  mc_correct_c: number
  mc_score_a: number
  mc_score_b: number
  mc_score_c: number
  mc_revealed: boolean          // true = show answer + story for current puzzle

  // ── Audio Visual (Grand Final) ──
  av_phase: AVPhase
  av_questions_a: FSCQuestion[]
  av_questions_b: FSCQuestion[]
  av_q_index: number
  av_timer_start: number | null
  av_correct_a: number
  av_correct_b: number
  av_score_a: number
  av_score_b: number
}

export const makeDefaultState = (a = 'Team A', b = 'Team B', c?: string): FSCState => ({
  team_a_name: a, team_b_name: b, team_c_name: c,
  round: 'idle',
  rf_score_a: 0, rf_score_b: 0,
  bz_score_a: 0, bz_score_b: 0,
  is_score_a: 0, is_score_b: 0,
  rf_phase: 'idle', rf_q_index: 0, rf_questions: [], rf_questions_b: [],
  rf_timer_start: null, rf_correct_a: 0, rf_correct_b: 0,
  bz_phase: 'idle', bz_q_index: 0, bz_questions: [],
  bz_buzz_start: null, bz_second_chance_team: null, bz_last_result: null,
  is_phase: 'idle', is_problem_index: 0, is_problems: [],
  is_timer_start: null, is_team_a_answer: null, is_team_b_answer: null,
  is_step_results_a: null, is_step_results_b: null,
  is_problem_scores_a: [], is_problem_scores_b: [],
  mc_phase: 'idle', mc_scenario_title: '', mc_opening_story: '',
  mc_puzzles_a: [], mc_puzzles_b: [], mc_puzzles_c: [],
  mc_q_index: 0, mc_timer_start: null,
  mc_correct_a: 0, mc_correct_b: 0, mc_correct_c: 0,
  mc_score_a: 0, mc_score_b: 0, mc_score_c: 0,
  mc_revealed: false,
  av_phase: 'idle', av_questions_a: [], av_questions_b: [],
  av_q_index: 0, av_timer_start: null,
  av_correct_a: 0, av_correct_b: 0, av_score_a: 0, av_score_b: 0,
})

/** Strip answers before broadcasting to viewers */
export const safeForViewers = (s: FSCState): FSCState => ({
  ...s,
  rf_questions:   s.rf_questions.map(q => ({ ...q, answer: '' })),
  rf_questions_b: (s.rf_questions_b ?? []).map(q => ({ ...q, answer: '' })),
  bz_questions:   s.bz_questions.map(q => ({ ...q, answer: '' })),
  is_problems:    (s.is_phase === 'solution' || s.is_phase === 'revealed')
                    ? s.is_problems
                    : s.is_problems.map(p => ({ ...p, steps: [] })),
  // Strip MC puzzle answers unless revealed
  mc_puzzles_a: s.mc_revealed ? s.mc_puzzles_a : s.mc_puzzles_a.map(p => ({ ...p, answer: '', story: '' })),
  mc_puzzles_b: s.mc_revealed ? s.mc_puzzles_b : s.mc_puzzles_b.map(p => ({ ...p, answer: '', story: '' })),
  mc_puzzles_c: s.mc_revealed ? s.mc_puzzles_c : s.mc_puzzles_c.map(p => ({ ...p, answer: '', story: '' })),
  av_questions_a: s.av_questions_a.map(q => ({ ...q, answer: '' })),
  av_questions_b: s.av_questions_b.map(q => ({ ...q, answer: '' })),
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

// ── Pools & Saved Matches ─────────────────────────────────────────────────────

export type PoolType = 'rapid_fire' | 'buzzer' | 'sprint' | 'audio_visual'

export type QuestionPool = {
  id: string
  name: string
  type: PoolType
  question_ids: string[]
  created_at: string
}

export type MatchStage = 'r16' | 'qf' | 'sf' | '3team' | 'grand_final'

export type SavedMatch = {
  id: string
  name: string
  team_a_name: string
  team_b_name: string
  rf_pool_id: string | null
  rf_pool_id_b: string | null
  bz_pool_id: string | null
  is_pool_id: string | null
  is_pool_id_2: string | null
  status: 'draft' | 'live' | 'completed'
  created_at: string
  final_score_a?: number
  final_score_b?: number
  winner?: string
  // Per-round breakdown captured when the match finishes (RF + BZ + IS
  // preliminary matches, and the 3-Team-Final for teams A/B/C).
  rf_score_a?: number; rf_score_b?: number; rf_score_c?: number
  bz_score_a?: number; bz_score_b?: number; bz_score_c?: number
  is_score_a?: number; is_score_b?: number; is_score_c?: number
  // Bracket fields
  stage?: MatchStage
  match_code?: string           // 'M1'..'M8','QF1'..'QF4','SF1','SF2','3TF','GF'
  feeds_into?: string           // match_code of next match
  feeds_into_slot?: 'a' | 'b'  // which slot in the next match
  // 3-Team Final
  team_c_name?: string
  carried_score_a?: number      // scores carried from previous rounds
  carried_score_b?: number
  carried_score_c?: number
  mc_pool_id_a?: string | null  // Mystery Chain puzzle pools
  mc_pool_id_b?: string | null
  mc_pool_id_c?: string | null
  mc_score_a?: number
  mc_score_b?: number
  mc_score_c?: number
  final_score_c?: number
  winner_2?: string             // second place (for 3TF)
  // Grand Final
  av_pool_id_a?: string | null  // Audio Visual question pools
  av_pool_id_b?: string | null
  av_score_a?: number
  av_score_b?: number
}

// ── Schools ───────────────────────────────────────────────────────────────────

export type School = {
  id: string
  name: string
  nickname?: string
  slot: number  // 1–16, determines bracket position
}

const SCHOOLS_ROW_ID = 'fsc_schools'

export async function getSchools(): Promise<School[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('fsc_match_state').select('data').eq('id', SCHOOLS_ROW_ID).maybeSingle()
  return (data?.data?.schools as School[]) ?? []
}

export async function saveSchools(schools: School[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('fsc_match_state')
    .upsert({ id: SCHOOLS_ROW_ID, data: { schools }, updated_at: new Date().toISOString() }, { onConflict: 'id' })
}

// ── Bracket template ──────────────────────────────────────────────────────────

export const BRACKET_TEMPLATE: Array<{
  match_code: string
  stage: MatchStage
  name: string
  slot_a?: number
  slot_b?: number
  feeds_into?: string
  feeds_into_slot?: 'a' | 'b'
}> = [
  { match_code: 'M1',  stage: 'r16',    name: 'Round of 16 — Match 1', slot_a: 1,  slot_b: 2,  feeds_into: 'QF1', feeds_into_slot: 'a' },
  { match_code: 'M2',  stage: 'r16',    name: 'Round of 16 — Match 2', slot_a: 3,  slot_b: 4,  feeds_into: 'QF1', feeds_into_slot: 'b' },
  { match_code: 'M3',  stage: 'r16',    name: 'Round of 16 — Match 3', slot_a: 5,  slot_b: 6,  feeds_into: 'QF2', feeds_into_slot: 'a' },
  { match_code: 'M4',  stage: 'r16',    name: 'Round of 16 — Match 4', slot_a: 7,  slot_b: 8,  feeds_into: 'QF2', feeds_into_slot: 'b' },
  { match_code: 'M5',  stage: 'r16',    name: 'Round of 16 — Match 5', slot_a: 9,  slot_b: 10, feeds_into: 'QF3', feeds_into_slot: 'a' },
  { match_code: 'M6',  stage: 'r16',    name: 'Round of 16 — Match 6', slot_a: 11, slot_b: 12, feeds_into: 'QF3', feeds_into_slot: 'b' },
  { match_code: 'M7',  stage: 'r16',    name: 'Round of 16 — Match 7', slot_a: 13, slot_b: 14, feeds_into: 'QF4', feeds_into_slot: 'a' },
  { match_code: 'M8',  stage: 'r16',    name: 'Round of 16 — Match 8', slot_a: 15, slot_b: 16, feeds_into: 'QF4', feeds_into_slot: 'b' },
  { match_code: 'QF1', stage: 'qf',     name: 'Quarter Final 1',                               feeds_into: 'SF1', feeds_into_slot: 'a' },
  { match_code: 'QF2', stage: 'qf',     name: 'Quarter Final 2',                               feeds_into: 'SF1', feeds_into_slot: 'b' },
  { match_code: 'QF3', stage: 'qf',     name: 'Quarter Final 3',                               feeds_into: 'SF2', feeds_into_slot: 'a' },
  { match_code: 'QF4', stage: 'qf',     name: 'Quarter Final 4',                               feeds_into: 'SF2', feeds_into_slot: 'b' },
  { match_code: 'SF1', stage: 'sf',     name: 'Semi Final 1',                                  feeds_into: '3TF', feeds_into_slot: 'a' },
  { match_code: 'SF2', stage: 'sf',     name: 'Semi Final 2',                                  feeds_into: '3TF', feeds_into_slot: 'b' },
  { match_code: '3TF', stage: '3team',  name: '3-Team Final — Mystery Chain',                  feeds_into: 'GF',  feeds_into_slot: 'a' },
  { match_code: 'GF',  stage: 'grand_final', name: 'Grand Final — Audio Visual' },
]

export function generateBracketMatches(schools: School[]): SavedMatch[] {
  const bySlot = Object.fromEntries(schools.map(s => [s.slot, s]))
  const displayName = (slot: number) => {
    const sc = bySlot[slot]
    return sc ? (sc.nickname || sc.name) : `TBD (Slot ${slot})`
  }
  return BRACKET_TEMPLATE.map(t => ({
    id: `bracket_${t.match_code}`,
    name: t.name,
    team_a_name: t.slot_a ? displayName(t.slot_a) : 'TBD',
    team_b_name: t.slot_b ? displayName(t.slot_b) : 'TBD',
    team_c_name: t.match_code === '3TF' ? 'TBD (Best Loser)' : undefined,
    rf_pool_id: null,
    rf_pool_id_b: null,
    bz_pool_id: null,
    is_pool_id: null,
    is_pool_id_2: null,
    status: 'draft' as const,
    created_at: new Date().toISOString(),
    stage: t.stage,
    match_code: t.match_code,
    feeds_into: t.feeds_into,
    feeds_into_slot: t.feeds_into_slot,
  }))
}

// ── Mystery Chain ─────────────────────────────────────────────────────────────

export type MysteryPack = {
  id: string
  name: string
  scenario_title: string
  opening_story: string
  final_message: string
  puzzles: MysteryPuzzle[]
  created_at: string
}

const MYSTERY_PACKS_ROW_ID = 'fsc_mystery_packs'

export async function getMysteryPacks(): Promise<MysteryPack[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('fsc_match_state').select('data').eq('id', MYSTERY_PACKS_ROW_ID).maybeSingle()
  return (data?.data?.packs as MysteryPack[]) ?? []
}

export async function saveMysteryPacks(packs: MysteryPack[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('fsc_match_state')
    .upsert({ id: MYSTERY_PACKS_ROW_ID, data: { packs }, updated_at: new Date().toISOString() }, { onConflict: 'id' })
}

export const MC_PUZZLE_COUNT = 10
export const MC_TIME_MS      = 60_000   // 60s per team
export const MC_CORRECT_PTS  = 10

const POOLS_ROW_ID   = 'fsc_pools_config'
const MATCHES_ROW_ID = 'fsc_saved_matches'

export async function getPools(): Promise<QuestionPool[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('fsc_match_state').select('data').eq('id', POOLS_ROW_ID).maybeSingle()
  return (data?.data?.pools as QuestionPool[]) ?? []
}

export async function savePools(pools: QuestionPool[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('fsc_match_state')
    .upsert({ id: POOLS_ROW_ID, data: { pools }, updated_at: new Date().toISOString() }, { onConflict: 'id' })
}

export async function getSavedMatches(): Promise<SavedMatch[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('fsc_match_state').select('data').eq('id', MATCHES_ROW_ID).maybeSingle()
  return (data?.data?.matches as SavedMatch[]) ?? []
}

export async function saveSavedMatchesList(matches: SavedMatch[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('fsc_match_state')
    .upsert({ id: MATCHES_ROW_ID, data: { matches }, updated_at: new Date().toISOString() }, { onConflict: 'id' })
}

// ── Change signature (poll dedup) ─────────────────────────────────────────────
export const stateSig = (s: FSCState) =>
  [s.round, s.rf_phase, s.rf_q_index, s.rf_correct_a, s.rf_correct_b,
   s.bz_phase, s.bz_q_index, s.bz_last_result,
   s.is_phase, s.is_problem_index,
   s.rf_score_a, s.rf_score_b, s.bz_score_a, s.bz_score_b, s.is_score_a, s.is_score_b,
   s.is_team_a_answer?.length ?? -1, s.is_team_b_answer?.length ?? -1,
   s.mc_phase, s.mc_q_index, s.mc_revealed, s.mc_score_a, s.mc_score_b, s.mc_score_c,
   s.av_phase, s.av_q_index, s.av_score_a, s.av_score_b,
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
  let buzzRetry: ReturnType<typeof setInterval> | null = null

  const deliver = (s: FSCState) => {
    if (destroyed) return
    const sv = stateSig(s)
    if (sv === lastSig) return
    lastSig = sv
    lastKnownState = s
    if (s.bz_phase !== 'showing' && buzzRetry) {
      clearInterval(buzzRetry)
      buzzRetry = null
    }
    cb(s)
  }

  // Seed with current DB state immediately
  getMatchState().then(s => { if (s && !destroyed) deliver(safeForViewers(s)) })

  // WebSocket push — instant updates from local server
  const unsubState = wsSubscribe(FSC_CHANNEL + ':state', (payload) => deliver(payload as FSCState))
  const unsubReload = wsSubscribe(FSC_CHANNEL + ':reload', () => {
    if (typeof window !== 'undefined') window.location.reload()
  })
  const unsubBuzz = wsSubscribe(FSC_CHANNEL + ':buzz', async (payload) => {
    // Buzz received — process it like the old Supabase broadcast path
    const p = payload as BuzzPending
    if (!lastKnownState || lastKnownState.bz_phase !== 'showing') return
    const fullState = await getMatchState()
    if (!fullState || destroyed) return
    if (fullState.bz_phase !== 'showing') return
    const buzzedPhase = p.team === 'a' ? 'buzzed_a' : 'buzzed_b'
    const updated: FSCState = { ...fullState, bz_phase: buzzedPhase, bz_buzz_start: p.time }
    await saveMatchState(updated).catch(() => {})
    await clearBuzzPending().catch(() => {})
    deliver(safeForViewers(updated))
  })

  return {
    unsubscribe: () => {
      destroyed = true
      if (buzzRetry) { clearInterval(buzzRetry); buzzRetry = null }
      unsubState(); unsubReload(); unsubBuzz()
    },

    sendBuzz: (team: 'a' | 'b', qIndex?: number) => {
      if (destroyed) return
      if (buzzRetry) { clearInterval(buzzRetry); buzzRetry = null }
      const qIdx = qIndex ?? lastKnownState?.bz_q_index ?? 0
      const payload: BuzzPending = { team, q_index: qIdx, time: Date.now() }

      const attemptSend = () => {
        if (destroyed) return
        if (lastKnownState && lastKnownState.bz_phase !== 'showing') {
          if (buzzRetry) { clearInterval(buzzRetry); buzzRetry = null }
          return
        }
        wsBroadcast(FSC_CHANNEL + ':buzz', payload)
        saveBuzzPending(team, qIdx).catch(() => {})
      }

      attemptSend()
      buzzRetry = setInterval(attemptSend, 400)
    },

    submitISAnswer: (team, problemIndex, answer) => {
      saveISAnswer(team, problemIndex, answer).catch(() => {})
    },
  }
}
