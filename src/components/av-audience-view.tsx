'use client'
import { useState, useEffect, useRef } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import RoundInstructionsInline from '@/components/round-instructions-inline'
import { ROUND_INFO } from '@/lib/round-info'

// Uses the shared sync lib so both LAN (local WS relay) and public URL
// (Supabase Realtime broadcast) transports work.
const CHANNEL = 'av:state'
const ROUND_MS = 60_000

type AVQuestion = {
  id: string
  text: string
  answer: string
  revealed: boolean
  answeredBy: 'A' | 'B' | null
}

type AVPool = { id: string; title: string; questions: AVQuestion[] }

type AVState = {
  phase: 'idle' | 'watching'
    | 'pick_pool_a' | 'qa_a'
    | 'break'
    | 'pick_pool_b' | 'qa_b'
    | 'done'
    | 'tie_break'
    | 'declare_first_runnerup' | 'declare_winner'
  videoUrl: string
  videoPlay: boolean
  teamA: string
  teamB: string
  mcScoreA: number
  mcScoreB: number
  pools: AVPool[]
  chosenPoolA: string | null
  chosenPoolB: string | null
  queueA: AVQuestion[]
  queueB: AVQuestion[]
  timerStart: number | null
  scoreA: number
  scoreB: number
  correctA: number
  correctB: number
  // Tie-breaker
  tieQuestions?: AVQuestion[]
  tieCurrentIdx?: number
  tieBuzzedBy?: 'A' | 'B' | null
  tieTriedThisQ?: ('A' | 'B')[]
  tieWinner?: 'A' | 'B' | null
}

export default function AVAudienceView() {
  const [s, setS] = useState<AVState | null>(null)
  const [connected, setConnected] = useState(false)
  const [timer, setTimer] = useState(ROUND_MS / 1000)
  const [pulse, setPulse] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (payload) => {
      setConnected(true)
      if (payload) setS(payload as AVState)
    })
    return () => { unsub() }
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
  const poolA = s.pools?.find(p => p.id === s.chosenPoolA)
  const poolB = s.pools?.find(p => p.id === s.chosenPoolB)
  const totalQ = s.phase === 'qa_a' ? (poolA?.questions.length ?? 0) : s.phase === 'qa_b' ? (poolB?.questions.length ?? 0) : 0
  const currentCorrect = s.phase === 'qa_a' ? s.correctA : s.correctB

  if (s.phase === 'idle') {
    return (
      <div className="min-h-screen bg-[#06080f] flex flex-col items-center justify-center gap-6 text-white p-6">
        <RoundInstructionsInline
          info={ROUND_INFO.audio_visual}
          footerHint={`${s.teamA} vs ${s.teamB} · waiting for the video to start…`}
        />
      </div>
    )
  }

  // ── Pool picking screens — full-screen list of pools, highlight remaining ──
  if (s.phase === 'pick_pool_a' || s.phase === 'pick_pool_b') {
    const pickingTeam = s.phase === 'pick_pool_a' ? s.teamA : s.teamB
    const teamColour = s.phase === 'pick_pool_a' ? 'green' : 'blue'
    const takenId = s.phase === 'pick_pool_b' ? s.chosenPoolA : null
    return (
      <div className="min-h-screen bg-[#06080f] text-white flex flex-col items-center justify-center gap-8 px-6">
        <p className={`text-${teamColour}-300 text-sm font-bold uppercase tracking-[0.3em]`}>Picking a Pool</p>
        <h1 className="text-4xl md:text-5xl font-black text-center">{pickingTeam}</h1>
        <p className="text-slate-400 text-base">Choose one of the pools below</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full">
          {(s.pools ?? []).map((pl, i) => {
            const taken = pl.id === takenId
            return (
              <div key={pl.id} className={`rounded-2xl p-5 border-2 text-center ${
                taken ? 'bg-white/5 border-white/10 opacity-50'
                      : `bg-${teamColour}-900/20 border-${teamColour}-500/40`
              }`}>
                <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Pool {i + 1}</p>
                <p className="text-white font-black text-lg md:text-xl mt-3 leading-snug">{pl.title}</p>
                <p className="text-slate-500 text-xs mt-3">{pl.questions.length} questions</p>
                {taken && <p className="text-slate-500 text-[10px] mt-2 font-bold uppercase">Taken by {s.teamA}</p>}
              </div>
            )
          })}
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
          <p className="text-xs text-gray-500 mt-1">{s.correctA}/{poolA?.questions.length ?? 0} correct in AV</p>
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
            <p className="text-xs text-gray-500 mt-1">Prior {s.mcScoreA} + AV {s.scoreA - s.mcScoreA}</p>
          </div>
          <div className={`rounded-2xl p-6 text-center border-2 ${bWins ? 'bg-blue-900/40 border-blue-500' : 'bg-[#111827] border-gray-700'}`}>
            {bWins && <div className="text-2xl mb-1">🏆</div>}
            <p className="text-gray-400 text-sm">{s.teamB}</p>
            <p className="text-5xl font-black text-blue-400">{s.scoreB}</p>
            <p className="text-xs text-gray-500 mt-1">Prior {s.mcScoreB} + AV {s.scoreB - s.mcScoreB}</p>
          </div>
        </div>
        {tie && <p className="text-yellow-400 font-black text-2xl">🤝 It&apos;s a Tie!</p>}
        {!tie && <p className="text-yellow-300 font-bold text-xl">Awaiting official declaration…</p>}
      </div>
    )
  }

  // ── Tie-breaker (buzzer sudden-death) ──
  if (s.phase === 'tie_break') {
    const q = (s.tieQuestions ?? [])[s.tieCurrentIdx ?? 0]
    const buzzed = s.tieBuzzedBy ?? null
    const buzzedName = buzzed === 'A' ? s.teamA : buzzed === 'B' ? s.teamB : ''
    const buzzedColour = buzzed === 'A' ? '#22c55e' : '#3b82f6'
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0a2a] via-[#2a0a1f] to-[#0a0a1f] text-white flex flex-col items-center justify-center gap-6 px-6">
        <p className="text-pink-300 text-sm font-bold uppercase tracking-[0.4em] animate-pulse">Tie-Breaker · Buzzer Round</p>
        {/* Team scores + tied badge */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-green-400 text-2xl font-black">{s.teamA}</p>
            <p className="text-white text-4xl font-black">{s.scoreA}</p>
          </div>
          <div className="text-6xl">🔔</div>
          <div className="text-center">
            <p className="text-blue-400 text-2xl font-black">{s.teamB}</p>
            <p className="text-white text-4xl font-black">{s.scoreB}</p>
          </div>
        </div>
        <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Question {(s.tieCurrentIdx ?? 0) + 1} of {(s.tieQuestions?.length ?? 0)}</p>
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
        {/* Buzz feedback */}
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
        {/* Tried indicators */}
        {(s.tieTriedThisQ?.length ?? 0) > 0 && !buzzed && (
          <p className="text-slate-500 text-xs italic">
            Already tried this one: {(s.tieTriedThisQ ?? []).map(t => t === 'A' ? s.teamA : s.teamB).join(' and ')}
          </p>
        )}
      </div>
    )
  }

  // ── Dedicated First Runner Up declaration ──
  if (s.phase === 'declare_first_runnerup') {
    // If the tie-break decided it, that overrides raw scores; otherwise the
    // first runner-up is the lower cumulative score.
    let runnerUp: { name: string; prior: number; av: number; total: number }
    if (s.tieWinner) {
      const runnerLetter: 'A' | 'B' = s.tieWinner === 'A' ? 'B' : 'A'
      runnerUp = runnerLetter === 'A'
        ? { name: s.teamA, prior: s.mcScoreA, av: s.scoreA - s.mcScoreA, total: s.scoreA }
        : { name: s.teamB, prior: s.mcScoreB, av: s.scoreB - s.mcScoreB, total: s.scoreB }
    } else {
      runnerUp = s.scoreA < s.scoreB
        ? { name: s.teamA, prior: s.mcScoreA, av: s.scoreA - s.mcScoreA, total: s.scoreA }
        : { name: s.teamB, prior: s.mcScoreB, av: s.scoreB - s.mcScoreB, total: s.scoreB }
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#2a1a0a] to-[#0a0a1a] text-white flex flex-col items-center justify-center gap-8 px-6">
        <p className="text-yellow-300 text-sm font-bold uppercase tracking-[0.4em]">Oyo State Scholars Challenge 2026</p>
        <div className="text-9xl animate-bounce">🥈</div>
        <p className="text-yellow-200 text-lg font-bold uppercase tracking-widest">And the</p>
        <h1 className="text-6xl md:text-8xl font-black text-white leading-tight text-center">First Runner Up</h1>
        <p className="text-slate-400 text-lg">is</p>
        <div className="bg-gradient-to-br from-yellow-900/40 to-orange-900/40 border-2 border-yellow-500/60 rounded-3xl px-16 py-12 shadow-2xl backdrop-blur-sm">
          <p className="text-6xl md:text-7xl font-black text-yellow-300 leading-tight text-center">{runnerUp.name}</p>
          <p className="text-slate-300 text-base mt-6 text-center">
            Prior rounds: <span className="font-bold text-white">{runnerUp.prior}</span>
            <span className="mx-3 text-slate-600">+</span>
            AV Round: <span className="font-bold text-white">{runnerUp.av}</span>
            <span className="mx-3 text-slate-600">=</span>
            <span className="font-black text-3xl text-white ml-1">{runnerUp.total} pts</span>
          </p>
        </div>
        <p className="text-slate-500 text-sm italic text-center max-w-xl">
          A magnificent performance. Awaiting the winner announcement…
        </p>
      </div>
    )
  }

  // ── Dedicated Winner declaration ──
  if (s.phase === 'declare_winner') {
    let winner: { name: string; prior: number; av: number; total: number }
    if (s.tieWinner) {
      winner = s.tieWinner === 'A'
        ? { name: s.teamA, prior: s.mcScoreA, av: s.scoreA - s.mcScoreA, total: s.scoreA }
        : { name: s.teamB, prior: s.mcScoreB, av: s.scoreB - s.mcScoreB, total: s.scoreB }
    } else {
      winner = s.scoreA >= s.scoreB
        ? { name: s.teamA, prior: s.mcScoreA, av: s.scoreA - s.mcScoreA, total: s.scoreA }
        : { name: s.teamB, prior: s.mcScoreB, av: s.scoreB - s.mcScoreB, total: s.scoreB }
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0f00] via-[#2a1500] to-[#1a0f00] text-white flex flex-col items-center justify-center gap-8 px-6 overflow-hidden relative">
        {/* Confetti-like decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
          {Array.from({length: 20}).map((_, i) => (
            <div key={i} className="absolute text-4xl" style={{
              left: `${(i * 7) % 100}%`,
              top: `${(i * 11) % 100}%`,
              animation: `float ${3 + (i % 4)}s ease-in-out ${i * 0.1}s infinite`,
            }}>
              {['🎉','⭐','✨','🎊'][i % 4]}
            </div>
          ))}
        </div>
        <p className="text-yellow-400 text-sm font-bold uppercase tracking-[0.4em] z-10">Oyo State Scholars Challenge 2026</p>
        <div className="text-[10rem] animate-pulse z-10">🏆</div>
        <p className="text-yellow-300 text-xl font-bold uppercase tracking-widest z-10">The Champion of Champions</p>
        <h1 className="text-7xl md:text-9xl font-black text-yellow-300 leading-tight text-center z-10 drop-shadow-2xl"
          style={{textShadow: '0 0 40px rgba(253, 224, 71, 0.6), 0 0 80px rgba(253, 224, 71, 0.4)'}}>
          WINNER
        </h1>
        <div className="bg-gradient-to-br from-yellow-500/30 to-orange-500/30 border-4 border-yellow-400 rounded-3xl px-20 py-16 shadow-2xl backdrop-blur-sm z-10">
          <p className="text-7xl md:text-8xl font-black text-white leading-tight text-center"
            style={{textShadow: '0 4px 20px rgba(0,0,0,0.6)'}}>
            {winner.name}
          </p>
          <p className="text-yellow-100 text-lg mt-6 text-center font-bold">
            Prior rounds: <span className="text-white">{winner.prior}</span>
            <span className="mx-3 text-yellow-500">+</span>
            AV Round: <span className="text-white">{winner.av}</span>
            <span className="mx-3 text-yellow-500">=</span>
            <span className="font-black text-4xl text-white ml-1">{winner.total} pts</span>
          </p>
        </div>
        <p className="text-yellow-200 text-base font-bold text-center z-10">
          🎉 Congratulations {winner.name} — Champions of the Oyo State Scholars Challenge 2026 🎉
        </p>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.4; }
            50% { transform: translateY(-30px) rotate(180deg); opacity: 0.8; }
          }
        `}} />
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
