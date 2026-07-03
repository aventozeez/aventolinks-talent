'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:3001'
const CHANNEL = 'av:state'
const TIME_PER_Q = 30

type AVQuestion = {
  id: string
  text: string
  answer: string
  revealed: boolean
  answeredBy: 'A' | 'B' | null
}

type AVState = {
  _from_mc?: boolean
  phase: 'idle' | 'watching' | 'qa_a' | 'break' | 'qa_b' | 'done'
  videoUrl: string
  videoPlay: boolean
  teamA: string
  teamB: string
  mcScoreA: number   // carry-forward from Mystery Chain
  mcScoreB: number
  questions: AVQuestion[]
  currentQ: number
  timerStart: number | null
  scoreA: number     // mcScoreA + AV round pts
  scoreB: number
  correctA: number
  correctB: number
}

const DEFAULT_STATE: AVState = {
  phase: 'idle',
  videoUrl: 'https://www.youtube.com/embed/YE7VzlLtp-4?enablejsapi=1',
  videoPlay: false,
  teamA: 'Team A',
  teamB: 'Team B',
  mcScoreA: 0,
  mcScoreB: 0,
  questions: [],
  currentQ: 0,
  timerStart: null,
  scoreA: 0,
  scoreB: 0,
  correctA: 0,
  correctB: 0,
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function useWs(onIncoming: (s: AVState) => void) {
  const ws = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const onIncomingRef = useRef(onIncoming)
  onIncomingRef.current = onIncoming

  useEffect(() => {
    function connect() {
      const sock = new WebSocket(WS_URL)
      sock.onopen = () => {
        setConnected(true)
        sock.send(JSON.stringify({ type: 'subscribe', channel: CHANNEL }))
      }
      sock.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'update' && msg.channel === CHANNEL && msg.payload) {
            onIncomingRef.current(msg.payload as AVState)
          }
        } catch {}
      }
      sock.onclose = () => { setConnected(false); setTimeout(connect, 2000) }
      sock.onerror = () => sock.close()
      ws.current = sock
    }
    connect()
    return () => ws.current?.close()
  }, [])

  const broadcast = useCallback((payload: AVState) => {
    if (ws.current?.readyState === 1) {
      ws.current.send(JSON.stringify({ type: 'broadcast', channel: CHANNEL, payload }))
    }
  }, [])

  return { connected, broadcast }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AVAdmin() {
  const [state, setState] = useState<AVState>(DEFAULT_STATE)
  const [timer, setTimer] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Hydration: receive pre-configured state from MC admin (broadcasted to relay)
  const hydrated = useRef(false)
  const skipBroadcast = useRef(true) // skip the first render after hydration

  const { connected, broadcast } = useWs((incoming) => {
    if (!hydrated.current && incoming._from_mc) {
      hydrated.current = true
      skipBroadcast.current = true
      setState(incoming)
    }
  })

  // Broadcast state to audience — skip first render to avoid overwriting relay cache
  useEffect(() => {
    if (skipBroadcast.current) { skipBroadcast.current = false; return }
    broadcast(state)
  }, [state, broadcast])

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (state.timerStart && (state.phase === 'qa_a' || state.phase === 'qa_b')) {
      timerRef.current = setInterval(() => {
        setTimer(Math.max(0, TIME_PER_Q - (Date.now() - state.timerStart!) / 1000))
      }, 100)
    } else {
      setTimer(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state.timerStart, state.phase])

  function update(patch: Partial<AVState>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  // Phase transitions
  function startWatching() { update({ phase: 'watching', videoPlay: true }) }
  function stopVideo()     { update({ videoPlay: false }) }

  function startQA_A() {
    const resetQ = state.questions.map(q => ({ ...q, revealed: false, answeredBy: null }))
    // scoreA resets to MC carry-forward baseline
    update({ phase: 'qa_a', videoPlay: false, currentQ: 0, timerStart: Date.now(), questions: resetQ, correctA: 0, scoreA: state.mcScoreA })
  }

  function startQA_B() {
    const resetQ = state.questions.map(q => ({ ...q, revealed: false, answeredBy: null }))
    update({ phase: 'qa_b', videoPlay: false, currentQ: 0, timerStart: Date.now(), questions: resetQ, correctB: 0, scoreB: state.mcScoreB })
  }

  function nextQuestion() {
    const next = state.currentQ + 1
    if (next >= state.questions.length) {
      update({ phase: state.phase === 'qa_a' ? 'break' : 'done', timerStart: null })
    } else {
      update({ currentQ: next, timerStart: Date.now() })
    }
  }

  function markCorrect() {
    const team: 'A' | 'B' = state.phase === 'qa_a' ? 'A' : 'B'
    const updQ = state.questions.map((x, i) => i === state.currentQ ? { ...x, revealed: true, answeredBy: team } : x)
    const pts = Math.max(1, Math.ceil((timer / TIME_PER_Q) * 10))
    if (state.phase === 'qa_a') {
      update({ questions: updQ, scoreA: state.scoreA + pts, correctA: state.correctA + 1, timerStart: null })
    } else {
      update({ questions: updQ, scoreB: state.scoreB + pts, correctB: state.correctB + 1, timerStart: null })
    }
  }

  function markWrong() {
    const updQ = state.questions.map((x, i) => i === state.currentQ ? { ...x, revealed: true } : x)
    update({ questions: updQ, timerStart: null })
  }

  const currentTeam = state.phase === 'qa_a' ? state.teamA : state.teamB
  const currentQ = state.questions[state.currentQ]
  const avScoreA = state.scoreA - state.mcScoreA
  const avScoreB = state.scoreB - state.mcScoreB
  const fromMC = hydrated.current || state._from_mc

  return (
    <div className="min-h-screen bg-[#0a0c14] text-white p-4">
      <div className="max-w-5xl mx-auto space-y-4">

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

        {/* Waiting for MC setup */}
        {!fromMC && state.phase === 'idle' && (
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-2xl px-5 py-4 text-center">
            <p className="text-yellow-400 font-bold text-sm">⏳ Waiting for Mystery Chain to finish</p>
            <p className="text-gray-400 text-xs mt-1">This page is configured from the Mystery Chain admin. Teams and questions will appear automatically when the host advances the top 2.</p>
          </div>
        )}

        {/* Ready to Play banner */}
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
                  {state.questions.length} questions ready
                </p>
              </div>
              <button onClick={startWatching}
                className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-black rounded-2xl text-base shrink-0">
                ▶ Play Video
              </button>
            </div>
          </div>
        )}

        {/* Phase tracker */}
        <div className="bg-[#111827] rounded-2xl p-4 flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {(['idle','watching','qa_a','break','qa_b','done'] as const).map(p => (
              <span key={p} className={`px-2 py-1 rounded-full text-xs font-bold ${state.phase === p ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-500'}`}>
                {p === 'qa_a' ? `Q&A ${state.teamA}` : p === 'qa_b' ? `Q&A ${state.teamB}` : p.toUpperCase()}
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
          {/* Left: controls */}
          <div className="col-span-2 space-y-4">

            {/* Phase controls */}
            <div className="bg-[#111827] rounded-2xl p-4 space-y-2">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider mb-2">Controls</h2>

              {state.phase === 'idle' && !fromMC && (
                <p className="text-gray-500 text-xs text-center py-2">Waiting for Mystery Chain to advance teams…</p>
              )}
              {state.phase === 'watching' && (<>
                <button onClick={stopVideo} className="w-full py-2 bg-orange-600 hover:bg-orange-500 rounded-xl font-bold text-sm">
                  ⏸ Stop Video
                </button>
                <button onClick={startQA_A} className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold">
                  🎯 Start Q&A — {state.teamA}
                </button>
              </>)}
              {state.phase === 'qa_a' && (
                <button onClick={() => update({ phase: 'break', timerStart: null })} className="w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-xl font-bold text-sm">
                  End {state.teamA} → Break
                </button>
              )}
              {state.phase === 'break' && (<>
                <div className="text-center py-3 bg-[#0d1117] rounded-xl border border-gray-700">
                  <p className="text-gray-400 text-xs mb-1">{state.teamA} finished</p>
                  <p className="text-green-400 font-black text-2xl">{state.scoreA} pts</p>
                  <p className="text-gray-600 text-xs">MC {state.mcScoreA} + AV {avScoreA}</p>
                </div>
                <button onClick={startQA_B} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold">
                  🎯 Start Q&A — {state.teamB}
                </button>
              </>)}
              {state.phase === 'qa_b' && (
                <button onClick={() => update({ phase: 'done', timerStart: null })} className="w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-xl font-bold text-sm">
                  End {state.teamB} → Results
                </button>
              )}
              {state.phase === 'done' && (
                <div className="text-center py-4 space-y-2">
                  <p className="text-2xl font-black text-yellow-400">🏆 Competition Complete!</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-green-900/30 rounded-xl p-2 text-center">
                      <p className="text-xs text-gray-400">{state.teamA}</p>
                      <p className="text-xl font-black text-green-400">{state.scoreA}</p>
                      <p className="text-xs text-gray-600">MC {state.mcScoreA} + AV {avScoreA}</p>
                    </div>
                    <div className="bg-blue-900/30 rounded-xl p-2 text-center">
                      <p className="text-xs text-gray-400">{state.teamB}</p>
                      <p className="text-xl font-black text-blue-400">{state.scoreB}</p>
                      <p className="text-xs text-gray-600">MC {state.mcScoreB} + AV {avScoreB}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Score breakdown */}
            <div className="bg-[#111827] rounded-2xl p-4">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider mb-3">Score Breakdown</h2>
              <div className="space-y-3">
                {[
                  { name: state.teamA, total: state.scoreA, mc: state.mcScoreA, av: avScoreA, correct: state.correctA, color: 'green' },
                  { name: state.teamB, total: state.scoreB, mc: state.mcScoreB, av: avScoreB, correct: state.correctB, color: 'blue' },
                ].map(t => (
                  <div key={t.name} className={`rounded-xl p-3 bg-${t.color}-900/20 border border-${t.color}-500/20`}>
                    <p className={`text-xs text-${t.color}-400 font-bold`}>{t.name}</p>
                    <p className={`text-3xl font-black text-${t.color}-400`}>{t.total} pts</p>
                    <div className="flex gap-3 text-xs text-gray-500 mt-1">
                      <span>🔐 MC: {t.mc}</span>
                      <span>📺 AV: +{t.av}</span>
                      <span>✓ {t.correct}/{state.questions.length}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: active Q + question list */}
          <div className="col-span-3 space-y-4">

            {/* Active question */}
            {(state.phase === 'qa_a' || state.phase === 'qa_b') && currentQ && (
              <div className="bg-[#111827] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Q {state.currentQ + 1} / {state.questions.length}</p>
                    <p className="font-bold text-white">{currentTeam}</p>
                  </div>
                  <div className={`text-4xl font-black tabular-nums ${timer < 10 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {timer.toFixed(1)}s
                  </div>
                </div>
                <p className="text-xl font-bold leading-snug">{currentQ.text}</p>
                <div className={`rounded-xl p-3 bg-gray-800 transition-opacity ${currentQ.revealed ? 'opacity-100' : 'opacity-0'}`}>
                  <span className="text-xs text-gray-400">Answer: </span>
                  <span className="font-bold text-green-400">{currentQ.answer}</span>
                </div>
                <div className="flex gap-3">
                  <button onClick={markCorrect} className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-black text-lg">✓ Correct</button>
                  <button onClick={markWrong} className="flex-1 py-3 bg-red-700 hover:bg-red-600 rounded-xl font-black text-lg">✗ Wrong</button>
                </div>
                <button onClick={nextQuestion} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-sm">
                  → Next Question
                </button>
              </div>
            )}

            {/* Questions list */}
            <div className="bg-[#111827] rounded-2xl p-4">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider mb-3">
                Questions ({state.questions.length}) — set before the match in Mystery Chain setup
              </h2>
              {state.questions.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-4">No questions yet — configure them in the Mystery Chain admin setup screen before starting the competition.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {state.questions.map((q, i) => (
                    <div key={q.id} className={`rounded-xl p-3 flex items-start gap-2 ${
                      i === state.currentQ && (state.phase === 'qa_a' || state.phase === 'qa_b')
                        ? 'bg-yellow-500/20 border border-yellow-500/40'
                        : 'bg-[#1e2533]'
                    }`}>
                      <span className="text-xs text-gray-500 font-bold mt-0.5 w-5 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">{q.text}</p>
                        <p className="text-xs text-gray-500 mt-0.5">A: {q.answer}</p>
                      </div>
                      {q.revealed && (
                        <span className={`text-xs font-bold shrink-0 ${q.answeredBy ? 'text-green-400' : 'text-red-400'}`}>
                          {q.answeredBy ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
