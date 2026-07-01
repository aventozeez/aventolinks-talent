'use client'

import { useEffect, useState, useRef } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'

const CHANNEL = 'mc:state'
const MC_TIME_MS = 180_000 // 3 minutes

type MCPhase = 'setup' | 'story' | 'a_playing' | 'b_playing' | 'c_playing' | 'done'

type MCAudienceState = {
  phase: MCPhase
  teamA: string; teamB: string; teamC: string
  packTitle: string; openingStory: string
  scoreA: number; scoreB: number; scoreC: number
  activeRevealedStory: string[]
  revealedA: string[]; revealedB: string[]; revealedC: string[]
  timerStart: number | null
  revealed: boolean
  currentPuzzle: { clue: string; scrambled: string; answer?: string } | null
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const PHASE_TEAM: Record<MCPhase, string | null> = {
  setup: null, story: null, done: null,
  a_playing: 'A', b_playing: 'B', c_playing: 'C',
}

export default function MCAudiencePage() {
  const [s, setS] = useState<MCAudienceState | null>(null)
  const [timeLeft, setTimeLeft] = useState(MC_TIME_MS)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (data: MCAudienceState) => setS(data))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!s?.timerStart) { setTimeLeft(MC_TIME_MS); return }
    const tick = () => setTimeLeft(Math.max(0, MC_TIME_MS - (Date.now() - (s.timerStart ?? 0))))
    tick()
    timerRef.current = setInterval(tick, 250)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s?.timerStart])

  const activeTeam = s ? PHASE_TEAM[s.phase] : null
  const pct = timeLeft / MC_TIME_MS
  const timerColor = pct > 0.4 ? '#22c55e' : pct > 0.2 ? '#f59e0b' : '#ef4444'

  if (!s || s.phase === 'setup') return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="text-6xl">🔮</div>
        <p className="text-white text-3xl font-black">Mystery Chain</p>
        <p className="text-slate-500 text-lg">Waiting for the round to begin…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 flex flex-col gap-4">

      {/* Header */}
      <div className="text-center">
        <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Mystery Chain</p>
        <h1 className="text-white text-2xl font-black">{s.packTitle || 'Mystery Round'}</h1>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { name: s.teamA, score: s.scoreA, key: 'A' },
          { name: s.teamB, score: s.scoreB, key: 'B' },
          { name: s.teamC, score: s.scoreC, key: 'C' },
        ].map(t => (
          <div key={t.key} className={`rounded-xl p-4 text-center border transition-all ${
            activeTeam === t.key
              ? 'bg-purple-600/30 border-purple-400 shadow-lg shadow-purple-500/20'
              : 'bg-white/5 border-white/10'
          }`}>
            {activeTeam === t.key && (
              <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest mb-1">Now Playing</p>
            )}
            <p className="text-slate-300 text-sm font-semibold truncate">{t.name}</p>
            <p className="text-white text-3xl font-black">{t.score}</p>
            <p className="text-slate-500 text-[10px]">pts</p>
          </div>
        ))}
      </div>

      {/* Opening Story */}
      {s.phase === 'story' && (
        <div className="flex-1 bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
          <p className="text-purple-300 text-xs font-bold uppercase tracking-widest mb-4">Opening Scenario</p>
          <p className="text-white text-lg leading-relaxed max-w-2xl">{s.openingStory}</p>
        </div>
      )}

      {/* Playing Phase */}
      {(s.phase === 'a_playing' || s.phase === 'b_playing' || s.phase === 'c_playing') && (
        <div className="flex-1 flex flex-col gap-4">

          {/* Timer */}
          <div className="bg-white/5 rounded-2xl p-4">
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct * 100}%`, background: timerColor }} />
            </div>
            <p className="text-center font-black text-5xl mt-2" style={{ color: timerColor }}>{fmtTime(timeLeft)}</p>
          </div>

          {/* Current Puzzle */}
          {s.currentPuzzle ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4">
              <p className="text-slate-400 text-sm">
                Clue: <span className="text-white font-semibold">{s.currentPuzzle.clue}</span>
              </p>
              <p className="text-[#f5a623] text-5xl font-black tracking-[0.3em]">{s.currentPuzzle.scrambled}</p>
              {s.revealed && s.currentPuzzle.answer && (
                <div className="bg-green-500/20 border border-green-500/40 rounded-xl px-6 py-3">
                  <p className="text-green-300 text-xs font-bold uppercase tracking-widest mb-1">Answer</p>
                  <p className="text-white text-2xl font-black">{s.currentPuzzle.answer}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-slate-500">No more puzzles in queue</p>
            </div>
          )}

          {/* Story Revealed So Far */}
          {s.activeRevealedStory && s.activeRevealedStory.length > 0 && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-4">
              <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-3 text-center">
                Story Unfolding…
              </p>
              <div className="space-y-2">
                {s.activeRevealedStory.map((snippet, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-blue-500 font-bold text-sm shrink-0 mt-0.5">{i + 1}.</span>
                    <p className="text-blue-100 text-sm leading-relaxed">{snippet}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Done Phase */}
      {s.phase === 'done' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Mystery Solved — Final Results</p>

          <div className="w-full max-w-sm space-y-3">
            {[
              { name: s.teamA, score: s.scoreA, rev: s.revealedA },
              { name: s.teamB, score: s.scoreB, rev: s.revealedB },
              { name: s.teamC, score: s.scoreC, rev: s.revealedC },
            ].sort((a, b) => b.score - a.score).map((t, i) => (
              <div key={t.name} className={`flex items-center justify-between rounded-xl px-5 py-4 ${
                i === 0 ? 'bg-yellow-500/20 border border-yellow-500/40' :
                i === 1 ? 'bg-slate-500/20 border border-slate-500/30' :
                'bg-orange-900/20 border border-orange-900/30'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{['🥇','🥈','🥉'][i]}</span>
                  <div>
                    <p className="text-white font-bold">{t.name}</p>
                    <p className="text-slate-400 text-xs">{t.rev.length} clues unlocked</p>
                  </div>
                </div>
                <span className="text-white text-2xl font-black">{t.score}</span>
              </div>
            ))}
          </div>

          {/* Full story chain */}
          {s.revealedA.length > 0 || s.revealedB.length > 0 || s.revealedC.length > 0 ? (
            <div className="w-full max-w-2xl bg-blue-900/10 border border-blue-800/30 rounded-2xl p-5">
              <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-3 text-center">The Full Story</p>
              <div className="space-y-1">
                {/* Show the most complete story (team that unlocked most) */}
                {[s.revealedA, s.revealedB, s.revealedC]
                  .sort((a,b) => b.length - a.length)[0]
                  .map((snippet, i) => (
                    <p key={i} className="text-blue-100 text-sm leading-relaxed">
                      <span className="text-blue-400 font-bold mr-1">{i + 1}.</span>{snippet}
                    </p>
                  ))
                }
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
