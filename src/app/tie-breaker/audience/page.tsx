'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'

const CHANNEL = 'tie:state'

type TBQuestion = { id: string; text: string; answer: string }

type TBState = {
  phase: 'setup' | 'live' | 'won'
  teamA: string
  teamB: string
  scoreA: number
  scoreB: number
  questions: TBQuestion[]
  currentIdx: number
  buzzedBy: 'A' | 'B' | null
  triedThisQ: ('A' | 'B')[]
  winner: 'A' | 'B' | null
}

export default function TieBreakerAudience() {
  const [s, setS] = useState<TBState | null>(null)

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (payload) => {
      if (payload) setS(payload as TBState)
    })
    return () => unsub()
  }, [])

  // Not yet started / no state
  if (!s || s.phase === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0a2a] via-[#2a0a1f] to-[#0a0a1f] flex flex-col items-center justify-center gap-6 text-white px-6">
        <div className="text-8xl animate-pulse">🔔</div>
        <h1 className="text-5xl font-black">Tie Breaker</h1>
        <p className="text-slate-400 text-lg">Waiting for the host to start the buzzer round…</p>
        {s?.teamA && s?.teamB && (
          <div className="flex gap-6 mt-4">
            <div className="text-center">
              <p className="text-green-400 text-2xl font-black">{s.teamA}</p>
              <p className="text-white text-3xl font-black">{s.scoreA}</p>
            </div>
            <div className="self-center text-6xl">⚡</div>
            <div className="text-center">
              <p className="text-blue-400 text-2xl font-black">{s.teamB}</p>
              <p className="text-white text-3xl font-black">{s.scoreB}</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Winner declared
  if (s.phase === 'won' && s.winner) {
    const winnerName = s.winner === 'A' ? s.teamA : s.teamB
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0f00] via-[#2a1500] to-[#1a0f00] text-white flex flex-col items-center justify-center gap-8 px-6 overflow-hidden relative">
        {/* Confetti-like decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="absolute text-4xl" style={{
              left: `${(i * 7) % 100}%`,
              top: `${(i * 11) % 100}%`,
              animation: `float ${3 + (i % 4)}s ease-in-out ${i * 0.1}s infinite`,
            }}>
              {['🎉', '⭐', '✨', '🎊'][i % 4]}
            </div>
          ))}
        </div>
        <p className="text-yellow-400 text-sm font-bold uppercase tracking-[0.4em] z-10">Tie-Breaker Winner</p>
        <div className="text-[10rem] animate-pulse z-10">🏆</div>
        <div className="bg-gradient-to-br from-yellow-500/30 to-orange-500/30 border-4 border-yellow-400 rounded-3xl px-20 py-16 shadow-2xl backdrop-blur-sm z-10">
          <p className="text-6xl md:text-7xl font-black text-white leading-tight text-center"
            style={{ textShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
            {winnerName}
          </p>
          <p className="text-yellow-100 text-base mt-4 text-center font-bold">wins the tie-breaker</p>
        </div>
        <style dangerouslySetInnerHTML={{
          __html: `@keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.4; }
            50% { transform: translateY(-30px) rotate(180deg); opacity: 0.8; }
          }`
        }} />
      </div>
    )
  }

  // Live buzzer round
  const q = s.questions[s.currentIdx]
  const buzzed = s.buzzedBy
  const buzzedName = buzzed === 'A' ? s.teamA : buzzed === 'B' ? s.teamB : ''
  const buzzedColour = buzzed === 'A' ? '#22c55e' : '#3b82f6'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0a2a] via-[#2a0a1f] to-[#0a0a1f] text-white flex flex-col items-center justify-center gap-6 px-6">
      <p className="text-pink-300 text-sm font-bold uppercase tracking-[0.4em] animate-pulse">Tie-Breaker · Buzzer Round</p>

      {/* Team scores side by side */}
      <div className="flex items-center gap-6">
        <div className="text-center">
          <p className="text-green-400 text-2xl md:text-3xl font-black">{s.teamA}</p>
          <p className="text-white text-4xl md:text-5xl font-black">{s.scoreA}</p>
        </div>
        <div className="text-6xl md:text-7xl">🔔</div>
        <div className="text-center">
          <p className="text-blue-400 text-2xl md:text-3xl font-black">{s.teamB}</p>
          <p className="text-white text-4xl md:text-5xl font-black">{s.scoreB}</p>
        </div>
      </div>

      <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">
        Question {s.currentIdx + 1} of {s.questions.length}
      </p>

      {q && (
        <div className="w-full max-w-3xl rounded-3xl p-8 md:p-10 text-center border-2"
          style={{
            background: buzzed
              ? `linear-gradient(135deg, ${buzzedColour}22 0%, ${buzzedColour}11 100%)`
              : 'rgba(255,255,255,0.04)',
            borderColor: buzzed ? buzzedColour : 'rgba(255,255,255,0.15)',
            transition: 'all 0.35s ease',
          }}>
          <p className="text-2xl md:text-3xl font-black leading-snug">{q.text}</p>
        </div>
      )}

      {buzzed && (
        <div className="rounded-2xl px-6 py-3 border-2 animate-pulse"
          style={{ borderColor: buzzedColour, background: `${buzzedColour}20` }}>
          <p className="text-white font-black text-xl md:text-2xl">
            🔔 <span style={{ color: buzzedColour }}>{buzzedName}</span> buzzed in!
          </p>
        </div>
      )}

      {!buzzed && (
        <p className="text-slate-500 text-sm italic">First team to buzz gets to answer…</p>
      )}

      {s.triedThisQ.length > 0 && !buzzed && (
        <p className="text-slate-500 text-xs italic">
          Already tried this one: {s.triedThisQ.map(t => t === 'A' ? s.teamA : s.teamB).join(' and ')}
        </p>
      )}
    </div>
  )
}
