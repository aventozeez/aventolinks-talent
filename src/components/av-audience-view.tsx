'use client'
import { useState, useEffect, useRef } from 'react'

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

export default function AVAudienceView() {
  const [s, setS] = useState<AVState | null>(null)
  const [connected, setConnected] = useState(false)
  const [timer, setTimer] = useState(0)
  const [pulse, setPulse] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL)
      ws.onopen = () => {
        setConnected(true)
        ws.send(JSON.stringify({ type: 'subscribe', channel: CHANNEL }))
      }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.channel === CHANNEL && msg.payload) setS(msg.payload)
        } catch {}
      }
      ws.onclose = () => { setConnected(false); setTimeout(connect, 2000) }
      ws.onerror = () => ws.close()
      wsRef.current = ws
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  useEffect(() => {
    if (!s) return
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 600)
    return () => clearTimeout(t)
  }, [s?.currentQ, s?.phase])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (s?.timerStart && (s.phase === 'qa_a' || s.phase === 'qa_b')) {
      timerRef.current = setInterval(() => {
        const left = Math.max(0, TIME_PER_Q - (Date.now() - s.timerStart!) / 1000)
        setTimer(left)
      }, 100)
    } else {
      setTimer(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s?.timerStart, s?.phase])

  if (!s) {
    return (
      <div className="min-h-screen bg-[#06080f] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full border-4 border-t-yellow-400 border-gray-700 animate-spin" />
        <p className="text-gray-400 text-sm">{connected ? 'Waiting for round to start…' : 'Connecting…'}</p>
      </div>
    )
  }

  const currentQ: AVQuestion | undefined = s.questions[s.currentQ]
  const currentTeam = s.phase === 'qa_a' ? s.teamA : s.phase === 'qa_b' ? s.teamB : null
  const teamColor = s.phase === 'qa_a' ? '#22c55e' : '#3b82f6'
  const timerPct = TIME_PER_Q > 0 ? timer / TIME_PER_Q : 0
  const timerColor = timer < 8 ? '#ef4444' : timer < 15 ? '#f59e0b' : '#22c55e'

  if (s.phase === 'idle') {
    return (
      <div className="min-h-screen bg-[#06080f] flex flex-col items-center justify-center gap-6 text-white">
        <div className="text-6xl">📺</div>
        <h1 className="text-4xl font-black tracking-tight">Audio Visual Round</h1>
        <p className="text-gray-400">Waiting for the host to begin…</p>
        <div className="flex gap-6 mt-4">
          <div className="text-center">
            <p className="text-2xl font-black text-green-400">{s.teamA}</p>
            <p className="text-xs text-gray-500 mt-1">Team A</p>
          </div>
          <div className="text-gray-600 text-3xl font-thin self-center">vs</div>
          <div className="text-center">
            <p className="text-2xl font-black text-blue-400">{s.teamB}</p>
            <p className="text-xs text-gray-500 mt-1">Team B</p>
          </div>
        </div>
      </div>
    )
  }

  if (s.phase === 'watching') {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="bg-[#06080f] px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-lg font-black">📺</span>
            <span className="text-white font-bold">Audio Visual Round</span>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-green-400 font-bold">{s.teamA}</span>
            <span className="text-gray-600">vs</span>
            <span className="text-blue-400 font-bold">{s.teamB}</span>
          </div>
        </div>

        <div className="flex-1 relative bg-black">
          <iframe
            ref={iframeRef}
            src={`${s.videoUrl}${s.videoUrl.includes('?') ? '&' : '?'}autoplay=1&mute=1&rel=0&playsinline=1`}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Audio Visual Round Video"
          />
          <div className="absolute bottom-14 right-4 bg-black/80 border border-yellow-500/60 text-yellow-300 px-3 py-2 rounded-lg text-xs font-bold pointer-events-none">
            🔇 Auto-muted for autoplay — click the video player to unmute
          </div>
        </div>

        <div className="bg-[#06080f] px-6 py-3 text-center shrink-0">
          <p className="text-yellow-300 font-bold text-sm animate-pulse">
            👀 Watch carefully — questions follow after the video
          </p>
        </div>
      </div>
    )
  }

  if (s.phase === 'break') {
    return (
      <div className="min-h-screen bg-[#06080f] flex flex-col items-center justify-center gap-8 text-white px-6">
        <div className="text-5xl">☕</div>
        <h2 className="text-3xl font-black text-center">Half-Time</h2>
        <div className="bg-green-900/30 border border-green-500/30 rounded-2xl p-6 text-center w-full max-w-sm">
          <p className="text-gray-400 text-sm mb-1">{s.teamA}</p>
          <p className="text-5xl font-black text-green-400">{s.scoreA}</p>
          <p className="text-xs text-gray-500 mt-1">{s.correctA}/{s.questions.length} correct</p>
        </div>
        <p className="text-yellow-300 font-bold animate-pulse">⏳ {s.teamB} is up next…</p>
      </div>
    )
  }

  if (s.phase === 'done') {
    const aWins = s.scoreA > s.scoreB
    const bWins = s.scoreB > s.scoreA
    const tie = s.scoreA === s.scoreB
    return (
      <div className="min-h-screen bg-[#06080f] flex flex-col items-center justify-center gap-8 text-white px-6">
        <div className="text-5xl">🏁</div>
        <h2 className="text-4xl font-black text-center">Round Complete</h2>
        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
          <div className={`rounded-2xl p-6 text-center border-2 ${aWins ? 'bg-green-900/40 border-green-500' : 'bg-[#111827] border-gray-700'}`}>
            {aWins && <div className="text-2xl mb-1">🏆</div>}
            <p className="text-gray-400 text-sm">{s.teamA}</p>
            <p className="text-5xl font-black text-green-400">{s.scoreA}</p>
            <p className="text-xs text-gray-500 mt-1">{s.correctA}/{s.questions.length} correct</p>
          </div>
          <div className={`rounded-2xl p-6 text-center border-2 ${bWins ? 'bg-blue-900/40 border-blue-500' : 'bg-[#111827] border-gray-700'}`}>
            {bWins && <div className="text-2xl mb-1">🏆</div>}
            <p className="text-gray-400 text-sm">{s.teamB}</p>
            <p className="text-5xl font-black text-blue-400">{s.scoreB}</p>
            <p className="text-xs text-gray-500 mt-1">{s.correctB}/{s.questions.length} correct</p>
          </div>
        </div>
        {tie && <p className="text-yellow-400 font-black text-2xl">🤝 It&apos;s a Tie!</p>}
        {!tie && <p className="text-yellow-300 font-bold text-xl">{aWins ? s.teamA : s.teamB} wins the Audio Visual Round!</p>}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex flex-col overflow-hidden">
      <div className="bg-[#0d1117] px-6 py-3 flex items-center justify-between shrink-0 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="font-bold text-sm text-green-400">{s.teamA}</span>
          <span className="text-xl font-black text-white ml-1">{s.scoreA}</span>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Audio Visual</p>
          <p className="text-xs text-gray-400">Q {s.currentQ + 1} of {s.questions.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-black text-white mr-1">{s.scoreB}</span>
          <span className="font-bold text-sm text-blue-400">{s.teamB}</span>
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
        </div>
      </div>

      <div className="py-3 px-6 text-center shrink-0" style={{ background: `${teamColor}18` }}>
        <p className="font-black text-sm tracking-widest uppercase" style={{ color: teamColor }}>
          {currentTeam} — Answering
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
        <div className="relative w-36 h-36 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#1e2533" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="44" fill="none"
              stroke={timerColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (1 - timerPct)}`}
              style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.5s' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black tabular-nums" style={{ color: timerColor }}>{Math.ceil(timer)}</span>
            <span className="text-xs text-gray-500">secs</span>
          </div>
        </div>

        {currentQ && (
          <div className={`w-full max-w-2xl rounded-3xl p-8 text-center border-2 transition-all duration-300 ${pulse ? 'scale-105' : 'scale-100'}`}
            style={{ background: `${teamColor}15`, borderColor: `${teamColor}60` }}>
            <p className="text-xs uppercase tracking-widest font-bold mb-4" style={{ color: teamColor }}>
              Question {s.currentQ + 1}
            </p>
            <p className="text-2xl font-black leading-snug">{currentQ.text}</p>
            {currentQ.revealed && (
              <div className={`mt-6 rounded-2xl px-6 py-4 ${currentQ.answeredBy ? 'bg-green-900/40 border border-green-500/40' : 'bg-red-900/40 border border-red-500/40'}`}>
                {currentQ.answeredBy
                  ? <p className="text-green-400 font-bold">✓ {currentQ.answeredBy === 'A' ? s.teamA : s.teamB} answered correctly!</p>
                  : <p className="text-red-400 font-bold">✗ Incorrect — Answer: {currentQ.answer}</p>
                }
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {s.questions.map((q, i) => (
            <div key={q.id} className={`rounded-full transition-all ${
              i === s.currentQ ? 'w-6 h-3' : 'w-3 h-3'
            } ${
              q.revealed
                ? q.answeredBy ? 'bg-green-500' : 'bg-red-500'
                : i === s.currentQ ? 'bg-yellow-400' : 'bg-gray-700'
            }`} />
          ))}
        </div>
      </div>
    </div>
  )
}
