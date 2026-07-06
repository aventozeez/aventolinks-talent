'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { wsSubscribe, wsBroadcast } from '@/lib/ws-sync'
import { supabase } from '@/lib/supabase'

const CHANNEL = 'tie:state'
const ROUND_MS = 30_000                // 30 seconds per team
const DEFAULT_POOL_SIZE = 20           // 20 questions per pool
const PTS_CORRECT = 1

type RegisteredTeam = { id: string; name: string; school: string }

type TBQuestion = { id: string; text: string; answer: string }
type TBPool = { id: string; title: string; questions: TBQuestion[] }

type TBPhase = 'setup' | 'a_playing' | 'break' | 'b_playing' | 'done'

type TBState = {
  phase: TBPhase
  teamA: string
  teamB: string
  priorA: number
  priorB: number
  pools: TBPool[]                // multiple pools; the host picks a DIFFERENT one per team
  chosenPoolA: string | null     // pool team A played (locked when their round starts)
  chosenPoolB: string | null     // pool team B played (locked when their round starts)
  queueA: TBQuestion[]
  queueB: TBQuestion[]
  scoreA: number
  scoreB: number
  correctA: number
  correctB: number
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
  teamA: '', teamB: '',
  priorA: 0, priorB: 0,
  pools: DEFAULT_POOLS(),
  chosenPoolA: null,
  chosenPoolB: null,
  queueA: [], queueB: [],
  scoreA: 0, scoreB: 0,
  correctA: 0, correctB: 0,
  timerStart: null,
  currentQ: null,
  showAnswer: false,
})

export default function TieBreakerAdmin() {
  const [s, setS] = useState<TBState>(DEFAULT_STATE())
  const [poolTab, setPoolTab] = useState<number>(0)  // index of pool currently open for editing
  const [teams, setTeams] = useState<RegisteredTeam[]>([])
  const [editingQ, setEditingQ] = useState<string | null>(null)
  const [newQ, setNewQ] = useState({ text: '', answer: '' })
  const [timeLeft, setTimeLeft] = useState(ROUND_MS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
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
      const migrated: TBState = {
        ...DEFAULT_STATE(),
        ...raw,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('fsc_teams')
          .select('id, name, school')
          .eq('status', 'active')
          .order('name')
        if (!cancelled && data) setTeams(data as RegisteredTeam[])
      } catch { /* offline — plain text inputs will show */ }
    })()
    return () => { cancelled = true }
  }, [])

  // 30-second countdown for whichever team is currently playing.
  // On expiry, auto-transition to the break screen (team A) or done (team B).
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!s.timerStart || (s.phase !== 'a_playing' && s.phase !== 'b_playing')) {
      setTimeLeft(ROUND_MS)
      return
    }
    const tick = () => {
      const left = Math.max(0, ROUND_MS - (Date.now() - s.timerStart!))
      setTimeLeft(left)
      if (left === 0) {
        clearInterval(timerRef.current!)
        if (s.phase === 'a_playing') {
          update({ phase: 'break', timerStart: null, currentQ: null, showAnswer: false })
        } else {
          update({ phase: 'done', timerStart: null, currentQ: null, showAnswer: false })
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
  const activeQueue: TBQuestion[] = isPlayingA ? s.queueA : isPlayingB ? s.queueB : []
  // Guard everywhere against missing pools — a DB row from before the refactor
  // won't have this field, so we normalise defensively.
  const safePools = s.pools ?? []
  const chosenPoolA = safePools.find(p => p.id === s.chosenPoolA) ?? null
  const chosenPoolB = safePools.find(p => p.id === s.chosenPoolB) ?? null
  // Which pool is the currently-playing team on? Used for headers + break/done screens.
  const activePool = isPlayingA ? chosenPoolA : isPlayingB ? chosenPoolB : null

  function startTeamA(poolId: string) {
    const pool = safePools.find(p => p.id === poolId)
    if (!s.teamA.trim() || !s.teamB.trim() || !pool || pool.questions.length === 0) return
    const queue = pool.questions.map(q => ({ ...q }))
    update({
      phase: 'a_playing',
      chosenPoolA: pool.id,
      queueA: queue,
      scoreA: 0,
      correctA: 0,
      timerStart: Date.now(),
      currentQ: queue[0] ?? null,
      showAnswer: false,
    })
  }

  function startTeamB(poolId: string) {
    const pool = safePools.find(p => p.id === poolId)
    if (!pool || pool.questions.length === 0) return
    if (pool.id === s.chosenPoolA) return   // must be a different pool
    const queue = pool.questions.map(q => ({ ...q }))
    update({
      phase: 'b_playing',
      chosenPoolB: pool.id,
      queueB: queue,
      scoreB: 0,
      correctB: 0,
      timerStart: Date.now(),
      currentQ: queue[0] ?? null,
      showAnswer: false,
    })
  }

  function markCorrect() {
    if (activeQueue.length === 0) return
    const [, ...rest] = activeQueue
    if (isPlayingA) {
      update({
        queueA: rest,
        scoreA: s.scoreA + PTS_CORRECT,
        correctA: s.correctA + 1,
        currentQ: rest[0] ?? null,
        showAnswer: false,
      })
    } else if (isPlayingB) {
      update({
        queueB: rest,
        scoreB: s.scoreB + PTS_CORRECT,
        correctB: s.correctB + 1,
        currentQ: rest[0] ?? null,
        showAnswer: false,
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
  }

  function endRoundEarly() {
    if (isPlayingA) update({ phase: 'break', timerStart: null, currentQ: null, showAnswer: false })
    else if (isPlayingB) update({ phase: 'done', timerStart: null, currentQ: null, showAnswer: false })
  }

  // Runs another rapid-fire — same teams, questions cycled from the start.
  function playAnotherRound() {
    update({
      phase: 'setup',
      chosenPoolA: null, chosenPoolB: null,
      queueA: [], queueB: [],
      scoreA: 0, scoreB: 0, correctA: 0, correctB: 0,
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
        <div className="grid grid-cols-2 gap-2">
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
              <div className="grid grid-cols-2 gap-3">
                {(['A', 'B'] as const).map(letter => {
                  const nameKey = `team${letter}` as const
                  const priorKey = `prior${letter}` as const
                  return (
                    <div key={letter} className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Team {letter}</label>
                      {teams.length > 0 ? (
                        <select
                          value={s[nameKey]}
                          onChange={e => update({ [nameKey]: e.target.value } as Partial<TBState>)}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm">
                          <option value="">— select team —</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.name}>{t.name}{t.school ? ` (${t.school})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={s[nameKey]}
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

            {/* Start Team A — one button per pool. Each team plays a DIFFERENT pool. */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white font-bold text-sm">
                  Pick {s.teamA || 'Team A'}&apos;s pool to start (30s)
                </p>
                <p className="text-slate-500 text-[10px]">Each team gets a different pool</p>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {safePools.map((pl, i) => (
                  <button key={pl.id} onClick={() => startTeamA(pl.id)}
                    disabled={!s.teamA.trim() || !s.teamB.trim() || pl.questions.length === 0}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors border bg-green-900/30 border-green-500/40 hover:bg-green-800/40 disabled:opacity-40 disabled:cursor-not-allowed">
                    <span className="text-green-400 text-xs font-black">▶</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">Pool {i + 1} · {pl.title}</p>
                      <p className="text-slate-400 text-[10px]">{pl.questions.length} questions</p>
                    </div>
                    {poolReady(i) && <span className="text-green-400 text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Playing (either team) */}
        {(isPlayingA || isPlayingB) && (
          <div className="space-y-3">
            {/* Timer */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isPlayingA ? 'text-green-300' : 'text-blue-300'}`}>
                    {isPlayingA ? s.teamA : s.teamB} · Rapid Fire
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
              End Round Early → {isPlayingA ? 'Break' : 'Results'}
            </button>
          </div>
        )}

        {/* Break — team A done, team B up next */}
        {s.phase === 'break' && (
          <div className="space-y-3">
            <div className="bg-[#0d1f3c] border border-green-500/40 rounded-xl p-4 text-center space-y-2">
              <p className="text-green-300 text-[10px] font-bold uppercase tracking-widest">Half-Time</p>
              <p className="text-white text-xl font-black">{s.teamA} scored</p>
              <p className="text-green-400 text-4xl font-black">{s.scoreA}</p>
              <p className="text-slate-500 text-xs">
                out of {chosenPoolA?.questions.length ?? 0} questions in <b className="text-slate-300">{chosenPoolA?.title ?? 'the pool'}</b> ({s.correctA} correct)
              </p>
            </div>

            {/* Pool picker for Team B — Team A's pool is dimmed out */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white font-bold text-sm">
                  Pick {s.teamB || 'Team B'}&apos;s pool to start (30s)
                </p>
                <p className="text-slate-500 text-[10px]">Different pool from {s.teamA}</p>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {safePools.map((pl, i) => {
                  const takenByA = pl.id === s.chosenPoolA
                  return (
                    <button key={pl.id} onClick={() => startTeamB(pl.id)}
                      disabled={takenByA || pl.questions.length === 0}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors border ${
                        takenByA
                          ? 'bg-slate-800/40 border-slate-700 opacity-40 cursor-not-allowed'
                          : 'bg-blue-900/30 border-blue-500/40 hover:bg-blue-800/40'
                      }`}>
                      <span className={`text-xs font-black ${takenByA ? 'text-slate-500' : 'text-blue-400'}`}>▶</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-bold truncate">Pool {i + 1} · {pl.title}</p>
                        <p className="text-slate-400 text-[10px]">
                          {pl.questions.length} questions{takenByA ? ` · already played by ${s.teamA}` : ''}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Done — final results */}
        {s.phase === 'done' && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-yellow-500/15 to-orange-500/15 border-2 border-yellow-500/60 rounded-2xl p-4 text-center space-y-3">
              <p className="text-yellow-300 text-[10px] font-bold uppercase tracking-[0.3em]">Tie-Breaker Complete</p>
              <div className="grid grid-cols-2 gap-2">
                <div className={`rounded-xl p-3 border ${s.scoreA > s.scoreB ? 'bg-yellow-500/20 border-yellow-500' : 'bg-white/5 border-white/10'}`}>
                  {s.scoreA > s.scoreB && <p className="text-yellow-300 text-2xl">🏆</p>}
                  <p className="text-slate-300 text-xs font-bold">{s.teamA}</p>
                  <p className="text-white text-3xl font-black">{s.scoreA}</p>
                </div>
                <div className={`rounded-xl p-3 border ${s.scoreB > s.scoreA ? 'bg-yellow-500/20 border-yellow-500' : 'bg-white/5 border-white/10'}`}>
                  {s.scoreB > s.scoreA && <p className="text-yellow-300 text-2xl">🏆</p>}
                  <p className="text-slate-300 text-xs font-bold">{s.teamB}</p>
                  <p className="text-white text-3xl font-black">{s.scoreB}</p>
                </div>
              </div>
              <p className="text-white text-lg font-black pt-2">{winnerText}</p>
            </div>
            {s.scoreA === s.scoreB ? (
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
        )}
      </div>
    </div>
  )
}
