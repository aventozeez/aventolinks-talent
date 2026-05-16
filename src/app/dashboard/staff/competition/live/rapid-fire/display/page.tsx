'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// Must stay in sync with the admin page constants
const RF_LIVE_KEY   = 'sc_rf_live_v2'
const TIMER_MS      = 60_000
const CIRC_R        = 58
const CIRCUMFERENCE = 2 * Math.PI * CIRC_R   // ≈ 364.4

type Phase = 'setup' | 'playing-a' | 'break' | 'playing-b' | 'done'

type RFDisplayState = {
  phase:           Phase
  teamAName:       string
  teamBName:       string
  scoreA:          number
  scoreB:          number
  timerStartedAt:  number | null
  timerDuration:   number
  currentQuestion: string
  currentSubject:  string
  correctCount:    number   // answered correctly this turn
  queueLength:     number   // questions still in play
}

const blank = (): RFDisplayState => ({
  phase:           'setup',
  teamAName:       'Team A',
  teamBName:       'Team B',
  scoreA:          0,
  scoreB:          0,
  timerStartedAt:  null,
  timerDuration:   TIMER_MS,
  currentQuestion: '',
  currentSubject:  '',
  correctCount:    0,
  queueLength:     10,
})

export default function RapidFireDisplay() {
  const [ds,        setDs]       = useState<RFDisplayState>(blank())
  const [remaining, setRemaining] = useState(60)
  const [qKey,      setQKey]     = useState(0)    // incremented on question change for CSS animation
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevQRef    = useRef('')
  const lastRawRef  = useRef<string | null>(null)  // avoids re-renders on unchanged data

  // ── Sync from localStorage (used by both event + poll) ──────────
  const syncFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(RF_LIVE_KEY)
      if (raw && raw !== lastRawRef.current) {
        lastRawRef.current = raw
        setDs(JSON.parse(raw))
      }
    } catch { /* ignore */ }
  }, [])

  // ── Subscribe: BroadcastChannel (instant) + storage event (cross-tab) + poll (fallback) ─
  useEffect(() => {
    syncFromStorage() // read on mount

    // 1. BroadcastChannel — fires instantly in same browser, no polling needed
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(RF_LIVE_KEY)
      bc.onmessage = (e: MessageEvent) => {
        try {
          const raw: string = typeof e.data === 'string' ? e.data : JSON.stringify(e.data)
          if (raw && raw !== lastRawRef.current) {
            lastRawRef.current = raw
            setDs(JSON.parse(raw))
          }
        } catch { /* ignore */ }
      }
    } catch { /* not supported */ }

    // 2. Storage event — fires in other tabs of same origin when admin writes
    const handler = (e: StorageEvent) => {
      if (e.key === RF_LIVE_KEY) syncFromStorage()
    }
    window.addEventListener('storage', handler)

    // 3. Polling fallback — catches any missed updates every 150ms
    pollIntervalRef.current = setInterval(syncFromStorage, 150)

    return () => {
      if (bc) bc.close()
      window.removeEventListener('storage', handler)
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [syncFromStorage])

  // ── Animate question card when the question text changes ─────────
  useEffect(() => {
    if (ds.currentQuestion && ds.currentQuestion !== prevQRef.current) {
      prevQRef.current = ds.currentQuestion
      setQKey(k => k + 1)
    }
  }, [ds.currentQuestion])

  // ── Independent countdown timer ──────────────────────────────────
  useEffect(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    if (!ds.timerStartedAt) { setRemaining(60); return }

    const tick = () => {
      const elapsed = Date.now() - ds.timerStartedAt!
      const rem = Math.max(0, Math.ceil((ds.timerDuration - elapsed) / 1000))
      setRemaining(rem)
    }
    tick()
    timerIntervalRef.current = setInterval(tick, 100)
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) }
  }, [ds.timerStartedAt, ds.timerDuration])

  // ── Derived ──────────────────────────────────────────────────────
  const {
    phase, teamAName, teamBName, scoreA, scoreB,
    currentQuestion, currentSubject, correctCount, queueLength,
  } = ds

  const isPlayingA  = phase === 'playing-a'
  const isPlayingB  = phase === 'playing-b'
  const isPlaying   = isPlayingA || isPlayingB

  const activeTeam  = isPlayingB ? teamBName : teamAName
  const activeScore = isPlayingB ? scoreB    : scoreA
  const teamColor   = isPlayingB ? '#60a5fa' : '#f5a623'

  const timerPct   = Math.min(1, remaining / 60)
  const timerColor = remaining > 20 ? '#22c55e' : remaining > 10 ? '#f5a623' : '#ef4444'
  const dashOffset = CIRCUMFERENCE * (1 - timerPct)

  const winner = scoreA > scoreB ? teamAName : scoreB > scoreA ? teamBName : null

  // ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-[#040c18] text-white flex flex-col overflow-hidden select-none"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {/* ── Ambient glow ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#f5a623]/7 blur-[140px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-900/20 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-900/15 blur-[100px] rounded-full" />
      </div>

      {/* ── Branding badge ── */}
      <div className="fixed top-5 left-5 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5a623]/10 border border-[#f5a623]/20">
        <span className="text-sm">⚡</span>
        <span className="text-[11px] font-bold text-[#f5a623] uppercase tracking-widest">Rapid Fire</span>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SETUP — waiting screen
      ══════════════════════════════════════════════════════════════ */}
      {phase === 'setup' && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-10 px-8 text-center">
          <div className="text-[9rem] leading-none" style={{ animation: 'float 3s ease-in-out infinite' }}>⚡</div>
          <div>
            <p className="text-[11px] font-bold text-[#f5a623] uppercase tracking-[0.3em] mb-4">
              ✦ Scholars Challenge ✦
            </p>
            <h1 className="text-6xl sm:text-7xl font-black text-white tracking-tight">RAPID FIRE</h1>
            <p className="text-slate-400 text-xl mt-4">Waiting for the round to begin…</p>
          </div>
          <div className="flex gap-4">
            {[0, 150, 300].map(d => (
              <div key={d} className="w-3 h-3 rounded-full bg-[#f5a623]"
                style={{ animation: `bounce 1s ease-in-out infinite`, animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          PLAYING — question + scoreboard + timer
      ══════════════════════════════════════════════════════════════ */}
      {isPlaying && (
        <div className="relative z-10 flex-1 flex flex-col px-6 sm:px-10 py-6 gap-5 max-w-5xl mx-auto w-full">

          {/* ── Top bar ── */}
          <div className="flex items-stretch gap-4">

            {/* Team name + score */}
            <div className="flex-1 bg-[#0d1f3c]/90 border border-white/10 rounded-2xl px-6 py-4">
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Now Answering</p>
              <p className="text-2xl sm:text-3xl font-black truncate" style={{ color: teamColor }}>
                {activeTeam}
              </p>
              <p className="text-6xl font-black text-white leading-none mt-2">
                {activeScore}
                <span className="text-xl font-normal text-slate-400 ml-2">pts</span>
              </p>
              {isPlayingB && (
                <p className="text-xs text-slate-600 mt-1.5">{teamAName} scored {scoreA} pts</p>
              )}
            </div>

            {/* Circular countdown */}
            <div className="relative w-36 h-36 shrink-0">
              <svg className="absolute inset-0 -rotate-90" width="144" height="144" viewBox="0 0 144 144">
                {/* track */}
                <circle cx="72" cy="72" r={CIRC_R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
                {/* progress */}
                <circle cx="72" cy="72" r={CIRC_R} fill="none"
                  stroke={timerColor} strokeWidth="10"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.4s ease' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black tabular-nums leading-none"
                  style={{ color: timerColor }}>{remaining}</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">secs</span>
              </div>
            </div>
          </div>

          {/* ── Correct count + queue status ── */}
          <div className="flex items-center justify-between text-sm px-1">
            <span className="font-bold text-green-400">✓ {correctCount} correct</span>
            <span className="text-slate-500">{queueLength} in queue</span>
          </div>

          {/* ── Timer progress bar ── */}
          <div className="h-1 bg-white/8 rounded-full overflow-hidden -mt-2">
            <div className="h-full rounded-full"
              style={{
                width: `${timerPct * 100}%`,
                backgroundColor: timerColor,
                transition: 'width 0.2s linear, background-color 0.4s ease',
              }} />
          </div>

          {/* ── Question card (no answer key) ── */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {currentSubject && (
              <p key={`subj-${qKey}`} className="text-sm font-bold uppercase tracking-[0.25em] mb-5"
                style={{ color: teamColor, animation: 'fadeUp 0.3s ease' }}>
                {currentSubject}
              </p>
            )}
            <div key={qKey} className="w-full rounded-3xl border-2 p-8 sm:p-14 text-center"
              style={{
                borderColor: `${teamColor}25`,
                background: 'linear-gradient(135deg, rgba(13,31,60,0.95) 0%, rgba(6,15,30,0.98) 100%)',
                boxShadow: `0 0 80px ${teamColor}0d`,
                animation: 'fadeUp 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
              }}>
              <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-snug">
                {currentQuestion || '…'}
              </p>
            </div>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          BREAK — Team A done, Team B about to start
      ══════════════════════════════════════════════════════════════ */}
      {phase === 'break' && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 px-8 text-center">
          <div className="text-7xl">⏱️</div>

          <div>
            <p className="text-slate-400 text-xl font-semibold">Time&apos;s Up!</p>
            <h2 className="text-5xl sm:text-6xl font-black text-[#f5a623] mt-2">{teamAName}</h2>
          </div>

          {/* Team A's score */}
          <div className="bg-[#0d1f3c] border border-[#f5a623]/30 rounded-3xl px-20 py-10"
            style={{ boxShadow: '0 0 60px rgba(245,166,35,0.1)' }}>
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">Points Scored</p>
            <p className="text-9xl font-black text-white leading-none">{scoreA}</p>
          </div>

          {/* Team B up next */}
          <div className="flex items-center gap-4 px-10 py-5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <span className="text-3xl">⚡</span>
            <div className="text-left">
              <p className="text-slate-400 text-xs uppercase tracking-wider">Next Up</p>
              <p className="text-3xl font-black text-blue-400">{teamBName}</p>
              <p className="text-slate-500 text-sm mt-0.5">10 questions · 60 seconds</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          DONE — Final scoreboard
      ══════════════════════════════════════════════════════════════ */}
      {phase === 'done' && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-10 px-8">
          <div className="text-center">
            <p className="text-[11px] font-bold text-[#f5a623] uppercase tracking-[0.3em] mb-3">✦ Final Score ✦</p>
            <h1 className="text-5xl sm:text-6xl font-black text-white">RAPID FIRE COMPLETE</h1>
          </div>

          <div className="w-full max-w-xl">
            {/* Scores */}
            <div className="grid grid-cols-3 gap-5 items-center">
              {/* Team A */}
              <div className={`rounded-3xl p-8 text-center transition-all ${
                scoreA > scoreB
                  ? 'bg-[#f5a623]/15 border-2 border-[#f5a623] shadow-2xl shadow-[#f5a623]/20'
                  : 'bg-[#0d1f3c] border border-white/10'
              }`}>
                <p className="text-xs text-slate-400 truncate mb-3">{teamAName}</p>
                <p className="text-7xl font-black text-white leading-none">{scoreA}</p>
                <p className="text-xs text-slate-500 mt-2">pts</p>
                {scoreA > scoreB && <p className="text-xs text-[#f5a623] font-bold mt-3">🏆 WINNER</p>}
              </div>

              <div className="text-center">
                <p className="text-slate-600 font-black text-2xl">VS</p>
              </div>

              {/* Team B */}
              <div className={`rounded-3xl p-8 text-center transition-all ${
                scoreB > scoreA
                  ? 'bg-[#f5a623]/15 border-2 border-[#f5a623] shadow-2xl shadow-[#f5a623]/20'
                  : 'bg-[#0d1f3c] border border-white/10'
              }`}>
                <p className="text-xs text-slate-400 truncate mb-3">{teamBName}</p>
                <p className="text-7xl font-black text-white leading-none">{scoreB}</p>
                <p className="text-xs text-slate-500 mt-2">pts</p>
                {scoreB > scoreA && <p className="text-xs text-[#f5a623] font-bold mt-3">🏆 WINNER</p>}
              </div>
            </div>

            {/* Result line */}
            <div className="mt-8 text-center">
              <p className="text-3xl font-black text-[#f5a623]">
                {winner === null ? "🤝 It's a Tie!" : `🏆 ${winner} Wins the Round!`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="relative z-10 text-center py-3 shrink-0">
        <p className="text-[10px] text-slate-700 uppercase tracking-widest font-bold">
          AventoLinks Scholars Challenge · Rapid Fire Round
        </p>
      </div>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0);     }
          50%       { transform: translateY(-20px); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0);    opacity: 1;   }
          50%       { transform: translateY(-10px); opacity: 0.5; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </div>
  )
}
