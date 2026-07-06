'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { wsSubscribe, wsBroadcast } from '@/lib/ws-sync'

// Uses the shared sync lib so both LAN (local WS relay) and public URL
// (Supabase Realtime broadcast) transports work.
const CHANNEL = 'av:state'
const ROUND_MS = 60_000  // 60 seconds per team
const PTS_CORRECT = 10

type AVQuestion = {
  id: string
  text: string
  answer: string
  revealed: boolean
  answeredBy: 'A' | 'B' | null
}

type AVPool = {
  id: string
  title: string
  questions: AVQuestion[]
}

type AVState = {
  _from_mc?: boolean
  phase: 'idle' | 'watching'
    | 'pick_pool_a' | 'qa_a'
    | 'break'
    | 'pick_pool_b' | 'qa_b'
    | 'done'
    | 'tie_break'                       // buzzer-style sudden-death round when scores are tied
    | 'declare_first_runnerup' | 'declare_winner'
  videoUrl: string
  videoPlay: boolean
  teamA: string
  teamB: string
  mcScoreA: number
  mcScoreB: number
  pools: AVPool[]              // 3 pools of 10 questions each
  chosenPoolA: string | null   // pool id picked by team A
  chosenPoolB: string | null   // pool id picked by team B
  queueA: AVQuestion[]         // active play queue for team A
  queueB: AVQuestion[]
  timerStart: number | null
  scoreA: number
  scoreB: number
  correctA: number
  correctB: number
  // ── Tie-breaker (buzzer round) ──
  tieQuestions: AVQuestion[]         // usually the unpicked pool
  tieCurrentIdx: number              // index of the question currently on screen
  tieBuzzedBy: 'A' | 'B' | null      // team currently answering, null while waiting for a buzz
  tieTriedThisQ: ('A' | 'B')[]       // which teams have already tried the current question
  tieWinner: 'A' | 'B' | null        // set when a team answers correctly
}

const DEFAULT_STATE: AVState = {
  phase: 'idle',
  videoUrl: 'https://www.youtube.com/embed/REc5oJUt81E?enablejsapi=1&end=120',
  videoPlay: false,
  teamA: 'Team A',
  teamB: 'Team B',
  mcScoreA: 0,
  mcScoreB: 0,
  pools: [],
  chosenPoolA: null, chosenPoolB: null,
  queueA: [], queueB: [],
  timerStart: null,
  scoreA: 0, scoreB: 0,
  correctA: 0, correctB: 0,
  tieQuestions: [],
  tieCurrentIdx: 0,
  tieBuzzedBy: null,
  tieTriedThisQ: [],
  tieWinner: null,
}

function useWs(onIncoming: (s: AVState) => void) {
  const [connected, setConnected] = useState(false)
  const onIncomingRef = useRef(onIncoming)
  onIncomingRef.current = onIncoming

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (payload) => {
      setConnected(true)
      if (payload) onIncomingRef.current(payload as AVState)
    })
    return () => { unsub() }
  }, [])

  const broadcast = useCallback((payload: AVState) => {
    wsBroadcast(CHANNEL, payload)
  }, [])

  return { connected, broadcast }
}

export default function AVAdmin() {
  const [state, setState] = useState<AVState>(DEFAULT_STATE)
  const [timer, setTimer] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hydrated = useRef(false)
  const skipBroadcast = useRef(true)

  const { connected, broadcast } = useWs((incoming) => {
    if (!hydrated.current && incoming._from_mc) {
      hydrated.current = true
      skipBroadcast.current = true
      // Merge with defaults so any field older MC broadcasts omit
      // (e.g. tie-breaker fields added later) falls back safely and
      // doesn't crash renders that read them unconditionally.
      setState({ ...DEFAULT_STATE, ...incoming })
    }
  })

  useEffect(() => {
    if (skipBroadcast.current) { skipBroadcast.current = false; return }
    broadcast(state)
  }, [state, broadcast])

  // Countdown timer — auto-ends round when it hits 0
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (state.timerStart && (state.phase === 'qa_a' || state.phase === 'qa_b')) {
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, ROUND_MS / 1000 - (Date.now() - state.timerStart!) / 1000)
        setTimer(remaining)
        if (remaining === 0) {
          setState(prev => ({
            ...prev,
            phase: prev.phase === 'qa_a' ? 'break' : 'done',
            timerStart: null,
          }))
        }
      }, 100)
    } else {
      setTimer(state.phase === 'qa_a' || state.phase === 'qa_b' ? ROUND_MS / 1000 : 0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state.timerStart, state.phase])

  function update(patch: Partial<AVState>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  function startWatching()  { update({ phase: 'watching', videoPlay: true }) }
  function stopVideo()      { update({ videoPlay: false }) }
  // After the video, teams pick their pools before answering
  function goPickPoolA()    { update({ phase: 'pick_pool_a', videoPlay: false }) }
  function goPickPoolB()    { update({ phase: 'pick_pool_b', videoPlay: false }) }

  // Team A locks in a pool → 60s Q&A begins
  function pickPoolA(poolId: string) {
    const pool = state.pools.find(p => p.id === poolId)
    if (!pool) return
    const fresh = pool.questions.map(q => ({ ...q, revealed: false, answeredBy: null as 'A' | 'B' | null }))
    update({
      phase: 'qa_a', videoPlay: false,
      chosenPoolA: poolId,
      queueA: fresh,
      timerStart: Date.now(),
      correctA: 0,
      scoreA: state.mcScoreA,
    })
  }

  // Team B picks (from whichever remaining pools)
  function pickPoolB(poolId: string) {
    const pool = state.pools.find(p => p.id === poolId)
    if (!pool) return
    const fresh = pool.questions.map(q => ({ ...q, revealed: false, answeredBy: null as 'A' | 'B' | null }))
    update({
      phase: 'qa_b', videoPlay: false,
      chosenPoolB: poolId,
      queueB: fresh,
      timerStart: Date.now(),
      correctB: 0,
      scoreB: state.mcScoreB,
    })
  }

  const isQaA = state.phase === 'qa_a'
  const isQaB = state.phase === 'qa_b'
  const activeQueue = isQaA ? state.queueA : isQaB ? state.queueB : []
  const currentQ: AVQuestion | undefined = activeQueue[0]

  // Correct: remove from queue, add 10 pts, +1 correct
  function markCorrect() {
    if (!currentQ) return
    if (isQaA) {
      const rest = state.queueA.slice(1)
      const next: Partial<AVState> = {
        queueA: rest,
        scoreA: state.scoreA + PTS_CORRECT,
        correctA: state.correctA + 1,
      }
      // If queue empty → end team A's round
      if (rest.length === 0) { next.phase = 'break'; next.timerStart = null }
      update(next)
    } else if (isQaB) {
      const rest = state.queueB.slice(1)
      const next: Partial<AVState> = {
        queueB: rest,
        scoreB: state.scoreB + PTS_CORRECT,
        correctB: state.correctB + 1,
      }
      if (rest.length === 0) { next.phase = 'done'; next.timerStart = null }
      update(next)
    }
  }

  // Wrong / Skip: put current question to back of queue (recycle)
  function recycle() {
    if (!currentQ) return
    if (isQaA) {
      const [first, ...rest] = state.queueA
      update({ queueA: [...rest, first] })
    } else if (isQaB) {
      const [first, ...rest] = state.queueB
      update({ queueB: [...rest, first] })
    }
  }

  // ── Tie-breaker (buzzer sudden-death) ─────────────────────────────────────
  // Kicks off from the tied "done" screen. Uses the pool neither team picked
  // during the main round if there is one; falls back to pool 1 otherwise.
  function startTieBreak() {
    const unpicked = state.pools.find(p => p.id !== state.chosenPoolA && p.id !== state.chosenPoolB)
    const source = unpicked ?? state.pools[0]
    const questions = (source?.questions ?? []).map(q => ({ ...q, revealed: false, answeredBy: null as 'A' | 'B' | null }))
    update({
      phase: 'tie_break',
      tieQuestions: questions,
      tieCurrentIdx: 0,
      tieBuzzedBy: null,
      tieTriedThisQ: [],
      tieWinner: null,
    })
  }

  // A team buzzes in to answer the current tie-break question
  function tieBuzz(team: 'A' | 'B') {
    if (state.phase !== 'tie_break') return
    if (state.tieBuzzedBy) return                   // already answering
    if (state.tieTriedThisQ.includes(team)) return  // already had a go on this one
    update({ tieBuzzedBy: team })
  }

  // Buzzed team answered correctly → they win the tie-break
  function tieCorrect() {
    if (!state.tieBuzzedBy) return
    // Give the winner a symbolic +1 so downstream ranking treats them as ahead.
    const winner: 'A' | 'B' = state.tieBuzzedBy
    const scoreBump: Partial<AVState> = winner === 'A' ? { scoreA: state.scoreA + 1 } : { scoreB: state.scoreB + 1 }
    update({
      ...scoreBump,
      tieWinner: winner,
      tieBuzzedBy: null,
      phase: 'done',      // back to results — admin can now declare First Runner Up
    })
  }

  // Buzzed team was wrong. Give the other team a chance if they haven't tried;
  // otherwise the question is dead, move on to the next.
  function tieWrong() {
    if (!state.tieBuzzedBy) return
    const buzzed = state.tieBuzzedBy
    const alreadyTried = [...state.tieTriedThisQ, buzzed] as ('A' | 'B')[]
    const otherTeam: 'A' | 'B' = buzzed === 'A' ? 'B' : 'A'
    if (!alreadyTried.includes(otherTeam)) {
      // Other team still gets a chance on this question
      update({ tieBuzzedBy: null, tieTriedThisQ: alreadyTried })
    } else {
      // Both teams failed on this one — move to the next question
      tieNextQuestion(alreadyTried)
    }
  }

  // No one buzzed in / neither team knows it — skip to next question
  function tieSkip() {
    tieNextQuestion(state.tieTriedThisQ)
  }

  function tieNextQuestion(_prevTried: ('A' | 'B')[]) {
    const nextIdx = state.tieCurrentIdx + 1
    if (nextIdx >= state.tieQuestions.length) {
      // Ran out of questions — recycle from top (extremely rare, only ~10 qs)
      update({ tieCurrentIdx: 0, tieBuzzedBy: null, tieTriedThisQ: [] })
    } else {
      update({ tieCurrentIdx: nextIdx, tieBuzzedBy: null, tieTriedThisQ: [] })
    }
  }

  const avScoreA = state.scoreA - state.mcScoreA
  const avScoreB = state.scoreB - state.mcScoreB
  const fromMC = hydrated.current || state._from_mc
  const timerPct = timer / (ROUND_MS / 1000)
  const isTied = state.scoreA === state.scoreB
  const tieQ = state.tieQuestions[state.tieCurrentIdx]

  return (
    <div className="h-screen bg-[#0a0c14] text-white p-3 overflow-hidden">
      <div className="max-w-5xl mx-auto space-y-2 h-full overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-yellow-400 text-xs font-bold uppercase tracking-widest">Grand Final</p>
            <h1 className="text-2xl font-black text-white">📺 Audio Visual Round</h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/mystery-chain/audience" target="_blank"
              className="text-xs bg-purple-600/30 border border-purple-500/40 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-600/50">
              Audience ↗
            </a>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {connected ? '● LIVE' : '● OFFLINE'}
            </span>
          </div>
        </div>

        {!fromMC && state.phase === 'idle' && (
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-2xl px-5 py-4 text-center">
            <p className="text-yellow-400 font-bold text-sm">⏳ Waiting for Mystery Chain to finish</p>
            <p className="text-gray-400 text-xs mt-1">This page is configured from the Mystery Chain admin. Teams and questions will appear automatically when the host advances the top 2.</p>
          </div>
        )}

        {fromMC && state.phase === 'idle' && (
          <div className="bg-green-900/40 border border-green-500/50 rounded-2xl px-5 py-5">
            <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">✅ Grand Final Ready</p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-white font-black text-lg">
                  <span className="text-green-400">{state.teamA}</span>
                  <span className="text-gray-500 mx-2 font-normal text-base">vs</span>
                  <span className="text-blue-400">{state.teamB}</span>
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  MC scores: <span className="text-green-400 font-bold">{state.mcScoreA} pts</span> vs <span className="text-blue-400 font-bold">{state.mcScoreB} pts</span>
                  <span className="mx-2 text-gray-600">·</span>
                  {state.pools.length} pools of {state.pools[0]?.questions.length ?? 0}
                </p>
              </div>
              <button onClick={startWatching}
                className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-black rounded-2xl text-base shrink-0">
                ▶ Play 2-min Video
              </button>
            </div>
          </div>
        )}

        {/* Phase tracker */}
        <div className="bg-[#111827] rounded-2xl p-4 flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {(['idle','watching','pick_pool_a','qa_a','break','pick_pool_b','qa_b','done'] as const).map(p => (
              <span key={p} className={`px-2 py-1 rounded-full text-xs font-bold ${state.phase === p ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-500'}`}>
                {p === 'qa_a' ? `Q&A ${state.teamA}` :
                 p === 'qa_b' ? `Q&A ${state.teamB}` :
                 p === 'pick_pool_a' ? `Pick ${state.teamA}` :
                 p === 'pick_pool_b' ? `Pick ${state.teamB}` :
                 p.toUpperCase()}
              </span>
            ))}
          </div>
          <div className="text-sm font-bold shrink-0 ml-2">
            <span className="text-green-400">{state.teamA} {state.scoreA}pts</span>
            <span className="mx-2 text-gray-600">|</span>
            <span className="text-blue-400">{state.teamB} {state.scoreB}pts</span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          {/* Left: controls + score */}
          <div className="col-span-2 space-y-4">

            <div className="bg-[#111827] rounded-2xl p-4 space-y-2">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider mb-2">Controls</h2>

              {state.phase === 'idle' && !fromMC && (
                <p className="text-gray-500 text-xs text-center py-2">Waiting for Mystery Chain to advance teams…</p>
              )}
              {state.phase === 'watching' && (<>
                <button onClick={stopVideo} className="w-full py-2 bg-orange-600 hover:bg-orange-500 rounded-xl font-bold text-sm">
                  ⏸ Stop Video
                </button>
                <button onClick={goPickPoolA} className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold">
                  🎯 {state.teamA} — Pick Pool
                </button>
              </>)}
              {state.phase === 'pick_pool_a' && (
                <div>
                  <p className="text-white font-bold text-sm mb-2 text-center">{state.teamA} — pick one pool</p>
                  <div className="grid grid-cols-1 gap-2">
                    {state.pools.map((pl, i) => (
                      <button key={pl.id} onClick={() => pickPoolA(pl.id)}
                        className="text-left px-3 py-2 bg-green-900/30 hover:bg-green-800/40 border border-green-500/40 rounded-xl">
                        <p className="text-green-400 text-[10px] font-bold uppercase tracking-widest">Pool {i + 1}</p>
                        <p className="text-white font-bold text-sm">{pl.title}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {state.phase === 'qa_a' && (
                <button onClick={() => update({ phase: 'break', timerStart: null })} className="w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-xl font-bold text-sm">
                  End {state.teamA} → Break
                </button>
              )}
              {state.phase === 'break' && (<>
                <div className="text-center py-3 bg-[#0d1117] rounded-xl border border-gray-700">
                  <p className="text-gray-400 text-xs mb-1">{state.teamA} finished</p>
                  <p className="text-green-400 font-black text-2xl">{state.scoreA} pts</p>
                  <p className="text-gray-600 text-xs">MC {state.mcScoreA} + AV {avScoreA} ({state.correctA} correct)</p>
                </div>
                <button onClick={goPickPoolB} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold">
                  🎯 {state.teamB} — Pick Pool
                </button>
              </>)}
              {state.phase === 'pick_pool_b' && (
                <div>
                  <p className="text-white font-bold text-sm mb-2 text-center">{state.teamB} — pick one pool</p>
                  <div className="grid grid-cols-1 gap-2">
                    {state.pools.filter(pl => pl.id !== state.chosenPoolA).map((pl) => {
                      const originalIdx = state.pools.findIndex(p2 => p2.id === pl.id)
                      return (
                        <button key={pl.id} onClick={() => pickPoolB(pl.id)}
                          className="text-left px-3 py-2 bg-blue-900/30 hover:bg-blue-800/40 border border-blue-500/40 rounded-xl">
                          <p className="text-blue-400 text-[10px] font-bold uppercase tracking-widest">Pool {originalIdx + 1}</p>
                          <p className="text-white font-bold text-sm">{pl.title}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {state.phase === 'qa_b' && (
                <button onClick={() => update({ phase: 'done', timerStart: null })} className="w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-xl font-bold text-sm">
                  End {state.teamB} → Results
                </button>
              )}
              {(state.phase === 'done' || state.phase === 'declare_first_runnerup' || state.phase === 'declare_winner') && (
                <div className="text-center py-3 space-y-2">
                  <p className="text-lg font-black text-yellow-400">🏆 Grand Final Complete!</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className={`rounded-xl p-2 text-center ${state.scoreA >= state.scoreB ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-green-900/30'}`}>
                      <p className="text-xs text-gray-400">{state.teamA}</p>
                      <p className="text-lg font-black text-green-400">{state.scoreA}</p>
                      <p className="text-[10px] text-gray-600">Prior {state.mcScoreA} + AV {avScoreA}</p>
                    </div>
                    <div className={`rounded-xl p-2 text-center ${state.scoreB > state.scoreA ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-blue-900/30'}`}>
                      <p className="text-xs text-gray-400">{state.teamB}</p>
                      <p className="text-lg font-black text-blue-400">{state.scoreB}</p>
                      <p className="text-[10px] text-gray-600">Prior {state.mcScoreB} + AV {avScoreB}</p>
                    </div>
                  </div>
                  {/* Ceremony reveal buttons */}
                  <div className="flex flex-col gap-2 mt-2">
                    {/* Tie-Breaker — always available on done. Pulses when scores are tied. */}
                    {state.phase === 'done' && !state.tieWinner && (
                      <button onClick={startTieBreak}
                        className={`w-full py-2 bg-pink-600/30 hover:bg-pink-600/50 border border-pink-500/50 text-pink-300 rounded-xl font-bold text-sm ${isTied ? 'animate-pulse ring-2 ring-pink-500/40' : ''}`}>
                        🔔 Start Tie-Breaker {isTied ? '(scores tied!)' : '(buzzer round)'}
                      </button>
                    )}
                    {state.phase === 'done' && state.tieWinner && (
                      <p className="text-xs text-pink-300 font-bold italic pt-1 text-center">
                        Tie-breaker won by {state.tieWinner === 'A' ? state.teamA : state.teamB}
                      </p>
                    )}
                    {state.phase === 'done' && (
                      <button onClick={() => update({ phase: 'declare_first_runnerup' })}
                        disabled={isTied && !state.tieWinner}
                        title={isTied && !state.tieWinner ? 'Break the tie first' : undefined}
                        className="w-full py-2 bg-[#f5a623]/20 hover:bg-[#f5a623]/30 border border-[#f5a623]/50 text-[#f5a623] rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                        🥈 Declare First Runner Up
                      </button>
                    )}
                    {state.phase === 'declare_first_runnerup' && (
                      <button onClick={() => update({ phase: 'declare_winner' })}
                        className="w-full py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 text-yellow-300 rounded-xl font-bold text-sm">
                        🏆 Declare Winner
                      </button>
                    )}
                    {state.phase === 'declare_winner' && (
                      <p className="text-xs text-yellow-400 font-bold italic pt-1">Winner declared. See audience screen.</p>
                    )}
                    {state.phase !== 'done' && (
                      <button onClick={() => update({ phase: 'done' })}
                        className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg text-[10px]">
                        ← Back to results
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tie-breaker admin controls ── */}
              {state.phase === 'tie_break' && (
                <div className="space-y-2">
                  <div className="text-center py-2 bg-pink-900/30 rounded-xl border border-pink-500/50">
                    <p className="text-pink-300 text-[10px] font-bold uppercase tracking-widest">Tie-Breaker · Buzzer Round</p>
                    <p className="text-white text-sm font-bold mt-0.5">Question {state.tieCurrentIdx + 1} of {state.tieQuestions.length}</p>
                  </div>

                  {/* Buzz-in buttons — waiting for a team to buzz */}
                  {!state.tieBuzzedBy && tieQ && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => tieBuzz('A')}
                          disabled={state.tieTriedThisQ.includes('A')}
                          className="py-3 bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl font-black text-sm text-white">
                          🔔 {state.teamA} Buzzes
                        </button>
                        <button onClick={() => tieBuzz('B')}
                          disabled={state.tieTriedThisQ.includes('B')}
                          className="py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl font-black text-sm text-white">
                          🔔 {state.teamB} Buzzes
                        </button>
                      </div>
                      <button onClick={tieSkip}
                        className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 rounded-lg text-xs">
                        ↷ No one knows — Next question
                      </button>
                    </>
                  )}

                  {/* Team is answering */}
                  {state.tieBuzzedBy && tieQ && (
                    <div className="space-y-2">
                      <p className="text-center text-xs text-slate-400">
                        <span className={state.tieBuzzedBy === 'A' ? 'text-green-400 font-bold' : 'text-blue-400 font-bold'}>
                          {state.tieBuzzedBy === 'A' ? state.teamA : state.teamB}
                        </span>
                        {' '}is answering
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={tieCorrect}
                          className="py-3 bg-green-600 hover:bg-green-500 rounded-xl font-black text-sm text-white">
                          ✓ Correct · WINNER
                        </button>
                        <button onClick={tieWrong}
                          className="py-3 bg-red-700 hover:bg-red-600 rounded-xl font-black text-sm text-white">
                          ✗ Wrong
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Score breakdown */}
            <div className="bg-[#111827] rounded-2xl p-4">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider mb-3">Score Breakdown</h2>
              <div className="space-y-3">
                {(() => {
                  const poolA = state.pools.find(p => p.id === state.chosenPoolA)
                  const poolB = state.pools.find(p => p.id === state.chosenPoolB)
                  return [
                    { name: state.teamA, total: state.scoreA, mc: state.mcScoreA, av: avScoreA, correct: state.correctA, total_q: poolA?.questions.length ?? 0, color: 'green' },
                    { name: state.teamB, total: state.scoreB, mc: state.mcScoreB, av: avScoreB, correct: state.correctB, total_q: poolB?.questions.length ?? 0, color: 'blue' },
                  ]
                })().map(t => (
                  <div key={t.name} className={`rounded-xl p-3 bg-${t.color}-900/20 border border-${t.color}-500/20`}>
                    <p className={`text-xs text-${t.color}-400 font-bold`}>{t.name}</p>
                    <p className={`text-3xl font-black text-${t.color}-400`}>{t.total} pts</p>
                    <div className="flex gap-3 text-xs text-gray-500 mt-1">
                      <span>🔐 MC: {t.mc}</span>
                      <span>📺 AV: +{t.av}</span>
                      <span>✓ {t.correct}/{t.total_q}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: active Q + queue */}
          <div className="col-span-3 space-y-4">

            {(isQaA || isQaB) && (<>
              {/* Timer + Active question */}
              <div className="bg-[#111827] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Remaining in queue: {activeQueue.length}</p>
                    <p className="font-bold text-white">{isQaA ? state.teamA : state.teamB} answering</p>
                  </div>
                  <div className={`text-5xl font-black tabular-nums ${timer < 10 ? 'text-red-400' : timer < 20 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {timer.toFixed(1)}s
                  </div>
                </div>
                {/* Timer bar */}
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-100 ${timer < 10 ? 'bg-red-400' : timer < 20 ? 'bg-yellow-400' : 'bg-green-400'}`}
                    style={{ width: `${timerPct * 100}%` }} />
                </div>

                {currentQ ? (<>
                  <p className="text-xl font-bold leading-snug">{currentQ.text}</p>
                  <div className="rounded-xl p-3 bg-gray-800">
                    <span className="text-xs text-gray-400">Answer: </span>
                    <span className="font-bold text-green-400">{currentQ.answer}</span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={markCorrect} className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-black text-lg">
                      ✓ Correct <span className="text-sm font-normal opacity-75">+{PTS_CORRECT}</span>
                    </button>
                    <button onClick={recycle} className="flex-1 py-3 bg-red-700 hover:bg-red-600 rounded-xl font-black text-lg">
                      ✗ Wrong
                    </button>
                    <button onClick={recycle} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-black text-lg">
                      ↷ Skip
                    </button>
                  </div>
                  <p className="text-center text-xs text-gray-500">Wrong &amp; skip both cycle the question to the back of the queue</p>
                </>) : (
                  <p className="text-center text-yellow-400 py-8 font-bold">All questions answered! Ending round…</p>
                )}
              </div>
            </>)}

            {/* Tie-breaker current question + answer (admin view) */}
            {state.phase === 'tie_break' && tieQ && (
              <div className="bg-[#111827] rounded-2xl p-5 space-y-3 border border-pink-500/30">
                <p className="text-pink-300 text-[10px] font-bold uppercase tracking-widest text-center">
                  Tie-breaker · Question {state.tieCurrentIdx + 1}
                </p>
                <p className="text-xl font-bold leading-snug text-center">{tieQ.text}</p>
                <div className="rounded-xl p-3 bg-green-500/15 border border-green-500/40 text-center">
                  <p className="text-green-400 text-[10px] font-bold uppercase tracking-widest">Answer</p>
                  <p className="text-green-300 text-2xl font-black tracking-[0.15em]">{tieQ.answer}</p>
                </div>
                {state.tieTriedThisQ.length > 0 && !state.tieBuzzedBy && (
                  <p className="text-xs text-slate-500 text-center italic">
                    {state.tieTriedThisQ.map(t => t === 'A' ? state.teamA : state.teamB).join(' and ')} already tried this one.
                  </p>
                )}
              </div>
            )}

            {/* Queue preview */}
            {(isQaA || isQaB) && (
              <div className="bg-[#111827] rounded-2xl p-4">
                <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider mb-3">
                  Queue ({activeQueue.length} remaining)
                </h2>
                {activeQueue.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-4">Queue empty</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {activeQueue.map((q, i) => (
                      <div key={q.id} className={`rounded-xl p-3 flex items-start gap-2 ${i === 0 ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-[#1e2533]'}`}>
                        <span className="text-xs text-gray-500 font-bold mt-0.5 w-5 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{q.text}</p>
                          <p className="text-xs text-gray-500 mt-0.5">A: {q.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pool summary (when not in QA phase) — shows the 3 pools + any picks */}
            {!isQaA && !isQaB && (
              <div className="bg-[#111827] rounded-2xl p-4">
                <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider mb-3">
                  Question Pools
                </h2>
                {state.pools.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-4">No pools loaded — configure them in the Mystery Chain setup screen.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {state.pools.map((pl, i) => {
                      const pickedByA = state.chosenPoolA === pl.id
                      const pickedByB = state.chosenPoolB === pl.id
                      return (
                        <div key={pl.id} className={`rounded-xl p-3 border ${
                          pickedByA ? 'border-green-500/50 bg-green-900/10' :
                          pickedByB ? 'border-blue-500/50 bg-blue-900/10' :
                          'border-white/10 bg-white/5'
                        }`}>
                          <p className="text-[#f5a623] text-[10px] font-bold uppercase tracking-widest">Pool {i + 1}</p>
                          <p className="text-white font-bold text-xs mt-0.5">{pl.title}</p>
                          <p className="text-slate-500 text-[10px] mt-1">{pl.questions.length} questions</p>
                          {pickedByA && <p className="text-green-400 text-[10px] font-bold mt-1">Picked by {state.teamA}</p>}
                          {pickedByB && <p className="text-blue-400 text-[10px] font-bold mt-1">Picked by {state.teamB}</p>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
