'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import RoundInstructionsInline from '@/components/round-instructions-inline'
import { ROUND_INFO } from '@/lib/round-info'

const CHANNEL = 'tie:state'
const ROUND_MS = 30_000

type TBQuestion = { id: string; text: string; answer: string }
type TBPool = { id: string; title: string; questions: TBQuestion[] }
type TBPhase =
  | 'setup'
  | 'intro'
  | 'announce_a'
  | 'a_playing'
  | 'score_a'
  | 'announce_b'
  | 'b_playing'
  | 'score_b'
  | 'announce_c'
  | 'c_playing'
  | 'score_c'
  | 'compare'

type TBState = {
  phase: TBPhase
  threeTeam?: boolean
  teamA: string
  teamB: string
  teamC?: string
  priorA: number
  priorB: number
  priorC?: number
  pools: TBPool[]
  chosenPoolA: string | null
  chosenPoolB: string | null
  chosenPoolC?: string | null
  queueA: TBQuestion[]
  queueB: TBQuestion[]
  queueC?: TBQuestion[]
  scoreA: number
  scoreB: number
  scoreC?: number
  correctA: number
  correctB: number
  correctC?: number
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

  // ── Setup — host is still picking pools, no room-facing action yet ─────
  if (!s || s.phase === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0a2a] via-[#2a0a1f] to-[#0a0a1f] flex flex-col items-center justify-center gap-6 text-white px-6">
        <div className="text-8xl animate-pulse">🔔</div>
        <h1 className="text-5xl font-black">Tie Breaker</h1>
        <p className="text-slate-400 text-lg">Rapid fire · 30 seconds per team</p>
        <p className="text-slate-500 text-sm italic">Host is preparing the round…</p>
      </div>
    )
  }

  // ── Intro — dedicated full-screen instructions page ────────────────────
  if (s.phase === 'intro') {
    return (
      <div className={`min-h-screen w-full text-white flex items-center justify-center px-6 py-12 bg-gradient-to-br ${ROUND_INFO.tie_breaker.gradient}`}>
        <RoundInstructionsInline
          info={ROUND_INFO.tie_breaker}
          footerHint={`${s.teamA} vs ${s.teamB} · waiting for the host to start…`}
        />
      </div>
    )
  }

  // ── Announce Team A ────────────────────────────────────────────────────
  if (s.phase === 'announce_a') {
    const poolTitle = s.pools?.find(p => p.id === s.chosenPoolA)?.title
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-[#0a1628] to-green-950 flex flex-col items-center justify-center gap-8 text-white px-6 text-center">
        <p className="text-green-300 text-sm md:text-base font-black uppercase tracking-[0.4em]">Up Next</p>
        <div className="text-9xl">🎤</div>
        <h1 className="text-6xl md:text-8xl font-black text-green-300 leading-tight">{s.teamA}</h1>
        <p className="text-white text-2xl md:text-3xl font-bold">is up first</p>
        {poolTitle && (
          <p className="text-slate-300 text-lg md:text-xl">
            Playing <span className="font-black text-white">{poolTitle}</span> · 30 seconds
          </p>
        )}
        <p className="text-slate-500 text-sm italic animate-pulse">Waiting for the host to start the timer…</p>
      </div>
    )
  }

  // ── Score reveal — Team A ──────────────────────────────────────────────
  if (s.phase === 'score_a') {
    const poolTitle = s.pools?.find(p => p.id === s.chosenPoolA)?.title
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-[#0a1628] to-green-950 flex flex-col items-center justify-center gap-6 text-white px-6 text-center">
        <p className="text-green-300 text-sm md:text-base font-black uppercase tracking-[0.4em]">{s.teamA} — Score</p>
        <div className="bg-green-500/15 border-4 border-green-500/60 rounded-3xl px-16 py-10 shadow-[0_20px_60px_-10px_rgba(34,197,94,0.4)]">
          <p className="text-white text-[10rem] md:text-[12rem] font-black leading-none">{s.scoreA}</p>
          <p className="text-green-300 text-lg md:text-xl mt-2 font-bold">points</p>
        </div>
        <p className="text-slate-400 text-base md:text-lg">
          {s.correctA} correct in 30 seconds{poolTitle ? ` · ${poolTitle}` : ''}
        </p>
        <p className="text-yellow-300 font-bold text-xl md:text-2xl animate-pulse mt-4">⏳ {s.teamB} is up next…</p>
      </div>
    )
  }

  // ── Announce Team B ────────────────────────────────────────────────────
  if (s.phase === 'announce_b') {
    const poolTitle = s.pools?.find(p => p.id === s.chosenPoolB)?.title
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-[#0a1628] to-blue-950 flex flex-col items-center justify-center gap-8 text-white px-6 text-center">
        <p className="text-blue-300 text-sm md:text-base font-black uppercase tracking-[0.4em]">Up Next</p>
        <div className="text-9xl">🎤</div>
        <h1 className="text-6xl md:text-8xl font-black text-blue-300 leading-tight">{s.teamB}</h1>
        <p className="text-white text-2xl md:text-3xl font-bold">is up next</p>
        {poolTitle && (
          <p className="text-slate-300 text-lg md:text-xl">
            Playing <span className="font-black text-white">{poolTitle}</span> · 30 seconds
          </p>
        )}
        <p className="text-slate-500 text-sm italic animate-pulse">Waiting for the host to start the timer…</p>
      </div>
    )
  }

  // ── Score reveal — Team B ──────────────────────────────────────────────
  if (s.phase === 'score_b') {
    const poolTitle = s.pools?.find(p => p.id === s.chosenPoolB)?.title
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-[#0a1628] to-blue-950 flex flex-col items-center justify-center gap-6 text-white px-6 text-center">
        <p className="text-blue-300 text-sm md:text-base font-black uppercase tracking-[0.4em]">{s.teamB} — Score</p>
        <div className="bg-blue-500/15 border-4 border-blue-500/60 rounded-3xl px-16 py-10 shadow-[0_20px_60px_-10px_rgba(59,130,246,0.4)]">
          <p className="text-white text-[10rem] md:text-[12rem] font-black leading-none">{s.scoreB}</p>
          <p className="text-blue-300 text-lg md:text-xl mt-2 font-bold">points</p>
        </div>
        <p className="text-slate-400 text-base md:text-lg">
          {s.correctB} correct in 30 seconds{poolTitle ? ` · ${poolTitle}` : ''}
        </p>
        <p className="text-yellow-300 font-bold text-xl md:text-2xl animate-pulse mt-4">{s.threeTeam ? `⏳ ${s.teamC ?? 'Team C'} is up next…` : '📊 Comparing results…'}</p>
      </div>
    )
  }

  // ── Announce Team C (3-team mode) ─────────────────────────────────────
  if (s.phase === 'announce_c') {
    const poolTitle = s.pools?.find(p => p.id === s.chosenPoolC)?.title
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-[#0a1628] to-purple-950 flex flex-col items-center justify-center gap-8 text-white px-6 text-center">
        <p className="text-purple-300 text-sm md:text-base font-black uppercase tracking-[0.4em]">Up Next</p>
        <div className="text-9xl">🎤</div>
        <h1 className="text-6xl md:text-8xl font-black text-purple-300 leading-tight">{s.teamC}</h1>
        <p className="text-white text-2xl md:text-3xl font-bold">is up last</p>
        {poolTitle && (
          <p className="text-slate-300 text-lg md:text-xl">
            Playing <span className="font-black text-white">{poolTitle}</span> · 30 seconds
          </p>
        )}
        <p className="text-slate-500 text-sm italic animate-pulse">Waiting for the host to start the timer…</p>
      </div>
    )
  }

  // ── Score reveal — Team C (3-team mode) ────────────────────────────────
  if (s.phase === 'score_c') {
    const poolTitle = s.pools?.find(p => p.id === s.chosenPoolC)?.title
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-[#0a1628] to-purple-950 flex flex-col items-center justify-center gap-6 text-white px-6 text-center">
        <p className="text-purple-300 text-sm md:text-base font-black uppercase tracking-[0.4em]">{s.teamC} — Score</p>
        <div className="bg-purple-500/15 border-4 border-purple-500/60 rounded-3xl px-16 py-10 shadow-[0_20px_60px_-10px_rgba(168,85,247,0.4)]">
          <p className="text-white text-[10rem] md:text-[12rem] font-black leading-none">{s.scoreC ?? 0}</p>
          <p className="text-purple-300 text-lg md:text-xl mt-2 font-bold">points</p>
        </div>
        <p className="text-slate-400 text-base md:text-lg">
          {s.correctC ?? 0} correct in 30 seconds{poolTitle ? ` · ${poolTitle}` : ''}
        </p>
        <p className="text-yellow-300 font-bold text-xl md:text-2xl animate-pulse mt-4">📊 Comparing results…</p>
      </div>
    )
  }

  // ── Compare — final head-to-head with advance / out ────────────────────
  if (s.phase === 'compare') {
    const rows = [
      { key: 'A' as const, name: s.teamA, score: s.scoreA, colour: 'green' as const },
      { key: 'B' as const, name: s.teamB, score: s.scoreB, colour: 'blue' as const },
      ...(s.threeTeam ? [{ key: 'C' as const, name: s.teamC ?? 'Team C', score: s.scoreC ?? 0, colour: 'purple' as const }] : []),
    ]
    const top = Math.max(...rows.map(r => r.score))
    const bottom = Math.min(...rows.map(r => r.score))
    const stillTied = top === bottom
    const winners = rows.filter(r => r.score === top).map(r => r.name).join(', ')
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0f00] via-[#2a1500] to-[#1a0f00] text-white flex flex-col items-center justify-center gap-8 px-6 overflow-hidden relative py-12">
        <p className="text-yellow-400 text-sm md:text-base font-black uppercase tracking-[0.4em] z-10">Tie-Breaker Result</p>
        <div className="text-8xl md:text-9xl z-10">{stillTied ? '🤝' : '🏆'}</div>
        <div className={`grid ${s.threeTeam ? 'grid-cols-3' : 'grid-cols-2'} gap-4 md:gap-6 w-full max-w-5xl z-10`}>
          {rows.map(r => {
            const wins = !stillTied && r.score === top
            const out = !stillTied && r.score === bottom && bottom < top
            const border = wins
              ? r.colour === 'green' ? 'bg-green-500/25 border-green-400 shadow-[0_20px_60px_-15px_rgba(34,197,94,0.5)]'
                : r.colour === 'blue' ? 'bg-blue-500/25 border-blue-400 shadow-[0_20px_60px_-15px_rgba(59,130,246,0.5)]'
                : 'bg-purple-500/25 border-purple-400 shadow-[0_20px_60px_-15px_rgba(168,85,247,0.5)]'
              : out ? 'bg-red-950/40 border-red-500/50 opacity-70'
              : 'bg-white/5 border-white/10'
            const text = r.colour === 'green' ? 'text-green-300' : r.colour === 'blue' ? 'text-blue-300' : 'text-purple-300'
            return (
              <div key={r.key} className={`rounded-3xl p-6 md:p-8 text-center border-4 ${border}`}>
                {wins && <div className="text-4xl mb-2">🏆</div>}
                {out && <p className="text-red-400 text-xs md:text-sm font-black uppercase tracking-widest mb-2">Eliminated</p>}
                <p className={`${text} text-sm md:text-base font-black uppercase tracking-widest`}>{r.name}</p>
                <p className="text-white text-6xl md:text-7xl font-black mt-2">{r.score}</p>
                <p className={`text-sm mt-3 font-black uppercase tracking-widest ${wins ? 'text-yellow-300' : out ? 'text-red-300' : 'text-slate-500'}`}>
                  {wins ? (s.threeTeam ? 'Safe' : 'Advances') : out ? 'Out' : 'Tied'}
                </p>
              </div>
            )
          })}
        </div>
        {stillTied
          ? <p className="text-yellow-400 font-black text-2xl md:text-3xl z-10">It&apos;s still a tie!</p>
          : <p className="text-yellow-300 font-black text-2xl md:text-3xl z-10 text-center">{winners} {winners.includes(',') ? 'advance' : 'advances'}</p>}
      </div>
    )
  }

  // ── Live rapid fire (a/b/c playing) ────────────────────────────────────
  const isPlayingA = s.phase === 'a_playing'
  const isPlayingB = s.phase === 'b_playing'
  const isPlayingC = s.phase === 'c_playing'
  const teamColour = isPlayingA ? '#22c55e' : isPlayingB ? '#3b82f6' : '#a855f7'
  const playingName = isPlayingA ? s.teamA : isPlayingB ? s.teamB : (s.teamC ?? 'Team C')
  const activeQueue = isPlayingA ? s.queueA : isPlayingB ? s.queueB : (s.queueC ?? [])
  const currentQ = activeQueue[0] ?? s.currentQ
  const chosenPoolId = isPlayingA ? s.chosenPoolA : isPlayingB ? s.chosenPoolB : (s.chosenPoolC ?? null)
  const chosenPool = s.pools?.find(p => p.id === chosenPoolId) ?? null
  const timeLeft = s.timerStart ? Math.max(0, ROUND_MS - (now - s.timerStart)) : ROUND_MS
  const timePct = timeLeft / ROUND_MS
  const timeColour = timePct > 0.4 ? '#22c55e' : timePct > 0.2 ? '#f59e0b' : '#ef4444'
  const correctSoFar = isPlayingA ? s.correctA : isPlayingB ? s.correctB : (s.correctC ?? 0)

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex flex-col overflow-hidden">
      {/* Score bar */}
      <div className="bg-[#0d1117] px-6 py-3 flex items-center justify-between border-b border-gray-800 gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="font-bold text-sm text-green-400">{s.teamA}</span>
          <span className="text-xl font-black text-white ml-1">{s.scoreA}</span>
        </div>
        <div className="text-center flex-1">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Tie-Breaker · Rapid Fire</p>
          <p className="text-xs text-gray-400">{correctSoFar} correct so far</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xl font-black text-white mr-1">{s.scoreB}</span>
          <span className="font-bold text-sm text-blue-400">{s.teamB}</span>
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
        </div>
        {s.threeTeam && (
          <div className="flex items-center gap-2 shrink-0 pl-3 border-l border-white/10">
            <span className="text-xl font-black text-white mr-1">{s.scoreC ?? 0}</span>
            <span className="font-bold text-sm text-purple-400">{s.teamC}</span>
            <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
          </div>
        )}
      </div>

      {/* Playing team banner */}
      <div className="py-3 px-6 text-center" style={{ background: `${teamColour}18` }}>
        <p className="font-black text-sm tracking-widest uppercase" style={{ color: teamColour }}>
          {playingName} — 30-second Rapid Fire
        </p>
        {chosenPool && (
          <p className="text-xs mt-1" style={{ color: teamColour, opacity: 0.85 }}>
            Pool: {chosenPool.title}
          </p>
        )}
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
