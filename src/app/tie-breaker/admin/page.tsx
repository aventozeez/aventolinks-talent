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

type TBPhase = 'setup' | 'a_playing' | 'break' | 'b_playing' | 'done'

type TBState = {
  phase: TBPhase
  teamA: string
  teamB: string
  priorA: number   // score coming in from prior rounds (informational)
  priorB: number
  questions: TBQuestion[]        // full source pool (immutable during play)
  queueA: TBQuestion[]           // team A's active play queue
  queueB: TBQuestion[]
  scoreA: number                 // tie-breaker score for team A
  scoreB: number
  correctA: number
  correctB: number
  timerStart: number | null
  currentQ: TBQuestion | null    // question currently on screen for the audience
  showAnswer: boolean            // audience never shows answer; admin can toggle for their own view
}

// 20 pre-loaded general-knowledge fallback questions.
const DEFAULT_QUESTIONS: Omit<TBQuestion, 'id'>[] = [
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

const makeQ = (q: Omit<TBQuestion, 'id'>): TBQuestion => ({ ...q, id: crypto.randomUUID() })

const DEFAULT_STATE: TBState = {
  phase: 'setup',
  teamA: '', teamB: '',
  priorA: 0, priorB: 0,
  questions: DEFAULT_QUESTIONS.map(makeQ),
  queueA: [], queueB: [],
  scoreA: 0, scoreB: 0,
  correctA: 0, correctB: 0,
  timerStart: null,
  currentQ: null,
  showAnswer: false,
}

export default function TieBreakerAdmin() {
  const [s, setS] = useState<TBState>(DEFAULT_STATE)
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
      setS(payload as TBState)
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

  function startTeamA() {
    if (!s.teamA.trim() || !s.teamB.trim() || s.questions.length === 0) return
    const queue = [...s.questions]
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
    if (s.questions.length === 0) return
    const queue = [...s.questions]
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
      queueA: [], queueB: [],
      scoreA: 0, scoreB: 0, correctA: 0, correctB: 0,
      timerStart: null, currentQ: null, showAnswer: false,
    })
  }

  const reset = () => update(DEFAULT_STATE)

  // Question editing
  const updateQ = (id: string, field: 'text' | 'answer', val: string) => {
    setS(p => ({ ...p, questions: p.questions.map(q => q.id === id ? { ...q, [field]: val } : q) }))
  }
  const deleteQ = (id: string) => {
    setS(p => ({ ...p, questions: p.questions.filter(q => q.id !== id) }))
  }
  const addQ = () => {
    if (!newQ.text.trim()) return
    setS(p => ({
      ...p,
      questions: [...p.questions, makeQ({ text: newQ.text.trim(), answer: newQ.answer.trim() })],
    }))
    setNewQ({ text: '', answer: '' })
  }

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

            {/* Questions */}
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-sm">Question Pool ({s.questions.length})</h2>
                <p className="text-[10px] text-slate-500">{DEFAULT_POOL_SIZE} pre-loaded — edit, add, or delete</p>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {s.questions.map((q, i) => (
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
                  + Add
                </button>
              </div>
            </div>

            <button onClick={startTeamA}
              disabled={!s.teamA.trim() || !s.teamB.trim() || s.questions.length === 0}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl text-base">
              ▶ Start Rapid Fire — {s.teamA || 'Team A'} first (30s)
            </button>
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
                  <p className="text-white text-sm font-bold">{activeQueue.length} left in queue</p>
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
              <p className="text-slate-500 text-xs">out of {s.questions.length} questions in the pool ({s.correctA} correct)</p>
            </div>
            <button onClick={startTeamB}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-base">
              ▶ Start {s.teamB} (30s)
            </button>
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
