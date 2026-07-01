'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:3001'
const CHANNEL = 'av:state'
const TIME_PER_Q = 30 // seconds per question

type AVQuestion = {
  id: string
  text: string
  answer: string
  revealed: boolean
  answeredBy: 'A' | 'B' | null
}

type AVState = {
  phase: 'idle' | 'watching' | 'qa_a' | 'break' | 'qa_b' | 'done'
  videoUrl: string
  videoPlay: boolean
  teamA: string
  teamB: string
  questions: AVQuestion[]
  currentQ: number
  timerStart: number | null
  scoreA: number
  scoreB: number
  correctA: number
  correctB: number
}

const DEFAULT_VIDEO = 'https://www.youtube.com/embed/YE7VzlLtp-4?enablejsapi=1'

const DEFAULT_QUESTIONS: AVQuestion[] = [
  { id: '1', text: 'What colour was the main character?', answer: 'Orange (the bunny/rabbit)', revealed: false, answeredBy: null },
  { id: '2', text: 'What animals were the antagonists in the clip?', answer: 'Squirrels / rodents', revealed: false, answeredBy: null },
  { id: '3', text: 'What was the setting of the video?', answer: 'A forest / outdoor woodland', revealed: false, answeredBy: null },
  { id: '4', text: 'Describe the opening scene of the video.', answer: 'A peaceful nature scene / character sleeping', revealed: false, answeredBy: null },
  { id: '5', text: 'What sound accompanied the title sequence?', answer: 'Orchestral / cheerful music', revealed: false, answeredBy: null },
]

function useWs() {
  const ws = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    function connect() {
      const sock = new WebSocket(WS_URL)
      sock.onopen = () => { setConnected(true); sock.send(JSON.stringify({ type: 'subscribe', channel: CHANNEL })) }
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

function toEmbedUrl(raw: string): string {
  const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  if (m) return `https://www.youtube.com/embed/${m[1]}?enablejsapi=1`
  return raw
}

export default function AVAdmin() {
  const { connected, broadcast } = useWs()

  const [state, setState] = useState<AVState>({
    phase: 'idle',
    videoUrl: DEFAULT_VIDEO,
    videoPlay: false,
    teamA: 'Team Alpha',
    teamB: 'Team Beta',
    questions: DEFAULT_QUESTIONS,
    currentQ: 0,
    timerStart: null,
    scoreA: 0,
    scoreB: 0,
    correctA: 0,
    correctB: 0,
  })

  const [rawUrl, setRawUrl] = useState('')
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [timer, setTimer] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Listen for incoming AV state pushed from Mystery Chain admin
  const [mcPush, setMcPush] = useState<{ teamA: string; teamB: string } | null>(null)
  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', channel: 'mc:av_handoff' }))
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.channel === 'mc:av_handoff' && msg.payload?.teamA) {
          setMcPush({ teamA: msg.payload.teamA, teamB: msg.payload.teamB })
        }
      } catch {}
    }
    ws.onerror = () => ws.close()
    return () => ws.close()
  }, [])

  // broadcast whenever state changes
  useEffect(() => {
    broadcast(state)
  }, [state, broadcast])

  // local countdown display
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (state.timerStart && (state.phase === 'qa_a' || state.phase === 'qa_b')) {
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - state.timerStart!) / 1000
        const left = Math.max(0, TIME_PER_Q - elapsed)
        setTimer(left)
      }, 200)
    } else {
      setTimer(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state.timerStart, state.phase])

  function update(patch: Partial<AVState>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  function startWatching() {
    update({ phase: 'watching', videoPlay: true })
  }

  function stopVideo() {
    update({ videoPlay: false })
  }

  function startQA_A() {
    const resetQ = state.questions.map(q => ({ ...q, revealed: false, answeredBy: null }))
    update({ phase: 'qa_a', videoPlay: false, currentQ: 0, timerStart: Date.now(), questions: resetQ, correctA: 0, scoreA: 0 })
  }

  function startQA_B() {
    const resetQ = state.questions.map(q => ({ ...q, revealed: false, answeredBy: null }))
    update({ phase: 'qa_b', videoPlay: false, currentQ: 0, timerStart: Date.now(), questions: resetQ, correctB: 0, scoreB: 0 })
  }

  function nextQuestion() {
    const next = state.currentQ + 1
    if (next >= state.questions.length) {
      if (state.phase === 'qa_a') update({ phase: 'break', timerStart: null })
      else update({ phase: 'done', timerStart: null })
    } else {
      update({ currentQ: next, timerStart: Date.now() })
    }
  }

  function markCorrect() {
    const q = state.questions[state.currentQ]
    const team = state.phase === 'qa_a' ? 'A' : 'B'
    const updQ = state.questions.map((x, i) => i === state.currentQ ? { ...x, revealed: true, answeredBy: team } : x)
    const pts = Math.max(0, Math.ceil((timer / TIME_PER_Q) * 10)) // 0–10 pts based on speed
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

  function resetAll() {
    setState({
      phase: 'idle',
      videoUrl: DEFAULT_VIDEO,
      videoPlay: false,
      teamA: 'Team Alpha',
      teamB: 'Team Beta',
      questions: DEFAULT_QUESTIONS,
      currentQ: 0,
      timerStart: null,
      scoreA: 0,
      scoreB: 0,
      correctA: 0,
      correctB: 0,
    })
    setRawUrl('')
  }

  function addQuestion() {
    if (!newQ.trim()) return
    const q: AVQuestion = {
      id: Date.now().toString(),
      text: newQ.trim(),
      answer: newA.trim() || '(no answer set)',
      revealed: false,
      answeredBy: null,
    }
    update({ questions: [...state.questions, q] })
    setNewQ(''); setNewA('')
  }

  function removeQuestion(id: string) {
    update({ questions: state.questions.filter(q => q.id !== id) })
  }

  function applyUrl() {
    if (!rawUrl.trim()) return
    update({ videoUrl: toEmbedUrl(rawUrl.trim()) })
    setRawUrl('')
  }

  const currentTeam = state.phase === 'qa_a' ? state.teamA : state.phase === 'qa_b' ? state.teamB : null
  const currentQ = state.questions[state.currentQ]

  return (
    <div className="min-h-screen bg-[#0a0c14] text-white p-4">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-white">📺 Audio Visual — Admin</h1>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {connected ? '● LIVE' : '● OFFLINE'}
            </span>
            <button onClick={resetAll} className="px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs">Reset All</button>
          </div>
        </div>

        {/* Mystery Chain handoff banner */}
        {mcPush && state.phase === 'idle' && (
          <div className="bg-purple-900/40 border border-purple-500/50 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-purple-300 text-xs font-bold uppercase tracking-widest mb-1">📺 Mystery Chain Result Received</p>
              <p className="text-white font-bold">
                Top 2 advancing: <span className="text-green-400">{mcPush.teamA}</span> vs <span className="text-blue-400">{mcPush.teamB}</span>
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => { update({ teamA: mcPush.teamA, teamB: mcPush.teamB }); setMcPush(null) }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-xl"
              >
                ✓ Use These Teams
              </button>
              <button onClick={() => setMcPush(null)} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-xl">✕</button>
            </div>
          </div>
        )}

        {/* Phase banner */}
        <div className="bg-[#111827] rounded-2xl p-4 flex items-center justify-between">
          <div className="flex gap-2">
            {(['idle','watching','qa_a','break','qa_b','done'] as const).map(p => (
              <span key={p} className={`px-2 py-1 rounded-full text-xs font-bold ${state.phase === p ? 'bg-yellow-400 text-black' : 'bg-gray-700 text-gray-400'}`}>
                {p.replace('_',' ').toUpperCase()}
              </span>
            ))}
          </div>
          <div className="text-sm font-bold">
            {state.teamA}: <span className="text-green-400">{state.scoreA}pts</span>
            <span className="mx-2 text-gray-600">|</span>
            {state.teamB}: <span className="text-blue-400">{state.scoreB}pts</span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          {/* Left column: setup */}
          <div className="col-span-2 space-y-4">

            {/* Teams */}
            <div className="bg-[#111827] rounded-2xl p-4 space-y-3">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider">Teams</h2>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Team A</label>
                <input value={state.teamA} onChange={e => update({ teamA: e.target.value })}
                  className="w-full bg-[#1e2533] rounded-lg px-3 py-2 text-sm text-white outline-none border border-gray-700 focus:border-yellow-400" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Team B</label>
                <input value={state.teamB} onChange={e => update({ teamB: e.target.value })}
                  className="w-full bg-[#1e2533] rounded-lg px-3 py-2 text-sm text-white outline-none border border-gray-700 focus:border-yellow-400" />
              </div>
            </div>

            {/* Video URL */}
            <div className="bg-[#111827] rounded-2xl p-4 space-y-3">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider">Video</h2>
              <p className="text-xs text-gray-400 break-all line-clamp-2">{state.videoUrl}</p>
              <div className="flex gap-2">
                <input
                  value={rawUrl}
                  onChange={e => setRawUrl(e.target.value)}
                  placeholder="Paste YouTube URL..."
                  className="flex-1 bg-[#1e2533] rounded-lg px-3 py-2 text-xs text-white outline-none border border-gray-700 focus:border-yellow-400"
                />
                <button onClick={applyUrl} className="px-3 py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold rounded-lg">Set</button>
              </div>
            </div>

            {/* Phase controls */}
            <div className="bg-[#111827] rounded-2xl p-4 space-y-2">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider">Controls</h2>
              {state.phase === 'idle' && (
                <button onClick={startWatching} className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold">
                  ▶ Show Video to Audience
                </button>
              )}
              {state.phase === 'watching' && (<>
                <button onClick={stopVideo} className="w-full py-2 bg-orange-600 hover:bg-orange-500 rounded-xl font-bold text-sm">
                  ⏸ Pause / Stop Video
                </button>
                <button onClick={startQA_A} className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold">
                  🎯 Start Q&A → {state.teamA}
                </button>
              </>)}
              {state.phase === 'qa_a' && (
                <button onClick={() => update({ phase: 'break', timerStart: null })} className="w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-xl font-bold text-sm">
                  → End {state.teamA} — Go to Break
                </button>
              )}
              {state.phase === 'break' && (<>
                <div className="text-center py-2 bg-blue-900/40 rounded-xl text-blue-300 text-sm font-bold">
                  Break — {state.teamA} finished with {state.correctA}/{state.questions.length} correct
                </div>
                <button onClick={startQA_B} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold">
                  🎯 Start Q&A → {state.teamB}
                </button>
              </>)}
              {state.phase === 'qa_b' && (
                <button onClick={() => update({ phase: 'done', timerStart: null })} className="w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-xl font-bold text-sm">
                  → End {state.teamB} — Finish Round
                </button>
              )}
              {state.phase === 'done' && (
                <div className="text-center py-4">
                  <p className="text-2xl font-black text-yellow-400">Round Complete!</p>
                  <p className="text-sm text-gray-400 mt-1">{state.teamA}: {state.scoreA}pts · {state.teamB}: {state.scoreB}pts</p>
                </div>
              )}
            </div>
          </div>

          {/* Right column: Q&A or questions list */}
          <div className="col-span-3 space-y-4">

            {/* Active question panel */}
            {(state.phase === 'qa_a' || state.phase === 'qa_b') && currentQ && (
              <div className="bg-[#111827] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-sm text-gray-400">
                    Q{state.currentQ + 1}/{state.questions.length} · <span className="text-white">{currentTeam}</span>
                  </h2>
                  <div className={`text-4xl font-black tabular-nums ${timer < 10 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {timer.toFixed(1)}s
                  </div>
                </div>
                <p className="text-xl font-bold leading-snug">{currentQ.text}</p>
                <div className={`rounded-xl p-3 bg-gray-800 transition-all ${currentQ.revealed ? 'opacity-100' : 'opacity-0'}`}>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Answer: </span>
                  <span className="font-bold text-green-400">{currentQ.answer}</span>
                </div>
                <div className="flex gap-3">
                  <button onClick={markCorrect}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-black text-lg">
                    ✓ Correct
                  </button>
                  <button onClick={markWrong}
                    className="flex-1 py-3 bg-red-700 hover:bg-red-600 rounded-xl font-black text-lg">
                    ✗ Wrong
                  </button>
                </div>
                <button onClick={nextQuestion} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-sm">
                  → Next Question
                </button>
              </div>
            )}

            {/* Questions list */}
            <div className="bg-[#111827] rounded-2xl p-4 space-y-3">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider">Questions ({state.questions.length})</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {state.questions.map((q, i) => (
                  <div key={q.id} className={`rounded-xl p-3 flex items-start gap-2 ${i === state.currentQ && (state.phase === 'qa_a' || state.phase === 'qa_b') ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-[#1e2533]'}`}>
                    <span className="text-xs text-gray-500 font-bold mt-0.5 w-5 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{q.text}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">A: {q.answer}</p>
                    </div>
                    {(state.phase === 'idle' || state.phase === 'watching') && (
                      <button onClick={() => removeQuestion(q.id)} className="text-gray-600 hover:text-red-400 text-xs shrink-0">✕</button>
                    )}
                  </div>
                ))}
              </div>
              {(state.phase === 'idle' || state.phase === 'watching') && (
                <div className="space-y-2 pt-2 border-t border-gray-700">
                  <input value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="New question..."
                    className="w-full bg-[#1e2533] rounded-lg px-3 py-2 text-sm text-white outline-none border border-gray-700 focus:border-yellow-400" />
                  <input value={newA} onChange={e => setNewA(e.target.value)} placeholder="Answer..."
                    className="w-full bg-[#1e2533] rounded-lg px-3 py-2 text-sm text-white outline-none border border-gray-700 focus:border-yellow-400" />
                  <button onClick={addQuestion} className="w-full py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold rounded-lg">+ Add Question</button>
                </div>
              )}
            </div>

            {/* Score summary */}
            <div className="bg-[#111827] rounded-2xl p-4">
              <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-wider mb-3">Scores</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-900/30 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">{state.teamA}</p>
                  <p className="text-3xl font-black text-green-400">{state.scoreA}</p>
                  <p className="text-xs text-gray-500">{state.correctA}/{state.questions.length} correct</p>
                </div>
                <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">{state.teamB}</p>
                  <p className="text-3xl font-black text-blue-400">{state.scoreB}</p>
                  <p className="text-xs text-gray-500">{state.correctB}/{state.questions.length} correct</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
