'use client'
import { useState, useEffect, useRef } from 'react'

const WS_URL = 'ws://localhost:3001'
const CHANNEL = 'av:state'
const ROUND_MS = 60_000

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
  mcScoreA: number
  mcScoreB: number
  questionsA: AVQuestion[]
  questionsB: AVQuestion[]
  queueA: AVQuestion[]
  queueB: AVQuestion[]
  timerStart: number | null
  scoreA: number
  scoreB: number
  correctA: number
  correctB: number
}

export default function AVAudienceView() {
  const [s, setS] = useState<AVState | null>(null)
  const [connected, setConnected] = useState(false)
  const [timer, setTimer] = useState(ROUND_MS / 1000)
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

  // Pulse when the front-of-queue question changes
  const activeQueue = s?.phase === 'qa_a' ? s.queueA : s?.phase === 'qa_b' ? s.queueB : []
  const currentQ = activeQueue[0]
  useEffect(() => {
    if (!s) return
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 500)
    return () => clearTimeout(t)
  }, [currentQ?.id, s?.phase])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (s?.timerStart && (s.phase === 'qa_a' || s.phase === 'qa_b')) {
      timerRef.current = setInterval(() => {
        const left = Math.max(0, ROUND_MS / 1000 - (Date.now() - s.timerStart!) / 1000)
        setTimer(left)
      }, 100)
    } else {
      setTimer(ROUND_MS / 1000)
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

  const currentTeam = s.phase === 'qa_a' ? s.teamA : s.phase === 'qa_b' ? s.teamB : null
  const teamColor = s.phase === 'qa_a' ? '#22c55e' : '#3b82f6'
  const timerPct = timer / (ROUND_MS / 1000)
  const timerColor = timer < 10 ? '#ef4444' : timer < 20 ? '#f59e0b' : '#22c55e'
  const totalQ = s.phase === 'qa_a' ? s.questionsA.length : s.phase === 'qa_b' ? s.questionsB.length : 0
  const currentCorrect = s.phase === 'qa_a' ? s.correctA : s.correctB

  if (s.phase === 'idle') {
    return (
      <div className="min-h-screen bg-[#06080f] flex flex-col items-center justify-center gap-6 text-white">
        <div className="text-6xl">📺</div>
        <h1 className="text-4xl font-black tracking-tight">Audio Visual Round</h1>
        <p className="text-gray-400">Watch the video, then 60 seconds of questions per team</p>
        <div className="flex gap-6 mt-4">
          <div className="text-center">
            <p className="text-2xl font-black text-green-400">{s.teamA}</p>
            <p className="text-xs text-gray-500 mt-1">Team A · {s.questionsA.length} questions</p>
          </div>
          <div className="text-gray-600 text-3xl font-thin self-center">vs</div>
          <div className="text-center">
            <p className="text-2xl font-black text-blue-400">{s.teamB}</p>
            <p className="text-xs text-gray-500 mt-1">Team B · {s.questionsB.length} questions</p>
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
            <span className="text-white font-bold">Audio Visual Round · Both teams watch</span>
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
            👀 Watch carefully — 60 seconds of questions per team follow this video
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
          <p className="text-xs text-gray-500 mt-1">{s.correctA}/{s.questionsA.length} correct in AV</p>
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
        <h2 className="text-4xl font-black text-center">Grand Final Complete</h2>
        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
          <div className={`rounded-2xl p-6 text-center border-2 ${aWins ? 'bg-green-900/40 border-green-500' : 'bg-[#111827] border-gray-700'}`}>
            {aWins && <div className="text-2xl mb-1">🏆</div>}
            <p className="text-gray-400 text-sm">{s.teamA}</p>
            <p className="text-5xl font-black text-green-400">{s.scoreA}</p>
            <p className="text-xs text-gray-500 mt-1">MC {s.mcScoreA} + AV {s.scoreA - s.mcScoreA}</p>
          </div>
          <div className={`rounded-2xl p-6 text-center border-2 ${bWins ? 'bg-blue-900/40 border-blue-500' : 'bg-[#111827] border-gray-700'}`}>
            {bWins && <div className="text-2xl mb-1">🏆</div>}
            <p className="text-gray-400 text-sm">{s.teamB}</p>
            <p className="text-5xl font-black text-blue-400">{s.scoreB}</p>
            <p className="text-xs text-gray-500 mt-1">MC {s.mcScoreB} + AV {s.scoreB - s.mcScoreB}</p>
          </div>
        </div>
        {tie && <p className="text-yellow-400 font-black text-2xl">🤝 It&apos;s a Tie!</p>}
        {!tie && <p className="text-yellow-300 font-bold text-xl">{aWins ? s.teamA : s.teamB} wins!</p>}
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
          <p className="text-xs text-gray-400">{currentCorrect} correct · {activeQueue.length} left in queue</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-black text-white mr-1">{s.scoreB}</span>
          <span className="font-bold text-sm text-blue-400">{s.teamB}</span>
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
        </div>
      </div>

      <div className="py-3 px-6 text-center shrink-0" style={{ background: `${teamColor}18` }}>
        <p className="font-black text-sm tracking-widest uppercase" style={{ color: teamColor }}>
          {currentTeam} — 60 Seconds · Up to {totalQ} Questions
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
        {/* Circular 60s timer */}
        <div className="relative w-40 h-40 shrink-0">
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
            <span className="text-4xl font-black tabular-nums" style={{ color: timerColor }}>{Math.ceil(timer)}</span>
            <span className="text-xs text-gray-500">seconds left</span>
          </div>
        </div>

        {currentQ ? (
          <div className={`w-full max-w-2xl rounded-3xl p-8 text-center border-2 transition-all duration-300 ${pulse ? 'scale-105' : 'scale-100'}`}
            style={{ background: `${teamColor}15`, borderColor: `${teamColor}60` }}>
            <p className="text-xs uppercase tracking-widest font-bold mb-4" style={{ color: teamColor }}>
              Question · {currentCorrect + 1} of up to {totalQ}
            </p>
            <p className="text-2xl font-black leading-snug">{currentQ.text}</p>
          </div>
        ) : (
          <div className="w-full max-w-2xl rounded-3xl p-8 text-center border-2 bg-yellow-900/20 border-yellow-500/40">
            <p className="text-2xl font-black text-yellow-300">All questions answered! 🎉</p>
          </div>
        )}

        {/* Progress dots */}
        {totalQ > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: totalQ }).map((_, i) => (
              <div key={i} className={`rounded-full transition-all ${
                i < currentCorrect ? 'w-3 h-3 bg-green-500' : 'w-3 h-3 bg-gray-700'
              }`} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
