'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { wsSubscribe, wsBroadcast } from '@/lib/ws-sync'
import { supabase, supabaseAdmin } from '@/lib/supabase'

const CHANNEL = 'tie:state'
const ROUND_MS = 30_000                // 30 seconds per team
const DEFAULT_POOL_SIZE = 30           // 30 questions per pool (min for a valid pool)
const PTS_CORRECT = 1
// Saved tie-breaker matches — Supabase row id.
const TB_MATCHES_ROW_ID = 'tie_saved_matches'

type SavedTBMatch = {
  id: string
  teamA: string
  teamB: string
  teamC?: string
  poolAId: string
  poolBId: string
  poolCId?: string
  poolATitle: string
  poolBTitle: string
  poolCTitle?: string
  scoreA: number
  scoreB: number
  scoreC?: number
  correctA: number
  correctB: number
  correctC?: number
  winner: string   // team name, "Tie", or comma-separated names for multi-way tie
  played_at: string
}

async function getSavedTBMatches(): Promise<SavedTBMatch[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('fsc_match_state').select('data').eq('id', TB_MATCHES_ROW_ID).maybeSingle()
    return (data?.data?.matches as SavedTBMatch[]) ?? []
  } catch { return [] }
}
async function saveTBMatchesList(matches: SavedTBMatch[]): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('fsc_match_state')
      .upsert({ id: TB_MATCHES_ROW_ID, data: { matches }, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  } catch { /* offline — matches only persist in-memory this session */ }
}

type RegisteredTeam = { id: string; name: string; school: string }

type TBQuestion = { id: string; text: string; answer: string }
type TBPool = { id: string; title: string; questions: TBQuestion[] }

type TBPhase =
  | 'setup'
  | 'intro'
  | 'announce_a'
  | 'a_playing'
  | 'score_a'
  | 'announce_b'
  | 'b_playing'
  | 'score_b'
  | 'announce_c'
  | 'c_playing'
  | 'score_c'
  | 'compare'

type TBState = {
  phase: TBPhase
  // 3-team mode (used for a 3-way MC tie). Optional to keep older payloads
  // backward-compatible — everything defaults to the classic A-vs-B flow.
  threeTeam?: boolean
  teamA: string
  teamB: string
  teamC?: string
  priorA: number
  priorB: number
  priorC?: number
  pools: TBPool[]                // multiple pools; the host picks a DIFFERENT one per team
  chosenPoolA: string | null     // pool team A played (locked when their round starts)
  chosenPoolB: string | null     // pool team B played (locked when their round starts)
  chosenPoolC?: string | null
  queueA: TBQuestion[]
  queueB: TBQuestion[]
  queueC?: TBQuestion[]
  scoreA: number
  scoreB: number
  scoreC?: number
  correctA: number
  correctB: number
  correctC?: number
  timerStart: number | null
  currentQ: TBQuestion | null
  showAnswer: boolean
}

// ── Default pools ─────────────────────────────────────────────────────────
// 3 themed pools of 20 questions. Admin can edit anything before starting.

const POOL_1: Omit<TBQuestion, 'id'>[] = [
  { text: 'What is the capital of Nigeria?', answer: 'Abuja' },
  { text: 'How many states are there in Nigeria?', answer: '36' },
  { text: 'Who is credited with inventing the light bulb?', answer: 'Thomas Edison' },
  { text: 'What is the largest planet in our solar system?', answer: 'Jupiter' },
  { text: 'What is the chemical symbol for gold?', answer: 'Au' },
  { text: 'What is the tallest mountain in the world?', answer: 'Mount Everest' },
  { text: 'Who wrote "Romeo and Juliet"?', answer: 'William Shakespeare' },
  { text: 'What is the speed of light (km/s)?', answer: '300,000' },
  { text: 'In which continent is the Sahara desert?', answer: 'Africa' },
  { text: 'What year did Nigeria gain independence?', answer: '1960' },
  { text: 'How many bones are in the adult human body?', answer: '206' },
  { text: 'What is the smallest prime number?', answer: '2' },
  { text: 'Which planet is known as the Red Planet?', answer: 'Mars' },
  { text: 'What is the currency of Ghana?', answer: 'Cedi' },
  { text: 'Who painted the Mona Lisa?', answer: 'Leonardo da Vinci' },
  { text: 'What is the largest ocean on Earth?', answer: 'Pacific Ocean' },
  { text: 'How many continents are there?', answer: '7' },
  { text: 'Who was the first person to walk on the moon?', answer: 'Neil Armstrong' },
  { text: 'What language is spoken in Brazil?', answer: 'Portuguese' },
  { text: 'What is the boiling point of water in Celsius?', answer: '100' },
  { text: 'Which is the largest country in the world by area?', answer: 'Russia' },
  { text: 'What is the smallest country in the world?', answer: 'Vatican City' },
  { text: 'Which planet has the most moons?', answer: 'Saturn' },
  { text: 'What is the longest river in the world?', answer: 'Nile' },
  { text: 'Who is the author of "Harry Potter"?', answer: 'J.K. Rowling' },
  { text: 'What is the hardest natural substance?', answer: 'Diamond' },
  { text: 'Which gas do humans breathe in to survive?', answer: 'Oxygen' },
  { text: 'In which country are the ancient Pyramids of Giza?', answer: 'Egypt' },
  { text: 'What is the freezing point of water in Celsius?', answer: '0' },
  { text: 'Which continent is Antarctica?', answer: 'Antarctica' },
]

const POOL_2: Omit<TBQuestion, 'id'>[] = [
  { text: 'Who was the first President of Nigeria?', answer: 'Nnamdi Azikiwe' },
  { text: 'What is the currency of Nigeria?', answer: 'Naira' },
  { text: 'Which is the longest river in Nigeria?', answer: 'Niger' },
  { text: 'Who wrote "Things Fall Apart"?', answer: 'Chinua Achebe' },
  { text: 'What is the capital of Kenya?', answer: 'Nairobi' },
  { text: 'Which country has the largest population in Africa?', answer: 'Nigeria' },
  { text: 'Which African country was formerly called Rhodesia?', answer: 'Zimbabwe' },
  { text: "Who was Africa's first female president?", answer: 'Ellen Johnson Sirleaf' },
  { text: "What is the title of Nigeria's national anthem?", answer: 'Arise, O Compatriots' },
  { text: 'In what year did Nigeria become a republic?', answer: '1963' },
  { text: 'What is the largest desert in Africa?', answer: 'Sahara' },
  { text: 'Which African country is completely surrounded by South Africa?', answer: 'Lesotho' },
  { text: 'What is the capital of Ghana?', answer: 'Accra' },
  { text: 'Which country is home to the Great Pyramids?', answer: 'Egypt' },
  { text: 'What is the second most populous country in Africa?', answer: 'Ethiopia' },
  { text: 'Which West African country is home to the ancient city of Timbuktu?', answer: 'Mali' },
  { text: 'What is the highest mountain in Africa?', answer: 'Mount Kilimanjaro' },
  { text: 'Which colour appears in the centre of the Nigerian flag?', answer: 'White' },
  { text: "What is Nigeria's oil-producing region commonly called?", answer: 'Niger Delta' },
  { text: 'Which body of water lies between Nigeria and Cameroon?', answer: 'Gulf of Guinea' },
  { text: 'Which African country has three capital cities?', answer: 'South Africa' },
  { text: 'What is the capital of Ethiopia?', answer: 'Addis Ababa' },
  { text: 'Which African country was never colonised?', answer: 'Ethiopia' },
  { text: 'What is the currency of South Africa?', answer: 'Rand' },
  { text: 'What is the capital of Senegal?', answer: 'Dakar' },
  { text: 'Which sea lies to the east of Africa?', answer: 'Indian Ocean' },
  { text: 'Which African country is home to Mount Kenya?', answer: 'Kenya' },
  { text: 'Who was the second President of Nigeria after independence?', answer: 'Shehu Shagari' },
  { text: 'Which African river passes through Egypt?', answer: 'Nile' },
  { text: 'What is the capital of Morocco?', answer: 'Rabat' },
]

const POOL_3: Omit<TBQuestion, 'id'>[] = [
  { text: 'What is the chemical formula for water?', answer: 'H2O' },
  { text: 'What is the chemical symbol for iron?', answer: 'Fe' },
  { text: 'What is 15 x 12?', answer: '180' },
  { text: 'What is the square root of 144?', answer: '12' },
  { text: 'What is the value of π to 2 decimal places?', answer: '3.14' },
  { text: 'Who invented the telephone?', answer: 'Alexander Graham Bell' },
  { text: 'What year did World War II end?', answer: '1945' },
  { text: 'Who formulated the law of gravity?', answer: 'Isaac Newton' },
  { text: 'What is the largest bone in the human body?', answer: 'Femur' },
  { text: 'What is the powerhouse of the cell?', answer: 'Mitochondria' },
  { text: 'Which planet is closest to the Sun?', answer: 'Mercury' },
  { text: 'How many teeth does an adult human normally have?', answer: '32' },
  { text: 'What gas do plants absorb from the atmosphere for photosynthesis?', answer: 'Carbon dioxide' },
  { text: 'What is the chemical formula for salt?', answer: 'NaCl' },
  { text: 'Who developed the theory of relativity?', answer: 'Albert Einstein' },
  { text: 'What is 2 to the power of 10?', answer: '1024' },
  { text: 'What year did humans first land on the moon?', answer: '1969' },
  { text: 'What is the study of earthquakes called?', answer: 'Seismology' },
  { text: 'What is the freezing point of water in Fahrenheit?', answer: '32' },
  { text: 'Who was the first female Prime Minister of the United Kingdom?', answer: 'Margaret Thatcher' },
  { text: 'What is the chemical symbol for silver?', answer: 'Ag' },
  { text: 'What is the SI unit of electric current?', answer: 'Ampere' },
  { text: 'What planet is known as the "morning star"?', answer: 'Venus' },
  { text: 'How many chambers does the human heart have?', answer: '4' },
  { text: 'Who discovered penicillin?', answer: 'Alexander Fleming' },
  { text: 'What is the pH of pure water?', answer: '7' },
  { text: 'What is the tallest tree species in the world?', answer: 'Redwood' },
  { text: 'How many colors are in a rainbow?', answer: '7' },
  { text: 'What is the smallest unit of matter?', answer: 'Atom' },
  { text: 'How many sides does a hexagon have?', answer: '6' },
]

const makeQ = (q: Omit<TBQuestion, 'id'>): TBQuestion => ({ ...q, id: crypto.randomUUID() })
const makePool = (title: string, arr: Omit<TBQuestion, 'id'>[]): TBPool => ({
  id: crypto.randomUUID(),
  title,
  questions: arr.map(makeQ),
})

const DEFAULT_POOLS = () => [
  makePool('Pool 1', POOL_1),
  makePool('Pool 2', POOL_2),
  makePool('Pool 3', POOL_3),
]

// Blank pool used when the host clicks "+ New Pool"
const makeEmptyPool = (n: number): TBPool => ({
  id: crypto.randomUUID(),
  title: `Pool ${n}`,
  questions: [],
})

const DEFAULT_STATE = (): TBState => ({
  phase: 'setup',
  threeTeam: false,
  teamA: '', teamB: '', teamC: '',
  priorA: 0, priorB: 0, priorC: 0,
  pools: DEFAULT_POOLS(),
  chosenPoolA: null,
  chosenPoolB: null,
  chosenPoolC: null,
  queueA: [], queueB: [], queueC: [],
  scoreA: 0, scoreB: 0, scoreC: 0,
  correctA: 0, correctB: 0, correctC: 0,
  timerStart: null,
  currentQ: null,
  showAnswer: false,
})

export default function TieBreakerAdmin() {
  const [s, setS] = useState<TBState>(DEFAULT_STATE())
  const [poolTab, setPoolTab] = useState<number>(0)  // index of pool currently open for editing
  const [teams, setTeams] = useState<RegisteredTeam[]>([])
  const [savedTBMatches, setSavedTBMatches] = useState<SavedTBMatch[]>([])
  const savedTBRef = useRef<SavedTBMatch[]>([])
  savedTBRef.current = savedTBMatches
  // Pool IDs already used in any saved (undeleted) match — hidden from the
  // setup dropdowns so the same pool can't be replayed.
  const usedPoolIds = new Set<string>(
    savedTBMatches.flatMap(m => [m.poolAId, m.poolBId, m.poolCId].filter(Boolean) as string[])
  )
  const [editingQ, setEditingQ] = useState<string | null>(null)
  const [newQ, setNewQ] = useState({ text: '', answer: '' })
  const [timeLeft, setTimeLeft] = useState(ROUND_MS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Grace window — 10s of extra time after the 30s expires so admin can still
  // grade a last-second answer that came in right at the buzzer.
  const TB_GRACE_MS = 5_000
  const [tbGraceStart, setTbGraceStart] = useState<number | null>(null)
  const tbGraceStartRef = useRef<number | null>(null)
  tbGraceStartRef.current = tbGraceStart
  const [tbGraceMs, setTbGraceMs] = useState(0)
  // Refs to coordinate hydration + broadcast so we don't overwrite existing
  // DB state with the fresh DEFAULT_STATE we start with on page load.
  const hydrated = useRef(false)                 // have we accepted the DB's current state yet?
  const skipNextBroadcast = useRef(true)         // silence the very next broadcast after hydration

  const broadcast = useCallback((st: TBState) => wsBroadcast(CHANNEL, st), [])
  const update = useCallback((patch: Partial<TBState>) => {
    setS(prev => ({ ...prev, ...patch }))
  }, [])

  // On mount: subscribe to the shared state row. The FIRST payload we see is
  // the current DB state — if we haven't started making changes locally, we
  // hydrate from it so a page reload mid-round resumes cleanly.
  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (payload) => {
      if (hydrated.current) return
      hydrated.current = true
      skipNextBroadcast.current = true         // skip the setS-triggered broadcast
      // Migrate a pre-refactor payload that has no `pools` field. Rather than
      // crash, we backfill with the default 3 pools so the setup screen still
      // works — the admin can pick or edit from there.
      const raw = payload as Partial<TBState>
      // Legacy phases from the pre-refactor flow — bump them into the new flow.
      const legacyPhase = raw.phase as string | undefined
      const migratedPhase: TBPhase =
        legacyPhase === 'break' ? 'score_a'
        : legacyPhase === 'done'  ? 'compare'
        : (legacyPhase as TBPhase | undefined) ?? 'setup'
      const migrated: TBState = {
        ...DEFAULT_STATE(),
        ...raw,
        phase: migratedPhase,
        pools: (raw.pools && raw.pools.length > 0) ? raw.pools : DEFAULT_POOLS(),
      }
      setS(migrated)
    })
    // If nothing arrives from the DB after 800ms, assume there's no prior
    // state and unlock our broadcast so the first user action publishes.
    const t = setTimeout(() => { hydrated.current = true }, 800)
    return () => { unsub(); clearTimeout(t) }
  }, [])

  // Broadcast whenever local state changes, but skip the initial render and
  // the setS that happens as a result of hydration.
  useEffect(() => {
    if (skipNextBroadcast.current) { skipNextBroadcast.current = false; return }
    broadcast(s)
  }, [s, broadcast])

  // Load registered teams for the dropdown
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Use the service-role client (matches how the FSC admin loads teams)
        // so RLS on fsc_teams doesn't wipe out the list, and drop the status
        // filter so newly added teams appear even if their status isn't set.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabaseAdmin as any)
          .from('fsc_teams')
          .select('*')
          .order('created_at')
        if (!cancelled && data) setTeams(data as RegisteredTeam[])
      } catch { /* offline — plain text inputs will show */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Load past tie-breaker matches so used pools can be locked out.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await getSavedTBMatches()
      if (!cancelled) setSavedTBMatches(list)
    })()
    return () => { cancelled = true }
  }, [])

  // 30-second countdown for whichever team is currently playing.
  // On expiry, auto-transition to the break screen (team A) or done (team B).
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!s.timerStart || (s.phase !== 'a_playing' && s.phase !== 'b_playing' && s.phase !== 'c_playing')) {
      setTimeLeft(ROUND_MS)
      return
    }
    // Fresh turn → clear any stale grace from the previous team's expiry.
    setTbGraceStart(null); tbGraceStartRef.current = null; setTbGraceMs(0)

    const tick = () => {
      const left = Math.max(0, ROUND_MS - (Date.now() - s.timerStart!))
      setTimeLeft(left)
      // Open the grace window the moment the 30s runs out — do NOT flip yet.
      if (left === 0 && tbGraceStartRef.current === null) {
        const now = Date.now()
        setTbGraceStart(now); tbGraceStartRef.current = now
      }
      // Count the grace window down separately.
      if (tbGraceStartRef.current !== null) {
        const graceLeft = Math.max(0, TB_GRACE_MS - (Date.now() - tbGraceStartRef.current))
        setTbGraceMs(graceLeft)
        if (graceLeft === 0) {
          clearInterval(timerRef.current!)
          const nextPhase: TBPhase =
            s.phase === 'a_playing' ? 'score_a'
            : s.phase === 'b_playing' ? 'score_b'
            : 'score_c'
          update({ phase: nextPhase, timerStart: null, currentQ: null, showAnswer: false })
          setTbGraceStart(null); tbGraceStartRef.current = null; setTbGraceMs(0)
        }
      }
    }
    tick()
    timerRef.current = setInterval(tick, 200)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.timerStart, s.phase])

  // ── Actions ──────────────────────────────────────────────────────────────
  const isPlayingA = s.phase === 'a_playing'
  const isPlayingB = s.phase === 'b_playing'
  const isPlayingC = s.phase === 'c_playing'
  const activeQueue: TBQuestion[] = isPlayingA ? s.queueA : isPlayingB ? s.queueB : isPlayingC ? (s.queueC ?? []) : []
  // Guard everywhere against missing pools — a DB row from before the refactor
  // won't have this field, so we normalise defensively.
  const safePools = s.pools ?? []
  const chosenPoolA = safePools.find(p => p.id === s.chosenPoolA) ?? null
  const chosenPoolB = safePools.find(p => p.id === s.chosenPoolB) ?? null
  const chosenPoolC = safePools.find(p => p.id === s.chosenPoolC) ?? null
  // Which pool is the currently-playing team on? Used for headers + break/done screens.
  const activePool = isPlayingA ? chosenPoolA : isPlayingB ? chosenPoolB : isPlayingC ? chosenPoolC : null

  // Setup → Intro: pools + names locked in, show instructions on projector.
  function goToInstructions() {
    if (!s.teamA.trim() || !s.teamB.trim()) return
    if (!chosenPoolA || !chosenPoolB) return
    if (chosenPoolA.questions.length === 0 || chosenPoolB.questions.length === 0) return
    if (usedPoolIds.has(chosenPoolA.id) || usedPoolIds.has(chosenPoolB.id)) return
    // Distinct pools per team
    if (s.chosenPoolA === s.chosenPoolB) return
    if (s.threeTeam) {
      if (!(s.teamC ?? '').trim()) return
      if (!chosenPoolC || chosenPoolC.questions.length === 0) return
      if (usedPoolIds.has(chosenPoolC.id)) return
      if (s.chosenPoolC === s.chosenPoolA || s.chosenPoolC === s.chosenPoolB) return
    }
    update({ phase: 'intro' })
  }
  function goToAnnounceA() { update({ phase: 'announce_a' }) }
  function goToAnnounceB() { update({ phase: 'announce_b' }) }
  function goToAnnounceC() { update({ phase: 'announce_c' }) }
  function goToCompare() {
    update({ phase: 'compare' })
    // Persist the match on transition to compare — this is where scores are
    // final and every pool has definitely been played through.
    const poolA = safePools.find(p => p.id === s.chosenPoolA)
    const poolB = safePools.find(p => p.id === s.chosenPoolB)
    if (!poolA || !poolB) return
    // Winner logic: 2-team mode = simple compare. 3-team mode = highest score
    // wins, ties named together.
    let winner: string
    if (s.threeTeam) {
      const scoreC = s.scoreC ?? 0
      const rows = [
        { name: s.teamA, score: s.scoreA },
        { name: s.teamB, score: s.scoreB },
        { name: s.teamC ?? 'Team C', score: scoreC },
      ]
      const top = Math.max(...rows.map(r => r.score))
      const leaders = rows.filter(r => r.score === top)
      winner = leaders.length === 1 ? leaders[0].name : leaders.map(l => l.name).join(', ') + ' (tie)'
    } else {
      winner = s.scoreA > s.scoreB ? s.teamA : s.scoreB > s.scoreA ? s.teamB : 'Tie'
    }
    const record: SavedTBMatch = {
      id: crypto.randomUUID(),
      teamA: s.teamA, teamB: s.teamB,
      poolAId: poolA.id, poolBId: poolB.id,
      poolATitle: poolA.title, poolBTitle: poolB.title,
      scoreA: s.scoreA, scoreB: s.scoreB,
      correctA: s.correctA, correctB: s.correctB,
      winner,
      played_at: new Date().toISOString(),
      ...(s.threeTeam && chosenPoolC ? {
        teamC: s.teamC,
        poolCId: chosenPoolC.id,
        poolCTitle: chosenPoolC.title,
        scoreC: s.scoreC ?? 0,
        correctC: s.correctC ?? 0,
      } : {}),
    }
    const next = [...savedTBRef.current, record]
    setSavedTBMatches(next)
    void saveTBMatchesList(next)
  }

  function startTeamA() {
    if (!chosenPoolA || chosenPoolA.questions.length === 0) return
    const queue = chosenPoolA.questions.map(q => ({ ...q }))
    update({
      phase: 'a_playing',
      queueA: queue,
      scoreA: 0,
      correctA: 0,
      timerStart: Date.now(),
      currentQ: queue[0] ?? null,
      showAnswer: false,
    })
  }

  function startTeamB() {
    if (!chosenPoolB || chosenPoolB.questions.length === 0) return
    const queue = chosenPoolB.questions.map(q => ({ ...q }))
    update({
      phase: 'b_playing',
      queueB: queue,
      scoreB: 0,
      correctB: 0,
      timerStart: Date.now(),
      currentQ: queue[0] ?? null,
      showAnswer: false,
    })
  }

  function startTeamC() {
    if (!chosenPoolC || chosenPoolC.questions.length === 0) return
    const queue = chosenPoolC.questions.map(q => ({ ...q }))
    update({
      phase: 'c_playing',
      queueC: queue,
      scoreC: 0,
      correctC: 0,
      timerStart: Date.now(),
      currentQ: queue[0] ?? null,
      showAnswer: false,
    })
  }

  function markCorrect() {
    if (activeQueue.length === 0) return
    const [, ...rest] = activeQueue
    // Auto-advance to the score reveal if the queue just emptied — no need
    // to burn the rest of the 30 seconds on a dead queue.
    const queueEmpty = rest.length === 0
    if (isPlayingA) {
      update({
        queueA: rest,
        scoreA: s.scoreA + PTS_CORRECT,
        correctA: s.correctA + 1,
        currentQ: rest[0] ?? null,
        showAnswer: false,
        ...(queueEmpty ? { phase: 'score_a' as const, timerStart: null } : {}),
      })
    } else if (isPlayingB) {
      update({
        queueB: rest,
        scoreB: s.scoreB + PTS_CORRECT,
        correctB: s.correctB + 1,
        currentQ: rest[0] ?? null,
        showAnswer: false,
        ...(queueEmpty ? { phase: 'score_b' as const, timerStart: null } : {}),
      })
    } else if (isPlayingC) {
      update({
        queueC: rest,
        scoreC: (s.scoreC ?? 0) + PTS_CORRECT,
        correctC: (s.correctC ?? 0) + 1,
        currentQ: rest[0] ?? null,
        showAnswer: false,
        ...(queueEmpty ? { phase: 'score_c' as const, timerStart: null } : {}),
      })
    }
  }

  // Wrong or skip: put current question at the back of the queue, no points lost.
  function recycle() {
    if (activeQueue.length === 0) return
    const [first, ...rest] = activeQueue
    const next = [...rest, first]
    if (isPlayingA) update({ queueA: next, currentQ: next[0] ?? null, showAnswer: false })
    else if (isPlayingB) update({ queueB: next, currentQ: next[0] ?? null, showAnswer: false })
    else if (isPlayingC) update({ queueC: next, currentQ: next[0] ?? null, showAnswer: false })
  }

  function endRoundEarly() {
    // Explicit end clears the grace window too.
    setTbGraceStart(null); tbGraceStartRef.current = null; setTbGraceMs(0)
    if (isPlayingA) update({ phase: 'score_a', timerStart: null, currentQ: null, showAnswer: false })
    else if (isPlayingB) update({ phase: 'score_b', timerStart: null, currentQ: null, showAnswer: false })
    else if (isPlayingC) update({ phase: 'score_c', timerStart: null, currentQ: null, showAnswer: false })
  }

  // Runs another rapid-fire — same teams, questions cycled from the start.
  function playAnotherRound() {
    update({
      phase: 'setup',
      chosenPoolA: null, chosenPoolB: null, chosenPoolC: null,
      queueA: [], queueB: [], queueC: [],
      scoreA: 0, scoreB: 0, scoreC: 0, correctA: 0, correctB: 0, correctC: 0,
      timerStart: null, currentQ: null, showAnswer: false,
    })
  }

  const reset = () => update(DEFAULT_STATE())

  // Pool editing — always targets the pool currently open in the tabs.
  const updatePoolTitle = (val: string) => {
    setS(p => ({
      ...p,
      pools: p.pools.map((pl, i) => i === poolTab ? { ...pl, title: val } : pl),
    }))
  }
  const updateQ = (id: string, field: 'text' | 'answer', val: string) => {
    setS(p => ({
      ...p,
      pools: p.pools.map((pl, i) =>
        i === poolTab ? { ...pl, questions: pl.questions.map(q => q.id === id ? { ...q, [field]: val } : q) } : pl
      ),
    }))
  }
  const deleteQ = (id: string) => {
    setS(p => ({
      ...p,
      pools: p.pools.map((pl, i) =>
        i === poolTab ? { ...pl, questions: pl.questions.filter(q => q.id !== id) } : pl
      ),
    }))
  }
  const addQ = () => {
    if (!newQ.text.trim()) return
    setS(p => ({
      ...p,
      pools: p.pools.map((pl, i) =>
        i === poolTab
          ? { ...pl, questions: [...pl.questions, makeQ({ text: newQ.text.trim(), answer: newQ.answer.trim() })] }
          : pl
      ),
    }))
    setNewQ({ text: '', answer: '' })
  }
  const currentEditingPool = s.pools[poolTab]
  const currentEditingQs = currentEditingPool?.questions ?? []
  const poolReady = (i: number) => (s.pools[i]?.questions.length ?? 0) > 0 && (s.pools[i]?.questions ?? []).every(q => q.answer.trim())

  // ── Derived render values ───────────────────────────────────────────────
  const timePct = timeLeft / ROUND_MS
  const currentQ: TBQuestion | undefined = activeQueue[0]
  const winnerText = s.scoreA > s.scoreB ? s.teamA
                    : s.scoreB > s.scoreA ? s.teamB
                    : 'It\'s a tie — run another round'

  return (
    <div className="h-screen bg-[#0a1628] text-white p-3 overflow-hidden">
      <div className="max-w-4xl mx-auto space-y-3 h-full overflow-y-auto pr-1">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-pink-300 text-[10px] font-bold uppercase tracking-widest">Admin Control</p>
            <h1 className="text-white text-lg font-black">🔔 Tie Breaker · Rapid Fire</h1>
          </div>
          <div className="flex gap-2">
            <a href="/tie-breaker/audience" target="_blank" rel="noopener noreferrer"
              className="text-xs bg-purple-600/30 border border-purple-500/40 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-600/50">
              Audience ↗
            </a>
            {s.phase !== 'setup' && (
              <button onClick={reset} className="text-xs bg-red-600/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg">
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Score strip */}
        <div className={`grid ${s.threeTeam ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
          <div className={`rounded-xl p-3 text-center border ${
            isPlayingA ? 'bg-green-500/20 border-green-500' : 'bg-white/5 border-white/10'
          }`}>
            {isPlayingA && <p className="text-green-300 text-[10px] font-bold uppercase tracking-widest">Playing</p>}
            <p className="text-slate-300 text-xs font-semibold truncate">{s.teamA || 'Team A'}</p>
            <p className="text-white text-2xl font-black">{s.scoreA}</p>
            {s.priorA > 0 && <p className="text-slate-500 text-[10px]">Prior: {s.priorA}</p>}
          </div>
          <div className={`rounded-xl p-3 text-center border ${
            isPlayingB ? 'bg-blue-500/20 border-blue-500' : 'bg-white/5 border-white/10'
          }`}>
            {isPlayingB && <p className="text-blue-300 text-[10px] font-bold uppercase tracking-widest">Playing</p>}
            <p className="text-slate-300 text-xs font-semibold truncate">{s.teamB || 'Team B'}</p>
            <p className="text-white text-2xl font-black">{s.scoreB}</p>
            {s.priorB > 0 && <p className="text-slate-500 text-[10px]">Prior: {s.priorB}</p>}
          </div>
          {s.threeTeam && (
            <div className={`rounded-xl p-3 text-center border ${
              isPlayingC ? 'bg-purple-500/20 border-purple-500' : 'bg-white/5 border-white/10'
            }`}>
              {isPlayingC && <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest">Playing</p>}
              <p className="text-slate-300 text-xs font-semibold truncate">{s.teamC || 'Team C'}</p>
              <p className="text-white text-2xl font-black">{s.scoreC ?? 0}</p>
              {(s.priorC ?? 0) > 0 && <p className="text-slate-500 text-[10px]">Prior: {s.priorC}</p>}
            </div>
          )}
        </div>

        {/* Setup */}
        {s.phase === 'setup' && (
          <div className="space-y-3">
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-3">
              <h2 className="text-white font-bold text-sm">Team Names &amp; Prior Scores</h2>
              <p className="text-slate-400 text-xs">
                Rapid fire: each team gets <b className="text-white">30 seconds</b> to answer as many
                questions as they can. <b className="text-white">+1</b> per correct, no negative marks.
                Wrong or skipped questions cycle to the back so teams can retry.
              </p>
              <label className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/40 px-3 py-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!s.threeTeam}
                  onChange={e => update({ threeTeam: e.target.checked } as Partial<TBState>)}
                  className="w-4 h-4 accent-purple-500"
                />
                <span className="text-purple-200 text-xs font-bold uppercase tracking-widest">3-team tie-breaker</span>
                <span className="text-purple-300/60 text-[10px] italic ml-auto">Use when the MC round is tied between 3 teams</span>
              </label>
              <div className={`grid ${s.threeTeam ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                {(s.threeTeam ? (['A', 'B', 'C'] as const) : (['A', 'B'] as const)).map(letter => {
                  const nameKey = `team${letter}` as const
                  const priorKey = `prior${letter}` as const
                  return (
                    <div key={letter} className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Team {letter}</label>
                      {teams.length > 0 ? (
                        <select
                          value={s[nameKey] ?? ''}
                          onChange={e => update({ [nameKey]: e.target.value } as Partial<TBState>)}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm">
                          <option value="">— select team —</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.name}>{t.name}{t.school ? ` (${t.school})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={s[nameKey] ?? ''}
                          onChange={e => update({ [nameKey]: e.target.value } as Partial<TBState>)}
                          placeholder={`Team ${letter} name`}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm" />
                      )}
                      <input
                        type="number" min="0"
                        value={s[priorKey] || ''}
                        onChange={e => update({ [priorKey]: Number(e.target.value) || 0 } as Partial<TBState>)}
                        placeholder="Prior score (optional)"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm" />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Pool editor — one tab per pool, "+ New Pool" adds another */}
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-sm">Edit Pools</h2>
                <button onClick={() => {
                  const nextIdx = safePools.length + 1
                  const newPool = makeEmptyPool(nextIdx)
                  setS(p => ({ ...p, pools: [...(p.pools ?? []), newPool] }))
                  setPoolTab(safePools.length)   // jump to the new tab
                  setEditingQ(null)
                }}
                  className="text-[10px] bg-purple-600/40 hover:bg-purple-600/70 text-purple-200 px-2 py-1 rounded font-bold">
                  + New Pool
                </button>
              </div>
              <div className="flex gap-2 border-b border-slate-700 pb-1 flex-wrap">
                {safePools.map((pl, i) => (
                  <div key={pl.id} className="flex items-center gap-1">
                    <button onClick={() => { setPoolTab(i); setEditingQ(null) }}
                      className={`text-xs font-bold px-3 py-1.5 rounded-t-lg transition-colors ${
                        poolTab === i
                          ? 'bg-purple-700/40 text-white border border-purple-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}>
                      Pool {i + 1} ({pl.questions.length})
                      {poolReady(i) && <span className="text-green-400 ml-1">✓</span>}
                    </button>
                    {safePools.length > 1 && (
                      <button
                        onClick={() => {
                          if (!window.confirm(`Delete Pool ${i + 1}? This can't be undone.`)) return
                          setS(p => {
                            const newPools = (p.pools ?? []).filter((_, idx) => idx !== i)
                            return {
                              ...p,
                              pools: newPools,
                              chosenPoolA: p.chosenPoolA === pl.id ? null : p.chosenPoolA,
                              chosenPoolB: p.chosenPoolB === pl.id ? null : p.chosenPoolB,
                            }
                          })
                          setPoolTab(t => Math.max(0, t >= i ? t - 1 : t))
                          setEditingQ(null)
                        }}
                        title={`Delete Pool ${i + 1}`}
                        className="text-[10px] text-slate-600 hover:text-red-400 px-1 py-0.5 rounded hover:bg-slate-700">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Pool title */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Pool title</label>
                <input value={currentEditingPool?.title ?? ''} onChange={e => updatePoolTitle(e.target.value)}
                  placeholder="e.g. Pool 1"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm" />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400 font-semibold">
                  Pool {poolTab + 1} questions ({currentEditingQs.length}) — fill in ALL answers
                </label>
              </div>

              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {currentEditingQs.map((q, i) => (
                  <div key={q.id} className="bg-slate-800/60 rounded-lg p-2 flex items-start gap-2">
                    <span className="text-[10px] text-slate-500 font-bold w-5 shrink-0 mt-1">{i + 1}</span>
                    <div className="flex-1 space-y-1">
                      {editingQ === q.id ? (<>
                        <input
                          value={q.text}
                          onChange={e => updateQ(q.id, 'text', e.target.value)}
                          className="w-full bg-slate-700 border border-slate-500 rounded px-2 py-1 text-white text-xs"
                          placeholder="Question" autoFocus />
                        <input
                          value={q.answer}
                          onChange={e => updateQ(q.id, 'answer', e.target.value)}
                          className="w-full bg-slate-700 border border-green-500/40 rounded px-2 py-1 text-green-300 text-xs"
                          placeholder="Answer" />
                        <button onClick={() => setEditingQ(null)} className="text-[10px] text-purple-400 hover:text-purple-300">Done editing</button>
                      </>) : (<>
                        <p className="text-white text-xs leading-snug">{q.text}</p>
                        <p className={`text-[10px] ${q.answer ? 'text-green-400' : 'text-red-400/70 italic'}`}>
                          {q.answer ? `A: ${q.answer}` : '⚠ Answer not set'}
                        </p>
                      </>)}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {editingQ !== q.id && (
                        <button onClick={() => setEditingQ(q.id)} className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-700">Edit</button>
                      )}
                      <button onClick={() => deleteQ(q.id)} className="text-[10px] text-slate-600 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-slate-700">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-slate-800/40 rounded-lg p-2 space-y-1 border border-dashed border-slate-600">
                <input value={newQ.text} onChange={e => setNewQ(p => ({ ...p, text: e.target.value }))}
                  placeholder="New question…" className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs" />
                <input value={newQ.answer} onChange={e => setNewQ(p => ({ ...p, answer: e.target.value }))}
                  placeholder="Answer…" onKeyDown={e => e.key === 'Enter' && addQ()}
                  className="w-full bg-slate-700 border border-green-500/30 rounded px-2 py-1 text-green-300 text-xs" />
                <button onClick={addQ} disabled={!newQ.text.trim()}
                  className="text-[10px] bg-purple-600/40 hover:bg-purple-600/70 disabled:opacity-40 text-purple-300 px-2 py-1 rounded font-semibold">
                  + Add to Pool {poolTab + 1}
                </button>
              </div>
            </div>

            {/* Pool selection — one pool per team, must be different */}
            <div className="bg-[#0d1f3c] border border-pink-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-sm">Assign a Pool to Each Team</h2>
                <p className="text-slate-500 text-[10px]">Must be different pools</p>
              </div>
              <div className={`grid ${s.threeTeam ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                {(s.threeTeam ? (['A', 'B', 'C'] as const) : (['A', 'B'] as const)).map(letter => {
                  const key = `chosenPool${letter}` as const
                  const otherKeys = (['A', 'B', 'C'] as const).filter(l => l !== letter).map(l => `chosenPool${l}` as const)
                  const teamName = s[`team${letter}` as const] || `Team ${letter}`
                  const colour = letter === 'A' ? 'green' : letter === 'B' ? 'blue' : 'purple'
                  return (
                    <div key={letter} className="space-y-1.5">
                      <label className={`text-[10px] text-${colour}-400 font-bold uppercase tracking-widest`}>
                        Pool for {teamName}
                      </label>
                      <select
                        value={(s[key] as string | null | undefined) ?? ''}
                        onChange={e => update({ [key]: e.target.value || null } as Partial<TBState>)}
                        className={`w-full bg-slate-800 border border-${colour}-500/40 rounded-lg px-2 py-2 text-white text-sm`}>
                        <option value="">— select a pool —</option>
                        {safePools.map((pl, i) => {
                          const takenByOther = otherKeys.some(k => pl.id === s[k])
                          const alreadyPlayed = usedPoolIds.has(pl.id)
                          return (
                            <option key={pl.id} value={pl.id} disabled={takenByOther || alreadyPlayed || pl.questions.length === 0}>
                              Pool {i + 1} · {pl.title} ({pl.questions.length}q){takenByOther ? ' — taken' : ''}{alreadyPlayed ? ' — already played' : ''}{pl.questions.length === 0 ? ' — empty' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  )
                })}
              </div>
              {(chosenPoolA && usedPoolIds.has(chosenPoolA.id)) || (chosenPoolB && usedPoolIds.has(chosenPoolB.id)) || (s.threeTeam && chosenPoolC && usedPoolIds.has(chosenPoolC.id)) ? (
                <p className="text-red-300 text-xs bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 text-center">
                  ⚠️ One or more chosen pools have already been used in a past tie-breaker. Pick fresh pools for every team.
                </p>
              ) : null}
              <button
                onClick={goToInstructions}
                disabled={
                  !s.teamA.trim() || !s.teamB.trim() || !chosenPoolA || !chosenPoolB
                  || s.chosenPoolA === s.chosenPoolB
                  || chosenPoolA.questions.length === 0 || chosenPoolB.questions.length === 0
                  || usedPoolIds.has(chosenPoolA.id) || usedPoolIds.has(chosenPoolB.id)
                  || (s.threeTeam && (
                    !(s.teamC ?? '').trim() || !chosenPoolC || chosenPoolC.questions.length === 0
                    || usedPoolIds.has(chosenPoolC.id)
                    || s.chosenPoolC === s.chosenPoolA || s.chosenPoolC === s.chosenPoolB
                  ))
                }
                className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl text-sm">
                📋 Show Instructions on Screen
              </button>
              <p className="text-slate-500 text-[10px] text-center">
                Read the rules to the room, then advance to announce {s.teamA || 'Team A'}.
              </p>
            </div>

            {/* Saved tie-breaker matches — pools already played are locked
                until the match is deleted. */}
            {savedTBMatches.length > 0 && (
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-white font-bold text-sm">Past Tie-Breaker Matches</h2>
                  <span className="text-[10px] text-slate-500">{savedTBMatches.length} played</span>
                </div>
                <div className="space-y-1.5">
                  {savedTBMatches.map(m => (
                    <div key={m.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-bold truncate">
                          {m.teamA} <span className="text-slate-500">vs</span> {m.teamB}
                          {m.teamC && <><span className="text-slate-500"> vs</span> {m.teamC}</>}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {m.poolATitle} · {m.poolBTitle}{m.poolCTitle ? ` · ${m.poolCTitle}` : ''}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          <span className="text-green-400 font-bold">{m.scoreA}</span>
                          <span className="mx-1 text-slate-600">—</span>
                          <span className="text-blue-400 font-bold">{m.scoreB}</span>
                          {m.teamC && <>
                            <span className="mx-1 text-slate-600">—</span>
                            <span className="text-purple-400 font-bold">{m.scoreC ?? 0}</span>
                          </>}
                          <span className="mx-1 text-slate-600">·</span>
                          🏆 {m.winner}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (!window.confirm(`Delete this match? Pools "${m.poolATitle}" and "${m.poolBTitle}" will become selectable again.`)) return
                          const next = savedTBMatches.filter(x => x.id !== m.id)
                          setSavedTBMatches(next)
                          void saveTBMatchesList(next)
                        }}
                        title="Delete match — reopens its pools"
                        className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded text-xs font-black">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 italic">Deleting a match reopens its pools for reuse in a future tie-breaker.</p>
              </div>
            )}
          </div>
        )}

        {/* Intro — instructions live on the projector; admin reads then continues */}
        {s.phase === 'intro' && (
          <div className="bg-gradient-to-br from-pink-500/10 to-[#0a1628] border border-pink-500/40 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-pink-300 text-[10px] font-bold uppercase tracking-[0.3em]">Instructions on Projector</p>
            <p className="text-white text-lg font-black leading-snug">
              Read the tie-breaker rules to {s.teamA} and {s.teamB}, then advance when they&apos;re ready.
            </p>
            <p className="text-slate-400 text-xs">
              Pool for <b className="text-green-400">{s.teamA}</b>: {chosenPoolA?.title}
              <span className="mx-2 text-slate-600">·</span>
              Pool for <b className="text-blue-400">{s.teamB}</b>: {chosenPoolB?.title}
            </p>
            <button
              onClick={goToAnnounceA}
              className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-3 rounded-xl text-sm">
              ▶ Announce {s.teamA || 'Team A'}
            </button>
            <button
              onClick={() => update({ phase: 'setup' })}
              className="w-full bg-transparent hover:bg-white/5 text-slate-400 py-1.5 rounded-lg text-[10px]">
              ← Back to setup
            </button>
          </div>
        )}

        {/* Announce Team A — projector shows big "Team A up next" screen */}
        {s.phase === 'announce_a' && (
          <div className="bg-gradient-to-br from-green-500/10 to-[#0a1628] border border-green-500/40 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-green-300 text-[10px] font-bold uppercase tracking-[0.3em]">Up Next</p>
            <p className="text-white text-2xl font-black">{s.teamA}</p>
            <p className="text-slate-400 text-xs">
              Playing <b className="text-white">{chosenPoolA?.title}</b> · 30 seconds
            </p>
            <button
              onClick={startTeamA}
              disabled={!chosenPoolA || chosenPoolA.questions.length === 0}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-black py-3 rounded-xl text-sm">
              ▶ Start {s.teamA}&apos;s 30 seconds
            </button>
          </div>
        )}

        {/* Score reveal — Team A */}
        {s.phase === 'score_a' && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-green-500/15 to-[#0a1628] border-2 border-green-500/50 rounded-2xl p-5 text-center space-y-2">
              <p className="text-green-300 text-[10px] font-bold uppercase tracking-[0.3em]">{s.teamA} — Score</p>
              <p className="text-white text-6xl font-black">{s.scoreA}</p>
              <p className="text-slate-400 text-xs">
                {s.correctA} correct · {chosenPoolA?.title}
              </p>
            </div>
            <button
              onClick={goToAnnounceB}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-sm">
              ▶ Announce {s.teamB || 'Team B'}
            </button>
          </div>
        )}

        {/* Announce Team B */}
        {s.phase === 'announce_b' && (
          <div className="bg-gradient-to-br from-blue-500/10 to-[#0a1628] border border-blue-500/40 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-blue-300 text-[10px] font-bold uppercase tracking-[0.3em]">Up Next</p>
            <p className="text-white text-2xl font-black">{s.teamB}</p>
            <p className="text-slate-400 text-xs">
              Playing <b className="text-white">{chosenPoolB?.title}</b> · 30 seconds
            </p>
            <button
              onClick={startTeamB}
              disabled={!chosenPoolB || chosenPoolB.questions.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black py-3 rounded-xl text-sm">
              ▶ Start {s.teamB}&apos;s 30 seconds
            </button>
          </div>
        )}

        {/* Score reveal — Team B */}
        {s.phase === 'score_b' && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-blue-500/15 to-[#0a1628] border-2 border-blue-500/50 rounded-2xl p-5 text-center space-y-2">
              <p className="text-blue-300 text-[10px] font-bold uppercase tracking-[0.3em]">{s.teamB} — Score</p>
              <p className="text-white text-6xl font-black">{s.scoreB}</p>
              <p className="text-slate-400 text-xs">
                {s.correctB} correct · {chosenPoolB?.title}
              </p>
            </div>
            {s.threeTeam ? (
              <button
                onClick={goToAnnounceC}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black py-3 rounded-xl text-sm">
                ▶ Announce {s.teamC || 'Team C'}
              </button>
            ) : (
              <button
                onClick={goToCompare}
                className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-3 rounded-xl text-sm">
                ▶ Show Final Comparison
              </button>
            )}
          </div>
        )}

        {/* Announce Team C (3-team mode only) */}
        {s.phase === 'announce_c' && (
          <div className="bg-gradient-to-br from-purple-500/10 to-[#0a1628] border border-purple-500/40 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-purple-300 text-[10px] font-bold uppercase tracking-[0.3em]">Up Next</p>
            <p className="text-white text-2xl font-black">{s.teamC}</p>
            <p className="text-slate-400 text-xs">
              Playing <b className="text-white">{chosenPoolC?.title}</b> · 30 seconds
            </p>
            <button
              onClick={startTeamC}
              disabled={!chosenPoolC || chosenPoolC.questions.length === 0}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-black py-3 rounded-xl text-sm">
              ▶ Start {s.teamC}&apos;s 30 seconds
            </button>
          </div>
        )}

        {/* Score reveal — Team C (3-team mode only) */}
        {s.phase === 'score_c' && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-purple-500/15 to-[#0a1628] border-2 border-purple-500/50 rounded-2xl p-5 text-center space-y-2">
              <p className="text-purple-300 text-[10px] font-bold uppercase tracking-[0.3em]">{s.teamC} — Score</p>
              <p className="text-white text-6xl font-black">{s.scoreC ?? 0}</p>
              <p className="text-slate-400 text-xs">
                {s.correctC ?? 0} correct · {chosenPoolC?.title}
              </p>
            </div>
            <button
              onClick={goToCompare}
              className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-3 rounded-xl text-sm">
              ▶ Show Final Comparison
            </button>
          </div>
        )}

        {/* Playing (any team) */}
        {(isPlayingA || isPlayingB || isPlayingC) && (
          <div className="space-y-3">
            {/* Timer */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isPlayingA ? 'text-green-300' : isPlayingB ? 'text-blue-300' : 'text-purple-300'}`}>
                    {isPlayingA ? s.teamA : isPlayingB ? s.teamB : s.teamC} · Rapid Fire
                  </p>
                  <p className="text-white text-sm font-bold">
                    {activeQueue.length} left {activePool ? `· ${activePool.title}` : ''}
                  </p>
                </div>
                <p className={`text-4xl font-black tabular-nums ${
                  timePct > 0.4 ? 'text-green-400' : timePct > 0.2 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {(timeLeft / 1000).toFixed(1)}s
                </p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    timePct > 0.4 ? 'bg-green-400' : timePct > 0.2 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${timePct * 100}%` }} />
              </div>
            </div>

            {tbGraceStart !== null && (
              <div className="rounded-xl border-2 border-amber-400/60 bg-amber-500/15 p-3 text-center animate-pulse">
                <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.3em]">⏰ Grace Window — Grade Last Answer</p>
                <p className="text-white text-2xl font-black mt-0.5 tabular-nums">{(tbGraceMs / 1000).toFixed(1)}s</p>
                <p className="text-amber-200/70 text-[10px] mt-0.5">Correct / Wrong / Skip still counts.</p>
              </div>
            )}

            {/* Current question + answer */}
            {currentQ ? (
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-5 space-y-3">
                <p className="text-xl font-bold leading-snug text-center">{currentQ.text}</p>
                <div className="rounded-xl p-3 bg-green-500/15 border border-green-500/40 text-center">
                  <p className="text-green-400 text-[10px] font-bold uppercase tracking-widest">Answer</p>
                  <p className="text-green-300 text-2xl font-black">{currentQ.answer}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
                <p className="text-yellow-400 font-bold">Queue empty! Waiting for time to expire…</p>
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={markCorrect} disabled={!currentQ}
                className="py-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-xl font-black text-sm text-white">
                ✓ Correct <span className="text-xs font-normal opacity-75">+1</span>
              </button>
              <button onClick={recycle} disabled={!currentQ}
                className="py-3 bg-red-700 hover:bg-red-600 disabled:opacity-40 rounded-xl font-black text-sm text-white">
                ✗ Wrong
              </button>
              <button onClick={recycle} disabled={!currentQ}
                className="py-3 bg-slate-600 hover:bg-slate-500 disabled:opacity-40 rounded-xl font-black text-sm text-white">
                ↷ Skip
              </button>
            </div>
            <p className="text-center text-slate-500 text-[10px]">Wrong &amp; skip both cycle the question to the back of the queue</p>

            <button onClick={endRoundEarly}
              className="w-full py-2 border border-slate-600 hover:border-slate-400 text-slate-400 hover:text-white rounded-lg text-xs">
              End Round Early → {isPlayingA || (isPlayingB && s.threeTeam) ? 'Break' : 'Results'}
            </button>
          </div>
        )}

        {/* Compare — final side-by-side + advance / out */}
        {s.phase === 'compare' && (() => {
          const rows = [
            { key: 'A' as const, name: s.teamA, score: s.scoreA, colour: 'green' },
            { key: 'B' as const, name: s.teamB, score: s.scoreB, colour: 'blue' },
            ...(s.threeTeam ? [{ key: 'C' as const, name: s.teamC ?? 'Team C', score: s.scoreC ?? 0, colour: 'purple' }] : []),
          ]
          const top = Math.max(...rows.map(r => r.score))
          const bottom = Math.min(...rows.map(r => r.score))
          const stillTied = top === bottom  // everyone level
          const advancesName = rows.filter(r => r.score === top).map(r => r.name).join(', ')
          const eliminated = rows.filter(r => r.score === bottom && bottom < top).map(r => r.name).join(', ')
          return (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-yellow-500/15 to-orange-500/15 border-2 border-yellow-500/60 rounded-2xl p-4 text-center space-y-3">
              <p className="text-yellow-300 text-[10px] font-bold uppercase tracking-[0.3em]">Tie-Breaker Result</p>
              <div className={`grid ${s.threeTeam ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                {rows.map(r => {
                  const advances = !stillTied && r.score === top
                  const out = !stillTied && r.score === bottom && bottom < top
                  return (
                    <div key={r.key}
                      className={`rounded-xl p-3 border ${
                        advances ? 'bg-yellow-500/20 border-yellow-500'
                        : out ? 'bg-red-950/40 border-red-500/40 opacity-70'
                        : 'bg-white/5 border-white/10'
                      }`}>
                      {advances && <p className="text-yellow-300 text-2xl leading-none mb-0.5">🏆</p>}
                      {out && <p className="text-red-400 text-xs font-black uppercase tracking-widest">Out</p>}
                      <p className={`text-${r.colour}-300 text-[10px] font-bold uppercase tracking-widest truncate`}>{r.name}</p>
                      <p className="text-white text-3xl font-black">{r.score}</p>
                      <p className={`text-[10px] mt-0.5 font-bold uppercase ${advances ? 'text-yellow-300' : out ? 'text-red-300' : 'text-slate-500'}`}>
                        {advances ? (s.threeTeam ? 'Safe' : 'Advances') : out ? 'Eliminated' : 'Tied'}
                      </p>
                    </div>
                  )
                })}
              </div>
              <p className="text-white text-base font-black pt-2">
                {stillTied
                  ? '🤝 Still tied — run another round on fresh pools'
                  : s.threeTeam
                    ? `${eliminated} finishes at the bottom${eliminated.includes(',') ? ' (still tied)' : ''}. ${advancesName} advance${advancesName.includes(',') ? '' : 's'}.`
                    : `${advancesName} advances`}
              </p>
            </div>
            {stillTied ? (
              <button onClick={playAnotherRound}
                className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-3 rounded-xl text-sm">
                🔔 Still Tied · Run Another Rapid Fire
              </button>
            ) : (
              <button onClick={playAnotherRound}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl text-sm">
                Run Another Rapid Fire
              </button>
            )}
          </div>
          )
        })()}
      </div>
    </div>
  )
}
