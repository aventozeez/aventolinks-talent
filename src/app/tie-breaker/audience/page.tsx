'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'

const CHANNEL = 'tie:state'
const ROUND_MS = 30_000

type TBQuestion = { id: string; text: string; answer: string }
type TBPhase = 'setup' | 'a_playing' | 'break' | 'b_playing' | 'done'

type TBState = {
  phase: TBPhase
  teamA: string
  teamB: string
  priorA: number
  priorB: number
  questions: TBQuestion[]
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

export default function TieBreakerAudience() {
  const [s, setS] = useState<TBState | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (payload) => {
      if (payload) setS(payload as TBState)
    })
    return () => unsub()
  }, [])

  // Tick every 100ms for the smooth timer countdown (deterministic from
  // s.timerStart — no drift between admin and audience).
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(iv)
  }, [])

  // ── Not yet started ────────────────────────────────────────────────────
  if (!s || s.phase === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0a2a] via-[#2a0a1f] to-[#0a0a1f] flex flex-col items-center justify-center gap-6 text-white px-6">
        <div className="text-8xl animate-pulse">🔔</div>
        <h1 className="text-5xl font-black">Tie Breaker</h1>
        <p className="text-slate-400 text-lg">Rapid fire · 30 seconds per team</p>
        {s?.teamA && s?.teamB && (
          <div className="flex gap-6 mt-4">
            <div className="text-center">
              <p className="text-green-400 text-2xl font-black">{s.teamA}</p>
              {s.priorA > 0 && <p className="text-slate-500 text-sm mt-1">Prior: {s.priorA}</p>}
            </div>
            <div className="self-center text-6xl">⚡</div>
            <div className="text-center">
              <p className="text-blue-400 text-2xl font-black">{s.teamB}</p>
              {s.priorB > 0 && <p className="text-slate-500 text-sm mt-1">Prior: {s.priorB}</p>}
            </div>
          </div>
        )}
        <p className="text-slate-500 text-sm italic">Waiting for the host to start…</p>
      </div>
    )
  }

  // ── Break — team A finished ────────────────────────────────────────────
  if (s.phase === 'break') {
    return (
      <div className="min-h-screen bg-[#06080f] flex flex-col items-center justify-center gap-8 text-white px-6">
        <div className="text-6xl">☕</div>
        <h2 className="text-3xl font-black text-center">Half-Time</h2>
        <div className="bg-green-900/30 border border-green-500/40 rounded-2xl p-8 text-center w-full max-w-sm">
          <p className="text-green-300 text-sm mb-1">{s.teamA}</p>
          <p className="text-6xl font-black text-green-400">{s.scoreA}</p>
          <p className="text-xs text-gray-500 mt-2">{s.correctA} correct in 30 seconds</p>
        </div>
        <p className="text-yellow-300 font-bold animate-pulse">⏳ {s.teamB} is up next…</p>
      </div>
    )
  }

  // ── Done — final results ────────────────────────────────────────────────
  if (s.phase === 'done') {
    const aWins = s.scoreA > s.scoreB
    const bWins = s.scoreB > s.scoreA
    const tie = s.scoreA === s.scoreB
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0f00] via-[#2a1500] to-[#1a0f00] text-white flex flex-col items-center justify-center gap-8 px-6 overflow-hidden relative">
        <p className="text-yellow-400 text-sm font-bold uppercase tracking-[0.4em] z-10">Tie-Breaker Result</p>
        <div className="text-8xl z-10">{tie ? '🤝' : '🏆'}</div>
        <div className="grid grid-cols-2 gap-6 w-full max-w-lg z-10">
          <div className={`rounded-3xl p-6 text-center border-4 ${aWins ? 'bg-green-500/30 border-green-400' : 'bg-white/5 border-white/10'}`}>
            {aWins && <div className="text-3xl mb-1">🏆</div>}
            <p className="text-green-400 text-sm font-bold">{s.teamA}</p>
            <p className="text-6xl font-black text-green-300 mt-1">{s.scoreA}</p>
          </div>
          <div className={`rounded-3xl p-6 text-center border-4 ${bWins ? 'bg-blue-500/30 border-blue-400' : 'bg-white/5 border-white/10'}`}>
            {bWins && <div className="text-3xl mb-1">🏆</div>}
            <p className="text-blue-400 text-sm font-bold">{s.teamB}</p>
            <p className="text-6xl font-black text-blue-300 mt-1">{s.scoreB}</p>
          </div>
        </div>
        {tie && <p className="text-yellow-400 font-black text-2xl z-10">It&apos;s still a tie!</p>}
        {!tie && <p className="text-yellow-300 font-bold text-xl z-10">{aWins ? s.teamA : s.teamB} wins the tie-breaker</p>}
      </div>
    )
  }

  // ── Live rapid fire (a_playing or b_playing) ───────────────────────────
  const isPlayingA = s.phase === 'a_playing'
  const teamColour = isPlayingA ? '#22c55e' : '#3b82f6'
  const playingName = isPlayingA ? s.teamA : s.teamB
  const activeQueue = isPlayingA ? s.queueA : s.queueB
  const currentQ = activeQueue[0] ?? s.currentQ
  const timeLeft = s.timerStart ? Math.max(0, ROUND_MS - (now - s.timerStart)) : ROUND_MS
  const timePct = timeLeft / ROUND_MS
  const timeColour = timePct > 0.4 ? '#22c55e' : timePct > 0.2 ? '#f59e0b' : '#ef4444'
  const correctSoFar = isPlayingA ? s.correctA : s.correctB

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex flex-col overflow-hidden">
      {/* Score bar */}
      <div className="bg-[#0d1117] px-6 py-3 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="font-bold text-sm text-green-400">{s.teamA}</span>
          <span className="text-xl font-black text-white ml-1">{s.scoreA}</span>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Tie-Breaker · Rapid Fire</p>
          <p className="text-xs text-gray-400">{correctSoFar} correct so far</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-black text-white mr-1">{s.scoreB}</span>
          <span className="font-bold text-sm text-blue-400">{s.teamB}</span>
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
        </div>
      </div>

      {/* Playing team banner */}
      <div className="py-3 px-6 text-center" style={{ background: `${teamColour}18` }}>
        <p className="font-black text-sm tracking-widest uppercase" style={{ color: teamColour }}>
          {playingName} — 30-second Rapid Fire
        </p>
      </div>

      {/* Circular timer + question */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
        <div className="relative w-40 h-40 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#1e2533" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="44" fill="none"
              stroke={timeColour}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (1 - timePct)}`}
              style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.5s' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-black tabular-nums" style={{ color: timeColour }}>{Math.ceil(timeLeft / 1000)}</span>
            <span className="text-xs text-gray-500">seconds</span>
          </div>
        </div>

        {currentQ ? (
          <div className="w-full max-w-3xl rounded-3xl p-8 text-center border-2 transition-all"
            style={{ background: `${teamColour}15`, borderColor: `${teamColour}60` }}>
            <p className="text-2xl md:text-3xl font-black leading-snug">{currentQ.text}</p>
          </div>
        ) : (
          <div className="w-full max-w-3xl rounded-3xl p-8 text-center border-2 bg-yellow-900/20 border-yellow-500/40">
            <p className="text-xl font-black text-yellow-300">All questions answered! Waiting for time to expire…</p>
          </div>
        )}
      </div>
    </div>
  )
}
